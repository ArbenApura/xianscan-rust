// START (OR ATTACH TO) A CHAPTER TRANSLATION JOB — RESPONDS WITH AN SSE STREAM OF JOB EVENTS.
//
// POST /api/chapters/[id]/translate  body: {"force": boolean}
// GET  /api/chapters/[id]/translate  (attaches to existing job stream)
//
// THE JOB IS DETACHED AND BUFFERED (translation-service) — A CLIENT DISCONNECT DOES NOT KILL IT,
// AND A (RE)CONNECTING CLIENT REPLAYS EVERYTHING SO FAR. THE STREAM CLOSES ON done/fatal error.
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { z } from 'zod';
// IMPORTED MODULES
import { assertChapterExists } from '$lib/server/chapters';
import { chapterWork } from '$lib/server/chapter-pipeline';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { getActiveProvider } from '$lib/server/providers';
import { DATA_ROOT } from '$lib/server/paths';
import { aiUsage } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { getChapterJob, startChapterJob, setChapterJobAddPage, isChapterPageCancelled, type JobHandle } from '$lib/server/translation-service';

import type { RequestHandler } from './$types';

const Body = z.object({
	force: z.boolean().default(false),
	pageIds: z.array(z.number().int().positive()).optional(),
	inpaintMode: z.string().optional(),
	pageConcurrency: z.number().int().min(1).max(16).optional(),
	typesetOptions: z
		.object({
			fontDialogue: z.string().optional(),
			fontCjk: z.string().optional(),
			boxInset: z.number().optional(),
			fontScale: z.number().optional(),
			outlineMode: z.enum(['none', 'thin', 'standard', 'heavy']).optional(),
			colorMode: z.enum(['auto', 'dark', 'light']).optional(),
			casing: z.enum(['uppercase', 'original', 'lowercase']).optional(),
			allCaps: z.boolean().optional(),
			enableRotation: z.boolean().optional(),
		})
		.optional(),
});

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

	const parsed = Body.safeParse(await request.json().catch(() => null));
	const force = parsed.success ? parsed.data.force : false;
	const pageIds = parsed.success ? parsed.data.pageIds : undefined;
	const inpaintMode = parsed.success && parsed.data.inpaintMode ? parsed.data.inpaintMode : cookies.get('mt_inpaint_mode') ?? 'patch';
	const pageConcurrency = parsed.success && typeof parsed.data.pageConcurrency === 'number'
		? Math.max(1, Math.min(16, parsed.data.pageConcurrency))
		: Math.max(1, Math.min(16, Number(cookies.get('mt_parallel_processes') ?? '3') || 3));

	const typesetOptions = {
		fontDialogue: parsed.success && parsed.data.typesetOptions?.fontDialogue
			? parsed.data.typesetOptions.fontDialogue
			: cookies.get('mt_ts_font'),
		fontCjk: parsed.success && parsed.data.typesetOptions?.fontCjk
			? parsed.data.typesetOptions.fontCjk
			: cookies.get('mt_ts_cjk_font'),
		boxInset: parsed.success && typeof parsed.data.typesetOptions?.boxInset === 'number'
			? parsed.data.typesetOptions.boxInset
			: cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : undefined,
		fontScale: parsed.success && typeof parsed.data.typesetOptions?.fontScale === 'number'
			? parsed.data.typesetOptions.fontScale
			: cookies.get('mt_ts_scale') ? Number(cookies.get('mt_ts_scale')) : undefined,
		outlineMode: parsed.success && parsed.data.typesetOptions?.outlineMode
			? parsed.data.typesetOptions.outlineMode
			: (cookies.get('mt_ts_outline') as any),
		colorMode: parsed.success && parsed.data.typesetOptions?.colorMode
			? parsed.data.typesetOptions.colorMode
			: (cookies.get('mt_ts_contrast') as any),
		casing: parsed.success && parsed.data.typesetOptions?.casing
			? parsed.data.typesetOptions.casing
			: (cookies.get('mt_ts_casing') as any),
		enableRotation: parsed.success && typeof parsed.data.typesetOptions?.enableRotation === 'boolean'
			? parsed.data.typesetOptions.enableRotation
			: cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : undefined,
	};

	// RECORD AI SPEND ON THE LEDGER (THE JOB STAYS DETACHED — FAILURES LOG, NOT THROW)
	const deps = {
		pipeline: createPipelineClient(),
		inpaintMode,
		pageConcurrency,
		typesetOptions,
		dataRoot: DATA_ROOT,
		// THE CACHE MUST NEVER MIX PROVIDERS: MOCK ↔ REAL SWITCHES PRODUCE A FRESH KEY
		cacheSalt: getActiveProvider().baseUrl,
		isPageCancelled: (pageId: number) => isChapterPageCancelled(chapterId, pageId),
		onUsage: (u: { model: string; promptTokens: number; cachedTokens: number; completionTokens: number; costUsd: number }) => {
			try {
				db.insert(aiUsage)
					.values({
						kind: 'translate',
						model: u.model,
						promptTokens: u.promptTokens,
						cachedTokens: u.cachedTokens,
						completionTokens: u.completionTokens,
						costUsd: u.costUsd,
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

