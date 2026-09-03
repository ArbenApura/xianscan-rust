// -- CONTENT HEURISTIC SCANNER AND VIRTUAL-SCROLL PRELOADER -- //

// IMPORTED TYPES
import type { ScannedImage } from '../types';

// IMPORTED MODULES
import { sortImagesByCoordinates, isPlaceholderImage, computeDHashFromElement } from '../utils/sorter';
import { NOISE_CONTAINER_SELECTORS, isFloatingOrSticky, isLikelyAdOrBannerImage } from '../core/heuristics/ad-detector';
import { getCanonicalUrl, extractPlaceholderDimensions } from '../core/heuristics/url-clustering';

// -- CONSTANTS -- //

const IMG_LAZY_ATTRIBUTES = [
	'data-src',
	'data-original',
	'data-url',
	'data-lazy-src',
	'data-actual-src',
	'data-full-image',
	'data-real-src',
	'data-origin'
];

// -- STATES -- //

// MODULE-LEVEL SET OF EVERY ABSOLUTE IMAGE URL OBSERVED DURING THE PAGE LIFETIME.
// VIRTUAL-SCROLL READERS EVICT OFFSCREEN IMG NODES FROM THE DOM, SO
// SNAPSHOT SCANS NEVER SEE THEM. THIS SET PRESERVES THEIR URLS PERMANENTLY.
const capturedImageUrls = new Set<string>();
let captureObserverAttached = false;

// -- HELPER FUNCTIONS -- //

function parseSrcset(srcset: string): string[] {
	return srcset
		.split(',')
		.map(entry => entry.trim().split(/\s+/)[0])
		.filter(Boolean);
}

function extractFromEmbeddedJson(): string[] {
	const results: string[] = [];
	try {
		const jsonScripts = document.querySelectorAll('script[type="application/json"], script[id*="data"], script[id*="state"]');
		for (const el of Array.from(jsonScripts)) {
			const text = el.textContent || '';
			const matches = text.match(/https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s\\]*)?/gi);
			if (matches && matches.length >= 3) {
				results.push(...matches);
			}
		}
	} catch {
		// IGNORE PARSE ERRORS ON ARBITRARY SCRIPT BLOCKS
	}
	return Array.from(new Set(results));
}

function absoluteImageUrl(src: string): string | null {
	if (!src) return null;
	const clean = src.trim();
	if (clean.startsWith('data:')) return null;
	try {
		return new URL(clean, window.location.href).href;
	} catch {
		// IGNORE INVALID URL
		return null;
	}
}

function recordElementImageUrls(el: Element): void {
	// IGNORE MUTATIONS OCCURRING INSIDE NOISE CONTAINERS (HEADERS, FOOTERS, ADS, SIDEBARS)
	if (typeof el.closest === 'function' && el.closest(NOISE_CONTAINER_SELECTORS)) {
		return;
	}

	const readerContainer = findPrimaryReaderContainer();
	if (readerContainer && typeof el.closest === 'function' && !readerContainer.contains(el)) {
		return;
	}

	if (el instanceof HTMLImageElement) {
		if (isLikelyAdOrBannerImage(el)) return;
		// RESOLVE ALL CANDIDATE SOURCES (DOM + LAZY ATTRIBUTES)
		const candidates = [
			...IMG_LAZY_ATTRIBUTES.map(a => el.getAttribute(a)),
			el.srcset ? parseSrcset(el.srcset).pop() : null,
			el.currentSrc,
			el.getAttribute('src'),
			el.src
		].filter(Boolean) as string[];
		for (const cand of candidates) {
			const abs = absoluteImageUrl(cand);
			if (abs && !isPlaceholderImage(abs)) {
				capturedImageUrls.add(abs);
			}
		}
	}

	// CSS BACKGROUND-IMAGE CONTAINERS
	if (el instanceof HTMLElement) {
		const style = el.getAttribute('style') || '';
		const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
		if (match && match[1] && !match[1].startsWith('data:')) {
			const abs = absoluteImageUrl(match[1]);
			if (abs && !isPlaceholderImage(abs)) {
				capturedImageUrls.add(abs);
			}
		}
	}
}

function findScrollableReaderContainer(): HTMLElement | null {
	const candidates = Array.from(
		document.querySelectorAll<HTMLElement>(
			'[class*="reader"], [id*="reader"], [class*="viewport"], [class*="scroll-container"], main'
		)
	);
	for (const el of candidates) {
		const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
		if (!style) continue;
		const overflowY = style.overflowY;
		if (overflowY === 'auto' || overflowY === 'scroll') {
			if (el.scrollHeight > el.clientHeight + 1) {
				return el;
			}
		}
	}
	return null;
}

// -- SCANNER EXPORTS -- //

// WATCH THE DOCUMENT FOR IMAGE ELEMENTS AS A VIRTUAL-SCROLL READER MOUNTS THEM
export function attachImageCaptureObserver(): void {
	if (captureObserverAttached) return;
	captureObserverAttached = true;

	// SNAPSHOT CURRENTLY MOUNTED ELEMENTS TO PRIME THE SET
	document
		.querySelectorAll('img, picture img, div[style*="background-image"], section[style*="background-image"]')
		.forEach(recordElementImageUrls);

	const observer = new MutationObserver(mutations => {
		for (const mutation of mutations) {
			if (mutation.type === 'attributes') {
				// IMAGE SOURCE CHANGED ON AN EXISTING ELEMENT
				recordElementImageUrls(mutation.target as Element);
				continue;
			}
			for (const node of mutation.addedNodes) {
				if (!(node instanceof Element)) continue;
				recordElementImageUrls(node);
				node
					.querySelectorAll('img, picture img, [style*="background-image"]')
					.forEach(recordElementImageUrls);
			}
		}
	});

	observer.observe(document, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['src', 'srcset', 'style', ...IMG_LAZY_ATTRIBUTES]
	});
}

// RETURN CAPTURED URLS OBSERVED (VIRTUAL-SCROLL PAGES, LAZY IMAGES, BACKGROUNDS)
export function getCapturedImageUrls(): string[] {
	return Array.from(capturedImageUrls);
}

export function registerCapturedImageUrl(url: string): void {
	const abs = absoluteImageUrl(url);
	if (abs && !isPlaceholderImage(abs)) {
		capturedImageUrls.add(abs);
	}
}

export function resetCapturedImageUrls(): void {
	capturedImageUrls.clear();
}

// DISCOVER THE PRIMARY COMIC READER CONTAINER BASED ON DENSITY AND TALL-PANEL HEIGHT SCORE
export function findPrimaryReaderContainer(): HTMLElement | null {
	// 1. CHECK SPECIFIC HIGH-PRIORITY MANGA/WEBTOON READER CONTAINERS FIRST
	const priorityCandidates = Array.from(
		document.querySelectorAll<HTMLElement>(
			'#readerarea, div[class*="reading-content"], div[class*="reader-area"], div[class*="readerarea"], div[class*="chapter-images"], div[class*="wt_viewer"], #comic_view_area, div[class*="viewer-cnt"], div[class*="v-reader"]'
		)
	);
	for (const container of priorityCandidates) {
		if (typeof container.closest === 'function' && container.closest(NOISE_CONTAINER_SELECTORS)) continue;
		const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img, picture img')).filter(
			img => !img.getAttribute('data-xianscan-injected') && !isLikelyAdOrBannerImage(img)
		);
		const placeholders = Array.from(container.querySelectorAll<HTMLElement>('[data-page], [class*="page"], [id*="page"]'));
		if (imgs.length >= 1 || placeholders.length >= 1) {
			return container;
		}
	}

	// 2. GENERAL CANDIDATES
	const candidates = Array.from(
		document.querySelectorAll<HTMLElement>(
			'main, article, div[class*="viewer"], div[class*="reading"], div[class*="reader"], div[id*="reader"], div[class*="chapter"], div[id*="chapter"], section, div[class*="comic"], div[id*="comic"], div[class*="entry-content"], div[class*="post-content"]'
		)
	);

	let bestContainer: HTMLElement | null = null;
	let highestScore = -1;

	for (const container of candidates) {
		if (typeof container.closest === 'function' && container.closest(NOISE_CONTAINER_SELECTORS)) continue;

		const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img, picture img')).filter(
			img => !img.getAttribute('data-xianscan-injected') && !isLikelyAdOrBannerImage(img) && !img.closest(NOISE_CONTAINER_SELECTORS)
		);
		const placeholders = Array.from(container.querySelectorAll<HTMLElement>('[data-page], [class*="page"], [id*="page"]'));

		const totalItems = Math.max(imgs.length, placeholders.length);
		if (totalItems < 1) continue;

		// CALCULATE HEIGHT SCORE (REWARD TALL COMIC STRIP PANELS > 700PX)
		let heightScore = 0;
		for (const img of imgs) {
			const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
			const h = img.naturalHeight || (rect ? rect.height : 0);
			if (h >= 700) heightScore += 5;
			else if (h >= 400) heightScore += 2;
		}
		for (const p of placeholders) {
			const dims = extractPlaceholderDimensions(p);
			if (dims.height >= 700) heightScore += 5;
			else if (dims.height >= 400) heightScore += 2;
		}

		// SCORE = ITEM COUNT * 5 + HEIGHT SCORE
		const score = totalItems * 5 + heightScore;
		if (score > highestScore && totalItems >= 1) {
			highestScore = score;
			bestContainer = container;
		}
	}

	return bestContainer;
}

// SCAN PAGE DOM TO EXTRACT AND SORT VALID READER IMAGE PANELS
export function scanPageForImages(): ScannedImage[] {
	const imagesMap = new Map<string, ScannedImage>();
	const seenCanonicalUrls = new Set<string>();

	// DISCOVER HIGH-CONFIDENCE PRIMARY READER CONTAINER DYNAMICALLY
	const dynamicContainer = findPrimaryReaderContainer();
	const rootScope: Document | Element = dynamicContainer || document;

	// 1. SCAN STANDARD IMG AND PICTURE ELEMENTS WITHIN ROOTSCOPE
	const imgElements = rootScope.querySelectorAll<HTMLImageElement>('img, picture img');
	for (const img of Array.from(imgElements)) {
		// IGNORE INJECTED CLONES
		if (img.getAttribute('data-xianscan-injected') === 'true') {
			continue;
		}

		// DROP IMAGES NESTED WITHIN NOISE CONTAINERS (HEADERS, FOOTERS, SIDEBARS, COMMENTS, ADS)
		if (img.closest(NOISE_CONTAINER_SELECTORS)) continue;

		// DROP FLOATING OR STICKY ELEMENTS (BANNERS, DOCKED NAVS, FLOATING PROMOS)
		if (isFloatingOrSticky(img)) continue;

		// DROP BANNER ADS, PROMO OVERLAYS, EXTERNAL AD LINKS, AND ABNORMAL ASPECT RATIOS
		if (isLikelyAdOrBannerImage(img)) continue;

		// RESOLVE HIGHEST-PRIORITY SOURCE ATTRIBUTE
		const candidates = [
			img.getAttribute('data-src'),
			img.getAttribute('data-original'),
			img.getAttribute('data-url'),
			img.getAttribute('data-lazy-src'),
			img.getAttribute('data-actual-src'),
			img.getAttribute('data-full-image'),
			img.getAttribute('data-real-src'),
			img.getAttribute('data-origin'),
			img.srcset ? parseSrcset(img.srcset).pop() : null,
			img.currentSrc,
			img.src
		].map(s => (s ? s.trim() : null)).filter(Boolean) as string[];

		let possibleSrc: string | null = null;
		for (const cand of candidates) {
			if (!cand.startsWith('data:') && !cand.includes('placeholder') && !cand.includes('blur')) {
				possibleSrc = cand;
				break;
			}
		}

		if (!possibleSrc && candidates.length > 0) {
			possibleSrc = candidates[0];
		}

		if (!possibleSrc || possibleSrc.startsWith('data:')) continue;

		let absoluteUrl = possibleSrc;
		try {
			absoluteUrl = new URL(possibleSrc.trim(), window.location.href).href;
		} catch {
			continue;
		}

		const canonicalUrl = getCanonicalUrl(absoluteUrl);
		if (seenCanonicalUrls.has(canonicalUrl)) {
			continue;
		}

		let dhash: string | undefined;
		if (img.complete && img.naturalWidth > 0) {
			dhash = computeDHashFromElement(img) || undefined;
		}

		const rect = img.getBoundingClientRect();
		const top = rect.top + window.scrollY;
		const left = rect.left + window.scrollX;
		const width = img.naturalWidth || rect.width || 0;
		const height = img.naturalHeight || rect.height || 0;

		if (img.naturalWidth > 0 && img.naturalWidth < 80 && rect.width > 200) {
			continue;
		}

		seenCanonicalUrls.add(canonicalUrl);

		imagesMap.set(absoluteUrl, {
			url: absoluteUrl,
			canonicalUrl,
			dhash,
			width,
			height,
			top,
			left,
			alt: img.alt || '',
			selected: true
		});
	}

	// 2. SCAN CSS BACKGROUND-IMAGE CONTAINERS WITHIN ROOTSCOPE
	const bgElements = rootScope.querySelectorAll<HTMLElement>('div[style*="background-image"], section[style*="background-image"]');
	for (const el of Array.from(bgElements)) {
		if (el.closest(NOISE_CONTAINER_SELECTORS)) continue;
		const style = el.getAttribute('style') || '';
		const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
		if (match && match[1] && !match[1].startsWith('data:')) {
			try {
				const absoluteUrl = new URL(match[1], window.location.href).href;
				const canonicalUrl = getCanonicalUrl(absoluteUrl);
				if (seenCanonicalUrls.has(canonicalUrl)) {
					continue;
				}

				const rect = el.getBoundingClientRect();
				seenCanonicalUrls.add(canonicalUrl);

				imagesMap.set(absoluteUrl, {
					url: absoluteUrl,
					canonicalUrl,
					width: rect.width || 800,
					height: rect.height || 1200,
					top: rect.top + window.scrollY,
					left: rect.left + window.scrollX,
					selected: true
				});
			} catch {
				// IGNORE INVALID URL
			}
		}
	}

	// 3. SUPPLEMENT WITH EMBEDDED JSON STATE IF DOM HAS FEW IMAGES
	let fallbackTop = 0;
	if (imagesMap.size < 3) {
		const jsonUrls = extractFromEmbeddedJson();
		for (const url of jsonUrls) {
			const canonicalUrl = getCanonicalUrl(url);
			if (!imagesMap.has(url) && !seenCanonicalUrls.has(canonicalUrl)) {
				seenCanonicalUrls.add(canonicalUrl);
				imagesMap.set(url, {
					url,
					canonicalUrl,
					width: 800,
					height: 1200,
					top: fallbackTop,
					left: 0,
					selected: true
				});
				fallbackTop += 1200;
			}
		}
	}

	// 4. SUPPLEMENT WITH CAPTURED VIRTUAL-SCROLL OR LAZY URLS NOT PRESENT IN DOM SNAPSHOT
	let virtualFallbackTop = 0;
	for (const imgData of imagesMap.values()) {
		const bottom = imgData.top + imgData.height;
		if (bottom > virtualFallbackTop) {
			virtualFallbackTop = bottom;
		}
	}

	const capturedUrls = getCapturedImageUrls();
	const unmountedPlaceholders = Array.from(rootScope.querySelectorAll<HTMLElement>('[data-page], [class*="page"], [id*="page"]')).filter(
		el => el.querySelectorAll('img').length === 0
	);
	let placeholderIdx = 0;

	for (const url of capturedUrls) {
		const canonicalUrl = getCanonicalUrl(url);
		if (!imagesMap.has(url) && !seenCanonicalUrls.has(canonicalUrl)) {
			seenCanonicalUrls.add(canonicalUrl);
			const placeholderEl = unmountedPlaceholders[placeholderIdx] || null;
			const dims = extractPlaceholderDimensions(placeholderEl);
			placeholderIdx++;

			imagesMap.set(url, {
				url,
				canonicalUrl,
				width: dims.width,
				height: dims.height,
				top: virtualFallbackTop,
				left: 0,
				selected: true
			});
			virtualFallbackTop += dims.height;
		}
	}

	const rawImages = Array.from(imagesMap.values());
	return sortImagesByCoordinates(rawImages);
}

// PROMOTE KNOWN LAZY ATTRIBUTES DIRECTLY ON READER IMAGES (INSTANT PRELOAD)
export function forcePromoteLazyAttributes(): number {
	const rootScope = findPrimaryReaderContainer() || document;
	const imgs = Array.from(rootScope.querySelectorAll<HTMLImageElement>('img, picture img'));
	let promoted = 0;

	for (const img of imgs) {
		if (img.getAttribute('data-xianscan-injected') === 'true') continue;

		for (const attr of IMG_LAZY_ATTRIBUTES) {
			const lazyVal = img.getAttribute(attr);
			if (lazyVal && !lazyVal.startsWith('data:') && !lazyVal.includes('placeholder') && !lazyVal.includes('blur')) {
				if (!img.src || img.src.startsWith('data:') || img.src.includes('placeholder') || img.src.includes('blank.gif')) {
					try {
						img.src = new URL(lazyVal.trim(), window.location.href).href;
						promoted++;
					} catch {
						// IGNORE URL RESOLUTION FAILURE
					}
				}
				// ENSURE OBSERVER RECORDS IT
				registerCapturedImageUrl(lazyVal);
				break;
			}
		}
	}
	return promoted;
}

// AUTO-SCROLL THROUGH THE ENTIRE READER (WINDOW AND/OR INNER VIRTUAL-SCROLL CONTAINER)
// TO TRIGGER LAZY-LOADS AND LET THE MUTATIONOBSERVER CAPTURE EVERY MOUNTED PANEL.
export async function fastScrollPreload(): Promise<void> {
	// 1. FIRST ATTACH CAPTURE OBSERVER SO ALL SCROLL AND DOM MUTATIONS ARE RECORDED
	attachImageCaptureObserver();

	// 2. PROMOTE EXISTING LAZY ATTRIBUTES IMMEDIATELY WITHOUT WAITING FOR INTERSECTIONOBSERVER
	forcePromoteLazyAttributes();

	const step = 600;
	const delay = 35;

	type ScrollTarget = {
		getMax: () => number;
		init: number;
		set: (y: number) => void;
		el: Window | HTMLElement;
	};
	const targets: ScrollTarget[] = [];

	targets.push({
		getMax: () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
		init: window.scrollY,
		set: (y) => {
			window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
			window.dispatchEvent(new Event('scroll', { bubbles: true }));
		},
		el: window
	});

	const inner = findScrollableReaderContainer();
	if (inner) {
		targets.push({
			getMax: () => inner.scrollHeight,
			init: inner.scrollTop,
			set: (y) => {
				inner.scrollTop = y;
				inner.dispatchEvent(new Event('scroll', { bubbles: true }));
			},
			el: inner
		});
	}

	for (const t of targets) {
		let currentY = 0;
		let maxCycles = 150;
		while (currentY < t.getMax() && maxCycles > 0) {
			currentY += step;
			t.set(currentY);
			maxCycles--;

			forcePromoteLazyAttributes();
			await new Promise(r => setTimeout(r, delay));
		}

		window.dispatchEvent(new Event('resize'));
		window.dispatchEvent(new Event('scroll'));
		await new Promise(r => setTimeout(r, 60));

		t.set(t.init);
	}
}
