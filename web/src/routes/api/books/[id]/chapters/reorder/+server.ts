// REORDER CHAPTERS IN A BOOK (ATOMIC SEQUENCE REINDEXING)
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { reorderChapters } from '$lib/server/chapters';
import { reorderChaptersSchema } from '$lib/schemas';
import { syncBus } from '$lib/server/sync-bus';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const bookId = params.id;
	await assertBookExists(bookId);

	const parsed = reorderChaptersSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid chapterIds array.');

	reorderChapters(bookId, parsed.data.chapterIds);
	syncBus.broadcast({ type: 'chapter-updated', bookId, chapterId: parsed.data.chapterIds[0] });

	return json({ success: true });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const bookId = params.id;
	await assertBookExists(bookId);

	const parsed = reorderChaptersSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid chapterIds array.');

	reorderChapters(bookId, parsed.data.chapterIds);
	syncBus.broadcast({ type: 'chapter-updated', bookId, chapterId: parsed.data.chapterIds[0] });

	return json({ success: true });
};
