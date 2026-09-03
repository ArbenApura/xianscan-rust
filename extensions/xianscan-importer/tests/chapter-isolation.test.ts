// -- TESTS FOR CHAPTER URL ISOLATION AND QUERY PARAMETER DIFFERENTIATION -- //

// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';

// IMPORTED MODULES
import { normalizePageUrl } from '../src/core/heuristics/url-clustering';
import {
	saveSiteMapping,
	findMappingForUrl,
	deleteSiteMapping,
	getSiteMappings
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
});
