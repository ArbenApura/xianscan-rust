// GLOBAL CLIENT-SIDE REAL-TIME SYNCHRONIZATION STORE (web/src/lib/stores/sync-client.ts)
// MAINTAINS A CONTINUOUS SSE STREAM WITH SERVER, AUTOMATICALLY RECONNECTS, AND
// TRIGGERS DEBOUNCED SVELTEKIT DATA INVALIDATION ON ENTITY MUTATIONS

import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import { streamSse, type SseEvent } from '$lib/sse';
import type { SyncEvent } from '$lib/server/sync-bus';

// -- TYPES -- //

export type SyncConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SyncClientState {
	status: SyncConnectionStatus;
	lastEvent: SyncEvent | null;
	lastSyncTime: number | null;
	reconnectAttempts: number;
}

export type CustomSyncListener = (event: SyncEvent) => void;

// -- STORE IMPLEMENTATION -- //

function createSyncClientStore() {
	const initialState: SyncClientState = {
		status: 'disconnected',
		lastEvent: null,
		lastSyncTime: null,
		reconnectAttempts: 0,
	};

	const { subscribe, update } = writable<SyncClientState>(initialState);

	let activeController: AbortController | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let invalidateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let customListeners: Set<CustomSyncListener> = new Set();
	let isStarted = false;

	// DEBOUNCED SVELTEKIT INVALIDATION (300MS WINDOW TO COALESCE RAPID BURSTS)
	function scheduleInvalidate() {
		if (!browser) return;
		if (invalidateDebounceTimer) clearTimeout(invalidateDebounceTimer);
		invalidateDebounceTimer = setTimeout(() => {
			invalidateDebounceTimer = null;
			void invalidateAll();
		}, 300);
	}

	function handleEvent(rawEvent: SseEvent) {
		const syncEvent = rawEvent as unknown as SyncEvent;
		if (!syncEvent || !syncEvent.type) return;

		const now = Date.now();
		update((s) => ({
			...s,
			lastEvent: syncEvent,
			lastSyncTime: now,
		}));

		// NOTIFY LOCAL SUBSCRIBERS
		for (const listener of customListeners) {
			try {
				listener(syncEvent);
			} catch (err) {
				console.warn('[syncClient] Error in custom listener:', err);
			}
		}

		// TRIGGER SVELTEKIT DATA RELOAD ACROSS ACTIVE ROUTES
		scheduleInvalidate();
	}

	async function connect(): Promise<void> {
		if (!browser || !isStarted) return;

		// CLEAN UP ANY PRIOR ACTIVE STREAM
		if (activeController) {
			activeController.abort();
			activeController = null;
		}

		const controller = new AbortController();
		activeController = controller;

		update((s) => ({
			...s,
			status: s.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
		}));

		try {
			await streamSse(
				'/api/sync/events',
				{ method: 'GET' },
				(event) => {
					if (event.type === 'connected') {
						update((s) => ({
							...s,
							status: 'connected',
							reconnectAttempts: 0,
							lastSyncTime: Date.now(),
						}));
					} else if (Boolean(event.type) || (event as any).bookId || (event as any).chapterId) {
						handleEvent(event);
					}
				},
				controller.signal,
			);

			// STREAM ENDED NORMALLY
			if (isStarted && !controller.signal.aborted) {
				scheduleReconnect();
			}
		} catch (err) {
			if (controller.signal.aborted) return;
			console.warn('[syncClient] SSE connection lost:', err);
			if (isStarted) {
				scheduleReconnect();
			}
		}
	}

	function scheduleReconnect() {
		if (!browser || !isStarted) return;
		if (reconnectTimer) clearTimeout(reconnectTimer);

		update((s) => {
			const attempts = s.reconnectAttempts + 1;
			const delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);

			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				void connect();
			}, delay);

			return {
				...s,
				status: 'reconnecting',
				reconnectAttempts: attempts,
			};
		});
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && isStarted) {
			// TAB RETURNED TO FOREGROUND: REFRESH DATA & RECONNECT IF DROPPED
			scheduleInvalidate();
			if (!activeController || activeController.signal.aborted) {
				void connect();
			}
		}
	}

	return {
		subscribe,

		// START PERSISTENT SYNC LISTENER (CALLED IN ROOT APP LAYOUT ON MOUNT)
		start(): void {
			if (!browser || isStarted) return;
			isStarted = true;
			document.addEventListener('visibilitychange', handleVisibilityChange);
			void connect();
		},

		// STOP SYNC LISTENER
		stop(): void {
			isStarted = false;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (invalidateDebounceTimer) {
				clearTimeout(invalidateDebounceTimer);
				invalidateDebounceTimer = null;
			}
			if (activeController) {
				activeController.abort();
				activeController = null;
			}
			if (browser) {
				document.removeEventListener('visibilitychange', handleVisibilityChange);
			}
			update((s) => ({
				...s,
				status: 'disconnected',
				reconnectAttempts: 0,
			}));
		},

		// SUBSCRIBE A CUSTOM COMPONENT-LEVEL EVENT HANDLER
		on(listener: CustomSyncListener): () => void {
			customListeners.add(listener);
			return () => {
				customListeners.delete(listener);
			};
		},

		// MANUALLY TRIGGER A SYNC REVALIDATION
		invalidateNow(): void {
			scheduleInvalidate();
		},
	};
}

export const syncClient = createSyncClientStore();
