// READING HISTORY STORE & COOKIE HELPERS
// Persists the last opened/read chapter per book in a cookie (and localStorage mirror)
// so that SvelteKit SSR (+page.server.ts) and client navigation instantly know the last chapter.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface LastReadRecord {
	chapterId: number;
	seq: number;
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
	return encodeURIComponent(JSON.stringify(history));
}

function getCookieClient(name: string): string | null {
	if (!browser) return null;
	const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
	return match ? decodeURIComponent(match[1]) : null;
}

function setCookieClient(name: string, value: string, maxAgeDays = 365): void {
	if (!browser) return;
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

function saveReadingHistory(history: ReadingHistoryState): void {
	if (!browser) return;
	try {
		const jsonStr = JSON.stringify(history);
		// Save to cookie for SSR
		setCookieClient(LAST_READ_COOKIE, jsonStr);
		// Save to localStorage as backup
		localStorage.setItem('xianscan:reading_history', jsonStr);
	} catch {
		// Ignore storage quota errors
	}
}

function createReadingHistoryStore() {
	const { subscribe, set, update } = writable<ReadingHistoryState>(loadReadingHistory());

	return {
		subscribe,

		// Record when a user opens or reads a chapter
		recordReading(
			bookId: string,
			chapter: { id: number; seq: number; title?: string | null; titleTarget?: string | null },
		) {
			if (!bookId || !chapter?.id) return;
			update((history) => {
				const next: ReadingHistoryState = {
					...history,
					[bookId]: {
						chapterId: chapter.id,
						seq: chapter.seq,
						title: chapter.title,
						titleTarget: chapter.titleTarget,
						updatedAt: Date.now(),
					},
				};
				saveReadingHistory(next);
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
				saveReadingHistory(next);
				return next;
			});
		},
	};
}

export const readingHistory = createReadingHistoryStore();
