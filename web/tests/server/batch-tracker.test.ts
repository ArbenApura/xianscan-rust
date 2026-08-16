// BATCH TRACKER STORE TESTS — ORCHESTRATION, CONCURRENCY DISPATCHING, METRICS, AND LIFECYCLE CONTROLS
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/sse', () => ({
	streamSse: vi.fn().mockResolvedValue(undefined),
}));

import { batchTracker, batchProgress } from '$lib/stores/batch-tracker';

describe('batchTracker & batchProgress', () => {
	beforeEach(() => {
		batchTracker.clearBatch();
	});

	it('initializes in idle state', () => {
		const state = get(batchTracker);
		expect(state.active).toBe(false);
		expect(state.status).toBe('idle');
		expect(state.queue).toHaveLength(0);

		const progress = get(batchProgress);
		expect(progress.active).toBe(false);
		expect(progress.totalChapters).toBe(0);
		expect(progress.completedChapters).toBe(0);
	});

	it('starts a batch and computes overall progress correctly', () => {
		const chapters = [
			{ id: 101, seq: 0, title: 'Chapter 1', pageCount: 10 },
			{ id: 102, seq: 1, title: 'Chapter 2', pageCount: 15 },
			{ id: 103, seq: 2, title: 'Chapter 3', pageCount: 20 },
		];

		batchTracker.startBatch('book_1', 'Test Book', chapters);

		const state = get(batchTracker);
		expect(state.active).toBe(true);
		expect(state.status).toBe('running');
		expect(state.bookId).toBe('book_1');
		expect(state.queue).toHaveLength(3);

		const progress = get(batchProgress);
		expect(progress.active).toBe(true);
		expect(progress.totalChapters).toBe(3);
		expect(progress.totalAllPages).toBe(45);
	});

	it('pauses and resumes batch translation', () => {
		const chapters = [{ id: 201, seq: 0, title: 'Chapter 1', pageCount: 5 }];
		batchTracker.startBatch('book_2', 'Book Two', chapters);

		batchTracker.pauseBatch();
		expect(get(batchTracker).status).toBe('paused');

		batchTracker.resumeBatch();
		expect(get(batchTracker).status).toBe('running');
	});

	it('cancels batch translation and marks queue items as cancelled', async () => {
		const chapters = [
			{ id: 301, seq: 0, title: 'Chapter 1', pageCount: 8 },
			{ id: 302, seq: 1, title: 'Chapter 2', pageCount: 8 },
		];
		batchTracker.startBatch('book_3', 'Book Three', chapters);

		await batchTracker.cancelBatch();
		const state = get(batchTracker);
		expect(state.status).toBe('cancelled');
		expect(state.queue.every((c) => c.status === 'cancelled')).toBe(true);
	});

	it('skips a chapter and advances queue', async () => {
		const chapters = [
			{ id: 401, seq: 0, title: 'Chapter 1', pageCount: 10 },
			{ id: 402, seq: 1, title: 'Chapter 2', pageCount: 12 },
		];
		batchTracker.startBatch('book_4', 'Book Four', chapters);

		await batchTracker.skipCurrentChapter(401);
		const state = get(batchTracker);
		const ch1 = state.queue.find((c) => c.id === 401);
		expect(ch1?.status).toBe('skipped');
	});
});
