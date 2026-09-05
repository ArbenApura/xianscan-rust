import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { books, chapters, pages, regions } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { translateSingleText } from '$lib/server/translate';
import {
	getDbDialogueContext,
	parseKindFromBox,
	type DialogueContextWindow,
} from '$lib/server/translate/dialogue-tracker';
import { matchTerms } from '$lib/server/glossary-match';
import { translateTextSchema } from '$lib/schemas';
import type { LangPair, TermDraft } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = translateTextSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: 'Invalid input: text is required' }, { status: 400 });
		}

		const { text, kind, bookId, chapterId, pageId, regionId, model, instruction } = parsed.data;
		let sourceLang = parsed.data.sourceLang;
		let targetLang = parsed.data.targetLang;

		let resolvedPage: { id: number; seq: number; chapterId: number } | undefined;
		let resolvedChapter: { id: number; seq: number; bookId: string } | undefined;
		let resolvedBook:
			| {
					id: string;
					sourceLang: string;
					targetLang: string;
					customPrompt?: string | null;
			  }
			| undefined;

		// RESOLVE PAGE, CHAPTER, AND BOOK ENTITIES WHEN pageId IS PROVIDED
		if (pageId) {
			const pageIdNum = Number(pageId);
			if (!Number.isNaN(pageIdNum)) {
				const [pg] = db
					.select({ id: pages.id, seq: pages.seq, chapterId: pages.chapterId })
					.from(pages)
					.where(eq(pages.id, pageIdNum))
					.all();
				if (pg) {
					resolvedPage = pg;
					if (pg.chapterId) {
						const [chap] = db
							.select({ id: chapters.id, seq: chapters.seq, bookId: chapters.bookId })
							.from(chapters)
							.where(eq(chapters.id, pg.chapterId))
							.all();
						if (chap) {
							resolvedChapter = chap;
							if (chap.bookId) {
								const [book] = db
									.select({
										id: books.id,
										sourceLang: books.sourceLang,
										targetLang: books.targetLang,
										customPrompt: books.customPrompt,
									})
									.from(books)
									.where(eq(books.id, chap.bookId))
									.all();
								if (book) {
									resolvedBook = book;
									sourceLang = sourceLang || book.sourceLang;
									targetLang = targetLang || book.targetLang;
								}
							}
						}
					}
				}
			}
		}

		// RESOLVE CHAPTER AND BOOK IF ONLY chapterId WAS PROVIDED DIRECTLY
		if (!resolvedChapter && chapterId) {
			const chapIdNum = Number(chapterId);
			if (!Number.isNaN(chapIdNum)) {
				const [chap] = db
					.select({ id: chapters.id, seq: chapters.seq, bookId: chapters.bookId })
					.from(chapters)
					.where(eq(chapters.id, chapIdNum))
					.all();
				if (chap) {
					resolvedChapter = chap;
					if (chap.bookId && !resolvedBook) {
						const [book] = db
							.select({
								id: books.id,
								sourceLang: books.sourceLang,
								targetLang: books.targetLang,
								customPrompt: books.customPrompt,
							})
							.from(books)
							.where(eq(books.id, chap.bookId))
							.all();
						if (book) {
							resolvedBook = book;
							sourceLang = sourceLang || book.sourceLang;
							targetLang = targetLang || book.targetLang;
						}
					}
				}
			}
		}

		// RESOLVE BOOK IF ONLY bookId WAS PROVIDED DIRECTLY
		if (!resolvedBook && bookId) {
			const bookIdStr = String(bookId);
			const [book] = db
				.select({
					id: books.id,
					sourceLang: books.sourceLang,
					targetLang: books.targetLang,
					customPrompt: books.customPrompt,
				})
				.from(books)
				.where(eq(books.id, bookIdStr))
				.all();
			if (book) {
				resolvedBook = book;
				sourceLang = sourceLang || book.sourceLang;
				targetLang = targetLang || book.targetLang;
			}
		}

		const pair: LangPair = {
			sourceLang: sourceLang || 'zh',
			targetLang: targetLang || 'en',
		};

		let dialogueContext: DialogueContextWindow | undefined;
		let currentPageContext:
			| {
					before?: Array<{ textSource: string; textTarget?: string | null; kind?: string }>;
					after?: Array<{ textSource: string; textTarget?: string | null; kind?: string }>;
			  }
			| undefined;
		let matchedTerms: TermDraft[] | undefined;

		// RETRIEVE SLIDING DIALOGUE CONTEXT AND SIBLING BUBBLE FLOW WHEN PAGE AND CHAPTER EXIST
		if (resolvedChapter && resolvedPage) {
			dialogueContext = getDbDialogueContext(resolvedChapter.id, resolvedPage.seq);

			const pageRegions = db
				.select({
					id: regions.id,
					seq: regions.seq,
					box: regions.box,
					textSource: regions.textSource,
					textTarget: regions.textTarget,
				})
				.from(regions)
				.where(eq(regions.pageId, resolvedPage.id))
				.orderBy(asc(regions.seq))
				.all();

			if (pageRegions.length > 0) {
				const regionIdNum = regionId !== undefined ? Number(regionId) : undefined;
				const targetIdx =
					regionIdNum !== undefined
						? pageRegions.findIndex((r) => r.id === regionIdNum)
						: -1;

				if (targetIdx !== -1) {
					currentPageContext = {
						before: pageRegions.slice(0, targetIdx).map((r) => ({
							textSource: r.textSource,
							textTarget: r.textTarget,
							kind: parseKindFromBox(r.box),
						})),
						after: pageRegions.slice(targetIdx + 1).map((r) => ({
							textSource: r.textSource,
							textTarget: r.textTarget,
							kind: parseKindFromBox(r.box),
						})),
					};
				} else {
					currentPageContext = {
						before: pageRegions.map((r) => ({
							textSource: r.textSource,
							textTarget: r.textTarget,
							kind: parseKindFromBox(r.box),
						})),
					};
				}
			}
		}

		// MATCH RELEVANT GLOSSARY OVERRIDES FOR ACTIVE BOOK
		if (resolvedBook) {
			const scanningParts: string[] = [text];
			if (currentPageContext?.before) {
				for (const r of currentPageContext.before) {
					if (r.textSource) scanningParts.push(r.textSource);
				}
			}
			if (currentPageContext?.after) {
				for (const r of currentPageContext.after) {
					if (r.textSource) scanningParts.push(r.textSource);
				}
			}
			if (dialogueContext?.previousPages) {
				for (const p of dialogueContext.previousPages) {
					for (const l of p.lines) {
						if (l.sourceText) scanningParts.push(l.sourceText);
					}
				}
			}
			matchedTerms = await matchTerms(resolvedBook.id, scanningParts.join('\n'));
		}

		const result = await translateSingleText(text, pair, {
			kind,
			model,
			instruction,
			dialogueContext,
			currentPageContext,
			terms: matchedTerms,
			customPrompt: resolvedBook?.customPrompt || undefined,
		});

		return json({
			text: result.text,
			usage: result.usage,
		});
	} catch (err: any) {
		return json(
			{ message: err?.message || 'Translation failed' },
			{ status: 500 }
		);
	}
};
