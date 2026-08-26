// BATCH ACTION CONTROLLER DISPATCHER (web/src/routes/api/batch/[action]/+server.ts)

import { json, error } from '@sveltejs/kit';
import { batchService } from '$lib/server/batch-service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const action = params.action;

	if (action === 'pause') {
		const state = batchService.pauseBatch();
		return json(state);
	}

	if (action === 'resume') {
		const state = batchService.resumeBatch();
		return json(state);
	}

	if (action === 'skip') {
		const body = await request.json().catch(() => ({}));
		const chapterId = body.chapterId ? Number(body.chapterId) : undefined;
		const state = await batchService.skipChapter(chapterId);
		return json(state);
	}

	if (action === 'cancel') {
		const state = batchService.cancelBatch();
		return json(state);
	}

	if (action === 'clear') {
		const state = batchService.clearBatch();
		return json(state);
	}

	if (action === 'remove') {
		const body = await request.json().catch(() => ({}));
		if (!body.chapterId) throw error(400, 'Missing chapterId');
		const state = await batchService.removeFromQueue(Number(body.chapterId));
		return json(state);
	}

	if (action === 'reorder') {
		const body = await request.json().catch(() => ({}));
		if (!Array.isArray(body.chapterIds)) throw error(400, 'Missing chapterIds array');
		const state = batchService.reorderQueue(body.chapterIds.map(Number));
		return json(state);
	}

	throw error(404, `Unknown batch action "${action}".`);
};
