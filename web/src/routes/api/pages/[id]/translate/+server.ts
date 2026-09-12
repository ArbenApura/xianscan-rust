// DEDICATED SINGLE-PAGE TRANSLATION ENDPOINT
// RESETS SINGLE PAGE ARTIFACTS AND INITIATES OR QUEUES TARGETED TRANSLATION.

// -- IMPORTS -- //
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pages, chapters, books } from '$lib/server/db/schema';
import { resetPageProgress } from '$lib/server/chapters';
import { batchService } from '$lib/server/batch-service';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { WHITE_INPAINT_COOKIE, INPAINT_EXPANSION_COOKIE, TYPESET_CENTERING_COOKIE } from '$lib/stores/settings';

// -- ENDPOINT HANDLER -- //
export const POST: RequestHandler = async ({ params, cookies }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId) || pageId <= 0) {
		throw error(400, 'Invalid page id');
	}

	const page = db
		.select({ id: pages.id, chapterId: pages.chapterId, seq: pages.seq })
		.from(pages)
		.where(eq(pages.id, pageId))
		.get();

	if (!page) {
		throw error(404, 'Page not found');
	}

	const chapter = db
		.select({ id: chapters.id, bookId: chapters.bookId, title: chapters.title })
		.from(chapters)
		.where(eq(chapters.id, page.chapterId))
		.get();

	if (!chapter) {
		throw error(404, 'Chapter not found');
	}

	const book = db
		.select({ id: books.id, title: books.title })
		.from(books)
		.where(eq(books.id, chapter.bookId))
		.get();

	// 1. RESET TARGET PAGE PROGRESS SO PIPELINE STARTS CLEAN
	resetPageProgress(pageId);

	// 2. RETRIEVE CANONICAL AND COOKIE INFERENCE / TYPESET SETTINGS
	const canonical = getCanonicalSettings();
	const inpaintMode = cookies.get('mt_inpaint_mode') || canonical.inpaintMode || 'patch';
	const enableWhiteInpaint = cookies.get(WHITE_INPAINT_COOKIE) ? cookies.get(WHITE_INPAINT_COOKIE) === 'true' : (canonical.enableWhiteInpaint ?? true);
	const inpaintExpansionPct = cookies.get(INPAINT_EXPANSION_COOKIE) ? Number(cookies.get(INPAINT_EXPANSION_COOKIE)) : (canonical.inpaintExpansionPct ?? 0.03);
	const enableTypesetCentering = cookies.get(TYPESET_CENTERING_COOKIE) ? cookies.get(TYPESET_CENTERING_COOKIE) === 'true' : (canonical.enableTypesetCentering ?? true);
	const parallelWorkers = Math.max(1, Math.min(4, Number(cookies.get('mt_parallel_chapters')) || canonical.parallelChapters || 1));
	const pageConcurrency = Math.max(1, Math.min(8, Number(cookies.get('mt_parallel_processes')) || canonical.parallelProcesses || 2));

	const typesetOptions = {
		fontDialogue: cookies.get('mt_ts_font') || canonical.typesetFont || 'CC Wild Words',
		fontCjk: cookies.get('mt_ts_cjk_font') || canonical.typesetCjkFont || 'Microsoft YaHei',
		boxInset: cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : canonical.typesetPadding ?? 0.05,
		outlineMode: ((cookies.get('mt_ts_outline') as any) || canonical.typesetOutline || 'standard') as any,
		colorMode: ((cookies.get('mt_ts_contrast') as any) || canonical.typesetContrast || 'auto') as any,
		casing: ((cookies.get('mt_ts_casing') as any) || canonical.typesetCasing || 'uppercase') as any,
		enableRotation: cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : (canonical.enableTextRotation ?? true),
		fontWeight: ((cookies.get('mt_ts_font_weight') as any) || (canonical as any).typesetFontWeight || 'normal') as any,
		fontStyle: (cookies.get('mt_ts_italic') ? (cookies.get('mt_ts_italic') === 'true' ? 'italic' : 'normal') : (canonical.enableTypesetItalic ? 'italic' : 'normal')) as any,
	};

	try {
		// 3. START SINGLE-PAGE TARGETED TRANSLATION
		const batch = await batchService.startBatch(
			chapter.bookId,
			book?.title || 'Book Translation',
			[chapter.id],
			{
				force: true,
				pageIds: [pageId],
				parallelWorkers,
				pageConcurrency,
				resliceBeforeBatch: false,
				inpaintMode,
				enableWhiteInpaint,
				inpaintExpansionPct,
				enableTypesetCentering,
				typesetOptions,
			},
		);

		return json({
			ok: true,
			pageId,
			chapterId: page.chapterId,
			bookId: chapter.bookId,
			status: batch.status,
		});
	} catch (err: any) {
		throw error(500, err?.message || 'Failed to trigger page translation');
	}
};
