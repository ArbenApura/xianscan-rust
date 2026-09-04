// TDD BASELINE — PROVES THE IN-MEMORY SQLITE HELPER + THE SCHEMA CONSTRAINTS (FK CASCADE, PARTIAL UNIQUE
// GLOSSARY INDEXES, AUTOINCREMENT) WORK EXACTLY AS THE APP RELIES ON THEM. EVERY LATER SUITE STANDS ON
// THIS FOUNDATION.

// IMPORTED DEP-MODULES
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// IMPORTED MODULES
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, runMigrationsAndSafeguards } from '$lib/server/db';
import { books, chapters, pages, regions } from '$lib/server/db/schema';
import Database from 'better-sqlite3';
import { getTestDb, resetDb, seedBook, seedChapter, seedGlossary, seedPage, seedRegion, type TestDb } from '../helpers/db';

// -- CONSTANTS -- //

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
});

describe('db helper roundtrip', () => {
	it('seeds and reads back a book → chapter → page → region chain', () => {
		seedBook(db, { id: 'b1', title: '星尘' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0, title: '第一章' });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const region = seedRegion(db, { pageId: page.id, seq: 0, textSource: '你好世界' });

		const gotBook = db.select().from(books).where(eq(books.id, 'b1')).get();
		const gotRegion = db.select().from(regions).where(eq(regions.id, region.id)).get();

		expect(gotBook?.title).toBe('星尘');
		expect(gotBook?.sourceLang).toBe('zh-Hans');
		expect(gotBook?.targetLang).toBe('en');
		expect(gotRegion?.textSource).toBe('你好世界');
		expect(JSON.parse(gotRegion!.box)).toEqual({ x: 10, y: 10, w: 100, h: 50 });
	});

	it('resetDb returns to a pristine state (fresh autoincrement counters)', () => {
		seedBook(db, { id: 'b1' });
		const c1 = seedChapter(db, { bookId: 'b1', seq: 0 });
		expect(c1.id).toBe(1);

		resetDb();
		seedBook(db, { id: 'b1' });
		const c2 = seedChapter(db, { bookId: 'b1', seq: 0 });
		expect(c2.id).toBe(1);
	});

	it('createDb(:memory:) works standalone (the app factory + real migrations)', () => {
		const standalone = createDb(':memory:');
		// THE APP BOOTSTRAPS A FRESH DB VIA THE SAME MIGRATIONS (src/lib/server/db/migrate.ts)
		migrate(standalone, { migrationsFolder: MIGRATIONS_DIR });
		standalone.insert(books).values({ id: 'b2', sourceLang: 'zh-Hans', targetLang: 'en', title: 'Solo' }).run();
		const got = standalone.select().from(books).where(eq(books.id, 'b2')).get();
		expect(got?.title).toBe('Solo');
	});

	it('aligns migration journal when custom_prompt column already exists in legacy database', () => {
		const sqlite = new Database(':memory:');
		// SIMULATE LEGACY DATABASE WITH CUSTOM_PROMPT ALREADY PRESENT
		sqlite.exec(`
			CREATE TABLE books (
				id text PRIMARY KEY NOT NULL,
				title text NOT NULL,
				source_lang text NOT NULL,
				target_lang text NOT NULL,
				custom_prompt text
			);
		`);
		// RUNNING RUNMIGRATIONSANDSAFEGUARDS ALIGNS __DRIZZLE_MIGRATIONS WITHOUT ERROR
		runMigrationsAndSafeguards(sqlite);
		const rows = sqlite.prepare('SELECT created_at FROM `__drizzle_migrations` WHERE created_at = ?').all(1788510316624);
		expect(rows.length).toBe(1);
	});
});

describe('schema constraints', () => {
	it('cascades deletes book → chapter → page → region', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });
		seedRegion(db, { pageId: page.id, seq: 0 });

		db.delete(books).where(eq(books.id, 'b1')).run();

		expect(db.select().from(chapters).all()).toHaveLength(0);
		expect(db.select().from(pages).all()).toHaveLength(0);
		expect(db.select().from(regions).all()).toHaveLength(0);
	});

	it('enforces the partial unique index on global glossary terms per language pair', () => {
		seedGlossary(db, { scope: 'global', source: '系统', target: 'System' });
		// SAME TERM, SAME PAIR → CONFLICT
		expect(() => seedGlossary(db, { scope: 'global', source: '系统', target: 'System' })).toThrow();
		// SAME TERM, DIFFERENT PAIR → ALLOWED
		seedGlossary(db, { scope: 'global', source: '系统', target: 'Système', targetLang: 'fr' });
		// SAME TERM, BOOK SCOPE → ALLOWED (THE PARTIAL INDEX IS scope-SCOPED)
		seedBook(db, { id: 'b1' });
		seedGlossary(db, { scope: 'book', bookId: 'b1', source: '系统', target: 'System' });
	});

	it('enforces the partial unique index on book-scope terms per book', () => {
		seedBook(db, { id: 'b1' });
		seedBook(db, { id: 'b2' });
		seedGlossary(db, { scope: 'book', bookId: 'b1', source: '主角', target: 'Protagonist' });
		expect(() => seedGlossary(db, { scope: 'book', bookId: 'b1', source: '主角', target: 'MC' })).toThrow();
		// SAME TERM IN ANOTHER BOOK IS FINE
		seedGlossary(db, { scope: 'book', bookId: 'b2', source: '主角', target: 'Protagonist' });
	});

	it('rejects a book-scope term without a bookId (FK enforced)', () => {
		expect(() => seedGlossary(db, { scope: 'book', source: '孤', target: 'Lonely' })).toThrow();
	});
});
