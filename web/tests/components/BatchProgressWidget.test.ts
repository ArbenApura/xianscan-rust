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

		expect(screen.queryByText('Batch')).toBeNull();
	});

	it('displays progress bar when batch is running', async () => {
		// Mock apiJson for the unit test
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						active: true,
						status: 'running',
						bookId: 'test-book-id',
						bookTitle: 'Test Book',
						queue: [
							{ id: 1, seq: 1, title: 'Chapter 1', pageCount: 10, status: 'processing', translatedPages: 2 },
							{ id: 2, seq: 2, title: 'Chapter 2', pageCount: 10, status: 'queued', translatedPages: 0 },
						],
						currentIndex: 0,
						force: false,
						startedAt: Date.now(),
						completedAt: null,
						totalPromptTokens: 0,
						totalCompletionTokens: 0,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			),
		);

		await batchTracker.startBatch(
			'test-book-id',
			'Test Book',
			[
				{ id: 1, seq: 1, title: 'Chapter 1', pageCount: 10 },
				{ id: 2, seq: 2, title: 'Chapter 2', pageCount: 10 },
			],
		);

		render(BatchProgressWidget);
		await tick();

		// DEFAULT INITIAL STATE IS THE SMALL ROUNDED SQUARE FLOATING ORB (SHOWS PROGRESS PERCENTAGE)
		expect(screen.getByRole('button', { name: /Expand translation studio queue/i })).toBeTruthy();
		expect(screen.getByText(/10%/i)).toBeTruthy();

		// CLICK / TAP TO EXPAND INTO THE FULL HUD MODAL
		const orb = screen.getByRole('button', { name: /Expand translation studio queue/i });
		await fireEvent.pointerDown(orb, { clientX: 100, clientY: 100 });
		await fireEvent.pointerUp(orb, { clientX: 100, clientY: 100 });
		await tick();

		expect(screen.getByText(/Queue Active/i)).toBeTruthy();
		expect(screen.getAllByText(/Chapter 1/i).length).toBeGreaterThan(0);
	});

	it('displays Queue Failed and error icons when batch fails (e.g. LLM failure)', async () => {
		// Mock apiJson returning completed batch with all chapters errored
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						active: true,
						status: 'completed',
						bookId: 'test-book-id',
						bookTitle: 'Test Book',
						queue: [
							{ id: 1, seq: 1, title: 'Chapter 1', pageCount: 10, status: 'error', error: 'LLM Rate limit exceeded', translatedPages: 0 },
						],
						currentIndex: 0,
						force: false,
						startedAt: Date.now() - 5000,
						completedAt: Date.now(),
						totalPromptTokens: 0,
						totalCompletionTokens: 0,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			),
		);

		await batchTracker.sync();

		render(BatchProgressWidget);
		await tick();

		// CLICK TO EXPAND
		const orb = screen.getByRole('button', { name: /Expand translation studio queue/i });
		await fireEvent.pointerDown(orb, { clientX: 100, clientY: 100 });
		await fireEvent.pointerUp(orb, { clientX: 100, clientY: 100 });
		await tick();

		// MUST DISPLAY "Queue Failed" AND NOT "Queue Finished" OR SUCCESS CHECKMARK
		expect(screen.getAllByText(/Queue Failed/i).length).toBeGreaterThan(0);
		expect(screen.queryByText(/Queue Finished/i)).toBeNull();
		expect(screen.getByText(/✕ Error/i)).toBeTruthy();
	});

	it('displays Aborted badge for Inpaint when translation failed and inpaint was aborted', async () => {
		const { jobTracker } = await import('$lib/stores/job-tracker');

		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const urlStr = String(url);
			if (urlStr.includes('/api/chapters/1/job')) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							running: false,
							snapshot: {
								chapterId: 1,
								status: 'failed',
								totalPages: 1,
								completedPages: 0,
								failedPages: 1,
								pages: [
									{
										pageIndex: 0,
										pageId: 101,
										seq: 0,
										status: 'error',
										failedStep: 'translate',
										errorMessage: '401 Invalid API Key',
										timings: {
											analyze: { step: 'analyze', status: 'completed', durationMs: 120 },
											translate: { step: 'translate', status: 'failed', details: { error: '401 Invalid API Key' } },
											clean: { step: 'clean', status: 'failed', details: { error: 'Aborted' } },
										},
									},
								],
							},
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } },
					),
				);
			}
			return Promise.resolve(
				new Response(
					JSON.stringify({
						active: true,
						status: 'completed',
						bookId: 'test-book-id',
						bookTitle: 'Test Book',
						queue: [
							{ id: 1, seq: 1, title: 'Chapter 1', pageCount: 1, status: 'error', error: '401 Invalid API Key', translatedPages: 0 },
						],
						currentIndex: 0,
						force: false,
						startedAt: Date.now() - 5000,
						completedAt: Date.now(),
						totalPromptTokens: 0,
						totalCompletionTokens: 0,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			);
		});

		await batchTracker.sync();
		await jobTracker.syncChapter(1);

		render(BatchProgressWidget);
		await tick();

		// CLICK TO EXPAND
		const orb = screen.getByRole('button', { name: /Expand translation studio queue/i });
		await fireEvent.pointerDown(orb, { clientX: 100, clientY: 100 });
		await fireEvent.pointerUp(orb, { clientX: 100, clientY: 100 });
		await tick();

		// SWITCH TO LIVE TELEMETRY TAB
		const telemetryTabBtn = screen.getByRole('button', { name: /Live Telemetry/i });
		await fireEvent.click(telemetryTabBtn);
		await tick();

		expect(screen.queryByText(/Inpaint\.\.\./i)).toBeNull();
		expect(screen.getByText('Aborted')).toBeTruthy();
	});
});
