// GLOBAL BATCH TRANSLATION TRACKER STORE (web/src/lib/stores/batch-tracker.ts)
// Synced across multiple devices via canonical server REST & SSE stream endpoints.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { streamSse } from '$lib/sse';
import { apiJson } from '$lib/api';
import { jobTracker } from './job-tracker';
import { isNewerBatchState, stampLocalBatchState } from './batch-order';
import { effectiveTypeset, settings } from './settings';
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
				// A RESTORED STATE CARRIES NO ORDERING, SO THE FIRST SERVER STATE ALWAYS WINS
				const { revision: _revision, epoch: _epoch, ...rest } = parsed;
				return { ...initialBatchState, ...rest };
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

// EXPORTED SO TESTS GET A FRESH INSTANCE (autoStart: false SKIPS THE BACKGROUND POLL); THE APP USES batchTracker
export function createBatchTrackerStore(opts: { autoStart?: boolean } = {}) {
	const restored = loadLocalState();
	const { subscribe, set, update } = writable<BatchTranslationState>(restored);

	// NON-NULL WHILE A STREAM IS OPEN OR OPENING
	let sseAbortController: AbortController | null = null;
	let syncInFlight = false;
	let bootTimer: ReturnType<typeof setTimeout> | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectAttempts = 0;
	// CHAPTER NOTICES ALREADY TOASTED (A STATE IS RE-SENT ON EVERY CHANGE); ONES IN THE RESTORED STATE WERE SHOWN BEFORE
	const shownNotices = new Set<string>(restored.queue.flatMap((item) => (item.notices ?? []).map((n) => `${item.id}:${n}`)));

	function showNewNotices(state: BatchTranslationState) {
		if (!browser) return;
		for (const item of state.queue) {
			for (const notice of item.notices ?? []) {
				const key = `${item.id}:${notice}`;
				if (shownNotices.has(key)) continue;
				shownNotices.add(key);
				const title = item.titleTarget || item.title;
				// SAME ID AS job-tracker's WARNING TOAST, SO A CHAPTER PAGE OPEN DURING THE BATCH SHOWS IT ONCE
				toast.warning(title ? `${title}: ${notice}` : notice, { id: `job-warning-${item.id}-${notice}`, duration: 10000 });
			}
		}
	}

	function scheduleReconnect() {
		if (!browser) return;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
		reconnectAttempts++;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connectSse();
		}, delay);
	}

	function handleServerState(state: BatchTranslationState) {
		// A LATE POLL OR ACTION RESPONSE OLDER THAN A STREAM EVENT ALREADY APPLIED MUST NOT WIN, AND ABOVE ALL MUST NOT
		// RUN THE clearJob LOOP BELOW FOR A STALE "cancelled" (FEAT-009 PHASE 3, P6)
		if (!isNewerBatchState(get({ subscribe }), state)) return;
		set(state);
		saveLocalState(state);
		showNewNotices(state);
		if (state.status === 'cancelled' || state.status === 'idle') {
			for (const item of state.queue) {
				jobTracker.clearJob(item.id);
			}
		}
	}

	// CONNECT TO SERVER SSE FEED
	function connectSse() {
		if (!browser || sseAbortController) return;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		const ctrl = new AbortController();
		sseAbortController = ctrl;

		void (async () => {
			try {
				await streamSse(
					'/api/batch/events',
					{ method: 'GET' },
					(e) => {
						reconnectAttempts = 0;
						if ((e.type === 'batch-state' || e.type === 'batch-chapter-update' || e.type === 'batch-finished') && (e as any).state) {
							handleServerState((e as any).state);
						} else if (Array.isArray((e as any).queue) && typeof (e as any).active === 'boolean') {
							handleServerState(e as unknown as BatchTranslationState);
						}
					},
					ctrl.signal,
				);
				if (!ctrl.signal.aborted) {
					scheduleReconnect();
				}
			} catch {
				if (!ctrl.signal.aborted) {
					scheduleReconnect();
				}
			} finally {
				// ONLY THE CURRENT STREAM MAY CLEAR ITS SLOT; A NEWER ONE MAY ALREADY BE OPEN (P7)
				if (sseAbortController === ctrl) {
					sseAbortController = null;
				}
			}
		})();
	}

	function disconnectSse() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		reconnectAttempts = 0;
		if (sseAbortController) {
			sseAbortController.abort();
			sseAbortController = null;
		}
	}

	// INITIALIZE & SYNC ON LOAD
	if (browser && opts.autoStart !== false) {
		bootTimer = setTimeout(() => {
			bootTimer = null;
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
		// A SLOW /api/batch NEVER OVERLAPS ITSELF
		if (!browser || syncInFlight) return;
		syncInFlight = true;
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
		} finally {
			syncInFlight = false;
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
						enableWhiteInpaint: curSettings?.enableWhiteInpaint,
						inpaintExpansionPct: curSettings?.inpaintExpansionPct,
						enableTypesetCentering: curSettings?.enableTypesetCentering,
						typesetOptions: {
							fontDialogue: curSettings?.typesetFont,
							scriptFonts: curSettings?.typesetScriptFonts,
							boxInset: curSettings?.typesetPadding,
							outlineMode: curSettings?.typesetOutline,
							colorMode: curSettings?.typesetContrast,
							// THE EFFECTIVE (FONT-COMPATIBLE) VALUES THE PREVIEW SHOWS; AN UNKNOWN FONT SENDS THE STORED ONES (ADR-004)
							casing: get(effectiveTypeset).casing,
							fontWeight: get(effectiveTypeset).weight,
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
		cancelPage(chapterId: number, pageId: number, fallbackAllPageIds?: number[]) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) => {
					if (item.id === chapterId) {
						const baseIds = item.pageIds || fallbackAllPageIds;
						const updatedPageIds = baseIds ? baseIds.filter((id) => id !== pageId) : undefined;
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
				// A LOCAL WRITE KEEPS THE ORDERING STAMP, SO A STALE POLL STILL IN FLIGHT CANNOT BRING THE BATCH BACK
				const cleared = stampLocalBatchState(get({ subscribe }), initialBatchState);
				set(cleared);
				saveLocalState(cleared);
			}
		},

		// CLEAR A SINGLE CHAPTER FROM LOCAL BATCH TRACKER (E.G. ON CLEAR CHAPTER PROGRESS)
		clearChapter(chapterId: number) {
			update((cur) => {
				if (!cur.active && cur.status === 'idle') return cur;
				const nextQueue = cur.queue.filter((c) => c.id !== chapterId);
				const nextState: BatchTranslationState =
					nextQueue.length === 0
						? stampLocalBatchState(cur, initialBatchState)
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
					const cleared = stampLocalBatchState(cur, initialBatchState);
					saveLocalState(cleared);
					return cleared;
				}
				return cur;
			});
		},

		// MANUALLY TRIGGER SYNC
		sync,

		// SSE CONTROLS
		connectSse,
		disconnectSse,

		// DIRECT STATE SETTER (FOR TESTING AND SYNCHRONOUS STORE INITIALIZATION)
		set: handleServerState,

		// STOPS THE POLL, THE RECONNECT TIMER AND THE STREAM (TESTS, HMR)
		destroy(): void {
			if (bootTimer) clearTimeout(bootTimer);
			bootTimer = null;
			if (pollTimer) clearInterval(pollTimer);
			pollTimer = null;
			disconnectSse();
		},
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
