// BOOK DETAIL — THE BOOK + ITS CHAPTERS (WITH PAGE COUNTS, THUMBNAILS, & TELEMETRY) & EDIT / DELETE.
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { assertBookExists, getBookDetails } from '$lib/server/books';
import { db } from '$lib/server/db';
import { books } from '$lib/server/db/schema';
import { updateBookSchema } from '$lib/schemas';
import { parseTags, serializeTags } from '$lib/utils/tags';
import { syncBus } from '$lib/server/sync-bus';
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
	// METADATA FIELDS — NULL CLEARS, ABSENT KEEPS THE CURRENT VALUE.
	if (parsed.data.description !== undefined) {
		updateData.description = parsed.data.description ? parsed.data.description.trim() : null;
	}
	if (parsed.data.author !== undefined) {
		updateData.author = parsed.data.author ? parsed.data.author.trim() : null;
	}
	if (parsed.data.artist !== undefined) {
		updateData.artist = parsed.data.artist ? parsed.data.artist.trim() : null;
	}
	if (parsed.data.tags !== undefined) {
		updateData.tags = serializeTags(parsed.data.tags);
	}
	if (parsed.data.status !== undefined) {
		updateData.status = parsed.data.status;
	}
	if (parsed.data.customPrompt !== undefined) {
		updateData.customPrompt = parsed.data.customPrompt?.slice(0, 4000).trim() || null;
	}
	updateData.updatedAt = Date.now();

	const updated = db
		.update(books)
		.set(updateData)
		.where(eq(books.id, params.id))
		.returning()
		.get();

	syncBus.broadcast({ type: 'book-updated', bookId: params.id });

	return json({ book: { ...updated, tags: parseTags(updated.tags) } });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await assertBookExists(params.id);
	db.delete(books).where(eq(books.id, params.id)).run();
	syncBus.broadcast({ type: 'book-deleted', bookId: params.id });
	return json({ ok: true });
};
