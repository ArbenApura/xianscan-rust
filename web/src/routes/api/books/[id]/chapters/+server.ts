// CREATE A CHAPTER IN A BOOK.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { createChapter } from '$lib/server/chapters';
import type { RequestHandler } from './$types';

const PostBody = z.object({ title: z.string().max(200).default('') });

export const POST: RequestHandler = async ({ params, request }) => {
	await assertBookExists(params.id);
	const parsed = PostBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid chapter.');
	const chapter = await createChapter(params.id, parsed.data.title);
	return json(chapter, { status: 201 });
};
