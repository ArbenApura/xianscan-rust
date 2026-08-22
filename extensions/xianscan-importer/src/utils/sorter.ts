import type { ScannedImage } from '../types';

// NOISE AND ADVERTISEMENT PATTERNS
const NOISE_URL_PATTERN = /(?:data:image|placeholder|blurhash|lqip|blur|skeleton|shimmer|loading|loader|blank\.gif|spacer\.gif|pixel\.gif|avatar|favicon|emoji|discord|patreon|kofi|paypal|doubleclick|googleads|adservice|adserver|banner_ad|ad_banner|affiliate|sponsor|watermark_logo)/i;

// TRANSIENT CACHE-BUSTING AND TRACKING QUERY PARAMS TO STRIP
const VOLATILE_QUERY_PARAMS = new Set([
	'_', 't', 'ts', 'time', 'timestamp', 'token', 'sig', 'sign', 'signature',
	'auth', 'auth_key', 'key', 'v', 'ver', 'version', 'w', 'h', 'width',
	'height', 'quality', 'format', 'webp', 'size', 'resize', 'crop',
	'max_width', 'max_height', 'fit', 'auto', 'rnd', 'nonce', 'expires',
	'exp', 'cb', 'cache_bust', 'sid', 'session', 'session_id', 'utm_source',
	'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
]);

// EXTRACT CANONICAL CLEAN IMAGE URL FOR DEDUPLICATION
export function getCanonicalUrl(rawUrl: string): string {
	if (!rawUrl) return '';
	if (rawUrl.startsWith('data:')) return rawUrl;

	try {
		const parsed = new URL(rawUrl, 'https://localhost');
		// COLLECT ALL UNIQUE KEYS FIRST TO AVOID ITERATION ISSUES ON DELETION
		const allKeys = Array.from(new Set(parsed.searchParams.keys()));
		for (const key of allKeys) {
			const lowerKey = key.toLowerCase();
			if (VOLATILE_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_') || lowerKey.startsWith('cf_')) {
				parsed.searchParams.delete(key);
			}
		}

		// STRIP FRAGMENT
		parsed.hash = '';

		// RETURN NORMALIZED CLEAN PATH + SEARCH
		const searchStr = parsed.searchParams.toString();
		const cleanSearch = searchStr ? `?${searchStr}` : '';
		return `${parsed.protocol}//${parsed.host}${parsed.pathname}${cleanSearch}`;
	} catch {
		// FALLBACK: BASIC REGEX STRIP IF URL PARSING FAILS
		return rawUrl.split('#')[0].split('?')[0];
	}
}

// COMPUTE 64-BIT PERCEPTUAL DIFFERENCE HASH (dHash) FROM DOM IMAGE ELEMENT
export function computeDHashFromElement(img: HTMLImageElement): string | null {
	if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
		return null;
	}

	try {
		const canvas = document.createElement('canvas');
		canvas.width = 9;
		canvas.height = 8;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;

		ctx.drawImage(img, 0, 0, 9, 8);
		const imgData = ctx.getImageData(0, 0, 9, 8);
		const data = imgData.data;

		// COMPUTE GRAYSCALE BRIGHTNESS AND BUILD 64-BIT DIFFERENCE HASH
		let hashHex = '';
		for (let row = 0; row < 8; row++) {
			let rowByte = 0;
			for (let col = 0; col < 8; col++) {
				const leftIdx = (row * 9 + col) * 4;
				const rightIdx = (row * 9 + col + 1) * 4;

				// PERCEPTUAL LUMINANCE: 0.299*R + 0.587*G + 0.114*B
				const leftLum = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
				const rightLum = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];

				if (leftLum > rightLum) {
					rowByte |= (1 << (7 - col));
				}
			}
			hashHex += rowByte.toString(16).padStart(2, '0');
		}

		return hashHex;
	} catch {
		// CROSS-ORIGIN TAINTED CANVAS FALLBACK
		return null;
	}
}

// DEDUPLICATE SCANNED IMAGES BY CANONICAL URL, VISUAL HASH, AND IDENTICAL SPATIAL COORDINATES
export function deduplicateScannedImages(images: ScannedImage[]): ScannedImage[] {
	const seenUrls = new Set<string>();
	const seenHashes = new Set<string>();
	const seenCoords = new Set<string>();
	const result: ScannedImage[] = [];

	for (const img of images) {
		const canonical = img.canonicalUrl || getCanonicalUrl(img.url);

		// 1. DEDUPLICATE BY CANONICAL CLEAN URL
		if (canonical && seenUrls.has(canonical)) {
			continue;
		}

		// 2. DEDUPLICATE BY VISUAL PERCEPTUAL DHASH IF AVAILABLE
		if (img.dhash) {
			if (seenHashes.has(img.dhash)) {
				continue;
			}
		}

		// 3. DEDUPLICATE BY IDENTICAL SPATIAL BOUNDING BOX (OVERLAPPING CLONES)
		if (img.top > 0 || img.left > 0) {
			const coordKey = `${Math.round(img.top)}_${Math.round(img.left)}_${img.width}_${img.height}`;
			if (seenCoords.has(coordKey)) {
				continue;
			}
			seenCoords.add(coordKey);
		}

		if (canonical) seenUrls.add(canonical);
		if (img.dhash) seenHashes.add(img.dhash);

		result.push({
			...img,
			canonicalUrl: canonical
		});
	}

	return result;
}

export function isPlaceholderImage(url: string, width?: number, height?: number): boolean {
	if (!url) return true;
	if (url.startsWith('data:')) return true;
	if (NOISE_URL_PATTERN.test(url)) return true;
	// REJECT TINY MICRO-THUMBNAILS (< 100PX) WHEN DIMENSIONS ARE KNOWN
	if (width !== undefined && height !== undefined && width > 0 && height > 0) {
		if (width < 100 && height < 100) return true;
		// REJECT EXTREME NEEDLE-THIN DIVIDING LINES OR BORDERS
		const ratio = Math.max(width / height, height / width);
		if (ratio > 20) return true;
	}
	return false;
}

export function filterOutlierThumbnails(images: ScannedImage[]): ScannedImage[] {
	if (images.length < 5) return images;

	// CALCULATE MEDIAN WIDTH FOR IMAGES WITH KNOWN WIDTH > 0
	const widths = images.map(i => i.width).filter(w => w > 0).sort((a, b) => a - b);
	if (widths.length < 5) return images;

	const medianWidth = widths[Math.floor(widths.length / 2)];
	// IF MEDIAN IS SUBSTANTIAL (E.G. COMIC STRIPS >= 400PX), DROP IMAGES LESS THAN 35% OF MEDIAN
	if (medianWidth >= 400) {
		return images.filter(img => {
			if (img.width > 0 && img.width < medianWidth * 0.35) {
				return false;
			}
			return true;
		});
	}
	return images;
}

export function sortImagesByCoordinates(
	images: ScannedImage[],
	minWidth = 100,
	minHeight = 100
): ScannedImage[] {
	// 1. FILTER OUT PLACEHOLDER BLURHASHES, NOISE URLS, AND TINY ICONS
	const filtered = images.filter(img => {
		if (isPlaceholderImage(img.url, img.width, img.height)) return false;
		if (img.width > 0 && img.height > 0) {
			if (img.width < minWidth && img.height < minHeight) return false;
		}
		return true;
	});

	// 2. DEDUPLICATE BY CANONICAL URL, VISUAL DHASH, AND SPATIAL OVERLAP
	const deduplicated = deduplicateScannedImages(filtered);

	// 3. FILTER OUTLIER THUMBNAILS IF STRIP HAS CONSISTENT PAGES
	const cleanImages = filterOutlierThumbnails(deduplicated);

	// 4. SPATIAL 2D SORTING: TOP-TO-BOTTOM PRIMARY, LEFT-TO-RIGHT SECONDARY (WITHIN 20PX BAND)
	return cleanImages.sort((a, b) => {
		const topDiff = a.top - b.top;
		if (Math.abs(topDiff) > 20) {
			return topDiff;
		}
		return a.left - b.left;
	});
}

export function naturalAlphanumericSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
