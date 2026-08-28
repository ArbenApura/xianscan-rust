// CANONICAL SERVER-SIDE BATCH COORDINATOR (web/src/lib/server/batch-service.ts)
// Orchestrates multi-chapter concurrent execution with lookahead background smart re-slicing,
// SSE event broadcasting across all connected client devices, and persistent state management.

import { db } from '$lib/server/db';
import { chapters, pages, books } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import {
	startChapterJob,
	abortChapterJob,
	pauseChapterJob,
	clearChapterJob,
	getChapterJobSnapshot,
	getChapterJob,
	setChapterJobAddPage,
	isChapterPageCancelled,
	type JobEvent,
} from '$lib/server/translation-service';
import { chapterWork, setAllActiveChapterPageConcurrencies } from '$lib/server/chapter-pipeline';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { getActiveProvider } from '$lib/server/providers';
import { DATA_ROOT } from '$lib/server/paths';
import { aiUsage } from '$lib/server/db/schema';
import { getCanonicalSettings, onSettingsUpdated } from '$lib/server/settings-service';
import type {
	BatchChapterItem,
	BatchTranslationState,
	ChapterJobSnapshot,
} from '$lib/types';
import type { TypesetOptions } from './typeset';

// -- CONSTANTS -- //

const MAX_PARALLEL_WORKERS_DEFAULT = 1;

// -- TYPES -- //

export type BatchEventCallback = (event: {
	type: 'batch-state' | 'batch-chapter-update' | 'batch-finished';
	state: BatchTranslationState;
}) => void;

export interface StartBatchOptions {
	force?: boolean;
	parallelWorkers?: number;
	pageConcurrency?: number;
	resliceBeforeBatch?: boolean;
	pageIds?: number[];
	inpaintMode?: string;
	inpaintExpansionPct?: number;
	typesetExpansionPct?: number;
	enableWatermarkInpaint?: boolean;
	enableSfx?: boolean;
	sfxMaxAreaPct?: number;
	typesetOptions?: TypesetOptions;
}

// -- INTERNALS -- //

let activeBatchState: BatchTranslationState = {
	active: false,
	status: 'idle',
	bookId: null,
	bookTitle: null,
	queue: [],
	currentIndex: 0,
	currentPhase: undefined,
	force: false,
	startedAt: null,
	completedAt: null,
	totalPromptTokens: 0,
	totalCompletionTokens: 0,
};

const listeners = new Set<BatchEventCallback>();
const activeResliceControllers = new Map<number, AbortController>();
const preReslicedChapterIds = new Set<number>();
const preReslicingChapterIds = new Set<number>();
const completedChapterIds = new Set<number>();
const failedChapterIds = new Set<number>();
const chapterRetryCount = new Map<number, number>();
const chapterRetryTimers = new Map<number, ReturnType<typeof setTimeout>>();
const chapterGenerationMap = new Map<number, number>();

function clearChapterRetryTimer(chapterId: number) {
	const timer = chapterRetryTimers.get(chapterId);
	if (timer) {
		clearTimeout(timer);
		chapterRetryTimers.delete(chapterId);
	}
}

function clearAllChapterRetryTimers() {
	for (const timer of chapterRetryTimers.values()) {
		clearTimeout(timer);
	}
	chapterRetryTimers.clear();
}
let maxParallelWorkers = MAX_PARALLEL_WORKERS_DEFAULT;
let batchPageConcurrency: number | undefined = undefined;
let batchResliceBeforeBatch: boolean = false;
let batchInpaintMode: string = 'patch';
let batchInpaintExpansionPct: number | undefined = undefined;
let batchTypesetExpansionPct: number | undefined = undefined;
let batchEnableWatermarkInpaint: boolean = false;
let batchTypesetOptions: TypesetOptions | undefined = undefined;
let batchWatchdogTimer: ReturnType<typeof setInterval> | null = null;
let settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// SYNC LIVE PREFERENCES IN REAL TIME (SEAMLESS HOT-RESIZING & DEBOUNCED DISPATCH)
onSettingsUpdated(() => {
	if (!activeBatchState.active || activeBatchState.status !== 'running') return;

	const liveSettings = getCanonicalSettings();

	// 1. HOT-RESIZE PAGE CONCURRENCY ACROSS ALL ACTIVE PIPELINES IMMEDIATELY WITHOUT ABORTING JOBS
	if (liveSettings.parallelProcesses) {
		setAllActiveChapterPageConcurrencies(liveSettings.parallelProcesses);
	}

	// 2. HOT-DISPATCH ANY FREED OR NEWLY AVAILABLE WORKER SLOTS
	dispatchNextItems();

	// 3. DEBOUNCE FULL DISPATCH CHECK BY 300MS
	if (settingsDebounceTimer) clearTimeout(settingsDebounceTimer);
	settingsDebounceTimer = setTimeout(() => {
		if (activeBatchState.active && activeBatchState.status === 'running') {
			dispatchNextItems();
		}
	}, 300);
});

// -- BROADCASTING & STATE HELPERS -- //

function emitState() {
	const snapshot = { ...activeBatchState, queue: [...activeBatchState.queue] };
	for (const fn of listeners) {
		try {
			fn({ type: 'batch-state', state: snapshot });
		} catch (err) {
			console.error('FAILED TO EMIT BATCH STATE TO SSE SUBSCRIBER:', err);
		}
	}
}

// -- PIPELINE EXECUTION HELPERS -- //

async function executeChapterJob(chapter: BatchChapterItem, force: boolean) {
	if (!activeBatchState.active || activeBatchState.status !== 'running') return;

	// CHECK IF CHAPTER WAS ALREADY RESLICED (PERSISTED IN DB OR IN CURRENT SESSION)
	const chRow = db
		.select({ resliced: chapters.resliced })
		.from(chapters)
		.where(eq(chapters.id, chapter.id))
		.get();
	const isAlreadyResliced = Boolean(chRow?.resliced) || preReslicedChapterIds.has(chapter.id);

	// STEP 1: AUTO RE-SLICE (IF ENABLED IN PREFERENCES, NOT TRANSLATING SPECIFIC PAGES, AND NOT YET RESLICED)
	if (batchResliceBeforeBatch && (!chapter.pageIds || chapter.pageIds.length === 0) && !isAlreadyResliced) {
		activeBatchState = {
			...activeBatchState,
			currentPhase: 'reslice',
			queue: activeBatchState.queue.map((item) =>
				item.id === chapter.id
					? {
							...item,
							status: 'reslicing' as const,
							resliceMessage: 'Smart re-slicing pages...',
							error: null,
						}
					: item,
			),
		};
		emitState();

		try {
			const { resliceChapterPages } = await import('$lib/server/chapters/reslice');
			const client = createPipelineClient();
			const ctrl = new AbortController();
			activeResliceControllers.set(chapter.id, ctrl);

			await resliceChapterPages(
				chapter.id,
				client,
				(step, message, pct) => {
					if (!activeBatchState.active) return;
					activeBatchState = {
						...activeBatchState,
						queue: activeBatchState.queue.map((item) =>
							item.id === chapter.id
								? {
										...item,
										resliceMessage: `${message} (${Math.round(pct)}%)`,
									}
								: item,
						),
					};
					emitState();
				},
				ctrl.signal,
				DATA_ROOT,
			);
			activeResliceControllers.delete(chapter.id);
			preReslicedChapterIds.add(chapter.id);
		} catch (err: any) {
			activeResliceControllers.delete(chapter.id);
			if (activeBatchState.status === 'cancelled' || activeBatchState.status === 'paused') {
				return;
			}
			console.warn(`[batchService] Auto-reslice failed for chapter ${chapter.id}, proceeding with translation:`, err?.message);
		}
	}

	if (!activeBatchState.active || activeBatchState.status !== 'running') return;

	// STEP 2: PIPELINED TRANSLATION
	activeBatchState = {
		...activeBatchState,
		currentPhase: 'translate',
		queue: activeBatchState.queue.map((item) =>
			item.id === chapter.id
				? {
						...item,
						status: 'processing' as const,
						resliceMessage: null,
						error: null,
					}
				: item,
		),
	};
	emitState();

	try {
		const gen = (chapterGenerationMap.get(chapter.id) || 0) + 1;
		chapterGenerationMap.set(chapter.id, gen);

		const liveSettings = getCanonicalSettings();
		const effectivePageConcurrency = liveSettings.parallelProcesses || batchPageConcurrency;

		const deps = {
			pipeline: createPipelineClient(),
			inpaintMode: (liveSettings.inpaintMode || batchInpaintMode) as any,
			inpaintExpansionPct: liveSettings.inpaintExpansionPct ?? batchInpaintExpansionPct,
			typesetExpansionPct: liveSettings.typesetExpansionPct ?? batchTypesetExpansionPct,
			enableWatermarkInpaint: liveSettings.enableWatermarkInpaint ?? batchEnableWatermarkInpaint,
			typesetOptions: batchTypesetOptions,
			dataRoot: DATA_ROOT,
			cacheSalt: getActiveProvider().baseUrl,
			pageConcurrency: effectivePageConcurrency,
			isPageCancelled: (pageId: number) => isChapterPageCancelled(chapter.id, pageId),
			force: force || activeBatchState.force,
			onUsage: (u: { model: string; promptTokens: number; cachedTokens: number; completionTokens: number }) => {
				try {
					db.insert(aiUsage)
						.values({
							kind: 'translate',
							model: u.model,
							promptTokens: u.promptTokens,
							cachedTokens: u.cachedTokens,
							completionTokens: u.completionTokens,
						})
						.run();
				} catch {
					// LEDGER ERRORS DO NOT FAIL BATCH
				}
			},
		};

		const handle = startChapterJob(
			chapter.id,
			chapterWork(chapter.id, deps, chapter.pageIds, (registerFn) => {
				setChapterJobAddPage(chapter.id, registerFn);
			}),
			{ force: true },
		);

		// ATTACH REAL-TIME LISTENER FOR SNAPSHOT ADVANCEMENT
		const unsub = handle.subscribe((e: JobEvent) => {
			if (chapterGenerationMap.get(chapter.id) !== gen) {
				unsub();
				return;
			}

			if (!activeBatchState.active || activeBatchState.status === 'paused' || activeBatchState.status === 'cancelled') {
				unsub();
				return;
			}

			const snap = handle.snapshot;
			if (snap) {
				activeBatchState = {
					...activeBatchState,
					queue: activeBatchState.queue.map((item) =>
						item.id === chapter.id
							? {
									...item,
									translatedPages: snap.completedPages,
									totalPages: snap.totalPages || snap.pages.length,
								}
							: item,
					),
				};
				emitState();
			}

			const isDone = e.type === 'done' || snap?.status === 'done';

			// ONLY FAIL THE ENTIRE CHAPTER IF IT IS A GENUINE CHAPTER-LEVEL FAILURE (NOT DELIBERATE PAUSE / CANCEL / SUPERSEDE)
			const isCancelledOrSuperseded =
				e.message?.includes('cancelled') ||
				e.message?.includes('superseded') ||
				snap?.status === 'superseded' ||
				handle.status === 'superseded';

			const isFailed =
				!isCancelledOrSuperseded &&
				((e.type === 'error' && e.page === undefined) ||
				(!getChapterJob(chapter.id) && snap?.status !== 'done' && (snap?.completedPages || 0) === 0));

			if (isDone && !completedChapterIds.has(chapter.id)) {
				unsub();
				onChapterCompleted(chapter, snap);
			} else if (isFailed && !failedChapterIds.has(chapter.id)) {
				if (activeBatchState.status === 'paused' || activeBatchState.status === 'cancelled') {
					unsub();
					return;
				}
				unsub();
				onChapterFailed(chapter, e.message || 'Translation failed');
			} else if (isCancelledOrSuperseded) {
				unsub();
			}
		});
	} catch (err: any) {
		onChapterFailed(chapter, err?.message || 'Failed to start translation worker');
	}
}

function onChapterCompleted(chapter: BatchChapterItem, snapshot: ChapterJobSnapshot | null) {
	clearChapterRetryTimer(chapter.id);
	chapterRetryCount.delete(chapter.id);
	completedChapterIds.add(chapter.id);
	failedChapterIds.delete(chapter.id);

	activeBatchState = {
		...activeBatchState,
		queue: activeBatchState.queue.map((item) =>
			item.id === chapter.id
				? {
						...item,
						status: 'done' as const,
						translatedPages: snapshot?.completedPages || item.pageCount,
						totalPages: snapshot?.totalPages || item.pageCount,
						error: null,
					}
				: item,
		),
		totalPromptTokens: activeBatchState.totalPromptTokens + (snapshot?.totalPromptTokens || 0),
		totalCompletionTokens: activeBatchState.totalCompletionTokens + (snapshot?.totalCompletionTokens || 0),
	};

	// ADVANCE CURRENT INDEX POINTER TO FIRST UNFINISHED CHAPTER
	const firstUnfinished = activeBatchState.queue.findIndex(
		(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
	);
	activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

	emitState();
	dispatchNextItems();
}

function onChapterFailed(chapter: BatchChapterItem, errorMsg: string) {
	if (!activeBatchState.active || activeBatchState.status === 'paused' || activeBatchState.status === 'cancelled') {
		return;
	}

	const currentRetries = chapterRetryCount.get(chapter.id) || 0;
	if (currentRetries < 3) {
		const nextRetry = currentRetries + 1;
		chapterRetryCount.set(chapter.id, nextRetry);
		const backoffMs = nextRetry * 1500;
		console.warn(
			`[batchService] Chapter #${chapter.id} encountered error (${errorMsg}). Scheduling auto-retry (${nextRetry}/3) in ${backoffMs}ms...`,
		);

		activeBatchState = {
			...activeBatchState,
			queue: activeBatchState.queue.map((item) =>
				item.id === chapter.id
					? {
							...item,
							status: 'queued' as const,
							resliceMessage: `Retrying (attempt ${nextRetry}/3)...`,
							error: null,
						}
					: item,
			),
		};
		emitState();

		clearChapterRetryTimer(chapter.id);
		const timer = setTimeout(() => {
			chapterRetryTimers.delete(chapter.id);
			if (activeBatchState.active && activeBatchState.status === 'running') {
				dispatchNextItems();
			}
		}, backoffMs);
		chapterRetryTimers.set(chapter.id, timer);
		return;
	}

	// 3 RETRIES EXHAUSTED: MARK AS PERMANENT ERROR FOR THIS BATCH
	clearChapterRetryTimer(chapter.id);
	chapterRetryCount.delete(chapter.id);
	failedChapterIds.add(chapter.id);
	abortChapterJob(chapter.id);

	activeBatchState = {
		...activeBatchState,
		queue: activeBatchState.queue.map((item) =>
			item.id === chapter.id
				? {
						...item,
						status: 'error' as const,
						error: errorMsg,
					}
				: item,
		),
	};

	const firstUnfinished = activeBatchState.queue.findIndex(
		(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
	);
	activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

	emitState();
	dispatchNextItems();
}

function dispatchNextItems() {
	if (!activeBatchState.active || activeBatchState.status !== 'running') return;

	const liveSettings = getCanonicalSettings();
	const effectiveParallelChapters = Math.max(1, liveSettings.parallelChapters || maxParallelWorkers);

	const activeItems = activeBatchState.queue.filter(
		(c) => c.status === 'processing' || c.status === 'reslicing',
	);
	const availableSlots = effectiveParallelChapters - activeItems.length;

	if (availableSlots <= 0) return;

	const queuedItems = activeBatchState.queue
		.filter((c) => c.status === 'queued' && !chapterRetryTimers.has(c.id))
		.slice(0, availableSlots);

	if (queuedItems.length === 0) {
		if (activeItems.length === 0 && chapterRetryTimers.size === 0) {
			finishBatch();
		}
		return;
	}

	for (const item of queuedItems) {
		void executeChapterJob(item, activeBatchState.force);
	}
}

function finishBatch() {
	stopWatchdog();
	clearAllChapterRetryTimers();
	activeBatchState = {
		...activeBatchState,
		status: 'completed',
		currentPhase: undefined,
		completedAt: Date.now(),
	};
	emitState();
}

function startWatchdog() {
	if (batchWatchdogTimer) return;
	batchWatchdogTimer = setInterval(() => {
		if (!activeBatchState.active || activeBatchState.status !== 'running') {
			stopWatchdog();
			return;
		}

		// 1. CHECK ACTIVE CHAPTERS AND VERIFY STREAM HEALTH
		const processing = activeBatchState.queue.filter((c) => c.status === 'processing');
		for (const ch of processing) {
			const job = getChapterJob(ch.id);
			const snap = getChapterJobSnapshot(ch.id);
			if (!job && snap?.status === 'done' && !completedChapterIds.has(ch.id)) {
				completedChapterIds.add(ch.id);
				onChapterCompleted(ch, snap);
			} else if (!job && (!snap || snap.status === 'failed' || snap.status === 'superseded')) {
				// ORPHANED PROCESSING STATE DETECTED
				console.warn(
					`[batchService] Watchdog detected orphaned processing state on chapter #${ch.id}, recovering for retry...`,
				);
				onChapterFailed(ch, 'Job unexpectedly terminated in background');
			}
		}

		// 2. DISPATCH ANY STALLED QUEUED ITEMS IF SLOTS ARE OPEN
		dispatchNextItems();
	}, 3000);
}

function stopWatchdog() {
	if (batchWatchdogTimer) {
		clearInterval(batchWatchdogTimer);
		batchWatchdogTimer = null;
	}
}

// -- PUBLIC SERVICE API -- //

export const batchService = {
	// GET CURRENT CANONICAL STATE
	getState(): BatchTranslationState {
		return { ...activeBatchState, queue: [...activeBatchState.queue] };
	},

	// SUBSCRIBE TO SERVER-SIDE BATCH SSE UPDATES
	subscribe(fn: BatchEventCallback): () => void {
		listeners.add(fn);
		// IMMEDIATELY EMIT CURRENT STATE TO NEW SUBSCRIBER
		fn({ type: 'batch-state', state: this.getState() });
		return () => {
			listeners.delete(fn);
		};
	},

	// START NEW MULTI-CHAPTER BATCH
	async startBatch(
		bookId: string,
		bookTitle: string,
		chapterIds: number[],
		opts: StartBatchOptions = {},
	): Promise<BatchTranslationState> {
		const isCurrentlyActive =
			activeBatchState.active &&
			(activeBatchState.status === 'running' || activeBatchState.status === 'paused');

		maxParallelWorkers = Math.max(1, Math.min(4, opts.parallelWorkers || 1));
		batchPageConcurrency = typeof opts.pageConcurrency === 'number' ? Math.max(1, Math.min(16, opts.pageConcurrency)) : undefined;
		batchResliceBeforeBatch = Boolean(opts.resliceBeforeBatch) && (!opts.pageIds || opts.pageIds.length === 0);
		batchInpaintMode = opts.inpaintMode || 'patch';
		batchInpaintExpansionPct = opts.inpaintExpansionPct;
		batchTypesetExpansionPct = opts.typesetExpansionPct;
		batchEnableWatermarkInpaint = Boolean(opts.enableWatermarkInpaint);
		batchTypesetOptions = opts.typesetOptions;

		// QUERY CHAPTER DETAILS FROM DATABASE
		const dbChapters = await db
			.select()
			.from(chapters)
			.where(inArray(chapters.id, chapterIds));

		const chapterMap = new Map(dbChapters.map((c) => [c.id, c]));
		const pageCounts = await db
			.select({ chapterId: pages.chapterId, count: pages.id })
			.from(pages)
			.where(inArray(pages.chapterId, chapterIds));

		const countsMap = new Map<number, number>();
		for (const p of pageCounts) {
			countsMap.set(p.chapterId, (countsMap.get(p.chapterId) || 0) + 1);
		}

		// ALSO LOOK UP BOOK TITLES FOR EACH CHAPTER
		const bookIdsInChapters = Array.from(new Set(dbChapters.map((c) => c.bookId)));
		const bookRows = await db
			.select({ id: books.id, title: books.title, titleTarget: books.titleTarget })
			.from(books)
			.where(inArray(books.id, bookIdsInChapters));
		const bookMap = new Map(bookRows.map((b) => [b.id, b.titleTarget || b.title]));

		const newItems: BatchChapterItem[] = [];
		const existingMap = new Map(activeBatchState.queue.map((q) => [q.id, q]));

		for (const id of chapterIds) {
			const ch = chapterMap.get(id);
			if (!ch) continue;
			const pCount = countsMap.get(id) || 0;
			const chBookTitle = bookMap.get(ch.bookId) || bookTitle;
			const existingItem = isCurrentlyActive ? existingMap.get(id) : null;
			const targetPageIds = opts.pageIds && opts.pageIds.length > 0 && chapterIds.length === 1 ? opts.pageIds : undefined;
			const targetTotalPages = targetPageIds ? targetPageIds.length : pCount;

			// DUPLICATE QUEUE DETECTION
			if (existingItem) {
				// INDIVIDUAL-PAGE QUEUEING: MERGE THE NEW PAGES INTO THE EXISTING QUEUE ITEM
				// INSTEAD OF REPLACING pageIds — SO PAGES ALREADY QUEUED FOR THIS CHAPTER (EVEN WHILE
				// IT IS 'queued' BEHIND ANOTHER CHAPTER IN A DIFFERENT BOOK) ARE NOT LOST. IF THE
				// CHAPTER JOB IS STILL RUNNING, INJECT THE NEW PAGES INTO THE LIVE PIPELINE.
				if (targetPageIds && targetPageIds.length > 0) {
					const isRunningJob =
						existingItem.status === 'processing' || existingItem.status === 'reslicing';
					const job = getChapterJob(id);
					if (isRunningJob && job?.addPages) {
						job.addPages(targetPageIds);
					}
					const mergedPageIds = Array.from(new Set([...(existingItem.pageIds || []), ...targetPageIds]));
					const finished =
						existingItem.status === 'done' ||
						existingItem.status === 'error' ||
						existingItem.status === 'cancelled' ||
						existingItem.status === 'skipped';
					activeBatchState = {
						...activeBatchState,
						queue: activeBatchState.queue.map((item) =>
							item.id === id
								? {
										...item,
										status: finished ? ('queued' as const) : item.status,
										pageIds: mergedPageIds,
										totalPages: mergedPageIds.length,
										translatedPages: isRunningJob ? item.translatedPages : 0,
										error: null,
									}
								: item,
						),
					};
					completedChapterIds.delete(id);
					failedChapterIds.delete(id);
					clearChapterRetryTimer(id);
					chapterRetryCount.delete(id);
					continue;
				}

				// WHOLE-CHAPTER DEDUP (NO PAGE FILTER): DO NOT DOUBLE QUEUE UNLESS FORCED
				if (existingItem.status === 'processing' || existingItem.status === 'reslicing' || existingItem.status === 'queued') {
					if (!opts.force) {
						continue;
					}
				}

				// IF PREVIOUSLY FINISHED / ERRORED / CANCELLED, RESET AND RE-QUEUE
				activeBatchState = {
					...activeBatchState,
					queue: activeBatchState.queue.map((item) =>
						item.id === id
							? {
									...item,
									status: 'queued' as const,
									translatedPages: 0,
									totalPages: targetTotalPages,
									pageIds: targetPageIds,
									error: null,
								}
							: item,
					),
				};
				completedChapterIds.delete(id);
				failedChapterIds.delete(id);
				continue;
			}

			newItems.push({
				id: ch.id,
				bookId: ch.bookId,
				bookTitle: chBookTitle,
				seq: ch.seq,
				title: ch.title,
				titleTarget: ch.titleTarget,
				pageCount: pCount,
				pageIds: targetPageIds,
				status: 'queued',
				translatedPages: 0,
				totalPages: targetTotalPages,
			});
		}

		if (isCurrentlyActive) {
			// IF NEW CHAPTERS WERE ADDED, APPEND THEM TO ACTIVE QUEUE. QUEUEING WHILE PAUSED MUST NOT
			// AUTO-RESUME THE BATCH — THE NEW ITEMS STAY 'queued' UNTIL THE USER RESUMES.
			const wasPaused = activeBatchState.status === 'paused';
			activeBatchState = {
				...activeBatchState,
				status: wasPaused ? 'paused' : 'running',
				queue: newItems.length > 0 ? [...activeBatchState.queue, ...newItems] : [...activeBatchState.queue],
			};
			if (!wasPaused) {
				startWatchdog();
				dispatchNextItems();
			}
			emitState();
			return this.getState();
		}

		if (newItems.length === 0) {
			throw new Error('No valid chapters found to queue.');
		}

		// RESET INTERNAL TRACKER SETS FOR FRESH QUEUE
		clearAllChapterRetryTimers();
		activeResliceControllers.forEach((c) => c.abort());
		activeResliceControllers.clear();
		preReslicedChapterIds.clear();
		preReslicingChapterIds.clear();
		completedChapterIds.clear();
		failedChapterIds.clear();
		chapterRetryCount.clear();
		chapterGenerationMap.clear();

		activeBatchState = {
			active: true,
			status: 'running',
			bookId,
			bookTitle,
			queue: newItems,
			currentIndex: 0,
			currentPhase: 'translate',
			force: opts.force ?? false,
			startedAt: Date.now(),
			completedAt: null,
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
		};

		startWatchdog();
		emitState();
		dispatchNextItems();

		return this.getState();
	},

	// PAUSE BATCH IMMEDIATELY (HALT IN-FLIGHT WORKERS)
	pauseBatch(): BatchTranslationState {
		if (!activeBatchState.active) return this.getState();
		activeBatchState = {
			...activeBatchState,
			status: 'paused',
			currentPhase: undefined,
			queue: activeBatchState.queue.map((item) =>
				item.status === 'processing' || item.status === 'reslicing'
					? { ...item, status: 'queued' as const, resliceMessage: null, error: null }
					: item,
			),
		};
		stopWatchdog();
		clearAllChapterRetryTimers();

		// ABORT IN-FLIGHT RESLICE CONTROLLERS
		activeResliceControllers.forEach((c) => c.abort());
		activeResliceControllers.clear();

		// ABORT IN-FLIGHT TRANSLATION JOBS SO THEY PAUSE IMMEDIATELY — USING THE GENTLE pauseChapterJob
		// (NOT abortChapterJob) SO THE RUNNING PAGE'S STEP IS NOT MARKED 'failed' AND STAYS RESUMABLE.
		for (const ch of activeBatchState.queue) {
			if (ch.status !== 'done') {
				completedChapterIds.delete(ch.id);
				failedChapterIds.delete(ch.id);
			}
			pauseChapterJob(ch.id);
			clearChapterJob(ch.id);
		}

		// RESET ANY DB PAGES IN 'processing' TO 'pending'
		const unfinishedChapterIds = activeBatchState.queue
			.filter((item) => item.status !== 'done')
			.map((item) => item.id);
		if (unfinishedChapterIds.length > 0) {
			try {
				db.update(pages)
					.set({ status: 'pending', error: null })
					.where(and(inArray(pages.chapterId, unfinishedChapterIds), eq(pages.status, 'processing')))
					.run();
			} catch (err) {
				console.warn('[batchService] Failed to reset in-flight page statuses on pause:', err);
			}
		}

		emitState();
		return this.getState();
	},

	// RESUME PAUSED BATCH
	resumeBatch(): BatchTranslationState {
		if (!activeBatchState.active) return this.getState();

		// CLEAR ANY RESLICE / FAILURE SETS FOR NON-DONE CHAPTERS
		for (const item of activeBatchState.queue) {
			if (item.status !== 'done') {
				completedChapterIds.delete(item.id);
				failedChapterIds.delete(item.id);
			}
		}

		activeBatchState = {
			...activeBatchState,
			status: 'running',
			// RESET ANY HALTED / PROCESSING / RESLICING / CANCELLED ITEMS BACK TO QUEUED
			queue: activeBatchState.queue.map((item) =>
				item.status === 'processing' || item.status === 'reslicing' || (item.status === 'error' && (item.error?.includes('cancelled') || item.error?.includes('Translation cancelled')))
					? { ...item, status: 'queued' as const, resliceMessage: null, error: null }
					: item,
			),
		};

		// RECOMPUTE CURRENT INDEX TO FIRST UNFINISHED CHAPTER
		const firstUnfinished = activeBatchState.queue.findIndex(
			(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
		);
		activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

		startWatchdog();
		emitState();
		dispatchNextItems();
		return this.getState();
	},

	// SKIP CURRENTLY ACTIVE OR SPECIFIED CHAPTER
	async skipChapter(chapterId?: number): Promise<BatchTranslationState> {
		if (!activeBatchState.active) return this.getState();

		const target = chapterId
			? activeBatchState.queue.find((q) => q.id === chapterId)
			: activeBatchState.queue.find((q) => q.status === 'processing' || q.status === 'reslicing') ||
				activeBatchState.queue[activeBatchState.currentIndex];

		if (!target) return this.getState();

		clearChapterRetryTimer(target.id);
		chapterRetryCount.delete(target.id);

		const ctrl = activeResliceControllers.get(target.id);
		if (ctrl) {
			ctrl.abort();
			activeResliceControllers.delete(target.id);
		}

		abortChapterJob(target.id);

		activeBatchState = {
			...activeBatchState,
			queue: activeBatchState.queue.map((item) =>
				item.id === target.id
					? { ...item, status: 'skipped' as const, error: 'Skipped by user' }
					: item,
			),
		};

		// SYNC SKIPPED STATUS TO CHAPTER DB ROW (DONE IF ALL PAGES FINISHED, ELSE PENDING)
		try {
			const targetPages = db
				.select({ status: pages.status, outputPath: pages.outputPath })
				.from(pages)
				.where(eq(pages.chapterId, target.id))
				.all();
			const isDone = targetPages.length > 0 && targetPages.every((p) => p.status === 'done' || Boolean(p.outputPath));
			db.update(chapters)
				.set({ status: isDone ? 'done' : 'pending' })
				.where(eq(chapters.id, target.id))
				.run();
		} catch {
			// IGNORE DB SYNC ERROR
		}

		const firstUnfinished = activeBatchState.queue.findIndex(
			(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
		);
		activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

		emitState();
		dispatchNextItems();
		return this.getState();
	},

	// REMOVE SINGLE CHAPTER FROM ACTIVE QUEUE
	async removeFromQueue(chapterId: number): Promise<BatchTranslationState> {
		if (!activeBatchState.active) return this.getState();

		const target = activeBatchState.queue.find((q) => q.id === chapterId);
		if (!target) return this.getState();

		const ctrl = activeResliceControllers.get(target.id);
		if (ctrl) {
			ctrl.abort();
			activeResliceControllers.delete(target.id);
		}
		abortChapterJob(target.id);
		clearChapterJob(target.id);

		try {
			db.update(pages)
				.set({ status: 'pending', error: null })
				.where(and(eq(pages.chapterId, target.id), eq(pages.status, 'processing')))
				.run();

			const targetPages = db
				.select({ status: pages.status, outputPath: pages.outputPath })
				.from(pages)
				.where(eq(pages.chapterId, target.id))
				.all();
			const isDone = targetPages.length > 0 && targetPages.every((p) => p.status === 'done' || Boolean(p.outputPath));
			db.update(chapters)
				.set({ status: isDone ? 'done' : 'pending' })
				.where(eq(chapters.id, target.id))
				.run();
		} catch {
			// IGNORE DB SYNC ERROR
		}

		completedChapterIds.delete(target.id);
		failedChapterIds.delete(target.id);
		clearChapterRetryTimer(target.id);
		chapterRetryCount.delete(target.id);
		chapterGenerationMap.delete(target.id);

		const remainingQueue = activeBatchState.queue.filter((q) => q.id !== chapterId);

		if (remainingQueue.length === 0) {
			this.clearBatch();
			return this.getState();
		}

		activeBatchState = {
			...activeBatchState,
			queue: remainingQueue,
		};

		const firstUnfinished = activeBatchState.queue.findIndex(
			(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
		);
		activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

		if (activeBatchState.currentIndex >= activeBatchState.queue.length && activeBatchState.status === 'running') {
			activeBatchState.status = 'completed';
			activeBatchState.completedAt = Date.now();
			stopWatchdog();
		}

		emitState();
		if (activeBatchState.status === 'running') {
			dispatchNextItems();
		}
		return this.getState();
	},

	// REORDER QUEUED CHAPTERS IN ACTIVE BATCH
	reorderQueue(orderedChapterIds: number[]): BatchTranslationState {
		if (!activeBatchState.active) return this.getState();

		// KEEP ACTIVE / IN-FLIGHT CHAPTERS IN THEIR SLOTS
		const activeItems = activeBatchState.queue.filter(
			(c) => c.status === 'processing' || c.status === 'reslicing',
		);
		const activeIdSet = new Set(activeItems.map((c) => c.id));

		const remainingItems = activeBatchState.queue.filter((c) => !activeIdSet.has(c.id));
		const itemMap = new Map(remainingItems.map((c) => [c.id, c]));

		const newRemaining: BatchChapterItem[] = [];
		const seen = new Set<number>();

		for (const id of orderedChapterIds) {
			const item = itemMap.get(id);
			if (item && !seen.has(id)) {
				newRemaining.push(item);
				seen.add(id);
			}
		}

		for (const item of remainingItems) {
			if (!seen.has(item.id)) {
				newRemaining.push(item);
				seen.add(item.id);
			}
		}

		activeBatchState = {
			...activeBatchState,
			queue: [...activeItems, ...newRemaining],
		};

		const firstUnfinished = activeBatchState.queue.findIndex(
			(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
		);
		activeBatchState.currentIndex = firstUnfinished >= 0 ? firstUnfinished : activeBatchState.queue.length;

		emitState();
		return this.getState();
	},

	// CANCEL ENTIRE ACTIVE BATCH IMMEDIATELY & SYNC CHAPTER STATUSES
	cancelBatch(): BatchTranslationState {
		if (!activeBatchState.active) return this.getState();

		clearAllChapterRetryTimers();
		activeResliceControllers.forEach((c) => c.abort());
		activeResliceControllers.clear();
		stopWatchdog();

		for (const ch of activeBatchState.queue) {
			abortChapterJob(ch.id);
			clearChapterJob(ch.id);
		}

		const affectedIds = activeBatchState.queue
			.filter((item) => item.status !== 'done')
			.map((item) => item.id);

		// SYNC CANCELLED STATUS IN DATABASE FOR AFFECTED CHAPTERS & PAGES
		if (affectedIds.length > 0) {
			try {
				// 1. RESET ANY PAGES IN 'processing' BACK TO 'pending'
				db.update(pages)
					.set({ status: 'pending', error: null })
					.where(and(inArray(pages.chapterId, affectedIds), eq(pages.status, 'processing')))
					.run();

				// 2. FOR EACH AFFECTED CHAPTER, SET STATUS TO 'done' IF ALL PAGES DONE, OTHERWISE 'pending'
				for (const id of affectedIds) {
					const chPages = db
						.select({ status: pages.status, outputPath: pages.outputPath })
						.from(pages)
						.where(eq(pages.chapterId, id))
						.all();
					const allDone = chPages.length > 0 && chPages.every((p) => p.status === 'done' || Boolean(p.outputPath));
					db.update(chapters)
						.set({ status: allDone ? 'done' : 'pending' })
						.where(eq(chapters.id, id))
						.run();
				}
			} catch (err) {
				console.error('[batchService] Failed to sync cancelled chapter status to DB:', err);
			}
		}

		activeBatchState = {
			...activeBatchState,
			status: 'cancelled',
			currentPhase: undefined,
			completedAt: Date.now(),
			queue: activeBatchState.queue.map((item) =>
				item.status === 'processing' || item.status === 'reslicing' || item.status === 'queued'
					? { ...item, status: 'cancelled' as const, error: 'Batch cancelled' }
					: item,
			),
		};

		emitState();
		return this.getState();
	},

	// DISMISS / CLEAR COMPLETED OR CANCELLED BATCH
	clearBatch(): BatchTranslationState {
		stopWatchdog();
		clearAllChapterRetryTimers();
		chapterRetryCount.clear();
		chapterGenerationMap.clear();
		activeBatchState = {
			active: false,
			status: 'idle',
			bookId: null,
			bookTitle: null,
			queue: [],
			currentIndex: 0,
			currentPhase: undefined,
			force: false,
			startedAt: null,
			completedAt: null,
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
		};
		emitState();
		return this.getState();
	},

	// RESET A SINGLE CHAPTER FROM THE ACTIVE BATCH STATE AND TRACKERS
	resetChapter(chapterId: number): void {
		completedChapterIds.delete(chapterId);
		failedChapterIds.delete(chapterId);
		chapterRetryCount.delete(chapterId);
		chapterGenerationMap.delete(chapterId);
		preReslicedChapterIds.delete(chapterId);
		preReslicingChapterIds.delete(chapterId);
		if (activeResliceControllers.has(chapterId)) {
			activeResliceControllers.get(chapterId)?.abort();
			activeResliceControllers.delete(chapterId);
		}

		if (activeBatchState.active) {
			const nextQueue = activeBatchState.queue.filter((item) => item.id !== chapterId);
			if (nextQueue.length === 0) {
				this.clearBatch();
			} else {
				activeBatchState = {
					...activeBatchState,
					queue: nextQueue,
					currentIndex: Math.min(activeBatchState.currentIndex, nextQueue.length),
				};
				emitState();
			}
		}
	},

	// CLEAR PROGRESS FOR AN ENTIRE BOOK FROM THE ACTIVE BATCH
	clearBook(bookId: string): void {
		if (activeBatchState.bookId === bookId) {
			this.clearBatch();
		}
	},

	// RELOAD ACTIVE BATCH (SEAMLESSLY CYCLES PAUSE & RESUME TO APPLY UPDATED SETTINGS TO IN-FLIGHT JOBS)
	reloadActiveBatch(): BatchTranslationState {
		if (!activeBatchState.active || activeBatchState.status !== 'running') return this.getState();
		this.pauseBatch();
		return this.resumeBatch();
	},
};
