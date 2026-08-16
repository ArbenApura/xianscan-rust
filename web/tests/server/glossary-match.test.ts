// GLOSSARY-MATCHING TESTS (PORTED FROM xianslate) — THE LONGEST-MATCH / WORD-BOUNDARY / ALIAS LOGIC
// BEHIND TERM INJECTION, AGAINST IN-MEMORY SQLITE.
//
// REGRESSION PINS: (a) THE COVERAGE-AWARE LONGEST-MATCH RULE — 齊天 MUST SURVIVE WHEN IT ALSO APPEARS ON
// ITS OWN ALONGSIDE 齊天神丹 (THE BUG THAT ERASED PROPER NOUNS); (b) A TRUE FRAGMENT (ONLY EVER INSIDE A
// LONGER TERM) IS DROPPED; (c) WORD-DELIMITED LANGUAGES DON'T MATCH INSIDE WORDS ("art" in "start");
// (d) CJK MATCHES SUBSTRING-WISE; (e) ALIASES MATCH AND RESOLVE TO THE SAME TERM.

// IMPORTED MODULES
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedGlossary, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

const { matchTerms, sourcesPresentIn, invalidateAll, invalidateBook } = await import('$lib/server/glossary-match');

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
	invalidateAll();
});

// -- HELPERS -- //

async function seedTerm(b: { bookId?: string; scope: 'global' | 'book'; sourceLang: string; targetLang: string; source: string; aliases?: string[] }) {
	seedGlossary(db, {
		scope: b.scope,
		bookId: b.bookId,
		sourceLang: b.sourceLang,
		targetLang: b.targetLang,
		source: b.source,
		target: 'X',
		aliases: b.aliases,
	});
}

// -- TESTS -- //

describe('matchTerms — CJK (substring) matching + coverage-aware longest match', () => {
	beforeEach(() => {
		seedBook(db, { id: 'b1', sourceLang: 'zh-Hant', targetLang: 'en' });
	});

	it('keeps a term that appears both alone and inside a longer matched term (齊天 regression)', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '齊天' });
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '齊天神丹' });
		invalidateBook('b1');
		const terms = await matchTerms('b1', '齊天 與 齊天神丹 齊天');
		const sources = terms.map((t) => t.source).sort();
		expect(sources).toContain('齊天');
		expect(sources).toContain('齊天神丹');
	});

	it('drops a term whose every occurrence sits inside a longer matched term (true fragment)', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '山' });
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '高山' });
		invalidateBook('b1');
		const terms = await matchTerms('b1', '高山之上');
		expect(terms.map((t) => t.source)).toEqual(['高山']);
	});

	it('matches substring-wise for CJK (scriptura continua)', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '劍' });
		invalidateBook('b1');
		expect((await matchTerms('b1', '長劍出鞘')).map((t) => t.source)).toEqual(['劍']);
	});
});

describe('matchTerms — word-delimited languages', () => {
	beforeEach(() => {
		seedBook(db, { id: 'b1', sourceLang: 'en', targetLang: 'zh-Hant' });
	});

	it('does NOT match "art" inside "start" (word boundary required)', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'en', targetLang: 'zh-Hant', source: 'art' });
		invalidateBook('b1');
		expect(await matchTerms('b1', 'this is the start of the story')).toHaveLength(0);
	});

	it('matches "art" as a standalone word and at punctuation boundaries', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'en', targetLang: 'zh-Hant', source: 'art' });
		invalidateBook('b1');
		expect((await matchTerms('b1', 'The art of war; art!')).map((t) => t.source)).toEqual(['art']);
	});
});

describe('aliases', () => {
	beforeEach(() => {
		seedBook(db, { id: 'b1', sourceLang: 'zh-Hant', targetLang: 'en' });
	});

	it('matches an alias and resolves to the owning term', async () => {
		await seedTerm({
			bookId: 'b1',
			scope: 'book',
			sourceLang: 'zh-Hant',
			targetLang: 'en',
			source: '齊天大聖',
			aliases: ['孫悟空', '大聖'],
		});
		invalidateBook('b1');
		const terms = await matchTerms('b1', '孫悟空與齊天大聖');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('齊天大聖');
	});

	it('a shared alias resolves deterministically to the first term (source wins its own key)', async () => {
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '悟空', aliases: ['行者'] });
		await seedTerm({ bookId: 'b1', scope: 'book', sourceLang: 'zh-Hant', targetLang: 'en', source: '孫行者', aliases: ['行者'] });
		invalidateBook('b1');
		const terms = await matchTerms('b1', '行者');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('悟空'); // FIRST TERM CLAIMS THE SHARED ALIAS
	});
});

describe('cache invalidation', () => {
	it('matchTerms picks up freshly merged terms immediately (no restart needed)', async () => {
		seedBook(db, { id: 'b1', sourceLang: 'zh-Hans', targetLang: 'en' });
		// EMPTY GLOSSARY → EMPTY MATCH (AUTOMATON BUILT AND CACHED)
		expect(await matchTerms('b1', '主角登场')).toHaveLength(0);

		// THE REAL WRITE PATH (mergeGlossary) INVALIDATES THE CACHE — A NEW TERM MATCHES RIGHT AWAY.
		const { mergeGlossary } = await import('$lib/server/glossary');
		await mergeGlossary('book', 'b1', [{ source: '主角', target: 'MC', gender: 'neuter' }], {
			sourceLang: 'zh-Hans',
			targetLang: 'en',
		});
		expect((await matchTerms('b1', '主角登场')).map((t) => t.source)).toEqual(['主角']);
	});
});

describe('sourcesPresentIn — the "new to this chapter" set', () => {
	beforeEach(() => {
		seedBook(db, { id: 'b1', sourceLang: 'en', targetLang: 'zh-Hant' });
	});

	it('returns exactly the candidate sources present, honoring word boundaries', async () => {
		// NOTE: 'king' MUST NOT MATCH INSIDE 'kings' — THE FIXTURE USES THE STANDALONE FORM.
		const present = await sourcesPresentIn('b1', 'the sword and the shield of the king', ['sword', 'king', 'art']);
		expect([...present].sort()).toEqual(['king', 'sword']);
	});
});
