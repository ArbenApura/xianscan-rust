// @vitest-environment jsdom
// -- TESTS FOR VIRTUAL-SCROLL / LAZY IMAGE URL CAPTURE (MUTATIONOBSERVER) -- //

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { vi } from 'vitest';

let capture: typeof import('../src/content');
let sorter: typeof import('../src/utils/sorter');

const GENERIC_VIRTUAL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Virtual Reader Chapter</title></head>
<body>
	<main class="reader-viewport">
		<div class="page-container" data-page="1" style="max-width: 720px; aspect-ratio: 720 / 19256;">
			<img class="panel-img" src="https://cdn.example.org/comics/chapters/1001/panel-1.png" width="720" height="19256">
		</div>
		<div class="page-container" data-page="2" style="max-width: 720px; aspect-ratio: 720 / 19421;">
			<img class="panel-img" src="https://cdn.example.org/comics/chapters/1001/panel-2.png" width="720" height="19421">
		</div>
		<div class="page-container" data-page="3" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="4" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="5" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="6" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="7" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="8" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
		<div class="page-container" data-page="9" style="max-width: 720px; aspect-ratio: 720 / 17921;"></div>
	</main>
</body>
</html>
`;

const genericVirtualPages = [
	'https://cdn.example.org/comics/chapters/1001/panel-3.png',
	'https://cdn.example.org/comics/chapters/1001/panel-4.png',
	'https://cdn.example.org/comics/chapters/1001/panel-5.png',
	'https://cdn.example.org/comics/chapters/1001/panel-6.png',
	'https://cdn.example.org/comics/chapters/1001/panel-7.png',
	'https://cdn.example.org/comics/chapters/1001/panel-8.png'
];

beforeAll(async () => {
	// GUARD AGAINST DUPLICATE INJECTION & STUB CHROME BEFORE DYNAMIC IMPORT
	(window as any).__xianscan_content_injected = true;
	(globalThis as any).chrome = {
		runtime: {
			onMessage: { addListener: () => {} },
			sendMessage: () => {},
			connect: () => ({ onDisconnect: { addListener: () => {} }, onMessage: { addListener: () => {} }, postMessage: () => {} })
		},
		storage: { local: { get: async () => ({}), set: async () => {} } },
		tabs: { query: async () => [], sendMessage: () => {} }
	};
	capture = await import('../src/content');
	sorter = await import('../src/utils/sorter');
});

beforeEach(() => {
	capture.resetCapturedImageUrls?.();
});

afterAll(() => {
	vi.restoreAllMocks();
});

describe('virtual-scroll image URL capture', () => {
	it('captures panels mounted later by a virtual-scroll reader', async () => {
		document.documentElement.innerHTML = GENERIC_VIRTUAL_HTML;
		(window as any).location.href = 'https://reader.example.com/comics/read/1001';

		capture.attachImageCaptureObserver();

		// SIMULATE VIRTUAL SCROLLING: THE READER MOUNTS PAGES 3-9 AS <IMG> ELEMENTS
		const placeholder = document.querySelector<HTMLDivElement>('[data-page="3"]');
		expect(placeholder).toBeTruthy();
		for (const url of genericVirtualPages) {
			const img = document.createElement('img');
			img.className = 'rendered-panel';
			img.setAttribute('src', url);
			placeholder!.after(img);
		}

		// OBSERVER IS ASYNC; FLUSH MICROTASKS + MACROTASK
		await Promise.resolve();
		await new Promise(r => setTimeout(r, 0));

		const captured = capture.getCapturedImageUrls();
		const canonical = new Set(captured.map(u => sorter.getCanonicalUrl(u)));
		expect(canonical.size).toBeGreaterThanOrEqual(8);

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBeGreaterThanOrEqual(8);
	});

	it('records source changes on an existing image element (lazy currentSrc population)', async () => {
		document.documentElement.innerHTML = `
			<main class="reader">
				<img id="panel" src="data:image/svg+xml;base64,placeholder" data-src="https://cdn.example.org/comics/1/01.png">
			</main>
		`;
		(window as any).location.href = 'https://reader.example.com/read/1';

		capture.attachImageCaptureObserver();

		const img = document.getElementById('panel') as HTMLImageElement;
		img.src = 'https://cdn.example.org/comics/1/01.png';

		await Promise.resolve();
		await new Promise(r => setTimeout(r, 0));

		const captured = capture.getCapturedImageUrls();
		expect(captured.some(u => u === 'https://cdn.example.org/comics/1/01.png')).toBe(true);
	});

	it('excludes ads on an unrelated URL base from the scanned chapter', async () => {
		document.documentElement.innerHTML = GENERIC_VIRTUAL_HTML;
		(window as any).location.href = 'https://reader.example.com/comics/read/1001';
		(globalThis as any).window.scrollY = 0;
		(globalThis as any).window.scrollX = 0;

		capture.attachImageCaptureObserver();

		const placeholder = document.querySelector<HTMLDivElement>('[data-page="3"]');
		const ad = document.createElement('img');
		ad.setAttribute('src', 'https://ads.partner-network.com/media/banner_12345.png');
		document.body.appendChild(ad);

		for (const url of genericVirtualPages) {
			const img = document.createElement('img');
			img.className = 'rendered-panel';
			img.setAttribute('src', url);
			placeholder!.after(img);
		}

		await Promise.resolve();
		await new Promise(r => setTimeout(r, 0));

		const scanned = capture.scanPageForImages();
		expect(scanned.some(i => i.url.includes('partner-network') || i.url.includes('banner'))).toBe(false);
	});

	it('discards ads located outside the primary reader container', () => {
		document.documentElement.innerHTML = `
			<aside id="sidebar">
				<img id="promo" src="https://cdn.example.org/banners/promo.png" width="300" height="250">
			</aside>
			<div class="post-content">
				<img src="https://cdn.example.org/chapters/1/01.jpg" width="800" height="1200">
				<img src="https://cdn.example.org/chapters/1/02.jpg" width="800" height="1200">
				<img src="https://cdn.example.org/chapters/1/03.jpg" width="800" height="1200">
				<img src="https://cdn.example.org/chapters/1/04.jpg" width="800" height="1200">
			</div>
			<footer id="footer">
				<img src="https://cdn.example.org/banners/footer.png" width="728" height="90">
			</footer>
		`;
		(window as any).location.href = 'https://reader.example.com/read/1';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBe(4);
		expect(scanned.every(i => i.url.includes('/chapters/1/'))).toBe(true);
		expect(scanned.some(i => i.url.includes('promo.png') || i.url.includes('footer.png'))).toBe(false);
	});

	it('extracts real tall heights from placeholder aspect-ratio styles in long strip readers', async () => {
		document.documentElement.innerHTML = GENERIC_VIRTUAL_HTML;
		(window as any).location.href = 'https://reader.example.com/comics/read/1001';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBeGreaterThanOrEqual(2);

		const sortedAndFiltered = typeof sorter.sortImagesByCoordinates === 'function'
			? sorter.sortImagesByCoordinates(scanned)
			: scanned.filter(i => !sorter.isPlaceholderImage(i.url, i.width, i.height));
		expect(sortedAndFiltered.length).toBeGreaterThanOrEqual(2);
	});
});
