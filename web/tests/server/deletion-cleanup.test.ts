// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { books, chapters, pages } from '$lib/server/db/schema';
import { deleteBook, deleteChapter, deleteAllChapterPages } from '$lib/server/chapters';
import { deleteCover, pruneCoverThumbs } from '$lib/server/covers';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- LIFECYCLES -- //

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'xianscan-deletion-test-'));
	resetDb();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

// -- TESTS -- //

describe('chapter deletion disk cleanup', () => {
	it('permanently deletes uploads, clean, output, annotated, and thumbnails on deleteChapter', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_ch_test' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			filePath: `uploads/${chapter.id}/page_0.webp`,
			cleanedPath: `clean/${chapter.id}/page_0_clean.png`,
			outputPath: `output/${chapter.id}/page_0_out.png`,
			annotatedPath: `annotated/${chapter.id}/page_0_ann.png`,
		});

		// CREATE PHYSICAL ASSETS ON DISK
		for (const folder of ['uploads', 'clean', 'output', 'annotated']) {
			mkdirSync(join(dir, folder, String(chapter.id)), { recursive: true });
		}
		writeFileSync(join(dir, page.filePath), 'dummy_upload');
		writeFileSync(join(dir, page.cleanedPath!), 'dummy_clean');
		writeFileSync(join(dir, page.outputPath!), 'dummy_output');
		writeFileSync(join(dir, page.annotatedPath!), 'dummy_annotated');

		// CREATE CACHED THUMBNAIL
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });
		const thumbPath = join(dir, 'cache', 'thumbs', `${page.id}_0_200.jpg`);
		writeFileSync(thumbPath, 'dummy_thumb');

		expect(existsSync(join(dir, page.filePath))).toBe(true);
		expect(existsSync(join(dir, page.cleanedPath!))).toBe(true);
		expect(existsSync(join(dir, page.outputPath!))).toBe(true);
		expect(existsSync(join(dir, page.annotatedPath!))).toBe(true);
		expect(existsSync(thumbPath)).toBe(true);

		// EXECUTE CHAPTER DELETION
		await deleteChapter(chapter.id, dir);

		// VERIFY ALL DIRECTORIES AND ARTIFACTS ARE PERMANENTLY REMOVED
		expect(existsSync(join(dir, 'uploads', String(chapter.id)))).toBe(false);
		expect(existsSync(join(dir, 'clean', String(chapter.id)))).toBe(false);
		expect(existsSync(join(dir, 'output', String(chapter.id)))).toBe(false);
		expect(existsSync(join(dir, 'annotated', String(chapter.id)))).toBe(false);
		expect(existsSync(thumbPath)).toBe(false);

		// VERIFY DATABASE ROWS ARE DELETED
		const chRow = db.select().from(chapters).where(eq(chapters.id, chapter.id)).get();
		expect(chRow).toBeUndefined();
		const pgRow = db.select().from(pages).where(eq(pages.id, page.id)).get();
		expect(pgRow).toBeUndefined();
	});

	it('cleans up annotated folder in deleteAllChapterPages', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_ann_test' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			filePath: `uploads/${chapter.id}/page_0.webp`,
			annotatedPath: `annotated/${chapter.id}/page_0_ann.png`,
		});

		mkdirSync(join(dir, 'annotated', String(chapter.id)), { recursive: true });
		writeFileSync(join(dir, page.annotatedPath!), 'dummy_ann');

		await deleteAllChapterPages(chapter.id, dir);

		expect(existsSync(join(dir, 'annotated', String(chapter.id)))).toBe(false);
	});
});

describe('book cover deletion disk cleanup', () => {
	it('permanently deletes cover image and cached cover thumbnails', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_cover_test', coverPath: 'covers/book_cover_test.jpg' });

		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });

		const coverPath = join(dir, 'covers', 'book_cover_test.jpg');
		const coverThumb1 = join(dir, 'cache', 'covers', 'book_cover_test_dedicated_1_200.jpg');
		const coverThumb2 = join(dir, 'cache', 'covers', 'book_cover_test_dedicated_1_400.jpg');

		writeFileSync(coverPath, 'dummy_cover');
		writeFileSync(coverThumb1, 'dummy_thumb_1');
		writeFileSync(coverThumb2, 'dummy_thumb_2');

		expect(existsSync(coverPath)).toBe(true);
		expect(existsSync(coverThumb1)).toBe(true);
		expect(existsSync(coverThumb2)).toBe(true);

		deleteCover(book.id, dir);

		expect(existsSync(coverPath)).toBe(false);
		expect(existsSync(coverThumb1)).toBe(false);
		expect(existsSync(coverThumb2)).toBe(false);
	});
});

describe('book deletion disk cleanup', () => {
	it('permanently deletes all chapters, pages, covers, and caches when deleting a book', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_full_del', coverPath: 'covers/book_full_del.jpg' });
		const ch1 = seedChapter(db, { bookId: book.id, seq: 0 });
		const ch2 = seedChapter(db, { bookId: book.id, seq: 1 });

		const p1 = seedPage(db, {
			chapterId: ch1.id,
			seq: 0,
			filePath: `uploads/${ch1.id}/p1.webp`,
			outputPath: `output/${ch1.id}/p1.png`,
			annotatedPath: `annotated/${ch1.id}/p1_ann.png`,
		});
		const p2 = seedPage(db, {
			chapterId: ch2.id,
			seq: 0,
			filePath: `uploads/${ch2.id}/p2.webp`,
			cleanedPath: `clean/${ch2.id}/p2_clean.png`,
		});

		// CREATE PHYSICAL ASSETS FOR BOTH CHAPTERS
		for (const cid of [ch1.id, ch2.id]) {
			for (const folder of ['uploads', 'clean', 'output', 'annotated']) {
				mkdirSync(join(dir, folder, String(cid)), { recursive: true });
			}
		}
		writeFileSync(join(dir, p1.filePath), 'p1');
		writeFileSync(join(dir, p1.outputPath!), 'p1_out');
		writeFileSync(join(dir, p1.annotatedPath!), 'p1_ann');
		writeFileSync(join(dir, p2.filePath), 'p2');
		writeFileSync(join(dir, p2.cleanedPath!), 'p2_clean');

		// CREATE COVER AND COVER CACHES
		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });

		const coverPath = join(dir, 'covers', `${book.id}.jpg`);
		const coverThumb = join(dir, 'cache', 'covers', `${book.id}_dedicated_1_300.jpg`);
		const p1Thumb = join(dir, 'cache', 'thumbs', `${p1.id}_0_150.jpg`);
		const p2Thumb = join(dir, 'cache', 'thumbs', `${p2.id}_0_150.jpg`);

		writeFileSync(coverPath, 'cover');
		writeFileSync(coverThumb, 'cover_thumb');
		writeFileSync(p1Thumb, 'p1_thumb');
		writeFileSync(p2Thumb, 'p2_thumb');

		// EXECUTE FULL BOOK DELETION
		const result = await deleteBook(book.id, dir);
		expect(result.chaptersDeleted).toBe(2);

		// VERIFY ALL CHAPTER DIRS DELETED
		for (const cid of [ch1.id, ch2.id]) {
			expect(existsSync(join(dir, 'uploads', String(cid)))).toBe(false);
			expect(existsSync(join(dir, 'clean', String(cid)))).toBe(false);
			expect(existsSync(join(dir, 'output', String(cid)))).toBe(false);
			expect(existsSync(join(dir, 'annotated', String(cid)))).toBe(false);
		}

		// VERIFY COVERS AND THUMBS ARE ALL DELETED
		expect(existsSync(coverPath)).toBe(false);
		expect(existsSync(coverThumb)).toBe(false);
		expect(existsSync(p1Thumb)).toBe(false);
		expect(existsSync(p2Thumb)).toBe(false);

		// VERIFY SQLITE TABLES HAVE NO ORPHAN ROWS
		expect(db.select().from(books).where(eq(books.id, book.id)).get()).toBeUndefined();
		expect(db.select().from(chapters).where(eq(chapters.bookId, book.id)).all()).toHaveLength(0);
		expect(db.select().from(pages).where(eq(pages.chapterId, ch1.id)).all()).toHaveLength(0);
		expect(db.select().from(pages).where(eq(pages.chapterId, ch2.id)).all()).toHaveLength(0);
	});

	it('compacts remaining chapter sequence numbers when a chapter in the middle is deleted', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_compact_test' });
		const ch0 = seedChapter(db, { bookId: book.id, seq: 0, title: 'Ch 0' });
		const ch1 = seedChapter(db, { bookId: book.id, seq: 1, title: 'Ch 1' });
		const ch2 = seedChapter(db, { bookId: book.id, seq: 2, title: 'Ch 2' });

		// DELETE THE MIDDLE CHAPTER (seq 1)
		await deleteChapter(ch1.id, dir);

		const remaining = db
			.select({ id: chapters.id, seq: chapters.seq })
			.from(chapters)
			.where(eq(chapters.bookId, book.id))
			.orderBy(chapters.seq)
			.all();

		expect(remaining).toHaveLength(2);
		expect(remaining[0].id).toBe(ch0.id);
		expect(remaining[0].seq).toBe(0);
		expect(remaining[1].id).toBe(ch2.id);
		expect(remaining[1].seq).toBe(1);
	});
});

describe('API routes deletion endpoints', () => {
	it('DELETE /api/chapters/[id] route invokes deleteChapter and broadcasts sync event', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_api_ch' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });

		const { DELETE } = await import('../../src/routes/api/chapters/[id]/+server');
		const res = await DELETE({ params: { id: String(chapter.id) } } as any);
		const json = await res.json();
		expect(json).toEqual({ ok: true });

		expect(db.select().from(chapters).where(eq(chapters.id, chapter.id)).get()).toBeUndefined();
	});

	it('DELETE /api/books/[id] route invokes deleteBook and broadcasts sync event', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_api_book' });
		seedChapter(db, { bookId: book.id, seq: 0 });

		const { DELETE } = await import('../../src/routes/api/books/[id]/+server');
		const res = await DELETE({ params: { id: book.id } } as any);
		const json = await res.json();
		expect(json).toEqual({ ok: true });

		expect(db.select().from(books).where(eq(books.id, book.id)).get()).toBeUndefined();
		expect(db.select().from(chapters).where(eq(chapters.bookId, book.id)).all()).toHaveLength(0);
	});
});

