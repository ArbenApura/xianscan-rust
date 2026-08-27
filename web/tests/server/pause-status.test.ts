// PROBE: does pausing mark the in-flight page's step as FAILED (rather than leaving it resumable)?
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('$lib/server/pipeline-client', async () => {
	const actual = await vi.importActual<any>('$lib/server/pipeline-client');
	return {
		...actual,
		createPipelineClient: () => ({ analyze: async () => ({ regions: [], width: 1, height: 1, backend: 'mock' }), clean: async () => Buffer.from('') }),
	};
});
vi.mock('$lib/server/providers', async () => ({ getActiveProvider: () => ({ baseUrl: 'http://mock' }) }));
vi.mock('$lib/server/chapter-pipeline', async () => {
	const actual = await vi.importActual<any>('$lib/server/chapter-pipeline');
	return {
		...actual,
		setAllActiveChapterPageConcurrencies: () => {},
		chapterWork: () => (signal: AbortSignal, emit: (e: any) => void) =>
			new Promise<void>((resolve) => {
				const t = setInterval(() => {
					if (signal.aborted) {
						clearInterval(t);
						resolve();
					}
				}, 5);
			}),
	};
});

describe('pause does not mark in-flight page as failed', () => {
	let db: TestDb;
	let chapterId: number;
	let p1: { id: number };

	beforeEach(async () => {
		db = getTestDb();
		resetDb();
		const book = seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		chapterId = chapter.id;
		p1 = seedPage(db, { chapterId, seq: 0 });
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();
	});

	it('abortChapterJob marks the running page timings as failed (the OLD behavior we must avoid on pause)', async () => {
		const { startChapterJob, getChapterJob, abortChapterJob } = await import('$lib/server/translation-service');

		startChapterJob(chapterId, makeRunningWork(), { force: true });
		await new Promise((r) => setTimeout(r, 30));
		expect(getChapterJob(chapterId)?.snapshot.pages[0]?.timings.analyze?.status).toBe('running');

		abortChapterJob(chapterId);
		expect(getChapterJob(chapterId)?.snapshot.pages[0]?.timings.analyze?.status).toBe('failed');
	});

	it('pauseChapterJob does NOT mark the running page timings as failed (resumable)', async () => {
		const { startChapterJob, getChapterJob, pauseChapterJob } = await import('$lib/server/translation-service');

		startChapterJob(chapterId, makeRunningWork(), { force: true });
		await new Promise((r) => setTimeout(r, 30));
		const running = getChapterJob(chapterId);
		expect(running?.snapshot.pages[0]?.timings.analyze?.status).toBe('running');
		expect(running?.snapshot.pages[0]?.status).toBe('processing');

		pauseChapterJob(chapterId);

		const paused = getChapterJob(chapterId);
		expect(paused?.snapshot.pages[0]?.timings.analyze).toBeUndefined();
		expect(paused?.snapshot.pages[0]?.status).toBe('pending');
		expect(paused?.snapshot.status).toBe('superseded');
	});

	it('pauseBatch resets the in-flight page to pending (not error/failed)', async () => {
		const { batchService } = await import('$lib/server/batch-service');
		const { getChapterJob } = await import('$lib/server/translation-service');

		await batchService.startBatch('b1', 'Book', [chapterId], { force: true, pageIds: [p1.id] });
		await new Promise((r) => setTimeout(r, 30));
		expect(getChapterJob(chapterId)).not.toBeNull();

		batchService.pauseBatch();
		const item = batchService.getState().queue.find((q) => q.id === chapterId);
		expect(item?.status).toBe('queued');
		expect(getChapterJob(chapterId)).toBeNull();
	});
});

function makeRunningWork() {
	return (signal: AbortSignal, emit: (e: any) => void) => {
		emit({
			type: 'start',
			chapterId: 0,
			totalPages: 1,
			targetPageIds: [1],
			pages: [{ id: 1, seq: 0, status: 'pending', cleanedRev: 0, outputRev: 0 }],
		});
		emit({ type: 'page-step-start', chapterId: 0, page: 0, pageId: 1, step: 'analyze' });
		return new Promise<void>((resolve) => {
			const t = setInterval(() => {
				if (signal.aborted) {
					clearInterval(t);
					resolve();
				}
			}, 5);
		});
	};
}
