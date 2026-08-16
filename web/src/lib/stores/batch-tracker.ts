// GLOBAL BATCH TRANSLATION TRACKER STORE
// Orchestrates multi-chapter concurrent execution with lookahead background smart re-slicing,
// staged streaming page processing, SSE monitoring, localStorage persistence, and self-healing error recovery.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { streamSse } from '$lib/sse';
import { jobTracker } from './job-tracker';
import { settings } from './settings';
import type { BatchChapterItem, BatchTranslationState, ChapterJobSnapshot } from '$lib/types';

const STORAGE_KEY = 'xianscan:batch_translation';

const initialBatchState: BatchTranslationState = {
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
	totalCostUsd: 0,
	totalPromptTokens: 0,
	totalCompletionTokens: 0,
};

function loadStoredState(): BatchTranslationState {
	if (!browser) return initialBatchState;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initialBatchState;
		const parsed = JSON.parse(raw);
		if (parsed && Array.isArray(parsed.queue) && parsed.queue.length > 0) {
			return {
				...initialBatchState,
				...parsed,
			};
		}
	} catch {
		// Ignore corrupted state
	}
	return initialBatchState;
}

function saveState(state: BatchTranslationState): void {
	if (!browser) return;
	try {
		if (!state.active && state.status === 'idle') {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		}
	} catch {
		// Ignore storage quota errors
	}
}

function createBatchTrackerStore() {
	const { subscribe, set, update } = writable<BatchTranslationState>(loadStoredState());

	let unsubscribeJobTracker: (() => void) | null = null;
	const activeResliceControllers = new Map<number, AbortController>();
	const preReslicedChapterIds = new Set<number>();
	const preReslicingChapterIds = new Set<number>();
	const completedChapterIds = new Set<number>();
	const failedChapterIds = new Set<number>();

	function getMaxParallelChapters(): number {
		const configured = get(settings)?.parallelChapters;
		return Math.max(1, Math.min(4, Number(configured) || 1));
	}

	// Helper to run smart reslice via SSE stream
	async function resliceChapter(
		chapterId: number,
		onProgress?: (message: string) => void,
		signal?: AbortSignal,
	): Promise<{ originalCount: number; newCount: number } | null> {
		if (!browser) return null;
		let result: { originalCount: number; newCount: number } | null = null;

		try {
			await streamSse(
				`/api/chapters/${chapterId}/reslice`,
				{},
				(e) => {
					if (e.type === 'progress' && typeof e.message === 'string') {
						onProgress?.(e.message);
					} else if (e.type === 'done') {
						result = {
							originalCount: (e.originalCount as number) || 0,
							newCount: (e.newCount as number) || 0,
						};
					} else if (e.type === 'error') {
						console.warn(`Reslice notice for chapter ${chapterId}:`, e.message);
					}
				},
				signal,
			);
			return result;
		} catch (err: any) {
			if (signal?.aborted) return null;
			console.warn(`Reslice stream issue for chapter ${chapterId}:`, err);
			return null;
		}
	}

	// Lookahead background pre-reslicing: pre-slices upcoming chapters while current ones translate
	async function lookaheadPreReslice() {
		if (!browser) return;
		const shouldReslice = get(settings).resliceBeforeBatch ?? true;
		if (!shouldReslice) return;

		const state = get({ subscribe });
		if (!state.active || state.status !== 'running') return;

		// Find upcoming queued chapters that have not yet been pre-resliced
		const candidates = state.queue.filter(
			(c) =>
				c.status === 'queued' &&
				c.pageCount > 0 &&
				!preReslicedChapterIds.has(c.id) &&
				!preReslicingChapterIds.has(c.id),
		);

		// Pre-reslice up to 2 upcoming chapters in the background
		for (const nextCandidate of candidates.slice(0, 2)) {
			preReslicingChapterIds.add(nextCandidate.id);
			const ctrl = new AbortController();
			activeResliceControllers.set(nextCandidate.id, ctrl);

			void (async () => {
				try {
					const res = await resliceChapter(nextCandidate.id, undefined, ctrl.signal);
					activeResliceControllers.delete(nextCandidate.id);
					preReslicingChapterIds.delete(nextCandidate.id);

					if (res && res.newCount > 0) {
						preReslicedChapterIds.add(nextCandidate.id);
						update((s) => {
							const q = s.queue.map((item) =>
								item.id === nextCandidate.id
									? { ...item, pageCount: res.newCount, totalPages: res.newCount }
									: item,
							);
							const next = { ...s, queue: q };
							saveState(next);
							return next;
						});
					}
				} catch {
					activeResliceControllers.delete(nextCandidate.id);
					preReslicingChapterIds.delete(nextCandidate.id);
				}
			})();
		}
	}

	let livenessTimer: ReturnType<typeof setInterval> | null = null;

	function startLivenessWatchdog() {
		if (livenessTimer || !browser) return;
		livenessTimer = setInterval(async () => {
			const currentState = get({ subscribe });
			if (!currentState.active || currentState.status !== 'running') {
				stopLivenessWatchdog();
				return;
			}
			const processingChapters = currentState.queue.filter((c) => c.status === 'processing');
			const jtState = get(jobTracker);

			for (const currentChapter of processingChapters) {
				const job = jtState.jobs[currentChapter.id];
				if (!job || job.connectionState === 'idle' || !job.running) {
					await jobTracker.syncChapter(currentChapter.id);
				}
			}
		}, 2500);
	}

	function stopLivenessWatchdog() {
		if (livenessTimer) {
			clearInterval(livenessTimer);
			livenessTimer = null;
		}
	}

	function detachJobWatcher() {
		stopLivenessWatchdog();
		if (unsubscribeJobTracker) {
			unsubscribeJobTracker();
			unsubscribeJobTracker = null;
		}
	}

	// Watch jobTracker to update live status and advance queue on completions
	function attachJobWatcher() {
		startLivenessWatchdog();
		if (unsubscribeJobTracker) return;

		unsubscribeJobTracker = jobTracker.subscribe((trackerState) => {
			const currentState = get({ subscribe });
			if (!currentState.active || currentState.status !== 'running') return;

			const processingChapters = currentState.queue.filter((c) => c.status === 'processing');

			for (const ch of processingChapters) {
				const jobState = trackerState.jobs[ch.id];
				if (!jobState) continue;

				// Update page progress in queue item
				if (jobState.snapshot) {
					const snap = jobState.snapshot;
					update((s) => {
						const q = s.queue.map((item) =>
							item.id === ch.id
								? {
										...item,
										translatedPages: snap.completedPages,
										totalPages: snap.totalPages || snap.pages.length,
									}
								: item,
						);
						const next = { ...s, queue: q };
						saveState(next);
						return next;
					});
				}

				const isDone =
					jobState.snapshot?.status === 'done' ||
					(!jobState.running &&
						jobState.snapshot?.completedPages === jobState.snapshot?.totalPages &&
						(jobState.snapshot?.totalPages ?? 0) > 0);

				const isFailed =
					jobState.snapshot?.status === 'failed' ||
					(!jobState.running &&
						jobState.connectionState === 'error' &&
						(jobState.snapshot?.completedPages || 0) === 0);

				if (isDone && !completedChapterIds.has(ch.id)) {
					completedChapterIds.add(ch.id);
					onChapterCompleted(ch, jobState.snapshot);
				} else if (isFailed && !failedChapterIds.has(ch.id)) {
					failedChapterIds.add(ch.id);
					onChapterFailed(ch, jobState.lastError || 'Translation failed');
				}
			}
		});
	}

	async function startChapterExecution(chapter: BatchChapterItem) {
		const state = get({ subscribe });
		if (!state.active || state.status !== 'running') return;

		const shouldReslice =
			(get(settings).resliceBeforeBatch ?? true) &&
			chapter.pageCount > 0 &&
			!preReslicedChapterIds.has(chapter.id);

		// STEP 1: RESLICE (IF NOT ALREADY PRE-RESLICED)
		if (shouldReslice) {
			update((s) => {
				const q = s.queue.map((item) =>
					item.id === chapter.id
						? {
								...item,
								status: 'reslicing' as const,
								resliceMessage: 'Analyzing canvas & finding optimal speech gutters...',
								error: null,
							}
						: item,
				);
				const next: BatchTranslationState = { ...s, queue: q, currentPhase: 'reslice' };
				saveState(next);
				return next;
			});

			const ctrl = new AbortController();
			activeResliceControllers.set(chapter.id, ctrl);

			const resliceResult = await resliceChapter(
				chapter.id,
				(msg) => {
					update((s) => {
						const q = s.queue.map((item) =>
							item.id === chapter.id && item.status === 'reslicing'
								? { ...item, resliceMessage: msg }
								: item,
						);
						return { ...s, queue: q };
					});
				},
				ctrl.signal,
			);
			activeResliceControllers.delete(chapter.id);

			const cur = get({ subscribe });
			if (!cur.active || cur.status !== 'running') return;
			const targetItem = cur.queue.find((q) => q.id === chapter.id);
			if (!targetItem || targetItem.status !== 'reslicing') return;

			if (resliceResult && resliceResult.newCount > 0) {
				preReslicedChapterIds.add(chapter.id);
				update((s) => {
					const q = s.queue.map((item) =>
						item.id === chapter.id
							? { ...item, pageCount: resliceResult.newCount, totalPages: resliceResult.newCount }
							: item,
					);
					return { ...s, queue: q };
				});
			}
		}

		// STEP 2: START PIPELINED TRANSLATION
		update((s) => {
			const q = s.queue.map((item) =>
				item.id === chapter.id
					? {
							...item,
							status: 'processing' as const,
							resliceMessage: null,
							error: null,
						}
					: item,
			);
			const next: BatchTranslationState = { ...s, queue: q, currentPhase: 'translate' };
			saveState(next);
			return next;
		});

		void jobTracker.startTranslation(chapter.id, { force: state.force }).catch((err: any) => {
			onChapterFailed(chapter, err?.message || 'Failed to start translation');
		});
	}

	function dispatchNextBatchItems() {
		const state = get({ subscribe });
		if (!state.active || state.status !== 'running') return;

		const maxParallel = getMaxParallelChapters();
		const activeItems = state.queue.filter((c) => c.status === 'processing' || c.status === 'reslicing');
		const availableSlots = maxParallel - activeItems.length;

		if (availableSlots <= 0) {
			void lookaheadPreReslice();
			return;
		}

		const queuedItems = state.queue.filter((c) => c.status === 'queued').slice(0, availableSlots);

		if (queuedItems.length === 0) {
			if (activeItems.length === 0) {
				finishBatch();
			}
			return;
		}

		// Advance currentIndex pointer to the first active/unfinished chapter for UI focus
		const firstUnfinishedIdx = state.queue.findIndex(
			(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
		);
		if (firstUnfinishedIdx >= 0 && firstUnfinishedIdx !== state.currentIndex) {
			update((s) => {
				const next = { ...s, currentIndex: firstUnfinishedIdx };
				saveState(next);
				return next;
			});
		}

		for (const item of queuedItems) {
			void startChapterExecution(item);
		}

		void lookaheadPreReslice();
	}

	function onChapterCompleted(chapter: BatchChapterItem, snapshot: ChapterJobSnapshot | null) {
		const title = chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`;
		toast.success(`✓ ${title} translated successfully!`);

		update((s) => {
			const q = s.queue.map((item) =>
				item.id === chapter.id
					? {
							...item,
							status: 'done' as const,
							translatedPages: snapshot?.completedPages || item.pageCount,
							totalPages: snapshot?.totalPages || item.pageCount,
						}
					: item,
			);

			const totalCostUsd = s.totalCostUsd + (snapshot?.totalCostUsd || 0);
			const totalPromptTokens = s.totalPromptTokens + (snapshot?.totalPromptTokens || 0);
			const totalCompletionTokens = s.totalCompletionTokens + (snapshot?.totalCompletionTokens || 0);

			const firstUnfinishedIdx = q.findIndex(
				(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
			);

			const next: BatchTranslationState = {
				...s,
				queue: q,
				currentIndex: firstUnfinishedIdx >= 0 ? firstUnfinishedIdx : s.queue.length,
				totalCostUsd,
				totalPromptTokens,
				totalCompletionTokens,
			};
			saveState(next);
			return next;
		});

		dispatchNextBatchItems();
	}

	function onChapterFailed(chapter: BatchChapterItem, errorMsg: string) {
		const title = chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`;
		toast.error(`Chapter ${chapter.seq + 1} translation failed: ${errorMsg}`);

		update((s) => {
			const q = s.queue.map((item) =>
				item.id === chapter.id
					? {
							...item,
							status: 'error' as const,
							error: errorMsg,
						}
					: item,
			);

			const firstUnfinishedIdx = q.findIndex(
				(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
			);

			const next: BatchTranslationState = {
				...s,
				queue: q,
				currentIndex: firstUnfinishedIdx >= 0 ? firstUnfinishedIdx : s.queue.length,
			};
			saveState(next);
			return next;
		});

		dispatchNextBatchItems();
	}

	function finishBatch() {
		detachJobWatcher();

		update((s) => {
			const next: BatchTranslationState = {
				...s,
				status: 'completed',
				currentPhase: undefined,
				completedAt: Date.now(),
			};
			saveState(next);
			return next;
		});

		const finalState = get({ subscribe });
		const doneCount = finalState.queue.filter((c) => c.status === 'done').length;
		toast.success(`Batch Translation Finished: ${doneCount} of ${finalState.queue.length} chapters complete.`);
	}

	// Initialize and check for auto-resume if page reloads during active batch
	if (browser) {
		setTimeout(() => {
			const current = get({ subscribe });
			if (current.active && current.status === 'running') {
				attachJobWatcher();
				const activeChapters = current.queue.filter((c) => c.status === 'processing');
				if (activeChapters.length > 0) {
					for (const ch of activeChapters) {
						void jobTracker.syncChapter(ch.id);
					}
				} else {
					dispatchNextBatchItems();
				}
			}
		}, 100);
	}

	return {
		subscribe,

		// Start a new batch
		startBatch(
			bookId: string,
			bookTitle: string,
			chapters: Array<{ id: number; seq: number; title: string; titleTarget?: string | null; pageCount: number }>,
			opts: { force?: boolean } = {},
		) {
			if (chapters.length === 0) return;

			// GUARD: PREVENT RUNNING BATCH ON ANOTHER BOOK WHILE ACTIVE
			const currentState = get({ subscribe });
			if (
				currentState.active &&
				(currentState.status === 'running' || currentState.status === 'paused') &&
				currentState.bookId &&
				currentState.bookId !== bookId
			) {
				const activeBook = currentState.bookTitle || 'another book';
				toast.warning(
					`Batch translation is currently active for "${activeBook}". Please wait for it to finish or stop it before starting another.`,
					{ duration: 5000 },
				);
				return;
			}

			// Clear previous execution tracker sets
			activeResliceControllers.forEach((c) => c.abort());
			activeResliceControllers.clear();
			preReslicedChapterIds.clear();
			preReslicingChapterIds.clear();
			completedChapterIds.clear();
			failedChapterIds.clear();

			attachJobWatcher();

			const queue: BatchChapterItem[] = chapters.map((ch) => ({
				id: ch.id,
				seq: ch.seq,
				title: ch.title,
				titleTarget: ch.titleTarget,
				pageCount: ch.pageCount,
				status: 'queued',
				translatedPages: 0,
				totalPages: ch.pageCount,
			}));

			const newState: BatchTranslationState = {
				active: true,
				status: 'running',
				bookId,
				bookTitle,
				queue,
				currentIndex: 0,
				currentPhase: 'reslice',
				force: opts.force ?? false,
				startedAt: Date.now(),
				completedAt: null,
				totalCostUsd: 0,
				totalPromptTokens: 0,
				totalCompletionTokens: 0,
			};

			set(newState);
			saveState(newState);

			const parallelCount = getMaxParallelChapters();
			const parallelMsg = parallelCount > 1 ? ` (${parallelCount} parallel workers)` : '';
			toast.info(`Starting batch translation for ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}${parallelMsg}...`);

			dispatchNextBatchItems();
		},

		// Pause batch
		pauseBatch() {
			update((s) => {
				const next: BatchTranslationState = { ...s, status: 'paused' };
				saveState(next);
				return next;
			});
			toast.info('Batch translation paused.');
		},

		// Resume paused batch
		resumeBatch() {
			attachJobWatcher();
			update((s) => {
				const next: BatchTranslationState = { ...s, status: 'running' };
				saveState(next);
				return next;
			});
			toast.info('Resuming batch translation...');
			dispatchNextBatchItems();
		},

		// Skip currently processing or specified chapter
		async skipCurrentChapter(chapterId?: number) {
			const state = get({ subscribe });
			const target = chapterId
				? state.queue.find((q) => q.id === chapterId)
				: state.queue.find((q) => q.status === 'processing' || q.status === 'reslicing') ||
					state.queue[state.currentIndex];

			if (!target) return;

			const ctrl = activeResliceControllers.get(target.id);
			if (ctrl) {
				ctrl.abort();
				activeResliceControllers.delete(target.id);
			}

			try {
				await jobTracker.cancelTranslation(target.id);
			} catch {
				// Ignore
			}

			update((s) => {
				const q = s.queue.map((item) =>
					item.id === target.id
						? {
								...item,
								status: 'skipped' as const,
								error: 'Skipped by user',
							}
						: item,
				);
				const firstUnfinishedIdx = q.findIndex(
					(c) => c.status === 'queued' || c.status === 'processing' || c.status === 'reslicing',
				);
				const next: BatchTranslationState = {
					...s,
					queue: q,
					currentIndex: firstUnfinishedIdx >= 0 ? firstUnfinishedIdx : s.queue.length,
				};
				saveState(next);
				return next;
			});

			toast.info(`Skipped Chapter ${target.seq + 1}.`);
			dispatchNextBatchItems();
		},

		// Cancel entire batch translation
		async cancelBatch() {
			activeResliceControllers.forEach((c) => c.abort());
			activeResliceControllers.clear();
			preReslicingChapterIds.clear();

			detachJobWatcher();

			const state = get({ subscribe });
			const activeOrQueued = state.queue.filter(
				(c) => c.status === 'processing' || c.status === 'reslicing' || c.status === 'queued',
			);

			for (const ch of activeOrQueued) {
				if (ch.status === 'processing') {
					try {
						await jobTracker.cancelTranslation(ch.id);
					} catch {
						// Ignore
					}
				}
			}

			update((s) => {
				const updatedQueue = s.queue.map((item) => {
					if (item.status === 'processing' || item.status === 'reslicing' || item.status === 'queued') {
						return {
							...item,
							status: 'cancelled' as const,
							error: 'Batch cancelled',
							resliceMessage: null,
						};
					}
					return item;
				});

				const next: BatchTranslationState = {
					...s,
					queue: updatedQueue,
					status: 'cancelled',
					currentPhase: undefined,
					completedAt: Date.now(),
				};
				saveState(next);
				return next;
			});

			toast.info('Batch translation cancelled.');
		},

		// Dismiss / Clear finished or cancelled batch from view
		clearBatch() {
			detachJobWatcher();
			activeResliceControllers.forEach((c) => c.abort());
			activeResliceControllers.clear();
			preReslicedChapterIds.clear();
			preReslicingChapterIds.clear();
			completedChapterIds.clear();
			failedChapterIds.clear();

			const next: BatchTranslationState = {
				...initialBatchState,
			};
			set(next);
			saveState(next);
		},

		// Manually re-sync state on mount
		sync() {
			const state = get({ subscribe });
			if (state.active && state.status === 'running') {
				attachJobWatcher();
				const processing = state.queue.filter((c) => c.status === 'processing');
				for (const ch of processing) {
					void jobTracker.syncChapter(ch.id);
				}
				dispatchNextBatchItems();
			}
		},
	};
}

export const batchTracker = createBatchTrackerStore();

// Derived helper for aggregated progress metrics
export const batchProgress = derived(
	[batchTracker, jobTracker],
	([$bt, $jt]) => {
		if (!$bt.active || $bt.queue.length === 0) {
			return {
				active: false,
				totalChapters: 0,
				completedChapters: 0,
				failedChapters: 0,
				totalAllPages: 0,
				completedAllPages: 0,
				overallProgressPercent: 0,
				currentChapter: null,
				currentJobState: null,
				activeChapters: [],
			};
		}

		const totalChapters = $bt.queue.length;
		const completedChapters = $bt.queue.filter((c) => c.status === 'done').length;
		const failedChapters = $bt.queue.filter((c) => c.status === 'error').length;
		const processedChapters = $bt.queue.filter(
			(c) => c.status === 'done' || c.status === 'skipped' || c.status === 'error',
		).length;

		let totalAllPages = 0;
		let completedAllPages = 0;

		for (let i = 0; i < $bt.queue.length; i++) {
			const item = $bt.queue[i];
			const count = item.pageCount || item.totalPages || 0;
			totalAllPages += count;

			if (item.status === 'done') {
				completedAllPages += count;
			} else if (item.status === 'processing') {
				const jobState = $jt.jobs[item.id];
				const doneInJob = jobState?.snapshot?.completedPages || item.translatedPages || 0;
				completedAllPages += doneInJob;
			}
		}

		const overallProgressPercent =
			$bt.status === 'completed'
				? 100
				: totalAllPages > 0
					? Math.min(100, Math.round((completedAllPages / totalAllPages) * 100))
					: Math.min(100, Math.round((processedChapters / totalChapters) * 100));

		const activeChapters = $bt.queue.filter((c) => c.status === 'processing' || c.status === 'reslicing');
		const currentChapter = activeChapters[0] || $bt.queue[$bt.currentIndex] || null;
		const currentJobState = currentChapter ? $jt.jobs[currentChapter.id] || null : null;

		return {
			active: $bt.active,
			status: $bt.status,
			currentPhase: $bt.currentPhase,
			totalChapters,
			completedChapters,
			failedChapters,
			totalAllPages,
			completedAllPages,
			overallProgressPercent,
			currentChapter,
			currentJobState,
			activeChapters,
		};
	},
);
