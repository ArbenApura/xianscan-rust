// CHAPTER TRANSLATE STREAM LIFECYCLE: A READER IS CLOSED ON EVERY WAY A JOB STOPS TALKING TO IT (PAUSE, CLEAR,
// SUPERSEDE), AND A START AFTER A CLEARED (E.G. PAUSED) RUN WAITS FOR THAT RUN TO SETTLE BEFORE ITS WORK BEGINS.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { getTestDb, resetDb, seedBook, seedChapter } from '../helpers/db';
import {
	clearChapterJob,
	getChapterJobSnapshot,
	pauseChapterJob,
	startChapterJob,
	type ChapterJobWork,
} from '$lib/server/translation-service';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- HELPERS -- //

/** WORK THAT IGNORES ABORT UNTIL release() (A PIPELINE STILL FLUSHING ITS LAST PAGE WRITES). */
function stubbornWork() {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const work: ChapterJobWork = async (_signal, emit) => {
		emit({ type: 'start', pages: [{ id: 1, seq: 0, status: 'pending' }] });
		await gate;
	};
	return { work, release: () => release() };
}

async function readAll(res: Response): Promise<string> {
	return await res.text();
}

let chapterId: number;

beforeEach(() => {
	const db = getTestDb();
	resetDb();
	seedBook(db, { id: 'b1' });
	chapterId = seedChapter(db, { bookId: 'b1', seq: 0 }).id;
});

// -- TESTS -- //

describe('translation-service subscriber ending', () => {
	it('clearChapterJob ends subscribers (no terminal event is emitted)', () => {
		const old = stubbornWork();
		const handle = startChapterJob(chapterId, old.work);
		const onEnd = vi.fn();
		handle.subscribe(() => {}, onEnd);
		clearChapterJob(chapterId);
		expect(onEnd).toHaveBeenCalledTimes(1);
		old.release();
	});

	it('a forced supersede ends the old run subscribers at once', () => {
		const old = stubbornWork();
		const h1 = startChapterJob(chapterId, old.work);
		const onEnd = vi.fn();
		h1.subscribe(() => {}, onEnd);
		startChapterJob(chapterId, async () => {}, { force: true });
		expect(onEnd).toHaveBeenCalledTimes(1);
		old.release();
	});

	it('subscribing to an ended job replays and ends immediately', () => {
		const old = stubbornWork();
		const h1 = startChapterJob(chapterId, old.work);
		clearChapterJob(chapterId);
		const seen: string[] = [];
		const onEnd = vi.fn();
		h1.subscribe((e) => seen.push(e.type), onEnd);
		expect(seen).toContain('start');
		expect(onEnd).toHaveBeenCalledTimes(1);
		old.release();
	});

	it('a cleared run does not put its stale snapshot back when it settles', async () => {
		const old = stubbornWork();
		startChapterJob(chapterId, old.work);
		clearChapterJob(chapterId);
		old.release();
		await new Promise((r) => setTimeout(r, 10));
		expect(getChapterJobSnapshot(chapterId)).toBeNull();
	});
});

describe('resume after pause waits for the paused run (bug 7)', () => {
	it('a start after pause + clear only runs once the paused run has settled', async () => {
		const paused = stubbornWork();
		startChapterJob(chapterId, paused.work);
		pauseChapterJob(chapterId);
		clearChapterJob(chapterId);

		const next = vi.fn(async () => {});
		const events: string[] = [];
		const h2 = startChapterJob(chapterId, next, { force: true });
		h2.subscribe((e) => events.push(`${e.type}:${e.message ?? ''}`));

		await new Promise((r) => setTimeout(r, 30));
		expect(next).not.toHaveBeenCalled();
		expect(events.some((e) => e.includes('Stopping previous run'))).toBe(true);

		paused.release();
		await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
	});

	it('a start after a run that already settled does not wait', async () => {
		const done = vi.fn(async () => {});
		startChapterJob(chapterId, done);
		await vi.waitFor(() => expect(done).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 10));
		clearChapterJob(chapterId);
		const next = vi.fn(async () => {});
		startChapterJob(chapterId, next);
		await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
	});
});

describe('GET /api/chapters/[id]/translate stream', () => {
	async function openStream(): Promise<Response> {
		const { GET } = await import('../../src/routes/api/chapters/[id]/translate/+server');
		return (await GET({ params: { id: String(chapterId) } } as unknown as RequestEvent)) as Response;
	}

	it('closes on paused (bug 1)', async () => {
		const run = stubbornWork();
		startChapterJob(chapterId, run.work);
		const res = await openStream();
		const body = readAll(res);
		pauseChapterJob(chapterId);
		const text = await body;
		expect(text).toContain('"type":"paused"');
		run.release();
	});

	it('closes when the job is cleared without a terminal event (bug 1)', async () => {
		const run = stubbornWork();
		startChapterJob(chapterId, run.work);
		const res = await openStream();
		const body = readAll(res);
		clearChapterJob(chapterId);
		const text = await body;
		expect(text).toContain('"type":"start"');
		run.release();
	});

	it('closes when a forced re-run supersedes the job (bug 1)', async () => {
		const run = stubbornWork();
		startChapterJob(chapterId, run.work);
		const res = await openStream();
		const body = readAll(res);
		startChapterJob(chapterId, async () => {}, { force: true });
		await expect(body).resolves.toContain('"type":"start"');
		run.release();
	});
});
