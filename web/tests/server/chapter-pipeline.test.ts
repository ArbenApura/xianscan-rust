// CHAPTER PIPELINE RUNNER TESTS - THE FULL PER-PAGE LOOP WITH FAKE SIDECAR + FAKE LLM + IN-MEMORY
// SQLITE + A TEMP DATA ROOT. NO NETWORK, NO MODELS, NO API KEY.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';
import type { AnalyzeResult, PipelineClient } from '$lib/server/pipeline-client';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { pages, regions, glossary } from '$lib/server/db/schema';

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
	preprocessCalls = 0;
	analyzeCalls = 0;
	cleanCalls = 0;
	failAnalyzeOn = new Set<number>(); // PAGE FILE PATHS THAT SHOULD FAIL ANALYZE

	async preprocess(image: Buffer, _signal?: AbortSignal): Promise<Buffer> {
		this.preprocessCalls++;
		return image;
	}

	async analyze(_image: Buffer, _signal?: AbortSignal): Promise<AnalyzeResult> {
		this.analyzeCalls++;
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
					text: '你好',
					confidence: 0.95,
					vertical: false,
				},
			],
		};
	}

	async clean(image: Buffer, _regions: unknown[], _signal?: AbortSignal): Promise<Buffer> {
		this.cleanCalls++;
		return image;
	}

	async health() {
		return { status: 'ok', detector: 'comic-ctd', inpainter: 'opencv' };
	}
}

function fakeLlm(translations: Record<string, string> = { r0: 'Hello' }) {
	const client = {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: JSON.stringify(translations) } }],
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
	dataRoot = mkdtempSync(join(tmpdir(), 'mt-pipeline-'));
	pipeline = new FakePipeline();
});

afterEach(() => {
	rmSync(dataRoot, { recursive: true, force: true });
});

// -- HELPERS -- //

function seedChapterWithPage(fileName: string) {
	seedBook(db, { id: 'b1' });
	const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
	const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/${fileName}` });
	mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
	writeFileSync(join(dataRoot, 'uploads', fileName), PAGE_PNG);
	return { chapter, page };
}

async function run(chapterId: number, llm: OpenAI) {
	const events: string[] = [];
	await chapterWork(chapterId, { pipeline, dataRoot, llm })(new AbortController().signal, (e) => events.push(e.type));
	return events;
}

// -- TESTS -- //

describe('runChapterPipeline', () => {
	it('analyzes, translates, cleans, typesets and marks the page done', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		await run(chapter.id, fakeLlm());

		const got = db.select().from(pages).where(eq(pages.id, page.id)).get();
		expect(got?.status).toBe('done');
		expect(got?.cleanedPath).toBe(`clean/${chapter.id}/0.webp`);
		expect(got?.outputPath).toBe(`output/${chapter.id}/0.webp`);
		expect(got?.width).toBe(200);

		// ARTIFACTS EXIST ON DISK
		expect(readFileSync(join(dataRoot, got!.cleanedPath!)).length).toBeGreaterThan(0);
		expect(readFileSync(join(dataRoot, got!.outputPath!)).length).toBeGreaterThan(0);

		// THE REGION ROW HAS OCR TEXT + TRANSLATION
		const region = db.select().from(regions).where(eq(regions.pageId, page.id)).get();
		expect(region?.textSource).toBe('你好');
		expect(region?.textTarget).toBe('Hello');
		expect(region?.status).toBe('translated');
		expect(JSON.parse(region!.polygon!)).toHaveLength(4);

		expect(pipeline.analyzeCalls).toBe(1);
		expect(pipeline.cleanCalls).toBe(1);
	});

	it('re-translates freshly when page is reset to pending (direct translation without caching)', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		const llm = fakeLlm();
		await run(chapter.id, llm);
		// SEND THE PAGE BACK TO 'pending' SO THE SECOND RUN RE-ENTERS THE PIPELINE FRESHLY
		db.update(pages).set({ status: 'pending' }).where(eq(pages.id, page.id)).run();
		await run(chapter.id, llm);

		const regions2 = db.select().from(regions).all();
		expect(regions2).toHaveLength(1); // REGIONS WERE REPLACED, NOT DUPLICATED
		expect(regions2[0].textTarget).toBe('Hello');
		expect(pipeline.analyzeCalls).toBe(2);
	});

	it('skips already-translated pages on re-run (resume without redundant work)', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/done.png' });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/new.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'done.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'new.png'), PAGE_PNG);

		await chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() })(new AbortController().signal, () => {});
		expect(db.select().from(pages).where(eq(pages.id, p0.id)).get()?.status).toBe('done');

		// PAGE 1 GOES BACK TO 'pending' (e.g. CLEARED) — PAGE 0 STAYS 'done'
		db.update(pages).set({ status: 'pending' }).where(eq(pages.id, p1.id)).run();
		const callsBefore = pipeline.analyzeCalls;

		const events: string[] = [];
		await chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() })(new AbortController().signal, (e) =>
			events.push(e.type),
		);

		// ONLY PAGE 1 WAS RE-ANALYZED — PAGE 0 WAS SKIPPED AND KEPT ITS OUTPUT
		expect(pipeline.analyzeCalls - callsBefore).toBe(1);
		// BOTH PAGES REPORT DONE (THE SKIPPED PAGE EMITS ITS page-done UP FRONT, IN ORDER)
		expect(events.filter((t) => t === 'page-done')).toEqual(['page-done', 'page-done']);
		expect(events).toContain('start');
		expect(events).toContain('page-step-start');
		expect(events).toContain('page-step-end');
		const got0 = db.select().from(pages).where(eq(pages.id, p0.id)).get();
		const got1 = db.select().from(pages).where(eq(pages.id, p1.id)).get();
		expect(got0?.status).toBe('done');
		expect(got0?.outputPath).toBe(`output/${chapter.id}/0.webp`); // UNTOUCHED
		expect(got1?.status).toBe('done');
	});

	it('isolates per-page failures: one bad page, the rest finish', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const _good = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/good.png' });
		const _bad = seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/bad.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'good.png'), PAGE_PNG);
		// THE BAD PAGE MUST DIFFER IN PIXEL CONTENT SO THE FAILURE INJECTION CAN
		// DISTINGUISH THEM. ANALYZE RECEIVES THE UPLOADED FORMAT (PNG/JPEG/WEBP) OR
		// CONVERTED WEBP — THE PIXEL PROBE BELOW IS FORMAT-AGNOSTIC.
		const badPng = (() => {
			const c = createCanvas(200, 300);
			const x = c.getContext('2d');
			x.fillStyle = 'gray';
			x.fillRect(0, 0, 200, 300);
			return c.toBuffer('image/png');
		})();
		writeFileSync(join(dataRoot, 'uploads', 'bad.png'), badPng);

		const failing = new FakePipeline();
		const originalAnalyze = failing.analyze.bind(failing);
		failing.analyze = async (image, signal) => {
			const { loadImage, createCanvas: probeCanvas } = await import('@napi-rs/canvas');
			const img = await loadImage(image);
			const probe = probeCanvas(1, 1);
			const ctx = probe.getContext('2d');
			ctx.drawImage(img, 0, 0);
			// GOOD PAGE IS WHITE (~255), BAD PAGE IS GRAY (~200) — GRAY → EXPLODE
			const px = ctx.getImageData(0, 0, 1, 1).data;
			if (px[0] < 250) {
				throw new Error('sidecar exploded');
			}
			return originalAnalyze(image, signal);
		};

		const events: any[] = [];
		await chapterWork(chapter.id, { pipeline: failing, dataRoot, llm: fakeLlm() })(
			new AbortController().signal,
			(e) => events.push(e),
		);

		const pages2 = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(pages2[0].status).toBe('done');
		expect(pages2[1].status).toBe('error');
		expect(pages2[1].error).toContain('sidecar exploded');
		expect(events.filter((t) => t.type === 'error').length).toBe(1);
		expect(events.filter((t) => t.type === 'page-done').length).toBe(1);
		const errorEvent = events.find((t) => t.type === 'error');
		expect(errorEvent.failedStep).toBe('analyze');
	});

	it('aborts between pages when the signal fires', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/p1.png' });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/p2.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'p1.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'p2.png'), PAGE_PNG);

		const controller = new AbortController();
		// ABORT DURING THE FIRST PAGE'S ANALYZE — THE JOB MUST STOP AT THE PHASE BOUNDARY
		const slowPipeline = new FakePipeline();
		const original = slowPipeline.analyze.bind(slowPipeline);
		slowPipeline.analyze = async (image, signal) => {
			const r = await original(image, signal);
			controller.abort();
			return r;
		};

		// AN ABORT STOPS THE JOB — THE WORK FUNCTION RETHROWS THE AbortError (SUPERSEDE TAKES OVER).
		// pageConcurrency: 1 KEEPS THE ORDERING DETERMINISTIC.
		await expect(
			chapterWork(chapter.id, { pipeline: slowPipeline, dataRoot, llm: fakeLlm(), pageConcurrency: 1 })(
				controller.signal,
				() => {},
			),
		).rejects.toMatchObject({ name: 'AbortError' });

		const p1row = db.select().from(pages).where(eq(pages.id, p1.id)).get();
		const skipped = db.select().from(pages).where(eq(pages.id, p2.id)).get();
		expect(p1row?.status).toBe('processing'); // PHASE 1 FINISHED; PHASE 3 NEVER STARTED
		expect(p1row?.status).not.toBe('error'); // AN ABORT NEVER MARKS PAGES AS ERRORS
		expect(skipped?.status).toBe('pending'); // NEVER STARTED
	});

	it('resets pages stuck in processing (crash resume) before running', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/stuck.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'stuck.png'), PAGE_PNG);
		// SIMULATE A CRASH MID-JOB: THE PAGE IS STUCK IN 'processing'
		db.update(pages).set({ status: 'processing' }).where(eq(pages.id, page.id)).run();

		await run(chapter.id, fakeLlm());

		const got = db.select().from(pages).where(eq(pages.id, page.id)).get();
		expect(got?.status).toBe('done'); // THE RESET LET THE RE-RUN COMPLETE IT
	});

	it('translations update only their own region (seq keyed correctly)', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		// A TWO-REGION PAGE
		const multi = new FakePipeline();
		multi.analyze = async () => ({
			width: 200,
			height: 300,
			backend: 'comic-ctd',
			regions: [
				{
					id: 'r0',
					box: { x: 0, y: 0, w: 50, h: 20 },
					polygon: [[0, 0]],
					text: '甲',
					confidence: 0.9,
					vertical: false,
				},
				{
					id: 'r1',
					box: { x: 0, y: 100, w: 50, h: 20 },
					polygon: [[0, 100]],
					text: '轰',
					confidence: 0.9,
					vertical: false,
				},
			],
		});
		await chapterWork(chapter.id, { pipeline: multi, dataRoot, llm: fakeLlm({ r0: 'A', r1: 'BOOM' }) })(
			new AbortController().signal,
			() => {},
		);

		const rows = db.select().from(regions).where(eq(regions.pageId, page.id)).orderBy(regions.seq).all();
		expect(rows).toHaveLength(2);
		expect(rows[0].textTarget).toBe('A');
		expect(rows[1].textTarget).toBe('BOOM');
	});

	it('ignores watermarks and preserves them untouched without inpainting or translation', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		let cleanedRegionsPassed: unknown[] = [];
		const wmPipeline = new FakePipeline();
		wmPipeline.analyze = async () => ({
			width: 200,
			height: 300,
			backend: 'comic-ctd',
			regions: [
				{
					id: 'r0',
					box: { x: 10, y: 10, w: 50, h: 20 },
					polygon: [[10, 10]],
					text: '你好',
					confidence: 0.9,
					vertical: false,
				},
				{
					id: 'r1',
					box: { x: 100, y: 10, w: 90, h: 20 },
					polygon: [[100, 10]],
					text: 'www.baozimh.com',
					confidence: 0.9,
					vertical: false,
				},
			],
		});
		wmPipeline.clean = async (_image: Buffer, regionsPassed: unknown[]) => {
			cleanedRegionsPassed = regionsPassed;
			return PAGE_PNG;
		};

		const llmReceivedSources: string[] = [];
		const customLlm = {
			chat: {
				completions: {
					create: async (params: { messages: { content: string }[] }) => {
						llmReceivedSources.push(params.messages[1]?.content || '');
						return {
							choices: [{ message: { content: JSON.stringify({ r0: 'Hello', r1: '' }) } }],
							usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		await chapterWork(chapter.id, { pipeline: wmPipeline, dataRoot, llm: customLlm })(
			new AbortController().signal,
			() => {},
		);

		// CLEAN ONLY RECEIVES REGIONS WITH VALID TRANSLATIONS (1 TOTAL — WATERMARK r1 IS LEFT UNTOUCHED)
		expect(cleanedRegionsPassed).toHaveLength(1);

		const rows = db.select().from(regions).where(eq(regions.pageId, page.id)).orderBy(regions.seq).all();
		expect(rows).toHaveLength(2);
		expect(rows[0].textTarget).toBe('Hello');
		expect(rows[1].textTarget).toBeNull(); // WATERMARK HAS NO TRANSLATED TARGET
	});

	it('records translation usage on each re-run of a pending page', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		const llm = fakeLlm();
		const usages: unknown[] = [];
		const deps = { pipeline, dataRoot, llm, onUsage: (u: unknown) => usages.push(u) };
		await chapterWork(chapter.id, deps)(new AbortController().signal, () => {});
		// SEND THE PAGE BACK TO 'pending' SO THE SECOND RUN TRANSLATES FRESHLY WITH FORCE TO BYPASS CACHE
		db.update(pages).set({ status: 'pending' }).where(eq(pages.id, page.id)).run();
		await chapterWork(chapter.id, { ...deps, force: true })(new AbortController().signal, () => {});
		// RUN 1: TRANSLATION (1). RUN 2: TRANSLATION (1) -> 2 USAGES. (THE SEPARATE CHAPTER-LEVEL
		// EXTRACTION CALL IS GONE, TERMS ARE NOW RETURNED BY THE SAME SINGLE-CALL translatePage.)
		expect(usages.length).toBe(2);
	});

	it('serves translation from local SQLite cache on pending re-run without force, saving LLM calls', async () => {
		const { chapter, page } = seedChapterWithPage('c1-p0.png');
		const llm = fakeLlm();
		const usages: unknown[] = [];
		const events: any[] = [];
		const deps = { pipeline, dataRoot, llm, onUsage: (u: unknown) => usages.push(u) };
		await chapterWork(chapter.id, deps)(new AbortController().signal, (e) => events.push(e));
		expect(usages.length).toBe(1);

		// RESET PAGE TO PENDING WITHOUT FORCE (e.g. RETRY AFTER PARTIAL INTERRUPTION)
		db.update(pages).set({ status: 'pending' }).where(eq(pages.id, page.id)).run();
		events.length = 0;
		await chapterWork(chapter.id, deps)(new AbortController().signal, (e) => events.push(e));

		// RUN 2 HITS SQLITE TRANSLATION CACHE: NO NEW LLM USAGE RECORDED
		expect(usages.length).toBe(1);
		const transEnd = events.find((e) => e.type === 'page-step-end' && e.step === 'translate');
		expect(transEnd?.stepDetails?.cacheHit).toBe(true);
	});

	it('skips pages entirely on re-run when everything is done (no translation call either)', async () => {
		const { chapter } = seedChapterWithPage('c1-p0.png');
		const llm = fakeLlm();
		const usages: unknown[] = [];
		const deps = { pipeline, dataRoot, llm, onUsage: (u: unknown) => usages.push(u) };
		await chapterWork(chapter.id, deps)(new AbortController().signal, () => {});
		await chapterWork(chapter.id, deps)(new AbortController().signal, () => {});
		// RUN 1: TRANSLATION = 1. RUN 2: EVERYTHING SKIPPED — NO LLM CALLS AT ALL.
		expect(usages.length).toBe(1);
	});

	it('processes pages concurrently within each phase', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		for (let i = 0; i < 3; i++) {
			seedPage(db, { chapterId: chapter.id, seq: i, filePath: `uploads/c${i}.png` });
			writeFileSync(join(dataRoot, `uploads/c${i}.png`), PAGE_PNG);
		}

		// TRACK CONCURRENT ANALYZE CALLS — PARALLEL PHASE 1 MUST OVERLAP THEM
		let inFlight = 0;
		let maxInFlight = 0;
		const concurrent = new FakePipeline();
		const original = concurrent.analyze.bind(concurrent);
		concurrent.analyze = async (image, signal) => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 10));
			const result = await original(image, signal);
			inFlight--;
			return result;
		};

		const events: string[] = [];
		await chapterWork(chapter.id, {
			pipeline: concurrent,
			dataRoot,
			llm: fakeLlm(),
			pageConcurrency: 3,
		})(new AbortController().signal, (e) => events.push(e.type));

		expect(maxInFlight).toBeGreaterThan(1); // ANALYZE CALLS OVERLAPPED
		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows.every((r) => r.status === 'done')).toBe(true);
		// EVENTS ARRIVE IN PAGE ORDER EVEN THOUGH PAGES FINISH OUT OF ORDER
		expect(events.filter((t) => t === 'page-done')).toEqual(['page-done', 'page-done', 'page-done']);
	});

	it('emits high-resolution step telemetry events across all pipeline phases', async () => {
		const { chapter } = seedChapterWithPage('c1-p0.png');
		const telemetryEvents: any[] = [];
		await chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() })(new AbortController().signal, (e) =>
			telemetryEvents.push(e),
		);

		const stepStartEvents = telemetryEvents.filter((e) => e.type === 'page-step-start');
		const stepEndEvents = telemetryEvents.filter((e) => e.type === 'page-step-end');

		expect(stepStartEvents.some((e) => e.step === 'analyze')).toBe(true);
		expect(stepStartEvents.some((e) => e.step === 'translate')).toBe(true);
		expect(stepStartEvents.some((e) => e.step === 'clean')).toBe(true);
		expect(stepStartEvents.some((e) => e.step === 'typeset')).toBe(true);

		const analyzeEnd = stepEndEvents.find((e) => e.step === 'analyze');
		expect(analyzeEnd?.durationMs).toBeGreaterThanOrEqual(0);
		expect(analyzeEnd?.stepDetails?.regionsCount).toBe(1);

		const typesetEnd = stepEndEvents.find((e) => e.step === 'typeset');
		expect(typesetEnd?.durationMs).toBeGreaterThanOrEqual(0);
	});

	it('only processes specified pageIds when provided', async () => {
		seedBook(db, { id: 'b_target' });
		const chapter = seedChapter(db, { bookId: 'b_target', seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/p1.png' });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/p2.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'p1.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'p2.png'), PAGE_PNG);

		const events: any[] = [];
		// ONLY TARGET p2
		await chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() }, [p2.id])(
			new AbortController().signal,
			(e) => events.push(e),
		);

		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();

		expect(rows[0].status).toBe('pending'); // p1 remains pending untouched
		expect(rows[1].status).toBe('done'); // p2 was translated
		expect(events.filter((e) => e.type === 'page-done').length).toBe(1);
		expect(events.find((e) => e.type === 'page-done')?.pageId).toBe(p2.id);
	});

	it('re-translates a previously done page and cleans existing artifacts', async () => {
		seedBook(db, { id: 'b_retranslate' });
		const chapter = seedChapter(db, { bookId: 'b_retranslate', seq: 0 });
		const p1 = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			status: 'done',
			filePath: 'uploads/p1.png',
			cleanedPath: 'clean/0/0.webp',
			outputPath: 'output/0/0.webp',
		});
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		mkdirSync(join(dataRoot, 'clean', '0'), { recursive: true });
		mkdirSync(join(dataRoot, 'output', '0'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'p1.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'clean', '0', '0.webp'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'output', '0', '0.webp'), PAGE_PNG);

		const events: any[] = [];
		const fake = new FakePipeline();
		// TARGET p1 EXPLICITLY FOR RE-TRANSLATION
		await chapterWork(chapter.id, { pipeline: fake, dataRoot, llm: fakeLlm() }, [p1.id])(
			new AbortController().signal,
			(e) => events.push(e),
		);

		// ANALYZE AND CLEAN SHOULD HAVE BEEN CALLED DESPITE INITIAL STATUS BEING DONE
		expect(fake.analyzeCalls).toBe(1);
		expect(fake.cleanCalls).toBe(1);
		const rows = db.select().from(pages).where(eq(pages.id, p1.id)).all();
		expect(rows[0].status).toBe('done');
		expect(events.filter((e) => e.type === 'page-done').length).toBe(1);
	});

	it('executes cleanly when SSR data loaders run concurrently with parallel pipeline writes', async () => {
		const { getChapterReaderData } = await import('$lib/server/chapters');
		const { getBookDetails } = await import('$lib/server/books');

		seedBook(db, { id: 'b_ssr' });
		const chapter = seedChapter(db, { bookId: 'b_ssr', seq: 0 });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		for (let i = 0; i < 4; i++) {
			seedPage(db, { chapterId: chapter.id, seq: i, filePath: `uploads/ssr_${i}.png` });
			writeFileSync(join(dataRoot, `uploads/ssr_${i}.png`), PAGE_PNG);
		}

		// SLOW DOWN ANALYZE & TRANSLATE TO ENSURE SSR QUERIES OVERLAP WITH PARALLEL PIPELINE WRITES
		const concurrent = new FakePipeline();
		const origClean = concurrent.clean.bind(concurrent);
		concurrent.clean = async (img, regs, sig) => {
			await new Promise((r) => setTimeout(r, 15));
			return origClean(img, regs, sig);
		};

		// LAUNCH PIPELINE
		const pipelinePromise = chapterWork(chapter.id, {
			pipeline: concurrent,
			dataRoot,
			llm: fakeLlm(),
			pageConcurrency: 4,
		})(new AbortController().signal, () => {});

		// SIMULATE MULTIPLE RAPID SSR LOADS RUNNING CONCURRENTLY
		const ssrPromises = [
			getChapterReaderData(chapter.id),
			getBookDetails('b_ssr'),
			getChapterReaderData(chapter.id),
			getBookDetails('b_ssr'),
		];

		const [_, ...ssrResults] = await Promise.all([pipelinePromise, ...ssrPromises]);

		expect(ssrResults[0].chapter.id).toBe(chapter.id);
		expect(ssrResults[1].book.id).toBe('b_ssr');

		const finalPages = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).all();
		expect(finalPages.every((p) => p.status === 'done')).toBe(true);
	});

	it('streams: a page translates as soon as its OCR finishes (no full-chapter analyze barrier)', async () => {
		seedBook(db, { id: 'b_stream' });
		const chapter = seedChapter(db, { bookId: 'b_stream', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/stream_0.png' });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/stream_1.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'stream_0.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'stream_1.png'), PAGE_PNG);

		const stepEvents: Array<{ pageId: number; step: string; type: string }> = [];

		await chapterWork(chapter.id, {
			pipeline,
			dataRoot,
			llm: fakeLlm(),
			pageConcurrency: 1,
		})(new AbortController().signal, (e) => {
			if (e.pageId && e.step) {
				stepEvents.push({ pageId: e.pageId, step: e.step, type: e.type });
			}
		});

		// PAGE 0's TRANSLATE MUST START BEFORE PAGE 1's ANALYZE — i.e. pages stream (no full-chapter wait).
		const p0Translate = stepEvents.findIndex(
			(e) => e.pageId === p0.id && e.step === 'translate' && e.type === 'page-step-start',
		);
		const p1Analyze = stepEvents.findIndex(
			(e) => e.pageId === p1.id && e.step === 'analyze' && e.type === 'page-step-start',
		);

		expect(p0Translate).toBeGreaterThanOrEqual(0);
		expect(p1Analyze).toBeGreaterThanOrEqual(0);
		expect(p0Translate).toBeLessThan(p1Analyze);
	});

	it("serializes the LLM step per book: page N+1 reads page N's freshly appended terms", async () => {
		seedBook(db, { id: 'b_serial' });
		const chapter = seedChapter(db, { bookId: 'b_serial', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/s0.png' });
		seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/s1.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 's0.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 's1.png'), PAGE_PNG);

		// SEED A BASE TERM SO THE GLOSSARY SYSTEM MESSAGE ALWAYS EXISTS (pages[1] == glossary block).
		const { addTerm } = await import('$lib/server/glossary');
		await addTerm(
			'book',
			'b_serial',
			{ source: '武者', target: 'martial artist', gender: 'neuter', pinned: true },
			{ sourceLang: 'zh-Hans', targetLang: 'en' },
		);

		// PAGE 0's OCR MUST CONTAIN 妖灵师 SO translatePage's parseExtractedTerms KEEPS THE DISCOVERED
		// TERM (IT FILTERS OUT ANY TERM NOT PRESENT IN THE PAGE'S OWN SOURCE TEXT).
		class SerialPipeline extends FakePipeline {
			private n = 0;
			override async analyze(): Promise<AnalyzeResult> {
				const text = this.n++ === 0 ? '妖灵师' : '你好 妖灵师';
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
							text,
							confidence: 0.95,
							vertical: false,
						},
					],
				};
			}
		}

		// PAGE 0 DISCOVERS A TERM; PAGE 1 MUST SEE IT IN ITS GLOSSARY (PROVES READ→APPEND IS SERIALIZED).
		const seenGlossaries: string[] = [];
		let callN = 0;
		const serialLlm = {
			chat: {
				completions: {
					create: async (params: { messages: { role: string; content: string }[] }) => {
						callN++;
						const glossary = String(params.messages[1]?.content ?? '');
						seenGlossaries.push(glossary);
						// PAGE 0'S CALL RETURNS A NEW TERM; PAGE 1'S CALL RETURNS NONE.
						const newTerms =
							callN === 1
								? [
										{
											source: '妖灵师',
											target: 'demon spiritualist',
											category: 'concept',
											gender: 'neuter',
										},
									]
								: [];
						return {
							choices: [
								{
									message: {
										content: JSON.stringify({
											translations: { r0: `T${callN}` },
											newTerms,
										}),
									},
								},
							],
							usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		await chapterWork(chapter.id, { pipeline: new SerialPipeline(), dataRoot, llm: serialLlm, pageConcurrency: 1 })(
			new AbortController().signal,
			() => {},
		);

		// TWO TRANSLATE CALLS. PAGE 2'S GLOSSARY MUST CONTAIN THE TERM PAGE 1 DISCOVERED.
		expect(callN).toBe(2);
		expect(seenGlossaries[1]).toContain('★妖灵师 = demon spiritualist');
		// PAGE 1'S GLOSSARY DID NOT YET HAVE IT (DISCOVERED *ON* PAGE 1).
		expect(seenGlossaries[0]).not.toContain('★妖灵师 = demon spiritualist');
	});

	it('persists newly discovered terms from single-call page translation to the book glossary', async () => {
		seedBook(db, { id: 'b_terms' });
		const chapter = seedChapter(db, { bookId: 'b_terms', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/terms_0.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'terms_0.png'), PAGE_PNG);

		const fakeLlmWithTerms = {
			chat: {
				completions: {
					create: async () => ({
						choices: [
							{
								message: {
									content: JSON.stringify({
										translations: { r0: 'Hello there' },
										newTerms: [
											{ source: '你好', target: 'Hello', category: 'other', gender: 'neuter' },
										],
									}),
								},
							},
						],
						usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
					}),
				},
			},
		} as unknown as OpenAI;

		await chapterWork(chapter.id, {
			pipeline,
			dataRoot,
			llm: fakeLlmWithTerms,
		})(new AbortController().signal, () => {});

		const bookTerms = db.select().from(glossary).where(eq(glossary.bookId, 'b_terms')).all();

		expect(bookTerms).toHaveLength(1);
		expect(bookTerms[0].source).toBe('你好');
		expect(bookTerms[0].target).toBe('Hello');
		expect(bookTerms[0].status).toBe('ai');
	});

	it('emits skipped translate step with durationMs: 0 and page-done durationMs when page has 0 regions', async () => {
		seedBook(db, { id: 'b_zero_regions' });
		const chapter = seedChapter(db, { bookId: 'b_zero_regions', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/zero_0.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'zero_0.png'), PAGE_PNG);

		class EmptyAnalyzePipeline extends FakePipeline {
			override async analyze(): Promise<AnalyzeResult> {
				return {
					width: 200,
					height: 300,
					backend: 'comic-ctd',
					regions: [],
				};
			}
		}

		const events: any[] = [];
		await chapterWork(chapter.id, {
			pipeline: new EmptyAnalyzePipeline(),
			dataRoot,
			llm: fakeLlm(),
		})(new AbortController().signal, (e) => {
			events.push(e);
		});

		const transEnd = events.find((e) => e.type === 'page-step-end' && e.step === 'translate');
		expect(transEnd).toBeDefined();
		expect(transEnd.stepStatus).toBe('completed');
		expect(transEnd.durationMs).toBe(0);
		expect(transEnd.stepDetails?.skipped).toBe(true);

		const pageDone = events.find((e) => e.type === 'page-done' && e.pageId === p0.id);
		expect(pageDone).toBeDefined();
		expect(typeof pageDone.durationMs).toBe('number');
		expect(pageDone.durationMs).toBeGreaterThan(0);
	});

	it('matches and sends page-scoped glossary blocks for pages with matching OCR terms', async () => {
		seedBook(db, { id: 'b_gloss' });
		const chapter = seedChapter(db, { bookId: 'b_gloss', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/g0.png' });
		seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/g1.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'g0.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'g1.png'), PAGE_PNG);

		// PRE-SEED A PINNED TERM IN THE BOOK GLOSSARY.
		const { addTerm } = await import('$lib/server/glossary');
		await addTerm(
			'book',
			'b_gloss',
			{ source: '妖灵师', target: 'demon spiritualist', gender: 'neuter', pinned: true },
			{ sourceLang: 'zh-Hans', targetLang: 'en' },
		);

		class GlossMatchPipeline extends FakePipeline {
			override async analyze(): Promise<AnalyzeResult> {
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
							text: '你好 妖灵师',
							confidence: 0.95,
							vertical: false,
						},
					],
				};
			}
		}

		// CAPTURE THE GLOSSARY SYSTEM MESSAGE (messages[1], BETWEEN system and user) FOR EACH PAGE.
		const glossaryBlocks: string[] = [];
		const captureLlm = {
			chat: {
				completions: {
					create: async (params: { messages: { role: string; content: string }[] }) => {
						glossaryBlocks.push(String(params.messages[1]?.content ?? ''));
						return {
							choices: [{ message: { content: JSON.stringify({ r0: 'Hello Demon Spiritualist' }) } }],
							usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		await chapterWork(chapter.id, { pipeline: new GlossMatchPipeline(), dataRoot, llm: captureLlm })(new AbortController().signal, () => {});

		// TWO PAGES BOTH CONTAIN 妖灵师 → BOTH MATCH AND RECEIVE THE GLOSSARY BLOCK.
		const translationGlossaryBlocks = glossaryBlocks.filter((b) => b.includes('★妖灵师 = demon spiritualist'));
		expect(translationGlossaryBlocks.length).toBe(2);
		expect(translationGlossaryBlocks[0]).toBe(translationGlossaryBlocks[1]);
		expect(translationGlossaryBlocks[0]).toContain('妖灵师 = demon spiritualist');
	});

	it('aborts in-flight inpainting and maintains strict sequential queue when translation fails', async () => {
		seedBook(db, { id: 'b_concurrency_safe' });
		const chapter = seedChapter(db, { bookId: 'b_concurrency_safe', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/p0.png' });
		seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/p1.png' });
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'p0.png'), PAGE_PNG);
		writeFileSync(join(dataRoot, 'uploads', 'p1.png'), PAGE_PNG);

		let inpaintingActiveCount = 0;
		let maxInpaintingActive = 0;
		let inpaint0Aborted = false;

		class TrackingPipeline extends FakePipeline {
			override async clean(image: Buffer, _regions: unknown[], _mode?: string, signal?: AbortSignal): Promise<Buffer> {
				inpaintingActiveCount++;
				if (inpaintingActiveCount > maxInpaintingActive) {
					maxInpaintingActive = inpaintingActiveCount;
				}

				return new Promise<Buffer>((resolve, reject) => {
					const timer = setTimeout(() => {
						inpaintingActiveCount--;
						resolve(image);
					}, 100);

					if (signal) {
						signal.addEventListener('abort', () => {
							clearTimeout(timer);
							inpaintingActiveCount--;
							inpaint0Aborted = true;
							const err = new Error('Inpainting aborted');
							err.name = 'AbortError';
							reject(err);
						}, { once: true });
					}
				});
			}
		}

		// LLM THROWS AN ERROR ON PAGE 0 AND SUCCEEDS ON PAGE 1
		let callCount = 0;
		const failingLlm = {
			chat: {
				completions: {
					create: async () => {
						callCount++;
						if (callCount === 1) {
							// SIMULATE NON-RETRYABLE LLM ERROR (e.g. INVALID REQUEST OR BAD KEY)
							const err = new Error('LLM invalid prompt error');
							(err as any).status = 400;
							throw err;
						}
						return {
							choices: [{ message: { content: JSON.stringify({ r0: 'Success Page 1' }) } }],
							usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		const customPipeline = new TrackingPipeline();

		await chapterWork(chapter.id, {
			pipeline: customPipeline,
			dataRoot,
			llm: failingLlm,
			pageConcurrency: 1,
		})(new AbortController().signal, () => {});

		// 1. INPAINTING CONCURRENCY NEVER EXCEEDED 1 AT ANY POINT
		expect(maxInpaintingActive).toBeLessThanOrEqual(1);
		// 2. PAGE 0'S IN-FLIGHT INPAINTING RECEIVED ABORT SIGNAL WHEN TRANSLATION FAILED
		expect(inpaint0Aborted).toBe(true);
	});

	it('marks page status as error and skips typesetting when translation yields zero successful regions', async () => {
		seedBook(db, { id: 'b_error_handling' });
		const chapter = seedChapter(db, { bookId: 'b_error_handling', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/err_0.png' });

		// WRITE A REAL PNG SO CLEAN CAN READ IT
		mkdirSync(join(dataRoot, 'uploads'), { recursive: true });
		writeFileSync(join(dataRoot, 'uploads', 'err_0.png'), PAGE_PNG);

		// LLM FAILS TRANSLATION WITH EXHAUSTED TOKEN BUDGET
		const exhaustedLlm = {
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: '' }, finish_reason: 'length' }],
						usage: { prompt_tokens: 100, completion_tokens: 2048, total_tokens: 2148 },
					}),
				},
			},
		} as unknown as OpenAI;

		const events: any[] = [];
		await chapterWork(chapter.id, {
			pipeline: new FakePipeline(),
			dataRoot,
			llm: exhaustedLlm,
			pageConcurrency: 1,
		})(new AbortController().signal, (ev) => events.push(ev));

		const dbPage = db.select().from(pages).where(eq(pages.id, page.id)).get();
		expect(dbPage).toBeDefined();
		expect(dbPage?.status).toBe('error');
		expect(dbPage?.error).toContain('TOKEN_BUDGET_EXHAUSTED');
		expect(dbPage?.outputPath).toBeNull();

		// ERROR EVENT DISPATCHED WITH PAGE INDEX AND FAILED STEP
		const errEv = events.find((e) => e.type === 'error' && e.page === 0);
		expect(errEv).toBeDefined();
		expect(errEv.failedStep).toBe('translate');
	}, 15000);
});
