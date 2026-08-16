// STANDALONE MIGRATION RUNNER — `npm run db:migrate`. RUNS OUTSIDE SvelteKit ($env/dynamic/private IS
// NOT AVAILABLE IN A PLAIN node SCRIPT), SO IT READS process.env DIRECTLY (--env-file-if-exists=.env).

// IMPORTED DEP-MODULES
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// IMPORTED MODULES
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

function getDbPath(): string {
	if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
	let root = process.env.DATA_ROOT;
	if (!root) {
		const home = homedir();
		if (process.platform === 'win32') {
			const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
			root = join(appData, 'XianScan', 'data');
		} else if (process.platform === 'darwin') {
			root = join(home, 'Library', 'Application Support', 'XianScan', 'data');
		} else {
			const xdgData = process.env.XDG_DATA_HOME;
			root = join(xdgData || join(home, '.local', 'share'), 'xianscan', 'data');
		}
	}

	const properDb = join(root, 'xianscan.db');
	const legacyDb = join(root, 'manua.db');

	// Auto-migrate legacy manua.db to xianscan.db if present
	if (!existsSync(properDb) && existsSync(legacyDb)) {
		try {
			renameSync(legacyDb, properDb);
			if (existsSync(`${legacyDb}-wal`)) renameSync(`${legacyDb}-wal`, `${properDb}-wal`);
			if (existsSync(`${legacyDb}-shm`)) renameSync(`${legacyDb}-shm`, `${properDb}-shm`);
		} catch {
			return legacyDb;
		}
	}

	return properDb;
}

// -- CONSTANTS -- //

const DB_PATH = getDbPath();

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
