// JOB TRACKER LIVE-PROGRESS REGRESSIONS: RE-ATTACH AFTER PAUSE / RESUME, START DURING A RECONNECT WAIT, WARNING
// DEDUPE ACROSS REPLAYS, STALE /job ANSWERS, THE BARE start OF A FORCED RE-RUN AND THE OPT-IN SYNC COOLDOWN.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createFakeFetch, createFakeSse, deferred, json, type FakeRequest } from '../helpers/fake-sse';

const h = vi.hoisted(() => ({
	sse: null as null | { streamSse: (...args: any[]) => Promise<void> },
	warnings: [] as string[],
}));
vi.mock('$lib/sse', () => ({ streamSse: (...args: any[]) => h.sse!.streamSse(...args) }));
vi.mock('svelte-sonner', () => ({
	toast: Object.assign(() => {}, {
		warning: (msg: string) => h.warnings.push(msg),
		info: () => {},
		error: () => {},
		success: () => {},
	}),
}));

import { createJobTrackerStore } from '$lib/stores/job-tracker';

const running = (chapterId: number, pages: unknown[] = []) =>
	json({ running: true, snapshot: { chapterId, status: 'running', pages, totalPages: pages.length, completedPages: 0, failedPages: 0 } });
const finished = (chapterId: number) =>
	json({ running: false, snapshot: { chapterId, status: 'done', pages: [], totalPages: 0, completedPages: 0, failedPages: 0 } });

let sse: ReturnType<typeof createFakeSse>;

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
	vi.useFakeTimers();
	sse = createFakeSse();
	h.sse = sse;
	h.warnings.length = 0;
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function withFetch(routes: Record<string, (req: FakeRequest) => Response | Promise<Response>>) {
	const f = createFakeFetch(routes);
	vi.stubGlobal('fetch', f.fetch);
	return f;
}

describe('job tracker live progress', () => {
	it('stops reading on paused and re-attaches after resume even if the server left the stream open (bug 1)', async () => {
		withFetch({ 'GET /api/chapters/1/job': () => running(1) });
		const t = createJobTrackerStore();
		await t.syncChapter(1);
		await flush();
		const s1 = sse.lastStream()!;
		s1.emit({ type: 'start', pages: [{ id: 10, seq: 0 }] });
		s1.emit({ type: 'paused' });
		await flush();
		expect(s1.closed).toBe(true);
		expect(get(t).jobs[1].running).toBe(false);
		// THE BATCH RESUMES: A NEW JOB RUNS ON THE SERVER AND THE UI RE-SYNCS
		await t.syncChapter(1);
		await flush();
		expect(sse.streams).toHaveLength(2);
		expect(sse.lastStream()!.method).toBe('GET');
	});

	it('a terminated controller does not block syncChapter before its finally ran (bug 1)', async () => {
		withFetch({ 'GET /api/chapters/11/job': () => running(11) });
		const t = createJobTrackerStore();
		await t.syncChapter(11);
		await flush();
		sse.lastStream()!.emit({ type: 'done' });
		// NO FLUSH: THE STREAM'S finally HAS NOT RELEASED THE CONTROLLER YET
		await t.syncChapter(11);
		await flush();
		expect(sse.streams).toHaveLength(2);
	});

	it('a non-forced start during a reconnect wait opens a fresh stream (bug 2)', async () => {
		const f = withFetch({ 'GET /api/chapters/2/job': () => running(2) });
		const t = createJobTrackerStore();
		void t.startTranslation(2, { force: true });
		await flush();
		sse.lastStream()!.emit({ type: 'start', totalPages: 1 });
		sse.lastStream()!.fail();
		await flush();
		expect(get(t).jobs[2].connectionState).toBe('reconnecting');
		void t.startTranslation(2, { pageIds: [5] });
		await flush();
		expect(sse.streams).toHaveLength(2);
		const fresh = sse.lastStream()!;
		expect(fresh.method).toBe('POST');
		expect((fresh.body as { pageIds?: number[] }).pageIds).toEqual([5]);
		// NOT A FIRE-AND-FORGET QUEUE POST
		expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
		fresh.emit({ type: 'start', totalPages: 1 });
		expect(get(t).jobs[2].connectionState).toBe('connected');
		// THE OLD RECONNECT TIMER NEVER FIRES A THIRD STREAM
		await vi.advanceTimersByTimeAsync(20_000);
		expect(sse.streams).toHaveLength(2);
	});

	it('a replayed warning is toasted once (bug 3)', async () => {
		withFetch({ 'GET /api/chapters/3/job': () => running(3) });
		const t = createJobTrackerStore();
		await t.syncChapter(3);
		await flush();
		const s1 = sse.lastStream()!;
		s1.emit({ type: 'start', totalPages: 1, timestamp: 100 });
		s1.emit({ type: 'warning', message: 'No font', timestamp: 101 });
		s1.fail();
		await vi.advanceTimersByTimeAsync(10_000);
		const s2 = sse.lastStream()!;
		expect(s2).not.toBe(s1);
		// THE SERVER REPLAYS ITS BUFFER ON RECONNECT
		s2.emit({ type: 'start', totalPages: 1, timestamp: 100 });
		s2.emit({ type: 'warning', message: 'No font', timestamp: 101 });
		expect(h.warnings).toEqual(['No font']);
		// A NEW WARNING (A LATER RUN) STILL SHOWS
		s2.emit({ type: 'warning', message: 'No font', timestamp: 500 });
		expect(h.warnings).toHaveLength(2);
	});

	it('an in-flight syncChapter does not resurrect a cleared job (bug 4)', async () => {
		const held = deferred<Response>();
		withFetch({ 'GET /api/chapters/4/job': () => held.promise });
		const t = createJobTrackerStore();
		const p = t.syncChapter(4);
		await flush();
		t.clearJob(4);
		held.resolve(running(4, [{ pageId: 1, pageIndex: 0, seq: 0, status: 'done', timings: {} }]));
		await p;
		await flush();
		expect(get(t).jobs[4]).toBeUndefined();
		expect(sse.streams).toHaveLength(0);
	});

	it('an in-flight syncChapter does not clobber a newer stream (bug 4)', async () => {
		const held = deferred<Response>();
		withFetch({ 'GET /api/chapters/5/job': () => held.promise });
		const t = createJobTrackerStore();
		const p = t.syncChapter(5);
		await flush();
		void t.startTranslation(5, { force: true });
		await flush();
		const post = sse.lastStream()!;
		post.emit({ type: 'start', pages: [{ id: 1, seq: 0 }] });
		held.resolve(finished(5));
		await p;
		await flush();
		const job = get(t).jobs[5];
		expect(job.running).toBe(true);
		expect(job.snapshot?.status).toBe('running');
		expect(job.snapshot?.pages).toHaveLength(1);
		expect(post.signal?.aborted).toBe(false);
	});

	it('a bare start resets old page states and surfaces the waiting notice (bug 5)', async () => {
		withFetch({ 'GET /api/chapters/6/job': () => running(6) });
		const t = createJobTrackerStore();
		await t.syncChapter(6);
		await flush();
		const s = sse.lastStream()!;
		s.emit({ type: 'start', pages: [{ id: 1, seq: 0 }, { id: 2, seq: 1 }] });
		s.emit({ type: 'page-step-start', page: 0, pageId: 1, step: 'analyze' });
		s.emit({ type: 'page-done', page: 1, pageId: 2 });
		// A FORCED RE-RUN: BARE start, THEN A PHASE-LESS NOTICE WHILE THE OLD RUN STOPS
		s.emit({ type: 'start', chapterId: 6 });
		s.emit({ type: 'phase-change', chapterId: 6, message: 'Stopping previous run...' });
		let job = get(t).jobs[6];
		expect(job.snapshot?.pages.map((p) => p.status)).toEqual(['pending', 'pending']);
		expect(job.snapshot?.pages[0].timings).toEqual({});
		expect(job.snapshot?.completedPages).toBe(0);
		expect(job.statusMessage).toBe('Stopping previous run...');
		// THE NEW RUN REPORTS ITS PAGES: THE NOTICE GOES AWAY
		s.emit({ type: 'start', pages: [{ id: 1, seq: 0 }, { id: 2, seq: 1 }] });
		job = get(t).jobs[6];
		expect(job.statusMessage).toBeNull();
	});

	it('syncChapter with minIntervalMs does not poll back-to-back for a finished chapter (bug 8)', async () => {
		const f = withFetch({ 'GET /api/chapters/7/job': () => finished(7) });
		const t = createJobTrackerStore();
		await t.syncChapter(7, { minIntervalMs: 3000 });
		await t.syncChapter(7, { minIntervalMs: 3000 });
		await t.syncChapter(7, { minIntervalMs: 3000 });
		expect(f.calls.filter((c) => c.url === '/api/chapters/7/job')).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(3000);
		await t.syncChapter(7, { minIntervalMs: 3000 });
		expect(f.calls.filter((c) => c.url === '/api/chapters/7/job')).toHaveLength(2);
		// WITHOUT THE OPTION THE DEFAULT BEHAVIOR (NO COOLDOWN) IS UNCHANGED
		await t.syncChapter(7);
		expect(f.calls.filter((c) => c.url === '/api/chapters/7/job')).toHaveLength(3);
	});
});
