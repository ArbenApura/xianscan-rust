// CHAPTER DETAIL — PAGES (WITH THEIR REGIONS) FOR THE RESULTS VIEW & EDIT / DELETE.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
// IMPORTED MODULES
import { assertChapterExists, getChapterReaderData } from '$lib/server/chapters';
import { db } from '$lib/server/db';
import { chapters } from '$lib/server/db/schema';
import { updateChapterSchema } from '$lib/schemas';
import { getChapterJob } from '$lib/server/translation-service';
import { syncBus } from '$lib/server/sync-bus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	const data = await getChapterReaderData(chapterId);
	const activeJob = getChapterJob(chapterId);
	const isTranslating = activeJob ? activeJob.status === 'running' : false;
	return json({
		...data,
		isTranslating,
		jobStatus: activeJob ? activeJob.status : 'idle'
	});
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = updateChapterSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid update data.');

	const updates: Record<string, unknown> = {};
	if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
	if (parsed.data.titleTarget !== undefined) updates.titleTarget = parsed.data.titleTarget ? parsed.data.titleTarget.trim() : null;
	if (parsed.data.seq !== undefined) updates.seq = parsed.data.seq;

	if (Object.keys(updates).length > 0) {
		db.update(chapters).set(updates).where(eq(chapters.id, chapterId)).run();
	}

	const updated = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (updated) {
		syncBus.broadcast({ type: 'chapter-updated', bookId: updated.bookId, chapterId });
	}
	return json({ chapter: updated });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);
	const target = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	db.delete(chapters).where(eq(chapters.id, chapterId)).run();
	if (target) {
		syncBus.broadcast({ type: 'chapter-deleted', bookId: target.bookId, chapterId });
	}
	return json({ ok: true });
};

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
