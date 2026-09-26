// ACCENT LABELLING (FEAT-010 PHASE 3): THE PROMPT ASKS FOR A "styles" MAP, THE PARSER READS IT WITHOUT EVER LETTING
// IT LEAK INTO TRANSLATIONS, AND translatePage RETURNS THE LABELS.
// IMPORTED DEP-TYPES
import type OpenAI from 'openai';
// IMPORTED MODULES
import { describe, expect, it } from 'vitest';
import { PROMPT_VERSION, parseStyles, parseTranslations, systemPrompt, translatePage, userPrompt } from '$lib/server/translate';

// -- CONSTANTS -- //

const PAIR = { sourceLang: 'zh-Hans', targetLang: 'en' };
const IDS = new Set(['r0', 'r1', 'r2', 'r3']);

// -- FUNCTIONS -- //

function fakeClient(content: string): OpenAI {
	return {
		chat: {
			completions: {
				create: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
			},
		},
	} as unknown as OpenAI;
}

// -- TESTS -- //

describe('accent prompt', () => {
	it.each(['en', 'ar', 'hi'])('asks for the styles map and keeps the 1:1 rule for %s targets', (tgt) => {
		const prompt = systemPrompt('zh-Hans', tgt);
		expect(prompt).toContain('"styles"');
		expect(prompt).toContain('Accent Text (styles)');
		expect(prompt).toContain('"translations" must still contain every region ID');
		expect(prompt).toContain('If no region is accent text, output "styles": {}');
	});

	it('mentions styles in the user instruction and bumps the prompt version', () => {
		expect(userPrompt([{ id: 'r0', text: '青木剑诀' }])).toContain('mark accent text regions in "styles"');
		expect(PROMPT_VERSION).toBe('v24');
	});
});

describe('parseStyles', () => {
	it('reads accent labels for known ids only, in any case', () => {
		const raw = JSON.stringify({ translations: { r0: 'Hi', r3: 'Green Wood Sword Art' }, styles: { r3: 'Accent', r9: 'accent', r1: 'dialogue' }, newTerms: [] });
		expect([...parseStyles(raw, IDS)]).toEqual([['r3', 'accent']]);
	});

	it('returns no labels for a missing, empty or malformed map', () => {
		expect(parseStyles(JSON.stringify({ translations: { r0: 'Hi' } }), IDS).size).toBe(0);
		expect(parseStyles(JSON.stringify({ translations: { r0: 'Hi' }, styles: {} }), IDS).size).toBe(0);
		expect(parseStyles(JSON.stringify({ translations: { r0: 'Hi' }, styles: ['r0'] }), IDS).size).toBe(0);
		expect(parseStyles('not json at all', IDS).size).toBe(0);
	});

	it('recovers a styles block from a truncated reply', () => {
		const raw = '{"translations":{"r0":"Hi","r3":"Green Wood Sword Art"},"styles":{"r3":"accent"},"newTerms":[{"source":"青木';
		expect([...parseStyles(raw, IDS)]).toEqual([['r3', 'accent']]);
	});
});

describe('salvage isolation (review H1)', () => {
	it('keeps the real translation when a truncated reply has a styles block after translations', () => {
		const raw = '{"translations":{"r0":"Hi","r3":"Green Wood Sword Art"},"styles":{"r3":"accent"},"newTerms":[{"source":"青木';
		const out = parseTranslations(raw, IDS);
		expect(out?.get('r3')).toBe('Green Wood Sword Art');
		expect(out?.get('r0')).toBe('Hi');
	});

	it('keeps the real translation when styles comes before translations', () => {
		const raw = '{"styles":{"r3":"accent"},"translations":{"r0":"Hi","r3":"Green Wood Sword Art"},"newTerms":[{"source":"x"';
		expect(parseTranslations(raw, IDS)?.get('r3')).toBe('Green Wood Sword Art');
	});

	it('keeps the real translation when the reply is cut off inside the styles block (code critic)', () => {
		const raw = '{"translations":{"r0":"Hi","r3":"Green Wood Sword Art"},"styles":{"r3":"accent","r1":"acc';
		const out = parseTranslations(raw, IDS);
		expect(out?.get('r3')).toBe('Green Wood Sword Art');
		expect(out?.get('r0')).toBe('Hi');
		expect(out?.has('r1')).toBe(false);
		// THE COMPLETE PAIRS OF THE CUT BLOCK STILL LABEL THEIR REGIONS
		expect([...parseStyles(raw, IDS)]).toEqual([['r3', 'accent']]);
	});

	it('never salvages "accent" as a translation when a cut styles block comes first', () => {
		const raw = '{"styles":{"r3":"accent","r0":"acc';
		expect(parseTranslations(raw, IDS)).toBeNull();
	});

	it('still accepts a real translation that is the word accent when there is no styles block', () => {
		const raw = '{"translations":{"r0":"accent"},"newTerms":[{"source":"x"';
		expect(parseTranslations(raw, IDS)?.get('r0')).toBe('accent');
	});

	it('never turns a flat reply styles key into a region', () => {
		const raw = JSON.stringify({ r0: 'Hi', styles: { r0: 'accent' } });
		const out = parseTranslations(raw, IDS);
		expect(out?.has('styles')).toBe(false);
		expect(out?.get('r0')).toBe('Hi');
	});
});

describe('translatePage styles', () => {
	it('returns the accent labels from the reply', async () => {
		const reply = JSON.stringify({
			translations: { r0: 'Mid-level Xuan Tier Raging Lion Roar', r1: 'Stop right there!' },
			styles: { r0: 'accent' },
			newTerms: [],
		});
		const result = await translatePage(
			[
				{ id: 'r0', text: '玄阶中级 狂狮怒罡', kind: 'free_text' },
				{ id: 'r1', text: '站住！' },
			],
			[],
			PAIR,
			{ client: fakeClient(reply) },
		);
		expect(result.byRegion.get('r0')).toBe('Mid-level Xuan Tier Raging Lion Roar');
		expect([...result.styles]).toEqual([['r0', 'accent']]);
	});

	it('returns an empty map on the early returns', async () => {
		const empty = await translatePage([], [], PAIR, { client: fakeClient('{}') });
		expect(empty.styles.size).toBe(0);
		const punctuationOnly = await translatePage([{ id: 'r0', text: '……' }], [], PAIR, { client: fakeClient('{}') });
		expect(punctuationOnly.styles.size).toBe(0);
	});
});
