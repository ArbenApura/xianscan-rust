// @vitest-environment jsdom
// -- TESTS FOR IN-PLACE DOM REPLACER & URL NORMALIZATION -- //

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizePageUrl, DomReplacerEngine, getHostReaderImages } from '../src/utils/dom-replacer';
import type { ChapterReaderPage } from '../src/types';

describe('normalizePageUrl', () => {
	it('strips tracking parameters and hashes', () => {
		const raw = 'https://mangasite.com/chapter/42?utm_source=rss&utm_medium=feed#reader';
		expect(normalizePageUrl(raw)).toBe('https://mangasite.com/chapter/42');
	});

	it('preserves essential chapter routing query params', () => {
		const raw = 'https://mangasite.com/reader?series=123&ch=4';
		expect(normalizePageUrl(raw)).toBe('https://mangasite.com/reader?series=123&ch=4');
	});

	it('strips trailing slashes cleanly', () => {
		const raw = 'https://mangasite.com/chapter/42///';
		expect(normalizePageUrl(raw)).toBe('https://mangasite.com/chapter/42');
	});
});

describe('DomReplacerEngine', () => {
	let container: HTMLElement;
	let img1: HTMLImageElement;
	let img2: HTMLImageElement;
	let engine: DomReplacerEngine | null = null;

	beforeEach(() => {
		if (engine) {
			engine.destroy();
			engine = null;
		}
		document.body.innerHTML = '';
		container = document.createElement('div');
		container.className = 'reading-content';

		img1 = document.createElement('img');
		img1.src = 'https://site.com/raw1.jpg';
		img1.className = 'page-image';
		img1.style.width = '100%';

		img2 = document.createElement('img');
		img2.src = 'https://site.com/raw2.jpg';
		img2.className = 'page-image';
		img2.style.width = '100%';

		container.appendChild(img1);
		container.appendChild(img2);
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (engine) {
			engine.destroy();
			engine = null;
		}
		document.body.innerHTML = '';
	});

	it('collects host reader images accurately', () => {
		const imgs = getHostReaderImages();
		expect(imgs.length).toBe(2);
		expect(imgs[0]).toBe(img1);
		expect(imgs[1]).toBe(img2);
	});

	it('swaps original image sources directly in-place', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 101,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			},
			{
				id: 102,
				seq: 1,
				filePath: 'orig2.jpg',
				cleanedPath: null,
				outputPath: 'out2.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		const mounted = engine.mountTranslatedPages(testPages);
		expect(mounted).toBe(true);
		expect(engine.getIsTranslatedActive()).toBe(true);

		// VERIFY IN-PLACE REPLACEMENT WITHOUT CHANGING WRAPPERS
		expect(img1.src).toContain('/api/pages/101/file?kind=output&rev=1');
		expect(img2.src).toContain('/api/pages/102/file?kind=output&rev=1');
		expect(img1.className).toBe('page-image');
		expect(img1.getAttribute('data-xianscan-orig-src')).toBe('https://site.com/raw1.jpg');
	});

	it('handles reslicing with more server pages by cloning host image elements', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 101,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			},
			{
				id: 102,
				seq: 1,
				filePath: 'orig2.jpg',
				cleanedPath: null,
				outputPath: 'out2.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			},
			{
				id: 103,
				seq: 2,
				filePath: 'orig3.jpg',
				cleanedPath: null,
				outputPath: 'out3.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);

		const allImgs = container.querySelectorAll('img');
		expect(allImgs.length).toBe(3);
		expect(allImgs[2].getAttribute('data-xianscan-injected')).toBe('true');
		expect(allImgs[2].className).toBe('page-image');
		expect(allImgs[2].src).toContain('/api/pages/103/file?kind=output&rev=1');
	});

	it('handles reslicing with fewer server pages by hiding surplus images', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 101,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);

		expect(img1.src).toContain('/api/pages/101/file?kind=output&rev=1');
		expect(img2.style.display).toBe('none');
		expect(img2.getAttribute('data-xianscan-hidden')).toBe('true');
	});

	it('toggles seamlessly between translated and raw modes', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 101,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);
		expect(engine.getIsTranslatedActive()).toBe(true);

		// TOGGLE TO RAW
		engine.setMode('raw');
		expect(engine.getIsTranslatedActive()).toBe(false);
		expect(img1.src).toBe('https://site.com/raw1.jpg');
		expect(img2.style.display).toBe('');

		// TOGGLE BACK TO TRANSLATED
		engine.setMode('translated');
		expect(engine.getIsTranslatedActive()).toBe(true);
		expect(img2.style.display).toBe('none');
	});

	it('preserves and skips user-deselected/excluded image URLs completely', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 101,
				seq: 0,
				filePath: 'orig2.jpg',
				cleanedPath: null,
				outputPath: 'out2.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		// EXCLUDE img1 ('https://site.com/raw1.jpg')
		const hostImgs = getHostReaderImages(['https://site.com/raw1.jpg']);
		expect(hostImgs.length).toBe(1);
		expect(hostImgs[0]).toBe(img2);

		engine.mountTranslatedPages(testPages, ['https://site.com/raw1.jpg']);

		// img1 IS NOT MODIFIED OR REPLACED (REMAINS ORIGINAL AD/UNSELECTED CONTENT)
		expect(img1.src).toBe('https://site.com/raw1.jpg');
		expect(img1.getAttribute('data-xianscan-page-id')).toBeNull();

		// img2 IS REPLACED WITH testPage 101
		expect(img2.src).toContain('/api/pages/101/file?kind=output&rev=1');
		expect(img2.getAttribute('data-xianscan-page-id')).toBe('101');
	});

	it('mounts pending page without injecting extra DOM badge elements', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 201,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: null,
				cleanedRev: 0,
				outputRev: 0,
				originalRev: 1,
				status: 'pending',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);

		// HOST CONTAINER MAINTAINS DIRECT IMAGE HIERARCHY WITH ZERO INJECTED WRAPPER/BADGE DOM ELEMENTS
		expect(img1.parentElement).toBe(container);
		expect(document.querySelectorAll('[data-xianscan-badge-id]').length).toBe(0);
		expect(img1.getAttribute('data-xianscan-status')).toBe('pending');

		// DYNAMICALLY UPDATE TO READY VIA SSE/POLLING EVENT
		engine.updatePageSlice(201, 0, 1);
		expect(img1.getAttribute('data-xianscan-status')).toBe('ready');
		expect(img1.style.filter).toBe('none');
		expect(img1.src).toContain('/api/pages/201/file?kind=output&rev=1');
	});

	it('updates slice status to processing when pending page starts translating', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 601,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: null,
				cleanedRev: 0,
				outputRev: 0,
				originalRev: 1,
				status: 'pending',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);
		expect(img1.getAttribute('data-xianscan-status')).toBe('pending');

		// SIMULATE THE 2.5S POLL OBSERVING THE PAGE NOW PROCESSING
		engine.updatePageStatus(601, 0, 'processing');
		expect(img1.getAttribute('data-xianscan-status')).toBe('processing');

		// ONCE OUTPUT IS READY, REPLACED BY THE TRANSLATED IMAGE
		engine.updatePageSlice(601, 0, 1);
		expect(img1.getAttribute('data-xianscan-status')).toBe('ready');
		expect(img1.src).toContain('/api/pages/601/file?kind=output&rev=1');
	});

	it('attaches error retry handler that retries on image load failure', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 301,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);
		expect(img1.onerror).toBeDefined();
		expect(typeof img1.onerror).toBe('function');
	});

	it('cleans up resources and revokes object URLs on destroy', () => {
		engine = new DomReplacerEngine('http://127.0.0.1:8124');
		const testPages: ChapterReaderPage[] = [
			{
				id: 401,
				seq: 0,
				filePath: 'orig1.jpg',
				cleanedPath: null,
				outputPath: 'out1.webp',
				cleanedRev: 0,
				outputRev: 1,
				originalRev: 1,
				status: 'done',
				error: null
			}
		];

		engine.mountTranslatedPages(testPages);
		expect(engine.getIsTranslatedActive()).toBe(true);

		engine.destroy();
		expect(engine.getIsTranslatedActive()).toBe(false);
		expect(document.querySelector('[data-xianscan-wrapper="true"]')).toBeNull();
		expect(document.querySelector('[data-xianscan-badge-id]')).toBeNull();
	});
});
