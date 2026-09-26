// SUGGESTED ACCENT FONTS DATA (FEAT-010 PHASE 10)
import { describe, it, expect } from 'vitest';
import { SUGGESTED_ACCENT_FONTS } from '$lib/suggested-accent-fonts';
import { SCRIPT_FONT_SLOTS } from '$lib/typeset-scripts';

describe('suggested accent fonts', () => {
	it('every entry has a licence, an https link and a known script', () => {
		const scripts = new Set<string>(['latin', ...SCRIPT_FONT_SLOTS]);
		for (const font of SUGGESTED_ACCENT_FONTS) {
			expect(font.license).toMatch(/Open Font License/);
			expect(new URL(font.url).protocol).toBe('https:');
			expect(scripts.has(font.script)).toBe(true);
		}
	});

	it('has no duplicate families and suggests at least one font for Latin, Chinese, Japanese, Korean, Hindi, Thai, Arabic and Russian', () => {
		const families = SUGGESTED_ACCENT_FONTS.map((f) => f.family);
		expect(new Set(families).size).toBe(families.length);
		const covered = new Set(SUGGESTED_ACCENT_FONTS.map((f) => f.script));
		for (const script of ['latin', 'han', 'kana', 'hangul', 'devanagari', 'thai', 'arabic', 'cyrillic']) expect(covered.has(script as never)).toBe(true);
	});
});
