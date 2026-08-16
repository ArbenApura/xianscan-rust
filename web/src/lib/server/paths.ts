// APP DATA ROOT — WHERE UPLOADS / CLEANED / OUTPUT IMAGES AND THE SQLITE DB LIVE.
// PERMANENTLY RESOLVES TO THE OS APPDATA DIRECTORY (MATCHING RUST'S get_data_dir()).
// OVERRIDE WITH DATA_ROOT IN .env ONLY IF SPECIFICALLY CONFIGURED.
import { existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';

export function resolveAppDataRoot(): string {
	if (env.DATA_ROOT) return env.DATA_ROOT;

	const platform = process.platform;
	const home = homedir();

	if (platform === 'win32') {
		const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
		return join(appData, 'XianScan', 'data');
	}

	if (platform === 'darwin') {
		return join(home, 'Library', 'Application Support', 'XianScan', 'data');
	}

	const xdgData = process.env.XDG_DATA_HOME;
	if (xdgData) {
		return join(xdgData, 'xianscan', 'data');
	}
	return join(home, '.local', 'share', 'xianscan', 'data');
}

export const DATA_ROOT = resolveAppDataRoot();

export function resolveDatabasePath(): string {
	if (env.DATABASE_PATH) return env.DATABASE_PATH;
	const properDb = join(DATA_ROOT, 'xianscan.db');
	const legacyDb = join(DATA_ROOT, 'manua.db');

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
