// BATCH CHAPTER NOTICES: A SKIPPED AUTO-RESLICE OR A SCRIPT WITH NO COVERING FONT REACHES THE USER AS ONE TOAST
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import type { BatchTranslationState } from '$lib/types';

const h = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('svelte-sonner', () => ({
	toast: Object.assign(vi.fn(), { warning: h.warning, success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('$lib/sse', () => ({ streamSse: vi.fn().mockResolvedValue(undefined) }));

import { createBatchTrackerStore } from '$lib/stores/batch-tracker';
import { errorMessage } from '$lib/server/error-message';
import { resliceSkippedNotice } from '$lib/server/batch-service';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

function state(notices: string[] | undefined, revision: number): BatchTranslationState {
	return {
		active: true,
		status: 'running',
		bookId: 'b1',
		bookTitle: 'Book',
		queue: [{ id: 11, seq: 0, title: 'Chapter 1', pageCount: 3, status: 'processing', notices }],
		currentIndex: 0,
		force: false,
		startedAt: 1,
		completedAt: null,
		totalPromptTokens: 0,
		totalCompletionTokens: 0,
		revision,
		epoch: 'e1',
	};
}

afterEach(() => {
	h.warning.mockClear();
});

describe('errorMessage', () => {
	it('reads an HttpError body instead of its JSON string', () => {
		let thrown: unknown;
		try {
			error(413, 'This chapter has 450 pages, over the reslice limit of 400.');
		} catch (e) {
			thrown = e;
		}
		expect(errorMessage(thrown)).toBe('This chapter has 450 pages, over the reslice limit of 400.');
		expect(errorMessage(new Error('plain'))).toBe('plain');
		expect(errorMessage('text')).toBe('text');
	});
});

describe('resliceSkippedNotice', () => {
	it('names the limit and says the original pages are translated', () => {
		let thrown: unknown;
		try {
			error(413, 'This chapter has 450 pages, over the reslice limit of 400. Split it into smaller chapters first.');
		} catch (e) {
			thrown = e;
		}
		const notice = resliceSkippedNotice(thrown);
		expect(notice).toBe(
			'Reslice skipped: This chapter has 450 pages, over the reslice limit of 400. Split it into smaller chapters first. Translating the original pages.',
		);
		expect(notice).not.toContain('{"message"');
	});
});

describe('batch tracker notices', () => {
	it('toasts each new chapter notice once, even when the state is re-sent', () => {
		const t = createBatchTrackerStore({ autoStart: false });
		t.set(state(undefined, 1));
		expect(h.warning).not.toHaveBeenCalled();

		t.set(state(['Reslice skipped: too big. Translating the original pages.'], 2));
		t.set(state(['Reslice skipped: too big. Translating the original pages.'], 3));
		expect(h.warning).toHaveBeenCalledTimes(1);
		expect(h.warning.mock.calls[0][0]).toBe('Chapter 1: Reslice skipped: too big. Translating the original pages.');

		t.set(
			state(
				[
					'Reslice skipped: too big. Translating the original pages.',
					'No installed font covers Arabic, so pages will show boxes.',
				],
				4,
			),
		);
		expect(h.warning).toHaveBeenCalledTimes(2);
		expect(h.warning.mock.calls[1][0]).toContain('No installed font covers Arabic');
		t.destroy();
	});
});
