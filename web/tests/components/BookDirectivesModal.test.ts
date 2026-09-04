/**
 * @vitest-environment jsdom
 */
// IMPORTED DEP-MODULES
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
// IMPORTED COMPONENTS
import BookDirectivesModal from '$lib/components/book/BookDirectivesModal.svelte';

describe('BookDirectivesModal Component', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders modal with book context, explanation, and initial prompt', () => {
		render(BookDirectivesModal, {
			props: {
				open: true,
				book: {
					id: 'book-123',
					title: 'Reverend Insanity',
					titleTarget: 'Gu Daoist Master',
					customPrompt: 'Initial directives for Gu cultivation.',
				},
			},
		});

		expect(screen.getByText('Localization Directives')).toBeTruthy();
		expect(screen.getByText('Gu Daoist Master')).toBeTruthy();
		expect(screen.getByText(/Add custom instructions for the translation model/i)).toBeTruthy();

		const textarea = screen.getByPlaceholderText(/Keep cultivation ranks formal in pinyin/i) as HTMLTextAreaElement;
		expect(textarea.value).toBe('Initial directives for Gu cultivation.');
	});

	it('closes modal when clicking close button', async () => {
		const { component } = render(BookDirectivesModal, {
			props: {
				open: true,
				book: {
					id: 'book-123',
					title: 'Martial Peak',
					customPrompt: '',
				},
			},
		});

		const closeHandler = vi.fn();
		component.$on('close', closeHandler);

		const closeButton = screen.getByRole('button', { name: 'Close' });
		await fireEvent.click(closeButton);
		await tick();

		expect(closeHandler).toHaveBeenCalled();
	});

	it('clears directives on reset', async () => {
		render(BookDirectivesModal, {
			props: {
				open: true,
				book: {
					id: 'book-123',
					title: 'Some Book',
					customPrompt: 'Existing text to clear.',
				},
			},
		});

		const clearBtn = screen.getByRole('button', { name: /Clear Directives/i });
		await fireEvent.click(clearBtn);
		await tick();

		const textarea = screen.getByPlaceholderText(/Keep cultivation ranks formal in pinyin/i) as HTMLTextAreaElement;
		expect(textarea.value).toBe('');
	});

	it('saves directives via PATCH /api/books/[id] and fires saved event', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				book: {
					id: 'book-123',
					title: 'Return of the Mount Hua Sect',
					customPrompt: 'Save me',
				},
			}),
		});
		global.fetch = fetchMock;

		const { component } = render(BookDirectivesModal, {
			props: {
				open: true,
				book: {
					id: 'book-123',
					title: 'Return of the Mount Hua Sect',
					customPrompt: 'Initial text',
				},
			},
		});

		const savedHandler = vi.fn();
		component.$on('saved', savedHandler);

		const textarea = screen.getByPlaceholderText(/Keep cultivation ranks formal in pinyin/i) as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'Updated Mount Hua directives' } });
		await tick();

		const saveBtn = screen.getByRole('button', { name: /Save Directives/i });
		await fireEvent.click(saveBtn);
		await tick();

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/books/book-123',
			expect.objectContaining({
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ customPrompt: 'Updated Mount Hua directives' }),
			})
		);

		expect(savedHandler).toHaveBeenCalled();
		expect(savedHandler.mock.calls[0][0].detail.customPrompt).toBe('Updated Mount Hua directives');
	});
});
