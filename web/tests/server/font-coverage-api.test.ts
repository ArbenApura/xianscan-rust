// GET /api/system/fonts/coverage (FEAT-006 PHASE 9)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { resetDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { invalidateSettingsCache, updateCanonicalSettings } from '$lib/server/settings-service';
import { GET } from '../../src/routes/api/system/fonts/coverage/+server';

const call = async (qs: string) => (await GET({ url: new URL(`http://localhost/api/system/fonts/coverage${qs}`) } as unknown as RequestEvent)).json();

beforeEach(() => {
	resetDb();
	invalidateSettingsCache();
});

describe('font coverage endpoint', () => {
	it('Devanagari is covered with the bundled fonts registered', async () => {
		const data = await call('?script=devanagari');
		expect(data.covered).toBe(true);
		expect(data.chain[0]).toBe('Noto Sans Devanagari');
		expect(data.source).toBe('bundled');
	});

	it('reports whether a given font covers the script', async () => {
		expect((await call('?script=thai&font=General%20Sans')).fontCovers).toBe(false);
		expect((await call('?script=thai&font=Noto%20Sans%20Thai')).fontCovers).toBe(true);
	});

	it('lists every slot without a script parameter', async () => {
		const data = await call('');
		expect(data.scripts.map((s: { script: string }) => s.script)).toContain('arabic');
		expect(data.scripts.find((s: { script: string }) => s.script === 'arabic').covered).toBe(true);
	});

	it('a han slot set back to Automatic stays automatic with a legacy CJK font stored', async () => {
		// A BUNDLED FAMILY, SO THE CHECK DOES NOT DEPEND ON WHAT THE MACHINE HAS INSTALLED
		updateCanonicalSettings({ typesetCjkFont: 'Poppins', typesetScriptFonts: {} });
		invalidateSettingsCache();
		const data = await call('?script=han');
		expect(data.source).not.toBe('user');
		expect(data.chain[0]).not.toBe('Poppins');
		// SANITY: THE SAME FAMILY CHOSEN EXPLICITLY DOES LEAD THE CHAIN
		const explicit = await call(`?script=han&scriptFonts=${encodeURIComponent(JSON.stringify({ han: 'Poppins' }))}`);
		expect(explicit.chain[0]).toBe('Poppins');
	});

	it('uses the pending scriptFonts / dialogue overrides instead of the saved settings', async () => {
		updateCanonicalSettings({ typesetScriptFonts: {} });
		invalidateSettingsCache();
		const qs = `?script=devanagari&scriptFonts=${encodeURIComponent(JSON.stringify({ devanagari: 'Poppins' }))}`;
		const data = await call(qs);
		expect(data.chain[0]).toBe('Poppins');
		expect(data.source).toBe('user');
		// AN EMPTY OVERRIDE MEANS "EVERY SLOT AUTOMATIC", EVEN WHEN THE SAVED SETTINGS STILL HOLD A SLOT
		updateCanonicalSettings({ typesetScriptFonts: { devanagari: 'Poppins' } });
		invalidateSettingsCache();
		const auto = await call(`?script=devanagari&scriptFonts=${encodeURIComponent('{}')}`);
		expect(auto.source).not.toBe('user');
	});

	it('rejects a scriptFonts override that is not a JSON object', async () => {
		await expect(call('?scriptFonts=not-json')).rejects.toMatchObject({ status: 400 });
		await expect(call(`?scriptFonts=${encodeURIComponent('[1]')}`)).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an unknown script', async () => {
		await expect(call('?script=klingon')).rejects.toMatchObject({ status: 400 });
	});
});
