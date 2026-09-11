// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
	sortImagesByCoordinates,
	naturalAlphanumericSort,
	getCanonicalUrl,
	deduplicateScannedImages,
	filterOutlierThumbnails,
	filterResolutionOutliers,
	extractLeafFilename,
	extractPageNumberFromUrl,
	extractPageNumberFromElement
} from '../src/utils/sorter';
import type { ScannedImage } from '../src/types';

describe('getCanonicalUrl', () => {
	it('strips volatile tracking and cache-busting query parameters', () => {
		const raw1 = 'https://cdn.manga.com/ch1/01.jpg?t=1692800000&v=2';
		const raw2 = 'https://cdn.manga.com/ch1/01.jpg?width=800&quality=90';
		const raw3 = 'https://cdn.manga.com/ch1/01.jpg?utm_source=reader&utm_medium=web';

		expect(getCanonicalUrl(raw1)).toBe('https://cdn.manga.com/ch1/01.jpg');
		expect(getCanonicalUrl(raw2)).toBe('https://cdn.manga.com/ch1/01.jpg');
		expect(getCanonicalUrl(raw3)).toBe('https://cdn.manga.com/ch1/01.jpg');
	});

	it('preserves non-volatile and presigned query parameters', () => {
		const raw = 'https://cdn.manga.com/api/image?page=1&chapter=10';
		expect(getCanonicalUrl(raw)).toBe('https://cdn.manga.com/api/image?page=1&chapter=10');

		const signed = 'https://cdn.manga.com/ch1/01.jpg?token=abc123xyz';
		expect(getCanonicalUrl(signed)).toBe('https://cdn.manga.com/ch1/01.jpg?token=abc123xyz');
	});
});

describe('deduplicateScannedImages', () => {
	it('deduplicates images with different cache-busting query params', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/ch1/01.jpg?v=1', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/ch1/01.jpg?v=2', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/ch1/02.jpg?v=1', width: 800, height: 1200, top: 1200, left: 0 }
		];

		const deduped = deduplicateScannedImages(images);
		expect(deduped.length).toBe(2);
		expect(deduped[0].url).toBe('https://site.com/ch1/01.jpg?v=1');
		expect(deduped[1].url).toBe('https://site.com/ch1/02.jpg?v=1');
	});

	it('preserves images with distinct URLs even if dhash is computed', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/ch1/01.jpg', dhash: 'f0f0f0f0a5a5a5a5', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/ch1/02.jpg', dhash: 'f0f0f0f0a5a5a5a5', width: 800, height: 1200, top: 1200, left: 0 }
		];

		const deduped = deduplicateScannedImages(images);
		expect(deduped.length).toBe(2);
		expect(deduped[0].url).toBe('https://site.com/ch1/01.jpg');
		expect(deduped[1].url).toBe('https://site.com/ch1/02.jpg');
	});

	it('deduplicates overlapping clone elements at exact coordinates', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/img1.jpg', width: 800, height: 1200, top: 500, left: 20 },
			{ url: 'https://site.com/img_clone.jpg', width: 800, height: 1200, top: 500, left: 20 }
		];

		const deduped = deduplicateScannedImages(images);
		expect(deduped.length).toBe(1);
		expect(deduped[0].url).toBe('https://site.com/img1.jpg');
	});

	it('preserves distinct carousel/slider slides sharing identical coordinates', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/chapter-1/page-01.jpg', width: 800, height: 1200, top: 500, left: 20 },
			{ url: 'https://site.com/chapter-1/page-02.jpg', width: 800, height: 1200, top: 500, left: 20 },
			{ url: 'https://site.com/chapter-1/page-03.jpg', width: 800, height: 1200, top: 500, left: 20 }
		];

		const deduped = deduplicateScannedImages(images);
		expect(deduped.length).toBe(3);
		expect(deduped.map(i => i.url)).toEqual([
			'https://site.com/chapter-1/page-01.jpg',
			'https://site.com/chapter-1/page-02.jpg',
			'https://site.com/chapter-1/page-03.jpg'
		]);
	});
});

describe('sortImagesByCoordinates', () => {
	it('sorts images vertically from top to bottom', () => {
		const images: ScannedImage[] = [
			{ url: 'img3.jpg', width: 800, height: 1200, top: 2400, left: 0 },
			{ url: 'img1.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'img2.jpg', width: 800, height: 1200, top: 1200, left: 0 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual(['img1.jpg', 'img2.jpg', 'img3.jpg']);
	});

	it('sorts side-by-side images from left to right when top is equal', () => {
		const images: ScannedImage[] = [
			{ url: 'right.jpg', width: 400, height: 600, top: 100, left: 450 },
			{ url: 'left.jpg', width: 400, height: 600, top: 100, left: 50 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual(['left.jpg', 'right.jpg']);
	});

	it('tie-breaks identical or close coordinates with natural alphanumeric URL sort', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/page_10.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/page_2.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/page_1.jpg', width: 800, height: 1200, top: 0, left: 0 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual([
			'https://site.com/page_1.jpg',
			'https://site.com/page_2.jpg',
			'https://site.com/page_10.jpg'
		]);
	});

	it('filters out images smaller than minimum dimension threshold and blurry placeholders', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/valid.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/icon.png', width: 32, height: 32, top: 10, left: 0 },
			{ url: 'https://site.com/pixel.gif', width: 1, height: 1, top: 20, left: 0 },
			{ url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...', width: 800, height: 1200, top: 30, left: 0 },
			{ url: 'https://site.com/blurhash_thumb.jpg', width: 800, height: 1200, top: 40, left: 0 },
			{ url: 'https://site.com/loading.gif', width: 100, height: 100, top: 50, left: 0 },
			{ url: 'https://site.com/discord_banner.png', width: 400, height: 100, top: 60, left: 0 },
			{ url: 'https://googleads.g.doubleclick.net/ad.jpg', width: 728, height: 90, top: 70, left: 0 },
			{ url: 'https://site.com/assets/ad/ad5.gif', width: 800, height: 1772, top: 0, left: 0 },
			{ url: 'https://site.com/assets/app/app-qr.png', width: 400, height: 400, top: 65822, left: 0 }
		];

		const filtered = sortImagesByCoordinates(images);
		expect(filtered.map(i => i.url)).toEqual(['https://site.com/valid.jpg']);
	});

	it('filters out tiny outlier thumbnails when chapter has consistent full-page strips', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/page1.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/page2.jpg', width: 800, height: 1200, top: 1200, left: 0 },
			{ url: 'https://site.com/page3.jpg', width: 800, height: 1200, top: 2400, left: 0 },
			{ url: 'https://site.com/page4.jpg', width: 800, height: 1200, top: 3600, left: 0 },
			{ url: 'https://site.com/page5.jpg', width: 800, height: 1200, top: 4800, left: 0 },
			{ url: 'https://site.com/sidebar_recom.jpg', width: 150, height: 120, top: 500, left: 900 }
		];

		const filtered = sortImagesByCoordinates(images);
		expect(filtered.map(i => i.url)).toEqual([
			'https://site.com/page1.jpg',
			'https://site.com/page2.jpg',
			'https://site.com/page3.jpg',
			'https://site.com/page4.jpg',
			'https://site.com/page5.jpg'
		]);
	});

	it('drops bottom recommendation cover thumbnails when tall strip panels are present', () => {
		const images: ScannedImage[] = [
			{ url: 'https://cdn.example.org/1/1.jpg', width: 720, height: 9105, top: 633, left: 503 },
			{ url: 'https://site.example/uploads/cover1-300x400.webp', width: 168, height: 224, top: 112764, left: 320 },
			{ url: 'https://site.example/uploads/cover2-300x400.webp', width: 168, height: 224, top: 112764, left: 503 }
		];

		const filtered = filterOutlierThumbnails(images);
		expect(filtered.length).toBe(1);
		expect(filtered[0].url).toBe('https://cdn.example.org/1/1.jpg');
	});
});

describe('filterResolutionOutliers', () => {
	it('keeps portrait panels and drops a clear ad-shaped outlier', () => {
		const images: ScannedImage[] = [
			{ url: 'https://cdn.com/ch1/1.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://cdn.com/ch1/2.jpg', width: 800, height: 1200, top: 1200, left: 0 },
			{ url: 'https://ads.example.net/unit/300x37', width: 300, height: 37, top: 1500, left: 0 }
		];

		const filtered = filterResolutionOutliers(images);
		expect(filtered.some(i => i.url.includes('ads.example.net'))).toBe(false);
		expect(filtered.filter(i => i.url.includes('/ch1/')).length).toBe(2);
	});
});

describe('naturalAlphanumericSort', () => {
	it('sorts filenames in human natural order', () => {
		const files = ['page_10.jpg', 'page_1.jpg', 'page_2.jpg', 'page_20.jpg', 'page_3.jpg'];
		const sorted = [...files].sort(naturalAlphanumericSort);
		expect(sorted).toEqual(['page_1.jpg', 'page_2.jpg', 'page_3.jpg', 'page_10.jpg', 'page_20.jpg']);
	});
});

describe('extractLeafFilename', () => {
	it('extracts leaf filename without query parameters or paths', () => {
		expect(extractLeafFilename('https://cdn.example.org/chapters/100/page_001.webp?token=xyz')).toBe('page_001.webp');
		expect(extractLeafFilename('https://site.com/01.jpg')).toBe('01.jpg');
		expect(extractLeafFilename('/images/panel-99.png#preview')).toBe('panel-99.png');
	});
});

describe('extractPageNumberFromUrl', () => {
	it('extracts page number from query params or leaf filename patterns', () => {
		expect(extractPageNumberFromUrl('https://example.com/api/page?p=5&chapter=2')).toBe(5);
		expect(extractPageNumberFromUrl('https://example.com/comics/ch1_007.jpg')).toBe(7);
		expect(extractPageNumberFromUrl('https://example.com/comics/012.webp')).toBe(12);
		expect(extractPageNumberFromUrl('https://example.com/comics/page-3.png')).toBe(3);
		expect(extractPageNumberFromUrl('https://example.com/comics/1.avif')).toBe(1);
	});

	it('ignores image dimension tokens like 800x1200 or 300w', () => {
		expect(extractPageNumberFromUrl('https://example.com/banner_800x1200.jpg')).toBeUndefined();
	});
});

describe('extractPageNumberFromElement', () => {
	it('extracts page number from data attributes or element IDs', () => {
		const div = document.createElement('div');
		div.setAttribute('data-page', '15');
		expect(extractPageNumberFromElement(div)).toBe(15);

		const img = document.createElement('img');
		img.setAttribute('id', 'page-4');
		expect(extractPageNumberFromElement(img)).toBe(4);
	});
});

describe('multi-tier comic sorting in sortImagesByCoordinates', () => {
	it('preserves page sequence when user was scrolled down in virtual scroll reader', () => {
		// SIMULATE SCENARIO: PAGES 8-10 ARE IN DOM AT TOP 8000-10000, PAGES 1-7 UNMOUNTED
		const images: ScannedImage[] = [
			{ url: 'https://cdn.com/page-08.jpg', width: 800, height: 1000, top: 8000, left: 0, captureIndex: 7, pageNumber: 8 },
			{ url: 'https://cdn.com/page-09.jpg', width: 800, height: 1000, top: 9000, left: 0, captureIndex: 8, pageNumber: 9 },
			{ url: 'https://cdn.com/page-10.jpg', width: 800, height: 1000, top: 10000, left: 0, captureIndex: 9, pageNumber: 10 },
			{ url: 'https://cdn.com/page-01.jpg', width: 800, height: 1000, top: 11000, left: 0, captureIndex: 0, pageNumber: 1 },
			{ url: 'https://cdn.com/page-02.jpg', width: 800, height: 1000, top: 12000, left: 0, captureIndex: 1, pageNumber: 2 },
			{ url: 'https://cdn.com/page-03.jpg', width: 800, height: 1000, top: 13000, left: 0, captureIndex: 2, pageNumber: 3 },
			{ url: 'https://cdn.com/page-04.jpg', width: 800, height: 1000, top: 14000, left: 0, captureIndex: 3, pageNumber: 4 },
			{ url: 'https://cdn.com/page-05.jpg', width: 800, height: 1000, top: 15000, left: 0, captureIndex: 4, pageNumber: 5 },
			{ url: 'https://cdn.com/page-06.jpg', width: 800, height: 1000, top: 16000, left: 0, captureIndex: 5, pageNumber: 6 },
			{ url: 'https://cdn.com/page-07.jpg', width: 800, height: 1000, top: 17000, left: 0, captureIndex: 6, pageNumber: 7 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('preserves order using captureIndex even for opaque hash URLs without page numbers', () => {
		const images: ScannedImage[] = [
			{ url: 'https://cdn.com/hash_d4.jpg', width: 800, height: 1000, top: 3000, left: 0, captureIndex: 3 },
			{ url: 'https://cdn.com/hash_a1.jpg', width: 800, height: 1000, top: 0, left: 0, captureIndex: 0 },
			{ url: 'https://cdn.com/hash_c3.jpg', width: 800, height: 1000, top: 2000, left: 0, captureIndex: 2 },
			{ url: 'https://cdn.com/hash_b2.jpg', width: 800, height: 1000, top: 1000, left: 0, captureIndex: 1 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual([
			'https://cdn.com/hash_a1.jpg',
			'https://cdn.com/hash_b2.jpg',
			'https://cdn.com/hash_c3.jpg',
			'https://cdn.com/hash_d4.jpg'
		]);
	});

	it('orders pages correctly when query auth tokens or CDN hosts would invert alphanumeric sort', () => {
		// URL 2 HAS TOKEN 'aaa', URL 1 HAS TOKEN 'zzz'
		const images: ScannedImage[] = [
			{ url: 'https://cdn2.manga.com/ch1/02.jpg?token=aaa', width: 800, height: 1200, top: 0, left: 0, pageNumber: 2 },
			{ url: 'https://cdn1.manga.com/ch1/01.jpg?token=zzz', width: 800, height: 1200, top: 0, left: 0, pageNumber: 1 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual([
			'https://cdn1.manga.com/ch1/01.jpg?token=zzz',
			'https://cdn2.manga.com/ch1/02.jpg?token=aaa'
		]);
	});

	it('uses domIndex as tie-breaker when images have identical coordinates before loading', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/image-c.jpg', width: 800, height: 1200, top: 0, left: 0, domIndex: 2 },
			{ url: 'https://site.com/image-a.jpg', width: 800, height: 1200, top: 0, left: 0, domIndex: 0 },
			{ url: 'https://site.com/image-b.jpg', width: 800, height: 1200, top: 0, left: 0, domIndex: 1 }
		];

		const sorted = sortImagesByCoordinates(images);
		expect(sorted.map(i => i.url)).toEqual([
			'https://site.com/image-a.jpg',
			'https://site.com/image-b.jpg',
			'https://site.com/image-c.jpg'
		]);
	});
});


