// CRASH-SAFE FILE WRITES: THE TARGET PATH ALWAYS HOLDS EITHER THE OLD BYTES OR THE NEW ONES, NEVER A TRUNCATED MIX.
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

/** WRITES TO A SIBLING TEMP FILE, THEN RENAMES IT OVER `path` (A REPLACING MOVE ON WINDOWS TOO). */
export function writeFileAtomic(path: string, data: Buffer | Uint8Array): void {
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	try {
		writeFileSync(tmp, data);
		renameSync(tmp, path);
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {
			// NEVER CREATED OR ALREADY MOVED
		}
		throw e;
	}
}
