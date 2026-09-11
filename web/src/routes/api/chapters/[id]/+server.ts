// CHAPTER DETAIL - PAGES (WITH THEIR REGIONS) FOR THE RESULTS VIEW & EDIT / DELETE.
// IMPORTED TYPES
import type { RequestHandler } from './$types';
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { assertChapterExists, getChapterReaderData, updateChapterDetails, deleteChapter } from '$lib/server/chapters';
import { getBookDetails } from '$lib/server/books';
import { db } from '$lib/server/db';
import { chapters } from '$lib/server/db/schema';
import { updateChapterSchema } from '$lib/schemas';
import { getChapterJob } from '$lib/server/translation-service';
import { batchService } from '$lib/server/batch-service';
import { syncBus } from '$lib/server/sync-bus';

export const GET: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	const data = await getChapterReaderData(chapterId);
	const activeJob = getChapterJob(chapterId);
	const batchState = batchService.getState();
	const batchItem = batchState.active ? batchState.queue.find((q) => q.id === chapterId) : null;
	const isTranslating = activeJob
		? activeJob.status === 'running'
		: batchItem
			? (batchItem.status === 'processing' || batchItem.status === 'reslicing' || batchItem.status === 'queued')
			: false;
	const jobStatus = activeJob
		? activeJob.status
		: batchItem
			? batchItem.status
			: 'idle';
	return json({
		...data,
		isTranslating,
		jobStatus
	});
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = updateChapterSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid update data.');

	const updates: { title?: string; titleTarget?: string | null; seq?: number } = {};
	if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
	if (parsed.data.titleTarget !== undefined) updates.titleTarget = parsed.data.titleTarget ? parsed.data.titleTarget.trim() : null;
	if (parsed.data.seq !== undefined) updates.seq = parsed.data.seq;

	const updated = updateChapterDetails(chapterId, updates);
	if (updated) {
		syncBus.broadcast({ type: 'chapter-updated', bookId: updated.bookId, chapterId });
	}
	const detail = await getBookDetails(updated.bookId);
	return json({ chapter: updated, chapters: detail.chapters });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	const deleted = await deleteChapter(chapterId);
	syncBus.broadcast({ type: 'chapter-deleted', bookId: deleted.bookId, chapterId });
	return json({ ok: true });
};

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
