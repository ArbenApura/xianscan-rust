/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import ChapterToolbar from '$lib/components/chapter/ChapterToolbar.svelte';

describe('ChapterToolbar Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders chapter toolbar with action buttons and mode switcher', async () => {
		render(ChapterToolbar, {
			props: {
				bookId: 'book-123',
				chapterSeq: 0,
				chapterTitle: 'The Beginning',
				totalPages: 10,
				hasProgress: false,
				running: false,
				activeViewMode: 'reader',
			},
		});

		expect(screen.getByText('Translate All')).toBeTruthy();
		expect(screen.queryByText('Clear Progress')).toBeNull();
	});

	it('renders Clear Progress button when hasProgress is true', async () => {
		render(ChapterToolbar, {
			props: {
				bookId: 'book-123',
				chapterSeq: 0,
				chapterTitle: 'The Beginning',
				totalPages: 10,
				hasProgress: true,
				running: false,
				activeViewMode: 'reader',
			},
		});

		expect(screen.getByText('Clear Progress')).toBeTruthy();
	});

	it('dispatches translate event when Translate All button is clicked', async () => {
		const { component } = render(ChapterToolbar, {
			props: {
				bookId: 'book-123',
				chapterSeq: 0,
				chapterTitle: 'The Beginning',
				totalPages: 10,
				running: false,
				activeViewMode: 'reader',
			},
		});

		let translated = false;
		component.$on('translate', () => {
			translated = true;
		});

		const translateBtn = screen.getByText('Translate All');
		await fireEvent.click(translateBtn);
		await tick();

		expect(translated).toBe(true);
	});
});
