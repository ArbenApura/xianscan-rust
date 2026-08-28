// GLOBAL BATCH TRANSLATION TRACKER STORE (web/src/lib/stores/batch-tracker.ts)
// Synced across multiple devices via canonical server REST & SSE stream endpoints.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { streamSse } from '$lib/sse';
import { apiJson } from '$lib/api';
import { jobTracker } from './job-tracker';
import { settings } from './settings';
import type { BatchChapterItem, BatchTranslationState } from '$lib/types';

// -- CONSTANTS -- //

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
	totalPromptTokens: 0,
	totalCompletionTokens: 0,
};

// -- CACHE HELPERS -- //

function loadLocalState(): BatchTranslationState {
	if (!browser) return initialBatchState;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.queue)) {
				return { ...initialBatchState, ...parsed };
			}
		}
	} catch {
		// Ignore corrupted state
	}
	return initialBatchState;
}

function saveLocalState(state: BatchTranslationState): void {
	if (!browser) return;
	try {
		if (!state.active && state.status === 'idle') {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		}
	} catch {
		// Ignore quota
	}
}

// -- STORE FACTORY -- //

function createBatchTrackerStore() {
	const { subscribe, set, update } = writable<BatchTranslationState>(loadLocalState());

	let sseAbortController: AbortController | null = null;
	let isConnectingSse = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function handleServerState(state: BatchTranslationState) {
		set(state);
		saveLocalState(state);
		if (state.status === 'cancelled' || state.status === 'idle') {
			for (const item of state.queue) {
				jobTracker.clearJob(item.id);
			}
		}
	}

	// CONNECT TO SERVER SSE FEED
	function connectSse() {
		if (!browser || isConnectingSse || sseAbortController) return;
		isConnectingSse = true;

		const ctrl = new AbortController();
		sseAbortController = ctrl;

		void (async () => {
			try {
				await streamSse(
					'/api/batch/events',
					{ method: 'GET' },
					(e) => {
						if ((e.type === 'batch-state' || e.type === 'batch-chapter-update' || e.type === 'batch-finished') && (e as any).state) {
							handleServerState((e as any).state);
						}
					},
					ctrl.signal,
				);
			} catch {
				// SSE closed or reconnected
			} finally {
				isConnectingSse = false;
				sseAbortController = null;
			}
		})();
	}

	function disconnectSse() {
		if (sseAbortController) {
			sseAbortController.abort();
			sseAbortController = null;
		}
		isConnectingSse = false;
	}

	// INITIALIZE & SYNC ON LOAD
	if (browser) {
		setTimeout(() => {
			void sync();
			connectSse();

			// PERIODIC SYNC POLLING AS BACKUP
			if (!pollTimer) {
				pollTimer = setInterval(() => {
					const cur = get({ subscribe });
					if (cur.active && cur.status === 'running') {
						void sync();
					}
				}, 5000);
			}
		}, 50);
	}

	async function sync(): Promise<void> {
		if (!browser) return;
		try {
			const res = await apiJson<BatchTranslationState>('/api/batch');
			if (res) {
				handleServerState(res);
				if (res.active && (res.status === 'running' || res.status === 'paused')) {
					connectSse();
				}
			}
		} catch {
			// Offline or server temporarily unreachable
		}
	}

	return {
		subscribe,

		// START NEW BATCH VIA SERVER
		async startBatch(
			bookId: string,
			bookTitle: string,
			chapters: Array<{ id: number; seq: number; title: string; titleTarget?: string | null; pageCount: number }>,
			opts: { force?: boolean; pageIds?: number[] } = {},
		) {
			if (chapters.length === 0) return;

			try {
				const cur = get({ subscribe });
				const alreadyQueuedCount = cur.active
					? chapters.filter((c) =>
							cur.queue.some(
								(q) =>
									q.id === c.id &&
									(q.status === 'processing' || q.status === 'reslicing' || q.status === 'queued'),
							),
						).length
					: 0;

				const curSettings = get(settings);
				const parallelWorkers = curSettings?.parallelChapters || 1;
				const pageConcurrency = curSettings?.parallelProcesses || 1;
				const resliceBeforeBatch = curSettings?.resliceBeforeBatch ?? false;
				const res = await apiJson<BatchTranslationState>('/api/batch', {
					method: 'POST',
					body: {
						bookId,
						bookTitle,
						chapterIds: chapters.map((c) => c.id),
						pageIds: opts.pageIds,
						force: opts.force ?? false,
						parallelWorkers,
						pageConcurrency,
						resliceBeforeBatch,
						inpaintMode: curSettings?.inpaintMode,
						inpaintExpansionPct: curSettings?.inpaintExpansionPct,
						typesetExpansionPct: curSettings?.typesetExpansionPct,
						enableWatermarkInpaint: curSettings?.enableWatermarkInpaint,
						typesetOptions: {
							fontDialogue: curSettings?.typesetFont,
							fontCjk: curSettings?.typesetCjkFont,
							boxInset: curSettings?.typesetPadding,
							outlineMode: curSettings?.typesetOutline,
							colorMode: curSettings?.typesetContrast,
							casing: curSettings?.typesetCasing,
							enableRotation: curSettings?.enableTextRotation,
						},
					},
				});

				if (res) {
					handleServerState(res);
					connectSse();
					if (alreadyQueuedCount === chapters.length && !opts.force) {
						toast.info(
							chapters.length === 1
								? 'This chapter is already in the translation queue.'
								: 'All selected chapters are already in the translation queue.',
						);
					} else if (alreadyQueuedCount > 0 && !opts.force) {
						toast.info(
							`Queued ${chapters.length - alreadyQueuedCount} chapter(s) (${alreadyQueuedCount} already in queue).`,
						);
					} else if (opts.pageIds && opts.pageIds.length > 0) {
						toast.info(
							opts.pageIds.length === 1
								? 'Started translation for 1 page.'
								: `Started translation for ${opts.pageIds.length} pages.`,
						);
					} else {
						toast.info(
							`Started batch translation for ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}.`,
						);
					}
				}
			} catch (err: any) {
				toast.error(
					err?.message ||
						(opts.pageIds && opts.pageIds.length > 0
							? 'Failed to start page translation.'
							: 'Failed to start batch translation.'),
				);
			}
		},

		// PAUSE ACTIVE BATCH
		async pauseBatch() {
			try {
				const res = await apiJson<BatchTranslationState>('/api/batch/pause', { method: 'POST' });
				if (res) handleServerState(res);
				toast.info('Batch translation paused.');
			} catch (err: any) {
				toast.error(err?.message || 'Failed to pause batch.');
			}
		},

		// RESUME PAUSED BATCH
		async resumeBatch() {
			try {
				const res = await apiJson<BatchTranslationState>('/api/batch/resume', { method: 'POST' });
				if (res) {
					handleServerState(res);
					connectSse();
				}
				toast.info('Resuming batch translation...');
			} catch (err: any) {
				toast.error(err?.message || 'Failed to resume batch.');
			}
		},

		// SKIP CURRENT OR SPECIFIC CHAPTER
		async skipCurrentChapter(chapterId?: number) {
			try {
				const res = await apiJson<BatchTranslationState>('/api/batch/skip', {
					method: 'POST',
					body: { chapterId },
				});
				if (res) handleServerState(res);
				toast.info('Chapter skipped.');
			} catch (err: any) {
				toast.error(err?.message || 'Failed to skip chapter.');
			}
		},

		// REMOVE SPECIFIC CHAPTER FROM QUEUE
		async removeFromQueue(chapterId: number) {
			try {
				jobTracker.clearJob(chapterId);
				const res = await apiJson<BatchTranslationState>('/api/batch/remove', {
					method: 'POST',
					body: { chapterId },
				});
				if (res) handleServerState(res);
				toast.info('Removed chapter from queue.');
			} catch (err: any) {
				toast.error(err?.message || 'Failed to remove chapter from queue.');
			}
		},

		// CANCEL INDIVIDUAL PAGE FROM RUNNING BATCH QUEUE
		cancelPage(chapterId: number, pageId: number) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) => {
					if (item.id === chapterId) {
						const updatedPageIds = item.pageIds ? item.pageIds.filter((id) => id !== pageId) : undefined;
						const newTotal = updatedPageIds ? updatedPageIds.length : Math.max(0, (item.totalPages || item.pageCount) - 1);
						return {
							...item,
							pageIds: updatedPageIds,
							totalPages: newTotal,
						};
					}
					return item;
				}),
			}));
		},

		// REORDER QUEUED CHAPTERS
		async reorderQueue(orderedChapterIds: number[]) {
			try {
				const res = await apiJson<BatchTranslationState>('/api/batch/reorder', {
					method: 'POST',
					body: { chapterIds: orderedChapterIds },
				});
				if (res) handleServerState(res);
			} catch (err: any) {
				toast.error(err?.message || 'Failed to reorder queue.');
			}
		},

		// CANCEL BATCH
		async cancelBatch() {
			try {
				const cur = get({ subscribe });
				for (const item of cur.queue) {
					jobTracker.clearJob(item.id);
				}
				const res = await apiJson<BatchTranslationState>('/api/batch/cancel', { method: 'POST' });
				if (res) handleServerState(res);
				toast.info('Batch translation cancelled.');
			} catch (err: any) {
				toast.error(err?.message || 'Failed to cancel batch.');
			}
		},

		// CLEAR / DISMISS FINISHED BATCH
		async clearBatch() {
			try {
				const res = await apiJson<BatchTranslationState>('/api/batch/clear', { method: 'POST' });
				if (res) handleServerState(res);
			} catch {
				handleServerState(initialBatchState);
			}
		},

		// CLEAR A SINGLE CHAPTER FROM LOCAL BATCH TRACKER (E.G. ON CLEAR CHAPTER PROGRESS)
		clearChapter(chapterId: number) {
			update((cur) => {
				if (!cur.active && cur.status === 'idle') return cur;
				const nextQueue = cur.queue.filter((c) => c.id !== chapterId);
				const nextState: BatchTranslationState =
					nextQueue.length === 0
						? initialBatchState
						: {
								...cur,
								queue: nextQueue,
								currentIndex: Math.min(cur.currentIndex, nextQueue.length),
							};
				saveLocalState(nextState);
				return nextState;
			});
			jobTracker.clearJob(chapterId);
		},

		// CLEAR ENTIRE BOOK FROM LOCAL BATCH TRACKER (E.G. ON CLEAR BOOK PROGRESS)
		clearBook(bookId: string) {
			update((cur) => {
				if (cur.bookId === bookId) {
					for (const item of cur.queue) {
						jobTracker.clearJob(item.id);
					}
					saveLocalState(initialBatchState);
					return initialBatchState;
				}
				return cur;
			});
		},

		// MANUALLY TRIGGER SYNC
		sync,
	};
}

export const batchTracker = createBatchTrackerStore();

// DERIVED AGGREGATED PROGRESS METRICS
export const batchProgress = derived(
	[batchTracker, jobTracker],
	([$bt, $jt]) => {
		if (!$bt.active || $bt.queue.length === 0) {
			return {
				active: false,
				status: 'idle' as const,
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
			const targetIds = item.pageIds && item.pageIds.length > 0 ? new Set(item.pageIds) : null;
			const count = targetIds ? targetIds.size : (item.totalPages || item.pageCount || 0);
			totalAllPages += count;

			if (item.status === 'done') {
				completedAllPages += count;
			} else if (item.status === 'processing') {
				const jobState = $jt.jobs[item.id];
				const doneInJob = targetIds && jobState?.snapshot?.pages
					? jobState.snapshot.pages.filter((p) => targetIds.has(p.pageId) && p.status === 'done').length
					: (jobState?.snapshot?.completedPages || item.translatedPages || 0);
				completedAllPages += Math.min(count, doneInJob);
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
