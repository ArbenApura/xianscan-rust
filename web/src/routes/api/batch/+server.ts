// REST & SSE ENDPOINTS FOR SERVER-SIDE BATCH TRANSLATION (web/src/routes/api/batch/+server.ts)

import { json, error } from '@sveltejs/kit';
import { batchService } from '$lib/server/batch-service';
import { getCanonicalSettings } from '$lib/server/settings-service';
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
		inpaintExpansionPct,
		typesetExpansionPct,
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

	const resolvedInpaintExp =
		typeof inpaintExpansionPct === 'number'
			? inpaintExpansionPct
			: (cookies.get('mt_inpaint_exp') ? Number(cookies.get('mt_inpaint_exp')) : canonical.inpaintExpansionPct ?? 0.03);

	const resolvedTypesetExp =
		typeof typesetExpansionPct === 'number'
			? typesetExpansionPct
			: (cookies.get('mt_typeset_exp') ? Number(cookies.get('mt_typeset_exp')) : canonical.typesetExpansionPct ?? 0.0);

	const resolvedTypesetOptions = {
		fontDialogue: typesetOptions?.fontDialogue || (cookies.get('mt_ts_font') || canonical.typesetFont || 'CC Wild Words'),
		fontCjk: typesetOptions?.fontCjk || (cookies.get('mt_ts_cjk_font') || canonical.typesetCjkFont || 'Microsoft YaHei'),
		boxInset: typeof typesetOptions?.boxInset === 'number'
			? typesetOptions.boxInset
			: (cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : canonical.typesetPadding ?? 0.05),
		outlineMode: typesetOptions?.outlineMode || ((cookies.get('mt_ts_outline') as any) || canonical.typesetOutline || 'standard'),
		colorMode: typesetOptions?.colorMode || ((cookies.get('mt_ts_contrast') as any) || canonical.typesetContrast || 'auto'),
		casing: typesetOptions?.casing || ((cookies.get('mt_ts_casing') as any) || canonical.typesetCasing || 'uppercase'),
		enableRotation: typeof typesetOptions?.enableRotation === 'boolean'
			? typesetOptions.enableRotation
			: (cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : (canonical.enableTextRotation ?? true)),
	};

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
				inpaintExpansionPct: resolvedInpaintExp,
				typesetExpansionPct: resolvedTypesetExp,
				typesetOptions: resolvedTypesetOptions,
			},
		);
		return json(state);
	} catch (err: any) {
		throw error(400, err?.message || 'Failed to start batch translation');
	}
};
