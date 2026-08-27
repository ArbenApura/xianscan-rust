// FOCUSED REPRODUCTION TEST — QUEUEING A SECOND INDIVIDUAL PAGE AFTER THE FIRST
// (web/tests/server/queue-second-page.test.ts)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// MOCK THE SIDECAR CLIENT AND PROVIDER SO executeChapterJob DOES NOT THROW AT CREATION.
vi.mock('$lib/server/pipeline-client', async () => {
	const actual = await vi.importActual<any>('$lib/server/pipeline-client');
	return {
		...actual,
		createPipelineClient: () => ({ analyze: async () => ({ regions: [], width: 1, height: 1, backend: 'mock' }), clean: async () => Buffer.from('') }),
	};
});
vi.mock('$lib/server/providers', async () => ({
	getActiveProvider: () => ({ baseUrl: 'http://mock' }),
}));

// MOCK THE HEAVY PIPELINE SO JOBS COMPLETE INSTANTLY AND DO NOT HIT THE ML SIDECAR.
// chapterWork keeps the job alive (never emits done) UNLESS told to complete, so we can simulate a
// batch that is still RUNNING when a second page is queued.
vi.mock('$lib/server/chapter-pipeline', async () => {
	const actual = await vi.importActual<any>('$lib/server/chapter-pipeline');
	return {
		...actual,
		setAllActiveChapterPageConcurrencies: () => {},
		chapterWork: () => (signal: AbortSignal, emit: (e: any) => void) => {
			return new Promise<void>((resolve) => {
				const t = setInterval(() => {
					if (signal.aborted) {
						clearInterval(t);
						resolve();
					}
				}, 5);
			});
		},
	};
});

describe('batch queueing of individual pages', () => {
	let db: TestDb;
	let bookId: string;
	let chapterId: number;
	let page1: { id: number };
	let page2: { id: number };

	beforeEach(async () => {
		db = getTestDb();
		resetDb();
		const book = seedBook(db, { id: 'b1' });
		bookId = book.id;
		const chapter = seedChapter(db, { bookId, seq: 0 });
		chapterId = chapter.id;
		page1 = seedPage(db, { chapterId, seq: 0 });
		page2 = seedPage(db, { chapterId, seq: 1 });

		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();
	});

	it('fresh batch after page1 completion queues page2 with correct pageIds', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		// Simulate user queuing page 1 (individual page) — the real UI calls reset FIRST.
		resetPageProgress(page1.id);
		const state1 = await batchService.startBatch(bookId, 'Book', [chapterId], {
			force: true,
			pageIds: [page1.id],
		});
		expect(state1.queue.length).toBe(1);
		expect(state1.queue[0].pageIds).toEqual([page1.id]);
		expect(['queued', 'processing']).toContain(state1.queue[0].status);
		expect(state1.active).toBe(true);
	});

	it('REGRESSION: superseding a running job must not orphan the new job at the same key', async () => {
		const { startChapterJob, getChapterJob } = await import('$lib/server/translation-service');

		// Start a long-lived job, then immediately supersede it with a fresh force job at the same key.
		startChapterJob(chapterId, () => new Promise<void>(() => {}), { force: true });
		await new Promise((r) => setTimeout(r, 20));
		expect(getChapterJob(chapterId)).not.toBeNull();

		startChapterJob(chapterId, () => new Promise<void>(() => {}), { force: true });
		await new Promise((r) => setTimeout(r, 40));

		// The superseded job's finally must NOT delete the new job from the registry.
		expect(getChapterJob(chapterId)).not.toBeNull();
	});

	it('REGRESSION: resetting page2 must NOT wipe page1 from the running batch (pages merge into ONE queue item)', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		// Queue page 1 (individual) — job stays alive, batch running, chapter 'processing'.
		resetPageProgress(page1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [page1.id] });
		await new Promise((r) => setTimeout(r, 30));

		// Simulate the real UI: queue page 2 → reset page 2 FIRST (which used to clear the whole batch
		// via batchService.resetChapter, dropping page 1 from the queue), then start a new batch.
		resetPageProgress(page2.id);
		const state2 = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [page2.id] });

		// EXPECTED: ONE queue item (the chapter) with BOTH pages — page1 is NOT replaced/dropped.
		expect(state2.queue.length).toBe(1);
		expect(state2.queue[0].pageIds).toEqual([page1.id, page2.id]);
		expect(state2.queue[0].totalPages).toBe(2);
	});

	it('REGRESSION: queueing page2 of a chapter in ANOTHER book merges (does not replace page1)', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		// Two books, each with one chapter and two pages.
		const bookA = seedBook(db, { id: 'bA' });
		const chA = seedChapter(db, { bookId: bookA.id, seq: 0 });
		const a1 = seedPage(db, { chapterId: chA.id, seq: 0 });

		const bookB = seedBook(db, { id: 'bB' });
		const chB = seedChapter(db, { bookId: bookB.id, seq: 0 });
		const b1 = seedPage(db, { chapterId: chB.id, seq: 0 });
		const b2 = seedPage(db, { chapterId: chB.id, seq: 1 });

		// User individually processes a page in book A — batch starts with book A's chapter.
		resetPageProgress(a1.id);
		await batchService.startBatch(bookA.id, 'Book A', [chA.id], { force: true, pageIds: [a1.id] });
		await new Promise((r) => setTimeout(r, 30));

		// First page of book B registers — appended to the active batch as a 'queued' chapter.
		resetPageProgress(b1.id);
		const state1 = await batchService.startBatch(bookB.id, 'Book B', [chB.id], { force: true, pageIds: [b1.id] });
		const bItem1 = state1.queue.find((q) => q.id === chB.id);
		expect(bItem1?.pageIds).toEqual([b1.id]);

		// Second page of book B must MERGE into the same chapter item, NOT replace page1.
		resetPageProgress(b2.id);
		const state2 = await batchService.startBatch(bookB.id, 'Book B', [chB.id], { force: true, pageIds: [b2.id] });
		const bItem2 = state2.queue.find((q) => q.id === chB.id);
		expect(bItem2?.pageIds).toEqual([b1.id, b2.id]);
		expect(bItem2?.totalPages).toBe(2);
	});

	it('addPages path: queuing page2 while chapter is processing (no reset)', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		// Start a batch translating page 1; the (mocked) job stays alive so the chapter is 'processing'.
		const state1 = await batchService.startBatch(bookId, 'Book', [chapterId], {
			force: true,
			pageIds: [page1.id],
		});
		await new Promise((r) => setTimeout(r, 30));
		expect(state1.queue[0].status).toBe('processing');

		// Queue page 2 WITHOUT resetting — this exercises the duplicate-detection "add pages to running job" path.
		const state2 = await batchService.startBatch(bookId, 'Book', [chapterId], {
			force: true,
			pageIds: [page2.id],
		});

		expect(state2.queue.length).toBe(1);
		expect(state2.queue[0].status).toBe('processing');
		expect(state2.queue[0].pageIds).toEqual([page1.id, page2.id]);
		expect(state2.queue[0].totalPages).toBe(2);
	});
});
