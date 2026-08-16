// MANUAL STITCH ENDPOINT — MERGES PAGE params.id WITH THE NEXT PAGE IN THE CHAPTER.
import { error, json } from '@sveltejs/kit';
import { stitchPageWithNext } from '$lib/server/chapters';
import { createPipelineClient } from '$lib/server/pipeline-client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const pipeline = createPipelineClient();
	try {
		await stitchPageWithNext(pageId, pipeline);
		return json({ ok: true });
	} catch (e) {
		throw error(400, (e as Error).message || 'Stitch failed.');
	}
};
