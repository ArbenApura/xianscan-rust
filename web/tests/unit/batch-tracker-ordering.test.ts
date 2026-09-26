// BATCH STATE ORDERING (FEAT-009 PHASE 3): A STALE POLL OR ACTION RESPONSE NEVER OVERWRITES A NEWER STREAM STATE, AND
// AN OLD STREAM'S finally NEVER CLEARS THE NEW STREAM'S SLOT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { BatchTranslationState } from '$lib/types';
import { createFakeFetch, createFakeSse, deferred, json } from '../helpers/fake-sse';

const h = vi.hoisted(() => ({ sse: null as null | { streamSse: (...args: any[]) => Promise<void> } }));
vi.mock('$lib/sse', () => ({ streamSse: (...args: any[]) => h.sse!.streamSse(...args) }));

import { isNewerBatchState } from '$lib/stores/batch-order';
import { createBatchTrackerStore } from '$lib/stores/batch-tracker';
import { jobTracker } from '$lib/stores/job-tracker';

function state(over: Partial<BatchTranslationState>): BatchTranslationState {
	return {
		active: true,
		status: 'running',
		bookId: 'b1',
		bookTitle: 'Book',
		queue: [{ id: 11, seq: 0, title: 'C1', pageCount: 3, status: 'processing', translatedPages: 0 } as any],
		currentIndex: 0,
		force: false,
		startedAt: 1,
		completedAt: null,
		totalPromptTokens: 0,
		totalCompletionTokens: 0,
		...over,
	};
}

let sse: ReturnType<typeof createFakeSse>;

beforeEach(() => {
	sse = createFakeSse();
	h.sse = sse;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('isNewerBatchState', () => {
	const cur = state({ revision: 5, epoch: 'e1' });
	it.each([
		['an older revision is rejected', state({ revision: 4, epoch: 'e1' }), false],
		['an equal revision is accepted', state({ revision: 5, epoch: 'e1' }), true],
		['a newer revision is accepted', state({ revision: 6, epoch: 'e1' }), true],
		['missing fields (old server or local write) are accepted', state({}), true],
		['a different epoch (server restart) is accepted', state({ revision: 1, epoch: 'e2' }), true],
	])('%s', (_name, next, expected) => {
		expect(isNewerBatchState(cur, next)).toBe(expected);
	});
});

describe('batch tracker ordering', () => {
	it('a late poll response does not overwrite a newer stream state', async () => {
		const held = deferred<Response>();
		vi.stubGlobal('fetch', createFakeFetch({ 'GET /api/batch': () => held.promise }).fetch);
		const t = createBatchTrackerStore({ autoStart: false });
		const polling = t.sync();
		t.connectSse();
		sse.lastStream()!.emit({ type: 'batch-state', state: state({ revision: 7, epoch: 'e1', currentIndex: 1 }) });
		held.resolve(json(state({ revision: 6, epoch: 'e1', currentIndex: 0 })));
		await polling;
		expect(get(t).revision).toBe(7);
		expect(get(t).currentIndex).toBe(1);
		t.destroy();
	});

	it('a stale cancelled state does not clear live chapter jobs', async () => {
		const clear = vi.spyOn(jobTracker, 'clearJob');
		const t = createBatchTrackerStore({ autoStart: false });
		t.set(state({ revision: 9, epoch: 'e1' }));
		t.set(state({ revision: 8, epoch: 'e1', status: 'cancelled', active: false }));
		expect(clear).not.toHaveBeenCalled();
		expect(get(t).status).toBe('running');
		t.destroy();
	});

	it('a local clear keeps the ordering, so a stale poll does not bring the batch back (bug 6)', async () => {
		const t = createBatchTrackerStore({ autoStart: false });
		t.set(state({ revision: 9, epoch: 'e1' }));
		t.clearChapter(11);
		expect(get(t).active).toBe(false);
		expect(get(t).epoch).toBe('e1');
		// A POLL THAT LEFT BEFORE THE CLEAR (SAME REVISION) AND AN OLDER ONE ARE BOTH DROPPED
		t.set(state({ revision: 9, epoch: 'e1' }));
		t.set(state({ revision: 8, epoch: 'e1' }));
		expect(get(t).active).toBe(false);
		// THE SERVER'S NEXT REAL STATE STILL WINS
		t.set(state({ revision: 10, epoch: 'e1' }));
		expect(get(t).active).toBe(true);
		t.destroy();
	});

	it('clearBook and a failed clearBatch keep the ordering too (bug 6)', async () => {
		vi.stubGlobal('fetch', createFakeFetch({ 'POST /api/batch/clear': () => json({ message: 'nope' }, 500) }).fetch);
		const t = createBatchTrackerStore({ autoStart: false });
		t.set(state({ revision: 3, epoch: 'e1' }));
		t.clearBook('b1');
		t.set(state({ revision: 3, epoch: 'e1' }));
		expect(get(t).active).toBe(false);

		t.set(state({ revision: 20, epoch: 'e1' }));
		await t.clearBatch();
		expect(get(t).active).toBe(false);
		t.set(state({ revision: 20, epoch: 'e1' }));
		expect(get(t).active).toBe(false);
		t.destroy();
	});

	it("an old stream's finally does not clear the new controller", async () => {
		const t = createBatchTrackerStore({ autoStart: false });
		t.connectSse();
		const first = sse.lastStream()!;
		t.disconnectSse();
		t.connectSse();
		expect(sse.streams).toHaveLength(2);
		// THE FIRST STREAM'S PROMISE SETTLES (ABORTED) AFTER THE SECOND ONE OPENED
		first.end();
		await first.done;
		await Promise.resolve();
		t.connectSse();
		expect(sse.streams).toHaveLength(2);
		t.destroy();
	});
});
