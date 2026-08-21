// GET /api/mihon/chapters/[chapterId]/pages — PAGE IMAGE URLS FOR A CHAPTER.
// IMPORTED DEP-MODULES
import { json, error } from '@sveltejs/kit';
// IMPORTED MODULES
import { getPagesDto } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = ({ params }) => {
	const chapterId = Number(params.chapterId);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	return json({ pages: getPagesDto(chapterId) });
};
