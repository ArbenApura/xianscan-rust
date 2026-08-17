// PAGE DETAIL & DELETE ENDPOINT.
import { error, json } from '@sveltejs/kit';
import { deletePage, updateRegionTranslation, getPageWithRegions } from '$lib/server/chapters';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const page = getPageWithRegions(pageId);
	if (!page) throw error(404, 'Page not found.');

	return json({ page });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const result = deletePage(pageId);
	return json({ ok: true, chapterId: result.chapterId, seq: result.seq });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const body = await request.json();
	const { regionId, textTarget } = body;
	if (typeof regionId !== 'number' || typeof textTarget !== 'string') {
		throw error(400, 'regionId and textTarget are required.');
	}

	const updated = await updateRegionTranslation(pageId, regionId, textTarget);
	return json({ ok: true, ...updated });
};

