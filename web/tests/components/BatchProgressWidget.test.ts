/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import BatchProgressWidget from '$lib/components/BatchProgressWidget.svelte';
import { batchTracker } from '$lib/stores/batch-tracker';

describe('BatchProgressWidget Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders null / hidden when batch is inactive', async () => {
		batchTracker.clearBatch();
		render(BatchProgressWidget);
		await tick();

		expect(screen.queryByText('Batch Translating')).toBeNull();
	});

	it('displays progress bar when batch is running', async () => {
		batchTracker.startBatch(
			'test-book-id',
			'Test Book',
			[
				{ id: 1, seq: 1, title: 'Chapter 1' },
				{ id: 2, seq: 2, title: 'Chapter 2' },
			],
			'test-batch-123',
		);

		render(BatchProgressWidget);
		await tick();

		expect(screen.getByText('Batch Translating')).toBeTruthy();
		expect(screen.getByTitle('Test Book')).toBeTruthy();
	});
});
