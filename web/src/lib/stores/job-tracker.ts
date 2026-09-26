// GLOBAL JOB TRACKER STORE — MULTI-CHAPTER BACKGROUND JOB MANAGER WITH SELF-HEALING & SSE REHYDRATION
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import type { ChapterJobSnapshot, JobEventType, PageProgressState, PipelineStep, StepTiming } from '$lib/types';
import { streamSse, type SseEvent } from '$lib/sse';
import { effectiveTypeset, settings } from '$lib/stores/settings';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ChapterJobState {
	chapterId: number;
	running: boolean;
	connectionState: ConnectionState;
	snapshot: ChapterJobSnapshot | null;
	lastError: string | null;
	reconnectAttempts: number;
	/** TRANSIENT SERVER NOTICE WITHOUT A PHASE (E.G. "Stopping previous run..." WHILE A FORCED RE-RUN WAITS); CLEARED BY
	 *  THE NEXT PHASE OR PAGE PROGRESS. OPTIONAL SO CALLERS AND TESTS BUILDING A STATE BY HAND STILL TYPE-CHECK. */
	statusMessage?: string | null;
}

interface JobTrackerState {
	jobs: Record<number, ChapterJobState>;
}

const initialState: JobTrackerState = {
	jobs: {},
};

// EXPORTED SO TESTS GET A FRESH INSTANCE; THE APP USES THE jobTracker SINGLETON BELOW
export function createJobTrackerStore() {
	const { subscribe, update } = writable<JobTrackerState>(initialState);

	// ACTIVE CONTROLLERS / STREAMS BY CHAPTER ID. AN ENTRY EXISTS ONLY WHILE ITS STREAM, OR THE RECONNECT IT
	// SCHEDULED, IS LIVE; THE CONTROLLER IN THE MAP "OWNS" THE CHAPTER (FEAT-009 PHASE 2).
	const activeControllers = new Map<number, AbortController>();
	const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
	// ONE STATUS REQUEST PER CHAPTER AT A TIME. (THE PLAN'S OPTIONAL 1 S COOLDOWN AFTER A "NOT RUNNING" ANSWER IS
	// OFF BY DEFAULT: IT SKIPPED LEGITIMATE RE-SYNCS, E.G. RETURNING TO A CHAPTER WHOSE JOB WAS JUST STARTED
	// ELSEWHERE. A REACTIVE CALLER OPTS IN WITH syncChapter(id, { minIntervalMs }).)
	const inflightSync = new Map<number, Promise<void>>();
	// WHEN A syncChapter LAST FOUND THE CHAPTER NOT RUNNING (FOR THE OPT-IN COOLDOWN)
	const idleSyncAt = new Map<number, number>();
	// PER-CHAPTER GENERATION, BUMPED BY EVERY LOCAL OWNERSHIP CHANGE (NEW STREAM, CANCEL, CLEAR). AN ASYNC STATUS ANSWER
	// IS APPLIED ONLY IF THE GENERATION IT STARTED UNDER IS STILL CURRENT, SO A STALE /job CANNOT RESURRECT A CLEARED
	// CHAPTER OR CLOBBER A NEWER STREAM'S STATE.
	const generations = new Map<number, number>();
	// WARNINGS ALREADY TOASTED; THE SERVER REPLAYS PAST EVENTS ON EVERY (RE)CONNECT
	const shownWarnings = new Set<string>();

	function bumpGeneration(chapterId: number): void {
		generations.set(chapterId, (generations.get(chapterId) ?? 0) + 1);
		inflightSync.delete(chapterId);
		idleSyncAt.delete(chapterId);
	}

	// A CONTROLLER ONLY COUNTS AS A LIVE STREAM WHILE IT IS NOT ABORTED AND THE CHAPTER IS STILL RUNNING: ONE WHOSE
	// STREAM ALREADY DELIVERED A TERMINAL EVENT (done / paused / A CHAPTER ERROR) MUST NOT BLOCK A RE-ATTACH
	function hasLiveController(chapterId: number): boolean {
		const live = activeControllers.get(chapterId);
		if (!live || live.signal.aborted) return false;
		return get({ subscribe }).jobs[chapterId]?.running !== false;
	}

	function showWarningOnce(chapterId: number, event: SseEvent): void {
		if (!browser || !event.message) return;
		const message = String(event.message);
		const key = `${chapterId}:${event.timestamp ?? ''}:${message}`;
		if (shownWarnings.has(key)) return;
		shownWarnings.add(key);
		toast.warning(message, { id: `job-warning-${chapterId}-${message}`, duration: 10000 });
	}

	function isCurrent(chapterId: number, controller: AbortController): boolean {
		return activeControllers.get(chapterId) === controller;
	}

	function releaseIfCurrent(chapterId: number, controller: AbortController): void {
		if (activeControllers.get(chapterId) === controller) activeControllers.delete(chapterId);
	}

	function clearReconnectTimer(chapterId: number): void {
		const t = reconnectTimers.get(chapterId);
		if (t) clearTimeout(t);
		reconnectTimers.delete(chapterId);
	}

	function initChapterState(chapterId: number): ChapterJobState {
		return {
			chapterId,
			running: false,
			connectionState: 'idle',
			snapshot: null,
			lastError: null,
			reconnectAttempts: 0,
			statusMessage: null,
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
			const targetPageIds = Array.isArray(event.targetPageIds) ? (event.targetPageIds as number[]) : undefined;
			if (targetPageIds && targetPageIds.length > 0) {
				s.targetPageIds = targetPageIds;
				s.totalPages = targetPageIds.length;
			} else if (typeof event.totalPages === 'number') {
				s.totalPages = event.totalPages;
			}
			if (Array.isArray(event.pages) && event.pages.length > 0) {
				if (!targetPageIds || targetPageIds.length === 0) {
					s.totalPages = event.pages.length;
				}
				const targetSet = targetPageIds && targetPageIds.length > 0 ? new Set(targetPageIds) : null;
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
				if (targetSet) {
					s.completedPages = s.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
				} else {
					s.completedPages = s.pages.filter((p) => p.status === 'done').length;
				}
			} else {
				// A BARE start (A FORCED RE-RUN STILL WAITING FOR THE OLD RUN) CARRIES NO PAGE LIST: THE OLD RUN'S PAGE
				// STATES ARE NO LONGER TRUE, SO SHOW EVERY PAGE AS PENDING UNTIL THE NEW RUN REPORTS ITS OWN
				s.pages = s.pages.map((p) => {
					const reset: PageProgressState = {
						...p,
						status: 'pending',
						currentStep: undefined,
						timings: {},
						errorMessage: undefined,
						failedStep: undefined,
						retryAttempt: undefined,
						isRetrying: false,
						totalDurationMs: undefined,
					};
					delete (reset as any).previewStage;
					return reset;
				});
				s.completedAt = undefined;
				s.totalDurationMs = undefined;
			}
		} else if (event.type === 'phase-change' && typeof event.phase === 'string') {
			s.currentPhase = event.phase as any;
		} else if (event.type === 'page-added' && event.page !== undefined && event.pageId !== undefined) {
			// DYNAMICALLY INJECTED PAGE — ADD A SNAPSHOT SLOT BEFORE ANY STEP EVENTS ARRIVE.
			if (s.targetPageIds && s.targetPageIds.length > 0) {
				if (!s.targetPageIds.includes(event.pageId as number)) {
					s.targetPageIds.push(event.pageId as number);
				}
				s.totalPages = s.targetPageIds.length;
			}
			// If the page already has a slot (e.g. re-translating a 'done' page from the same job),
			// reset it to pending so it shows as processing again. Otherwise push a new slot.
			const existingSlotIdx = s.pages.findIndex((p) => p.pageId === (event.pageId as number));
			if (existingSlotIdx >= 0) {
				// Reset the existing slot - preserve the pageIndex so indexed events still resolve
				s.pages[existingSlotIdx] = {
					...s.pages[existingSlotIdx],
					status: 'pending',
					currentStep: undefined,
					timings: {},
					outputPath: undefined,
					cleanedPath: undefined,
					annotatedPath: undefined,
					errorMessage: undefined,
					failedStep: undefined,
				};
				delete (s.pages[existingSlotIdx] as any).previewStage;
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
				if (!s.targetPageIds || s.targetPageIds.length === 0) {
					s.totalPages = s.pages.length;
				}
			}
			if (s.targetPageIds && s.targetPageIds.length > 0) {
				const targetSet = new Set(s.targetPageIds);
				s.completedPages = s.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
			} else {
				s.completedPages = s.pages.filter((p) => p.status === 'done').length;
			}

		} else if (event.type === 'page-cancelled') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				p.status = 'skipped';
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
			if (s.targetPageIds && s.targetPageIds.length > 0) {
				s.targetPageIds = s.targetPageIds.filter((id) => id !== event.pageId);
				s.totalPages = s.targetPageIds.length;
				const targetSet = new Set(s.targetPageIds);
				s.completedPages = s.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
			} else {
				s.totalPages = Math.max(0, s.totalPages - 1);
				s.completedPages = s.pages.filter((p) => p.status === 'done').length;
			}
		} else if (event.type === 'page-step-start') {
			const step = event.step as PipelineStep;
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (step && p) {
				p.status = 'processing';
				p.currentStep = step;
				if (step === 'preprocess' || step === 'analyze') {
					p.outputPath = undefined;
					p.cleanedPath = undefined;
					p.annotatedPath = undefined;
					delete (p as any).previewStage;
				}
				const attempt = (event.retryAttempt as number | undefined) ?? ((event.stepDetails as any)?.retryAttempt as number | undefined);
				p.retryAttempt = attempt;
				p.isRetrying = typeof attempt === 'number' && attempt > 0;
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
		} else if (event.type === 'page-stage-update') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				if (event.stage === 'annotated') {
					if (typeof event.annotatedPath === 'string') p.annotatedPath = event.annotatedPath;
					if (typeof event.annotatedRev === 'number') p.annotatedRev = event.annotatedRev;
					(p as any).previewStage = 'annotated';
				} else if (event.stage === 'cleaned') {
					if (typeof event.cleanedPath === 'string') p.cleanedPath = event.cleanedPath;
					if (typeof event.cleanedRev === 'number') p.cleanedRev = event.cleanedRev;
					if (typeof event.annotatedPath === 'string') p.annotatedPath = event.annotatedPath;
					if (typeof event.annotatedRev === 'number') p.annotatedRev = event.annotatedRev;
					(p as any).previewStage = 'cleaned';
				}
			}
		} else if (event.type === 'page-done') {
			const p = findTargetPage(s.pages, event.page as number, event.pageId as number);
			if (p) {
				p.status = 'done';
				p.currentStep = 'done';
				if (typeof event.outputPath === 'string') p.outputPath = event.outputPath;
				p.annotatedPath = undefined;
				delete (p as any).previewStage;
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
				// CLOSE ANY LINGERING RUNNING STEP TIMINGS ON THIS PAGE
				for (const [step, t] of Object.entries(p.timings) as [PipelineStep, StepTiming | undefined][]) {
					if (t && t.status === 'running') {
						p.timings[step] = {
							...t,
							status: 'failed',
							completedAt: now,
							durationMs: t.startedAt ? Math.max(0, now - t.startedAt) : undefined,
							details: {
								...t.details,
								error: step === event.failedStep ? String(event.message || 'Error occurred') : 'Aborted',
							},
						};
					}
				}
				s.failedPages = s.pages.filter((p) => p.status === 'error').length;
			} else {
				// CHAPTER-LEVEL FATAL ERROR - CLOSE ANY REMAINING RUNNING STEP TIMINGS ACROSS ALL PAGES
				for (const page of s.pages) {
					if (page.status === 'processing') {
						page.status = 'error';
						page.currentStep = 'error';
						page.failedStep = event.failedStep as PipelineStep;
						page.errorMessage = String(event.message || 'Error occurred');
					}
					for (const [step, t] of Object.entries(page.timings) as [PipelineStep, StepTiming | undefined][]) {
						if (t && t.status === 'running') {
							page.timings[step] = {
								...t,
								status: 'failed',
								completedAt: now,
								durationMs: t.startedAt ? Math.max(0, now - t.startedAt) : undefined,
								details: {
									...t.details,
									error: step === event.failedStep ? String(event.message || 'Error occurred') : 'Aborted',
								},
							};
						}
					}
				}
				s.failedPages = s.pages.filter((p) => p.status === 'error').length;
			}
		} else if (event.type === 'usage' && event.usage) {
			const u = event.usage as any;
			s.totalPromptTokens += u.promptTokens || 0;
			s.totalCompletionTokens += u.completionTokens || 0;
		} else if (event.type === 'paused') {
			// THE BATCH WAS PAUSED: THE RUNNING PIPELINE WAS HALTED. RESET ANY IN-FLIGHT PAGES BACK TO
			// 'pending' AND CLEAR THEIR RUNNING STEP TIMINGS SO THE UI SHOWS THEM AS PAUSED/RESUMABLE
			// RATHER THAN 'failed' (ABORTING ON PAUSE MUST NOT LOOK LIKE A FAILURE).
			s.status = 'superseded';
			for (const p of s.pages) {
				if (p.status === 'processing') {
					p.status = 'pending';
					p.currentStep = undefined;
					p.timings = {};
				}
			}
		} else if (event.type === 'done') {
			if ((s.failedPages || 0) === 0) {
				s.status = 'done';
				s.currentPhase = 'completed';
			} else {
				s.status = 'failed';
			}
			// CLOSE ANY DANGLING RUNNING STEP TIMINGS ACROSS ALL PAGES
			for (const page of s.pages) {
				for (const [step, t] of Object.entries(page.timings) as [PipelineStep, StepTiming | undefined][]) {
					if (t && t.status === 'running') {
						page.timings[step] = {
							...t,
							status: 'failed',
							completedAt: now,
							durationMs: t.startedAt ? Math.max(0, now - t.startedAt) : undefined,
							details: {
								...t.details,
								error: 'Aborted',
							},
						};
					}
				}
			}
			s.completedAt = now;
			s.totalDurationMs = s.startedAt ? now - s.startedAt : 0;
			s.completedPages = s.pages.filter((p) => p.status === 'done').length;
		}

		return s;
	}

	type JobStatusResult = { running: boolean; snapshot: ChapterJobSnapshot };

	// HTTP ONLY: NO STORE WRITE, SO A CALLER CAN CHECK IT STILL OWNS THE CHAPTER BEFORE APPLYING THE ANSWER
	async function fetchJobSnapshot(chapterId: number): Promise<JobStatusResult | null> {
		if (!browser) return null;
		try {
			const res = await fetch(`/api/chapters/${chapterId}/job`);
			if (!res.ok) return null;
			const data = await res.json();
			return data.snapshot ? { running: Boolean(data.running), snapshot: data.snapshot } : null;
		} catch {
			return null;
		}
	}

	function applyJobStatus(chapterId: number, result: JobStatusResult | null): ChapterJobSnapshot | null {
		if (!result) return null;
		update((state) => {
			const existing = state.jobs[chapterId] || initChapterState(chapterId);
			return {
				...state,
				jobs: {
					...state.jobs,
					[chapterId]: {
						...existing,
						running: result.running,
						snapshot: result.snapshot,
						connectionState: result.running ? existing.connectionState : 'idle',
					},
				},
			};
		});
		return result.snapshot;
	}

	// AFTER A DROPPED STREAM (OR ONE THAT ENDED WITHOUT A FINAL EVENT): ASK THE SERVER, THEN RECONNECT WITH BACKOFF
	// WHILE THE JOB RUNS. NOTHING IS WRITTEN IF A NEWER STREAM, A CANCEL OR A CLEAR TOOK THE CHAPTER MEANWHILE.
	// RETURNS TRUE WHEN A RECONNECT WAS SCHEDULED (THE CONTROLLER KEEPS OWNING THE CHAPTER DURING THE BACKOFF).
	async function recoverAfterDrop(
		chapterId: number,
		controller: AbortController,
		reason: string,
		endedNormally: boolean,
	): Promise<boolean> {
		if (controller.signal.aborted || !isCurrent(chapterId, controller)) return false;
		const latest = await fetchJobSnapshot(chapterId);
		if (controller.signal.aborted || !isCurrent(chapterId, controller)) return false;
		applyJobStatus(chapterId, latest);
		const currentJob = get({ subscribe }).jobs[chapterId];

		if (latest && (latest.snapshot.status === 'running' || currentJob?.running)) {
			const attempts = (currentJob?.reconnectAttempts || 0) + 1;
			update((state) => ({
				...state,
				jobs: {
					...state.jobs,
					[chapterId]: {
						...(state.jobs[chapterId] || initChapterState(chapterId)),
						connectionState: 'reconnecting',
						reconnectAttempts: attempts,
						lastError: reason,
					},
				},
			}));

			// EXPONENTIAL BACKOFF RECONNECT (MAX 10S)
			const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
			const timer = setTimeout(() => {
				if (!isCurrent(chapterId, controller)) return;
				reconnectTimers.delete(chapterId);
				void connectStream(chapterId, { method: 'GET' });
			}, delay);
			reconnectTimers.set(chapterId, timer);
			return true;
		}

		update((state) => ({
			...state,
			jobs: {
				...state.jobs,
				[chapterId]: {
					...(state.jobs[chapterId] || initChapterState(chapterId)),
					running: false,
					// A STREAM THAT SIMPLY ENDED WHILE THE JOB IS NO LONGER RUNNING IS NOT AN ERROR
					connectionState: endedNormally ? 'idle' : 'error',
					reconnectAttempts: 0,
					lastError: endedNormally ? (state.jobs[chapterId]?.lastError ?? null) : reason || 'Job finished or failed',
				},
			},
		}));
		return false;
	}

	async function connectStream(
		chapterId: number,
		opts: { method?: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
	): Promise<void> {
		if (!browser) return;
		clearReconnectTimer(chapterId);
		bumpGeneration(chapterId);
		// CANCEL ANY EXISTING CONNECTION FOR THIS CHAPTER; THIS CONTROLLER NOW OWNS IT
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
						statusMessage: opts.method === 'POST' ? null : (existing.statusMessage ?? null),
						connectionState: existing.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
					},
				},
			};
		});

		let sawTerminal = false;
		let handedOff = false;
		try {
			try {
				await streamSse(
					`/api/chapters/${chapterId}/translate`,
					opts,
					(event) => {
						// A SUPERSEDED STREAM STOPS READING AND NEVER WRITES
						if (!isCurrent(chapterId, controller)) return 'stop';
						const isTerminal =
							event.type === 'done' ||
							event.type === 'paused' ||
							(event.type === 'error' && event.page === undefined);
						if (isTerminal) sawTerminal = true;
						// NON-FATAL: TELL THE USER ONCE PER EVENT (REPLAYS ARE DEDUPED), CHANGE NOTHING IN THE JOB STATE
						if (event.type === 'warning') showWarningOnce(chapterId, event);
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
							// A PHASE-LESS phase-change CARRIES A NOTICE (E.G. "Stopping previous run..."); ANY REAL
							// PROGRESS REPLACES IT
							let statusMessage = existing.statusMessage ?? null;
							if (event.type === 'phase-change' && typeof event.phase !== 'string' && event.message) {
								statusMessage = String(event.message);
							} else if (event.type === 'start') {
								if (Array.isArray(event.pages) && event.pages.length > 0) statusMessage = null;
							} else if (event.type !== 'warning' && event.type !== 'usage') {
								statusMessage = null;
							}

							return {
								...state,
								jobs: {
									...state.jobs,
									[chapterId]: {
										...existing,
										running: !isTerminal,
										connectionState: isTerminal ? 'idle' : 'connected',
										snapshot: updatedSnapshot,
										statusMessage,
										reconnectAttempts: 0,
										lastError:
											event.type === 'error' && event.page === undefined
												? String(event.message)
												: existing.lastError,
									},
								},
							};
						});
						// STOP READING AFTER A TERMINAL EVENT EVEN IF THE SERVER KEEPS THE STREAM OPEN, SO THE finally BELOW
						// RELEASES THE CONTROLLER AND A LATER RESUME CAN ATTACH A NEW STREAM
						if (isTerminal) return 'stop';
					},
					controller.signal,
				);
			} catch (err: any) {
				if (controller.signal.aborted) return;
				console.warn(`[jobTracker] SSE connection failed for chapter ${chapterId}:`, err);
				handedOff = await recoverAfterDrop(chapterId, controller, err?.message || 'Connection lost', false);
				return;
			}

			if (!isCurrent(chapterId, controller)) return;
			if (sawTerminal) {
				// STREAM COMPLETED NORMALLY WITH A FINAL EVENT
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
								statusMessage: null,
							},
						},
					};
				});
			} else {
				// THE STREAM ENDED WITHOUT done / paused / A CHAPTER ERROR (A PROXY CUT IT): RE-CHECK THE SERVER (P3)
				handedOff = await recoverAfterDrop(chapterId, controller, 'Stream ended before the job finished', true);
			}
		} finally {
			if (!handedOff) releaseIfCurrent(chapterId, controller);
		}
	}

	return {
		subscribe,

		// RESTORE / ATTACH STATE FOR A CHAPTER ON PAGE MOUNT
		// DEDUPED: A LIVE STREAM OR AN IN-FLIGHT SYNC MEANS NO NEW REQUEST (P4). minIntervalMs (OPT-IN, FOR REACTIVE
		// CALLERS THAT RE-FIRE ON EVERY STORE WRITE) SKIPS A NEW REQUEST THAT SOON AFTER A "NOT RUNNING" ANSWER.
		async syncChapter(chapterId: number, opts: { minIntervalMs?: number } = {}): Promise<void> {
			if (hasLiveController(chapterId)) return;
			const pending = inflightSync.get(chapterId);
			if (pending) return pending;
			if (opts.minIntervalMs) {
				const last = idleSyncAt.get(chapterId);
				if (last !== undefined && Date.now() - last < opts.minIntervalMs) return;
			}
			const gen = generations.get(chapterId) ?? 0;
			const run: Promise<void> = (async () => {
				const result = await fetchJobSnapshot(chapterId);
				// A NEWER STREAM, A CANCEL OR A CLEAR TOOK THE CHAPTER WHILE THE REQUEST WAS IN FLIGHT: ITS ANSWER IS STALE
				if ((generations.get(chapterId) ?? 0) !== gen) return;
				const snapshot = applyJobStatus(chapterId, result);
				if (snapshot && snapshot.status === 'running') {
					idleSyncAt.delete(chapterId);
					void connectStream(chapterId, { method: 'GET' });
				} else {
					idleSyncAt.set(chapterId, Date.now());
				}
			})().finally(() => {
				if (inflightSync.get(chapterId) === run) inflightSync.delete(chapterId);
			});
			inflightSync.set(chapterId, run);
			return run;
		},

		// TRIGGER TRANSLATION (ALL PENDING PAGES OR TARGETED PAGE IDS)
		async startTranslation(
			chapterId: number,
			opts: { force?: boolean; pageIds?: number[]; pageConcurrency?: number } = {},
		): Promise<void> {
			// A CHAPTER WAITING TO RECONNECT HAS NO STREAM TO REPORT A QUEUED PAGE: OPEN A FRESH ONE INSTEAD (connectStream
			// ALSO CLEARS THE PENDING RECONNECT). THE TIMER IS LEFT ALONE WHEN A LIVE STREAM ONLY GETS A PAGE QUEUED.
			const hasActiveStream = hasLiveController(chapterId) && !reconnectTimers.has(chapterId);
			const curSettings = get(settings);
			const reqBody = {
				force: opts.force ?? false,
				pageIds: opts.pageIds,
				inpaintMode: curSettings?.inpaintMode,
				enableWhiteInpaint: curSettings?.enableWhiteInpaint,
				inpaintExpansionPct: curSettings?.inpaintExpansionPct,
				enableTypesetCentering: curSettings?.enableTypesetCentering,
				pageConcurrency: opts.pageConcurrency ?? curSettings?.parallelProcesses,
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
				// THE RESPONSE IS A SECOND SSE STREAM OF THE SAME JOB; THE EXISTING STREAM ALREADY REPORTS IT (P5)
				await resp.body?.cancel().catch(() => {});
				return;
			}

			await connectStream(chapterId, {
				method: 'POST',
				body: reqBody,
			});
		},

		// CANCEL / ABORT ACTIVE TRANSLATION JOB
		async cancelTranslation(chapterId: number): Promise<void> {
			clearReconnectTimer(chapterId);
			bumpGeneration(chapterId);
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
							statusMessage: null,
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
							status: 'skipped' as const,
							currentStep: undefined,
							timings,
						};
					}
					return p;
				});

				const updatedTargetPageIds = existing.snapshot.targetPageIds
					? existing.snapshot.targetPageIds.filter((id) => id !== pageId)
					: undefined;
				const newTotalPages = updatedTargetPageIds
					? updatedTargetPageIds.length
					: Math.max(0, (existing.snapshot.totalPages || existing.snapshot.pages.length) - 1);
				const targetSet = updatedTargetPageIds ? new Set(updatedTargetPageIds) : null;
				const completedCount = updatedPages.filter((p) => (targetSet ? targetSet.has(p.pageId) : true) && p.status === 'done').length;

				return {
					...state,
					jobs: {
						...state.jobs,
						[chapterId]: {
							...existing,
							snapshot: {
								...existing.snapshot,
								targetPageIds: updatedTargetPageIds,
								totalPages: newTotalPages,
								completedPages: completedCount,
								pages: updatedPages,
							},
						},
					},
				};
			});
		},

		// CLEAR / RESET CHAPTER JOB STATE (E.G. ON CLEAR PROGRESS)
		clearJob(chapterId: number): void {
			clearReconnectTimer(chapterId);
			bumpGeneration(chapterId);
			activeControllers.get(chapterId)?.abort();
			activeControllers.delete(chapterId);

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
			clearReconnectTimer(chapterId);
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
