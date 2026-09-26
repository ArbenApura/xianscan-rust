// ONE TYPESET OPTIONS BUILDER FOR EVERY ROUTE (FEAT-006 PHASE 7)
import { describe, it, expect, vi } from 'vitest';
import { DEFAULTS, type AppSettings } from '$lib/stores/settings';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { buildTypesetOptions } from '$lib/server/typeset/options';
import { resolveScriptFontSlots } from '$lib/server/typeset';

const canonical = (over: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULTS, ...over });
const cookieJar = (values: Record<string, string>) => ({ get: (name: string) => values[name] });

describe('buildTypesetOptions precedence', () => {
	it('uses the defaults when nothing is set', () => {
		const opts = buildTypesetOptions({ canonical: canonical() });
		expect(opts.fontDialogue).toBe(DEFAULTS.typesetFont);
		expect(opts.boxInset).toBe(DEFAULTS.typesetPadding);
		expect(opts.outlineMode).toBe(DEFAULTS.typesetOutline);
		expect(opts.colorMode).toBe(DEFAULTS.typesetContrast);
		expect(opts.casing).toBe(DEFAULTS.typesetCasing);
		expect(opts.fontCjk).toBeUndefined();
		expect(opts.scriptFonts).toEqual({});
	});

	it('canonical beats default, cookie beats canonical, request beats cookie', () => {
		const c = canonical({ typesetFont: 'Poppins', typesetPadding: 0.07, typesetOutline: 'thin', typesetCasing: 'original' });
		expect(buildTypesetOptions({ canonical: c }).fontDialogue).toBe('Poppins');
		const withCookie = buildTypesetOptions({ canonical: c, cookies: cookieJar({ mt_ts_font: 'Lexend', mt_ts_padding: '0.09', mt_ts_outline: 'heavy' }) });
		expect(withCookie.fontDialogue).toBe('Lexend');
		expect(withCookie.boxInset).toBe(0.09);
		expect(withCookie.outlineMode).toBe('heavy');
		expect(withCookie.casing).toBe('original');
		const withUser = buildTypesetOptions({
			canonical: c,
			cookies: cookieJar({ mt_ts_font: 'Lexend', mt_ts_outline: 'heavy' }),
			userOpts: { fontFamily: 'Montserrat', outline: 'none', boxInset: 0.02 },
		});
		expect(withUser.fontDialogue).toBe('Montserrat');
		expect(withUser.outlineMode).toBe('none');
		expect(withUser.boxInset).toBe(0.02);
	});

	it('italic and rotation follow the same order', () => {
		const c = canonical({ enableTypesetItalic: true, enableTextRotation: false });
		expect(buildTypesetOptions({ canonical: c }).fontStyle).toBe('italic');
		expect(buildTypesetOptions({ canonical: c, cookies: cookieJar({ mt_ts_italic: 'false', mt_ts_rot: 'true' }) })).toMatchObject({ fontStyle: 'normal', enableRotation: true });
		expect(buildTypesetOptions({ canonical: c, userOpts: { enableItalic: false, enableRotation: true } })).toMatchObject({ fontStyle: 'normal', enableRotation: true });
	});

	it('maps only an explicit, non-default CJK font from an old client and passes the script slots', () => {
		expect(buildTypesetOptions({ canonical: canonical({ typesetCjkFont: 'WenQuanYi Micro Hei' }) }).fontCjk).toBeUndefined();
		// THE STORED LEGACY FONT WAS MIGRATED INTO THE SLOTS; READING IT AGAIN WOULD UNDO "AUTOMATIC"
		expect(buildTypesetOptions({ canonical: canonical({ typesetCjkFont: 'Yu Gothic' }) }).fontCjk).toBeUndefined();
		expect(buildTypesetOptions({ canonical: canonical(), userOpts: { fontCjk: 'Malgun Gothic' } }).fontCjk).toBe('Malgun Gothic');
		expect(buildTypesetOptions({ canonical: canonical(), userOpts: { fontCjk: 'WenQuanYi Micro Hei' } }).fontCjk).toBeUndefined();
		// A CLIENT THAT SENDS SLOTS IS NEW: ITS fontCjk IS IGNORED
		expect(buildTypesetOptions({ canonical: canonical(), userOpts: { fontCjk: 'Malgun Gothic', scriptFonts: {} } }).fontCjk).toBeUndefined();
		const slots = buildTypesetOptions({ canonical: canonical({ typesetScriptFonts: { thai: 'Tahoma' } }) }).scriptFonts;
		expect(slots).toEqual({ thai: 'Tahoma' });
		expect(buildTypesetOptions({ canonical: canonical({ typesetScriptFonts: { thai: 'Tahoma' } }), userOpts: { scriptFonts: { devanagari: 'Poppins' } } }).scriptFonts).toEqual({ devanagari: 'Poppins' });
	});

	it('"Automatic" han / kana / hangul stay automatic with a legacy CJK font stored', () => {
		const opts = buildTypesetOptions({ canonical: canonical({ typesetCjkFont: 'Yu Gothic', typesetScriptFonts: { thai: 'Tahoma' } }) });
		expect(resolveScriptFontSlots(opts)).toEqual({ thai: 'Tahoma' });
	});

	it('an old client that sends only fontCjk still fills the unset CJK slots', () => {
		const opts = buildTypesetOptions({ canonical: canonical({ typesetScriptFonts: { han: 'SimSun' } }), userOpts: { fontCjk: 'Malgun Gothic' } });
		expect(resolveScriptFontSlots(opts)).toEqual({ han: 'SimSun', kana: 'Malgun Gothic', hangul: 'Malgun Gothic' });
	});

	it('carries the target script', () => {
		expect(buildTypesetOptions({ canonical: canonical(), targetScript: 'thai' }).targetScript).toBe('thai');
	});
});
