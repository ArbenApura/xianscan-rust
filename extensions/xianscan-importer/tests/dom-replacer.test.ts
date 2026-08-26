// @vitest-environment jsdom
// -- TESTS FOR IN-PLACE DOM REPLACER & URL NORMALIZATION -- //

import { describe, it, expect, beforeEach } from 'vitest';
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

	beforeEach(() => {
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

	it('collects host reader images accurately', () => {
		const imgs = getHostReaderImages();
		expect(imgs.length).toBe(2);
		expect(imgs[0]).toBe(img1);
		expect(imgs[1]).toBe(img2);
	});

	it('swaps original image sources directly in-place', () => {
		const engine = new DomReplacerEngine('http://127.0.0.1:8124');
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
		const engine = new DomReplacerEngine('http://127.0.0.1:8124');
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
		const engine = new DomReplacerEngine('http://127.0.0.1:8124');
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
		const engine = new DomReplacerEngine('http://127.0.0.1:8124');
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
		const engine = new DomReplacerEngine('http://127.0.0.1:8124');
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

		// Exclude img1 ('https://site.com/raw1.jpg')
		const hostImgs = getHostReaderImages(['https://site.com/raw1.jpg']);
		expect(hostImgs.length).toBe(1);
		expect(hostImgs[0]).toBe(img2);

		engine.mountTranslatedPages(testPages, ['https://site.com/raw1.jpg']);

		// img1 is NOT modified or replaced (remains original ad/unselected content)
		expect(img1.src).toBe('https://site.com/raw1.jpg');
		expect(img1.getAttribute('data-xianscan-page-id')).toBeNull();

		// img2 is replaced with testPage 101
		expect(img2.src).toContain('/api/pages/101/file?kind=output&rev=1');
		expect(img2.getAttribute('data-xianscan-page-id')).toBe('101');
	});
});
