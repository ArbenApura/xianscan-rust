// RE-TRANSLATION CLEARING TESTS — VERIFIES THAT PRE-EXISTING TRANSLATION RESULTS,
// REGIONS, DISK FILES, AND DIALOGUE CONTEXT ARE CLEARED FIRST WHEN TRANSLATING PAGES.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { eq, inArray } from 'drizzle-orm';
import type OpenAI from 'openai';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';
import type { AnalyzeResult, PipelineClient } from '$lib/server/pipeline-client';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { pages, regions, translations } from '$lib/server/db/schema';
import { ChapterDialogueTracker } from '$lib/server/translate/dialogue-tracker';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- FAKES -- //

const PAGE_PNG = (() => {
	const c = createCanvas(200, 300);
	const x = c.getContext('2d');
	x.fillStyle = 'white';
	x.fillRect(0, 0, 200, 300);
	return c.toBuffer('image/png');
})();

class FakePipeline implements PipelineClient {
	async preprocess(image: Buffer): Promise<Buffer> {
		return image;
	}

	async analyze(_image: Buffer): Promise<AnalyzeResult> {
		return {
			width: 200,
			height: 300,
			backend: 'comic-ctd',
			regions: [
				{
					id: 'r0',
					box: { x: 20, y: 30, w: 100, h: 40 },
					polygon: [
						[20, 30],
						[120, 30],
						[120, 70],
						[20, 70],
					],
					text: '新台词',
					confidence: 0.95,
					vertical: false,
				},
			],
		};
	}

	async clean(image: Buffer): Promise<Buffer> {
		return image;
	}

	async health() {
		return { status: 'ok', detector: 'comic-ctd', inpainter: 'opencv' };
	}
}

function fakeLlm(translationsMap: Record<string, string> = { r0: 'New Line' }) {
	const client = {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: JSON.stringify(translationsMap) } }],
					usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
				}),
			},
		},
	} as unknown as OpenAI;
	return client;
}

// -- STATES -- //

let db: TestDb;
let dataRoot: string;
let pipeline: FakePipeline;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
	dataRoot = mkdtempSync(join(tmpdir(), 'mt-retrans-'));
	pipeline = new FakePipeline();
});

afterEach(() => {
	try {
		rmSync(dataRoot, { recursive: true, force: true });
	} catch {
		// IGNORE CLEANUP ERRORS
	}
});

// -- TESTS -- //

describe('re-translation clearing of pre-existing page results', () => {
	it('clears DB regions, translations, and disk files before start emission and dialogue seeding', async () => {
		const book = seedBook(db, { id: 'book_retrans_1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });

		// SEED TWO PAGES THAT ARE ALREADY TRANSLATED
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 1 });

		mkdirSync(join(dataRoot, 'raw', String(chapter.id)), { recursive: true });
		mkdirSync(join(dataRoot, 'clean', String(chapter.id)), { recursive: true });
		mkdirSync(join(dataRoot, 'output', String(chapter.id)), { recursive: true });

		const rawP1 = `raw/${chapter.id}/0.png`;
		const rawP2 = `raw/${chapter.id}/1.png`;
		const cleanP1 = `clean/${chapter.id}/0.webp`;
		const cleanP2 = `clean/${chapter.id}/1.webp`;
		const outP1 = `output/${chapter.id}/0.webp`;
		const outP2 = `output/${chapter.id}/1.webp`;

		writeFileSync(join(dataRoot, rawP1), PAGE_PNG);
		writeFileSync(join(dataRoot, rawP2), PAGE_PNG);
		writeFileSync(join(dataRoot, cleanP1), Buffer.from('old_clean_1'));
		writeFileSync(join(dataRoot, cleanP2), Buffer.from('old_clean_2'));
		writeFileSync(join(dataRoot, outP1), Buffer.from('old_out_1'));
		writeFileSync(join(dataRoot, outP2), Buffer.from('old_out_2'));

		// SET PAGES AS DONE IN DB WITH OLD TRANSLATIONS AND REGIONS
		db.update(pages)
			.set({
				filePath: rawP1,
				cleanedPath: cleanP1,
				outputPath: outP1,
				status: 'done',
			})
			.where(eq(pages.id, p1.id))
			.run();

		db.update(pages)
			.set({
				filePath: rawP2,
				cleanedPath: cleanP2,
				outputPath: outP2,
				status: 'done',
			})
			.where(eq(pages.id, p2.id))
			.run();

		db.insert(regions)
			.values([
				{
					pageId: p1.id,
					seq: 0,
					box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10 }),
					polygon: '[]',
					textSource: '旧台词1',
					textTarget: 'Old Line 1',
					status: 'translated',
				},
				{
					pageId: p2.id,
					seq: 0,
					box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10 }),
					polygon: '[]',
					textSource: '旧台词2',
					textTarget: 'Old Line 2',
					status: 'translated',
				},
			])
			.run();

		db.insert(translations)
			.values([
				{ pageId: p1.id, cacheKey: 'key_1', contentTarget: JSON.stringify({ r0: 'Old Line 1' }), model: 'mock-model' },
				{ pageId: p2.id, cacheKey: 'key_2', contentTarget: JSON.stringify({ r0: 'Old Line 2' }), model: 'mock-model' },
			])
			.run();

		const events: any[] = [];
		const emit = (e: any) => events.push(e);
		const ctrl = new AbortController();

		// EXECUTE RE-TRANSLATION TARGETING BOTH PAGES
		const work = chapterWork(
			chapter.id,
			{
				pipeline,
				llm: fakeLlm({ r0: 'New Translated Text' }),
				dataRoot,
				pageConcurrency: 1,
				force: true,
			},
			[p1.id, p2.id],
		);

		await work(ctrl.signal, emit);

		// VERIFY START EVENT EMITTED TARGET PAGES AS PENDING
		const startEvent = events.find((e) => e.type === 'start');
		expect(startEvent).toBeDefined();
		expect(startEvent.pages.every((p: any) => p.status === 'pending')).toBe(true);

		// VERIFY FINAL REGIONS HAVE THE NEW TEXT
		const finalRegions = db
			.select()
			.from(regions)
			.where(inArray(regions.pageId, [p1.id, p2.id]))
			.all();
		expect(finalRegions.length).toBe(2);
		expect(finalRegions[0].textSource).toBe('新台词');
		expect(finalRegions[0].textTarget).toBe('New Translated Text');
	});

	it('ChapterDialogueTracker clearPage method properly removes stale page dialogue', () => {
		const tracker = new ChapterDialogueTracker();

		tracker.seedFromDb([
			{
				pageSeq: 0,
				pageId: 101,
				isTranslated: true,
				lines: [
					{ id: 'r0', sourceText: '旧文本', translatedText: 'Old Text', kind: 'dialogue_bubble' },
				],
			},
			{
				pageSeq: 1,
				pageId: 102,
				isTranslated: true,
				lines: [
					{ id: 'r0', sourceText: '旧文本2', translatedText: 'Old Text 2', kind: 'dialogue_bubble' },
				],
			},
		]);

		// BEFORE CLEARING, CONTEXT CONTAINS PAGE 0 FOR PAGE 1
		let ctx = tracker.getContextWindow(1);
		expect(ctx.previousPages.length).toBe(1);
		expect(ctx.previousPages[0].lines[0].translatedText).toBe('Old Text');

		// CLEAR PAGE 0
		tracker.clearPage(0);
		ctx = tracker.getContextWindow(1);
		expect(ctx.previousPages.length).toBe(0);

		// RECORD OCR ON PAGE 0 (isTranslated SHOULD BE FALSE INITIALLY)
		tracker.recordOcr(0, 101, [{ id: 'r0', text: '新文本' }]);
		tracker.recordTranslation(0, new Map([['r0', 'New Text']]));

		ctx = tracker.getContextWindow(1);
		expect(ctx.previousPages.length).toBe(1);
		expect(ctx.previousPages[0].lines[0].translatedText).toBe('New Text');
	});
});