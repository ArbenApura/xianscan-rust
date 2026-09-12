// UNIT TESTS FOR DIALOGUE CASING SUPPORT AND FALLBACK HELPERS
import { describe, expect, it } from 'vitest';
import {
	CASING_PRESETS,
	isCasingSupportedByFont,
	getValidCasingForFont,
	AVAILABLE_TYPESET_FONTS,
} from '$lib/stores/settings';

// -- TESTS -- //

describe('isCasingSupportedByFont', () => {
	it('restricts to uppercase when font is marked allCapsOnly', () => {
		expect(isCasingSupportedByFont('uppercase', undefined, true)).toBe(true);
		expect(isCasingSupportedByFont('original', undefined, true)).toBe(false);
		expect(isCasingSupportedByFont('lowercase', undefined, true)).toBe(false);
	});

	it('restricts to lowercase when font is marked lowercaseOnly', () => {
		expect(isCasingSupportedByFont('lowercase', undefined, false, true)).toBe(true);
		expect(isCasingSupportedByFont('uppercase', undefined, false, true)).toBe(false);
		expect(isCasingSupportedByFont('original', undefined, false, true)).toBe(false);
	});

	it('respects explicit supportedCasings array', () => {
		expect(isCasingSupportedByFont('uppercase', ['uppercase'])).toBe(true);
		expect(isCasingSupportedByFont('original', ['uppercase'])).toBe(false);
		expect(isCasingSupportedByFont('lowercase', ['uppercase'])).toBe(false);

		expect(isCasingSupportedByFont('uppercase', ['uppercase', 'original'])).toBe(true);
		expect(isCasingSupportedByFont('original', ['uppercase', 'original'])).toBe(true);
		expect(isCasingSupportedByFont('lowercase', ['uppercase', 'original'])).toBe(false);
	});

	it('permits all casings when font has no casing restrictions', () => {
		expect(isCasingSupportedByFont('uppercase', undefined, false, false)).toBe(true);
		expect(isCasingSupportedByFont('original', undefined, false, false)).toBe(true);
		expect(isCasingSupportedByFont('lowercase', undefined, false, false)).toBe(true);
	});

	it('verifies CC Wild Words preset is configured with all-caps constraint', () => {
		const wildWords = AVAILABLE_TYPESET_FONTS.find((f) => f.id === 'CC Wild Words');
		expect(wildWords).toBeDefined();
		expect(wildWords?.allCapsOnly).toBe(true);
		expect(wildWords?.supportedCasings).toEqual(['uppercase']);

		expect(isCasingSupportedByFont('uppercase', wildWords?.supportedCasings, wildWords?.allCapsOnly)).toBe(true);
		expect(isCasingSupportedByFont('original', wildWords?.supportedCasings, wildWords?.allCapsOnly)).toBe(false);
		expect(isCasingSupportedByFont('lowercase', wildWords?.supportedCasings, wildWords?.allCapsOnly)).toBe(false);
	});
});

describe('getValidCasingForFont', () => {
	it('preserves valid casing when supported', () => {
		expect(getValidCasingForFont('uppercase', undefined, false, false)).toBe('uppercase');
		expect(getValidCasingForFont('original', undefined, false, false)).toBe('original');
		expect(getValidCasingForFont('lowercase', undefined, false, false)).toBe('lowercase');
	});

	it('falls back to uppercase for all-caps fonts when lowercase or original is requested', () => {
		expect(getValidCasingForFont('lowercase', ['uppercase'], true)).toBe('uppercase');
		expect(getValidCasingForFont('original', ['uppercase'], true)).toBe('uppercase');
		expect(getValidCasingForFont('uppercase', ['uppercase'], true)).toBe('uppercase');
	});

	it('falls back to lowercase for lowercase-only fonts', () => {
		expect(getValidCasingForFont('uppercase', ['lowercase'], false, true)).toBe('lowercase');
		expect(getValidCasingForFont('original', ['lowercase'], false, true)).toBe('lowercase');
		expect(getValidCasingForFont('lowercase', ['lowercase'], false, true)).toBe('lowercase');
	});

	it('defaults to uppercase on empty or invalid casing input', () => {
		expect(getValidCasingForFont(null, undefined, false, false)).toBe('uppercase');
		expect(getValidCasingForFont(undefined, undefined, false, false)).toBe('uppercase');
		expect(getValidCasingForFont('unknown-casing', undefined, false, false)).toBe('uppercase');
	});

	it('verifies CASING_PRESETS structure and identifiers', () => {
		expect(CASING_PRESETS.map((p) => p.id)).toEqual(['uppercase', 'original', 'lowercase']);
	});
});
