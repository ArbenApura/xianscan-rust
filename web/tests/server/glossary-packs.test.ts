// SYSTEM GLOSSARY PACKS AND PRECEDENCE HIERARCHY TESTS
// VERIFIES SYSTEM PACK LOADING, PRECEDENCE OVERRIDES, AND PINNING RULES.

// IMPORTED MODULES
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedGlossary, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

const { getEffectiveGlossary, getGlossaryPage } = await import('$lib/server/glossary');
const { matchTerms, invalidateAll } = await import('$lib/server/glossary-match');
const { listAvailablePacks, getActivePackTerms } = await import('$lib/server/glossary-packs');

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
	invalidateAll();
});

// -- TESTS -- //

describe('Glossary Packs Registry', () => {
	it('loads available packs and term counts', () => {
		const packs = listAvailablePacks();
		expect(packs.length).toBeGreaterThanOrEqual(7);
		const xianxia = packs.find((p) => p.theme === 'xianxia');
		expect(xianxia).toBeDefined();
		expect(xianxia?.termCount).toBeGreaterThan(0);

		const murim = packs.find((p) => p.theme === 'murim');
		expect(murim).toBeDefined();
		expect(murim?.termCount).toBeGreaterThan(0);
	});

	it('retrieves active pack terms by language pair', () => {
		const zhTerms = getActivePackTerms({ sourceLang: 'zh-Hans', targetLang: 'en' });
		expect(zhTerms.length).toBeGreaterThan(0);
		expect(zhTerms.some((t) => t.term.source === '金丹')).toBe(true);

		const koTerms = getActivePackTerms({ sourceLang: 'ko', targetLang: 'en' });
		expect(koTerms.length).toBeGreaterThan(0);
		expect(koTerms.some((t) => t.term.source === '무림')).toBe(true);

		const frTerms = getActivePackTerms({ sourceLang: 'fr', targetLang: 'en' });
		expect(frTerms.length).toBeGreaterThan(0);

		const esTerms = getActivePackTerms({ sourceLang: 'es', targetLang: 'en' });
		expect(esTerms.length).toBeGreaterThan(0);

		const ruTerms = getActivePackTerms({ sourceLang: 'ru', targetLang: 'en' });
		expect(ruTerms.length).toBe(179);

		const thTerms = getActivePackTerms({ sourceLang: 'th', targetLang: 'en' });
		expect(thTerms.length).toBe(179);

		expect(zhTerms.some((t) => t.term.source === '宗门' && t.term.target === 'Sect')).toBe(true);
		expect(zhTerms.some((t) => t.term.source === '教会' && t.term.target === 'Church')).toBe(true);
		expect(zhTerms.some((t) => t.term.source === '教廷' && t.term.target === 'Holy See')).toBe(true);
	});
});

describe('Effective Glossary Precedence Hierarchy', () => {
	beforeEach(() => {
		seedBook(db, { id: 'book-cultivation', sourceLang: 'zh-Hans', targetLang: 'en' });
	});

	it('includes system preset terms when no book overrides exist', async () => {
		const terms = await getEffectiveGlossary('book-cultivation');
		const sources = terms.map((t) => t.source);
		expect(sources).toContain('金丹');
		expect(sources).toContain('筑基');
	});

	it('allows user global term to override system preset term', async () => {
		// OVERRIDE 金丹 IN USER GLOBAL GLOSSARY
		seedGlossary(db, {
			scope: 'global',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			source: '金丹',
			target: 'Custom Global Golden Core',
		});

		const terms = await getEffectiveGlossary('book-cultivation');
		const term = terms.find((t) => t.source === '金丹');
		expect(term?.target).toBe('Custom Global Golden Core');
	});

	it('allows local book term to override both global and system preset terms', async () => {
		// GLOBAL TERM
		seedGlossary(db, {
			scope: 'global',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			source: '金丹',
			target: 'Global Translation',
		});

		// BOOK TERM OVERRIDE
		seedGlossary(db, {
			scope: 'book',
			bookId: 'book-cultivation',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			source: '金丹',
			target: 'Book Specific Gold Core',
			pinned: true,
		});

		const terms = await getEffectiveGlossary('book-cultivation');
		const term = terms.find((t) => t.source === '金丹');
		expect(term?.target).toBe('Book Specific Gold Core');
		expect(term?.pinned).toBe(true);
	});

	it('prioritizes pinned terms at the top of the effective list', async () => {
		seedGlossary(db, {
			scope: 'book',
			bookId: 'book-cultivation',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			source: '叶凡',
			target: 'Ye Fan',
			pinned: true,
		});

		const terms = await getEffectiveGlossary('book-cultivation');
		expect(terms[0].source).toBe('叶凡');
		expect(terms[0].pinned).toBe(true);
	});

	it('matches system preset terms in chapter text through matchTerms', async () => {
		const matched = await matchTerms('book-cultivation', '他终于突破到了金丹境界，开始闭关。');
		const sources = matched.map((t) => t.source);
		expect(sources).toContain('金丹');
		expect(sources).toContain('闭关');
	});
});

describe('Global Glossary Search with System Presets', () => {
	it('surfaces system preset terms in getGlossaryPage with isSystem flag', async () => {
		const res = await getGlossaryPage('global', null, {
			limit: 20,
			offset: 0,
			pair: { sourceLang: 'zh-Hans', targetLang: 'en' },
			q: '金丹',
			includeSystem: true,
		});

		expect(res.rows.length).toBeGreaterThanOrEqual(1);
		const row = res.rows.find((r) => r.source === '金丹');
		expect(row).toBeDefined();
		expect(row?.isSystem).toBe(true);
		expect(row?.packId).toContain('xianxia');
	});
});
