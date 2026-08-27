// CHAPTER READER SSR AND REGION RETYPESETTING HELPERS
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { books, chapters, pages, regions } from '../db/schema';
import { DATA_ROOT } from '../paths';
import { getCanonicalSettings } from '../settings-service';
import { getImageDimensionsFromBuffer } from './dimensions';
import { assertChapterExists, compactChapterPageSeqs } from './mutations';

export interface ChapterRegionData {
	id: number;
	seq: number;
	box: unknown;
	textSource: string;
	textTarget: string | null;
	conf: number | null;
}

export interface ChapterPageData {
	id: number;
	seq: number;
	filePath: string;
	cleanedPath: string | null;
	outputPath: string | null;
	cleanedRev: number;
	outputRev: number;
	originalRev: number;
	status: 'pending' | 'processing' | 'done' | 'error';
	error: string | null;
	llmPrompt?: string | null;
	llmResponse?: string | null;
	ocrStats?: string | null;
	width?: number | null;
	height?: number | null;
	regions: ChapterRegionData[];
}

export interface ChapterNavSummary {
	id: number;
	seq: number;
	title: string | null;
	titleTarget?: string | null;
}

export interface ChapterReaderResult {
	chapter: {
		id: number;
		bookId: string;
		bookTitle?: string;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
		status?: 'pending' | 'processing' | 'done' | 'error';
		translatedAt?: number | null;
	};
	allChapters: ChapterNavSummary[];
	prevChapter: ChapterNavSummary | null;
	nextChapter: ChapterNavSummary | null;
	pages: ChapterPageData[];
}

function safeJson(raw: string | null | undefined): unknown {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function getChapterReaderData(chapterId: number): Promise<ChapterReaderResult> {
	await assertChapterExists(chapterId);

	try {
		compactChapterPageSeqs(chapterId);
	} catch {
		// Non-blocking
	}

	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(pages.seq)
		.all();

	// DIMENSION BACKFILL: DEFERRED AFTER RESPONSE — READS IMAGE FILES FROM DISK ONLY
	// FOR PAGES WITH NULL width/height. RUNS IN BACKGROUND SO THE RESPONSE IS NOT BLOCKED.
	// ON NEXT LOAD THE CACHED DIMS WILL BE IN THE DB.
	setImmediate(async () => {
		const missingDims: { id: number; width: number; height: number }[] = [];
		for (const p of pageRows) {
			if ((p.width === null || p.height === null) && p.filePath) {
				const absPath = join(DATA_ROOT, p.filePath);
				try {
					const buf = readFileSync(absPath);
					const dims = getImageDimensionsFromBuffer(buf);
					let w = dims.width;
					let h = dims.height;
					if (!w || !h) {
						const { loadImage } = await import('@napi-rs/canvas');
						const img = await loadImage(buf);
						w = img.width || null;
						h = img.height || null;
					}
					if (w && h) {
						missingDims.push({ id: p.id, width: w, height: h });
					}
				} catch {
					// Ignore if file is missing or unreadable
				}
			}
		}
		if (missingDims.length > 0) {
			try {
				db.transaction((tx) => {
					for (const item of missingDims) {
						tx.update(pages)
							.set({ width: item.width, height: item.height })
							.where(eq(pages.id, item.id))
							.run();
					}
				});
			} catch {
				// Non-blocking
			}
		}
	});

	const chapterRow = db
		.select()
		.from(chapters)
		.where(eq(chapters.id, chapterId))
		.get();

	if (!chapterRow) throw error(404, 'Chapter not found.');

	const bookRow = db.select().from(books).where(eq(books.id, chapterRow.bookId)).get();

	const allChaptersInBook = db
		.select({
			id: chapters.id,
			seq: chapters.seq,
			title: chapters.title,
			titleTarget: chapters.titleTarget,
		})
		.from(chapters)
		.where(eq(chapters.bookId, chapterRow.bookId))
		.orderBy(chapters.seq)
		.all();

	const currentIndex = allChaptersInBook.findIndex((c) => c.id === chapterId);
	const prevChapter = currentIndex > 0 ? allChaptersInBook[currentIndex - 1] : null;
	const nextChapter =
		currentIndex >= 0 && currentIndex < allChaptersInBook.length - 1
			? allChaptersInBook[currentIndex + 1]
			: null;

	return {
		chapter: {
			id: chapterRow.id,
			bookId: chapterRow.bookId,
			bookTitle: bookRow?.titleTarget || bookRow?.title || 'Book Translation',
			seq: chapterRow.seq,
			title: chapterRow.title,
			titleTarget: chapterRow.titleTarget,
			sourceLang: bookRow?.sourceLang || 'zh-CN',
			targetLang: bookRow?.targetLang || 'en',
			status: chapterRow.status as 'pending' | 'processing' | 'done' | 'error',
			translatedAt: chapterRow.translatedAt,
		},
		allChapters: allChaptersInBook,
		prevChapter,
		nextChapter,
		// REGIONS ARE NOT INCLUDED IN THE INITIAL PAYLOAD. THE INSPECT MODAL FETCHES
		// THEM ON-DEMAND VIA GET /api/pages/:id WHEN OPENED, ENSURING THEY ARE ALWAYS
		// FRESH WITHOUT LOADING ALL REGION DATA FOR ALL PAGES UPFRONT.
		pages: pageRows.map((p) => ({
			id: p.id,
			seq: p.seq,
			filePath: p.filePath,
			cleanedPath: p.cleanedPath,
			outputPath: p.outputPath,
			cleanedRev: p.cleanedRev,
			outputRev: p.outputRev,
			originalRev: p.originalRev,
			status: p.status,
			error: p.error,
			llmPrompt: (p as any).llmPrompt ?? null,
			llmResponse: (p as any).llmResponse ?? null,
			ocrStats: (p as any).ocrStats ?? null,
			width: p.width,
			height: p.height,
			regions: [],
		})),
	};
}

export async function updateRegionTranslation(
	pageId: number,
	regionId: number,
	textTarget: string,
	dataRoot: string = DATA_ROOT,
): Promise<{ textTarget: string; outputPath: string | null; outputRev: number }> {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) throw error(404, 'Page not found.');

	const regionRow = db.select().from(regions).where(and(eq(regions.id, regionId), eq(regions.pageId, pageId))).get();
	if (!regionRow) throw error(404, 'Region not found.');

	db.update(regions)
		.set({ textTarget: textTarget.trim() || null, status: textTarget.trim() ? 'translated' : 'failed' })
		.where(eq(regions.id, regionId))
		.run();

	if (pageRow.cleanedPath) {
		const cleanAbs = join(dataRoot, pageRow.cleanedPath);
		try {
			const cleanedBuf = readFileSync(cleanAbs);
			const allRegions = db
				.select()
				.from(regions)
				.where(eq(regions.pageId, pageId))
				.orderBy(asc(regions.seq))
				.all();

			const typesetRegions = allRegions
				.filter((r) => Boolean(r.textTarget?.trim()))
				.map((r) => {
					const boxObj = safeJson(r.box) as any;
					const typesetBoxObj = r.typesetBox ? safeJson(r.typesetBox) : (boxObj?.typeset_box ?? boxObj);
					return {
						id: String(r.id),
						box: typesetBoxObj ?? boxObj,
						text: r.textTarget!,
						vertical: (r as any).vertical ?? boxObj?.vertical,
						angle: (r as any).angle ?? boxObj?.angle,
					};
				});

			const canonical = getCanonicalSettings();
			const defaultTypesetOpts = {
				fontDialogue: canonical.typesetFont || 'CC Wild Words',
				fontCjk: canonical.typesetCjkFont || 'WenQuanYi Micro Hei',
				boxInset: canonical.typesetPadding ?? 0.05,
				outlineMode: canonical.typesetOutline || 'standard',
				colorMode: canonical.typesetContrast || 'auto',
				casing: canonical.typesetCasing || 'uppercase',
				enableRotation: canonical.enableTextRotation ?? true,
			};

			const { typesetPage } = await import('../typeset');
			const out = await typesetPage(cleanedBuf, typesetRegions, defaultTypesetOpts);
			const outputPath = `output/${pageRow.chapterId}/${pageRow.seq}.webp`;
			mkdirSync(join(dataRoot, 'output', String(pageRow.chapterId)), { recursive: true });
			writeFileSync(join(dataRoot, outputPath), out);

			db.update(pages)
				.set({ outputPath, outputRev: sql`${pages.outputRev} + 1`, status: 'done' })
				.where(eq(pages.id, pageId))
				.run();
			const fresh = db
				.select({ outputRev: pages.outputRev })
				.from(pages)
				.where(eq(pages.id, pageId))
				.get();
			return { textTarget: textTarget.trim(), outputPath, outputRev: fresh?.outputRev ?? pageRow.outputRev + 1 };
		} catch (err) {
			console.error('Failed to re-typeset page on manual translation update:', err);
		}
	}

	return { textTarget: textTarget.trim(), outputPath: pageRow.outputPath, outputRev: pageRow.outputRev };
}

export async function retypesetPage(
	pageId: number,
	_opts?: any,
	dataRoot: string = DATA_ROOT,
): Promise<{ outputPath: string | null; outputRev: number }> {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) throw error(404, 'Page not found.');
	if (!pageRow.cleanedPath) return { outputPath: pageRow.outputPath, outputRev: pageRow.outputRev };

	const cleanAbs = join(dataRoot, pageRow.cleanedPath);
	try {
		const cleanedBuf = readFileSync(cleanAbs);
		const allRegions = db
			.select()
			.from(regions)
			.where(eq(regions.pageId, pageId))
			.orderBy(asc(regions.seq))
			.all();

		const typesetRegions = allRegions
			.filter((r) => Boolean(r.textTarget?.trim()))
			.map((r) => {
				const boxObj = safeJson(r.box) as any;
				const typesetBoxObj = r.typesetBox ? safeJson(r.typesetBox) : (boxObj?.typeset_box ?? boxObj);
				return {
					id: String(r.id),
					box: typesetBoxObj ?? boxObj,
					text: r.textTarget!,
					vertical: (r as any).vertical ?? boxObj?.vertical,
					angle: (r as any).angle ?? boxObj?.angle,
				};
			});

		const canonical = getCanonicalSettings();
		const mergedOpts = {
			fontDialogue: _opts?.fontDialogue || _opts?.fontFamily || (canonical.typesetFont || 'CC Wild Words'),
			fontCjk: _opts?.fontCjk || (canonical.typesetCjkFont || 'WenQuanYi Micro Hei'),
			boxInset: typeof _opts?.boxInset === 'number' ? _opts.boxInset : (canonical.typesetPadding ?? 0.05),
			outlineMode: _opts?.outlineMode || _opts?.outline || (canonical.typesetOutline || 'standard'),
			colorMode: _opts?.colorMode || (canonical.typesetContrast || 'auto'),
			casing: _opts?.casing || (canonical.typesetCasing || 'uppercase'),
			enableRotation: typeof _opts?.enableRotation === 'boolean' ? _opts.enableRotation : (canonical.enableTextRotation ?? true),
			...(_opts || {}),
		};

		const { typesetPage } = await import('../typeset');
		const out = await typesetPage(cleanedBuf, typesetRegions, mergedOpts);
		const outputPath = `output/${pageRow.chapterId}/${pageRow.seq}.webp`;
		mkdirSync(join(dataRoot, 'output', String(pageRow.chapterId)), { recursive: true });
		writeFileSync(join(dataRoot, outputPath), out);

		db.update(pages)
			.set({ outputPath, outputRev: sql`${pages.outputRev} + 1`, status: 'done' })
			.where(eq(pages.id, pageId))
			.run();
		const fresh = db
			.select({ outputRev: pages.outputRev })
			.from(pages)
			.where(eq(pages.id, pageId))
			.get();
		return { outputPath, outputRev: fresh?.outputRev ?? pageRow.outputRev + 1 };
	} catch (err) {
		console.error('Failed to retypeset page:', err);
		return { outputPath: pageRow.outputPath, outputRev: pageRow.outputRev };
	}
}

export function getPageWithRegions(pageId: number) {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) return null;

	const allRegions = db
		.select()
		.from(regions)
		.where(eq(regions.pageId, pageId))
		.orderBy(asc(regions.seq))
		.all();

	return {
		id: pageRow.id,
		chapterId: pageRow.chapterId,
		seq: pageRow.seq,
		filePath: pageRow.filePath,
		cleanedPath: pageRow.cleanedPath,
		outputPath: pageRow.outputPath,
		cleanedRev: pageRow.cleanedRev,
		outputRev: pageRow.outputRev,
		originalRev: pageRow.originalRev,
		status: pageRow.status,
		error: pageRow.error,
		llmPrompt: (pageRow as any).llmPrompt ?? null,
		llmResponse: (pageRow as any).llmResponse ?? null,
		ocrStats: (pageRow as any).ocrStats ?? null,
		width: pageRow.width,
		height: pageRow.height,
		regions: allRegions.map((r) => {
			const parsedBox = safeJson(r.box) as any;
			return {
				id: r.id,
				seq: r.seq,
				box: parsedBox,
				polygon: safeJson(r.polygon),
				bubble_box: parsedBox?.bubble_box ?? null,
				bubble_polygon: parsedBox?.bubble_polygon ?? null,
				centroid: parsedBox?.centroid ?? null,
				kind: parsedBox?.kind ?? 'dialogue_bubble',
				textSource: r.textSource,
				textTarget: r.textTarget,
				originalTarget: (r as any).originalTarget ?? r.textTarget,
				conf: r.conf,
			};
		}),
	};
}
