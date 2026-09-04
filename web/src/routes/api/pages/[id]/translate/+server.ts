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
	const parallelWorkers = Math.max(1, Math.min(4, Number(cookies.get('mt_parallel_chapters')) || canonical.parallelChapters || 1));
	const pageConcurrency = Math.max(1, Math.min(8, Number(cookies.get('mt_parallel_processes')) || canonical.parallelProcesses || 2));
	const inpaintExpansionPct = cookies.get('mt_inpaint_exp') ? Number(cookies.get('mt_inpaint_exp')) : canonical.inpaintExpansionPct ?? 0.03;
	const typesetExpansionPct = cookies.get('mt_typeset_exp') ? Number(cookies.get('mt_typeset_exp')) : canonical.typesetExpansionPct ?? 0.0;

	const typesetOptions = {
		fontDialogue: cookies.get('mt_ts_font') || canonical.typesetFont || 'CC Wild Words',
		fontCjk: cookies.get('mt_ts_cjk_font') || canonical.typesetCjkFont || 'Microsoft YaHei',
		boxInset: cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : canonical.typesetPadding ?? 0.05,
		outlineMode: ((cookies.get('mt_ts_outline') as any) || canonical.typesetOutline || 'standard') as any,
		colorMode: ((cookies.get('mt_ts_contrast') as any) || canonical.typesetContrast || 'auto') as any,
		casing: ((cookies.get('mt_ts_casing') as any) || canonical.typesetCasing || 'uppercase') as any,
		enableRotation: cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : (canonical.enableTextRotation ?? true),
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
				inpaintExpansionPct,
				typesetExpansionPct,
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
