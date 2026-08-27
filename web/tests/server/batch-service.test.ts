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
});
