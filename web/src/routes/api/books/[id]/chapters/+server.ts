// CREATE A CHAPTER IN A BOOK.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { assertBookExists } from '$lib/server/books';
import { createChapter } from '$lib/server/chapters';
import { createChapterSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	await assertBookExists(params.id);
	const parsed = createChapterSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid chapter.');
	const chapter = await createChapter(params.id, parsed.data.title);
	return json(chapter, { status: 201 });
};
