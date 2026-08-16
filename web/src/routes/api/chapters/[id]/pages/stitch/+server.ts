import { error, json } from '@sveltejs/kit';
import { stitchPageWithNext } from '$lib/server/chapters';
import { createPipelineClient } from '$lib/server/pipeline-client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const pageId = Number(body.topPageId ?? body.pageId);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const pipeline = createPipelineClient();
	try {
		await stitchPageWithNext(pageId, pipeline);
		return json({ ok: true });
	} catch (e) {
		throw error(400, (e as Error).message || 'Stitch failed.');
	}
};
