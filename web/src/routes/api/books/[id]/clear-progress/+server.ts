// CLEAR TRANSLATION & OCR PROGRESS FOR ALL CHAPTERS OF A BOOK — PRESERVES PAGES AND CHAPTERS.
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { resetAllBookProgress } from '$lib/server/chapters';
import { syncBus } from '$lib/server/sync-bus';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	await assertBookExists(params.id);
	const result = resetAllBookProgress(params.id);
	syncBus.broadcast({ type: 'book-updated', bookId: params.id });
	return json({ ok: true, chaptersReset: result.chaptersReset, pagesReset: result.pagesReset });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await assertBookExists(params.id);
	const result = resetAllBookProgress(params.id);
	syncBus.broadcast({ type: 'book-updated', bookId: params.id });
	return json({ ok: true, chaptersReset: result.chaptersReset, pagesReset: result.pagesReset });
};
