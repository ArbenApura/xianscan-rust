// PAGE DETAIL & DELETE ENDPOINT.
import { error, json } from '@sveltejs/kit';
import { deletePage } from '$lib/server/chapters';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const result = deletePage(pageId);
	return json({ ok: true, chapterId: result.chapterId, seq: result.seq });
};
