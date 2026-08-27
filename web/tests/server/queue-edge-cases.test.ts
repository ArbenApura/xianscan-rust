// EDGE-CASE PROBE SUITE FOR BATCH PAGE QUEUEING
// Explores scenarios beyond the primary happy paths to surface latent bugs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('$lib/server/pipeline-client', async () => {
	const actual = await vi.importActual<any>('$lib/server/pipeline-client');
	return {
		...actual,
		createPipelineClient: () => ({ analyze: async () => ({ regions: [], width: 1, height: 1, backend: 'mock' }), clean: async () => Buffer.from('') }),
	};
});
vi.mock('$lib/server/providers', async () => ({ getActiveProvider: () => ({ baseUrl: 'http://mock' }) }));

// CONFIGURABLE MOCK: when cfg.complete is true the (fake) job completes and emits 'done'.
const cfg: { complete: boolean } = { complete: false };
vi.mock('$lib/server/chapter-pipeline', async () => {
	const actual = await vi.importActual<any>('$lib/server/chapter-pipeline');
	return {
		...actual,
		setAllActiveChapterPageConcurrencies: () => {},
		chapterWork: () => (signal: AbortSignal, emit: (e: any) => void) =>
			new Promise<void>((resolve) => {
				const t = setInterval(() => {
					if (signal.aborted) {
						clearInterval(t);
						resolve();
					} else if (cfg.complete) {
						clearInterval(t);
						emit({ type: 'done', chapterId: 0 });
						resolve();
					}
				}, 5);
			}),
	};
});

describe('batch page-queueing edge cases', () => {
	let db: TestDb;
	let bookId: string;
	let chapterId: number;
	let p1: { id: number };
	let p2: { id: number };
	let p3: { id: number };

	beforeEach(async () => {
		cfg.complete = false;
		db = getTestDb();
		resetDb();
		const book = seedBook(db, { id: 'b1' });
		bookId = book.id;
		const chapter = seedChapter(db, { bookId, seq: 0 });
		chapterId = chapter.id;
		p1 = seedPage(db, { chapterId, seq: 0 });
		p2 = seedPage(db, { chapterId, seq: 1 });
		p3 = seedPage(db, { chapterId, seq: 2 });
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();
	});

	it('completed batch → queuing a second page starts a working job (does not stall)', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		// Page1 runs and COMPLETES → batch 'completed'.
		cfg.complete = true;
		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 60));

		// Now queue page2.
		resetPageProgress(p2.id);
		const state = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p2.id] });
		expect(state.active).toBe(true);
		expect(state.status).toBe('running');
		expect(state.queue.length).toBe(1);
		expect(state.queue[0].pageIds).toEqual([p2.id]);
		// Page2 job must be running and tracked (not orphaned/stalled).
		await new Promise((r) => setTimeout(r, 60));
		expect(state.queue[0].status).toMatch(/queued|processing|done/);
	});

	it('queuing the SAME page twice dedups to a single pageId', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));

		// Queue p1 again — should not duplicate.
		resetPageProgress(p1.id);
		const state = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		const item = state.queue.find((q) => q.id === chapterId);
		expect(item?.pageIds).toEqual([p1.id]);
		expect(item?.totalPages).toBe(1);
	});

	it('pause → merge a page into the queued chapter → resume still works', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));

		batchService.pauseBatch();

		// While paused, queue page2 (chapter is now 'queued').
		resetPageProgress(p2.id);
		const paused = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p2.id] });
		const item = paused.queue.find((q) => q.id === chapterId);
		expect(item?.pageIds).toEqual([p1.id, p2.id]);
		expect(item?.status).toBe('queued');

		// Resume — should dispatch and still be tracking the merged item.
		const resumed = batchService.resumeBatch();
		const resumedItem = resumed.queue.find((q) => q.id === chapterId);
		expect(resumedItem?.pageIds).toEqual([p1.id, p2.id]);
		expect(resumed.active).toBe(true);
		expect(resumed.status).toBe('running');
	});

	it('same book, two chapters: each keeps its own pageIds when queued individually', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		const ch2 = seedChapter(db, { bookId, seq: 1 });
		const ch2p1 = seedPage(db, { chapterId: ch2.id, seq: 0 });

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));

		// Queue chapter2's page — must be a SEPARATE queue item with its own pageIds.
		resetPageProgress(ch2p1.id);
		const state = await batchService.startBatch(bookId, 'Book', [ch2.id], { force: true, pageIds: [ch2p1.id] });

		expect(state.queue.length).toBe(2);
		expect(state.queue.find((q) => q.id === chapterId)?.pageIds).toEqual([p1.id]);
		expect(state.queue.find((q) => q.id === ch2.id)?.pageIds).toEqual([ch2p1.id]);
	});

	it('queueing a page of a NEW chapter while the batch is running appends it as queued', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		const ch2 = seedChapter(db, { bookId, seq: 1 });
		const ch2p1 = seedPage(db, { chapterId: ch2.id, seq: 0 });

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));

		resetPageProgress(ch2p1.id);
		const state = await batchService.startBatch(bookId, 'Book', [ch2.id], { force: true, pageIds: [ch2p1.id] });
		const item = state.queue.find((q) => q.id === ch2.id);
		expect(item?.status).toBe('queued');
		expect(item?.pageIds).toEqual([ch2p1.id]);
	});

	it('cross-book parallel workers: merging page into book B works while book A runs', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		const bookA = seedBook(db, { id: 'bA' });
		const chA = seedChapter(db, { bookId: bookA.id, seq: 0 });
		const a1 = seedPage(db, { chapterId: chA.id, seq: 0 });

		const bookB = seedBook(db, { id: 'bB' });
		const chB = seedChapter(db, { bookId: bookB.id, seq: 0 });
		const b1 = seedPage(db, { chapterId: chB.id, seq: 0 });
		const b2 = seedPage(db, { chapterId: chB.id, seq: 1 });

		resetPageProgress(a1.id);
		await batchService.startBatch(bookA.id, 'Book A', [chA.id], { force: true, pageIds: [a1.id], parallelWorkers: 2 });
		await new Promise((r) => setTimeout(r, 30));

		resetPageProgress(b1.id);
		await batchService.startBatch(bookB.id, 'Book B', [chB.id], { force: true, pageIds: [b1.id], parallelWorkers: 2 });
		resetPageProgress(b2.id);
		const state = await batchService.startBatch(bookB.id, 'Book B', [chB.id], { force: true, pageIds: [b2.id], parallelWorkers: 2 });

		expect(state.queue.find((q) => q.id === chB.id)?.pageIds).toEqual([b1.id, b2.id]);
		expect(state.queue.find((q) => q.id === chA.id)?.pageIds).toEqual([a1.id]);
		expect(state.queue.length).toBe(2);
	});

	it('force re-queue of a whole chapter while processing supersedes cleanly (no orphan)', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { getChapterJob } = await import('$lib/server/translation-service');

		await batchService.startBatch(bookId, 'Book', [chapterId], { force: false });
		await new Promise((r) => setTimeout(r, 30));
		expect(getChapterJob(chapterId)).not.toBeNull();

		// Force whole-chapter re-queue while it is processing.
		const state = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true });
		await new Promise((r) => setTimeout(r, 40));
		expect(state.queue.length).toBe(1);
		expect(state.queue[0].pageIds).toBeUndefined();
		// The superseded job must not orphan the new one.
		expect(getChapterJob(chapterId)).not.toBeNull();
	});

	it('queueing a page after CANCEL starts a fresh working batch', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));
		batchService.cancelBatch();

		// Queue page2 after the cancel.
		resetPageProgress(p2.id);
		const state = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p2.id] });
		expect(state.active).toBe(true);
		expect(state.status).toBe('running');
		expect(state.queue.length).toBe(1);
		expect(state.queue[0].pageIds).toEqual([p2.id]);
		expect(state.queue[0].status).toMatch(/queued|processing/);
	});

	it('merging into a queued chapter does not prematurely mark it done', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { resetPageProgress } = await import('$lib/server/chapters/mutations');

		resetPageProgress(p1.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));

		// Chapter should be processing (job alive). Add pages 2 and 3.
		resetPageProgress(p2.id);
		await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p2.id] });
		resetPageProgress(p3.id);
		const state = await batchService.startBatch(bookId, 'Book', [chapterId], { force: true, pageIds: [p3.id] });

		const item = state.queue.find((q) => q.id === chapterId);
		expect(item?.pageIds).toEqual([p1.id, p2.id, p3.id]);
		expect(item?.totalPages).toBe(3);
		expect(item?.status).toBe('processing');
	});
});
