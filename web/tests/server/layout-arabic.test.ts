// ARABIC-AWARE LINE BREAKING AND PUNCTUATION (FEAT-007 PHASE 3)
import { describe, it, expect } from 'vitest';
import { findHyphenationPoints, wrapText, fitFontSizeWithLines, isHardLineBreak } from '$lib/server/typeset/layout';
import { sanitizeForFont } from '$lib/server/typeset/sanitize';

// ONE UNIT PER CODE POINT, SCALED BY THE FONT SIZE PARSED FROM ctx.font (DETERMINISTIC, NO REAL FONTS NEEDED)
function fakeCtx() {
	const ctx = {
		font: '10px x',
		measureText(t: string) {
			const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10);
			return { width: [...t].length * size * 0.6 };
		},
	};
	return ctx;
}
const unit = { measureText: (t: string) => ({ width: [...t].length * 10 }) };
const STARTS_WITH_MARK = /^\p{M}/u;

describe('Arabic words are never hyphenated', () => {
	it('findHyphenationPoints returns nothing for Arabic', () => {
		expect(findHyphenationPoints('والمستشفيات')).toEqual([]);
		expect(findHyphenationPoints('EXTRAORDINARY').length).toBeGreaterThan(0);
	});

	it('an overflowing Arabic word stays whole (the fit shrinks the font instead)', () => {
		expect(wrapText(unit, 'والمستشفيات', 40)).toEqual(['والمستشفيات']);
	});

	it('the last-resort grapheme break never starts a line with a haraka', () => {
		const word = 'مُسْتَشْفَيَاتٌ';
		const lines = wrapText(unit, word, 40, { allowGraphemeBreak: true });
		expect(lines.join('')).toBe(word);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(STARTS_WITH_MARK.test(line)).toBe(false);
			expect(line.includes('-')).toBe(false);
		}
	});
});

describe('narrow bubble', () => {
	it('keeps whole words and fits every line', () => {
		const text = 'ذهبنا إلى والمستشفيات الكبيرة';
		const words = new Set(text.split(' '));
		const ctx = fakeCtx();
		const { size, lines } = fitFontSizeWithLines(ctx, text, 'CC Wild Words', 60, 300, 40, 40);
		expect(size).toBeGreaterThanOrEqual(6);
		const maxW = 60 * 0.9;
		ctx.font = `${size}px x`;
		for (const line of lines) {
			expect(line.includes('-')).toBe(false);
			for (const w of line.split(' ')) expect(words.has(w)).toBe(true);
			expect(ctx.measureText(line).width).toBeLessThanOrEqual(maxW + 0.5);
		}
	});
});

describe('Arabic punctuation', () => {
	it('؟ detaches like ?', () => {
		const latin = wrapText(unit, 'How?', 30);
		const arabic = wrapText(unit, 'كيف؟', 30);
		expect(arabic.length).toBe(latin.length);
	});

	it('a line ending in ؟ is a hard break', () => {
		expect(isHardLineBreak('هل أنت بخير؟', 'نعم')).toBe(true);
		expect(isHardLineBreak('هل أنت بخير،', 'نعم')).toBe(false);
	});

	it('sanitizeForFont cleans doubled and trailing Arabic commas', () => {
		expect(sanitizeForFont('مرحبا،، يا صديقي،')).toBe('مرحبا، يا صديقي');
		expect(sanitizeForFont('حسنا، ؟')).toBe('حسنا؟');
	});
});
