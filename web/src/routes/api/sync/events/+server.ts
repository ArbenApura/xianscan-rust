// GLOBAL REAL-TIME SERVER-SENT EVENTS FEED FOR CLIENT UI SYNCHRONIZATION (web/src/routes/api/sync/events/+server.ts)

import { syncBus, type SyncEvent } from '$lib/server/sync-bus';
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

			// SUBSCRIBE TO SERVER SYNC EVENT BUS
			unsubscribe = syncBus.subscribe((event: SyncEvent) => {
				sendEvent('sync', event);
			});

			// SEND INITIAL CONNECTED EVENT
			sendEvent('connected', { type: 'connected', timestamp: Date.now() });

			// SEND PERIODIC HEARTBEAT TO PREVENT PROXY OR REVERSE PROXY TIMEOUTS
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
}
