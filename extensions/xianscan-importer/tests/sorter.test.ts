import { describe, it, expect } from 'vitest';
import {
	sortImagesByCoordinates,
	naturalAlphanumericSort,
	getCanonicalUrl,
	deduplicateScannedImages
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

	it('deduplicates images by visual perceptual dhash', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/ch1/01.jpg', dhash: 'f0f0f0f0a5a5a5a5', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://mirror.cdn.com/different_name.jpg', dhash: 'f0f0f0f0a5a5a5a5', width: 800, height: 1200, top: 50, left: 0 },
			{ url: 'https://site.com/ch1/02.jpg', dhash: '0000ffff11112222', width: 800, height: 1200, top: 1200, left: 0 }
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

	it('filters out images smaller than minimum dimension threshold and blurry placeholders', () => {
		const images: ScannedImage[] = [
			{ url: 'https://site.com/valid.jpg', width: 800, height: 1200, top: 0, left: 0 },
			{ url: 'https://site.com/icon.png', width: 32, height: 32, top: 10, left: 0 },
			{ url: 'https://site.com/pixel.gif', width: 1, height: 1, top: 20, left: 0 },
			{ url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...', width: 800, height: 1200, top: 30, left: 0 },
			{ url: 'https://site.com/blurhash_thumb.jpg', width: 800, height: 1200, top: 40, left: 0 },
			{ url: 'https://site.com/loading.gif', width: 100, height: 100, top: 50, left: 0 },
			{ url: 'https://site.com/discord_banner.png', width: 400, height: 100, top: 60, left: 0 },
			{ url: 'https://googleads.g.doubleclick.net/ad.jpg', width: 728, height: 90, top: 70, left: 0 }
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
			{ url: 'https://site.com/sidebar_recom.jpg', width: 150, height: 200, top: 500, left: 900 }
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
});

describe('naturalAlphanumericSort', () => {
	it('sorts filenames in human natural order', () => {
		const files = ['page_10.jpg', 'page_1.jpg', 'page_2.jpg', 'page_20.jpg', 'page_3.jpg'];
		const sorted = [...files].sort(naturalAlphanumericSort);
		expect(sorted).toEqual(['page_1.jpg', 'page_2.jpg', 'page_3.jpg', 'page_10.jpg', 'page_20.jpg']);
	});
});

