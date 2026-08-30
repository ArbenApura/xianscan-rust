// GLOSSARY SERVER-LOGIC TESTS (PORTED FROM xianslate, SQLITE DIALECT, SINGLE-USER) — CRUD, EFFECTIVE
// MERGE, BULK IMPORT, NEW-TERMS ADDITION, SEARCH/PAGINATION, AND THE PURE CHUNKER BEHIND EXTRACTION.

// IMPORTED MODULES
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { glossary as glossaryTable } from '$lib/server/db/schema';
import { getTestDb, resetDb, seedBook, seedChapter, seedGlossary, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

const {
	bookPair,
	chunkForExtraction,
	addTerm,
	updateTerm,
	deleteTerm,
	deleteTerms,
	clearGlossaryScope,
	batchUpdateTerms,
	mergeGlossary,
	addNewTerms,
	getEffectiveGlossary,
	getGlossaryPage,
} = await import('$lib/server/glossary');

const PAIR = { sourceLang: 'zh-Hans', targetLang: 'en' };

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
});

// -- TESTS -- //

describe('chunkForExtraction', () => {
	it('empty content yields no chunks', () => {
		expect(chunkForExtraction('')).toEqual([]);
		expect(chunkForExtraction('   \n\n ')).toEqual([]);
	});

	it('a single short paragraph is one chunk', () => {
		expect(chunkForExtraction('just a paragraph')).toEqual(['just a paragraph']);
	});

	it('keeps paragraphs aligned and splits at paragraph boundaries when over the cap', () => {
		// 2 PARAGRAPHS × 6000 CHARS — UNDER THE 9000-CHAR CAP INDIVIDUALLY, TOGETHER OVER
		const big = '字'.repeat(6000);
		const chunks = chunkForExtraction(`${big}\n\n${big}`);
		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toBe(big);
		expect(chunks[1]).toBe(big);
	});

	it('a single over-cap paragraph becomes its own (oversized) chunk', () => {
		const huge = 'x'.repeat(20_000);
		const chunks = chunkForExtraction(huge);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toBe(huge);
	});
});

describe('addTerm + getGlossaryPage', () => {
	it('adds a global term and lists it with parsed aliases', async () => {
		const row = await addTerm(
			'global',
			null,
			{
				source: '系统',
				target: 'System',
				gender: 'neuter',
				aliases: ['系统君'],
			},
			PAIR,
		);

		expect(row.status).toBe('user');
		expect(row.bookId).toBeNull();

		const { rows, total } = await getGlossaryPage('global', null, { limit: 50, offset: 0, pair: PAIR });
		expect(total).toBe(1);
		expect(rows[0].source).toBe('系统');
		expect(rows[0].aliases).toEqual(['系统君']);
	});

	it('upserts on duplicate source instead of throwing UNIQUE constraint error', async () => {
		seedBook(db, { id: 'b1' });
		const term1 = await addTerm('book', 'b1', { source: '武魂', target: 'Martial Spirit', gender: 'neuter' }, PAIR);
		expect(term1.target).toBe('Martial Spirit');

		// RE-ADDING THE SAME SOURCE WITH A NEW TARGET OVERWRITES/UPGRADES THE TERM
		const term2 = await addTerm('book', 'b1', { source: '武魂', target: 'Martial Soul', gender: 'neuter', category: 'concept' }, PAIR);
		expect(term2.target).toBe('Martial Soul');
		expect(term2.category).toBe('concept');

		const { rows, total } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(total).toBe(1);
		expect(rows[0].target).toBe('Martial Soul');
	});

	it('searches source and target case-insensitively (ASCII), treating LIKE wildcards literally', async () => {
		await addTerm('global', null, { source: 'System', target: '系统', gender: 'neuter' }, PAIR);
		await addTerm('global', null, { source: '100%真实', target: '100% Real', gender: 'neuter' }, PAIR);

		const byTarget = await getGlossaryPage('global', null, { q: 'system', limit: 50, offset: 0, pair: PAIR });
		expect(byTarget.rows.map((r) => r.source)).toEqual(['System']);

		const literalPercent = await getGlossaryPage('global', null, { q: '100%', limit: 50, offset: 0, pair: PAIR });
		expect(literalPercent.rows.map((r) => r.source)).toEqual(['100%真实']);
	});

	it('paginates', async () => {
		for (const s of ['a', 'b', 'c']) {
			await addTerm('global', null, { source: s, target: `T${s}`, gender: 'neuter' }, PAIR);
		}
		const page1 = await getGlossaryPage('global', null, { limit: 2, offset: 0, pair: PAIR });
		expect(page1.rows).toHaveLength(2);
		expect(page1.total).toBe(3);
		const page2 = await getGlossaryPage('global', null, { limit: 2, offset: 2, pair: PAIR });
		expect(page2.rows).toHaveLength(1);
	});

	it('book scope rows are visible only for their book; global rows are pair-filtered', async () => {
		seedBook(db, { id: 'b1' });
		seedBook(db, { id: 'b2' });
		await addTerm('book', 'b1', { source: '主角', target: 'MC', gender: 'neuter' }, PAIR);

		const b1 = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		const b2 = await getGlossaryPage('book', 'b2', { limit: 50, offset: 0 });
		expect(b1.total).toBe(1);
		expect(b2.total).toBe(0);

		// A FRENCH GLOBAL TERM MUST NOT LEAK INTO THE zh-Hans → en EDITOR VIEW.
		await addTerm(
			'global',
			null,
			{ source: 'Système', target: 'System', gender: 'neuter' },
			{ sourceLang: 'fr', targetLang: 'en' },
		);
		const zh = await getGlossaryPage('global', null, { limit: 50, offset: 0, pair: PAIR });
		expect(zh.rows.map((r) => r.source)).not.toContain('Système');
	});

	it('resolves first-appearance chapter seq via LEFT JOIN', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 3, title: '三章' });
		// ONLY THE EXTRACTION PATH (addNewTerms) STAMPS first_chapter_id — THE PRODUCTION SHAPE OF THIS TEST.
		await addNewTerms('b1', [{ source: '主角', target: 'MC', gender: 'neuter' }], chapter.id);

		const { rows } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(rows[0].firstSeq).toBe(3);
		expect(rows[0].firstChapterTitle).toBe('三章');
	});
});

describe('updateTerm', () => {
	it('patches only provided fields and returns the row', async () => {
		const row = await addTerm(
			'global',
			null,
			{
				source: '系统',
				target: 'System',
				gender: 'neuter',
				context: 'old note',
				pinned: false,
			},
			PAIR,
		);

		const updated = await updateTerm(row.id, { pinned: true, context: '' });
		expect(updated?.pinned).toBe(true);
		expect(updated?.context).toBeNull(); // EMPTY STRING CLEARS THE NOTE
		expect(updated?.source).toBe('系统'); // UNTOUCHED FIELD KEEPS ITS VALUE
	});

	it('returns null for a missing id', async () => {
		expect(await updateTerm(999, { pinned: true })).toBeNull();
	});

	it('a human edit confirms the term (status → user, never downgraded)', async () => {
		seedBook(db, { id: 'b1' });
		const { added } = await addNewTerms('b1', [{ source: '系统', target: 'System', gender: 'neuter' }]);
		expect(added).toBe(1);

		const [row] = db.select().from(glossaryTable).all();
		expect(row.status).toBe('ai');

		const updated = await updateTerm(row.id, { target: 'Sys' });
		expect(updated?.status).toBe('user');
	});
});

describe('deleteTerm', () => {
	it('removes the term; missing id is a no-op', async () => {
		const row = await addTerm('global', null, { source: '系统', target: 'System', gender: 'neuter' }, PAIR);
		await deleteTerm(row.id);
		const { total } = await getGlossaryPage('global', null, { limit: 50, offset: 0, pair: PAIR });
		expect(total).toBe(0);
		await expect(deleteTerm(999)).resolves.toBeUndefined();
	});
});

describe('mergeGlossary (bulk import)', () => {
	it('reports added/updated and is atomic', async () => {
		seedBook(db, { id: 'b1' });
		const first = await mergeGlossary(
			'book',
			'b1',
			[
				{ source: '主角', target: 'MC', gender: 'neuter' },
				{ source: '系统', target: 'System', gender: 'neuter' },
			],
			PAIR,
		);
		expect(first).toEqual({ added: 2, updated: 0 });

		const second = await mergeGlossary(
			'book',
			'b1',
			[
				{ source: '主角', target: 'Protagonist', gender: 'neuter' },
				{ source: '新词', target: 'New', gender: 'neuter' },
			],
			PAIR,
		);
		expect(second).toEqual({ added: 1, updated: 1 });
	});

	it('de-dupes by source last-wins within one batch', async () => {
		const { added, updated } = await mergeGlossary(
			'global',
			null,
			[
				{ source: '系统', target: 'First', gender: 'neuter' },
				{ source: '系统', target: 'Last', gender: 'neuter' },
			],
			PAIR,
		);
		expect(added).toBe(1);
		expect(updated).toBe(0);
		const { rows } = await getGlossaryPage('global', null, { limit: 50, offset: 0, pair: PAIR });
		expect(rows[0].target).toBe('Last');
	});

	it('skips blank source/target rows entirely', async () => {
		const result = await mergeGlossary(
			'global',
			null,
			[
				{ source: '   ', target: 'X', gender: 'neuter' },
				{ source: '系统', target: 'System', gender: 'neuter' },
			],
			PAIR,
		);
		expect(result).toEqual({ added: 1, updated: 0 });
	});

	it('keeps first_chapter_id immutable on conflict', async () => {
		seedBook(db, { id: 'b1' });
		const c5 = seedChapter(db, { bookId: 'b1', seq: 5 });
		const c9 = seedChapter(db, { bookId: 'b1', seq: 9 });
		await mergeGlossary(
			'book',
			'b1',
			[{ source: '主角', target: 'MC', gender: 'neuter', firstChapterId: c5.id }],
			PAIR,
		);
		await mergeGlossary(
			'book',
			'b1',
			[{ source: '主角', target: 'MC2', gender: 'neuter', firstChapterId: c9.id }],
			PAIR,
		);

		const { rows } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(rows[0].firstChapterId).toBe(c5.id); // FIRST APPEARANCE IS IMMUTABLE
		expect(rows[0].target).toBe('MC2'); // BUT THE REST OF THE ROW UPDATED
	});
});

describe('addNewTerms', () => {
	it('adds only missing terms, stamping status ai and the first-appearance chapter', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		// AN ESTABLISHED GLOBAL TERM (SAME PAIR) MUST BLOCK THE BOOK-LEVEL ADD.
		await addTerm('global', null, { source: '系统', target: 'System', gender: 'neuter' }, PAIR);

		const result = await addNewTerms(
			'b1',
			[
				{ source: '系统', target: 'Tampered', gender: 'neuter' },
				{ source: '新词', target: 'New', gender: 'neuter' },
			],
			chapter.id,
		);
		expect(result).toEqual({ added: 1, skipped: 1 });

		const { rows } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('新词');
		expect(rows[0].status).toBe('ai');
		expect(rows[0].firstChapterId).toBe(chapter.id);
	});

	it('empty input is a no-op', async () => {
		seedBook(db, { id: 'b1' });
		expect(await addNewTerms('b1', [])).toEqual({ added: 0, skipped: 0 });
	});

	it("dedups against an existing term's alias (alternate form resolves to the canonical entry)", async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		// ESTABLISH A TERM WHOSE ALIAS IS A DIFFERENT FORM OF THE SAME ENTITY.
		await addTerm(
			'book',
			'b1',
			{ source: '烈焰妖狐', target: 'Blazing Fox', gender: 'neuter', aliases: ['欢火足'] },
			PAIR,
		);

		// A LATER PAGE RE-DISCOVERS THE ALIAS FORM (AS AN OCR VARIANT) — IT MUST BE FOLDED INTO THE EXISTING
		// TERM, NOT ADDED AS A DUPLICATE.
		const result = await addNewTerms(
			'b1',
			[{ source: '欢火足', target: 'Huan Huo Zu', gender: 'neuter' }],
			chapter.id,
		);
		expect(result).toEqual({ added: 0, skipped: 1 });

		const { rows } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('烈焰妖狐');
		expect(rows[0].target).toBe('Blazing Fox'); // NOT overwritten by the re-discovered variant
	});

	it('dedups within the same batch by source and by alias', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });

		// TWO ENTRIES IN ONE CALL: THE SECOND'S source COLLIDES WITH THE FIRST'S ALIAS → DROPPED.
		const result = await addNewTerms(
			'b1',
			[
				{ source: '妖灵师', target: 'demon spiritualist', gender: 'neuter', aliases: ['妖灵'] },
				{ source: '妖灵', target: 'DUPLICATE', gender: 'neuter' },
			],
			chapter.id,
		);
		expect(result).toEqual({ added: 1, skipped: 1 });

		const { rows } = await getGlossaryPage('book', 'b1', { limit: 50, offset: 0 });
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('妖灵师');
	});
});

describe('getEffectiveGlossary', () => {
	it('merges global ∪ book with book overriding global on the same source', async () => {
		seedBook(db, { id: 'b1' });
		await addTerm('global', null, { source: '系统', target: 'System', gender: 'neuter', pinned: true }, PAIR);
		await addTerm('global', null, { source: '主角', target: 'Global MC', gender: 'neuter' }, PAIR);
		await addTerm('book', 'b1', { source: '主角', target: 'Book MC', gender: 'neuter' }, PAIR);
		await addTerm('book', 'b1', { source: '独有', target: 'Only here', gender: 'neuter' }, PAIR);

		const terms = await getEffectiveGlossary('b1', { includeSystem: false });
		const bySource = new Map(terms.map((t) => [t.source, t.target]));
		expect(bySource.get('系统')).toBe('System');
		expect(bySource.get('主角')).toBe('Book MC'); // BOOK WINS
		expect(bySource.get('独有')).toBe('Only here');
		expect(terms).toHaveLength(3);
	});

	it('ignores global terms of other language pairs', async () => {
		seedBook(db, { id: 'b1' });
		await addTerm(
			'global',
			null,
			{ source: 'Système', target: 'System', gender: 'neuter' },
			{ sourceLang: 'fr', targetLang: 'en' },
		);
		expect(await getEffectiveGlossary('b1', { includeSystem: false })).toHaveLength(0);
	});

	it('bookPair falls back to the zh-Hans → en default for an unknown book', async () => {
		expect(await bookPair('nope')).toEqual({ sourceLang: 'zh-Hans', targetLang: 'en' });
	});

	it('seedGlossary rows are picked up after an explicit invalidate (cache bypass)', async () => {
		seedBook(db, { id: 'b1' });
		seedGlossary(db, { scope: 'book', bookId: 'b1', source: '直达', target: 'Direct' });
		// seedGlossary INSERTS RAW SQL — THE AUTOMATON CACHE IS UNAWARE, SO INVALIDATE MANUALLY (AS THE
		// PRODUCTION WRITE PATHS DO VIA mergeGlossary / addTerm).
		const { invalidateBook } = await import('$lib/server/glossary-match');
		invalidateBook('b1');
		const terms = await getEffectiveGlossary('b1', { includeSystem: false });
		expect(terms.map((t) => t.source)).toContain('直达');
	});
});

describe('batch glossary operations', () => {
	it('deleteTerms deletes multiple entries and invalidates cache', async () => {
		seedBook(db, { id: 'b_batch' });
		const t1 = await addTerm('book', 'b_batch', { source: 'Term1', target: 'T1', gender: 'neuter' }, PAIR);
		const t2 = await addTerm('book', 'b_batch', { source: 'Term2', target: 'T2', gender: 'neuter' }, PAIR);
		const t3 = await addTerm('book', 'b_batch', { source: 'Term3', target: 'T3', gender: 'neuter' }, PAIR);

		const deletedCount = await deleteTerms([t1.id, t2.id], 'book', 'b_batch');
		expect(deletedCount).toBe(2);

		const remaining = await getEffectiveGlossary('b_batch', { includeSystem: false });
		expect(remaining).toHaveLength(1);
		expect(remaining[0].source).toBe('Term3');
	});

	it('clearGlossaryScope deletes all terms for book scope', async () => {
		seedBook(db, { id: 'b_clear' });
		await addTerm('book', 'b_clear', { source: 'A', target: '1', gender: 'neuter' }, PAIR);
		await addTerm('book', 'b_clear', { source: 'B', target: '2', gender: 'neuter' }, PAIR);
		await addTerm('global', null, { source: 'G', target: 'Global', gender: 'neuter' }, PAIR);

		const count = await clearGlossaryScope('book', 'b_clear');
		expect(count).toBe(2);

		const bookTerms = await getGlossaryPage('book', 'b_clear', { limit: 10, offset: 0 });
		expect(bookTerms.total).toBe(0);

		// Global terms remain unaffected
		const globalTerms = await getGlossaryPage('global', null, { limit: 10, offset: 0, pair: PAIR });
		expect(globalTerms.total).toBe(1);
	});

	it('clearGlossaryScope deletes terms for a specific global language pair', async () => {
		await addTerm('global', null, { source: 'ZH1', target: 'EN1', gender: 'neuter' }, PAIR);
		await addTerm('global', null, { source: 'ZH2', target: 'EN2', gender: 'neuter' }, PAIR);
		await addTerm(
			'global',
			null,
			{ source: 'FR1', target: 'EN1', gender: 'neuter' },
			{ sourceLang: 'fr', targetLang: 'en' },
		);

		const count = await clearGlossaryScope('global', null, PAIR);
		expect(count).toBe(2);

		const zhGlobals = await getGlossaryPage('global', null, { limit: 10, offset: 0, pair: PAIR });
		expect(zhGlobals.total).toBe(0);

		const frGlobals = await getGlossaryPage('global', null, {
			limit: 10,
			offset: 0,
			pair: { sourceLang: 'fr', targetLang: 'en' },
		});
		expect(frGlobals.total).toBe(1);
	});

	it('batchUpdateTerms updates pin, category, and gender across selected IDs', async () => {
		seedBook(db, { id: 'b_up' });
		const t1 = await addTerm('book', 'b_up', { source: 'C1', target: 'T1', gender: 'neuter', pinned: false }, PAIR);
		const t2 = await addTerm('book', 'b_up', { source: 'C2', target: 'T2', gender: 'neuter', pinned: false }, PAIR);

		const updatedCount = await batchUpdateTerms(
			[t1.id, t2.id],
			{ pinned: true, category: 'character' },
			'book',
			'b_up',
		);
		expect(updatedCount).toBe(2);

		const effective = await getEffectiveGlossary('b_up', { includeSystem: false });
		expect(effective.every((t) => t.pinned)).toBe(true);
		expect(effective.every((t) => t.category === 'character')).toBe(true);
	});
});
