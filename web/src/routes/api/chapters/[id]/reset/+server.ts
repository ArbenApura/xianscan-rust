import { error, json } from '@sveltejs/kit';
import { resetChapterProgress } from '$lib/server/chapters';
import { clearChapterJob } from '$lib/server/translation-service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');

	clearChapterJob(chapterId);
	const reset = resetChapterProgress(chapterId);
	return json({ ok: true, reset });
};

