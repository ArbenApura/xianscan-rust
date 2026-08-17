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
import { resolveDatabasePath } from '../paths';
import * as schema from './schema';

// -- TYPES -- //

declare global {
	var __mtSqlite: Database.Database | undefined;
}

// CREATE A DRIZZLE INSTANCE OVER A FRESH better-sqlite3 CONNECTION. TESTS PASS ':memory:' — THE
// FACTORY KEEPS THE APP AND THE TEST HARNESS ON THE EXACT SAME DRIVER/SETUP.
export function createDb(path: string) {
	// better-sqlite3 WILL NOT CREATE MISSING DIRECTORIES — ENSURE THE DATA DIR EXISTS FIRST.
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { timeout: 30000 });
	// WAL ALLOWS CONCURRENT READERS (AND SURVIVES PROCESS KILLS); :memory: IGNORES IT GRACEFULLY.
	sqlite.pragma('journal_mode = WAL');
	// SQLITE DOES NOT ENFORCE FKs BY DEFAULT — CASCADE/SET-NULL BEHAVIOUR DEPENDS ON THIS.
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 30000');
	sqlite.pragma('synchronous = NORMAL');
	return drizzle(sqlite, { schema });
}

// -- CONSTANTS -- //

const DB_PATH = resolveDatabasePath();

// WHERE THE GENERATED MIGRATION FILES LIVE (web/drizzle). DEV (VITE) AND PROD (`node build`) BOTH RUN WITH
// cwd = web/, SO RESOLVE FROM cwd FIRST; THE import.meta.url FALLBACK COVERS A BUNDLED SERVER STARTED
// ELSEWHERE (RELATIVE TO THE SOURCE TREE, WHICH ONLY EXISTS IN DEV).
const MIGRATIONS_DIR = existsSync(resolve('drizzle'))
	? resolve('drizzle')
	: fileURLToPath(new URL('../../../drizzle', import.meta.url));

// SINGLETON CONNECTION — REUSED ACROSS REQUESTS / HMR RELOADS. better-sqlite3 IS LAZY-FREE (NO POOL).
// better-sqlite3 WILL NOT CREATE MISSING DIRECTORIES — ENSURE THE DATA DIR EXISTS BEFORE OPENING.
if (!globalThis.__mtSqlite) {
	if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
	const sqlite = new Database(DB_PATH, { timeout: 30000 });
	globalThis.__mtSqlite = sqlite;
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 30000');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('cache_size = -32000');
	sqlite.pragma('wal_autocheckpoint = 1000');
	// SELF-HOSTED FRIENDLINESS: RUN PENDING MIGRATIONS AT BOOT SO `npm run dev` / `npm run start` WORK ON
	// A FRESH CLONE WITHOUT A MANUAL `npm run db:migrate` STEP (migrate RUNS ONLY PENDING ONES — THE
	migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });

	// AUTO-SYNC CHAPTER STATUSES FOR CHAPTERS WHOSE PAGES HAVE FINISHED TRANSLATING
	try {
		// Reset any orphan in-flight rows from prior server crashes/restarts
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
		// ignore
	}

	// CLEAN DB CHECKPOINT AND SHUTDOWN HOOK
	const closeHandler = () => {
		try {
			if (globalThis.__mtSqlite && globalThis.__mtSqlite.open) {
				globalThis.__mtSqlite.pragma('wal_checkpoint(TRUNCATE)');
				globalThis.__mtSqlite.close();
			}
		} catch {
			// ignore
		}
	};
	process.once('SIGINT', closeHandler);
	process.once('SIGTERM', closeHandler);
	process.once('beforeExit', closeHandler);
}
const sqlite = globalThis.__mtSqlite!;

export const db = drizzle(sqlite, { schema });

export { schema };

