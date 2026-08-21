// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { getBooksWithTelemetry } from '$lib/server/books';
import { books } from '$lib/server/db/schema';
import { PATCH } from '../../src/routes/api/books/[id]/+server';
import { POST as booksPOST } from '../../src/routes/api/books/+server';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
});

// -- TESTS -- //

describe('book metadata persistence', () => {
	it('exposes new metadata through telemetry', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1', title: '星尘' });
		db.update(books)
			.set({
				description: 'A story about stardust.',
				author: 'Er Gen',
				artist: 'Manga Artist',
				tags: JSON.stringify(['Xianxia', 'Cultivation']),
				status: 'ongoing',
				coverPath: 'covers/b1.jpg',
				coverRev: 2,
			})
			.where(eq(books.id, 'b1'))
			.run();

		const [summary] = await getBooksWithTelemetry();
		expect(summary.description).toBe('A story about stardust.');
		expect(summary.author).toBe('Er Gen');
		expect(summary.artist).toBe('Manga Artist');
		expect(summary.tags).toEqual(['Xianxia', 'Cultivation']);
		expect(summary.status).toBe('ongoing');
		expect(summary.coverPath).toBe('covers/b1.jpg');
		expect(summary.coverRev).toBe(2);
		expect(summary.coverHasDedicated).toBe(true);
	});

	it('defaults a new book to status unknown with no tags', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		const [summary] = await getBooksWithTelemetry();
		expect(summary.status).toBe('unknown');
		expect(summary.tags).toEqual([]);
		expect(summary.coverHasDedicated).toBe(false);
	});

	it('PATCH persists metadata fields', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });

		const request = new Request('http://localhost/api/books/b1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				description: 'New desc',
				author: 'Author A',
				artist: 'Artist B',
				tags: ['Action', 'Drama'],
				status: 'completed',
			}),
		});
		const res = await PATCH({ request, params: { id: 'b1' } } as unknown as RequestEvent);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(Array.isArray(body.book.tags)).toBe(true);
		expect(body.book.tags).toEqual(['Action', 'Drama']);

		const row = db.select().from(books).where(eq(books.id, 'b1')).get();
		expect(row?.description).toBe('New desc');
		expect(row?.author).toBe('Author A');
		expect(row?.artist).toBe('Artist B');
		expect(JSON.parse(row!.tags!)).toEqual(['Action', 'Drama']);
		expect(row?.status).toBe('completed');
	});

	it('PATCH clears nullable metadata when sent null', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		db.update(books)
			.set({ description: 'x', author: 'y', artist: 'z', tags: JSON.stringify(['A']) })
			.where(eq(books.id, 'b1'))
			.run();

		const request = new Request('http://localhost/api/books/b1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ description: null, author: null, artist: null, tags: [] }),
		});
		await PATCH({ request, params: { id: 'b1' } } as unknown as RequestEvent);

		const row = db.select().from(books).where(eq(books.id, 'b1')).get();
		expect(row?.description).toBeNull();
		expect(row?.author).toBeNull();
		expect(JSON.parse(row!.tags!)).toEqual([]);
	});

	it('POST persists metadata on create', async () => {
		const db = getTestDb();
		const request = new Request('http://localhost/api/books', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: 'Star',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
				description: 'Synopsis',
				author: 'Author',
				artist: 'Artist',
				tags: ['Fantasy'],
				status: 'on_hiatus',
			}),
		});
		const res = await booksPOST({ request } as unknown as RequestEvent);
		expect(res.status).toBe(201);
		const { id } = await res.json();

		const row = db.select().from(books).where(eq(books.id, id)).get();
		expect(row?.description).toBe('Synopsis');
		expect(row?.status).toBe('on_hiatus');
		expect(JSON.parse(row!.tags!)).toEqual(['Fantasy']);
	});

	it('keeps the page-proxy cover on the first chapter regardless of last-read', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b1' });
		const ch1 = seedChapter(db, { bookId: book.id, seq: 0 });
		const ch2 = seedChapter(db, { bookId: book.id, seq: 1 });
		const p1 = seedPage(db, { chapterId: ch1.id, seq: 0, filePath: 'uploads/c1p1.png' });
		seedPage(db, { chapterId: ch2.id, seq: 0, filePath: 'uploads/c2p1.png' });

		// LAST-READ POINTS AT CHAPTER 2 — THE COVER MUST STAY ON CHAPTER 1'S FIRST PAGE.
		const lastReadMap = { b1: { chapterId: ch2.id } };
		const [summary] = await getBooksWithTelemetry(lastReadMap);
		expect(summary.coverPageId).toBe(p1.id);
		// THE CONTINUE-READING TARGET STILL RESOLVES TO THE LAST-READ CHAPTER.
		expect(summary.lastReadChapter?.id).toBe(ch2.id);
	});
});
