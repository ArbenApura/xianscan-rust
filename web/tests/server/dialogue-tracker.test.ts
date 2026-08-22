// DIALOGUE TRACKER TESTS — UNIT TESTS FOR ELASTIC BACKWARD TRACKING, CROSS-CHAPTER CONTEXT & PROMPT INJECTION

// IMPORTED DEP-MODULES
import { beforeEach, describe, expect, it } from 'vitest';
// IMPORTED MODULES
import {
	ChapterDialogueTracker,
	formatDialogueContextBlock,
	getDbDialogueContext,
	getRegionKindLabel,
	type DialogueContextWindow,
	type PageDialogueRecord,
} from '$lib/server/translate/dialogue-tracker';
import { db } from '$lib/server/db';
import { books, chapters, pages, regions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// -- TESTS -- //

describe('getRegionKindLabel', () => {
	it('maps region kinds to human-readable prompt labels', () => {
		expect(getRegionKindLabel('dialogue_bubble')).toBe('Bubble');
		expect(getRegionKindLabel(undefined)).toBe('Bubble');
		expect(getRegionKindLabel('thought')).toBe('Thought');
		expect(getRegionKindLabel('mono')).toBe('Thought');
		expect(getRegionKindLabel('free_text')).toBe('Free Text');
		expect(getRegionKindLabel('sfx')).toBe('SFX');
		expect(getRegionKindLabel('sound_effect')).toBe('SFX');
		expect(getRegionKindLabel('other')).toBe('Caption/UI');
	});
});

describe('ChapterDialogueTracker - Elastic Backward Window', () => {
	it('collects standard 3 previous pages when dialogue is normal', () => {
		const tracker = new ChapterDialogueTracker();

		for (let s = 0; s < 5; s++) {
			tracker.recordOcr(s, 100 + s, [
				{ id: 'r0', text: `Page ${s} L1`, kind: 'dialogue_bubble' },
				{ id: 'r1', text: `Page ${s} L2`, kind: 'dialogue_bubble' },
			]);
			tracker.recordTranslation(
				s,
				new Map([
					['r0', `Page ${s} Trans 1`],
					['r1', `Page ${s} Trans 2`],
				]),
			);
		}

		// FOR PAGE 4: SHOULD COLLECT PAGES 1, 2, 3 (3 NON-EMPTY PAGES, TOTAL 6 LINES)
		const ctx = tracker.getContextWindow(4);
		expect(ctx.previousPages).toHaveLength(3);
		expect(ctx.previousPages.map((p) => p.pageSeq)).toEqual([1, 2, 3]);
		expect(ctx.previousPages[2].lines[0].translatedText).toBe('Page 3 Trans 1');
	});

	it('stops at 2 pages if previous pages are dense with dialogues', () => {
		const tracker = new ChapterDialogueTracker();

		// PAGE 0: 6 LINES
		tracker.recordOcr(0, 100, Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, text: `P0 L${i}` })));
		tracker.recordTranslation(0, new Map(Array.from({ length: 6 }, (_, i) => [`r${i}`, `P0 T${i}`])));

		// PAGE 1: 7 LINES (TOTAL WITH PAGE 0 = 13 LINES >= 12)
		tracker.recordOcr(1, 101, Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, text: `P1 L${i}` })));
		tracker.recordTranslation(1, new Map(Array.from({ length: 7 }, (_, i) => [`r${i}`, `P1 T${i}`])));

		// PAGE 2: TARGET PAGE
		tracker.recordOcr(2, 102, [{ id: 'r0', text: 'P2 L0' }]);

		// QUERY FOR PAGE 2: SHOULD STOP AT 2 PAGES DUE TO DENSITY
		const ctx = tracker.getContextWindow(2);
		expect(ctx.previousPages).toHaveLength(2);
		expect(ctx.previousPages.map((p) => p.pageSeq)).toEqual([0, 1]);
	});

	it('expands up to 5 pages if dialogues are sparse (1 line each)', () => {
		const tracker = new ChapterDialogueTracker();

		for (let s = 0; s < 6; s++) {
			tracker.recordOcr(s, 100 + s, [{ id: 'r0', text: `Page ${s} Sparse` }]);
			tracker.recordTranslation(s, new Map([['r0', `Page ${s} Translated`]]));
		}

		// FOR PAGE 5: 1 LINE PER PAGE -> SHOULD EXPAND UP TO 5 PAGES (PAGES 0, 1, 2, 3, 4)
		const ctx = tracker.getContextWindow(5);
		expect(ctx.previousPages).toHaveLength(5);
		expect(ctx.previousPages.map((p) => p.pageSeq)).toEqual([0, 1, 2, 3, 4]);
	});

	it('skips silent/empty pages without counting them toward the budget', () => {
		const tracker = new ChapterDialogueTracker();

		// PAGE 0: DIALOGUE
		tracker.recordOcr(0, 100, [{ id: 'r0', text: 'P0 Dialogue' }]);
		tracker.recordTranslation(0, new Map([['r0', 'P0 Translated']]));

		// PAGE 1: SILENT ART SPREAD (0 LINES)
		tracker.recordOcr(1, 101, []);

		// PAGE 2: DIALOGUE
		tracker.recordOcr(2, 102, [{ id: 'r0', text: 'P2 Dialogue' }]);
		tracker.recordTranslation(2, new Map([['r0', 'P2 Translated']]));

		// PAGE 3: SILENT SPLASH (0 LINES)
		tracker.recordOcr(3, 103, []);

		// PAGE 4: TARGET
		tracker.recordOcr(4, 104, [{ id: 'r0', text: 'P4 Target' }]);

		// FOR PAGE 4: SHOULD SKIP PAGES 1 AND 3 AND RETURN [PAGE 0, PAGE 2]
		const ctx = tracker.getContextWindow(4);
		expect(ctx.previousPages).toHaveLength(2);
		expect(ctx.previousPages.map((p) => p.pageSeq)).toEqual([0, 2]);
	});

	it('pulls trailing pages from the preceding chapter when at the start of a chapter', () => {
		const tracker = new ChapterDialogueTracker();

		// SEED PRIOR CHAPTER WITH PAGES 18, 19
		tracker.seedPriorChapter([
			{
				pageSeq: 18,
				chapterTitle: 'Chapter 1',
				lines: [{ id: 'r0', sourceText: 'Ch1 P18 dialogue', translatedText: 'Ch1 P18 target' }],
				isTranslated: true,
			},
			{
				pageSeq: 19,
				chapterTitle: 'Chapter 1',
				lines: [{ id: 'r0', sourceText: 'Ch1 P19 dialogue', translatedText: 'Ch1 P19 target' }],
				isTranslated: true,
			},
		]);

		// CURRENT CHAPTER HAS PAGE 0 ONLY
		tracker.recordOcr(0, 200, [{ id: 'r0', text: 'Ch2 P0 dialogue' }]);
		tracker.recordTranslation(0, new Map([['r0', 'Ch2 P0 target']]));

		// QUERY FOR PAGE 1 (PAGE 0 IN CURRENT CHAPTER + P18, P19 FROM PREV CHAPTER)
		const ctx = tracker.getContextWindow(1);
		expect(ctx.previousPages).toHaveLength(3);
		expect(ctx.previousPages[0].isPriorChapter).toBe(true);
		expect(ctx.previousPages[0].pageSeq).toBe(18);
		expect(ctx.previousPages[1].isPriorChapter).toBe(true);
		expect(ctx.previousPages[1].pageSeq).toBe(19);
		expect(ctx.previousPages[2].isPriorChapter).toBeUndefined();
		expect(ctx.previousPages[2].pageSeq).toBe(0);
	});
});

describe('formatDialogueContextBlock', () => {
	it('formats previous context into clean prompt section with labels and prior chapter flags', () => {
		const mockContext: DialogueContextWindow = {
			previousPages: [
				{
					pageSeq: 19,
					isPriorChapter: true,
					lines: [{ id: 'r0', sourceText: '上一章结尾', translatedText: 'Previous chapter ending', kind: 'dialogue_bubble' }],
					isTranslated: true,
				},
				{
					pageSeq: 0,
					lines: [
						{ id: 'r0', sourceText: '叶凡：快走！', translatedText: 'Ye Fan: Leave now!', kind: 'dialogue_bubble' },
						{ id: 'r1', sourceText: '姬紫月：（妖气很重...）', translatedText: '(Demonic aura is heavy...)', kind: 'thought' },
					],
					isTranslated: true,
				},
			],
		};

		const formatted = formatDialogueContextBlock(mockContext);
		expect(formatted).toContain('=== DIALOGUE CONTEXT (Previous Pages) ===');
		expect(formatted).toContain('[Prev Chapter - Page 20 (Previous Context)]:');
		expect(formatted).toContain('- [Bubble] "上一章结尾" → "Previous chapter ending"');
		expect(formatted).toContain('[Page 1 (Previous Context)]:');
		expect(formatted).toContain('- [Bubble] "叶凡：快走！" → "Ye Fan: Leave now!"');
		expect(formatted).toContain('- [Thought] "姬紫月：（妖气很重...）" → "(Demonic aura is heavy...)"');
	});

	it('returns empty string when context is empty or null', () => {
		expect(formatDialogueContextBlock(null)).toBe('');
		expect(formatDialogueContextBlock({ previousPages: [] })).toBe('');
	});
});

describe('getDbDialogueContext', () => {
	const BOOK_ID = 'test-book-dialogue-cross';
	let chap1Id: number;
	let chap2Id: number;

	beforeEach(() => {
		// CLEAN UP AND SEED TEST DB
		db.delete(books).where(eq(books.id, BOOK_ID)).run();
		db.insert(books)
			.values({
				id: BOOK_ID,
				title: 'Cross Chapter Book',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
			})
			.run();

		const chap1 = db
			.insert(chapters)
			.values({
				bookId: BOOK_ID,
				seq: 1,
				title: 'Chapter 1',
				sourcePath: 'dummy1',
			})
			.returning({ id: chapters.id })
			.get();
		chap1Id = chap1.id;

		const chap2 = db
			.insert(chapters)
			.values({
				bookId: BOOK_ID,
				seq: 2,
				title: 'Chapter 2',
				sourcePath: 'dummy2',
			})
			.returning({ id: chapters.id })
			.get();
		chap2Id = chap2.id;

		// CHAPTER 1 PAGES (PAGE 0, 1)
		const c1p0 = db.insert(pages).values({ chapterId: chap1Id, seq: 0, filePath: 'c1p0.webp', status: 'done' }).returning({ id: pages.id }).get();
		const c1p1 = db.insert(pages).values({ chapterId: chap1Id, seq: 1, filePath: 'c1p1.webp', status: 'done' }).returning({ id: pages.id }).get();

		db.insert(regions).values([
			{ pageId: c1p0.id, seq: 0, box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10, kind: 'dialogue_bubble' }), textSource: 'Ch1 P0 text', textTarget: 'Ch1 P0 translated', status: 'translated' },
			{ pageId: c1p1.id, seq: 0, box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10, kind: 'dialogue_bubble' }), textSource: 'Ch1 P1 text', textTarget: 'Ch1 P1 translated', status: 'translated' },
		]).run();

		// CHAPTER 2 PAGES (PAGE 0, 1)
		const c2p0 = db.insert(pages).values({ chapterId: chap2Id, seq: 0, filePath: 'c2p0.webp', status: 'done' }).returning({ id: pages.id }).get();
		const c2p1 = db.insert(pages).values({ chapterId: chap2Id, seq: 1, filePath: 'c2p1.webp', status: 'done' }).returning({ id: pages.id }).get();

		db.insert(regions).values([
			{ pageId: c2p0.id, seq: 0, box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10, kind: 'thought' }), textSource: 'Ch2 P0 text', textTarget: 'Ch2 P0 translated', status: 'translated' },
			{ pageId: c2p1.id, seq: 0, box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10, kind: 'dialogue_bubble' }), textSource: 'Ch2 P1 text', textTarget: 'Ch2 P1 translated', status: 'translated' },
		]).run();
	});

	it('fetches cross-chapter trailing dialogue when querying Page 0 of Chapter 2', () => {
		const ctx = getDbDialogueContext(chap2Id, 0);
		// AT CHAPTER 2 PAGE 0, PREVIOUS PAGES SHOULD BE CHAPTER 1 PAGES
		expect(ctx.previousPages.length).toBeGreaterThan(0);
		expect(ctx.previousPages.some((p) => p.isPriorChapter)).toBe(true);
		expect(ctx.previousPages[ctx.previousPages.length - 1].lines[0].sourceText).toBe('Ch1 P1 text');
	});
});
