// -- IMAGE SORTER, NOISE FILTER & SPATIAL DEDUPLICATION ENGINE -- //

// IMPORTED TYPES
import type { ScannedImage } from '../types';

// -- CONSTANTS -- //

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

// -- FUNCTIONS & ALGORITHMS -- //

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
	const seenCoords = new Map<string, ScannedImage>();
	const result: ScannedImage[] = [];

	for (const img of images) {
		const canonical = img.canonicalUrl || getCanonicalUrl(img.url);

		// 1. DEDUPLICATE BY CANONICAL CLEAN URL
		if (canonical && seenUrls.has(canonical)) {
			continue;
		}

		// 2. DEDUPLICATE BY IDENTICAL SPATIAL BOUNDING BOX (OVERLAPPING CLONES)
		// ONLY DISCARD IF IDENTICAL URL, DHASH, OR EXPLICIT CLONE TO PREVENT DROPPING CAROUSEL SLIDES
		if (img.top > 0 || img.left > 0) {
			const coordKey = `${Math.round(img.top)}_${Math.round(img.left)}_${img.width}_${img.height}`;
			const existing = seenCoords.get(coordKey);
			if (existing) {
				const sameUrl = existing.url === img.url || existing.canonicalUrl === canonical;
				const sameHash = existing.dhash && img.dhash && existing.dhash === img.dhash;
				const isExplicitClone = /clone|fallback|overlay/i.test(img.url) || /clone|fallback|overlay/i.test(existing.url);
				if (sameUrl || sameHash || isExplicitClone) {
					continue;
				}
			} else {
				seenCoords.set(coordKey, img);
			}
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

// EXTRACT CLEAN LEAF FILENAME STRIPPING PATHS AND QUERY PARAMETERS
export function extractLeafFilename(rawUrl: string): string {
	if (!rawUrl) return '';
	try {
		const parsed = new URL(rawUrl, 'https://localhost');
		const segments = parsed.pathname.split('/').filter(Boolean);
		return segments.pop() || '';
	} catch {
		const withoutQuery = rawUrl.split('?')[0].split('#')[0];
		const segments = withoutQuery.split('/').filter(Boolean);
		return segments.pop() || '';
	}
}

// EXTRACT NUMERIC PAGE INDEX FROM URL (QUERY PARAMS OR LEAF FILENAME)
export function extractPageNumberFromUrl(rawUrl: string): number | undefined {
	if (!rawUrl) return undefined;
	try {
		const parsed = new URL(rawUrl, 'https://localhost');
		// 1. QUERY PARAMS FIRST (e.g. ?page=3, &p=3, &page_no=3)
		for (const param of ['page', 'p', 'page_no', 'page_num', 'index', 'idx', 'seq']) {
			const val = parsed.searchParams.get(param);
			if (val && /^\d+$/.test(val)) {
				const num = parseInt(val, 10);
				if (num >= 0 && num <= 9999) return num;
			}
		}

		// 2. LEAF FILENAME
		const leaf = extractLeafFilename(rawUrl);
		if (!leaf) return undefined;

		// STRIP RESPONSIVE SIZING ARTIFACTS LIKE "@2x", "800w", "1200x800"
		const cleanLeaf = leaf.replace(/@\d+x|\d+w|\d+h|\d+x\d+/gi, '');

		// MATCH TRAILING DIGITS BEFORE EXTENSION (e.g. "page_001.webp", "p-01.jpg", "comic_015.png")
		const trailingMatch = cleanLeaf.match(/(?:^|[-_a-zA-Z])0*(\d{1,4})\.[a-zA-Z0-9]+$/);
		if (trailingMatch && trailingMatch[1]) {
			const num = parseInt(trailingMatch[1], 10);
			if (num >= 0 && num <= 9999) return num;
		}

		// MATCH BARE NUMBER FILENAMES (e.g. "1.webp", "02.jpg")
		const bareMatch = cleanLeaf.match(/^0*(\d{1,4})\.[a-zA-Z0-9]+$/);
		if (bareMatch && bareMatch[1]) {
			const num = parseInt(bareMatch[1], 10);
			if (num >= 0 && num <= 9999) return num;
		}
	} catch {
		// REGEX FALLBACK IF URL PARSER FAILS
		const match = rawUrl.match(/(?:page|p|seq|index)[-_=]?0*(\d{1,4})/i);
		if (match && match[1]) {
			const num = parseInt(match[1], 10);
			if (num >= 0 && num <= 9999) return num;
		}
	}
	return undefined;
}

// EXTRACT NUMERIC PAGE INDEX FROM DOM ELEMENT ATTRIBUTES OR IDS
export function extractPageNumberFromElement(el: Element): number | undefined {
	if (!el) return undefined;

	// 1. DIRECT DATA ATTRIBUTES
	const targetAttrs = ['data-page', 'data-page-no', 'data-page-num', 'data-index', 'data-seq', 'data-img-index'];
	for (const attr of targetAttrs) {
		const val = el.getAttribute(attr);
		if (val && /^\d+$/.test(val.trim())) {
			const num = parseInt(val.trim(), 10);
			if (num >= 0 && num <= 9999) return num;
		}
	}

	// 2. ID ATTRIBUTE MATCHING PAGE PATTERNS
	const id = el.getAttribute('id') || '';
	const idMatch = id.match(/(?:page|image|img)[-_]?0*(\d{1,4})/i);
	if (idMatch && idMatch[1]) {
		return parseInt(idMatch[1], 10);
	}

	// 3. ANCESTOR CONTAINER WITH PAGE ATTRIBUTE
	if (typeof el.closest === 'function') {
		const parent = el.closest('[data-page], [data-page-no], [data-page-num], [data-index], [data-seq]');
		if (parent && parent !== el) {
			for (const attr of targetAttrs) {
				const val = parent.getAttribute(attr);
				if (val && /^\d+$/.test(val.trim())) {
					const num = parseInt(val.trim(), 10);
					if (num >= 0 && num <= 9999) return num;
				}
			}
		}
	}

	return undefined;
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

	// 4. MULTI-TIER COHERENT COMIC SEQUENCE SORTING
	return cleanImages.sort((a, b) => {
		// TIER 1: EXPLICIT EXTRACTED PAGE NUMBERS (CANONICAL AUTHOR READING ORDER)
		if (
			typeof a.pageNumber === 'number' &&
			typeof b.pageNumber === 'number' &&
			a.pageNumber !== b.pageNumber
		) {
			return a.pageNumber - b.pageNumber;
		}

		// TIER 2: TEMPORAL DISCOVERY ORDER (COLLECTED IN SEQUENTIAL TOP-TO-BOTTOM SCROLL)
		if (
			typeof a.captureIndex === 'number' &&
			typeof b.captureIndex === 'number' &&
			a.captureIndex !== b.captureIndex
		) {
			return a.captureIndex - b.captureIndex;
		}

		// TIER 3: SPATIAL 2D SORTING (TOP-TO-BOTTOM PRIMARY, LEFT-TO-RIGHT SECONDARY)
		const topDiff = a.top - b.top;
		if (Math.abs(topDiff) > 20) {
			return topDiff;
		}
		const leftDiff = a.left - b.left;
		if (Math.abs(leftDiff) > 20) {
			return leftDiff;
		}

		// TIER 4: DOCUMENT TREE ORDER IF DOM NODES SHARED NEARBY COORDINATES
		if (
			typeof a.domIndex === 'number' &&
			typeof b.domIndex === 'number' &&
			a.domIndex !== b.domIndex
		) {
			return a.domIndex - b.domIndex;
		}

		// TIER 5: CLEAN LEAF FILENAME NATURAL ALPHANUMERIC SORT (STRIPPING QUERY PARAMS AND TOKENS)
		const leafA = extractLeafFilename(a.url);
		const leafB = extractLeafFilename(b.url);
		if (leafA && leafB && leafA !== leafB) {
			return naturalAlphanumericSort(leafA, leafB);
		}

		// TIER 6: FULL URL FALLBACK
		return naturalAlphanumericSort(a.url, b.url);
	});
}

export function naturalAlphanumericSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
