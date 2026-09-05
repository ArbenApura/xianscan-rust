// SERVER-SIDE IN-MEMORY REAL-TIME SYNCHRONIZATION EVENT BUS
// BROADCASTS ENTITY MUTATIONS (BOOKS, CHAPTERS, PAGES, TRANSLATIONS) TO CONNECTED CLIENTS

export type SyncEventType =
	| 'book-created'
	| 'book-updated'
	| 'book-deleted'
	| 'chapter-created'
	| 'chapter-updated'
	| 'chapter-deleted'
	| 'pages-updated'
	| 'chapter-reslicing'
	| 'chapter-resliced'
	| 'page-translated'
	| 'chapter-translated'
	| 'settings-updated';

export interface SyncEvent {
	type: SyncEventType;
	bookId?: string;
	chapterId?: number;
	pageId?: number;
	pageSeq?: number;
	outputRev?: number;
	count?: number;
	total?: number;
	step?: string;
	message?: string;
	pct?: number;
	timestamp?: number;
}

export type SyncEventListener = (event: SyncEvent) => void;

class SyncBus {
	private listeners: Set<SyncEventListener> = new Set();

	// SUBSCRIBE A LISTENER (RETURNS AN UNSUBSCRIBE FUNCTION)
	subscribe(listener: SyncEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	// BROADCAST AN EVENT TO ALL ACTIVE SUBSCRIBERS
	broadcast(event: SyncEvent): void {
		const payload: SyncEvent = {
			...event,
			timestamp: event.timestamp || Date.now(),
		};

		for (const listener of this.listeners) {
			try {
				listener(payload);
			} catch (err) {
				console.warn('[syncBus] Error executing subscriber callback:', err);
			}
		}
	}

	// ACTIVE LISTENER COUNT
	get listenerCount(): number {
		return this.listeners.size;
	}
}

export const syncBus = new SyncBus();
