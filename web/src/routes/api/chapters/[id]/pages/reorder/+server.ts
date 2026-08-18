import { error, json } from '@sveltejs/kit';
import { assertChapterExists, reorderPages } from '$lib/server/chapters';
import { reorderPagesSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = reorderPagesSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid pageIds array.');

	reorderPages(chapterId, parsed.data.pageIds);
	return json({ success: true });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = reorderPagesSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid pageIds array.');

	reorderPages(chapterId, parsed.data.pageIds);
	return json({ success: true });
};
