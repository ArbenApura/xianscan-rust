// BUNDLED FONTS ARE NOT SYSTEM FONTS: ENABLING POPPINS FROM THE HINDI SYSTEM FONT BROWSER USED TO SAVE IT AS AN
// "ENABLED SYSTEM FONT", AND THE BROWSER THEN GOT 404 FROM /api/system/fonts/system/Poppins ON EVERY SETTINGS WRITE
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { resetDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { invalidateSettingsCache, sanitizeSettingValue } from '$lib/server/settings-service';
import { getAvailableSystemFonts, registerFonts } from '$lib/server/typeset/fonts';
import { isBundledFontFamily } from '$lib/server/typeset/bundled-families';
import { GET as listSystemFonts } from '../../src/routes/api/system/fonts/system/+server';
import { GET as systemFontFile } from '../../src/routes/api/system/fonts/system/[family]/+server';

beforeEach(() => {
	resetDb();
	invalidateSettingsCache();
	registerFonts();
});

describe('bundled fonts and the system font list', () => {
	it('knows the bundled families, including aliases, case-insensitively', () => {
		expect(isBundledFontFamily('Poppins')).toBe(true);
		expect(isBundledFontFamily('poppins bold')).toBe(true);
		expect(isBundledFontFamily('Noto Sans Devanagari')).toBe(true);
		expect(isBundledFontFamily('Arial')).toBe(false);
	});

	it('never lists a bundled family as a system font', () => {
		const names = getAvailableSystemFonts().map((f) => f.family.toLowerCase());
		for (const bundled of ['poppins', 'poppins bold', 'noto sans devanagari', 'tajawal', 'cc wild words']) {
			expect(names).not.toContain(bundled);
		}
	});

	it('the Devanagari filter of the system font route does not offer Poppins', async () => {
		const res = await listSystemFonts({ url: new URL('http://localhost/api/system/fonts/system?script=devanagari') } as unknown as RequestEvent);
		const data = await res.json();
		expect(data.fonts.map((f: { family: string }) => f.family)).not.toContain('Poppins');
	});

	it('serves the bundled file for a family older settings list as a system font', async () => {
		const res = await systemFontFile({ params: { family: 'Poppins' } } as unknown as RequestEvent);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('font/ttf');
	});

	it('drops bundled families from enabledSystemFonts but keeps real system fonts', () => {
		expect(sanitizeSettingValue('enabledSystemFonts', ['Poppins', 'Arial', 'Tajawal', 'Nirmala UI'])).toEqual(['Arial', 'Nirmala UI']);
	});
});
