// TRANSIENT PREVIEW AND THUMBNAIL CLEANUP TESTS
// VERIFIES THAT LIVE OCR ANNOTATION IMAGES AND STALE THUMBNAILS ARE PROMPTLY
// PURGED ON PAGE/CHAPTER COMPLETION AND RETROACTIVELY VIA ORPHAN PURGE.

// IMPORTED SYSTEM MODULES
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// IMPORTED TEST MODULES
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type OpenAI from 'openai';
import { eq } from 'drizzle-orm';

// IMPORTED HELPERS & DATABASE
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';
import type { AnalyzeResult, PipelineClient } from '$lib/server/pipeline-client';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { pages } from '$lib/server/db/schema';
import { purgeOrphanedStorage } from '$lib/server/storage-service';
import { updateSnapshot, type ChapterJobSnapshot } from '$lib/server/translation-service';

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
	async preprocess(image: Buffer, _signal?: AbortSignal): Promise<Buffer> {
		return image;
	}

	async analyze(_image: Buffer, _signal?: AbortSignal): Promise<AnalyzeResult> {
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
		return image;
	}

	async health() {
		return { status: 'ok', detector: 'comic-ctd', inpainter: 'opencv' };
	}
}

function fakeLlm(translations: Record<string, string> = { r0: 'Hello' }) {
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: JSON.stringify(translations) } }],
					usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
				}),
			},
		},
	} as unknown as OpenAI;
}

// -- STATES -- //

let db: TestDb;
let dataRoot: string;
let pipeline: FakePipeline;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
	dataRoot = mkdtempSync(join(tmpdir(), 'mt-transient-cleanup-'));
	pipeline = new FakePipeline();
});

afterEach(() => {
	rmSync(dataRoot, { recursive: true, force: true });
});

// -- HELPERS -- //

function seedChapterWithPages(count: number) {
	seedBook(db, { id: 'book-transient' });
	const chapter = seedChapter(db, { bookId: 'book-transient', seq: 0 });
	const pageList = [];
	mkdirSync(join(dataRoot, 'uploads', String(chapter.id)), { recursive: true });

	for (let i = 0; i < count; i++) {
		const rel = `uploads/${chapter.id}/${i}.png`;
		writeFileSync(join(dataRoot, rel), PAGE_PNG);
		const p = seedPage(db, { chapterId: chapter.id, seq: i, filePath: rel });
		pageList.push(p);
	}

	return { chapter, pageList };
}

// -- TESTS -- //

describe('Transient Preview and Cache Cleanup', () => {
	it('automatically removes annotated preview file and directory when chapter completes', async () => {
		const { chapter, pageList } = seedChapterWithPages(2);

		// PRE-CREATE A DUMMY THUMBNAIL CACHE FOR PAGE 0 TO VERIFY PRUNING
		const thumbsDir = join(dataRoot, 'cache', 'thumbs');
		mkdirSync(thumbsDir, { recursive: true });
		const staleThumbPath = join(thumbsDir, `${pageList[0].id}_200_0.webp`);
		writeFileSync(staleThumbPath, Buffer.from('stale-thumb'));
		expect(existsSync(staleThumbPath)).toBe(true);

		// EXECUTE PIPELINE
		await chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() })(
			new AbortController().signal,
			() => {},
		);

		// VERIFY PAGES IN DATABASE ARE DONE WITH NULL ANNOTATED PATH
		for (const p of pageList) {
			const row = db.select().from(pages).where(eq(pages.id, p.id)).get();
			expect(row?.status).toBe('done');
			expect(row?.outputPath).toBe(`output/${chapter.id}/${p.seq}.webp`);
			expect(row?.annotatedPath).toBeNull();

			// VERIFY ANNOTATED FILE IS GONE FROM DISK
			const pageAnnotated = join(dataRoot, 'annotated', String(chapter.id), `${p.seq}.webp`);
			expect(existsSync(pageAnnotated)).toBe(false);
		}

		// VERIFY ENTIRE ANNOTATED CHAPTER DIRECTORY IS GONE
		const chapterAnnotatedDir = join(dataRoot, 'annotated', String(chapter.id));
		expect(existsSync(chapterAnnotatedDir)).toBe(false);

		// VERIFY STALE THUMBNAIL WAS PRUNED
		expect(existsSync(staleThumbPath)).toBe(false);
	});

	it('retroactively purges dead annotated files from completed pages during storage purge', () => {
		const { chapter, pageList } = seedChapterWithPages(1);
		const p = pageList[0];

		// SIMULATE A LEGACY COMPLETED PAGE WITH RESIDUAL ANNOTATED FILE
		const outputRel = `output/${chapter.id}/${p.seq}.webp`;
		const annotatedRel = `annotated/${chapter.id}/${p.seq}.webp`;
		const outputDir = join(dataRoot, 'output', String(chapter.id));
		const annotatedDir = join(dataRoot, 'annotated', String(chapter.id));
		mkdirSync(outputDir, { recursive: true });
		mkdirSync(annotatedDir, { recursive: true });

		writeFileSync(join(dataRoot, outputRel), Buffer.from('output-content'));
		writeFileSync(join(dataRoot, annotatedRel), Buffer.from('residual-preview-content'));

		db.update(pages)
			.set({
				status: 'done',
				outputPath: outputRel,
				annotatedPath: annotatedRel,
			})
			.where(eq(pages.id, p.id))
			.run();

		expect(existsSync(join(dataRoot, annotatedRel))).toBe(true);

		// RUN PURGE ORPHANED STORAGE
		const res = purgeOrphanedStorage(dataRoot);

		// RESIDUAL ANNOTATED FILE WAS DELETED AND RECLAIMED
		expect(res.purgedFiles).toBeGreaterThanOrEqual(1);
		expect(existsSync(join(dataRoot, annotatedRel))).toBe(false);
		expect(existsSync(annotatedDir)).toBe(false);

		// DATABASE ANNOTATED PATH WAS CLEARED
		const updatedPage = db.select().from(pages).where(eq(pages.id, p.id)).get();
		expect(updatedPage?.annotatedPath).toBeNull();
		expect(updatedPage?.outputPath).toBe(outputRel);
	});

	it('clears annotatedPath and previewStage in translation-service snapshot upon page-done', () => {
		const snapshot: ChapterJobSnapshot = {
			chapterId: 10,
			bookId: 'b10',
			status: 'running',
			totalPages: 1,
			completedPages: 0,
			pages: [
				{
					pageIndex: 0,
					pageId: 101,
					seq: 0,
					status: 'processing',
					currentStep: 'clean',
					timings: {},
					cleanedPath: 'clean/10/0.webp',
					annotatedPath: 'annotated/10/0.webp',
					previewStage: 'cleaned',
				} as any,
			],
		};

		updateSnapshot(snapshot, {
			type: 'page-done',
			chapterId: 10,
			page: 0,
			pageId: 101,
			outputPath: 'output/10/0.webp',
		});

		expect(snapshot.pages[0].status).toBe('done');
		expect(snapshot.pages[0].outputPath).toBe('output/10/0.webp');
		expect(snapshot.pages[0].annotatedPath).toBeUndefined();
		expect((snapshot.pages[0] as any).previewStage).toBeUndefined();
		expect(snapshot.completedPages).toBe(1);
	});

	it('cleans up chapter annotated directory and clears annotatedPath when aborted', async () => {
		const { chapter, pageList } = seedChapterWithPages(2);
		const abortController = new AbortController();

		// PRE-CREATE ANNOTATED DIRECTORY AND PREVIEW FILE FOR CHAPTER
		const chAnnotatedDir = join(dataRoot, 'annotated', String(chapter.id));
		mkdirSync(chAnnotatedDir, { recursive: true });
		writeFileSync(join(chAnnotatedDir, '0.webp'), Buffer.from('preview-frame'));
		db.update(pages).set({ annotatedPath: `annotated/${chapter.id}/0.webp` }).where(eq(pages.id, pageList[0].id)).run();

		// ABORT IMMEDIATELY
		abortController.abort();

		await expect(
			chapterWork(chapter.id, { pipeline, dataRoot, llm: fakeLlm() })(
				abortController.signal,
				() => {},
			),
		).rejects.toThrow();

		// DIRECTORY SHOULD BE REMOVED ON ABORT
		expect(existsSync(chAnnotatedDir)).toBe(false);

		// ANNOTATED PATH IN DB SHOULD BE NULLIFIED
		const updatedPage = db.select().from(pages).where(eq(pages.id, pageList[0].id)).get();
		expect(updatedPage?.annotatedPath).toBeNull();
	});

	it('purges dead annotated files from failed pages without output during storage purge', () => {
		const { chapter, pageList } = seedChapterWithPages(1);
		const p = pageList[0];

		// SIMULATE A FAILED PAGE (ERROR STATUS, NO OUTPUT, BUT RESIDUAL ANNOTATED FILE)
		const annotatedRel = `annotated/${chapter.id}/${p.seq}.webp`;
		const annotatedDir = join(dataRoot, 'annotated', String(chapter.id));
		mkdirSync(annotatedDir, { recursive: true });
		writeFileSync(join(dataRoot, annotatedRel), Buffer.from('failed-preview-content'));

		db.update(pages)
			.set({
				status: 'error',
				error: 'Test error',
				outputPath: null,
				annotatedPath: annotatedRel,
			})
			.where(eq(pages.id, p.id))
			.run();

		expect(existsSync(join(dataRoot, annotatedRel))).toBe(true);

		// RUN PURGE ORPHANED STORAGE
		const res = purgeOrphanedStorage(dataRoot);

		// RESIDUAL ANNOTATED FILE WAS DELETED
		expect(res.purgedFiles).toBeGreaterThanOrEqual(1);
		expect(existsSync(join(dataRoot, annotatedRel))).toBe(false);
		expect(existsSync(annotatedDir)).toBe(false);

		// DATABASE ANNOTATED PATH WAS CLEARED
		const updatedPage = db.select().from(pages).where(eq(pages.id, p.id)).get();
		expect(updatedPage?.annotatedPath).toBeNull();
	});
});
