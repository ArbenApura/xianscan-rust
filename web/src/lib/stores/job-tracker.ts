// GLOBAL JOB TRACKER STORE — MULTI-CHAPTER BACKGROUND JOB MANAGER WITH SELF-HEALING & SSE REHYDRATION
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { ChapterJobSnapshot, JobEventType, PageProgressState, PipelineStep, StepTiming } from '$lib/types';
import { streamSse, type SseEvent } from '$lib/sse';
import { settings } from '$lib/stores/settings';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ChapterJobState {
	chapterId: number;
	running: boolean;
	connectionState: ConnectionState;
	snapshot: ChapterJobSnapshot | null;
	lastError: string | null;
	reconnectAttempts: number;
}

interface JobTrackerState {
	jobs: Record<number, ChapterJobState>;
}

const initialState: JobTrackerState = {
	jobs: {},
};

function createJobTrackerStore() {
	const { subscribe, set, update } = writable<JobTrackerState>(initialState);

	// ACTIVE CONTROLLERS / STREAMS BY CHAPTER ID
	const activeControllers = new Map<number, AbortController>();
	const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();

	function initChapterState(chapterId: number): ChapterJobState {
		return {
			chapterId,
			running: false,
			connectionState: 'idle',
			snapshot: null,
			lastError: null,
			reconnectAttempts: 0,
		};
	}

	function findTargetPage(pages: PageProgressState[], pageIdx?: number, pageId?: number): PageProgressState | undefined {
		if (pageId !== undefined) {
			const found = pages.find((p) => p.pageId === pageId);
			if (found) return found;
		}
		if (pageIdx !== undefined && pageIdx >= 0 && pageIdx < pages.length) {
			return pages[pageIdx];
		}
		return undefined;
	}

	function applyEventToSnapshot(snapshot: ChapterJobSnapshot, event: SseEvent): ChapterJobSnapshot {
		const now = (event.timestamp as number) || Date.now();
		const s: ChapterJobSnapshot = {
			...snapshot,
			pages: snapshot.pages.map((p) => ({
				...p,
				timings: { ...p.timings },
			})),
		};

		if (event.type === 'start') {
			s.status = 'running';
			s.startedAt = now;
			s.completedPages = 0;
			s.failedPages = 0;
			s.totalPromptTokens = 0;
			s.totalCompletionTokens = 0;
			s.cacheHitCount = 0;
			if (typeof event.totalPages === 'number') s.totalPages = event.totalPages;
			if (Array.isArray(event.pages) && event.pages.length > 0) {
				s.totalPages = event.pages.length;
				s.pages = event.pages.map(
					(p: { id: number; seq: number; status?: string; cleanedRev?: number; outputRev?: number }, idx: number) => ({
						pageIndex: idx,
						pageId: p.id,
						seq: p.seq,
						status: (p.status as any) || 'pending',
						timings: {},
						cleanedRev: p.cleanedRev,
						outputRev: p.outputRev,
					}),
				);
				s.completedPages = s.pages.filter((p) => p.status === 'done').length;
			}
		} else if (event.type === 'phase-change' && typeof event.phase === 'string') {
			s.currentPhase = event.phase as any;
		} else if (event.type === 'page-added' && event.page !== undefined && event.pageId !== undefined) {
			// DYNAMICALLY INJECTED PAGE — ADD A SNAPSHOT SLOT BEFORE ANY STEP EVENTS ARRIVE.
			// If the page already has a slot (e.g. re-translating a 'done' page from the same job),
			// reset it to pending so it shows as processing again. Otherwise push a new slot.
			const existingSlotIdx = s.pages.findIndex((p) => p.pageId === (event.pageId as number));
			if (existingSlotIdx >= 0) {
				// Reset the existing slot — preserve the pageIndex so indexed events still resolve
				s.pages[existingSlotIdx] = {
					...s.pages[existingSlotIdx],
					status: 'pending',
					currentStep: undefined,
					timings: {},
					outputPath: undefined,
					errorMessage: undefined,
					failedStep: undefined,
				};
			} else {
				s.pages = [
					...s.pages,
					{
						pageIndex: event.page as number,
						pageId: event.pageId as number,
						seq: typeof event.seq === 'number' ? event.seq : 0,
						status: 'pending',
						timings: {},
					},
				];
				s.totalPages = s.pages.length;
			}

		} else if (event.type === 'page-cancelled') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				p.status = 'pending';
				p.currentStep = undefined;
				for (const [step, t] of Object.entries(p.timings) as [PipelineStep, StepTiming | undefined][]) {
					if (t && t.status === 'running') {
						p.timings[step] = {
							...t,
							status: 'failed',
							details: { ...t.details, error: 'Cancelled' },
						};
					}
				}
			}
		} else if (event.type === 'page-step-start') {
			const step = event.step as PipelineStep;
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (step && p) {
				p.status = 'processing';
				p.currentStep = step;
				p.timings[step] = {
					step,
					status: 'running',
					startedAt: now,
					details: event.stepDetails as any,
				};
			}
		} else if (event.type === 'page-step-end') {
			const step = event.step as PipelineStep;
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (step && p) {
				const timing = p.timings[step] ?? { step, status: 'completed' };
				timing.status = (event.stepStatus as any) || 'completed';
				timing.completedAt = now;
				timing.durationMs =
					typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
						? event.durationMs
						: timing.startedAt
							? Math.max(0, now - timing.startedAt)
							: undefined;
				if (event.stepDetails) {
					timing.details = { ...timing.details, ...(event.stepDetails as any) };
					if ((event.stepDetails as any).cacheHit) s.cacheHitCount++;
				}
				p.timings[step] = timing;
			}
		} else if (event.type === 'term-extract-step') {
			if (!s.phase2Stats) s.phase2Stats = {};
			if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) s.phase2Stats.durationMs = event.durationMs;
			if (event.stepDetails && typeof (event.stepDetails as any).regionsCount === 'number') {
				s.phase2Stats.termCount = (event.stepDetails as any).regionsCount;
			}
		} else if (event.type === 'page-done') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				p.status = 'done';
				p.currentStep = 'done';
				if (typeof event.outputPath === 'string') p.outputPath = event.outputPath;
				if (typeof event.cleanedRev === 'number') p.cleanedRev = event.cleanedRev;
				if (typeof event.outputRev === 'number') p.outputRev = event.outputRev;
				if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) p.totalDurationMs = event.durationMs;
			}
			s.completedPages = s.pages.filter((p) => p.status === 'done').length;
		} else if (event.type === 'error') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				p.status = 'error';
				p.currentStep = 'error';
				p.failedStep = event.failedStep as PipelineStep;
				p.errorMessage = String(event.message || 'Error occurred');
				s.failedPages = s.pages.filter((p) => p.status === 'error').length;
			}
		} else if (event.type === 'usage' && event.usage) {
			const u = event.usage as any;
			s.totalPromptTokens += u.promptTokens || 0;
			s.totalCompletionTokens += u.completionTokens || 0;
		} else if (event.type === 'done') {
			s.status = 'done';
			s.currentPhase = 'completed';
			s.completedAt = now;
			s.totalDurationMs = s.startedAt ? now - s.startedAt : 0;
			s.completedPages = s.pages.filter((p) => p.status === 'done').length;
		}

		return s;
	}

	async function fetchJobStatus(chapterId: number): Promise<ChapterJobSnapshot | null> {
		if (!browser) return null;
		try {
			const res = await fetch(`/api/chapters/${chapterId}/job`);
			if (!res.ok) return null;
			const data = await res.json();
			if (data.snapshot) {
				update((state) => {
					const existing = state.jobs[chapterId] || initChapterState(chapterId);
					return {
						...state,
						jobs: {
							...state.jobs,
							[chapterId]: {
								...existing,
								running: Boolean(data.running),
								snapshot: data.snapshot,
								connectionState: data.running ? existing.connectionState : 'idle',
							},
						},
					};
				});
				return data.snapshot;
			}
			return null;
		} catch {
			return null;
		}
	}

	async function connectStream(
		chapterId: number,
		opts: { method?: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
	): Promise<void> {
		if (!browser) return;
		// CANCEL ANY EXISTING CONNECTION FOR THIS CHAPTER
		activeControllers.get(chapterId)?.abort();
		const controller = new AbortController();
		activeControllers.set(chapterId, controller);

		update((state) => {
			const existing = state.jobs[chapterId] || initChapterState(chapterId);
			return {
				...state,
				jobs: {
					...state.jobs,
					[chapterId]: {
						...existing,
						running: true,
						snapshot: opts.method === 'POST' ? null : existing.snapshot,
						connectionState: existing.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
					},
				},
			};
		});

		try {
			await streamSse(
				`/api/chapters/${chapterId}/translate`,
				opts,
				(event) => {
					update((state) => {
						const existing = state.jobs[chapterId] || initChapterState(chapterId);
						const baseSnapshot: ChapterJobSnapshot = existing.snapshot || {
							chapterId,
							status: 'running',
							currentPhase: 'phase1_analyze',
							startedAt: Date.now(),
							totalPages: 0,
							completedPages: 0,
							failedPages: 0,
							totalPromptTokens: 0,
							totalCompletionTokens: 0,
							cacheHitCount: 0,
							pages: [],
						};

						const updatedSnapshot = applyEventToSnapshot(baseSnapshot, event);
						const isTerminal =
							event.type === 'done' || (event.type === 'error' && event.page === undefined);

						return {
							...state,
							jobs: {
								...state.jobs,
								[chapterId]: {
									...existing,
									running: !isTerminal,
									connectionState: isTerminal ? 'idle' : 'connected',
									snapshot: updatedSnapshot,
									reconnectAttempts: 0,
									lastError:
										event.type === 'error' && event.page === undefined
											? String(event.message)
											: existing.lastError,
								},
							},
						};
					});
				},
				controller.signal,
			);

			// STREAM COMPLETED NORMALLY
			update((state) => {
				const existing = state.jobs[chapterId];
				if (!existing) return state;
				return {
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...existing,
							running: false,
							connectionState: 'idle',
							reconnectAttempts: 0,
						},
					},
				};
			});
		} catch (err: any) {
			if (controller.signal.aborted) {
				return;
			}
			console.warn(`[jobTracker] SSE connection failed for chapter ${chapterId}:`, err);

			// CHECK IF JOB STILL RUNNING ON SERVER BEFORE RECONNECTING
			const latest = await fetchJobStatus(chapterId);
			const currentJob = get({ subscribe }).jobs[chapterId];

			if (latest && (latest.status === 'running' || currentJob?.running)) {
				const attempts = (currentJob?.reconnectAttempts || 0) + 1;
				update((state) => ({
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...(state.jobs[chapterId] || initChapterState(chapterId)),
							connectionState: 'reconnecting',
							reconnectAttempts: attempts,
							lastError: err?.message || 'Connection lost',
						},
					},
				}));

				// EXPONENTIAL BACKOFF RECONNECT (MAX 10S)
				const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
				const timer = setTimeout(() => {
					void connectStream(chapterId, { method: 'GET' });
				}, delay);
				reconnectTimers.set(chapterId, timer);
			} else {
				update((state) => ({
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...(state.jobs[chapterId] || initChapterState(chapterId)),
							running: false,
							connectionState: 'error',
							lastError: err?.message || 'Job finished or failed',
						},
					},
				}));
			}
		}
	}

	return {
		subscribe,

		// RESTORE / ATTACH STATE FOR A CHAPTER ON PAGE MOUNT
		async syncChapter(chapterId: number): Promise<void> {
			const snapshot = await fetchJobStatus(chapterId);
			if (snapshot && snapshot.status === 'running') {
				void connectStream(chapterId, { method: 'GET' });
			}
		},

		// TRIGGER TRANSLATION (ALL PENDING PAGES OR TARGETED PAGE IDS)
		async startTranslation(
			chapterId: number,
			opts: { force?: boolean; pageIds?: number[]; pageConcurrency?: number } = {},
		): Promise<void> {
			// Clear any pending timers
			const timer = reconnectTimers.get(chapterId);
			if (timer) clearTimeout(timer);

			const hasActiveStream = activeControllers.has(chapterId);
			const curSettings = get(settings);
			const reqBody = {
				force: opts.force ?? false,
				pageIds: opts.pageIds,
				inpaintMode: curSettings?.inpaintMode,
				pageConcurrency: opts.pageConcurrency ?? curSettings?.parallelProcesses,
			};

			// If a job is already running and we're NOT forcing a supersede, just POST
			// to queue the new page(s) — keep the existing SSE stream alive so we don't
			// lose the ongoing progress feed.
			if (!opts.force && hasActiveStream) {
				const resp = await fetch(`/api/chapters/${chapterId}/translate`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(reqBody),
				});
				if (!resp.ok) {
					const text = await resp.text().catch(() => '');
					throw new Error(text || 'Failed to queue page for translation');
				}
				return;
			}

			await connectStream(chapterId, {
				method: 'POST',
				body: reqBody,
			});
		},

		// CANCEL / ABORT ACTIVE TRANSLATION JOB
		async cancelTranslation(chapterId: number): Promise<void> {
			const timer = reconnectTimers.get(chapterId);
			if (timer) clearTimeout(timer);
			activeControllers.get(chapterId)?.abort();
			activeControllers.delete(chapterId);

			if (browser) {
				try {
					await fetch(`/api/chapters/${chapterId}/job`, { method: 'DELETE' });
				} catch {
					// best-effort abort
				}
			}

			update((state) => {
				const existing = state.jobs[chapterId];
				if (!existing) return state;
				let updatedSnapshot = existing.snapshot;
				if (updatedSnapshot) {
					const now = Date.now();
					updatedSnapshot = {
						...updatedSnapshot,
						status: 'superseded',
						completedAt: now,
						totalDurationMs: updatedSnapshot.startedAt ? now - updatedSnapshot.startedAt : 0,
						pages: updatedSnapshot.pages.map((p) => {
							if (p.status === 'processing') {
								const timings = { ...p.timings };
								for (const [step, t] of Object.entries(timings)) {
									if (t && t.status === 'running') {
										timings[step as PipelineStep] = {
											...t,
											status: 'failed',
											details: { ...t.details, error: 'Cancelled' },
										};
									}
								}
								return {
									...p,
									status: 'pending',
									currentStep: undefined,
									timings,
								};
							}
							return p;
						}),
					};
				}
				return {
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...existing,
							running: false,
							connectionState: 'idle',
							snapshot: updatedSnapshot,
							lastError: 'Translation cancelled.',
						},
					},
				};
			});
		},

		// CANCEL INDIVIDUAL PAGE TRANSLATION (WITHOUT ABORTING THE OVERALL CHAPTER JOB)
		async cancelPage(chapterId: number, pageId: number): Promise<void> {
			if (browser) {
				try {
					await fetch(`/api/pages/${pageId}/cancel`, { method: 'POST' });
				} catch {
					// best-effort
				}
			}
			update((state) => {
				const existing = state.jobs[chapterId];
				if (!existing || !existing.snapshot) return state;
				const updatedPages = existing.snapshot.pages.map((p) => {
					if (p.pageId === pageId) {
						const timings = { ...p.timings };
						for (const [step, t] of Object.entries(timings)) {
							if (t && t.status === 'running') {
								timings[step as PipelineStep] = {
									...t,
									status: 'failed',
									details: { ...t.details, error: 'Cancelled' },
								};
							}
						}
						return {
							...p,
							status: 'pending' as const,
							currentStep: undefined,
							timings,
						};
					}
					return p;
				});
				return {
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...existing,
							snapshot: {
								...existing.snapshot,
								pages: updatedPages,
							},
						},
					},
				};
			});
		},

		// CLEAR / RESET CHAPTER JOB STATE (E.G. ON CLEAR PROGRESS)
		clearJob(chapterId: number): void {
			const timer = reconnectTimers.get(chapterId);
			if (timer) clearTimeout(timer);
			activeControllers.get(chapterId)?.abort();
			activeControllers.delete(chapterId);
			reconnectTimers.delete(chapterId);

			update((state) => {
				const nextJobs = { ...state.jobs };
				delete nextJobs[chapterId];
				return {
					...state,
					jobs: nextJobs,
				};
			});
		},

		// ABORT CLIENT STREAM CONNECTION
		disconnect(chapterId: number): void {
			const timer = reconnectTimers.get(chapterId);
			if (timer) clearTimeout(timer);
			activeControllers.get(chapterId)?.abort();
			activeControllers.delete(chapterId);
			update((state) => {
				const existing = state.jobs[chapterId];
				if (!existing) return state;
				return {
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...existing,
							connectionState: 'idle',
						},
					},
				};
			});
		},
	};
}

export const jobTracker = createJobTrackerStore();

// DERIVED STORE: ALL CURRENTLY ACTIVE TRANSLATING CHAPTERS ACROSS THE APP
export const activeTranslatingChapters = derived(jobTracker, ($jt) => {
	return Object.values($jt.jobs).filter((j) => j.running && j.snapshot);
});
