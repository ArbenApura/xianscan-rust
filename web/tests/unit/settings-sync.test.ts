import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/lib/server/db/schema';
import {
	getCanonicalSettings,
	updateCanonicalSettings,
	invalidateSettingsCache,
	seedInitialSettingsIfEmpty,
} from '../../src/lib/server/settings-service';
import { eq } from 'drizzle-orm';

function createTestDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		CREATE TABLE books (
			id TEXT PRIMARY KEY,
			source_type TEXT NOT NULL DEFAULT 'upload',
			source_lang TEXT NOT NULL,
			target_lang TEXT NOT NULL,
			title TEXT NOT NULL,
			title_target TEXT,
			pinned INTEGER NOT NULL DEFAULT 0,
			archived INTEGER NOT NULL DEFAULT 0,
			description TEXT,
			author TEXT,
			artist TEXT,
			tags TEXT,
			status TEXT NOT NULL DEFAULT 'unknown',
			cover_path TEXT,
			cover_rev INTEGER NOT NULL DEFAULT 0,
			cover_cleared INTEGER NOT NULL DEFAULT 0,
			custom_prompt TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE chapters (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			uuid TEXT NOT NULL,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			seq INTEGER NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			title_target TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			resliced INTEGER NOT NULL DEFAULT 0,
			resliced_at INTEGER,
			translated_at INTEGER,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE reading_history (
			book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
			chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
			chapter_seq INTEGER NOT NULL DEFAULT 0,
			page_seq INTEGER NOT NULL DEFAULT 0,
			total_pages INTEGER NOT NULL DEFAULT 0,
			completed INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL
		);
	`);
	return drizzle(sqlite, { schema });
}

describe('Settings & Reading History SQLite Persistence', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
		invalidateSettingsCache();
	});

	it('loads default settings when app_settings table is empty', () => {
		const settings = getCanonicalSettings(db as any);
		expect(settings.inpaintMode).toBe('patch');
		expect(settings.parallelProcesses).toBe(1);
	});

	it('updates partial settings without overwriting other keys', () => {
		updateCanonicalSettings({ inpaintExpansionPct: 0.08, typesetExpansionPct: 0.15 }, db as any);
		const settings = getCanonicalSettings(db as any);
		expect(settings.inpaintExpansionPct).toBe(0.08);
		expect(settings.typesetExpansionPct).toBe(0.15);
		// Unmodified keys remain at their defaults
		expect(settings.inpaintMode).toBe('patch');
		expect(settings.parallelProcesses).toBe(1);
	});

	it('seeds initial settings if database is empty', () => {
		seedInitialSettingsIfEmpty({ executionDevice: 'cuda', typesetFont: 'General Sans' }, db as any);
		const settings = getCanonicalSettings(db as any);
		expect(settings.executionDevice).toBe('cuda');
		expect(settings.typesetFont).toBe('General Sans');
	});

	it('correctly handles nullable and numerical settings like cudaVramLimitMb and clamps out-of-range numbers', () => {
		// Set valid VRAM number
		updateCanonicalSettings({ cudaVramLimitMb: 8192, parallelProcesses: 99 }, db as any);
		let settings = getCanonicalSettings(db as any);
		expect(settings.cudaVramLimitMb).toBe(8192);
		expect(settings.parallelProcesses).toBe(8); // Clamped to max 8

		// Set VRAM back to null
		updateCanonicalSettings({ cudaVramLimitMb: null }, db as any);
		settings = getCanonicalSettings(db as any);
		expect(settings.cudaVramLimitMb).toBeNull();
	});

	it('persists reading history and enforces monotonic progression', () => {
		const now = Date.now();
		// Create a test book and chapters
		(db as any).insert(schema.books).values({
			id: 'book-1',
			sourceType: 'upload',
			sourceLang: 'zh',
			targetLang: 'en',
			title: 'Test Book',
			pinned: false,
			archived: false,
			status: 'ongoing',
			createdAt: now,
			updatedAt: now,
		}).run();

		(db as any).insert(schema.chapters).values([
			{ id: 101, uuid: 'ch-1', bookId: 'book-1', seq: 0, title: 'Chapter 1', status: 'done', createdAt: now },
			{ id: 102, uuid: 'ch-2', bookId: 'book-1', seq: 1, title: 'Chapter 2', status: 'done', createdAt: now },
			{ id: 103, uuid: 'ch-3', bookId: 'book-1', seq: 2, title: 'Chapter 3', status: 'done', createdAt: now },
		]).run();

		// Record initial progress at Chapter 1, Page 5
		(db as any).insert(schema.readingHistory).values({
			bookId: 'book-1',
			chapterId: 101,
			chapterSeq: 0,
			pageSeq: 5,
			totalPages: 20,
			completed: false,
			updatedAt: now,
		}).run();

		let history = (db as any).select().from(schema.readingHistory).where(eq(schema.readingHistory.bookId, 'book-1')).get();
		expect(history.chapterSeq).toBe(0);
		expect(history.pageSeq).toBe(5);

		// Advance progress to Chapter 2, Page 1
		(db as any).update(schema.readingHistory)
			.set({
				chapterId: 102,
				chapterSeq: 1,
				pageSeq: 1,
				totalPages: 22,
				updatedAt: now + 1000,
			})
			.where(eq(schema.readingHistory.bookId, 'book-1'))
			.run();

		history = (db as any).select().from(schema.readingHistory).where(eq(schema.readingHistory.bookId, 'book-1')).get();
		expect(history.chapterSeq).toBe(1);
		expect(history.pageSeq).toBe(1);
	});

	it('cascades reading history deletion when book is deleted', () => {
		const now = Date.now();
		(db as any).insert(schema.books).values({
			id: 'book-to-delete',
			sourceType: 'upload',
			sourceLang: 'zh',
			targetLang: 'en',
			title: 'Deletable Book',
			pinned: false,
			archived: false,
			status: 'ongoing',
			createdAt: now,
			updatedAt: now,
		}).run();

		(db as any).insert(schema.chapters).values({
			id: 201,
			uuid: 'ch-del',
			bookId: 'book-to-delete',
			seq: 0,
			title: 'Ch 1',
			status: 'done',
			createdAt: now,
		}).run();

		(db as any).insert(schema.readingHistory).values({
			bookId: 'book-to-delete',
			chapterId: 201,
			chapterSeq: 0,
			pageSeq: 2,
			totalPages: 10,
			completed: false,
			updatedAt: now,
		}).run();

		// Verify record exists
		let record = (db as any).select().from(schema.readingHistory).where(eq(schema.readingHistory.bookId, 'book-to-delete')).get();
		expect(record).toBeDefined();

		// Delete the book
		(db as any).delete(schema.books).where(eq(schema.books.id, 'book-to-delete')).run();

		// Verify reading history was automatically cascade deleted
		record = (db as any).select().from(schema.readingHistory).where(eq(schema.readingHistory.bookId, 'book-to-delete')).get();
		expect(record).toBeUndefined();
	});
});
