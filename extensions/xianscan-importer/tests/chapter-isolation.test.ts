// -- TESTS FOR CHAPTER URL ISOLATION AND QUERY PARAMETER DIFFERENTIATION -- //

// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';

// IMPORTED MODULES
import { normalizePageUrl, filterToRelevantCluster } from '../src/core/heuristics/url-clustering';
import {
	saveSiteMapping,
	findMappingForUrl,
	deleteSiteMapping,
	getSiteMappings,
	updateSiteMappingEnabled
} from '../src/core/storage';
import type { ChapterMappingEntry } from '../src/types';

describe('Chapter URL isolation and routing heuristics', () => {
	let mockStorage: Record<string, any> = {};

	beforeEach(() => {
		mockStorage = {};
		(globalThis as any).chrome = {
			storage: {
				local: {
					get: vi.fn(async (keys: string[]) => {
						const result: Record<string, any> = {};
						for (const key of keys) {
							if (mockStorage[key] !== undefined) {
								result[key] = mockStorage[key];
							}
						}
						return result;
					}),
					set: vi.fn(async (items: Record<string, any>) => {
						Object.assign(mockStorage, items);
					})
				}
			}
		};
	});

	it('preserves query parameters that identify chapters while stripping tracking tags', () => {
		const rawCh106 = 'https://example.com/read/manga-slug?ch=106&utm_source=twitter&fbclid=123';
		const rawCh107 = 'https://example.com/read/manga-slug?ch=107&utm_medium=banner';

		const norm106 = normalizePageUrl(rawCh106);
		const norm107 = normalizePageUrl(rawCh107);

		expect(norm106).toBe('https://example.com/read/manga-slug?ch=106');
		expect(norm107).toBe('https://example.com/read/manga-slug?ch=107');
		expect(norm106).not.toBe(norm107);
	});

	it('preserves SPA hash routes while stripping in-page anchors', () => {
		const spaCh106 = 'https://example.com/reader/#/chapter/106';
		const spaCh107 = 'https://example.com/reader/#/chapter/107';
		const anchorUrl = 'https://example.com/read/106#comment-section';

		expect(normalizePageUrl(spaCh106)).toBe('https://example.com/reader/#/chapter/106');
		expect(normalizePageUrl(spaCh107)).toBe('https://example.com/reader/#/chapter/107');
		expect(normalizePageUrl(anchorUrl)).toBe('https://example.com/read/106');
	});

	it('never matches Chapter 106 when navigating to Chapter 107 with query parameters', async () => {
		const ch106Entry: ChapterMappingEntry = {
			url: 'https://example.com/read/manga-slug?chapter=106',
			bookId: 'book-1',
			chapterId: 106,
			isResliced: false,
			pageCount: 20,
			enabled: true,
			lastSyncedAt: Date.now()
		};

		await saveSiteMapping(ch106Entry);

		// QUERYING CHAPTER 106 MUST RETURN CHAPTER 106
		const match106 = await findMappingForUrl('https://example.com/read/manga-slug?chapter=106');
		expect(match106).not.toBeNull();
		expect(match106?.chapterId).toBe(106);

		// QUERYING CHAPTER 107 MUST NEVER RETURN CHAPTER 106
		const match107 = await findMappingForUrl('https://example.com/read/manga-slug?chapter=107');
		expect(match107).toBeNull();
	});

	it('never matches Chapter 106 when navigating to Chapter 107 on SPA hash routes', async () => {
		const ch106Entry: ChapterMappingEntry = {
			url: 'https://example.com/reader/#/chapter/106',
			bookId: 'book-1',
			chapterId: 106,
			isResliced: true,
			pageCount: 15,
			enabled: true,
			lastSyncedAt: Date.now()
		};

		await saveSiteMapping(ch106Entry);

		const match106 = await findMappingForUrl('https://example.com/reader/#/chapter/106');
		expect(match106?.chapterId).toBe(106);

		const match107 = await findMappingForUrl('https://example.com/reader/#/chapter/107');
		expect(match107).toBeNull();
	});

	it('tolerates trailing slashes without cross-contaminating different chapters', async () => {
		const ch106Entry: ChapterMappingEntry = {
			url: 'https://rawkuma.net/manga/title/chapter-106/',
			bookId: 'book-1',
			chapterId: 106,
			isResliced: true,
			pageCount: 18,
			enabled: true,
			lastSyncedAt: Date.now()
		};

		await saveSiteMapping(ch106Entry);

		// MATCH WITHOUT TRAILING SLASH
		const matchSlashless = await findMappingForUrl('https://rawkuma.net/manga/title/chapter-106');
		expect(matchSlashless?.chapterId).toBe(106);

		// CHAPTER 107 WITH OR WITHOUT TRAILING SLASH MUST NOT MATCH
		const match107Slash = await findMappingForUrl('https://rawkuma.net/manga/title/chapter-107/');
		const match107NoSlash = await findMappingForUrl('https://rawkuma.net/manga/title/chapter-107');
		expect(match107Slash).toBeNull();
		expect(match107NoSlash).toBeNull();
	});

	it('deletes only the target chapter mapping without touching other chapters', async () => {
		const ch106Entry: ChapterMappingEntry = {
			url: 'https://site.com/reader?ch=106',
			bookId: 'book-1',
			chapterId: 106,
			isResliced: false,
			pageCount: 10,
			enabled: true,
			lastSyncedAt: Date.now()
		};
		const ch107Entry: ChapterMappingEntry = {
			url: 'https://site.com/reader?ch=107',
			bookId: 'book-1',
			chapterId: 107,
			isResliced: false,
			pageCount: 12,
			enabled: true,
			lastSyncedAt: Date.now()
		};

		await saveSiteMapping(ch106Entry);
		await saveSiteMapping(ch107Entry);

		await deleteSiteMapping('https://site.com/reader?ch=106');

		const mappings = await getSiteMappings();
		expect(mappings['https://site.com/reader?ch=106']).toBeUndefined();
		expect(mappings['https://site.com/reader?ch=107']).toBeDefined();
		expect(mappings['https://site.com/reader?ch=107'].chapterId).toBe(107);
	});

	it('isolates the relevant comic cluster and filters out header book covers', () => {
		const rawImages = [
			{
				url: 'https://rawkuma.net/wp-content/uploads/2025/10/kanzen-drop.jpg',
				canonicalUrl: 'https://rawkuma.net/wp-content/uploads/2025/10/kanzen-drop.jpg',
				width: 1350,
				height: 1920,
				top: 100,
				left: 396,
				selected: true
			},
			...Array.from({ length: 18 }, (_, i) => ({
				url: `https://kuma.kyut.dev/wp-content/scr/s/saijaku-bouken-sha-ga-kanzen-drop-de-gendai-saikyou-jibun-dake-no-rare-skill-to-custom-abilities-o-kushi-shite-hoka-no-dare-yori-tsuyoku-naru/0/${i + 1}.jpg`,
				canonicalUrl: `https://kuma.kyut.dev/wp-content/scr/s/saijaku-bouken-sha-ga-kanzen-drop-de-gendai-saikyou-jibun-dake-no-rare-skill-to-custom-abilities-o-kushi-shite-hoka-no-dare-yori-tsuyoku-naru/0/${i + 1}.jpg`,
				width: 960,
				height: 1365,
				top: 400 + i * 1138,
				left: 555,
				selected: true
			}))
		];

		const clustered = filterToRelevantCluster(rawImages);
		expect(clustered.length).toBe(18);
		expect(clustered.some(img => img.url.includes('kanzen-drop.jpg'))).toBe(false);
		expect(clustered.every(img => img.url.includes('kuma.kyut.dev'))).toBe(true);
	});

	it('scopes active import job to matching URL and ignores job from another chapter page', async () => {
		const jobForChapter1 = {
			running: true,
			current: 5,
			total: 20,
			chapterId: 101,
			bookId: 'book-1',
			url: 'https://example.com/read/manga/chapter-1?utm_source=nav'
		};

		await chrome.storage.local.set({ activeImportJob: jobForChapter1 });

		const ch1PageUrl = 'https://example.com/read/manga/chapter-1';
		const ch2PageUrl = 'https://example.com/read/manga/chapter-2';

		const stored = await chrome.storage.local.get(['activeImportJob']);
		const activeJob = stored.activeImportJob;

		const isSamePageOnCh1 = activeJob?.url && normalizePageUrl(activeJob.url) === normalizePageUrl(ch1PageUrl);
		const isSamePageOnCh2 = activeJob?.url && normalizePageUrl(activeJob.url) === normalizePageUrl(ch2PageUrl);

		expect(isSamePageOnCh1).toBe(true);
		expect(isSamePageOnCh2).toBe(false);
	});

	it('rejects cross-chapter runtime progress messages when tracking a different chapter', () => {
		const activeTrackerChapterId = 102;

		const messageFromChapter101 = {
			type: 'PAGE_TRANSLATED',
			chapterId: 101,
			pageSeq: 3,
			total: 20
		};

		const messageFromChapter102 = {
			type: 'PAGE_TRANSLATED',
			chapterId: 102,
			pageSeq: 1,
			total: 15
		};

		const shouldAcceptMsg101 = activeTrackerChapterId && (!messageFromChapter101.chapterId || Number(messageFromChapter101.chapterId) === Number(activeTrackerChapterId));
		const shouldAcceptMsg102 = activeTrackerChapterId && (!messageFromChapter102.chapterId || Number(messageFromChapter102.chapterId) === Number(activeTrackerChapterId));

		expect(shouldAcceptMsg101).toBe(false);
		expect(shouldAcceptMsg102).toBe(true);
	});

	it('updates site mapping enabled flag flexibly when toggled on mid-flight', async () => {
		const targetUrl = 'https://example.com/read/chapter-10';
		const initialMapping: ChapterMappingEntry = {
			url: targetUrl,
			bookId: 'book-1',
			chapterId: 10,
			isResliced: true,
			pageCount: 16,
			enabled: false,
			lastSyncedAt: Date.now()
		};

		await saveSiteMapping(initialMapping);

		const beforeToggle = await findMappingForUrl(targetUrl);
		expect(beforeToggle?.enabled).toBe(false);

		// TOGGLE IN-PLACE REPLACEMENT ON MID-FLIGHT
		const updated = await updateSiteMappingEnabled(targetUrl, true);
		expect(updated).not.toBeNull();
		expect(updated?.enabled).toBe(true);

		const afterToggle = await findMappingForUrl(targetUrl);
		expect(afterToggle?.enabled).toBe(true);

		// TOGGLE IN-PLACE REPLACEMENT OFF
		await updateSiteMappingEnabled(targetUrl, false);
		const afterToggleOff = await findMappingForUrl(targetUrl);
		expect(afterToggleOff?.enabled).toBe(false);
	});
});
