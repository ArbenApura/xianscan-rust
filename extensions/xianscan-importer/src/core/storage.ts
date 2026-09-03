// -- EXTENSION STORAGE REPOSITORY -- //

// IMPORTED TYPES
import type { ChapterMappingEntry, ExtensionSettings } from '../types';

// IMPORTED MODULES
import { normalizePageUrl } from './heuristics/url-clustering';

// -- CONSTANTS -- //

export const DEFAULT_SERVER_URL = 'http://127.0.0.1:8124';

export interface ActiveImportJobState {
	running: boolean;
	current: number;
	total: number;
	chapterId: number;
	bookId: string | number;
}

// -- FUNCTIONS & REPOSITORY METHODS -- //

// GET CONFIGURED SERVER BASE URL WITH LOCALHOST FALLBACK
export async function getServerUrl(): Promise<string> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return DEFAULT_SERVER_URL;
	const stored = await chrome.storage.local.get(['serverUrl']);
	return stored.serverUrl || DEFAULT_SERVER_URL;
}

// SET CONFIGURED SERVER BASE URL
export async function setServerUrl(serverUrl: string): Promise<void> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
	await chrome.storage.local.set({ serverUrl });
}

// RETRIEVE ALL SITE URL TO CHAPTER MAPPINGS
export async function getSiteMappings(): Promise<Record<string, ChapterMappingEntry>> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
	const stored = await chrome.storage.local.get(['siteMappings']);
	return stored.siteMappings || {};
}

// SAVE A SITE MAPPING WITH NORMALIZED KEY
export async function saveSiteMapping(entry: ChapterMappingEntry): Promise<void> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(entry.url);
	mappings[normalized] = {
		...entry,
		url: normalized,
		lastSyncedAt: Date.now()
	};
	await chrome.storage.local.set({ siteMappings: mappings });
}

// FIND A SITE MAPPING FOR A GIVEN RAW PAGE URL
export async function findMappingForUrl(rawUrl: string): Promise<ChapterMappingEntry | null> {
	if (!rawUrl) return null;
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(rawUrl);

	if (mappings[normalized]) {
		return mappings[normalized];
	}

	const trimmedNormalized = normalized.replace(/\/+$/, '');
	for (const [key, value] of Object.entries(mappings)) {
		if (key.replace(/\/+$/, '') === trimmedNormalized) {
			return value;
		}
	}

	return null;
}

// DELETE A SITE MAPPING BY RAW PAGE URL
export async function deleteSiteMapping(rawUrl: string): Promise<void> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(rawUrl);
	const trimmedNormalized = normalized.replace(/\/+$/, '');

	let matchedKey: string | null = null;
	if (mappings[normalized]) {
		matchedKey = normalized;
	} else {
		for (const key of Object.keys(mappings)) {
			if (key.replace(/\/+$/, '') === trimmedNormalized) {
				matchedKey = key;
				break;
			}
		}
	}

	if (matchedKey) {
		delete mappings[matchedKey];
		await chrome.storage.local.set({ siteMappings: mappings });
	}
}

// GET ACTIVE IMPORT JOB STATE FROM STORAGE
export async function getActiveImportJob(): Promise<ActiveImportJobState | null> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
	const stored = await chrome.storage.local.get(['activeImportJob']);
	return stored.activeImportJob || null;
}

// PERSIST ACTIVE IMPORT JOB STATE TO STORAGE
export async function setActiveImportJob(job: ActiveImportJobState | null): Promise<void> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
	await chrome.storage.local.set({ activeImportJob: job });
}

// GET EXTENSION PREFERENCES
export async function getExtensionPreferences(): Promise<Partial<ExtensionSettings>> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) {
		return {
			serverUrl: DEFAULT_SERVER_URL,
			autoReslice: true,
			autoTranslate: true,
			inPlaceReplacement: false
		};
	}
	const stored = await chrome.storage.local.get(['serverUrl', 'autoReslice', 'autoTranslate', 'inPlaceReplacement']);
	return {
		serverUrl: stored.serverUrl || DEFAULT_SERVER_URL,
		autoReslice: stored.autoReslice !== false,
		autoTranslate: stored.autoTranslate !== false,
		inPlaceReplacement: stored.inPlaceReplacement === true
	};
}
