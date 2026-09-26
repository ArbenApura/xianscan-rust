// JOB TRACKER STREAM OWNERSHIP (FEAT-009 PHASES 1 AND 2). EACH TEST GETS A FRESH STORE, A FAKE SSE TRANSPORT AND A
// FAKE fetch, AND DRIVES THE STREAMS BY HAND TO REPRODUCE THE RACES P1 TO P5.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createFakeFetch, createFakeSse, deferred, json, type FakeRequest } from '../helpers/fake-sse';

const h = vi.hoisted(() => ({ sse: null as null | { streamSse: (...args: any[]) => Promise<void> } }));
vi.mock('$lib/sse', () => ({ streamSse: (...args: any[]) => h.sse!.streamSse(...args) }));

import { createJobTrackerStore } from '$lib/stores/job-tracker';

const running = (chapterId: number) =>
	json({ running: true, snapshot: { chapterId, status: 'running', pages: [], totalPages: 0, completedPages: 0, failedPages: 0 } });
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

describe('job tracker stream ownership', () => {
	it('removes the controller when a stream ends normally, so a later start opens a new stream (P1)', async () => {
		const f = withFetch({});
		const t = createJobTrackerStore();
		void t.startTranslation(1, { force: true });
		await flush();
		const first = sse.lastStream()!;
		first.emit({ type: 'start', totalPages: 1 });
		first.emit({ type: 'done' });
		first.end();
		await flush();
		// A NON-FORCED START AFTER THE RUN FINISHED MUST OPEN A NEW STREAM, NOT A FIRE-AND-FORGET POST
		void t.startTranslation(1);
		await flush();
		expect(sse.streams).toHaveLength(2);
		expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
		expect(get(t).jobs[1].connectionState).toBe('connecting');
	});

	it('a stale failure path does not reconnect after a newer connectStream (P2)', async () => {
		const held = deferred<Response>();
		withFetch({ 'GET /api/chapters/2/job': () => held.promise });
		const t = createJobTrackerStore();
		void t.startTranslation(2, { force: true });
		await flush();
		sse.lastStream()!.fail();
		await flush();
		// THE USER STARTS AGAIN WHILE THE STATUS CHECK OF THE DROPPED STREAM IS STILL IN FLIGHT
		void t.startTranslation(2, { force: true });
		await flush();
		held.resolve(running(2));
		await flush();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(sse.streams).toHaveLength(2);
	});

	it('a stale failure path does not resurrect a cleared job (P2)', async () => {
		const held = deferred<Response>();
		withFetch({ 'GET /api/chapters/3/job': () => held.promise });
		const t = createJobTrackerStore();
		void t.startTranslation(3, { force: true });
		await flush();
		sse.lastStream()!.fail();
		await flush();
		t.clearJob(3);
		held.resolve(running(3));
		await flush();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(get(t).jobs[3]).toBeUndefined();
		expect(sse.streams).toHaveLength(1);
	});

	it('a stream that ends without a terminal event re-checks the server (P3)', async () => {
		const f = withFetch({ 'GET /api/chapters/4/job': () => finished(4) });
		const t = createJobTrackerStore();
		void t.startTranslation(4, { force: true });
		await flush();
		const s = sse.lastStream()!;
		s.emit({ type: 'start', totalPages: 2 });
		s.end();
		await flush();
		expect(f.calls.some((c) => c.method === 'GET' && c.url === '/api/chapters/4/job')).toBe(true);
		const job = get(t).jobs[4];
		expect(job.running).toBe(false);
		expect(job.connectionState).toBe('idle');
		expect(job.snapshot?.status).toBe('done');
	});

	it('a stream that ends without a terminal event reconnects while the job still runs (P3)', async () => {
		withFetch({ 'GET /api/chapters/5/job': () => running(5) });
		const t = createJobTrackerStore();
		void t.startTranslation(5, { force: true });
		await flush();
		sse.lastStream()!.end();
		await flush();
		expect(get(t).jobs[5].connectionState).toBe('reconnecting');
		await vi.advanceTimersByTimeAsync(10_000);
		expect(sse.streams).toHaveLength(2);
		expect(sse.lastStream()!.method).toBe('GET');
	});

	it('concurrent syncChapter calls issue one status request (P4)', async () => {
		const held = deferred<Response>();
		const f = withFetch({ 'GET /api/chapters/6/job': () => held.promise });
		const t = createJobTrackerStore();
		const a = t.syncChapter(6);
		const b = t.syncChapter(6);
		held.resolve(finished(6));
		await Promise.all([a, b]);
		expect(f.calls.filter((c) => c.url === '/api/chapters/6/job')).toHaveLength(1);
	});

	it('queue-a-page POST cancels its response body (P5)', async () => {
		const f = withFetch({ 'POST /api/chapters/7/translate': () => new Response('data: {"type":"start"}\n\n', { status: 200 }) });
		const t = createJobTrackerStore();
		void t.startTranslation(7, { force: true });
		await flush();
		sse.lastStream()!.emit({ type: 'start', totalPages: 1 });
		await t.startTranslation(7, { pageIds: [42] });
		expect(f.bodyCancelled).toContain('POST /api/chapters/7/translate');
		expect(sse.streams).toHaveLength(1);
	});

	it('superseded stream events are ignored', async () => {
		withFetch({});
		const t = createJobTrackerStore();
		void t.startTranslation(8, { force: true });
		await flush();
		const old = sse.lastStream()!;
		void t.startTranslation(8, { force: true });
		await flush();
		old.emit({ type: 'start', totalPages: 9 });
		expect(old.closed).toBe(true);
		expect(get(t).jobs[8].snapshot).toBeNull();
	});

	it('cancelTranslation clears the controller and the reconnect timer', async () => {
		withFetch({ 'GET /api/chapters/9/job': () => running(9), 'DELETE /api/chapters/9/job': () => json({ ok: true }) });
		const t = createJobTrackerStore();
		void t.startTranslation(9, { force: true });
		await flush();
		sse.lastStream()!.fail();
		await flush();
		expect(get(t).jobs[9].connectionState).toBe('reconnecting');
		await t.cancelTranslation(9);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(sse.streams).toHaveLength(1);
		expect(get(t).jobs[9].running).toBe(false);
	});

	it('disconnect then startTranslation opens a POST stream', async () => {
		withFetch({});
		const t = createJobTrackerStore();
		void t.startTranslation(10, { force: true });
		await flush();
		t.disconnect(10);
		await flush();
		void t.startTranslation(10);
		await flush();
		expect(sse.streams).toHaveLength(2);
		expect(sse.lastStream()!.method).toBe('POST');
	});
});
