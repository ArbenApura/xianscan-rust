// START (OR ATTACH TO) A CHAPTER TRANSLATION JOB — RESPONDS WITH AN SSE STREAM OF JOB EVENTS.
//
// POST /api/chapters/[id]/translate  body: {"force": boolean}
// GET  /api/chapters/[id]/translate  (attaches to existing job stream)
//
// THE JOB IS DETACHED AND BUFFERED (translation-service) — A CLIENT DISCONNECT DOES NOT KILL IT,
// AND A (RE)CONNECTING CLIENT REPLAYS EVERYTHING SO FAR. THE STREAM CLOSES ON done / paused / fatal error, AND
// WHEN THE JOB DROPS ITS READERS (SUPERSEDED, CLEARED).
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertChapterExists } from '$lib/server/chapters';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { getActiveProvider } from '$lib/server/providers';
import { DATA_ROOT } from '$lib/server/paths';
import { aiUsage } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { getChapterJob, startChapterJob, setChapterJobAddPage, abortChapterJob, isChapterPageCancelled, type JobHandle } from '$lib/server/translation-service';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { buildTypesetOptions } from '$lib/server/typeset/options';
import { translateChapterSchema } from '$lib/schemas';
import { WHITE_INPAINT_COOKIE, INPAINT_EXPANSION_COOKIE, TYPESET_CENTERING_COOKIE } from '$lib/stores/settings';

import type { RequestHandler } from './$types';

function createSseStream(handle: JobHandle): Response {
	let unsubscribe: () => void = () => {};
	let closed = false;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const close = () => {
				if (closed) return;
				closed = true;
				unsubscribe();
				try {
					controller.close();
				} catch {
					// ALREADY CLOSED BY THE CLIENT (cancel) — FINE
				}
			};

			unsubscribe = handle.subscribe(
				(e) => {
					if (closed) return;
					try {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
					} catch {
						// Controller already closed by client termination
						close();
						return;
					}
					// ONLY CLOSE ON CHAPTER-LEVEL TERMINAL EVENTS (NOT PER-PAGE ERRORS). A PAUSE IS TERMINAL TOO: THE
					// PAUSED RUN NEVER EMITS AGAIN, AND A RESUME STARTS A NEW JOB THE CLIENT MUST ATTACH TO.
					if (e.type === 'done' || e.type === 'paused' || (e.type === 'error' && e.page === undefined)) {
						close();
					}
				},
				// THE JOB DROPPED ITS READERS WITHOUT A TERMINAL EVENT (SUPERSEDED, CLEARED, SETTLED): CLOSE SO THE
				// CLIENT RE-CHECKS /job INSTEAD OF WAITING ON A DEAD STREAM
				close,
			);
			// A TERMINAL EVENT IN THE REPLAY CLOSED THE STREAM BEFORE subscribe RETURNED ITS UNSUBSCRIBE
			if (closed) unsubscribe();
		},
		cancel() {
			closed = true;
			unsubscribe();
			// CLIENT DISCONNECTED — THE DETACHED JOB KEEPS RUNNING (BUFFERED EVENTS FOR THE NEXT READER)
		},
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no',
		},
	});
}

export const GET: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const handle = getChapterJob(chapterId);
	if (!handle) {
		throw error(404, 'No active translation job found for this chapter.');
	}

	return createSseStream(handle);
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	const canonical = getCanonicalSettings();
	const parsed = translateChapterSchema.safeParse(await request.json().catch(() => null));
	const force = parsed.success ? parsed.data.force : false;
	const pageIds = parsed.success ? parsed.data.pageIds : undefined;
	const inpaintMode = parsed.success && parsed.data.inpaintMode
		? parsed.data.inpaintMode
		: cookies.get('mt_inpaint_mode') ?? canonical.inpaintMode ?? 'patch';
	const enableWhiteInpaint = parsed.success && typeof parsed.data.enableWhiteInpaint === 'boolean'
		? parsed.data.enableWhiteInpaint
		: (cookies.get(WHITE_INPAINT_COOKIE) ? cookies.get(WHITE_INPAINT_COOKIE) === 'true' : (canonical.enableWhiteInpaint ?? true));
	const inpaintExpansionPct = parsed.success && typeof parsed.data.inpaintExpansionPct === 'number'
		? parsed.data.inpaintExpansionPct
		: (cookies.get(INPAINT_EXPANSION_COOKIE) ? Number(cookies.get(INPAINT_EXPANSION_COOKIE)) : (canonical.inpaintExpansionPct ?? 0.03));
	const enableTypesetCentering = parsed.success && typeof parsed.data.enableTypesetCentering === 'boolean'
		? parsed.data.enableTypesetCentering
		: (cookies.get(TYPESET_CENTERING_COOKIE) ? cookies.get(TYPESET_CENTERING_COOKIE) === 'true' : (canonical.enableTypesetCentering ?? true));
	const pageConcurrency = parsed.success && typeof parsed.data.pageConcurrency === 'number'
		? Math.max(1, Math.min(16, parsed.data.pageConcurrency))
		: Math.max(1, Math.min(16, Number(cookies.get('mt_parallel_processes')) || canonical.parallelProcesses || 2));

	const typesetOptions = buildTypesetOptions({
		canonical,
		cookies,
		userOpts: parsed.success ? parsed.data.typesetOptions : undefined,
	});

	// RECORD AI SPEND ON THE LEDGER (THE JOB STAYS DETACHED — FAILURES LOG, NOT THROW)
	const deps = {
		pipeline: createPipelineClient(),
		inpaintMode,
		enableWhiteInpaint,
		inpaintExpansionPct,
		enableTypesetCentering,
		pageConcurrency,
		typesetOptions,
		dataRoot: DATA_ROOT,
		// THE CACHE MUST NEVER MIX PROVIDERS: MOCK ↔ REAL SWITCHES PRODUCE A FRESH KEY
		cacheSalt: getActiveProvider().baseUrl,
		isPageCancelled: (pageId: number) => isChapterPageCancelled(chapterId, pageId),
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
				// NEVER LET LEDGER FAILURES TAKE DOWN THE JOB
			}
		},
	};

	const existingHandle = getChapterJob(chapterId);

	// IF A JOB IS ALREADY RUNNING AND WE'RE NOT FORCING A SUPERSEDE, ADD THE NEW PAGES TO
	// THE LIVE POOL INSTEAD OF ABORTING THE RUNNING JOB.
	if (existingHandle && existingHandle.status === 'running' && !force) {
		if (pageIds && pageIds.length > 0) {
			existingHandle.addPages(pageIds);
		}
		return createSseStream(existingHandle);
	}

	const handle = startChapterJob(
		chapterId,
		chapterWork(chapterId, deps, pageIds, (registerFn) => {
			// WIRE THE PIPELINE'S addPage CALLBACK INTO THE JOB SO CONCURRENT REQUESTS CAN
			// INJECT PAGES INTO THE RUNNING PQUEUE WITHOUT SUPERSEDING THE JOB.
			setChapterJobAddPage(chapterId, registerFn);
		}),
		{ force },
	);
	return createSseStream(handle);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);
	const stopped = abortChapterJob(chapterId);
	return json({ success: true, stopped });
};

