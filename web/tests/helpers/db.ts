// IN-MEMORY SQLITE TEST HELPER — THE pg-mem ANALOG FOR THIS APP (better-sqlite3 ':memory:' + REAL
// DRIZZLE, SO THE TESTS RUN THE EXACT SAME DRIVER/MIGRATIONS AS PRODUCTION).
//
// USAGE PATTERN (MIRRORS xianslate):
//   vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
//   beforeEach(async () => { const db = getTestDb(); await resetDb(); ... seed ... });

// IMPORTED DEP-MODULES
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// IMPORTED MODULES
import { fileURLToPath } from 'node:url';
import * as schema from '$lib/server/db/schema';

// -- TYPES -- //

export type TestRawDb = Database.Database;

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

interface TestState {
	raw: TestRawDb;
	db: TestDb;
}

declare global {
	var __mtTestDb: TestState | undefined;
}

// -- CONSTANTS -- //

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

// -- FUNCTIONS -- //

// ONE STATE PER TEST PROCESS (fileParallelism:false KEEPS FILES ISOLATED) — globalThis SO vi.resetModules()
// NEVER LOSES THE CONNECTION MID-SUITE.
export function getTestDb(): TestDb {
	const state = globalThis.__mtTestDb ?? (globalThis.__mtTestDb = createTestState());
	return state.db;
}

export function getRawDb(): TestRawDb {
	const state = globalThis.__mtTestDb ?? (globalThis.__mtTestDb = createTestState());
	return state.raw;
}

function createTestState(): TestState {
	const raw = new Database(':memory:', { timeout: 30000 });
	raw.pragma('journal_mode = WAL');
	raw.pragma('foreign_keys = ON');
	raw.pragma('busy_timeout = 30000');
	raw.pragma('synchronous = NORMAL');
	const db = drizzle(raw, { schema });
	return { raw, db };
}

// DROP EVERYTHING (INCLUDING THE MIGRATION JOURNAL) AND RE-RUN THE REAL MIGRATIONS — PRISTINE STATE,
// FRESH AUTOINCREMENT COUNTERS, EXACTLY WHAT `npm run db:migrate` PRODUCES.
export function resetDb(): void {
	const state = globalThis.__mtTestDb ?? (globalThis.__mtTestDb = createTestState());
	state.raw.pragma('foreign_keys = OFF');
	const tables = [
		'reading_history',
		'app_settings',
		'ai_providers',
		'ai_usage',
		'translations',
		'regions',
		'pages',
		'glossary',
		'chapters',
		'books',
	];
	state.raw.exec(
		`DROP TABLE IF EXISTS __drizzle_migrations; ${tables.map((t) => `DROP TABLE IF EXISTS \`${t}\`;`).join(' ')}`,
	);
	try {
		migrate(state.db, { migrationsFolder: MIGRATIONS_DIR });
	} catch (e) {
		console.error('[test-db] Migration error:', e);
	}
	state.raw.exec(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS reading_history (
			book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
			chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
			chapter_seq INTEGER NOT NULL DEFAULT 0,
			page_seq INTEGER NOT NULL DEFAULT 0,
			total_pages INTEGER NOT NULL DEFAULT 0,
			completed INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS reading_history_updated_idx ON reading_history(updated_at);
	`);
	try {
		state.raw.exec(`ALTER TABLE chapters ADD COLUMN resliced INTEGER NOT NULL DEFAULT 0;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE chapters ADD COLUMN resliced_at INTEGER;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE pages ADD COLUMN panels TEXT;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE pages ADD COLUMN onomatopoeia TEXT;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE pages ADD COLUMN llm_prompt TEXT;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE pages ADD COLUMN llm_response TEXT;`);
	} catch {}
	try {
		state.raw.exec(`ALTER TABLE books ADD COLUMN custom_prompt TEXT;`);
	} catch {}
	state.raw.pragma('foreign_keys = ON');
}

// -- SEEDS -- //

export function seedBook(
	db: TestDb,
	input: {
		id: string;
		title?: string;
		sourceLang?: string;
		targetLang?: string;
		pinned?: boolean;
		archived?: boolean;
		customPrompt?: string;
	},
) {
	return db
		.insert(schema.books)
		.values({
			id: input.id,
			title: input.title ?? 'Test Book',
			sourceLang: input.sourceLang ?? 'zh-Hans',
			targetLang: input.targetLang ?? 'en',
			pinned: input.pinned ?? false,
			archived: input.archived ?? false,
			customPrompt: input.customPrompt ?? undefined,
		})
		.returning()
		.get();
}

export function seedChapter(db: TestDb, input: { bookId: string; seq: number; title?: string }) {
	return db
		.insert(schema.chapters)
		.values({ bookId: input.bookId, seq: input.seq, title: input.title ?? '' })
		.returning()
		.get();
}

export function seedPage(
	db: TestDb,
	input: {
		chapterId: number;
		seq: number;
		filePath?: string;
		cleanedPath?: string;
		outputPath?: string;
		cleanedRev?: number;
		outputRev?: number;
		originalRev?: number;
	},
) {
	return db
		.insert(schema.pages)
		.values({
			chapterId: input.chapterId,
			seq: input.seq,
			filePath: input.filePath ?? `uploads/c${input.chapterId}/p${input.seq}.png`,
			cleanedPath: input.cleanedPath ?? undefined,
			outputPath: input.outputPath ?? undefined,
			cleanedRev: input.cleanedRev ?? 0,
			outputRev: input.outputRev ?? 0,
			originalRev: input.originalRev ?? 0,
		})
		.returning()
		.get();
}

export function seedRegion(
	db: TestDb,
	input: { pageId: number; seq: number; box?: string; textSource?: string; textTarget?: string },
) {
	return db
		.insert(schema.regions)
		.values({
			pageId: input.pageId,
			seq: input.seq,
			box: input.box ?? JSON.stringify({ x: 10, y: 10, w: 100, h: 50 }),
			textSource: input.textSource ?? '',
			textTarget: input.textTarget ?? undefined,
		})
		.returning()
		.get();
}

export function seedGlossary(
	db: TestDb,
	input: {
		scope: 'global' | 'book';
		bookId?: string;
		sourceLang?: string;
		targetLang?: string;
		source: string;
		target: string;
		gender?: 'neuter' | 'masculine' | 'feminine';
		category?: string;
		context?: string;
		tags?: string;
		pinned?: boolean;
		status?: 'ai' | 'user';
		aliases?: string[];
		firstChapterId?: number;
	},
) {
	return db
		.insert(schema.glossary)
		.values({
			scope: input.scope,
			bookId: input.bookId,
			sourceLang: input.sourceLang ?? 'zh-Hans',
			targetLang: input.targetLang ?? 'en',
			source: input.source,
			target: input.target,
			gender: input.gender ?? 'neuter',
			category: input.category,
			context: input.context,
			tags: input.tags,
			pinned: input.pinned ?? false,
			status: input.status ?? 'user',
			aliases: input.aliases ? JSON.stringify(input.aliases) : undefined,
			firstChapterId: input.firstChapterId,
		})
		.returning()
		.get();
}

export function seedTranslation(
	db: TestDb,
	input: { pageId: number; cacheKey: string; contentTarget: string; model?: string },
) {
	return db
		.insert(schema.translations)
		.values({
			pageId: input.pageId,
			cacheKey: input.cacheKey,
			contentTarget: input.contentTarget,
			model: input.model ?? 'deepseek-v4-flash',
		})
		.returning()
		.get();
}
