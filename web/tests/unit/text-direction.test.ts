// TEXT DIRECTION DETECTION (FEAT-007 PHASE 1)
import { describe, it, expect } from 'vitest';
import { ARABIC_SCRIPT_REGEX, RTL_CHAR_REGEX, detectTextDirection, resolveDirection } from '$lib/text-direction';

describe('detectTextDirection', () => {
	it.each([
		['مرحبا بك في العالم', 'rtl'],
		['Hello world', 'ltr'],
		['Goku نحو المستشفى رقم 25!', 'rtl'], // LATIN FIRST, ARABIC MAJORITY
		['Hello مرحبا world again', 'ltr'], // LATIN MAJORITY
		['12345 !?', 'ltr'],
		['', 'ltr'],
		['שלום עולם', 'rtl'],
	])('%j is %s', (text, dir) => {
		expect(detectTextDirection(text)).toBe(dir);
	});
});

describe('resolveDirection', () => {
	it('an explicit override wins, auto detects', () => {
		expect(resolveDirection('Hello', 'rtl')).toBe('rtl');
		expect(resolveDirection('مرحبا', 'ltr')).toBe('ltr');
		expect(resolveDirection('مرحبا', 'auto')).toBe('rtl');
		expect(resolveDirection('Hello')).toBe('ltr');
	});
});

describe('script regexes', () => {
	it('cover Arabic letters and punctuation, presentation forms and Hebrew', () => {
		for (const ch of ['ع', '؟', '،', 'ﻻ', 'א']) expect(RTL_CHAR_REGEX.test(ch)).toBe(true);
		expect(ARABIC_SCRIPT_REGEX.test('؟')).toBe(true);
		expect(ARABIC_SCRIPT_REGEX.test('א')).toBe(false);
		expect(RTL_CHAR_REGEX.test('A')).toBe(false);
	});
});
