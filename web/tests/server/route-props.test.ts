// ROUTE-PARAM BINDING CONSISTENCY — REGRESSION GUARD FOR THE "Could not load the book." BUG.
//
// VERIFIED IN SvelteKit 2.8 SOURCE (runtime/client/client.js): PAGE COMPONENTS ONLY RECEIVE
// `data`, `form`, AND THE `page` PROP — ROUTE PARAMS ARE **NOT** PASSED AS PROPS. `export let id`
// FOR A [id] SEGMENT IS SILENTLY UNDEFINED AND EVERY FETCH BECOMES `/api/…/undefined` (404).
// THE ONLY CORRECT BINDING IS `$page.params.<segment>` (FROM $app/stores).
//
// THIS TEST WALKS EVERY [segment] ROUTE DIR WITH A +page.svelte AND REQUIRES THAT BINDING.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROUTES = join(process.cwd(), 'src', 'routes');

interface SegmentUse {
	dir: string;
	segment: string;
	hasParamsUse: boolean;
}

function collectSegments(dir: string, out: SegmentUse[]): SegmentUse[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (!statSync(path).isDirectory()) continue;
		// A [segment] DIRECTORY — CHECK ITS OWN +page.svelte (SKIP PURE-API ROUTES), THEN RECURSE DEEPER
		if (entry.startsWith('[') && entry.endsWith(']')) {
			const segment = entry.slice(1, -1);
			const page = join(path, '+page.svelte');
			if (existsSync(page)) {
				const source = readFileSync(page, 'utf-8');
				out.push({
					dir: relative(ROUTES, path),
					segment,
					hasParamsUse: new RegExp(`\\$page\\.params\\.${segment}\\b`).test(source),
				});
			}
		}
		collectSegments(path, out);
	}
	return out;
}

describe('route param bindings', () => {
	const segments = collectSegments(ROUTES, []);

	it('found at least one dynamic segment (the guard is actually exercising something)', () => {
		expect(segments.length).toBeGreaterThan(0);
	});

	it.each(segments.map((s) => [s.dir, s] as const))(
		'%s: the [%s] param is bound via $page.params.%s',
		(_dir, s) => {
			// WITHOUT THE BINDING THE PAGE FETCHES `/api/…/undefined` → 404 → "Could not load the book."
			expect(s.hasParamsUse).toBe(true);
		},
	);
});
