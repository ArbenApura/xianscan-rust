// BATCH SERVICE & CONCURRENCY QUEUE TESTS — ORCHESTRATION, RETRIES, DYNAMIC HOT-RESIZING
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PQueue from '$lib/server/queue';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('PQueue dynamic concurrency and clearing', () => {
	it('handles dynamic concurrency hot-resizing', async () => {
		const queue = new PQueue({ concurrency: 1 });
		expect(queue.concurrency).toBe(1);

		let activeCount = 0;
		let maxObservedActive = 0;

		const createTask = () => async () => {
			activeCount++;
			if (activeCount > maxObservedActive) maxObservedActive = activeCount;
			await new Promise((r) => setTimeout(r, 20));
			activeCount--;
		};

		const p1 = queue.add(createTask());
		const p2 = queue.add(createTask());
		const p3 = queue.add(createTask());
		const p4 = queue.add(createTask());

		// HOT-RESIZE CONCURRENCY TO 4
		queue.concurrency = 4;
		expect(queue.concurrency).toBe(4);

		await Promise.all([p1, p2, p3, p4]);
		expect(maxObservedActive).toBeGreaterThan(1);
	});

	it('clears queued tasks on demand', async () => {
		const queue = new PQueue({ concurrency: 1 });
		let executed = 0;

		const task = async () => {
			executed++;
			await new Promise((r) => setTimeout(r, 50));
		};

		const p1 = queue.add(task);
		const p2 = queue.add(task).catch((err) => err);
		const p3 = queue.add(task).catch((err) => err);

		expect(queue.size).toBe(2);
		queue.clear();
		expect(queue.size).toBe(0);

		await p1;
		const [r2, r3] = await Promise.all([p2, p3]);
		expect(r2).toMatchObject({ name: 'AbortError' });
		expect(r3).toMatchObject({ name: 'AbortError' });
		expect(executed).toBe(1);
	});
});

describe('batchService state management and retries', () => {
	let db: TestDb;

	beforeEach(() => {
		db = getTestDb();
		resetDb();
	});

	it('initializes and manages queue state properly', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();

		const state = batchService.getState();
		expect(state.active).toBe(false);
		expect(state.status).toBe('idle');
		expect(state.queue).toHaveLength(0);
	});

	it('PQueue addAll waits for all items even when a task rejects', async () => {
		const queue = new PQueue({ concurrency: 1 });
		const order: number[] = [];

		const task1 = async () => {
			await new Promise((r) => setTimeout(r, 20));
			order.push(1);
			throw new Error('Task 1 failed');
		};

		const task2 = async () => {
			await new Promise((r) => setTimeout(r, 20));
			order.push(2);
			return 'ok';
		};

		await expect(queue.addAll([task1, task2])).rejects.toThrow('Task 1 failed');
		// BOTH TASKS COMPLETED THEIR ATTEMPT SEQUENTIALLY
		expect(order).toEqual([1, 2]);
		expect(queue.pending).toBe(0);
	});

	it('preserves whole-chapter run when queuing individual page into active batch', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();

		const book = seedBook(db, { id: 'book-test-1', title: 'Test Book' });
		const ch = seedChapter(db, { bookId: book.id, seq: 0, title: 'Chapter 1' });
		const p1 = seedPage(db, { chapterId: ch.id, seq: 0 });
		const p2 = seedPage(db, { chapterId: ch.id, seq: 1 });
		const p3 = seedPage(db, { chapterId: ch.id, seq: 2 });

		// START BATCH TRANSLATION FOR ENTIRE CHAPTER
		await batchService.startBatch(book.id, book.title, [ch.id], { force: false });

		const state1 = batchService.getState();
		expect(state1.active).toBe(true);
		expect(state1.queue).toHaveLength(1);
		expect(state1.queue[0].id).toBe(ch.id);
		expect(state1.queue[0].pageIds).toBeUndefined();
		expect(state1.queue[0].totalPages).toBe(3);

		// RETRANSLATE AN INDIVIDUAL PAGE WHILE THE CHAPTER IS IN-FLIGHT
		await batchService.startBatch(book.id, book.title, [ch.id], {
			force: true,
			pageIds: [p1.id],
		});

		const state2 = batchService.getState();
		expect(state2.active).toBe(true);
		expect(state2.queue).toHaveLength(1);
		// MUST REMAIN WHOLE-CHAPTER RUN WITH ALL PAGES PRESERVED
		expect(state2.queue[0].pageIds).toBeUndefined();
		expect(state2.queue[0].totalPages).toBe(3);

		batchService.clearBatch();
	});

	it('narrows to pageIds when queuing a specific page for a finished chapter', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();

		const book = seedBook(db, { id: 'book-test-2', title: 'Test Book 2' });
		const ch = seedChapter(db, { bookId: book.id, seq: 0, title: 'Chapter 1' });
		const p1 = seedPage(db, { chapterId: ch.id, seq: 0 });
		const p2 = seedPage(db, { chapterId: ch.id, seq: 1 });

		// START BATCH TRANSLATION AND MARK FINISHED VIA SKIPCHAPTER
		await batchService.startBatch(book.id, book.title, [ch.id], { force: false });
		await batchService.skipChapter(ch.id);

		// RETRANSLATE ONLY PAGE 1 AFTER CHAPTER IS FINISHED
		await batchService.startBatch(book.id, book.title, [ch.id], {
			force: true,
			pageIds: [p1.id],
		});

		const state = batchService.getState();
		expect(state.queue[0].pageIds).toEqual([p1.id]);
		expect(state.queue[0].totalPages).toBe(1);

		batchService.clearBatch();
	});
});
