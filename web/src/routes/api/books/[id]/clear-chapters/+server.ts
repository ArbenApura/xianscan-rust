// DELETE ALL CHAPTERS OF A BOOK — PAGES, REGIONS, TRANSLATIONS, AND FILES — WHILE KEEPING THE BOOK ITSELF.
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { deleteAllBookChapters } from '$lib/server/chapters';
import { syncBus } from '$lib/server/sync-bus';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	await assertBookExists(params.id);
	const { deletedCount } = await deleteAllBookChapters(params.id);
	syncBus.broadcast({ type: 'book-updated', bookId: params.id });
	return json({ ok: true, deleted: deletedCount });
};
