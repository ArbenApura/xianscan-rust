// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';

let capture: typeof import('../src/content');
let sorter: typeof import('../src/utils/sorter');

beforeAll(async () => {
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

afterAll(() => {
	vi.restoreAllMocks();
});

describe('nested reader container detection', () => {
	it('isolates #readerarea and excludes slot/gambling banner ads and sidebar recommendations', () => {
		document.documentElement.innerHTML = `
			<main id="content">
				<div class="banner-zone">
					<img src="https://ads.example.com/banners/banner-iklan-300x37.gif" width="300" height="37">
					<img src="https://ads.example.com/banners/slot-promo-720x90.gif" width="300" height="37">
					<img src="https://ads.example.com/banners/pentaslot.gif" width="300" height="37">
					<img src="https://ads.example.com/banners/judi89.gif" width="300" height="37">
				</div>
				<div id="readerarea" class="rdcontainer">
					<img src="https://cdn.example.org/uploads/manga/chapter-2/1.jpeg" width="720" height="14200">
					<img src="https://cdn.example.org/uploads/manga/chapter-2/2.jpeg" width="720" height="12000">
					<img src="https://cdn.example.org/uploads/manga/chapter-2/3.jpeg" width="720" height="13500">
				</div>
				<aside class="sidebar">
					<img src="https://reader.example.com/assets/images/noimg165px.png" width="108" height="150">
					<img src="https://cdn.example.org/uploads/manga/other/thumbnail.jpg" width="225" height="150">
				</aside>
			</main>
		`;
		(window as any).location.href = 'https://reader.example.com/chapter-2/';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBe(3);
		expect(scanned.every(i => i.url.includes('/chapter-2/'))).toBe(true);
		expect(scanned.some(i => i.url.includes('banner') || i.url.includes('slot') || i.url.includes('judi') || i.url.includes('thumbnail'))).toBe(false);
	});

	it('detects images with leading or trailing whitespace in data-src and src attributes', () => {
		document.documentElement.innerHTML = `
			<div class="c-blog-post">
				<div class="entry-header header" id="manga-reading-nav-head"></div>
				<div class="entry-content">
					<div class="entry-content_wrap">
						<div class="read-container">
							<div class="reading-content">
								<div class="page-break no-gaps">
									<img id="image-0" data-src=" https://cdn.example.org/manga/chapter-1/002.jpg " class="wp-manga-chapter-img lazyloaded" src=" https://cdn.example.org/manga/chapter-1/002.jpg ">
								</div>
								<div class="page-break no-gaps">
									<img id="image-1" data-src=" https://cdn.example.org/manga/chapter-1/003.jpg " class="wp-manga-chapter-img lazyloaded" src=" https://cdn.example.org/manga/chapter-1/003.jpg ">
								</div>
								<div class="page-break no-gaps">
									<img id="image-2" data-src=" https://cdn.example.org/manga/chapter-1/004.jpg " class="wp-manga-chapter-img lazyloaded" src=" https://cdn.example.org/manga/chapter-1/004.jpg ">
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
		(window as any).location.href = 'https://reader.example.org/manga/chapter-1/';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBe(3);
		expect(scanned[0].url).toBe('https://cdn.example.org/manga/chapter-1/002.jpg');
		expect(scanned[1].url).toBe('https://cdn.example.org/manga/chapter-1/003.jpg');
		expect(scanned[2].url).toBe('https://cdn.example.org/manga/chapter-1/004.jpg');

		const clean = scanned.filter(img => !sorter.isPlaceholderImage(img.url, img.width, img.height));
		expect(clean.length).toBe(3);

		const sorted = sorter.sortImagesByCoordinates(clean);
		expect(sorted.length).toBe(3);
	});

	it('isolates section[data-image-data] and excludes wp-post-image book cover on rawkuma layout', () => {
		document.documentElement.innerHTML = `
			<div class="my-8 flex flex-col gap-y-3">
				<div class="flex flex-col gap-x-3 h-auto md:h-24 justify-center items-center">
					<a class="text-white" href="https://rawkuma.net/manga/saijaku-boukensha-ga-kanzen-drop/">
						<div class="w-[100px] h-auto p-2">
							<img width="1350" height="1920" src="https://rawkuma.net/wp-content/uploads/2025/10/kanzen-drop.jpg" class="rounded w-[100px] h-full object-fill text-transparent wp-post-image" alt="Cover" loading="lazy">
						</div>
					</a>
				</div>
				<div class="relative">
					<section class="mx-auto w-full md:w-[800px]">
						<section class="w-full flex flex-col justify-center items-center text-accent" data-image-data="1">
							${Array.from({ length: 18 }, (_, i) => `<img src="https://kuma.kyut.dev/wp-content/scr/s/manga/0/${i + 1}.jpg" alt="">`).join('')}
						</section>
					</section>
				</div>
			</div>
		`;
		(window as any).location.href = 'https://rawkuma.net/manga/saijaku-boukensha-ga-kanzen-drop/chapter-0.379396/';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBe(18);
		expect(scanned.some(i => i.url.includes('kanzen-drop.jpg'))).toBe(false);
		expect(scanned.every(i => i.url.includes('kuma.kyut.dev'))).toBe(true);
	});
});
