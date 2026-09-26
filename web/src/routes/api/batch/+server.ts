// REST & SSE ENDPOINTS FOR SERVER-SIDE BATCH TRANSLATION (web/src/routes/api/batch/+server.ts)

import { json, error } from '@sveltejs/kit';
import { batchService } from '$lib/server/batch-service';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { buildTypesetOptions } from '$lib/server/typeset/options';
import { WHITE_INPAINT_COOKIE, INPAINT_EXPANSION_COOKIE, TYPESET_CENTERING_COOKIE } from '$lib/stores/settings';
import type { RequestHandler } from './$types';

// GET CURRENT BATCH STATE
export const GET: RequestHandler = async () => {
	const state = batchService.getState();
	return json(state);
};

// REMOVE / CANCEL A SINGLE CHAPTER FROM THE ACTIVE BATCH (STOPS THE WATCHDOG FROM AUTO-RETRYING
// AN EXTERNALLY-ABORTED JOB — USED BY THE WEB EXTENSION'S CANCEL).
export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const chapterId = Number(body.chapterId);
	if (!Number.isInteger(chapterId)) {
		throw error(400, 'Invalid or missing chapterId');
	}
	const before = batchService.getState();
	batchService.removeFromQueue(chapterId);
	const after = batchService.getState();
	const removed =
		before.queue.some((q) => q.id === chapterId) &&
		!after.queue.some((q) => q.id === chapterId);
	return json({ success: true, removed });
};

// START NEW BATCH TRANSLATION
export const POST: RequestHandler = async ({ request, cookies }) => {
	const canonical = getCanonicalSettings();
	const body = await request.json().catch(() => ({}));
	const {
		bookId,
		bookTitle,
		chapterIds,
		pageIds,
		force,
		parallelWorkers,
		pageConcurrency,
		resliceBeforeBatch,
		inpaintMode,
		enableWhiteInpaint,
		inpaintExpansionPct,
		enableTypesetCentering,
		enableWatermarkInpaint,
		typesetOptions,
	} = body;

	if (!bookId || typeof bookId !== 'string') {
		throw error(400, 'Missing or invalid bookId');
	}
	if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
		throw error(400, 'chapterIds must be a non-empty array of numbers');
	}

	const resolvedParallelWorkers = typeof parallelWorkers === 'number'
		? Math.max(1, Math.min(4, parallelWorkers))
		: Number(cookies.get('mt_parallel_chapters')) || canonical.parallelChapters || 1;

	const resolvedPageConcurrency =
		typeof pageConcurrency === 'number'
			? Math.max(1, Math.min(16, pageConcurrency))
			: Number(cookies.get('mt_parallel_processes')) || canonical.parallelProcesses || 2;

	const resolvedResliceBeforeBatch =
		typeof resliceBeforeBatch === 'boolean'
			? resliceBeforeBatch
			: (cookies.get('mt_reslice_batch') ? cookies.get('mt_reslice_batch') === 'true' : (canonical.resliceBeforeBatch ?? true));

	const resolvedInpaintMode =
		typeof inpaintMode === 'string'
			? inpaintMode
			: cookies.get('mt_inpaint_mode') || canonical.inpaintMode || 'patch';

	const resolvedEnableWhiteInpaint =
		typeof enableWhiteInpaint === 'boolean'
			? enableWhiteInpaint
			: (cookies.get(WHITE_INPAINT_COOKIE) ? cookies.get(WHITE_INPAINT_COOKIE) === 'true' : (canonical.enableWhiteInpaint ?? true));

	const resolvedInpaintExpansionPct =
		typeof inpaintExpansionPct === 'number'
			? inpaintExpansionPct
			: (cookies.get(INPAINT_EXPANSION_COOKIE) ? Number(cookies.get(INPAINT_EXPANSION_COOKIE)) : (canonical.inpaintExpansionPct ?? 0.03));

	const resolvedEnableTypesetCentering =
		typeof enableTypesetCentering === 'boolean'
			? enableTypesetCentering
			: (cookies.get(TYPESET_CENTERING_COOKIE) ? cookies.get(TYPESET_CENTERING_COOKIE) === 'true' : (canonical.enableTypesetCentering ?? true));

	const resolvedTypesetOptions = buildTypesetOptions({ canonical, cookies, userOpts: typesetOptions });

	try {
		const state = await batchService.startBatch(
			bookId,
			bookTitle || 'Book Translation',
			chapterIds.map(Number),
			{
				force: Boolean(force),
				pageIds: Array.isArray(pageIds) && pageIds.length > 0 ? pageIds.map(Number) : undefined,
				parallelWorkers: resolvedParallelWorkers,
				pageConcurrency: resolvedPageConcurrency,
				resliceBeforeBatch: resolvedResliceBeforeBatch,
				inpaintMode: resolvedInpaintMode,
				enableWhiteInpaint: resolvedEnableWhiteInpaint,
				inpaintExpansionPct: resolvedInpaintExpansionPct,
				enableTypesetCentering: resolvedEnableTypesetCentering,
				typesetOptions: resolvedTypesetOptions,
			},
		);
		return json(state);
	} catch (err: any) {
		throw error(400, err?.message || 'Failed to start batch translation');
	}
};
