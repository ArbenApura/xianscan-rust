// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
// IMPORTED DEP-MODULES
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// IMPORTED MODULES
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

// -- TYPES -- //

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
	var __mtSqlite: Database.Database | undefined;
	var __mtDb: DrizzleDb | undefined;
}

// -- CONSTANTS -- //

const DB_PATH = env.DATABASE_PATH ?? './data/xianscan.db';

// WHERE THE GENERATED MIGRATION FILES LIVE (web/drizzle). DEV AND PROD RUN WITH cwd = web/, SO RESOLVE FROM cwd FIRST.
const MIGRATIONS_DIR = existsSync(resolve('drizzle'))
	? resolve('drizzle')
	: fileURLToPath(new URL('../../../drizzle', import.meta.url));

// -- FUNCTIONS -- //

// CREATE A DRIZZLE INSTANCE OVER A FRESH better-sqlite3 CONNECTION. TESTS PASS ':memory:' (THE FACTORY KEEPS APP AND TEST HARNESS ON THE EXACT SAME DRIVER).
export function createDb(path: string) {
	// better-sqlite3 WILL NOT CREATE MISSING DIRECTORIES, ENSURE DATA DIR EXISTS FIRST
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { timeout: 30000 });
	// WAL ALLOWS CONCURRENT READERS (AND SURVIVES PROCESS KILLS)
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 30000');
	sqlite.pragma('synchronous = NORMAL');
	return drizzle(sqlite, { schema });
}

function runMigrationsAndSafeguards(sqlite: Database.Database) {
	// ALIGN DRIZZLE MIGRATION JOURNAL IF EXISTING DATABASE ALREADY CONTAINS THE RECENT TABLES OR COLUMNS
	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				hash text NOT NULL,
				created_at numeric
			);
		`);

		const ensureMigrationRecorded = (hash: string, createdAt: number) => {
			const rows = sqlite.prepare('SELECT created_at FROM `__drizzle_migrations` WHERE created_at = ?').all(createdAt);
			if (rows.length === 0) {
				sqlite.prepare('INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)').run(hash, createdAt);
			}
		};

		const pageCols = sqlite.pragma('table_info(pages)') as Array<{ name: string }>;
		const regionCols = sqlite.pragma('table_info(regions)') as Array<{ name: string }>;
		const appSettingsCols = sqlite.pragma('table_info(app_settings)') as Array<{ name: string }>;

		if (pageCols?.some((c) => c.name === 'panels')) {
			ensureMigrationRecorded('0009_gorgeous_supreme_intelligence', 1787373660572);
		}
		if (regionCols?.some((c) => c.name === 'inpaint_box')) {
			ensureMigrationRecorded('0011_whole_james_howlett', 1787420901390);
		}
		if (appSettingsCols && appSettingsCols.length > 0) {
			ensureMigrationRecorded('0012_amused_joystick', 1787702303942);
		}
	} catch {
		// IGNORE CHECK ON UNINITIALIZED DATABASE
	}

	try {
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
	} catch (err) {
		console.warn('[db] auto-migration warning', err);
	}

	// ENSURE RECENT TABLES EXIST ON ANY PRE-MIGRATION LEGACY DATABASES
	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS app_settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
	} catch {
		// TABLE ALREADY EXISTS
	}

	try {
		sqlite.exec(`
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
			CREATE INDEX IF NOT EXISTS reading_history_chapter_idx ON reading_history(chapter_id);
		`);
	} catch {
		// TABLE ALREADY EXISTS
	}

	// ENSURE RECENT COLUMNS EXIST ON ANY PRE-MIGRATION LEGACY DATABASES
	try { sqlite.exec(`ALTER TABLE pages ADD COLUMN panels TEXT;`); } catch {}
	try { sqlite.exec(`ALTER TABLE pages ADD COLUMN onomatopoeia TEXT;`); } catch {}
	try { sqlite.exec(`ALTER TABLE pages ADD COLUMN llm_prompt TEXT;`); } catch {}
	try { sqlite.exec(`ALTER TABLE pages ADD COLUMN llm_response TEXT;`); } catch {}
	try { sqlite.exec(`ALTER TABLE chapters ADD COLUMN resliced INTEGER NOT NULL DEFAULT 0;`); } catch {}
	try { sqlite.exec(`ALTER TABLE chapters ADD COLUMN resliced_at INTEGER;`); } catch {}
	try { sqlite.exec(`ALTER TABLE books ADD COLUMN custom_prompt TEXT;`); } catch {}

	// AUTO-SYNC CHAPTER STATUSES FOR CHAPTERS WHOSE PAGES HAVE FINISHED TRANSLATING
	try {
		sqlite.exec(`
			UPDATE pages SET status = 'pending', error = NULL WHERE status = 'processing';
			UPDATE chapters SET status = 'pending' WHERE status = 'processing';
		`);

		sqlite.exec(`
			UPDATE chapters 
			SET status = 'done' 
			WHERE status != 'done' 
			  AND id IN (
				SELECT chapter_id 
				FROM pages 
				GROUP BY chapter_id 
				HAVING count(*) > 0 
				   AND count(*) = sum(CASE WHEN status = 'done' OR output_path IS NOT NULL THEN 1 ELSE 0 END)
			  );
		`);
	} catch {
		// IGNORE IF ERROR
	}
}

function initSqlite(): Database.Database {
	if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
	const sqlite = new Database(DB_PATH, { timeout: 30000 });
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 30000');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('cache_size = -32000');

	runMigrationsAndSafeguards(sqlite);
	return sqlite;
}

// SAFE SHUTDOWN HOOK REGISTERED ONLY ON ACTUAL PROCESS TERMINATION ('exit')
let hasRegisteredExitHook = false;
function registerExitHook() {
	if (hasRegisteredExitHook) return;
	hasRegisteredExitHook = true;
	process.once('exit', () => {
		try {
			if (globalThis.__mtSqlite && globalThis.__mtSqlite.open) {
				globalThis.__mtSqlite.pragma('wal_checkpoint(TRUNCATE)');
				globalThis.__mtSqlite.close();
			}
		} catch {
			// IGNORE
		}
	});
}

// GET OR AUTO-RECONNECT SINGLETON DRIZZLE DATABASE
export function getDb(): DrizzleDb {
	if (!globalThis.__mtSqlite || !globalThis.__mtSqlite.open || !globalThis.__mtDb) {
		const sqlite = initSqlite();
		globalThis.__mtSqlite = sqlite;
		globalThis.__mtDb = drizzle(sqlite, { schema });
		registerExitHook();
	}
	return globalThis.__mtDb;
}

// SELF-HEALING DRIZZLE INSTANCE PROXY
// AUTOMATICALLY RECONNECTS IF CONNECTION WAS CLOSED DUE TO HMR RELOADS OR SIGNALS
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
	get(_target, prop, receiver) {
		const instance = getDb();
		const value = Reflect.get(instance, prop, receiver);
		return typeof value === 'function' ? value.bind(instance) : value;
	},
});

export { schema };
