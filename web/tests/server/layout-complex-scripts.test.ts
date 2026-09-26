// GRAPHEME-SAFE LINE BREAKING FOR COMPLEX SCRIPTS (FEAT-006 PHASE 10)
import { describe, it, expect } from 'vitest';
import { wrapText, reflowText } from '$lib/server/typeset/layout';

// ONE UNIT PER CODE POINT: DETERMINISTIC AND INDEPENDENT OF INSTALLED FONTS
const ctx = { measureText: (t: string) => ({ width: [...t].length * 10 }) };
const VIRAMA = String.fromCodePoint(0x094d);
const STARTS_WITH_MARK = /^\p{M}/u;

describe('Devanagari', () => {
	const compound = 'प्रतिस्पर्धात्मकता';

	it('never starts a line with a combining mark or leaves a virama dangling, and adds no hyphen', () => {
		for (const width of [30, 40, 50, 60, 80]) {
			const lines = wrapText(ctx, compound, width);
			expect(lines.join('')).toBe(compound);
			for (const line of lines) {
				expect(STARTS_WITH_MARK.test(line)).toBe(false);
				expect(line.endsWith(VIRAMA)).toBe(false);
				expect(line.includes('-')).toBe(false);
			}
		}
	});

	it('keeps whole words on a line when they fit', () => {
		const lines = wrapText(ctx, 'रुको यह कौन सा लोक है', 60);
		expect(lines.join(' ')).toBe('रुको यह कौन सा लोक है');
	});
});

describe('Thai', () => {
	const sentence = 'ฉันอยากเล่นเป็นนักสู้แต่กลับกลายเป็นนักเวท';
	const words = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(sentence)].map((s) => s.segment);
	const boundaries = new Set<number>();
	let at = 0;
	for (const w of words) {
		boundaries.add(at);
		at += w.length;
	}
	boundaries.add(at);

	it('wraps only at word boundaries, joining words without spaces', () => {
		for (const width of [60, 90, 120]) {
			const lines = wrapText(ctx, sentence, width);
			expect(lines.join('')).toBe(sentence);
			let pos = 0;
			for (const line of lines) {
				expect(boundaries.has(pos)).toBe(true);
				pos += line.length;
				expect(boundaries.has(pos)).toBe(true);
				expect(STARTS_WITH_MARK.test(line)).toBe(false);
			}
		}
	});

	it('reflow keeps the text intact too', () => {
		expect(reflowText(ctx, sentence, 90).join('')).toBe(sentence);
	});
});

describe('Latin is unchanged', () => {
	it('still hyphenates long English words', () => {
		const lines = wrapText(ctx, 'EXTRAORDINARILY', 80);
		expect(lines.some((l) => l.endsWith('-'))).toBe(true);
	});
});
