/**
 * @vitest-environment jsdom
 */
// -- EXTERNAL IMPORTS -- //
import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -- INTERNAL IMPORTS -- //
import ChapterListItem from '$lib/components/chapter/ChapterListItem.svelte';
import { batchTracker } from '$lib/stores/batch-tracker';
import type { Chapter } from '$lib/types';

describe('Chapter Status & Live Progress in Compact View', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		batchTracker.clearBatch();
	});

	afterEach(() => {
		cleanup();
		batchTracker.clearBatch();
	});

	const fullyTranslatedChapter: Chapter = {
		id: 101,
		bookId: '52805e17-a9a2-4b9a-9feb-e1aaa7e96e5c',
		seq: 0,
		title: 'Chapter 1',
		titleTarget: 'Chapter 1',
		status: 'done',
		pageCount: 8,
		translatedPageCount: 8,
		coverPageId: null,
		coverHasOutput: false,
		translatedAt: Date.now(),
		createdAt: Date.now(),
	};

	it('displays DONE when all 8 pages are translated and batch item had 1 page translated', async () => {
		// SIMULATE ACTIVE BATCH WHERE AN INDIVIDUAL PAGE (1 PAGE) WAS TRANSLATED
		batchTracker.set({
			active: true,
			status: 'idle',
			bookId: '52805e17-a9a2-4b9a-9feb-e1aaa7e96e5c',
			bookTitle: 'Test Book',
			queue: [
				{
					id: 101,
					seq: 0,
					title: 'Chapter 1',
					pageCount: 8,
					status: 'done',
					translatedPages: 1,
					totalPages: 1,
					pageIds: [5],
				},
			],
			currentIndex: 1,
			currentPhase: undefined,
			force: false,
			startedAt: Date.now() - 1000,
			completedAt: Date.now(),
			totalPromptTokens: 100,
			totalCompletionTokens: 50,
		});

		render(ChapterListItem, {
			props: {
				chapter: fullyTranslatedChapter,
				bookId: '52805e17-a9a2-4b9a-9feb-e1aaa7e96e5c',
				viewLayout: 'compact',
			},
		});

		expect(screen.getByText('8/8 pgs')).toBeTruthy();
		expect(screen.getByText('DONE')).toBeTruthy();
		expect(screen.queryByText('PENDING')).toBeNull();
	});

	it('displays PENDING when only 1 of 8 pages is translated in batch and chapter', async () => {
		const partiallyTranslatedChapter: Chapter = {
			...fullyTranslatedChapter,
			status: 'pending',
			translatedPageCount: 1,
		};

		batchTracker.set({
			active: true,
			status: 'idle',
			bookId: '52805e17-a9a2-4b9a-9feb-e1aaa7e96e5c',
			bookTitle: 'Test Book',
			queue: [
				{
					id: 101,
					seq: 0,
					title: 'Chapter 1',
					pageCount: 8,
					status: 'done',
					translatedPages: 1,
					totalPages: 1,
					pageIds: [5],
				},
			],
			currentIndex: 1,
			currentPhase: undefined,
			force: false,
			startedAt: Date.now() - 1000,
			completedAt: Date.now(),
			totalPromptTokens: 100,
			totalCompletionTokens: 50,
		});

		render(ChapterListItem, {
			props: {
				chapter: partiallyTranslatedChapter,
				bookId: '52805e17-a9a2-4b9a-9feb-e1aaa7e96e5c',
				viewLayout: 'compact',
			},
		});

		expect(screen.getByText('1/8 pgs')).toBeTruthy();
		expect(screen.getByText('PENDING')).toBeTruthy();
		expect(screen.queryByText('DONE')).toBeNull();
	});
});
