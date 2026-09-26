// PLAIN LETTERS FOR DIACRITICS A FONT LACKS (FEAT-011). MANY COMIC FONTS (CC WILD WORDS) HAVE NO É, SO IT WOULD BE
// DRAWN IN A FALLBACK FONT MID-WORD; THE PLAIN E KEEPS THE WORD IN ONE FONT. A FONT THAT HAS THE LETTER KEEPS IT.
// SHARED BY THE SERVER RENDERER AND THE SETTINGS PREVIEW, SO NO NODE IMPORTS. ONLY LATIN-SCRIPT LETTERS CHANGE: KANA
// DAKUTEN, CYRILLIC Й, DEVANAGARI, THAI AND ARABIC MARKS ARE NEVER TOUCHED.
// IMPORTED MODULES
import { scriptOfChar } from '$lib/typeset-scripts';

// -- TYPES -- //

/** TRUE WHEN THE FONT HAS A GLYPH FOR THE CODE POINT. */
export type HasGlyph = (codePoint: number) => boolean;

// -- CONSTANTS -- //

/**
 * COMBINING DIACRITIC BLOCKS (ADR-004): COMBINING DIACRITICAL MARKS, THEIR EXTENDED AND SUPPLEMENT BLOCKS, THE MARKS FOR
 * SYMBOLS UP TO U+20DC AND THE HALF MARKS. VARIATION SELECTORS AND ENCLOSING KEYCAP MARKS ARE NOT DIACRITICS AND STAY.
 */
const DIACRITIC_RANGES: readonly [number, number][] = [
	[0x0300, 0x036f],
	[0x1ab0, 0x1aff],
	[0x1dc0, 0x1dff],
	[0x20d0, 0x20dc],
	[0xfe20, 0xfe2f],
];

/** LATIN LETTERS WITHOUT A CANONICAL DECOMPOSITION, APPLIED AFTER NFD SO ǽ -> æ -> ae IS COVERED TOO. */
const LETTER_MAP: Record<string, string> = {
	ß: 'ss',
	ẞ: 'SS',
	æ: 'ae',
	Æ: 'AE',
	œ: 'oe',
	Œ: 'OE',
	ø: 'o',
	Ø: 'O',
	ł: 'l',
	Ł: 'L',
	đ: 'd',
	Đ: 'D',
	ð: 'd',
	Ð: 'D',
	þ: 'th',
	Þ: 'TH',
	ı: 'i',
	ħ: 'h',
	Ħ: 'H',
	ŧ: 't',
	Ŧ: 'T',
	ŀ: 'l',
	Ŀ: 'L',
	ĳ: 'ij',
	Ĳ: 'IJ',
	ſ: 's',
	ŉ: 'n',
};

// -- FUNCTIONS -- //

function isDiacritic(codePoint: number): boolean {
	return DIACRITIC_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** THE PLAIN FORM OF ONE LATIN LETTER: DECOMPOSED, DIACRITICS DROPPED, THEN MAPPED; THE LETTER ITSELF WHEN NOTHING IS LEFT. */
export function plainLatinLetter(ch: string): string {
	let base = '';
	for (const part of ch.normalize('NFD')) {
		if (!isDiacritic(part.codePointAt(0) as number)) base += part;
	}
	if (!base) return ch;
	let out = '';
	for (const part of base) out += LETTER_MAP[part] ?? part;
	return out;
}

/**
 * DRAWS LATIN LETTERS WITH DIACRITICS PLAIN (É -> E, Ñ -> N, ß -> ss) WHEN THE FONT HAS NO GLYPH FOR THEM, AND DROPS A
 * RUN OF COMBINING DIACRITICS AFTER A LATIN LETTER WHEN THE FONT LACKS THE MARK. WITHOUT `hasGlyph` EVERY SUCH LETTER IS
 * MADE PLAIN. EVERY OTHER CHARACTER IS COPIED UNCHANGED, AND THE STRING IS NEVER NORMALISED AS A WHOLE, SO NON-LATIN
 * TEXT, FULLWIDTH FORMS AND HANGUL JAMO STAY EXACTLY AS WRITTEN.
 */
export function plainDiacritics(text: string, hasGlyph: HasGlyph = () => false): string {
	let out = '';
	// TRUE WHILE THE LAST NON-DIACRITIC CHARACTER WAS A LATIN LETTER: A MARK AFTER IT IS DROPPED IF THE FONT LACKS IT
	let afterLatin = false;
	for (const ch of text) {
		const codePoint = ch.codePointAt(0) as number;
		if (afterLatin && isDiacritic(codePoint)) {
			if (hasGlyph(codePoint)) out += ch;
			continue;
		}
		if (codePoint < 0x80) {
			out += ch;
			afterLatin = /[A-Za-z]/.test(ch);
			continue;
		}
		if (scriptOfChar(ch) === 'latin') {
			out += hasGlyph(codePoint) ? ch : plainLatinLetter(ch);
			afterLatin = true;
		} else {
			out += ch;
			afterLatin = false;
		}
	}
	return out;
}
