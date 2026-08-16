// GLOSSARY CSV ROUND-TRIP TESTS — THE IMPORT (PapaParse, LEGACY HEADERS, #gender TAGS, PIPE ALIASES) AND
// THE EXPORT (FORMULA-INJECTION GUARD, LOSSLESS ROUND-TRIP) CONTRACT THE API ROUTES DEPEND ON. xianslate
// HAD NO DEDICATED CSV SUITE — THESE PIN THE BEHAVIOUR FROM SCRATCH.

// IMPORTED DEP-MODULES
import Papa from 'papaparse';
// IMPORTED MODULES
import { describe, expect, it } from 'vitest';
import { parseGlossaryCsv, toGlossaryCsv } from '$lib/server/glossary-csv';

// -- TESTS -- //

describe('parseGlossaryCsv', () => {
	it('parses the canonical source,target,context,description format', () => {
		const terms = parseGlossaryCsv('source,target,context,description\n系统,System,The system UI,some note\n');
		expect(terms).toHaveLength(1);
		expect(terms[0]).toMatchObject({ source: '系统', target: 'System', context: 'The system UI', tags: null });
		expect(terms[0].gender).toBe('neuter');
		expect(terms[0].status).toBe('user'); // A CSV IMPORT IS USER-CURATED
	});

	it('accepts legacy raw/translation headers', () => {
		const terms = parseGlossaryCsv('raw,translation\n你好,Hello\n');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('你好');
		expect(terms[0].target).toBe('Hello');
	});

	it('derives gender from #masculine/#feminine tags and preserves other tags', () => {
		const terms = parseGlossaryCsv('source,target,description\n龙王,Dragon King,#masculine #myth\n圣女,Holy Maiden,#female\n');
		expect(terms[0].gender).toBe('masculine');
		expect(terms[0].tags).toBe('#myth');
		expect(terms[1].gender).toBe('feminine');
		expect(terms[1].tags).toBeNull();
	});

	it('parses pipe-separated aliases (commas stay inside forms)', () => {
		// THE ALIAS FIELD CONTAINS A COMMA → IT MUST BE QUOTED IN THE CSV (UNQUOTED COMMAS SPLIT COLUMNS).
		const terms = parseGlossaryCsv('source,target,aliases\n齐天大圣,Monkey King,"悟空 | 大圣, nickname"\n');
		expect(terms[0].aliases).toEqual(['悟空', '大圣, nickname']);
	});

	it('recognises pinned values and validates category', () => {
		const terms = parseGlossaryCsv('source,target,category,pinned\n系统,System,technique,★\n剑,Blade,bogus-category,yes\n');
		expect(terms[0].category).toBe('technique');
		expect(terms[0].pinned).toBe(true);
		expect(terms[1].category).toBeNull(); // NOT IN TERM_CATEGORIES → null
		expect(terms[1].pinned).toBe(true);
	});

	it('silently skips rows missing source or target', () => {
		const terms = parseGlossaryCsv('source,target\n,MissingTarget\nMissingSource,\n系统,System\n');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('系统');
	});

	it('throws on a structurally malformed CSV (unterminated quote)', () => {
		expect(() => parseGlossaryCsv('source,target\n"unterminated\n')).toThrow(/Malformed CSV/);
	});

	it('enforces the row cap', () => {
		const rows = Array.from({ length: 100_001 }, (_, i) => `s${i},t${i}`).join('\n');
		const csv = `source,target\n${rows}`;
		expect(() => parseGlossaryCsv(csv)).toThrow(/Too many rows/);
	});
});

describe('toGlossaryCsv + round-trip', () => {
	it('round-trips gender/tags/aliases/pinned/category/context losslessly', () => {
		const terms = parseGlossaryCsv(
			toGlossaryCsv([
				{
					source: '龙王',
					target: 'Dragon King',
					gender: 'masculine',
					context: 'ruler of the East Sea',
					category: 'character',
					pinned: true,
					aliases: ['龙君', '东海龙王'],
					tags: '#myth',
					status: 'user',
				},
			]),
		);
		expect(terms).toHaveLength(1);
		expect(terms[0]).toMatchObject({
			source: '龙王',
			target: 'Dragon King',
			gender: 'masculine',
			context: 'ruler of the East Sea',
			category: 'character',
			pinned: true,
			aliases: ['龙君', '东海龙王'],
			tags: '#myth',
			status: 'user',
		});
	});

	it('neutralises spreadsheet formulas with a tab prefix, stripped on re-import', () => {
		const csv = toGlossaryCsv([
			{ source: '=HYPERLINK("evil")', target: '=2+2', gender: 'neuter', context: '-cmd', status: 'user' },
		]);
		// PAPA QUOTES FIELDS CONTAINING A TAB (WHITESPACE) — PARSE THE RAW EXPORT TO SEE THE GUARD.
		const raw = Papa.parse<Record<string, string>>(csv, { header: true }).data[0];
		expect(raw.source.startsWith('\t')).toBe(true);
		expect(raw.target.startsWith('\t')).toBe(true);
		expect(raw.context.startsWith('\t')).toBe(true);

		// THE TAB IS TRIMMED ON RE-IMPORT (LOSSLESS ROUND-TRIP).
		const terms = parseGlossaryCsv(csv);
		expect(terms[0].source).toBe('=HYPERLINK("evil")');
		expect(terms[0].target).toBe('=2+2');
		expect(terms[0].context).toBe('-cmd');
	});

	it('exports a stable header line', () => {
		const csv = toGlossaryCsv([{ source: 'a', target: 'b', gender: 'neuter', status: 'user' }]);
		const header = csv.split(/\r?\n/)[0]; // PAPA UNPARSE DEFAULTS TO \r\n LINE ENDINGS
		expect(header).toBe('source,target,context,category,pinned,aliases,description');
	});
});
