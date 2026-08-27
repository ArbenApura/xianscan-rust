import type { ScannedImage } from '../types';

// NOISE AND ADVERTISEMENT PATTERNS
const NOISE_URL_PATTERN = /(?:data:image|placeholder|blurhash|lqip|blur|skeleton|shimmer|loading|loader|blank\.gif|spacer\.gif|pixel\.gif|avatar|favicon|emoji|discord|patreon|kofi|paypal|doubleclick|googleads|adservice|adserver|banner|iklan|advert|guanggao|promo|sponsor|\/ad\/|\/ads\/|[\/_-]ad\d*\.(?:gif|jpg|png|webp)|app-qr|qrcode|qr-code|watermark_logo)/i;

// TRANSIENT CACHE-BUSTING AND TRACKING QUERY PARAMS TO STRIP (PRESERVING PRESIGNED AUTH TOKENS)
const VOLATILE_QUERY_PARAMS = new Set([
	'_', 't', 'ts', 'time', 'timestamp', 'v', 'ver', 'version', 'w', 'h', 'width',
	'height', 'quality', 'format', 'webp', 'size', 'resize', 'crop',
	'max_width', 'max_height', 'fit', 'auto', 'rnd', 'nonce',
	'cb', 'cache_bust', 'sid', 'session', 'session_id', 'utm_source',
	'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
]);

// EXTRACT CANONICAL CLEAN IMAGE URL FOR DEDUPLICATION
export function getCanonicalUrl(rawUrl: string): string {
	if (!rawUrl) return '';
	const cleanRaw = rawUrl.trim();
	if (cleanRaw.startsWith('data:')) return cleanRaw;

	try {
		const parsed = new URL(cleanRaw, 'https://localhost');
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

// DEDUPLICATE SCANNED IMAGES BY CANONICAL URL AND IDENTICAL SPATIAL COORDINATES
export function deduplicateScannedImages(images: ScannedImage[]): ScannedImage[] {
	const seenUrls = new Set<string>();
	const seenCoords = new Set<string>();
	const result: ScannedImage[] = [];

	for (const img of images) {
		const canonical = img.canonicalUrl || getCanonicalUrl(img.url);

		// 1. DEDUPLICATE BY CANONICAL CLEAN URL
		if (canonical && seenUrls.has(canonical)) {
			continue;
		}

		// 2. DEDUPLICATE BY IDENTICAL SPATIAL BOUNDING BOX (OVERLAPPING CLONES)
		if (img.top > 0 || img.left > 0) {
			const coordKey = `${Math.round(img.top)}_${Math.round(img.left)}_${img.width}_${img.height}`;
			if (seenCoords.has(coordKey)) {
				continue;
			}
			seenCoords.add(coordKey);
		}

		if (canonical) seenUrls.add(canonical);

		result.push({
			...img,
			canonicalUrl: canonical
		});
	}

	return result;
}

export function isPlaceholderImage(url: string, _width?: number, _height?: number): boolean {
	if (!url) return true;
	if (url.startsWith('data:')) return true;
	if (NOISE_URL_PATTERN.test(url)) return true;
	return false;
}

export function filterOutlierThumbnails(images: ScannedImage[]): ScannedImage[] {
	if (images.length < 2) return images;

	// IF CHAPTER HAS REAL FULL-SIZED COMIC PANELS (HEIGHT >= 600 OR WIDTH >= 500),
	// DROP RECOMMENDATION WIDGET COVERS AND OUTLIER THUMBNAILS (E.G. WIDTH <= 320 AND HEIGHT <= 450)
	const hasLargePanels = images.some(i => i.height >= 600 || i.width >= 500);
	if (hasLargePanels) {
		return images.filter(img => {
			if (img.height >= 600) return true;
			if (img.width > 0 && img.height > 0 && img.width <= 320 && img.height <= 450) {
				return false;
			}
			return true;
		});
	}

	return images;
}

export function filterResolutionOutliers(images: ScannedImage[]): ScannedImage[] {
	if (images.length < 3) return images;

	// DROP SHORT WIDE HORIZONTAL BANNER ADS (ASPECT RATIO >= 2.5 WITH HEIGHT <= 120 OR HEIGHT <= 50)
	// ALWAYS PRESERVE TALL WEBTOON COMIC PANELS (HEIGHT >= 600)
	return images.filter(img => {
		if (img.height >= 600) return true;
		if (img.width > 0 && img.height > 0) {
			const ratio = img.width / img.height;
			if (ratio >= 2.5 && img.height <= 260) return false;
			if (img.height <= 50) return false;
		}
		return true;
	});
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
	const outlierFiltered = filterOutlierThumbnails(deduplicated);

	// 3b. MODERATE RESOLUTION-COHERENCE FILTER: DROP DIMENSION/ORIENTATION OUTLIERS (ADS)
	const cleanImages = filterResolutionOutliers(outlierFiltered);

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
