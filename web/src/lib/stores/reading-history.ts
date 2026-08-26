// READING HISTORY STORE & COOKIE HELPERS
// Persists the last opened/read chapter per book in SQLite via /api/history
// with localStorage and cookie mirroring for instantaneous, zero-flicker SSR.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface LastReadRecord {
	chapterId: number;
	seq: number;
	pageSeq?: number;
	totalPages?: number;
	completed?: boolean;
	title?: string | null;
	titleTarget?: string | null;
	updatedAt: number;
}

export type ReadingHistoryState = Record<string, LastReadRecord>;

export const LAST_READ_COOKIE = 'mt_last_read';

export function parseLastReadCookie(raw: string | undefined | null): ReadingHistoryState {
	if (!raw) return {};
	try {
		const decoded = raw.startsWith('%') ? decodeURIComponent(raw) : raw;
		const parsed = JSON.parse(decoded);
		if (parsed && typeof parsed === 'object') {
			return parsed as ReadingHistoryState;
		}
	} catch {
		// Ignore invalid JSON
	}
	return {};
}

export function serializeLastReadCookie(history: ReadingHistoryState): string {
	// Restrict cookie payload to at most 10 recent books to prevent exceeding 4KB cookie limits
	const entries = Object.entries(history)
		.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
		.slice(0, 10);
	const compact: ReadingHistoryState = Object.fromEntries(entries);
	return encodeURIComponent(JSON.stringify(compact));
}

function getCookieClient(name: string): string | null {
	if (!browser || typeof document === 'undefined') return null;
	const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
	return match ? decodeURIComponent(match[1]) : null;
}

function setCookieClient(name: string, value: string, maxAgeDays = 365): void {
	if (!browser || typeof document === 'undefined') return;
	const maxAge = maxAgeDays * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function loadReadingHistory(): ReadingHistoryState {
	if (!browser) return {};
	// 1. Try reading cookie first (matches SSR)
	const cookieVal = getCookieClient(LAST_READ_COOKIE);
	if (cookieVal) {
		const parsed = parseLastReadCookie(cookieVal);
		if (Object.keys(parsed).length > 0) return parsed;
	}
	// 2. Fallback to localStorage
	try {
		const raw = localStorage.getItem('xianscan:reading_history');
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') return parsed;
		}
	} catch {
		// Ignore storage errors
	}
	return {};
}

function saveReadingHistoryLocal(history: ReadingHistoryState): void {
	if (!browser) return;
	try {
		// Save compact recent version to cookie for SSR (<4KB)
		const recentEntries = Object.entries(history)
			.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
			.slice(0, 10);
		const compactHistory = Object.fromEntries(recentEntries);
		setCookieClient(LAST_READ_COOKIE, JSON.stringify(compactHistory));

		// Save full unlimited history to localStorage
		localStorage.setItem('xianscan:reading_history', JSON.stringify(history));
	} catch {
		// Ignore storage quota errors
	}
}

// 2.5-SECOND DEBOUNCED QUEUE FOR SERVER DATABASE PERSISTENCE
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingSyncs = new Map<string, { bookId: string; chapterId: number; chapterSeq: number; pageSeq: number; totalPages: number; completed: boolean }>();

function flushPendingSyncs() {
	if (pendingSyncs.size === 0) return;
	const toSend = Array.from(pendingSyncs.values());
	pendingSyncs.clear();

	try {
		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			// Re-queue pending if offline
			for (const item of toSend) {
				pendingSyncs.set(item.bookId, item);
			}
			return;
		}

		fetch('/api/history', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(toSend),
			keepalive: true,
		})
			.then((res) => {
				if (!res.ok) {
					// Re-queue on 4xx/5xx server errors
					for (const item of toSend) {
						pendingSyncs.set(item.bookId, item);
					}
				}
			})
			.catch(() => {
				// Re-queue on network drop
				for (const item of toSend) {
					pendingSyncs.set(item.bookId, item);
				}
			});
	} catch {
		// Silent error
	}
}

function scheduleSync(payload: { bookId: string; chapterId: number; chapterSeq: number; pageSeq: number; totalPages: number; completed: boolean }) {
	pendingSyncs.set(payload.bookId, payload);
	if (syncTimeout) clearTimeout(syncTimeout);
	syncTimeout = setTimeout(() => {
		flushPendingSyncs();
	}, 2500);
}

// REGISTER UNLOAD, VISIBILITY, PAGEHIDE, BFCACHE & ONLINE RECONNECTION HANDLERS
if (browser && typeof window !== 'undefined') {
	window.addEventListener('visibilitychange', () => {
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
			flushPendingSyncs();
		}
	});

	window.addEventListener('pagehide', () => {
		flushPendingSyncs();
	});

	window.addEventListener('online', () => {
		if (pendingSyncs.size > 0) {
			flushPendingSyncs();
		}
	});

	window.addEventListener('beforeunload', () => {
		if (pendingSyncs.size > 0 && typeof navigator !== 'undefined') {
			const batch = Array.from(pendingSyncs.values());
			let sent = false;
			if (navigator.sendBeacon) {
				const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' });
				sent = navigator.sendBeacon('/api/history', blob);
			}
			if (!sent && typeof fetch !== 'undefined') {
				fetch('/api/history', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(batch),
					keepalive: true,
				}).catch(() => {});
			}
			pendingSyncs.clear();
		}
	});
}

function createReadingHistoryStore() {
	const { subscribe, set, update } = writable<ReadingHistoryState>(loadReadingHistory());

	// Cross-tab broadcast channel
	let historyBroadcastChannel: BroadcastChannel | null = null;
	if (browser && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
		try {
			historyBroadcastChannel = new BroadcastChannel('xianscan_history_channel');
			historyBroadcastChannel.onmessage = (event) => {
				if (event?.data && typeof event.data === 'object') {
					update((localHistory) => {
						const merged = { ...localHistory };
						for (const [bookId, remote] of Object.entries(event.data as Record<string, LastReadRecord>)) {
							const local = merged[bookId];
							if (!local) {
								merged[bookId] = remote;
							} else {
								const isNewerChapter = remote.seq > local.seq;
								const isSameChapterForward = remote.seq === local.seq && (remote.pageSeq ?? 0) >= (local.pageSeq ?? 0);
								if (isNewerChapter || isSameChapterForward) {
									merged[bookId] = remote;
								}
							}
						}
						saveReadingHistoryLocal(merged);
						return merged;
					});
				}
			};
		} catch {
			// Channel unavailable in restricted context
		}
	}

	// BFCACHE RESTORE RE-SYNC
	if (browser && typeof window !== 'undefined') {
		window.addEventListener('pageshow', (event) => {
			if (event.persisted) {
				const fresh = loadReadingHistory();
				update((current) => ({ ...current, ...fresh }));
			}
		});
	}

	return {
		subscribe,

		// Hydrate from SSR server data without triggering network saves
		hydrateFromRemote(remoteHistory: Record<string, LastReadRecord>) {
			if (!remoteHistory || typeof remoteHistory !== 'object') return;
			update((localHistory) => {
				const merged: ReadingHistoryState = { ...localHistory };
				for (const [bookId, remote] of Object.entries(remoteHistory)) {
					const local = merged[bookId];
					if (!local) {
						merged[bookId] = {
							chapterId: remote.chapterId,
							seq: remote.seq,
							pageSeq: remote.pageSeq ?? 0,
							totalPages: remote.totalPages ?? 0,
							completed: Boolean(remote.completed),
							title: remote.title ?? null,
							titleTarget: remote.titleTarget ?? null,
							updatedAt: remote.updatedAt || Date.now(),
						};
					} else {
						// Strictly monotonic sequence progression takes precedence over system clocks
						const isNewerChapter = remote.seq > local.seq;
						const isSameChapterForward = remote.seq === local.seq && (remote.pageSeq ?? 0) > (local.pageSeq ?? 0);
						const isSamePositionNewerTimestamp =
							remote.seq === local.seq &&
							(remote.pageSeq ?? 0) === (local.pageSeq ?? 0) &&
							Boolean(remote.updatedAt && remote.updatedAt > local.updatedAt);

						if (isNewerChapter || isSameChapterForward || isSamePositionNewerTimestamp) {
							merged[bookId] = {
								chapterId: remote.chapterId,
								seq: remote.seq,
								pageSeq: remote.pageSeq ?? 0,
								totalPages: remote.totalPages ?? 0,
								completed: Boolean(remote.completed),
								title: remote.title ?? local.title,
								titleTarget: remote.titleTarget ?? local.titleTarget,
								updatedAt: remote.updatedAt || Date.now(),
							};
						}
					}
				}
				saveReadingHistoryLocal(merged);
				return merged;
			});
		},

		// Record when a user opens or reads a chapter
		recordReading(
			bookId: string,
			chapter: { id: number; seq: number; title?: string | null; titleTarget?: string | null },
			pageSeq = 0,
			totalPages = 0,
			completed = false,
		) {
			if (!bookId || !chapter?.id) return;
			update((history) => {
				const next: ReadingHistoryState = {
					...history,
					[bookId]: {
						chapterId: chapter.id,
						seq: chapter.seq,
						pageSeq,
						totalPages,
						completed,
						title: chapter.title,
						titleTarget: chapter.titleTarget,
						updatedAt: Date.now(),
					},
				};
				saveReadingHistoryLocal(next);

				// Broadcast to other open tabs
				try {
					historyBroadcastChannel?.postMessage({ [bookId]: next[bookId] });
				} catch {
					// Ignore channel errors
				}

				scheduleSync({
					bookId,
					chapterId: chapter.id,
					chapterSeq: chapter.seq,
					pageSeq,
					totalPages,
					completed,
				});
				return next;
			});
		},

		// Retrieve last read record for a book
		getLastRead(bookId: string): LastReadRecord | null {
			const history = get({ subscribe });
			return history[bookId] || null;
		},

		// Clear history for a specific book (e.g. on delete)
		clearBook(bookId: string) {
			update((history) => {
				const next = { ...history };
				delete next[bookId];
				saveReadingHistoryLocal(next);
				fetch(`/api/history?bookId=${encodeURIComponent(bookId)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
				return next;
			});
		},
	};
}

export const readingHistory = createReadingHistoryStore();
