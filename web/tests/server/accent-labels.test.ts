// ACCENT LABELS (FEAT-010 PHASE 4): THE GLOSSARY CROSS-CHECK AND THE v2 PAGE CACHE PAYLOAD.
// IMPORTED TYPES
import type { TermDraft } from '$lib/types';
// IMPORTED MODULES
import { describe, expect, it, vi } from 'vitest';
import { applyGlossaryAccentLabels, normalizeAccentText } from '$lib/server/translate/accent';
import { parseContent } from '$lib/server/cache';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- CONSTANTS -- //

const TECHNIQUE: TermDraft = {
	source: '青木剑诀',
	target: 'Green Wood Sword Art',
	category: 'technique',
	gender: 'neuter',
	aliases: ['青木诀'],
} as TermDraft;

// -- TESTS -- //

describe('applyGlossaryAccentLabels', () => {
	it('labels a free text region that is exactly a technique term', () => {
		const out = applyGlossaryAccentLabels([{ id: 'r0', text: '青木剑诀', kind: 'free_text' }], [TECHNIQUE], new Map());
		expect(out.get('r0')).toEqual({ role: 'accent', source: 'glossary' });
	});

	it('ignores spaces, punctuation and brackets, and matches aliases', () => {
		const out = applyGlossaryAccentLabels(
			[
				{ id: 'r0', text: '【 青木剑诀 】', kind: 'free_text' },
				{ id: 'r1', text: '青木诀！', kind: 'free_text' },
			],
			[TECHNIQUE],
			new Map(),
		);
		expect(out.get('r0')?.source).toBe('glossary');
		expect(out.get('r1')?.source).toBe('glossary');
	});

	it('never labels speech bubbles or regions without a kind', () => {
		const out = applyGlossaryAccentLabels(
			[
				{ id: 'r0', text: '青木剑诀', kind: 'dialogue_bubble' },
				{ id: 'r1', text: '青木剑诀' },
			],
			[TECHNIQUE],
			new Map(),
		);
		expect(out.size).toBe(0);
	});

	it('ignores terms of other categories and longer text that only contains the term', () => {
		const character = { ...TECHNIQUE, category: 'character' } as TermDraft;
		const out = applyGlossaryAccentLabels(
			[
				{ id: 'r0', text: '青木剑诀', kind: 'free_text' },
				{ id: 'r1', text: '他用了青木剑诀', kind: 'free_text' },
			],
			[character],
			new Map(),
		);
		expect(out.size).toBe(0);
		expect(applyGlossaryAccentLabels([{ id: 'r1', text: '他用了青木剑诀', kind: 'free_text' }], [TECHNIQUE], new Map()).size).toBe(0);
	});

	it('keeps every model label as llm, never removes one, and does not modify the model map', () => {
		const model = new Map([['r5', 'accent' as const]]);
		const out = applyGlossaryAccentLabels([{ id: 'r5', text: '站住', kind: 'dialogue_bubble' }], [TECHNIQUE], model);
		expect(out.get('r5')).toEqual({ role: 'accent', source: 'llm' });
		expect([...model]).toEqual([['r5', 'accent']]);
	});

	it('normalises width, case and punctuation', () => {
		expect(normalizeAccentText('［Ｓｋｉｌｌ: Shadow Step］')).toBe('skillshadowstep');
	});
});

describe('page cache payload', () => {
	it('reads the v2 shape with styles for known regions only', () => {
		const got = parseContent(JSON.stringify({ v: 2, translations: { r0: 'A', r1: 'B' }, styles: { r1: 'accent', r9: 'accent', r0: 'x' } }));
		expect([...got.byRegion]).toEqual([
			['r0', 'A'],
			['r1', 'B'],
		]);
		expect([...got.styles]).toEqual([['r1', 'accent']]);
	});

	it('reads the older flat map with empty styles', () => {
		const got = parseContent(JSON.stringify({ r0: 'A', r1: 'B' }));
		expect(got.byRegion.size).toBe(2);
		expect(got.styles.size).toBe(0);
	});

	it('treats unreadable content as empty', () => {
		expect(parseContent('not json').byRegion.size).toBe(0);
		expect(parseContent('[1,2]').byRegion.size).toBe(0);
	});
});
