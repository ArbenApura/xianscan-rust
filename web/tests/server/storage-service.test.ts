// STORAGE SERVICE TESTS
// VERIFIES ACCURATE DISK USAGE CALCULATION, ORPHANED FILE PURGING,
// CACHE WIPING, AND SAFE SYSTEM RESET.

// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { books, chapters, pages } from '$lib/server/db/schema';
import {
	getBookStorageStats,
	getSystemStorageStats,
	purgeOrphanedStorage,
	clearSystemCaches,
	clearAllSystemData,
} from '$lib/server/storage-service';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- LIFECYCLES -- //

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'xianscan-storage-test-'));
	resetDb();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

// -- TESTS -- //

describe('storage service metrics', () => {
	it('returns null for nonexistent book', () => {
		expect(getBookStorageStats('missing_book', dir)).toBeNull();
	});

	it('computes accurate granular storage metrics for an existing book', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_storage' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			filePath: `uploads/${chapter.id}/p0.webp`,
			cleanedPath: `clean/${chapter.id}/p0_clean.png`,
			outputPath: `output/${chapter.id}/p0_out.png`,
			annotatedPath: `annotated/${chapter.id}/p0_ann.png`,
		});

		for (const folder of ['uploads', 'clean', 'output', 'annotated']) {
			mkdirSync(join(dir, folder, String(chapter.id)), { recursive: true });
		}
		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });

		writeFileSync(join(dir, page.filePath), '1234567890'); // 10 BYTES
		writeFileSync(join(dir, page.cleanedPath!), '12345'); // 5 BYTES
		writeFileSync(join(dir, page.outputPath!), '12345678'); // 8 BYTES
		writeFileSync(join(dir, page.annotatedPath!), '1234'); // 4 BYTES
		writeFileSync(join(dir, 'covers', `${book.id}.jpg`), '123456'); // 6 BYTES
		writeFileSync(join(dir, 'cache', 'covers', `${book.id}_page_1_320.jpg`), '123'); // 3 BYTES
		writeFileSync(join(dir, 'cache', 'thumbs', `${page.id}_0_200.jpg`), '1234567'); // 7 BYTES

		const stats = getBookStorageStats(book.id, dir);
		expect(stats).not.toBeNull();
		expect(stats!.bookId).toBe(book.id);
		expect(stats!.chapterCount).toBe(1);
		expect(stats!.pageCount).toBe(1);

		expect(stats!.categories.uploads.bytes).toBe(10);
		expect(stats!.categories.uploads.count).toBe(1);
		expect(stats!.categories.clean.bytes).toBe(5);
		expect(stats!.categories.clean.count).toBe(1);
		expect(stats!.categories.output.bytes).toBe(8);
		expect(stats!.categories.output.count).toBe(1);
		expect(stats!.categories.annotated.bytes).toBe(4);
		expect(stats!.categories.annotated.count).toBe(1);
		expect(stats!.categories.covers.bytes).toBe(9); // 6 + 3
		expect(stats!.categories.covers.count).toBe(2);
		expect(stats!.categories.thumbs.bytes).toBe(7);
		expect(stats!.categories.thumbs.count).toBe(1);

		expect(stats!.totalBytes).toBe(10 + 5 + 8 + 4 + 9 + 7);
	});

	it('avoids prefix collisions for book IDs with underscores', () => {
		const db = getTestDb();
		const bookA = seedBook(db, { id: 'book' });
		const bookB = seedBook(db, { id: 'book_2' });

		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });

		// BOOK A COVER & CACHE
		writeFileSync(join(dir, 'covers', `${bookA.id}.jpg`), '1234'); // 4 BYTES
		writeFileSync(join(dir, 'cache', 'covers', `${bookA.id}_dedicated_1_320.jpg`), '12'); // 2 BYTES

		// BOOK B COVER & CACHE
		writeFileSync(join(dir, 'covers', `${bookB.id}.jpg`), '123456'); // 6 BYTES
		writeFileSync(join(dir, 'cache', 'covers', `${bookB.id}_dedicated_1_320.jpg`), '123'); // 3 BYTES

		const statsA = getBookStorageStats(bookA.id, dir);
		const statsB = getBookStorageStats(bookB.id, dir);

		expect(statsA).not.toBeNull();
		expect(statsB).not.toBeNull();

		// STATS A MUST ONLY MEASURE BOOK A (4 + 2 = 6 BYTES, NOT INCLUDING BOOK B)
		expect(statsA!.categories.covers.bytes).toBe(6);
		expect(statsA!.categories.covers.count).toBe(2);

		// STATS B MUST ONLY MEASURE BOOK B (6 + 3 = 9 BYTES)
		expect(statsB!.categories.covers.bytes).toBe(9);
		expect(statsB!.categories.covers.count).toBe(2);
	});

	it('computes system-wide storage stats across all categories', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_sys' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/${chapter.id}/p0.webp` });

		mkdirSync(join(dir, 'uploads', String(chapter.id)), { recursive: true });
		writeFileSync(join(dir, 'uploads', String(chapter.id), 'p0.webp'), 'upload_bytes');

		const stats = getSystemStorageStats(dir);
		expect(stats.dataRoot).toBe(dir);
		expect(stats.bookCount).toBe(1);
		expect(stats.chapterCount).toBe(1);
		expect(stats.pageCount).toBe(1);
		expect(stats.categories.uploads.bytes).toBe(12);
		expect(stats.totalBytes).toBeGreaterThanOrEqual(12);
	});
});

describe('purge orphaned storage', () => {
	it('purges unreferenced chapter folders, stale covers, and unattached thumbnails while preserving active data', () => {
		const db = getTestDb();
		const activeBook = seedBook(db, { id: 'b_active' });
		const activeChapter = seedChapter(db, { bookId: activeBook.id, seq: 0 });
		const activePage = seedPage(db, {
			chapterId: activeChapter.id,
			seq: 0,
			filePath: `uploads/${activeChapter.id}/active.webp`,
		});

		// 1. CREATE ACTIVE ASSETS
		mkdirSync(join(dir, 'uploads', String(activeChapter.id)), { recursive: true });
		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });

		const activeUpload = join(dir, activePage.filePath);
		const activeCover = join(dir, 'covers', `${activeBook.id}.jpg`);
		const activeCoverThumb = join(dir, 'cache', 'covers', `${activeBook.id}_dedicated_1_200.jpg`);
		const activePageThumb = join(dir, 'cache', 'thumbs', `${activePage.id}_0_200.jpg`);

		writeFileSync(activeUpload, 'active_upload');
		writeFileSync(activeCover, 'active_cover');
		writeFileSync(activeCoverThumb, 'active_cover_thumb');
		writeFileSync(activePageThumb, 'active_page_thumb');

		// 2. CREATE ORPHANED ASSETS (NO MATCHING SQLITE RECORDS)
		const orphanChapterId = 99999;
		mkdirSync(join(dir, 'uploads', String(orphanChapterId)), { recursive: true });
		mkdirSync(join(dir, 'output', String(orphanChapterId)), { recursive: true });

		const orphanUpload = join(dir, 'uploads', String(orphanChapterId), 'orphan.webp');
		const orphanOutput = join(dir, 'output', String(orphanChapterId), 'orphan_out.png');
		const orphanCover = join(dir, 'covers', 'deleted_book.jpg');
		const orphanCoverThumb = join(dir, 'cache', 'covers', 'deleted_book_dedicated_1_200.jpg');
		const orphanPageThumb = join(dir, 'cache', 'thumbs', '88888_0_200.jpg');

		writeFileSync(orphanUpload, 'orphan_upload');
		writeFileSync(orphanOutput, 'orphan_output');
		writeFileSync(orphanCover, 'orphan_cover');
		writeFileSync(orphanCoverThumb, 'orphan_cover_thumb');
		writeFileSync(orphanPageThumb, 'orphan_thumb');

		// 3. EXECUTE PURGE
		const res = purgeOrphanedStorage(dir);
		expect(res.purgedFiles).toBeGreaterThanOrEqual(5);
		expect(res.reclaimedBytes).toBeGreaterThan(0);

		// 4. VERIFY ORPHANS REMOVED
		expect(existsSync(join(dir, 'uploads', String(orphanChapterId)))).toBe(false);
		expect(existsSync(join(dir, 'output', String(orphanChapterId)))).toBe(false);
		expect(existsSync(orphanCover)).toBe(false);
		expect(existsSync(orphanCoverThumb)).toBe(false);
		expect(existsSync(orphanPageThumb)).toBe(false);

		// 5. VERIFY ACTIVE ASSETS PRESERVED
		expect(existsSync(activeUpload)).toBe(true);
		expect(existsSync(activeCover)).toBe(true);
		expect(existsSync(activeCoverThumb)).toBe(true);
		expect(existsSync(activePageThumb)).toBe(true);
	});

	it('does not purge cached covers of similar prefixed books', () => {
		const db = getTestDb();
		const activeBook = seedBook(db, { id: 'book' });

		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });
		// ACTIVE BOOK COVER CACHE
		const activeCache = join(dir, 'cache', 'covers', `${activeBook.id}_dedicated_1_320.jpg`);
		writeFileSync(activeCache, 'active');

		// ORPHAN COVER CACHE FOR DELETED BOOK WHOSE ID STARTS WITH ACTIVE ID
		const orphanCache = join(dir, 'cache', 'covers', 'book_deleted_dedicated_1_320.jpg');
		writeFileSync(orphanCache, 'orphan');

		const res = purgeOrphanedStorage(dir);
		expect(res.purgedFiles).toBe(1);
		expect(existsSync(activeCache)).toBe(true);
		expect(existsSync(orphanCache)).toBe(false);
	});

	it('purges unreferenced raw uploads inside active chapters and loose files in uploads', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book_raw' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/${chapter.id}/active.webp` });

		const chUploadDir = join(dir, 'uploads', String(chapter.id));
		mkdirSync(chUploadDir, { recursive: true });

		// 1. ACTIVE RAW UPLOAD
		const activeUpload = join(dir, page.filePath);
		writeFileSync(activeUpload, 'active-raw');

		// 2. ORPHANED RAW UPLOAD INSIDE ACTIVE CHAPTER (E.G. OLD RESLICE / CANCELLED UPLOAD)
		const orphanInsideChapter = join(chUploadDir, 'orphan_leftover.webp');
		writeFileSync(orphanInsideChapter, 'orphan-raw');

		// 3. LOOSE ORPHANED RAW UPLOAD DIRECTLY IN uploads/
		const looseOrphan = join(dir, 'uploads', 'loose_scan.png');
		writeFileSync(looseOrphan, 'loose-raw');

		expect(existsSync(activeUpload)).toBe(true);
		expect(existsSync(orphanInsideChapter)).toBe(true);
		expect(existsSync(looseOrphan)).toBe(true);

		const res = purgeOrphanedStorage(dir);
		expect(res.purgedFiles).toBe(2);

		// ORPHANS REMOVED
		expect(existsSync(orphanInsideChapter)).toBe(false);
		expect(existsSync(looseOrphan)).toBe(false);

		// ACTIVE UPLOAD PRESERVED
		expect(existsSync(activeUpload)).toBe(true);
	});
});

describe('clear system caches', () => {
	it('wipes cached thumbnails while preserving uploads and database records', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_cache' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/${chapter.id}/p0.webp` });

		mkdirSync(join(dir, 'uploads', String(chapter.id)), { recursive: true });
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'covers'), { recursive: true });

		const upload = join(dir, page.filePath);
		const thumb = join(dir, 'cache', 'thumbs', `${page.id}_0_200.jpg`);
		const coverThumb = join(dir, 'cache', 'covers', `${book.id}_page_1_300.jpg`);

		writeFileSync(upload, 'upload_data');
		writeFileSync(thumb, 'thumb_data');
		writeFileSync(coverThumb, 'cover_thumb_data');

		const res = clearSystemCaches(dir);
		expect(res.purgedFiles).toBe(2);

		// CACHES REMOVED
		expect(existsSync(thumb)).toBe(false);
		expect(existsSync(coverThumb)).toBe(false);

		// RAW SCANS & DATABASE PRESERVED
		expect(existsSync(upload)).toBe(true);
		expect(db.select().from(books).where(eq(books.id, book.id)).get()).toBeDefined();
	});
});

describe('clear all system data', () => {
	it('resets all database tables and unlinks all physical data directories', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b_wipe' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			filePath: `uploads/${chapter.id}/p0.webp`,
			outputPath: `output/${chapter.id}/p0_out.png`,
		});

		for (const folder of ['uploads', 'clean', 'output', 'annotated']) {
			mkdirSync(join(dir, folder, String(chapter.id)), { recursive: true });
		}
		mkdirSync(join(dir, 'covers'), { recursive: true });
		mkdirSync(join(dir, 'cache', 'thumbs'), { recursive: true });

		writeFileSync(join(dir, page.filePath), 'scan');
		writeFileSync(join(dir, page.outputPath!), 'out');
		writeFileSync(join(dir, 'covers', `${book.id}.jpg`), 'cover');
		writeFileSync(join(dir, 'cache', 'thumbs', `${page.id}_0_200.jpg`), 'thumb');

		const res = await clearAllSystemData(dir);
		expect(res.ok).toBe(true);
		expect(res.purgedFiles).toBeGreaterThanOrEqual(4);

		// ASSETS WIPED
		expect(existsSync(join(dir, 'uploads'))).toBe(false);
		expect(existsSync(join(dir, 'output'))).toBe(false);
		expect(existsSync(join(dir, 'covers'))).toBe(false);
		expect(existsSync(join(dir, 'cache'))).toBe(false);

		// DATABASE EMPTIED
		expect(db.select().from(books).all()).toHaveLength(0);
		expect(db.select().from(chapters).all()).toHaveLength(0);
		expect(db.select().from(pages).all()).toHaveLength(0);
	});
});
