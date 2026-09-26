// PER-SCRIPT FONT SETTINGS AND THE ONE-TIME MIGRATION FROM THE OLD CJK FONT (FEAT-006 PHASE 6)
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb } from '../helpers/db';
import { appSettings } from '$lib/server/db/schema';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { getCanonicalSettings, invalidateSettingsCache, sanitizeSettingValue } from '$lib/server/settings-service';
import { mergeKnownSettings, sanitizeScriptFonts, settingEquals } from '$lib/stores/settings';

function seedLegacyCjk(font: string) {
	getTestDb().insert(appSettings).values({ key: 'typesetCjkFont', value: JSON.stringify(font), updatedAt: Date.now() }).run();
}

function scriptFontsRow(): string | undefined {
	return getTestDb().select().from(appSettings).where(eq(appSettings.key, 'typesetScriptFonts')).get()?.value;
}

beforeAll(async () => {
	const { registerFonts } = await import('$lib/server/typeset/fonts');
	registerFonts();
});

beforeEach(() => {
	resetDb();
	invalidateSettingsCache();
});

describe('migrateLegacyScriptFonts (server)', () => {
	it('the default CJK font migrates to an empty map (automatic)', () => {
		seedLegacyCjk('WenQuanYi Micro Hei');
		expect(getCanonicalSettings(getTestDb()).typesetScriptFonts).toEqual({});
		expect(scriptFontsRow()).toBe('{}');
	});

	it('a custom CJK font fills han, kana and hangul', () => {
		seedLegacyCjk('Yu Gothic');
		const fonts = getCanonicalSettings(getTestDb()).typesetScriptFonts;
		expect(fonts.han).toBe('Yu Gothic');
		expect(fonts.kana).toBe('Yu Gothic');
		expect(fonts.hangul).toBe('Yu Gothic');
	});

	it('also fills every other slot the font really covers (Poppins covers Devanagari)', () => {
		seedLegacyCjk('Poppins');
		const fonts = getCanonicalSettings(getTestDb()).typesetScriptFonts;
		expect(fonts.devanagari).toBe('Poppins');
		expect(fonts.thai).toBeUndefined();
	});

	it('runs once: an existing row is never overwritten', () => {
		seedLegacyCjk('Yu Gothic');
		getCanonicalSettings(getTestDb());
		getTestDb().update(appSettings).set({ value: JSON.stringify({ thai: 'Tahoma' }) }).where(eq(appSettings.key, 'typesetScriptFonts')).run();
		invalidateSettingsCache();
		expect(getCanonicalSettings(getTestDb()).typesetScriptFonts).toEqual({ thai: 'Tahoma' });
	});
});

describe('sanitising', () => {
	it('drops unknown slots, empty names and over-long names', () => {
		expect(sanitizeScriptFonts({ han: ' Yu Gothic ', klingon: 'X', thai: '', devanagari: 'x'.repeat(200), latin: 'Arial' })).toEqual({ han: 'Yu Gothic' });
		expect(sanitizeScriptFonts('nope')).toEqual({});
		expect(sanitizeSettingValue('typesetScriptFonts', { arabic: 'Tajawal', foo: 'bar' })).toEqual({ arabic: 'Tajawal' });
	});

	it('keeps the preview presets the UI offers and maps the legacy zh', () => {
		expect(sanitizeSettingValue('typesetPreviewPreset', 'zh-hans')).toBe('zh-hans');
		expect(sanitizeSettingValue('typesetPreviewPreset', 'hi')).toBe('hi');
		expect(sanitizeSettingValue('typesetPreviewPreset', 'zh')).toBe('zh-hans');
		expect(sanitizeSettingValue('typesetPreviewPreset', 'xx')).toBe('en');
	});
});

describe('client settings model', () => {
	it('version < 12: a custom CJK font becomes the CJK script slots', () => {
		const merged = mergeKnownSettings({ version: 11, typesetCjkFont: 'Malgun Gothic' });
		expect(merged.version).toBe(12);
		expect(merged.typesetScriptFonts).toEqual({ han: 'Malgun Gothic', kana: 'Malgun Gothic', hangul: 'Malgun Gothic' });
	});

	it('version < 12 with the default CJK font leaves the slots automatic', () => {
		expect(mergeKnownSettings({ version: 11, typesetCjkFont: 'WenQuanYi Micro Hei' }).typesetScriptFonts).toEqual({});
	});

	it('settingEquals compares objects by value so an unchanged map is not re-synced', () => {
		expect(settingEquals({ han: 'A' }, { han: 'A' })).toBe(true);
		expect(settingEquals({ han: 'A' }, { han: 'B' })).toBe(false);
		expect(settingEquals(['a'], ['a'])).toBe(true);
		expect(settingEquals(1, 1)).toBe(true);
		expect(settingEquals('a', 'b')).toBe(false);
	});
});

describe('accent fonts in stored settings (FEAT-010)', () => {
	it('mergeKnownSettings keeps valid accent slots and drops junk', () => {
		const merged = mergeKnownSettings({ typesetAccentFonts: { latin: 'Bangers', han: '', kana: 7, bogus: 'X' } });
		expect(merged.typesetAccentFonts).toEqual({ latin: 'Bangers' });
		expect(mergeKnownSettings({ typesetAccentFonts: null }).typesetAccentFonts).toEqual({});
		expect(mergeKnownSettings({ typesetAccentFonts: ['Bangers'] }).typesetAccentFonts).toEqual({});
	});

	it('sanitizeSettingValue validates every accent key', () => {
		expect(sanitizeSettingValue('typesetAccentFonts', { latin: 'Bangers', x: 'Y' })).toEqual({ latin: 'Bangers' });
		expect(sanitizeSettingValue('typesetAccentCasing', 'original')).toBe('original');
		expect(sanitizeSettingValue('typesetAccentCasing', 'nope')).toBe('uppercase');
		expect(sanitizeSettingValue('typesetAccentFontWeight', 'bold')).toBe('bold');
		expect(sanitizeSettingValue('typesetAccentInBubbles', 'yes')).toBe(true);
	});
});
