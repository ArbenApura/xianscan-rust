// BOOK STORAGE BREAKDOWN & MAINTENANCE ENDPOINT
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';

// IMPORTED MODULES
import { assertBookExists } from '$lib/server/books';
import { getBookStorageStats } from '$lib/server/storage-service';
import { pruneCoverThumbs } from '$lib/server/covers';
import { pruneMultiplePageThumbs } from '$lib/server/chapters/mutations';
import { db } from '$lib/server/db';
import { chapters, pages } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ params }) => {
	const bookId = params.id;
	await assertBookExists(bookId);

	const stats = getBookStorageStats(bookId);
	if (!stats) {
		throw error(404, 'Book storage stats not found');
	}

	return json(stats);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const bookId = params.id;
	await assertBookExists(bookId);

	const body = await request.json().catch(() => ({}));
	const action = body.action;

	if (action === 'prune-cache') {
		// PRUNE CACHED COVER THUMBNAILS
		pruneCoverThumbs(bookId);

		// PRUNE CACHED PAGE THUMBNAILS FOR ALL PAGES IN THIS BOOK
		const chapterRows = db
			.select({ id: chapters.id })
			.from(chapters)
			.where(eq(chapters.bookId, bookId))
			.all();
		const chapterIds = chapterRows.map((c) => c.id);

		if (chapterIds.length > 0) {
			const pageRows = db
				.select({ id: pages.id })
				.from(pages)
				.where(inArray(pages.chapterId, chapterIds))
				.all();
			const pageIds = pageRows.map((p) => p.id);
			pruneMultiplePageThumbs(pageIds);
		}

		const updatedStats = getBookStorageStats(bookId);
		return json({ ok: true, stats: updatedStats });
	}

	throw error(400, 'Unknown storage action');
};
