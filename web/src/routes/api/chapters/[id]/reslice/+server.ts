// STREAMING SSE ROUTE TO SMART RE-SLICE A CHAPTER'S PAGES.
import { error } from '@sveltejs/kit';
import { assertChapterExists, resliceChapterPages } from '$lib/server/chapters';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { resliceChapterSchema } from '$lib/schemas';
import { DATA_ROOT } from '$lib/server/paths';
import { syncBus } from '$lib/server/sync-bus';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	await assertChapterExists(chapterId);

	// OPTIONAL PAGE-HEIGHT PRESET FROM THE UI — FALLS BACK TO DEFAULTS IN reslice.ts
	const parsed = resliceChapterSchema.safeParse(await request.json().catch(() => null));
	const heightOpts = parsed.success
		? {
				targetHeight: parsed.data.targetHeight,
				minHeight: parsed.data.minHeight,
				maxHeight: parsed.data.maxHeight,
			}
		: undefined;

	const pipelineClient = createPipelineClient();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const emit = (event: Record<string, unknown>) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// Controller already closed
				}
			};

			const close = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// Already closed
				}
			};

			(async () => {
				try {
					emit({ type: 'start', chapterId });
					syncBus.broadcast({ type: 'chapter-reslicing', chapterId, step: 'start', message: 'Starting smart re-slice...', pct: 0 });
					const result = await resliceChapterPages(
						chapterId,
						pipelineClient,
						(step, message, pct) => {
							emit({ type: 'progress', step, message, pct });
							syncBus.broadcast({ type: 'chapter-reslicing', chapterId, step, message, pct });
						},
						request.signal,
						DATA_ROOT,
						heightOpts,
					);
					emit({
						type: 'done',
						originalCount: result.originalCount,
						newCount: result.newCount,
						message: `Successfully re-sliced ${result.originalCount} slices into ${result.newCount} clean pages!`,
					});
					syncBus.broadcast({ type: 'chapter-resliced', chapterId, count: result.newCount });
				} catch (e) {
					if (request.signal.aborted) {
						emit({ type: 'error', message: 'Re-slicing cancelled by user.' });
					} else {
						emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
					}
				} finally {
					close();
				}
			})();
		},
		cancel() {
			// Client cancelled connection
		},
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no',
		},
	});
};
