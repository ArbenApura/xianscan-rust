// COPY THE SHOWCASE IMAGES FROM THE SINGLE SOURCE (../docs/showcase, WHICH THE ROOT README LINKS) INTO static/showcase
// BEFORE dev AND build (FEAT-008 PHASE 10). THE COPIES ARE GIT-IGNORED; THE DEMO VIDEO STAYS WHERE IT IS.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'docs', 'showcase');
const target = join(here, '..', 'static', 'showcase');

if (!existsSync(source)) {
	console.error(`sync-showcase: source folder missing: ${source}`);
	process.exit(1);
}
mkdirSync(target, { recursive: true });
let copied = 0;
for (const name of readdirSync(source)) {
	cpSync(join(source, name), join(target, name), { recursive: true });
	copied++;
}
console.log(`sync-showcase: ${copied} file(s) copied into static/showcase`);
