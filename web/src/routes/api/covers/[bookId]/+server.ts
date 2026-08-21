// BOOK COVER UPLOAD / DELETE.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { deleteCover, saveCover } from '$lib/server/covers';
import { readUploadForm } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

// -- CONSTANTS -- //

const MAX_COVER_BYTES = 20 * 1024 * 1024;

// -- HANDLES -- //

export const POST: RequestHandler = async ({ params, request }) => {
	await assertBookExists(params.bookId);
	const form = await readUploadForm(request);
	const file = form.get('cover');
	if (!(file instanceof File)) throw error(400, 'No cover image uploaded.');
	if (file.size > MAX_COVER_BYTES) throw error(413, 'Cover image too large.');
	try {
		const { coverPath, coverRev } = await saveCover(params.bookId, file);
		return json({ coverPath, coverRev });
	} catch (err) {
		console.error('[covers] cover upload failed:', err);
		const message = err instanceof Error ? err.message : null;
		throw error(400, message || 'Cover image could not be saved.');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await assertBookExists(params.bookId);
	deleteCover(params.bookId);
	return json({ ok: true });
};
