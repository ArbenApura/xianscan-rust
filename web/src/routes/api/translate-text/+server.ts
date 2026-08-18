import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { books, chapters, pages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { translateSingleText } from '$lib/server/translate';
import type { LangPair } from '$lib/types';

const schema = z.object({
	text: z.string().min(1).max(2000),
	kind: z.enum(['title', 'chapter', 'term', 'general']).optional().default('general'),
	bookId: z.union([z.number(), z.string()]).optional(),
	chapterId: z.union([z.number(), z.string()]).optional(),
	pageId: z.union([z.number(), z.string()]).optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	model: z.string().optional(),
	instruction: z.string().optional(),
	fresh: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: 'Invalid input: text is required' }, { status: 400 });
		}

		const { text, kind, bookId, chapterId, pageId, model, instruction } = parsed.data;
		let sourceLang = parsed.data.sourceLang;
		let targetLang = parsed.data.targetLang;

		// Resolve language pair from page if provided
		if ((!sourceLang || !targetLang) && pageId) {
			const pageIdNum = Number(pageId);
			if (!Number.isNaN(pageIdNum)) {
				const [pg] = db
					.select({ chapterId: pages.chapterId })
					.from(pages)
					.where(eq(pages.id, pageIdNum))
					.all();
				if (pg && pg.chapterId) {
					const [chap] = db
						.select({ bookId: chapters.bookId })
						.from(chapters)
						.where(eq(chapters.id, pg.chapterId))
						.all();
					if (chap && chap.bookId) {
						const [book] = db
							.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
							.from(books)
							.where(eq(books.id, chap.bookId))
							.all();
						if (book) {
							sourceLang = sourceLang || book.sourceLang;
							targetLang = targetLang || book.targetLang;
						}
					}
				}
			}
		}

		// Resolve language pair from chapter or book if not directly provided
		if ((!sourceLang || !targetLang) && chapterId) {
			const chapIdNum = Number(chapterId);
			if (!Number.isNaN(chapIdNum)) {
				const [chap] = db
					.select({ bookId: chapters.bookId })
					.from(chapters)
					.where(eq(chapters.id, chapIdNum))
					.all();
				if (chap && chap.bookId) {
					const [book] = db
						.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
						.from(books)
						.where(eq(books.id, chap.bookId))
						.all();
					if (book) {
						sourceLang = sourceLang || book.sourceLang;
						targetLang = targetLang || book.targetLang;
					}
				}
			}
		}

		if ((!sourceLang || !targetLang) && bookId) {
			const bookIdStr = String(bookId);
			const [book] = db
				.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
				.from(books)
				.where(eq(books.id, bookIdStr))
				.all();
			if (book) {
				sourceLang = sourceLang || book.sourceLang;
				targetLang = targetLang || book.targetLang;
			}
		}

		const pair: LangPair = {
			sourceLang: sourceLang || 'zh',
			targetLang: targetLang || 'en',
		};

		const result = await translateSingleText(text, pair, {
			kind,
			model,
			instruction,
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
