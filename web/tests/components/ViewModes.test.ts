/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import ViewModeGrid from '$lib/components/chapter/ViewModeGrid.svelte';
import ViewModeCompare from '$lib/components/chapter/ViewModeCompare.svelte';
import ViewModeWebtoon from '$lib/components/chapter/ViewModeWebtoon.svelte';
import EndOfChapterCard from '$lib/components/chapter/EndOfChapterCard.svelte';

describe('Chapter View Modes UI Components', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	const mockPages = [
		{
			id: 1,
			seq: 0,
			status: 'done',
			filePath: 'page_1.png',
			outputPath: 'out_1.png',
			width: 800,
			height: 1200,
		},
		{
			id: 2,
			seq: 1,
			status: 'pending',
			filePath: 'page_2.png',
			width: 800,
			height: 1200,
		},
	];

	it('renders ViewModeGrid with page cards and badges', async () => {
		render(ViewModeGrid, {
			props: {
				pages: mockPages,
				running: false,
			},
		});

		expect(screen.getByText('Page 1')).toBeTruthy();
		expect(screen.getByText('Page 2')).toBeTruthy();
		expect(screen.getByText('Translated')).toBeTruthy();
		expect(screen.getByText('Pending')).toBeTruthy();
	});

	it('renders ViewModeCompare with side-by-side original and translated slots', async () => {
		render(ViewModeCompare, {
			props: {
				pages: mockPages,
				running: false,
			},
		});

		expect(screen.getAllByText('Original').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Translated').length).toBeGreaterThan(0);
	});

	it('renders ViewModeWebtoon continuous vertical scroll layout', async () => {
		render(ViewModeWebtoon, {
			props: {
				pages: mockPages,
				webtoonKind: 'output',
				webtoonWidth: 'md',
			},
		});

		const images = screen.getAllByRole('img');
		expect(images.length).toBe(2);
	});

	it('renders EndOfChapterCard with chapter navigation buttons', async () => {
		render(EndOfChapterCard, {
			props: {
				bookId: 'book-1',
				chapterSeq: 0,
				totalPages: 24,
				prevChapter: { id: 1, seq: 0, title: 'Chapter 1' },
				nextChapter: { id: 3, seq: 2, title: 'Chapter 3' },
			},
		});

		expect(screen.getByText('End of Chapter 1')).toBeTruthy();
		expect(screen.getByText('Chapter List')).toBeTruthy();
		expect(screen.getByText('Previous (Ch. 1)')).toBeTruthy();
		expect(screen.getByText('Next Chapter (Ch. 3)')).toBeTruthy();
	});
});
