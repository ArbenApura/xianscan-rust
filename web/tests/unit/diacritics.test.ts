// PLAIN LETTERS FOR DIACRITICS A FONT LACKS (FEAT-011)
import { describe, it, expect } from 'vitest';
import { plainDiacritics, plainLatinLetter } from '$lib/diacritics';

// COMBINING CHARACTERS ARE BUILT FROM CODE POINTS SO THE SOURCE STAYS READABLE
const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
// A FONT WITH ONLY THE GIVEN NON-ASCII CHARACTERS
const fontWith = (chars: string) => (codePoint: number) => codePoint < 0x80 || chars.includes(String.fromCodePoint(codePoint));

describe('plainDiacritics for a font without accented letters', () => {
	it.each([
		['CAFÉ DÉJÀ VU NAÏVE ZOË', 'CAFE DEJA VU NAIVE ZOE'],
		['año', 'ano'],
		['ÇĞŞ', 'CGS'],
		['façade résumé', 'facade resume'],
		['ạ ẞ', 'a SS'],
	])('draws precomposed letters plain: %s', (input, expected) => {
		expect(plainDiacritics(input)).toBe(expected);
	});

	it.each([
		['Straße', 'Strasse'],
		['Æsir', 'AEsir'],
		['œuvre', 'oeuvre'],
		['Łódź', 'Lodz'],
		['Øresund', 'Oresund'],
		['ı', 'i'],
		['þorn', 'thorn'],
		['ǽ', 'ae'],
		['ǿ', 'o'],
		['ĳs', 'ijs'],
		['ſ', 's'],
	])('maps letters without a decomposition: %s', (input, expected) => {
		expect(plainDiacritics(input)).toBe(expected);
	});

	it('drops combining diacritics after a Latin letter, stacked ones included', () => {
		expect(plainDiacritics(`caf${cp(0x65, 0x301)}`)).toBe('cafe');
		expect(plainDiacritics(cp(0x41, 0x30a))).toBe('A');
		expect(plainDiacritics(cp(0x65, 0x323, 0x302))).toBe('e');
	});

	it('keeps marks that are not diacritics', () => {
		expect(plainDiacritics(cp(0x41, 0xfe0f))).toBe(cp(0x41, 0xfe0f));
		expect(plainDiacritics(cp(0x31, 0xfe0f, 0x20e3))).toBe(cp(0x31, 0xfe0f, 0x20e3));
	});

	it.each([
		['precomposed kana', 'がぱ'],
		['decomposed kana', cp(0x304b, 0x3099)],
		['cyrillic', 'йё Ёлка'],
		['decomposed cyrillic', cp(0x438, 0x306)],
		['decomposed greek', cp(0x3b1, 0x301)],
		['mark after a latin letter then a greek letter', `a${cp(0x3b1, 0x301)}`],
		['greek', 'άέ'],
		['devanagari with nukta', 'क़ि ज़रा'],
		['thai', 'ที่นี่'],
		['arabic with harakat', 'مَرْحَبًا'],
		['hangul', '한국어'],
		['conjoining jamo', cp(0x1100, 0x1161)],
		['hebrew with points', 'שָׁלוֹם'],
	])('never touches other scripts: %s', (_label, input) => {
		expect(plainDiacritics(input)).toBe(input);
	});

	it('changes only the Latin letter in mixed text', () => {
		expect(plainDiacritics('日本 café')).toBe('日本 cafe');
		expect(plainDiacritics('Ａé')).toBe('Ａe');
		expect(plainDiacritics('مرحبا José')).toBe('مرحبا Jose');
	});

	it('is the identity on ASCII and empty text', () => {
		const ascii = 'HOLD ON! What is this Cultivation Realm...?! [Skill: 42] {x|y} ~';
		expect(plainDiacritics(ascii)).toBe(ascii);
		expect(plainDiacritics('')).toBe('');
	});

	it('keeps punctuation that is not a letter', () => {
		expect(plainDiacritics('¡Hola! ¿Qué? «oui» – …')).toBe('¡Hola! ¿Que? «oui» – …');
	});
});

describe('plainDiacritics follows the font', () => {
	it('keeps every letter the font has', () => {
		const full = () => true;
		expect(plainDiacritics('CAFÉ Straße Łódź', full)).toBe('CAFÉ Straße Łódź');
	});

	it('changes only the letters the font lacks', () => {
		expect(plainDiacritics('ÉÑÜ', fontWith('Ñ'))).toBe('EÑU');
		// A FONT WITH É BUT NOT é: CASING DECIDES WHICH ONE IS CHECKED
		expect(plainDiacritics('Éé', fontWith('É'))).toBe('Ée');
	});

	it('keeps a combining mark the font has, and drops one it lacks', () => {
		expect(plainDiacritics(cp(0x65, 0x301), fontWith(cp(0x301)))).toBe(cp(0x65, 0x301));
		expect(plainDiacritics(cp(0x65, 0x301, 0x323), fontWith(cp(0x301)))).toBe(cp(0x65, 0x301));
	});

	it('plainLatinLetter gives the plain form of one letter', () => {
		expect(plainLatinLetter('É')).toBe('E');
		expect(plainLatinLetter('ß')).toBe('ss');
		expect(plainLatinLetter('[')).toBe('[');
	});
});
