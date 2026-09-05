// REAL-TIME SERVER-SENT EVENTS FEED FOR BATCH TRANSLATION (web/src/routes/api/batch/events/+server.ts)

import { batchService } from '$lib/server/batch-service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return createSseStream();
};

export const POST: RequestHandler = async () => {
	return createSseStream();
};

function createSseStream(): Response {
	let unsubscribe: (() => void) | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function sendEvent(type: string, data: unknown) {
				try {
					controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Client disconnected
				}
			}

			// SUBSCRIBE TO SERVER BATCH SERVICE
			unsubscribe = batchService.subscribe((event) => {
				sendEvent(event.type, { type: event.type, state: event.state });
			});

			// SEND PERIODIC HEARTBEAT TO PREVENT PROXY TIMEOUTS
			heartbeatTimer = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					if (heartbeatTimer) clearInterval(heartbeatTimer);
				}
			}, 15000);
		},
		cancel() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
