// A BATCH AUTO-RESLICE REFUSED BY THE LIMITS (413) AND A PIPELINE 'warning' EVENT BOTH LAND ON THE CHAPTER AS A NOTICE,
// INSTEAD OF ONLY A CONSOLE LINE (AUDIT: BROKEN #2, MISSING #16)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';

const h = vi.hoisted(() => ({
	subscriber: null as null | ((e: any) => void),
}));

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('$lib/server/chapters/reslice', () => ({
	resliceChapterPages: vi.fn(async () => {
		error(413, 'This chapter has 450 pages, over the reslice limit of 400. Split it into smaller chapters first.');
	}),
}));
vi.mock('$lib/server/pipeline-client', () => ({ createPipelineClient: vi.fn(() => ({})) }));
vi.mock('$lib/server/chapter-pipeline', () => ({
	chapterWork: vi.fn(() => async () => {}),
	setAllActiveChapterPageConcurrencies: vi.fn(),
}));
vi.mock('$lib/server/translation-service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/translation-service')>();
	return {
		...actual,
		// A JOB THAT NEVER FINISHES ON ITS OWN; THE TEST DRIVES ITS EVENTS
		startChapterJob: vi.fn(() => ({
			status: 'running',
			snapshot: null,
			subscribe(fn: (e: any) => void) {
				h.subscriber = fn;
				return () => {};
			},
		})),
	};
});

import { batchService } from '$lib/server/batch-service';

async function waitFor(check: () => boolean, ms = 2000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > ms) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 10));
	}
}

beforeEach(() => {
	resetDb();
	h.subscriber = null;
	batchService.clearBatch();
});

afterEach(() => {
	batchService.clearBatch();
});

describe('batch chapter notices', () => {
	it('surfaces a skipped auto-reslice and a font warning on the chapter', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book-notice', title: 'Book' });
		const ch = seedChapter(db, { bookId: book.id, seq: 0, title: 'Chapter 1' });
		seedPage(db, { chapterId: ch.id, seq: 0 });

		await batchService.startBatch(book.id, book.title, [ch.id], { resliceBeforeBatch: true });
		await waitFor(() => Boolean(batchService.getState().queue[0]?.notices?.length));

		const notices = batchService.getState().queue[0].notices!;
		expect(notices).toEqual([
			'Reslice skipped: This chapter has 450 pages, over the reslice limit of 400. Split it into smaller chapters first. Translating the original pages.',
		]);
		expect(notices[0]).not.toContain('{"message"');

		// THE TRANSLATION STILL STARTS, AND ITS NON-FATAL WARNING IS ADDED ONCE
		await waitFor(() => h.subscriber !== null);
		const warning = 'No installed font covers Arabic, so pages will show boxes. Open Settings, Typesetting & Lettering, Fonts.';
		h.subscriber!({ type: 'warning', chapterId: ch.id, message: warning });
		h.subscriber!({ type: 'warning', chapterId: ch.id, message: warning });
		expect(batchService.getState().queue[0].notices).toEqual([notices[0], warning]);
	});
});
