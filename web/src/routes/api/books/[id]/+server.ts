// BOOK DETAIL — THE BOOK + ITS CHAPTERS (WITH PAGE COUNTS, THUMBNAILS, & TELEMETRY) & EDIT / DELETE.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { assertBookExists, getBookDetails } from '$lib/server/books';
import { db } from '$lib/server/db';
import { books } from '$lib/server/db/schema';
import { updateBookSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const detail = await getBookDetails(params.id);
	return json(detail);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	await assertBookExists(params.id);
	const parsed = updateBookSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid update body.');

	const currentBook = db.select().from(books).where(eq(books.id, params.id)).get();
	if (!currentBook) throw error(404, 'Book not found.');

	const newSourceLang = parsed.data.sourceLang ?? currentBook.sourceLang;
	const newTargetLang = parsed.data.targetLang ?? currentBook.targetLang;

	if (newSourceLang === newTargetLang) {
		throw error(400, 'Target translation language must be different from source language.');
	}

	const updateData: Record<string, unknown> = {};
	if (parsed.data.title !== undefined) updateData.title = parsed.data.title.trim();
	if (parsed.data.titleTarget !== undefined) {
		updateData.titleTarget = parsed.data.titleTarget ? parsed.data.titleTarget.trim() : null;
	}
	if (parsed.data.sourceLang !== undefined) updateData.sourceLang = parsed.data.sourceLang;
	if (parsed.data.targetLang !== undefined) updateData.targetLang = parsed.data.targetLang;
	if (parsed.data.pinned !== undefined) updateData.pinned = parsed.data.pinned;
	if (parsed.data.archived !== undefined) updateData.archived = parsed.data.archived;
	updateData.updatedAt = Date.now();

	const updated = db
		.update(books)
		.set(updateData)
		.where(eq(books.id, params.id))
		.returning()
		.get();

	return json({ book: updated });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await assertBookExists(params.id);
	db.delete(books).where(eq(books.id, params.id)).run();
	return json({ ok: true });
};
