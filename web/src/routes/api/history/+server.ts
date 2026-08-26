import { json, type RequestHandler } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { readingHistory } from '$lib/server/db/schema';

// GET /api/history - Return reading history map or list
export const GET: RequestHandler = async ({ url }) => {
	try {
		const bookId = url.searchParams.get('bookId');
		const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 200));

		if (bookId) {
			const entry = db
				.select()
				.from(readingHistory)
				.where(eq(readingHistory.bookId, bookId))
				.get();
			return json(entry || null);
		}

		const entries = db
			.select()
			.from(readingHistory)
			.orderBy(desc(readingHistory.updatedAt))
			.limit(limit)
			.all();

		// Convert to bookId -> record map
		const historyMap: Record<string, typeof entries[0]> = {};
		for (const e of entries) {
			historyMap[e.bookId] = e;
		}

		return json({
			entries,
			historyMap,
		});
	} catch (err) {
		console.error('[api/history] GET failed:', err);
		return json({ error: 'Failed to fetch reading history' }, { status: 500 });
	}
};

interface ReadingHistoryPayload {
	bookId: string;
	chapterId: number;
	chapterSeq: number;
	pageSeq?: number;
	totalPages?: number;
	completed?: boolean;
	force?: boolean;
}

// TRANSACTION-SAFE ATOMIC UPSERT
function upsertReadingRecordTx(
	tx: any,
	payload: ReadingHistoryPayload,
	now = Date.now()
) {
	const bookId = String(payload.bookId || '').trim().slice(0, 128);
	const chapterId = Math.round(Number(payload.chapterId) || 0);
	const chapterSeq = Math.max(0, Math.round(Number(payload.chapterSeq) || 0));
	const pageSeq = Math.max(0, Math.round(Number(payload.pageSeq) || 0));
	const totalPages = Math.max(0, Math.round(Number(payload.totalPages) || 0));
	const completed = Boolean(payload.completed);
	const force = Boolean(payload.force);

	if (!bookId || !chapterId) return;

	if (force) {
		tx.insert(readingHistory)
			.values({
				bookId,
				chapterId,
				chapterSeq,
				pageSeq,
				totalPages,
				completed,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: readingHistory.bookId,
				set: {
					chapterId,
					chapterSeq,
					pageSeq,
					totalPages,
					completed,
					updatedAt: now,
				},
			})
			.run();
		return;
	}

	const existing = tx
		.select()
		.from(readingHistory)
		.where(eq(readingHistory.bookId, bookId))
		.get();

	if (!existing) {
		tx.insert(readingHistory)
			.values({
				bookId,
				chapterId,
				chapterSeq,
				pageSeq,
				totalPages,
				completed,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run();
	} else {
		const isNewerChapter = chapterSeq > existing.chapterSeq;
		const isSameChapterForward = chapterSeq === existing.chapterSeq && pageSeq >= existing.pageSeq;

		if (isNewerChapter || isSameChapterForward) {
			tx.update(readingHistory)
				.set({
					chapterId,
					chapterSeq,
					pageSeq: Math.max(pageSeq, chapterSeq === existing.chapterSeq ? existing.pageSeq : pageSeq),
					totalPages: totalPages || existing.totalPages,
					completed: completed || (chapterSeq === existing.chapterSeq ? existing.completed : false),
					updatedAt: now,
				})
				.where(eq(readingHistory.bookId, bookId))
				.run();
		}
	}
}

// POST /api/history - Upsert reading progress with monotonic progression guard
export const POST: RequestHandler = async ({ request }) => {
	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	try {
		const now = Date.now();

		// SUPPORT BATCH ARRAY PAYLOADS (BEACON FLUSH) WRAPPED IN A SINGLE TRANSACTION
		if (Array.isArray(rawBody)) {
			const capped = rawBody.slice(0, 100);
			db.transaction((tx) => {
				for (const item of capped) {
					if (item?.bookId && typeof item?.chapterId === 'number' && typeof item?.chapterSeq === 'number') {
						upsertReadingRecordTx(tx, item, now);
					}
				}
			});
			return json({ success: true, count: capped.length });
		}

		const body = rawBody as ReadingHistoryPayload;
		if (!body?.bookId || typeof body?.chapterId !== 'number' || typeof body?.chapterSeq !== 'number') {
			return json({ error: 'Missing required reading history fields' }, { status: 400 });
		}

		db.transaction((tx) => {
			upsertReadingRecordTx(tx, body, now);
		});

		const saved = db
			.select()
			.from(readingHistory)
			.where(eq(readingHistory.bookId, body.bookId))
			.get();

		return json(saved);
	} catch (err) {
		console.error('[api/history] POST failed:', err);
		return json({ error: 'Failed to record reading progress' }, { status: 500 });
	}
};

// DELETE /api/history - Clear reading history for a book or all
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const bookId = url.searchParams.get('bookId');
		const clearAll = url.searchParams.get('all') === 'true';

		if (clearAll) {
			db.delete(readingHistory).run();
			return json({ success: true, cleared: 'all' });
		}

		if (bookId) {
			db.delete(readingHistory).where(eq(readingHistory.bookId, bookId)).run();
			return json({ success: true, bookId });
		}

		return json({ error: 'Specify bookId or all=true' }, { status: 400 });
	} catch (err) {
		console.error('[api/history] DELETE failed:', err);
		return json({ error: 'Failed to delete reading history' }, { status: 500 });
	}
};
