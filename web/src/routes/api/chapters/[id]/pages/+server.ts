// UPLOAD PAGE IMAGES TO A CHAPTER OR RE-ORDER EXISTING PAGES.
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { assertChapterExists, reorderPages, uploadPages } from '$lib/server/chapters';
import { assertMaxSize, readUploadForm } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

const MAX_PAGE_BYTES = 32 * 1024 * 1024;
const ReorderBody = z.object({ pageIds: z.array(z.number()) });

export const POST: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const form = await readUploadForm(request);
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	if (files.length === 0) throw error(400, 'No image files uploaded.');
	for (const f of files) assertMaxSize(f, MAX_PAGE_BYTES);

	const count = await uploadPages(chapterId, files);
	return json({ added: count }, { status: 201 });
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

export const DELETE: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const { deleteAllChapterPages } = await import('$lib/server/chapters');
	const result = await deleteAllChapterPages(chapterId);
	return json({ success: true, deletedCount: result.deletedCount });
};

