// STANDALONE MIGRATION RUNNER — `npm run db:migrate`. RUNS OUTSIDE SvelteKit ($env/dynamic/private IS
// NOT AVAILABLE IN A PLAIN node SCRIPT), SO IT READS process.env DIRECTLY (--env-file-if-exists=.env).
// IMPORTANT: node --experimental-strip-types (DEFAULT ON IN NODE 24) RUNS THIS .ts FILE DIRECTLY.

// IMPORTED DEP-MODULES
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// IMPORTED MODULES
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// -- CONSTANTS -- //

const DB_PATH = process.env.DATABASE_PATH ?? './data/xianscan.db';

// -- LIFECYCLES -- //

// better-sqlite3 WILL NOT CREATE MISSING DIRECTORIES — ENSURE THE DATA DIR EXISTS FIRST.
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: 'drizzle' });

console.log(`[db:migrate] applied migrations to ${DB_PATH}`);

sqlite.close();
