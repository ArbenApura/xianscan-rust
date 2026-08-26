// START (OR ATTACH TO) A CHAPTER TRANSLATION JOB — RESPONDS WITH AN SSE STREAM OF JOB EVENTS.
//
// POST /api/chapters/[id]/translate  body: {"force": boolean}
// GET  /api/chapters/[id]/translate  (attaches to existing job stream)
//
// THE JOB IS DETACHED AND BUFFERED (translation-service) — A CLIENT DISCONNECT DOES NOT KILL IT,
// AND A (RE)CONNECTING CLIENT REPLAYS EVERYTHING SO FAR. THE STREAM CLOSES ON done/fatal error.
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
// IMPORTED MODULES
import { assertChapterExists } from '$lib/server/chapters';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { getActiveProvider } from '$lib/server/providers';
import { DATA_ROOT } from '$lib/server/paths';
import { aiUsage } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { getChapterJob, startChapterJob, setChapterJobAddPage, isChapterPageCancelled, type JobHandle } from '$lib/server/translation-service';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { translateChapterSchema } from '$lib/schemas';

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

			unsubscribe = handle.subscribe((e) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
				} catch {
					// Controller already closed by client termination
					close();
					return;
				}
				// ONLY CLOSE ON CHAPTER-LEVEL TERMINAL EVENTS (NOT PER-PAGE ERRORS)
				if (e.type === 'done' || (e.type === 'error' && e.page === undefined)) {
					close();
				}
			});
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
	const pageConcurrency = parsed.success && typeof parsed.data.pageConcurrency === 'number'
		? Math.max(1, Math.min(16, parsed.data.pageConcurrency))
		: Math.max(1, Math.min(16, Number(cookies.get('mt_parallel_processes')) || canonical.parallelProcesses || 2));

	const typesetOptions = {
		fontDialogue: parsed.success && parsed.data.typesetOptions?.fontDialogue
			? parsed.data.typesetOptions.fontDialogue
			: (cookies.get('mt_ts_font') || canonical.typesetFont || 'CC Wild Words'),
		fontCjk: parsed.success && parsed.data.typesetOptions?.fontCjk
			? parsed.data.typesetOptions.fontCjk
			: (cookies.get('mt_ts_cjk_font') || canonical.typesetCjkFont || 'Friendly Sans'),
		boxInset: parsed.success && typeof parsed.data.typesetOptions?.boxInset === 'number'
			? parsed.data.typesetOptions.boxInset
			: (cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : canonical.typesetPadding ?? 0.05),
		outlineMode: parsed.success && parsed.data.typesetOptions?.outlineMode
			? parsed.data.typesetOptions.outlineMode
			: ((cookies.get('mt_ts_outline') as any) || canonical.typesetOutline || 'standard'),
		colorMode: parsed.success && parsed.data.typesetOptions?.colorMode
			? parsed.data.typesetOptions.colorMode
			: ((cookies.get('mt_ts_contrast') as any) || canonical.typesetContrast || 'auto'),
		casing: parsed.success && parsed.data.typesetOptions?.casing
			? parsed.data.typesetOptions.casing
			: ((cookies.get('mt_ts_casing') as any) || canonical.typesetCasing || 'uppercase'),
		enableRotation: parsed.success && typeof parsed.data.typesetOptions?.enableRotation === 'boolean'
			? parsed.data.typesetOptions.enableRotation
			: (cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : (canonical.enableTextRotation ?? true)),
	};

	const inpaintExpansionPct = parsed.success && typeof parsed.data.inpaintExpansionPct === 'number'
		? parsed.data.inpaintExpansionPct
		: (cookies.get('mt_inpaint_exp') ? Number(cookies.get('mt_inpaint_exp')) : canonical.inpaintExpansionPct ?? 0.03);
	const typesetExpansionPct = parsed.success && typeof parsed.data.typesetExpansionPct === 'number'
		? parsed.data.typesetExpansionPct
		: (cookies.get('mt_typeset_exp') ? Number(cookies.get('mt_typeset_exp')) : canonical.typesetExpansionPct ?? 0.06);
	const enableWatermarkInpaint = parsed.success && typeof parsed.data.enableWatermarkInpaint === 'boolean'
		? parsed.data.enableWatermarkInpaint
		: (cookies.get('mt_watermark_inpaint') ? cookies.get('mt_watermark_inpaint') === 'true' : (canonical.enableWatermarkInpaint ?? false));
	const enableSfx = parsed.success && typeof parsed.data.enableSfx === 'boolean'
		? parsed.data.enableSfx
		: (cookies.get('mt_enable_sfx') ? cookies.get('mt_enable_sfx') === 'true' : (canonical.enableSfx ?? false));
	const sfxMaxAreaPct = parsed.success && typeof parsed.data.sfxMaxAreaPct === 'number'
		? parsed.data.sfxMaxAreaPct
		: (cookies.get('mt_sfx_max_area') ? Number(cookies.get('mt_sfx_max_area')) : canonical.sfxMaxAreaPct ?? 0.10);

	// RECORD AI SPEND ON THE LEDGER (THE JOB STAYS DETACHED — FAILURES LOG, NOT THROW)
	const deps = {
		pipeline: createPipelineClient(),
		inpaintMode,
		inpaintExpansionPct,
		typesetExpansionPct,
		enableWatermarkInpaint,
		enableSfx,
		sfxMaxAreaPct,
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

