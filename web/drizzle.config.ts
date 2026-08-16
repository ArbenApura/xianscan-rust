import { defineConfig } from 'drizzle-kit';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
	return join(root, 'xianscan.db');
}

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: getDbPath(),
	},
});
