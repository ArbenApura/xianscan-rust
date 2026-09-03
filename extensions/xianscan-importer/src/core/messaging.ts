// -- RUNTIME IPC MESSAGING AND EVENT BROADCAST PROTOCOL -- //

// IMPORTED TYPES
import type { ChapterMappingEntry, PageTranslatedMessage, ChapterSyncMessage } from '../types';

// IMPORTED MODULES
import { getSiteMappings } from './storage';
import { normalizePageUrl } from './heuristics/url-clustering';
import { dispatchToChapterPort } from '../background/keep-alive';

// -- FUNCTIONS & BROADCASTERS -- //

// SAFE RUNTIME BROADCASTER THAT SWALLOWS 'RECEIVING END DOES NOT EXIST' WHEN POPUP IS CLOSED
export function safeBroadcast(msg: any): void {
	try {
		if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
			chrome.runtime.sendMessage(msg, () => {
				void chrome.runtime.lastError;
			});
		}
	} catch {
		// IGNORE BROADCAST ERRORS
	}
}

// BROADCAST TO ALL TABS THAT ARE VIEWING A MAPPED CHAPTER OR REFERER URL
export async function broadcastToChapterTabs(chapterId: number, msg: any): Promise<void> {
	// 1. FAST DIRECT DISPATCH TO CONNECTED TAB KEEPALIVE PORT
	try {
		dispatchToChapterPort(chapterId, msg);
	} catch {
		// IGNORE PORT DISPATCH ERROR
	}

	// 2. BROADCAST VIA TABS QUERY WITH ACCURATE NORMALIZED URL MATCHING
	try {
		if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
		const mappings = await getSiteMappings();
		// COLLECT ALL NORMALIZED URLS BOUND TO THIS CHAPTER
		const targetUrls = new Set<string>();
		for (const [url, entry] of Object.entries(mappings)) {
			if (Number(entry.chapterId) === Number(chapterId)) {
				targetUrls.add(normalizePageUrl(url).replace(/\/+$/, ''));
			}
		}

		const tabs = await chrome.tabs.query({});
		for (const tab of tabs) {
			if (tab.id && tab.url) {
				const tabNormalized = normalizePageUrl(tab.url).replace(/\/+$/, '');
				const entryUrlNorm = msg.entry?.url ? normalizePageUrl(msg.entry.url).replace(/\/+$/, '') : '';
				const isTarget = targetUrls.has(tabNormalized) || (entryUrlNorm && entryUrlNorm === tabNormalized);

				if (isTarget) {
					chrome.tabs.sendMessage(tab.id, msg, () => {
						void chrome.runtime.lastError;
					});
				}
			}
		}
	} catch {
		// IGNORE TAB DISPATCH ERRORS
	}
}
