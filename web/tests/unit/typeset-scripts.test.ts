import { describe, it, expect } from 'vitest';
import { JOINER_REGEX, SCRIPT_FONT_SLOTS, detectScripts, dominantScript, scriptOfChar } from '$lib/typeset-scripts';
import { scriptOfLanguage, typesetScriptForBook } from '$lib/languages';
import { CJK_REGEX, NON_LATIN_SCRIPT_REGEX } from '$lib/server/typeset/fonts';

describe('scriptOfChar', () => {
	it.each([
		['中', 'han'],
		['、', 'han'],
		['！', 'han'],
		['あ', 'kana'],
		['カ', 'kana'],
		['ー', 'kana'],
		['한', 'hangul'],
		['न', 'devanagari'],
		['।', 'devanagari'],
		['ก', 'thai'],
		['ع', 'arabic'],
		['؟', 'arabic'],
		['Я', 'cyrillic'],
		['Ω', 'greek'],
		['ש', 'hebrew'],
		['ক', 'bengali'],
		['க', 'tamil'],
		['A', 'latin'],
		['é', 'latin'],
		['7', 'common'],
		[' ', 'common'],
		['!', 'common'],
	])('%s is %s', (ch, script) => {
		expect(scriptOfChar(ch)).toBe(script);
	});
});

describe('detectScripts / dominantScript', () => {
	it('counts letters per script and ignores common characters', () => {
		const counts = detectScripts('OK नमस्ते 123!');
		expect(counts.get('latin')).toBe(2);
		expect(counts.get('devanagari')).toBe(6);
		expect(counts.has('common' as never)).toBe(false);
	});

	it('picks the script with the most characters', () => {
		expect(dominantScript('OK नमस्ते', 'latin')).toBe('devanagari');
		expect(dominantScript('Hello 世界', 'han')).toBe('latin');
	});

	it('falls back on empty text and on a tie with the fallback', () => {
		expect(dominantScript('123 !?', 'thai')).toBe('thai');
		expect(dominantScript('ab 世界', 'han')).toBe('han');
	});
});

describe('JOINER_REGEX', () => {
	it('matches ZWNJ, ZWJ and combining marks, not base letters', () => {
		expect(JOINER_REGEX.test('\u200c')).toBe(true);
		expect(JOINER_REGEX.test('\u200d')).toBe(true);
		expect(JOINER_REGEX.test('्')).toBe(true);
		expect(JOINER_REGEX.test('\u0301')).toBe(true);
		expect(JOINER_REGEX.test('क')).toBe(false);
	});
});

describe('font regexes built from the shared ranges', () => {
	it('keeps CJK_REGEX to Han, Kana, Hangul and CJK punctuation', () => {
		for (const ch of ['中', 'あ', 'ー', '・', '한', '、', '！']) expect(CJK_REGEX.test(ch)).toBe(true);
		for (const ch of ['A', 'न', 'ก', 'Я', 'ع']) expect(CJK_REGEX.test(ch)).toBe(false);
	});

	it('NON_LATIN_SCRIPT_REGEX covers the old scripts and quotes but not Arabic yet', () => {
		for (const ch of ['中', 'न', 'ก', 'Я', '«', '\u201c']) expect(NON_LATIN_SCRIPT_REGEX.test(ch)).toBe(true);
		expect(NON_LATIN_SCRIPT_REGEX.test('ع')).toBe(false);
		expect(NON_LATIN_SCRIPT_REGEX.test('Hello')).toBe(false);
	});

	it('lists every non-Latin script as a font slot', () => {
		expect(SCRIPT_FONT_SLOTS).toHaveLength(11);
		expect(SCRIPT_FONT_SLOTS).not.toContain('latin');
	});
});

describe('language scripts', () => {
	it('scriptOfLanguage returns null for unknown codes', () => {
		expect(scriptOfLanguage('xx')).toBeNull();
		expect(scriptOfLanguage(null)).toBeNull();
		expect(scriptOfLanguage('hi')).toBe('devanagari');
	});

	it('typesetScriptForBook uses the source script for untranslated books', () => {
		expect(typesetScriptForBook('none', 'ko')).toBe('hangul');
		expect(typesetScriptForBook('th', 'ja')).toBe('thai');
		expect(typesetScriptForBook('xx', 'ja')).toBe('latin');
	});
});
