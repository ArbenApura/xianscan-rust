// CHAPTER JOB ORCHESTRATION — ADAPTED FROM xianslate's translation-service.ts (SAME JOB MAP +
// BUFFERED-EVENTS + SUPERSEDE PATTERN), BUT GENERIC: THE CALLER SUPPLIES THE ACTUAL WORK.
//
// CONTRACT (PINS THE SSE CONTRACT THE UI DEPENDS ON):
//   - ONE DETACHED JOB PER CHAPTER KEY; startChapterJob IS IDEMPOTENT (ATTACHES TO A RUNNING JOB).
//   - force: TRUE ABORTS THE RUNNING JOB AND STARTS FRESH (SUPERSEDE — THE READER RE-RAN).
//   - EVENTS ARE BUFFERED AND REPLAYED TO (RE)CONNECTING SUBSCRIBERS — SSE RESUMPTION FOR FREE.
//   - MAINTAINS A REAL-TIME AGGREGATED ChapterJobSnapshot + RECENT RETENTION BUFFER FOR REFRESHES.
//   - ABORT SIGNALS FLOW TO THE WORK FUNCTION VIA AbortController.
import type {
	ChapterJobSnapshot,
	PageProgressState,
	PipelinePhase,
	PipelineStep,
	StepTiming,
	TranslationUsage,
} from '$lib/types';

// -- TYPES -- //

export type JobStatus = 'running' | 'done' | 'failed' | 'superseded';

export type JobEventType =
	| 'start'
	| 'phase-change'
	| 'page-added'
	| 'page-cancelled'
	| 'page-step-start'
	| 'page-step-end'
	| 'term-extract-step'
	| 'page-done'
	| 'usage'
	| 'done'
	| 'error'
	| 'paused';

export interface JobEvent {
	type: JobEventType;
	chapterId?: number;
	/** 0-BASED PAGE INDEX (FOR progress DISPLAY) */
	page?: number;
	pageId?: number;
	seq?: number;
	pageCount?: number;
	totalPages?: number;
	targetPageIds?: number[];
	phase?: PipelinePhase;
	step?: PipelineStep;
	stepStatus?: StepTiming['status'];
	stepDetails?: StepTiming['details'];
	durationMs?: number;
	failedStep?: PipelineStep;
	outputPath?: string | null;
	cleanedRev?: number;
	outputRev?: number;
	usage?: TranslationUsage;
	message?: string;
	timestamp?: number;
	snapshot?: ChapterJobSnapshot;
	pages?: Array<{ id: number; seq: number; status: string; cleanedRev?: number; outputRev?: number }>;
}

export interface JobHandle {
	key: string;
	status: JobStatus;
	snapshot: ChapterJobSnapshot | null;
	/** SUBSCRIBE TO FUTURE EVENTS; IMMEDIATELY REPLAYS THE BUFFERED ONES. RETURNS AN UNSUBSCRIBE FN. */
	subscribe(fn: (e: JobEvent) => void): () => void;
	abort(): void;
	/** QUEUE ADDITIONAL PAGE IDS INTO THE RUNNING JOB (NO-OP IF JOB IS NOT RUNNING). */
	addPages(pageIds: number[]): void;
	/** CANCEL A SINGLE PAGE'S PROCESSING WITHOUT ABORTING THE REST OF THE JOB. */
	cancelPage(pageId: number): void;
}

export interface ChapterJobWork {
	(signal: AbortSignal, emit: (e: JobEvent) => void): Promise<void>;
}

// -- INTERNALS -- //

interface Job {
	key: string;
	chapterId: number;
	status: JobStatus;
	controller: AbortController;
	events: JobEvent[];
	listeners: Set<(e: JobEvent) => void>;
	snapshot: ChapterJobSnapshot;
	/** PAGES QUEUED WHILE THE JOB IS RUNNING — DRAINED BY THE PIPELINE VIA addPageToPool. */
	addPageToPool: ((pageId: number) => void) | null;
	/** QUEUED PAGE IDS ARRIVING BEFORE addPageToPool HAS REGISTERED */
	pendingAddQueue: number[];
	/** PAGE IDS THAT HAVE BEEN INDIVIDUALLY CANCELLED — CHECKED BY THE PIPELINE BEFORE EACH STEP. */
	cancelledPages: Set<number>;
}

// PROCESS-WIDE JOB REGISTRY — ONE JOB PER CHAPTER (SINGLE-INSTANCE APP).
const jobs = new Map<string, Job>();

// RETENTION BUFFER FOR COMPLETED / RECENT JOBS (10 MINUTE TTL)
// ALLOWS CLIENT REFRESH / PAGE NAVIGATION TO FETCH THE FINAL REPORT EVEN AFTER STREAM CLOSES.
const RETENTION_TTL_MS = 10 * 60 * 1000;
interface RetainedSnapshot {
	snapshot: ChapterJobSnapshot;
	expiresAt: number;
}
const retainedSnapshots = new Map<string, RetainedSnapshot>();

function pruneRetained(): void {
	const now = Date.now();
	for (const [key, item] of retainedSnapshots) {
		if (item.expiresAt <= now) retainedSnapshots.delete(key);
	}
}

// PERIODIC BACKGROUND PRUNER (UNREF'D SO IT DOES NOT HOLD THE PROCESS OPEN)
if (typeof setInterval !== 'undefined') {
	const pruneInterval = setInterval(pruneRetained, 60_000);
	if (pruneInterval.unref) pruneInterval.unref();
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

function updateSnapshot(snapshot: ChapterJobSnapshot, event: JobEvent): void {
	const now = event.timestamp ?? Date.now();

	if (event.type === 'start') {
		snapshot.startedAt = now;
		snapshot.status = 'running';
		if (event.targetPageIds && event.targetPageIds.length > 0) {
			snapshot.targetPageIds = event.targetPageIds;
			snapshot.totalPages = event.targetPageIds.length;
		} else if (event.totalPages !== undefined) {
			snapshot.totalPages = event.totalPages;
		}
		if (event.pages && event.pages.length > 0) {
			if (!event.targetPageIds || event.targetPageIds.length === 0) {
				snapshot.totalPages = event.pages.length;
			}
			const targetSet = event.targetPageIds && event.targetPageIds.length > 0 ? new Set(event.targetPageIds) : null;
			snapshot.pages = event.pages.map((p, idx) => ({
				pageIndex: idx,
				pageId: p.id,
				seq: p.seq,
				status: (p.status as PageProgressState['status']) || 'pending',
				timings: {},
				cleanedRev: p.cleanedRev,
				outputRev: p.outputRev,
			}));
			if (targetSet) {
				snapshot.completedPages = snapshot.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
			} else {
				snapshot.completedPages = snapshot.pages.filter((p) => p.status === 'done').length;
			}
		}
	} else if (event.type === 'phase-change' && event.phase) {
		snapshot.currentPhase = event.phase;
	} else if (event.type === 'page-added' && event.page !== undefined && event.pageId !== undefined) {
		// DYNAMICALLY INJECTED PAGE — ADD OR RESET A SLOT SO ALL SUBSEQUENT INDEXED EVENTS RESOLVE.
		if (snapshot.targetPageIds && snapshot.targetPageIds.length > 0) {
			if (!snapshot.targetPageIds.includes(event.pageId)) {
				snapshot.targetPageIds.push(event.pageId);
			}
			snapshot.totalPages = snapshot.targetPageIds.length;
		}
		const existingIdx = snapshot.pages.findIndex((p) => p.pageId === event.pageId);
		if (existingIdx >= 0) {
			// RE-TRANSLATE CASE: reset the existing slot to pending
			snapshot.pages[existingIdx] = {
				...snapshot.pages[existingIdx],
				status: 'pending',
				currentStep: undefined,
				timings: {},
				outputPath: undefined,
				errorMessage: undefined,
				failedStep: undefined,
			};
		} else {
			// NEW INJECT CASE: push a fresh slot so the page index resolves
			snapshot.pages.push({
				pageIndex: event.page,
				pageId: event.pageId,
				seq: event.seq ?? 0,
				status: 'pending',
				timings: {},
			});
			if (!snapshot.targetPageIds || snapshot.targetPageIds.length === 0) {
				snapshot.totalPages = snapshot.pages.length;
			}
		}
		if (snapshot.targetPageIds && snapshot.targetPageIds.length > 0) {
			const targetSet = new Set(snapshot.targetPageIds);
			snapshot.completedPages = snapshot.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
		} else {
			snapshot.completedPages = snapshot.pages.filter((p) => p.status === 'done').length;
		}

	} else if (event.type === 'page-cancelled') {
		const p = findTargetPage(snapshot.pages, event.page, event.pageId);
		if (p) {
			p.status = 'skipped';
			p.currentStep = undefined;
			for (const [step, t] of Object.entries(p.timings)) {
				if (t && t.status === 'running') {
					p.timings[step as PipelineStep] = {
						...t,
						status: 'failed',
						details: { ...t.details, error: 'Cancelled' },
					};
				}
			}
		}
		if (snapshot.targetPageIds && snapshot.targetPageIds.length > 0) {
			snapshot.targetPageIds = snapshot.targetPageIds.filter((id) => id !== event.pageId);
			snapshot.totalPages = snapshot.targetPageIds.length;
			const targetSet = new Set(snapshot.targetPageIds);
			snapshot.completedPages = snapshot.pages.filter((p) => targetSet.has(p.pageId) && p.status === 'done').length;
		} else {
			snapshot.totalPages = Math.max(0, snapshot.totalPages - 1);
			snapshot.completedPages = snapshot.pages.filter((p) => p.status === 'done').length;
		}
	} else if (event.type === 'page-step-start') {
		const step = event.step;
		const p = findTargetPage(snapshot.pages, event.page, event.pageId);
		if (step && p) {
			p.status = 'processing';
			p.currentStep = step;
			p.timings[step] = {
				step,
				status: 'running',
				startedAt: now,
				details: event.stepDetails,
			};
		}
	} else if (event.type === 'page-step-end') {
		const step = event.step;
		const p = findTargetPage(snapshot.pages, event.page, event.pageId);
		if (step && p) {
			const timing = p.timings[step] ?? { step, status: 'completed' };
			timing.status = event.stepStatus ?? 'completed';
			timing.completedAt = now;
			timing.durationMs = typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
				? event.durationMs
				: timing.startedAt
					? Math.max(0, now - timing.startedAt)
					: undefined;
			if (event.stepDetails) {
				timing.details = { ...timing.details, ...event.stepDetails };
				if (event.stepDetails.cacheHit) snapshot.cacheHitCount++;
			}
			p.timings[step] = timing;
		}
	} else if (event.type === 'term-extract-step') {
		if (!snapshot.phase2Stats) snapshot.phase2Stats = {};
		if (event.durationMs !== undefined) snapshot.phase2Stats.durationMs = event.durationMs;
		if (event.stepDetails?.tokens !== undefined || event.stepDetails?.regionsCount !== undefined) {
			snapshot.phase2Stats.termCount = event.stepDetails?.regionsCount ?? snapshot.phase2Stats.termCount;
		}
	} else if (event.type === 'page-done') {
		const p = findTargetPage(snapshot.pages, event.page, event.pageId);
		if (p) {
			p.status = 'done';
			p.currentStep = 'done';
			p.outputPath = event.outputPath ?? p.outputPath;
			if (event.cleanedRev !== undefined) p.cleanedRev = event.cleanedRev;
			if (event.outputRev !== undefined) p.outputRev = event.outputRev;
			if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) {
				p.totalDurationMs = event.durationMs;
			}
		}
		snapshot.completedPages = snapshot.pages.filter((p) => p.status === 'done').length;
	} else if (event.type === 'error') {
		const p = findTargetPage(snapshot.pages, event.page, event.pageId);
		if (p) {
			p.status = 'error';
			p.currentStep = 'error';
			p.failedStep = event.failedStep;
			p.errorMessage = event.message;
			snapshot.failedPages = snapshot.pages.filter((p) => p.status === 'error').length;
		}
	} else if (event.type === 'usage' && event.usage) {
		snapshot.totalPromptTokens += event.usage.promptTokens ?? 0;
		snapshot.totalCompletionTokens += event.usage.completionTokens ?? 0;
	} else if (event.type === 'done') {
		snapshot.status = 'done';
		snapshot.currentPhase = 'completed';
		snapshot.completedAt = now;
		snapshot.totalDurationMs = now - snapshot.startedAt;
		snapshot.completedPages = snapshot.pages.filter((p) => p.status === 'done').length;
	}
}

function emit(job: Job, event: JobEvent): void {
	if (!event.timestamp) event.timestamp = Date.now();
	if (!event.chapterId) event.chapterId = job.chapterId;
	updateSnapshot(job.snapshot, event);
	job.events.push(event);
	for (const fn of job.listeners) fn(event);
}

async function run(key: string, chapterId: number, work: ChapterJobWork, initial: JobEvent[]): Promise<void> {
	const job = jobs.get(key);
	if (!job) return;
	for (const e of initial) emit(job, e);
	try {
		await work(job.controller.signal, (e) => emit(job, e));
		if (job.status === 'running') {
			job.status = 'done';
			emit(job, { type: 'done', chapterId });
		}
	} catch (e) {
		if (job.status !== 'superseded') {
			job.status = 'failed';
			job.snapshot.status = 'failed';
			emit(job, { type: 'error', chapterId, message: e instanceof Error ? e.message : String(e) });
		}
	} finally {
		// PRESERVE SNAPSHOT IN RETENTION BUFFER BEFORE REMOVING ACTIVE JOB
		pruneRetained();
		retainedSnapshots.set(key, {
			snapshot: JSON.parse(JSON.stringify(job.snapshot)),
			expiresAt: Date.now() + RETENTION_TTL_MS,
		});
		job.listeners.clear();
		// ONLY DELETE OUR OWN ENTRY — A SUPERSEDING JOB MAY HAVE BEEN REGISTERED AT THIS KEY
		// (startChapterJob → existing.controller.abort()), AND WE MUST NOT ORPHAN THE NEW RUN.
		if (jobs.get(key) === job) {
			jobs.delete(key);
		}
	}
}

// -- PUBLIC API -- //

export function startChapterJob(chapterId: number, work: ChapterJobWork, opts: { force?: boolean } = {}): JobHandle {
	const key = `chapter:${chapterId}`;
	const existing = jobs.get(key);
	if (existing && existing.status === 'running' && !existing.controller.signal.aborted) {
		if (!opts.force) return toHandle(existing);
		// SUPERSEDE — THE NEW RUN REPLACES THE OLD ONE
		existing.status = 'superseded';
		existing.snapshot.status = 'superseded';
		existing.controller.abort();
	}

	const initialSnapshot: ChapterJobSnapshot = {
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

	const job: Job = {
		key,
		chapterId,
		status: 'running',
		controller: new AbortController(),
		events: [],
		listeners: new Set(),
		snapshot: initialSnapshot,
		addPageToPool: null,
		pendingAddQueue: [],
		cancelledPages: new Set(),
	};

	retainedSnapshots.delete(key);
	jobs.set(key, job);
	void run(key, chapterId, work, [{ type: 'start', chapterId }]);
	return toHandle(job);
}

export function getChapterJob(chapterId: number): JobHandle | null {
	const job = jobs.get(`chapter:${chapterId}`);
	return job ? toHandle(job) : null;
}

/** REGISTER THE PIPELINE'S addPage CALLBACK ON THE ACTIVE JOB SO CONCURRENT TRANSLATE REQUESTS
 *  CAN INJECT NEW PAGES INTO THE RUNNING PQUEUE WITHOUT SUPERSEDING THE JOB. */
export function setChapterJobAddPage(chapterId: number, fn: (pageId: number) => void): void {
	const job = jobs.get(`chapter:${chapterId}`);
	if (job) {
		job.addPageToPool = fn;
		while (job.pendingAddQueue.length > 0) {
			const id = job.pendingAddQueue.shift()!;
			fn(id);
		}
	}
}



export function abortChapterJob(chapterId: number): boolean {
	const job = jobs.get(`chapter:${chapterId}`);
	if (job) {
		const now = Date.now();
		job.status = 'superseded';
		job.snapshot.status = 'superseded';
		job.snapshot.completedAt = now;
		job.snapshot.totalDurationMs = job.snapshot.startedAt ? now - job.snapshot.startedAt : 0;
		if (job.snapshot.pages) {
			for (const p of job.snapshot.pages) {
				if (p.status === 'processing') {
					p.status = 'pending';
					p.currentStep = undefined;
					for (const t of Object.values(p.timings)) {
						if (t && t.status === 'running') {
							t.status = 'failed';
							t.details = { ...t.details, error: 'Cancelled' };
						}
					}
				}
			}
		}
		emit(job, { type: 'error', chapterId, message: 'Translation cancelled.' });
		job.controller.abort();
		return true;
	}
	return false;
}

/** ABORT A CHAPTER JOB FOR A PAUSE — STOPS THE PIPELINE BUT LEAVES PAGES IN A RESUMABLE 'pending'
 *  STATE: NO 'failed' TIMINGS AND NO CHAPTER-LEVEL 'error' EVENT, SO A RESUME RE-RUNS THEM CLEANLY
 *  WITHOUT THE UI EVER SHOWING THE IN-FLIGHT STEP AS FAILED. */
export function pauseChapterJob(chapterId: number): boolean {
	const job = jobs.get(`chapter:${chapterId}`);
	if (!job) return false;
	const now = Date.now();
	job.status = 'superseded';
	job.snapshot.status = 'superseded';
	job.snapshot.completedAt = now;
	job.snapshot.totalDurationMs = job.snapshot.startedAt ? now - job.snapshot.startedAt : 0;
	if (job.snapshot.pages) {
		for (const p of job.snapshot.pages) {
			if (p.status === 'processing') {
				p.status = 'pending';
				p.currentStep = undefined;
				p.timings = {};
			}
		}
	}
	emit(job, { type: 'paused', chapterId });
	job.controller.abort();
	return true;
}

export function clearChapterJob(chapterId: number): void {
	const key = `chapter:${chapterId}`;
	const active = jobs.get(key);
	if (active) {
		active.controller.abort();
		active.listeners.clear();
		jobs.delete(key);
	}
	retainedSnapshots.delete(key);
}

export function getChapterJobSnapshot(chapterId: number): ChapterJobSnapshot | null {
	const key = `chapter:${chapterId}`;
	const active = jobs.get(key);
	if (active) return JSON.parse(JSON.stringify(active.snapshot)) as ChapterJobSnapshot;
	pruneRetained();
	const retained = retainedSnapshots.get(key);
	if (retained) return JSON.parse(JSON.stringify(retained.snapshot)) as ChapterJobSnapshot;
	return null;
}

function toHandle(job: Job): JobHandle {
	return {
		key: job.key,
		// A GETTER — THE STATUS MUST REFLECT THE LIVE JOB, NOT THE VALUE AT HANDLE-CREATION TIME
		get status() {
			return job.status;
		},
		get snapshot() {
			return JSON.parse(JSON.stringify(job.snapshot)) as ChapterJobSnapshot;
		},
		subscribe(fn) {
			job.listeners.add(fn);
			// REPLAY THE BUFFER — A (RE)CONNECTING SSE CLIENT SEES EVERYTHING THAT HAPPENED SO FAR
			for (const e of job.events) fn(e);
			return () => job.listeners.delete(fn);
		},
		abort() {
			job.controller.abort();
		},
		addPages(pageIds: number[]) {
			if (job.status !== 'running') return;
			for (const id of pageIds) {
				job.cancelledPages.delete(id);
				if (job.addPageToPool) {
					job.addPageToPool(id);
				} else {
					job.pendingAddQueue.push(id);
				}
			}
		},
		cancelPage(pageId: number) {
			if (job.status !== 'running') return;
			job.cancelledPages.add(pageId);
			const pageIdx = job.snapshot.pages.findIndex((p) => p.pageId === pageId);
			if (pageIdx >= 0) {
				emit(job, {
					type: 'page-cancelled',
					chapterId: job.chapterId,
					page: pageIdx,
					pageId,
				});
			}
		},
	};
}

/** CHECK IF A SPECIFIC PAGE IN A CHAPTER JOB HAS BEEN CANCELLED. */
export function isChapterPageCancelled(chapterId: number, pageId: number): boolean {
	const job = jobs.get(`chapter:${chapterId}`);
	return Boolean(job?.cancelledPages.has(pageId));
}

/** CANCEL A SINGLE PAGE'S PROCESSING WITHOUT KILLING THE WHOLE CHAPTER JOB (OR TERMINATE JOB IF NO REMAINING PAGES). */
export function cancelChapterPage(chapterId: number, pageId: number): boolean {
	const job = jobs.get(`chapter:${chapterId}`);
	if (!job || job.status !== 'running') return false;
	job.cancelledPages.add(pageId);
	const pageIdx = job.snapshot.pages.findIndex((p) => p.pageId === pageId);
	if (pageIdx >= 0) {
		emit(job, {
			type: 'page-cancelled',
			chapterId,
			page: pageIdx,
			pageId,
		});
	}

	// CHECK IF ANY TARGETED / ACTIVE PAGES ARE STILL PROCESSING OR PENDING
	const targetSet = job.snapshot.targetPageIds && job.snapshot.targetPageIds.length > 0
		? new Set(job.snapshot.targetPageIds)
		: null;
	const hasRemainingWork = job.snapshot.pages.some((p) => {
		if (targetSet && !targetSet.has(p.pageId)) return false;
		if (job.cancelledPages.has(p.pageId)) return false;
		return p.status === 'processing' || p.status === 'pending';
	});

	if (!hasRemainingWork) {
		// ALL TARGET PAGES CANCELLED — ABORT IN-FLIGHT PIPELINE TO FINISH CHAPTER IMMEDIATELY
		abortChapterJob(chapterId);
	}
	return true;
}
