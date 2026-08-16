// RE-ORDER EXISTING CHAPTER PAGES (ALIAS FOR PUT /api/chapters/[id]/pages).
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { assertChapterExists, reorderPages } from '$lib/server/chapters';
import type { RequestHandler } from './$types';

const ReorderBody = z.object({ pageIds: z.array(z.number()) });

export const POST: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid pageIds array.');

	reorderPages(chapterId, parsed.data.pageIds);
	return json({ success: true });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const parsed = ReorderBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid pageIds array.');

	reorderPages(chapterId, parsed.data.pageIds);
	return json({ success: true });
};
