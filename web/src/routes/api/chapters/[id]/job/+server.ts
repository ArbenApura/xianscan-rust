import { json, error } from '@sveltejs/kit';
import { assertChapterExists } from '$lib/server/chapters';
import { getChapterJobSnapshot, getChapterJob, abortChapterJob } from '$lib/server/translation-service';
import { db } from '$lib/server/db';
import { pages, chapters } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const job = getChapterJob(chapterId);
	const snapshot = getChapterJobSnapshot(chapterId);

	return json({
		running: job ? job.status === 'running' : false,
		status: job ? job.status : snapshot ? snapshot.status : 'idle',
		snapshot: snapshot ?? null,
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const aborted = abortChapterJob(chapterId);
	db.update(pages)
		.set({ status: 'pending', error: null })
		.where(and(eq(pages.chapterId, chapterId), eq(pages.status, 'processing')))
		.run();

	const allPages = db
		.select({ status: pages.status, outputPath: pages.outputPath })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.all();
	const allDone = allPages.length > 0 && allPages.every((p) => p.status === 'done' || Boolean(p.outputPath));
	const anyError = allPages.some((p) => p.status === 'error');
	const nextStatus = allDone ? 'done' : anyError ? 'error' : 'pending';

	db.update(chapters)
		.set({ status: nextStatus })
		.where(eq(chapters.id, chapterId))
		.run();

	return json({ ok: true, aborted, status: nextStatus });
};


