// TRANSLATION-SERVICE + CACHE TESTS — JOB LIFECYCLE (BUFFERED EVENTS, REPLAY, SUPERSEDE, ABORT),
// AND THE CACHE-KEY FINGERPRINTING (CONTENT/GLOSSARY/MODEL/PROMPT CHANGES INVALIDATE).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LangPair, TermDraft } from '$lib/types';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';
import { glossaryFingerprint, getCachedPageTranslation, pageCacheKey, savePageTranslation } from '$lib/server/cache';
import { startChapterJob } from '$lib/server/translation-service';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

const PAIR: LangPair = { sourceLang: 'zh-Hans', targetLang: 'en' };

const term = (t: Partial<TermDraft> & { source: string; target: string }): TermDraft => ({
	gender: 'neuter',
	status: 'user',
	aliases: [],
	pinned: false,
	...t,
});

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
});

// -- CACHE -- //

describe('glossaryFingerprint', () => {
	it('is order-independent', () => {
		const a = glossaryFingerprint([
			term({ source: '系统', target: 'System', pinned: true }),
			term({ source: '主角', target: 'MC' }),
		]);
		const b = glossaryFingerprint([
			term({ source: '主角', target: 'MC' }),
			term({ source: '系统', target: 'System', pinned: true }),
		]);
		expect(a).toBe(b);
	});

	it('changes when any prompt-relevant field changes', () => {
		const base = glossaryFingerprint([term({ source: '系统', target: 'System' })]);
		expect(glossaryFingerprint([term({ source: '系统', target: 'Sys' })])).not.toBe(base);
		expect(glossaryFingerprint([term({ source: '系统', target: 'System', context: 'note' })])).not.toBe(base);
		expect(glossaryFingerprint([term({ source: '系统', target: 'System', aliases: ['君'] })])).not.toBe(base);
		expect(glossaryFingerprint([term({ source: '系统', target: 'System', pinned: true })])).not.toBe(base);
		expect(glossaryFingerprint([term({ source: '系统', target: 'System', gender: 'feminine' })])).not.toBe(base);
	});

	it('ignores prompt-irrelevant fields (category/status/firstChapter)', () => {
		const base = glossaryFingerprint([term({ source: '系统', target: 'System' })]);
		expect(
			glossaryFingerprint([term({ source: '系统', target: 'System', category: 'character' as const })]),
		).toBe(base);
	});

	it('is stable across the same input', () => {
		const input = [term({ source: '系统', target: 'System' })];
		expect(glossaryFingerprint(input)).toBe(glossaryFingerprint(input));
	});
});

describe('pageCacheKey', () => {
	const regions = [
		{ id: 'r0', text: '你好' },
		{ id: 'r1', text: '轰' },
	];

	it('changes when content, glossary, model or prompt version changes', () => {
		const base = pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR);
		expect(pageCacheKey([{ id: 'r0', text: '你好吗' }, ...regions.slice(1)], [], 'deepseek-v4-flash', PAIR)).not.toBe(base);
		expect(pageCacheKey(regions, [term({ source: '系统', target: 'System' })], 'deepseek-v4-flash', PAIR)).not.toBe(base);
		expect(pageCacheKey(regions, [], 'deepseek-v4-pro', PAIR)).not.toBe(base);
		expect(pageCacheKey(regions, [], 'deepseek-v4-flash', { sourceLang: 'zh-Hant', targetLang: 'en' })).not.toBe(base);
	});

	it('changes with the provider salt (mock ↔ real DeepSeek must never share cached text)', () => {
		const mock = pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR, 'http://127.0.0.1:8010');
		const real = pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR, 'https://api.deepseek.com');
		expect(mock).not.toBe(real);
		expect(pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR, '')).toBe(
			pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR, ''),
		);
	});

	it('is stable for identical input', () => {
		expect(pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR)).toBe(
			pageCacheKey(regions, [], 'deepseek-v4-flash', PAIR),
		);
	});
});

describe('translation cache disabled', () => {
	it('getCachedPageTranslation returns null and savePageTranslation is a no-op', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const key = pageCacheKey([{ id: 'r0', text: '你好' }], [], 'deepseek-v4-flash', PAIR);

		expect(getCachedPageTranslation(page.id, key)).toBeNull();

		savePageTranslation(
			page.id,
			key,
			new Map([['r0', 'Hello']]),
			'deepseek-v4-flash',
			{ model: 'deepseek-v4-flash', promptTokens: 10, cachedTokens: 0, completionTokens: 2 },
		);

		expect(getCachedPageTranslation(page.id, key)).toBeNull();
	});
});

// -- JOB SERVICE -- //

describe('startChapterJob', () => {
	function controlledWork() {
		const state = { aborted: false, emitted: 0 };
		const work = async (signal: AbortSignal, emit: (e: never) => void) => {
			await new Promise<void>((resolve) => {
				signal.addEventListener('abort', () => {
					state.aborted = true;
					resolve();
				});
				// COMPLETE IMMEDIATELY WHEN NOT ABORTED — THE TEST DRIVES THE SEQUENCE
				setTimeout(resolve, 5);
			});
			if (!signal.aborted) emit({ type: 'page-done', page: 0, pageCount: 1 } as never);
		};
		return { state, work };
	}

	it('runs the work and delivers events to live and late subscribers', async () => {
		const { work } = controlledWork();
		const live: string[] = [];
		const handle = startChapterJob(1, work);
		handle.subscribe((e) => live.push(e.type));
		await vi.waitFor(() => expect(handle.status).toBe('done'));

		expect(live).toContain('start');
		expect(live).toContain('page-done');
		expect(live).toContain('done');

		// A LATE SUBSCRIBER GETS THE FULL REPLAY (SSE RESUMPTION)
		const replay: string[] = [];
		handle.subscribe((e) => replay.push(e.type));
		expect(replay).toEqual(live);
	});

	it('attach without force reuses a running job', async () => {
		const { work } = controlledWork();
		const h1 = startChapterJob(2, work);
		const h2 = startChapterJob(2, work);
		expect(h1.key).toBe(h2.key);
		await vi.waitFor(() => expect(h1.status).toBe('done'));
	});

	it('force supersedes: the old run is aborted and a fresh one starts', async () => {
		const first = controlledWork();
		const second = controlledWork();
		startChapterJob(3, first.work);
		const h2 = startChapterJob(3, second.work, { force: true });
		await vi.waitFor(() => expect(h2.status).toBe('done'));
		expect(first.state.aborted).toBe(true);
	});

	it('work failures surface as an error event and failed status', async () => {
		const handle = startChapterJob(4, async () => {
			throw new Error('boom');
		});
		const events: string[] = [];
		handle.subscribe((e) => events.push(e.type));
		await vi.waitFor(() => expect(handle.status).toBe('failed'));
		expect(events).toContain('error');
	});

	it('maintains live telemetry snapshot and retains it after job completion (self-healing)', async () => {
		const { getChapterJobSnapshot } = await import('$lib/server/translation-service');

		const handle = startChapterJob(5, async (_signal, emit) => {
			emit({
				type: 'start',
				chapterId: 5,
				totalPages: 2,
				pages: [
					{ id: 101, seq: 0, status: 'pending' },
					{ id: 102, seq: 1, status: 'pending' },
				],
			});
			emit({
				type: 'page-step-start',
				chapterId: 5,
				page: 0,
				pageId: 101,
				step: 'analyze',
			});
			emit({
				type: 'page-step-end',
				chapterId: 5,
				page: 0,
				pageId: 101,
				step: 'analyze',
				stepStatus: 'completed',
				durationMs: 120,
				stepDetails: { regionsCount: 3 },
			});
			emit({
				type: 'usage',
				usage: { model: 'deepseek-v4-flash', promptTokens: 100, cachedTokens: 0, completionTokens: 20 },
			});
			emit({
				type: 'page-done',
				chapterId: 5,
				page: 0,
				pageId: 101,
				outputPath: 'output/5/0.png',
				durationMs: 450,
			});
		});

		await vi.waitFor(() => expect(handle.status).toBe('done'));

		// RETENTION TEST: EVEN AFTER JOB IS FINISHED AND REMOVED FROM ACTIVE MAP, SNAPSHOT IS RETAINED
		const snapshot = getChapterJobSnapshot(5);
		expect(snapshot).not.toBeNull();
		expect(snapshot?.chapterId).toBe(5);
		expect(snapshot?.status).toBe('done');
		expect(snapshot?.totalPages).toBe(2);
		expect(snapshot?.completedPages).toBe(1);
		expect(snapshot?.totalPromptTokens).toBe(100);
		expect(snapshot?.totalCompletionTokens).toBe(20);
		expect(snapshot?.pages[0].timings.analyze?.durationMs).toBe(120);
		expect(snapshot?.pages[0].outputPath).toBe('output/5/0.png');
	});

	it('buffers addPages calls before setChapterJobAddPage is registered and drains them', async () => {
		const { setChapterJobAddPage } = await import('$lib/server/translation-service');

		const added: number[] = [];
		const handle = startChapterJob(6, async (signal) => {
			await new Promise((r) => setTimeout(r, 50));
			if (signal.aborted) return;
		});

		// Call addPages BEFORE registerAddPage callback is attached
		handle.addPages([201, 202]);

		// Now register callback
		setChapterJobAddPage(6, (pageId) => {
			added.push(pageId);
		});

		expect(added).toEqual([201, 202]);

		// Subsequent calls should route immediately
		handle.addPages([203]);
		expect(added).toEqual([201, 202, 203]);
	});

	it('cancelPage cancels a single page without aborting the entire chapter job', async () => {
		const { isChapterPageCancelled } = await import('$lib/server/translation-service');

		let chapterSignalAborted = false;
		const handle = startChapterJob(7, async (signal) => {
			signal.addEventListener('abort', () => {
				chapterSignalAborted = true;
			});
			await new Promise((r) => setTimeout(r, 50));
		});

		handle.cancelPage(301);

		expect(isChapterPageCancelled(7, 301)).toBe(true);
		expect(isChapterPageCancelled(7, 302)).toBe(false);
		expect(chapterSignalAborted).toBe(false);
		expect(handle.status).toBe('running');
	});

	it('marks job status as failed and emits error when pages fail', async () => {
		const { getChapterJobSnapshot } = await import('$lib/server/translation-service');

		const handle = startChapterJob(8, async (_signal, emit) => {
			emit({
				type: 'start',
				chapterId: 8,
				totalPages: 1,
				pages: [{ id: 401, seq: 0, status: 'pending' }],
			});
			emit({
				type: 'page-step-start',
				chapterId: 8,
				page: 0,
				pageId: 401,
				step: 'translate',
			});
			emit({
				type: 'page-step-end',
				chapterId: 8,
				page: 0,
				pageId: 401,
				step: 'translate',
				stepStatus: 'failed',
				stepDetails: { error: 'LLM Rate limit exceeded' },
			});
			emit({
				type: 'error',
				chapterId: 8,
				page: 0,
				pageId: 401,
				failedStep: 'translate',
				message: 'LLM Rate limit exceeded',
			});
		});

		await vi.waitFor(() => expect(handle.status).toBe('failed'));

		const snapshot = getChapterJobSnapshot(8);
		expect(snapshot).not.toBeNull();
		expect(snapshot?.status).toBe('failed');
		expect(snapshot?.failedPages).toBe(1);
		expect(snapshot?.completedPages).toBe(0);
	});
});

