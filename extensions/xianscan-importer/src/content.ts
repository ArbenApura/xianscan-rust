// -- CONTENT SCRIPT: HEURISTIC SCANNER, AUTO-SCROLLER & IN-PLACE LIVE TRANSLATOR -- //

import type { ScannedImage, ScanPageResponse, ChapterMappingEntry, PageTranslatedMessage, ChapterSyncMessage } from './types';
import { XianScanClient } from './api';
import { parseChapterMetadata } from './utils/chapter-parser';
import { sortImagesByCoordinates, getCanonicalUrl, computeDHashFromElement, isPlaceholderImage } from './utils/sorter';
import { DomReplacerEngine } from './utils/dom-replacer';

// -- SCANNER HELPERS -- //

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

const NOISE_CONTAINER_SELECTOR = [
	'header',
	'footer',
	'nav',
	'aside',
	'[class*="header"]',
	'[class*="footer"]',
	'[class*="navbar"]',
	'[class*="nav-"]',
	'[class*="sidebar"]',
	'[id*="sidebar"]',
	'[class*="comment"]',
	'[id*="comment"]',
	'[id*="disqus"]',
	'[class*="disqus"]',
	'[class*="advert"]',
	'[class*="banner"]',
	'[id*="banner"]',
	'[class*="promo"]',
	'[id*="promo"]',
	'[class*="sponsor"]',
	'[class*="floating"]',
	'[id*="floating"]',
	'[class*="sticky"]',
	'[id*="sticky"]',
	'[class*="fixed"]',
	'[id*="fixed"]',
	'[class*="recommend"]',
	'[class*="related"]',
	'[class*="popular"]',
	'[class*="trending"]',
	'[class*="social"]',
	'[class*="share"]',
	'[class*="widget"]',
	'[class*="avatar"]',
	'[class*="gnb"]',
	'[id*="gnb"]',
	'[class*="snb"]',
	'[id*="snb"]'
].join(',');

const READER_CONTAINER_SELECTOR = [
	'div[class*="wt_viewer"]',
	'#comic_view_area',
	'div[class*="reading-content"]',
	'div[class*="reader-area"]',
	'div[class*="reader"]',
	'div[id*="reader"]',
	'div[class*="chapter-images"]',
	'div[class*="viewer-cnt"]',
	'div[class*="comic-content"]',
	'div[id*="comic"]',
	'div[class*="v-reader"]',
	'article'
].join(',');

export function isFloatingOrSticky(el: HTMLElement): boolean {
	let curr: HTMLElement | null = el;
	while (curr && curr !== document.body && curr !== document.documentElement) {
		const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(curr) : null;
		if (style) {
			const pos = style.position;
			if (pos === 'fixed' || pos === 'sticky') {
				return true;
			}
		}
		curr = curr.parentElement;
	}
	return false;
}

export function isLikelyAdOrBannerImage(img: HTMLImageElement): boolean {
	// 1. ANCESTOR NOISE CONTAINER CHECK
	let curr: HTMLElement | null = img.parentElement;
	let depth = 0;
	while (curr && depth < 6 && curr !== document.body) {
		if (curr.matches && curr.matches(NOISE_CONTAINER_SELECTOR)) {
			return true;
		}
		// CHECK ANCHOR HREF FOR EXTERNAL ADS / GAMBLING / SLOT AFFILIATE LINKS
		if (curr.tagName === 'A') {
			const href = (curr.getAttribute('href') || '').toLowerCase();
			if (
				href.includes('doubleclick') ||
				href.includes('googleads') ||
				href.includes('adservice') ||
				href.includes('affiliate') ||
				href.includes('slot') ||
				href.includes('judi') ||
				href.includes('bet') ||
				href.includes('casino') ||
				href.includes('cuan') ||
				href.includes('gacor') ||
				href.includes('iklan')
			) {
				return true;
			}
		}
		curr = curr.parentElement;
		depth++;
	}

	// 2. SOURCE URL NOISE DETECTION
	const src = (img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '').toLowerCase();
	if (
		src.includes('banner') ||
		src.includes('iklan') ||
		src.includes('advert') ||
		src.includes('guanggao') ||
		src.includes('promo') ||
		src.includes('sponsor') ||
		src.includes('avatar') ||
		src.includes('logo') ||
		src.includes('/ad/') ||
		src.includes('/ads/') ||
		src.includes('_ad.') ||
		src.includes('-ad.') ||
		src.includes('app-qr') ||
		src.includes('qrcode') ||
		src.includes('qr-code') ||
		/[\/_-]ad\d*\.(?:gif|jpg|png|webp)/i.test(src) ||
		src.includes('slot') ||
		src.includes('judi') ||
		src.includes('doubleclick') ||
		src.includes('googleads') ||
		src.includes('noimg') ||
		src.includes('readerarea.svg')
	) {
		return true;
	}

	// 3. DIMENSION & ASPECT RATIO CHECKS FOR BANNER ADS (PRESERVES TALL WEBTOON PANELS)
	const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: img.width || 0, height: img.height || 0 };
	const width = img.naturalWidth || rect.width || img.width || 0;
	const height = img.naturalHeight || rect.height || img.height || 0;

	if (width > 0 && height > 0) {
		const aspectRatio = width / height;
		// HORIZONTAL BANNER AD DETECTION (e.g. 728x90, 300x37, 880x99, 1440x90)
		if (aspectRatio >= 2.5 && height <= 260) {
			return true;
		}
		if (aspectRatio >= 4.0 && height <= 350) {
			return true;
		}
		if (width >= 250 && height <= 100) {
			return true;
		}
		if (height <= 50) {
			return true;
		}
	}

	// 4. ANIMATED GIF BANNER DETECTION (COMIC PANELS ARE ALMOST NEVER ANIMATED GIFS)
	if (src.endsWith('.gif') || src.includes('.gif?')) {
		if (height <= 300 || src.includes('iklan') || src.includes('banner')) {
			return true;
		}
	}

	return false;
}

// -- VIRTUAL-SCROLL & LAZY IMAGE URL CAPTURE -- //

// MODULE-LEVEL SET OF EVERY ABSOLUTE IMAGE URL OBSERVED DURING THE PAGE LIFETIME.
// VIRTUAL-SCROLL READERS EVICT OFFSCREEN <IMG> NODES FROM THE DOM, SO
// SNAPSHOT SCANS NEVER SEE THEM. THIS SET PRESERVES THEIR URLS PERMANENTLY.
const capturedImageUrls = new Set<string>();

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
	if (el.closest && el.closest(NOISE_CONTAINER_SELECTOR)) {
		return;
	}

	const readerContainer = findPrimaryReaderContainer();
	if (readerContainer && el.closest && !readerContainer.contains(el)) {
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
		if (match && match[1]) {
			const abs = absoluteImageUrl(match[1]);
			if (abs && !isPlaceholderImage(abs)) {
				capturedImageUrls.add(abs);
			}
		}
	}
}

let captureObserverAttached = false;
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

// -- READER CONTAINER & URL-BASE REASONING -- //

// DERIVE THE "URL BASE" AN IMAGE IS HOSTED UNDER: ORIGIN + ITS PARENT DIRECTORY.
// REAL READER PANELS OF ONE CHAPTER SHARE A CDN ORIGIN AND A COMMON DIRECTORY
// (E.G. /manga/<slug>/chapters/<chapter-id>/), WHILE ADS LIVE ON UNRELATED HOSTS/PATHS.
function urlBase(url: string): string {
	try {
		const u = new URL(url);
		const parts = u.pathname.split('/').filter(Boolean);
		parts.pop(); // DROP THE FILENAME
		return `${u.protocol}//${u.host}/${parts.join('/')}`;
	} catch {
		return url;
	}
}

function urlOrigin(url: string): string {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host}`;
	} catch {
		return url;
	}
}

// CHECK WHETHER A CANDIDATE URL IS A SEQUENTIAL/INDEXED COMIC PANEL RATHER THAN A SINGLE AD.
// PANEL FILENAMES END IN AN INCREMENTING NUMBER (1.jpeg, 002.webp, page-3.png) OR A UUID.
function looksLikeSequentialPanel(url: string): boolean {
	try {
		const name = new URL(url).pathname.split('/').pop() || '';
		if (/(?:^|[^0-9])[0-9]{1,4}(?=\.(?:jpe?g|png|webp|avif|gif)$)/i.test(name)) return true;
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(name)) return true;
		return false;
	} catch {
		return false;
	}
}

// FIND THE MOST FREQUENT URL BASE AMONG A SET OF IMAGES.
function getDominantUrlBase(images: ScannedImage[]): string {
	if (images.length < 1) return '';
	if (images.length === 1) return urlBase(images[0].url);
	const counts = new Map<string, number>();
	for (const img of images) {
		const base = urlBase(img.url);
		counts.set(base, (counts.get(base) || 0) + 1);
	}
	let dominant = '';
	let max = 0;
	for (const [base, count] of counts) {
		if (count > max) { dominant = base; max = count; }
	}
	// IF >= 1 SHARE EXACT DIRECTORY BASE, USE IT
	if (max >= 1) return dominant;

	// FALLBACK: CHECK BY CDN HOST ORIGIN
	const originCounts = new Map<string, number>();
	for (const img of images) {
		const o = urlOrigin(img.url);
		originCounts.set(o, (originCounts.get(o) || 0) + 1);
	}
	let dominantOrigin = '';
	let maxOrigin = 0;
	for (const [o, count] of originCounts) {
		if (count > maxOrigin) { dominantOrigin = o; maxOrigin = count; }
	}
	return maxOrigin >= 1 ? dominantOrigin : '';
}

// PARSE INLINE ASPECT RATIO OR HEIGHT TO RECOVER GENUINE TALL STRIP DIMENSIONS
function extractPlaceholderDimensions(el?: Element | null): { width: number; height: number } {
	if (!el || !(el instanceof HTMLElement)) return { width: 800, height: 1200 };
	const style = el.getAttribute('style') || '';
	// MATCH aspect-ratio: 720 / 18484 OR aspect-ratio: 720/18484 OR aspect-ratio: auto 720 / 18484
	const ratioMatch = style.match(/aspect-ratio:\s*(?:auto\s+)?([0-9.]+)\s*(?:\/|\:)\s*([0-9.]+)/i);
	if (ratioMatch && ratioMatch[1] && ratioMatch[2]) {
		const w = parseFloat(ratioMatch[1]);
		const h = parseFloat(ratioMatch[2]);
		if (w > 0 && h > 0) {
			return { width: Math.round(w), height: Math.round(h) };
		}
	}
	const heightMatch = style.match(/(?:min-)?height:\s*([0-9.]+)px/i);
	const widthMatch = style.match(/(?:max-|min-)?width:\s*([0-9.]+)px/i);
	if (heightMatch && heightMatch[1]) {
		const h = parseFloat(heightMatch[1]);
		const w = widthMatch && widthMatch[1] ? parseFloat(widthMatch[1]) : 800;
		if (h >= 400) {
			return { width: Math.round(w), height: Math.round(h) };
		}
	}
	const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
	if (rect && rect.height >= 400) {
		return { width: Math.round(rect.width) || 800, height: Math.round(rect.height) };
	}
	return { width: 800, height: 1200 };
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
		if (container.closest && container.closest(NOISE_CONTAINER_SELECTOR)) continue;
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
		if (container.closest && container.closest(NOISE_CONTAINER_SELECTOR)) continue;

		const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img, picture img')).filter(
			img => !img.getAttribute('data-xianscan-injected') && !isLikelyAdOrBannerImage(img) && !img.closest(NOISE_CONTAINER_SELECTOR)
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

export function scanPageForImages(): ScannedImage[] {
	const imagesMap = new Map<string, ScannedImage>();
	const seenHashes = new Set<string>();
	const seenCanonicalUrls = new Set<string>();

	// DISCOVER HIGH-CONFIDENCE PRIMARY READER CONTAINER DYNAMICALLY
	const dynamicContainer = findPrimaryReaderContainer();
	const rootScope: Document | Element = dynamicContainer || document;

	// 1. SCAN STANDARD <img> AND <picture> ELEMENTS WITHIN ROOTSCOPE
	const imgElements = rootScope.querySelectorAll<HTMLImageElement>('img, picture img');
	for (const img of Array.from(imgElements)) {
		// IGNORE INJECTED CLONES
		if (img.getAttribute('data-xianscan-injected') === 'true') {
			continue;
		}

		// DROP IMAGES NESTED WITHIN NOISE CONTAINERS (HEADERS, FOOTERS, SIDEBARS, COMMENTS, ADS)
		if (img.closest(NOISE_CONTAINER_SELECTOR)) continue;

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
		if (el.closest(NOISE_CONTAINER_SELECTOR)) continue;
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

	// 4. SUPPLEMENT WITH CAPTURED VIRTUAL-SCROLL / LAZY URLS NOT PRESENT IN THE DOM SNAPSHOT.
	const capturedUrls = getCapturedImageUrls();
	// MAP OF PLACEHOLDERS (DIVS WITHOUT IMGS) IN ROOTSCOPE TO EXTRACT GENUINE TALL STRIP DIMENSIONS
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
				top: fallbackTop,
				left: 0,
				selected: true
			});
			fallbackTop += dims.height;
		}
	}

	const rawImages = Array.from(imagesMap.values());
	return sortImagesByCoordinates(rawImages);
}

// FIND SINGLE ELEMENT THAT SCROLLS ITS CONTENT (USED BY VIRTUAL-SCROLL READERS WHOSE
// SCROLL CONTAINER IS NOT THE WINDOW)
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

// AUTO-SCROLL THROUGH THE ENTIRE READER (WINDOW AND/OR INNER VIRTUAL-SCROLL CONTAINER)
// TO TRIGGER LAZY-LOADS AND LET THE MUTATIONOBSERVER CAPTURE EVERY MOUNTED PANEL.
export async function fastScrollPreload(): Promise<void> {
	const step = 800;
	const delay = 40;

	// COLLECT SCROLL TARGETS: WINDOW PLUS ANY INNER VIRTUAL-SCROLL CONTAINER
	type ScrollTarget = { max: number; init: number; set: (y: number) => void };
	const targets: ScrollTarget[] = [];

	const windowMax = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
	if (windowMax > 0) {
		targets.push({ max: windowMax, init: window.scrollY, set: (y) => window.scrollTo(0, y) });
	}

	const inner = findScrollableReaderContainer();
	if (inner) {
		targets.push({ max: inner.scrollHeight, init: inner.scrollTop, set: (y) => { inner.scrollTop = y; } });
	}

	// SCROLL EACH TARGET FULLY SO LAZY/VIRTUAL PANELS MOUNT AND THE OBSERVER CAPTURES THEM
	for (const t of targets) {
		for (let y = 0; y < t.max; y += step) {
			t.set(y);
			await new Promise(r => setTimeout(r, delay));
		}
		// RESTORE ORIGINAL POSITION
		t.set(t.init);
	}
}

// -- IN-PLACE REPLACEMENT COORDINATOR -- //

function isExtensionValid(): boolean {
	try {
		return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
	} catch {
		return false;
	}
}

class InPlaceTranslationCoordinator {
	private replacer: DomReplacerEngine;
	private client: XianScanClient;
	private activeMapping: ChapterMappingEntry | null = null;
	private inPlaceEnabled = true;
	private serverUrl = 'http://127.0.0.1:8124';
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private keepAlivePort: chrome.runtime.Port | null = null;
	private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.client = new XianScanClient(this.serverUrl);
		this.replacer = new DomReplacerEngine(this.serverUrl);
	}

	async init() {
		if (!isExtensionValid()) return;
		const stored = await chrome.storage.local.get(['serverUrl', 'inPlaceReplacement']);
		if (stored.serverUrl) {
			this.serverUrl = stored.serverUrl;
			this.client.setBaseUrl(this.serverUrl);
			this.replacer.setBaseUrl(this.serverUrl);
		}

		this.inPlaceEnabled = stored.inPlaceReplacement !== false;
		this.bindLifecycleEvents();
		if (this.inPlaceEnabled) {
			await this.recheckUrlMapping();
		}
	}

	private bindLifecycleEvents() {
		document.addEventListener('visibilitychange', () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			if (document.visibilityState === 'visible' && this.activeMapping) {
				void this.syncWithServer();
			}
		});

		window.addEventListener('focus', () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			if (this.activeMapping) {
				void this.syncWithServer();
			}
		});

		window.addEventListener('popstate', () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			void this.recheckUrlMapping();
		});

		window.addEventListener('pagehide', () => {
			// PAGE MOVED INTO THE BACK/FORWARD CACHE OR CLOSED: TEAR DOWN THE KEEPALIVE PORT
			// BEFORE CHROME CLOSES THE CHANNEL SO IT DOES NOT RAISE AN "UNCHECKED lastError".
			this.stopKeepAlive();
		});

		window.addEventListener('pageshow', () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			// RESTORED FROM THE BACK/FORWARD CACHE: RE-SYNC (RE-ESTABLISHES THE KEEPALIVE
			// PORT AND POLLING VIA startPollingIfNeeded).
			if (this.activeMapping) {
				void this.syncWithServer();
			}
		});
	}

	async recheckUrlMapping() {
		if (!isExtensionValid()) {
			this.destroy();
			return;
		}
		chrome.runtime.sendMessage({
			type: 'GET_SITE_MAPPING',
			url: window.location.href
		}, async (res) => {
			if (chrome.runtime.lastError || !res || !res.mapping) return;
			this.activeMapping = res.mapping;
			await this.syncWithServer();
		});
	}

	setActiveMapping(entry: ChapterMappingEntry) {
		if (entry?.url) {
			const currentNormalized = normalizePageUrl(window.location.href);
			const entryNormalized = normalizePageUrl(entry.url);
			if (currentNormalized !== entryNormalized) {
				return;
			}
		}
		this.activeMapping = entry;
		void this.syncWithServer();
	}

	private startKeepAlive(chapterId: number) {
		if (this.keepAlivePort || !isExtensionValid()) return;
		try {
			if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
				this.keepAlivePort = chrome.runtime.connect({ name: 'xianscan-keepalive' });
				this.keepAlivePort.onDisconnect.addListener(() => {
					// CLEAN UP THE PORT AND ITS PING TIMER WHEN CHROME CLOSES THE CHANNEL
					// (E.G. THE PAGE IS MOVED INTO THE BACK/FORWARD CACHE) SO WE NEVER
					// POST TO A DEAD PORT / TRIGGER AN "UNCHECKED runtime.lastError".
					if (this.keepAliveInterval) {
						clearInterval(this.keepAliveInterval);
						this.keepAliveInterval = null;
					}
					this.keepAlivePort = null;
				});

				this.keepAliveInterval = setInterval(() => {
					if (!isExtensionValid()) {
						this.destroy();
						return;
					}
					// ONLY PING WHILE THE PORT IS STILL OPEN: A CLOSED PORT RAISES lastError.
					if (this.keepAlivePort && !(this.keepAlivePort as { disconnected?: boolean }).disconnected) {
						try {
							this.keepAlivePort.postMessage({
								type: 'KEEPALIVE_PING',
								chapterId,
								timestamp: Date.now()
							});
						} catch {
							this.stopKeepAlive();
						}
					}
				}, 12000);
			}
		} catch {
			// IGNORE PORT CONNECTION ERRORS
		}
	}

	private stopKeepAlive() {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = null;
		}
		if (this.keepAlivePort) {
			try {
				this.keepAlivePort.disconnect();
			} catch {
				// IGNORE
			}
			this.keepAlivePort = null;
		}
	}

	private startPollingIfNeeded(pages: ChapterReaderPage[]) {
		const hasPending = pages.some(p => !p.outputPath && (p.outputRev || 0) === 0);
		if (!hasPending) {
			this.stopPolling();
			this.stopKeepAlive();
			return;
		}

		if (this.activeMapping?.chapterId) {
			this.startKeepAlive(this.activeMapping.chapterId);
		}

		if (this.pollingTimer) return;

		// ATTACH LIVE SSE IN BACKGROUND WORKER
		if (this.activeMapping?.chapterId && isExtensionValid()) {
			chrome.runtime.sendMessage({
				type: 'ATTACH_LIVE_SSE',
				chapterId: this.activeMapping.chapterId
			}, () => {
				void chrome.runtime.lastError;
			});
		}

		// BACKUP INTERVAL POLLING & SELF-HEALING WATCHDOG (EVERY 2.5S)
		this.pollingTimer = setInterval(async () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			if (!this.activeMapping?.chapterId) {
				this.stopPolling();
				return;
			}

			try {
				const details = await this.client.getChapterDetails(this.activeMapping.chapterId);
				if (!details?.pages || details.pages.length === 0) return;

				let allDone = true;
				for (const p of details.pages) {
					const isReady = !!p.outputPath || (p.outputRev || 0) > 0;
					if (isReady) {
						this.replacer.updatePageSlice(p.id, p.seq, p.outputRev || 1);
					} else {
						allDone = false;
						// REFLECT THE LIVE non-DONE STATUS ON THE SLICE (pending → processing)
						// SO THE ON-PAGE BADGE UPDATES WHILE THE TRANSLATION IS IN FLIGHT.
						this.replacer.updatePageStatus(
							p.id,
							p.seq,
							p.status === 'processing' ? 'processing' : 'pending'
						);
					}
				}

				if (allDone) {
					this.stopPolling();
					this.stopKeepAlive();
				}
			} catch (err: any) {
				const errMsg = err?.message || String(err);
				if (errMsg.includes('context invalidated') || errMsg.includes('Context invalidated')) {
					this.destroy();
				}
			}
		}, 2500);
	}

	private stopPolling() {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
	}

	async syncWithServer() {
		if (!isExtensionValid()) {
			this.destroy();
			return;
		}
		if (!this.activeMapping) return;
		if (!this.inPlaceEnabled) return;

		try {
			const chapterResult = await this.client.getChapterDetails(this.activeMapping.chapterId);
			if (!chapterResult || !chapterResult.chapter || !chapterResult.pages) {
				throw new Error('Chapter not found.');
			}

			const pages = chapterResult.pages;
			if (pages.length > 0) {
				this.replacer.mountTranslatedPages(
					pages,
					this.activeMapping.excludedImageUrls,
					this.activeMapping.includedImageUrls
				);
				this.startPollingIfNeeded(pages);
			}
		} catch (err: any) {
			const errMsg = err?.message || String(err);
			if (errMsg.includes('context invalidated') || errMsg.includes('Context invalidated')) {
				// EXTENSION WAS RELOADED OR UPDATED; CLEANLY SELF-TERMINATE TO AVOID CONSOLE SPAM
				this.destroy();
				return;
			}
			if (errMsg.includes('Chapter not found') || errMsg.includes('404')) {
				console.info('[XianScan] Mapped chapter was removed from server. Auto-clearing local mapping.');
				this.stopPolling();
				this.stopKeepAlive();
				if (isExtensionValid()) {
					chrome.runtime.sendMessage({
						type: 'DELETE_SITE_MAPPING',
						url: window.location.href
					}, () => {
						void chrome.runtime.lastError;
					});
				}
				this.activeMapping = null;
				this.replacer.destroy();
			} else {
				console.warn('[XianScan] Could not sync in-place translation with server:', err);
			}
		}
	}

	handlePageTranslated(msg: PageTranslatedMessage) {
		if (!this.inPlaceEnabled) return;
		if (!this.activeMapping) {
			// TAB HAS NOT BEEN MAPPED TO ANY CHAPTER: IGNORE FOREIGN TRANSLATION BROADCASTS
			return;
		}

		if (String(this.activeMapping.chapterId) === String(msg.chapterId)) {
			this.replacer.updatePageSlice(msg.pageId, msg.pageSeq, msg.outputRev);
		}
	}

	setMode(mode: 'translated' | 'raw') {
		this.inPlaceEnabled = mode === 'translated';
		this.replacer.setMode(mode);
		if (this.inPlaceEnabled) {
			void this.recheckUrlMapping();
		}
	}

	destroy() {
		this.stopPolling();
		this.stopKeepAlive();
		this.replacer.destroy();
	}
}

// RUNTIME MESSAGE LISTENER (GUARDED AGAINST DUPLICATE INJECTIONS & SELF-HOSTED DASHBOARD)
if (
	typeof window !== 'undefined' &&
	!(window as any).__xianscan_content_injected &&
	!window.location.hostname.includes('localhost') &&
	!window.location.hostname.includes('127.0.0.1') &&
	!window.location.pathname.startsWith('/app')
) {
	(window as any).__xianscan_content_injected = true;

	const coordinator = new InPlaceTranslationCoordinator();
	coordinator.init();

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message.type === 'SCAN_PAGE') {
			attachImageCaptureObserver();
			const images = scanPageForImages();
			const htmlLang = document.documentElement.lang || '';
			const metadata = parseChapterMetadata(document.title, window.location.href, htmlLang);
			metadata.pageCount = images.length;

			const response: ScanPageResponse = {
				images,
				metadata
			};
			sendResponse(response);
			return true;
		}

		if (message.type === 'FAST_SCROLL_PRELOAD') {
			fastScrollPreload().then(() => {
				const images = scanPageForImages();
				const htmlLang = document.documentElement.lang || '';
				const metadata = parseChapterMetadata(document.title, window.location.href, htmlLang);
				metadata.pageCount = images.length;
				sendResponse({ success: true, images, metadata });
			});
			return true;
		}

		if (message.type === 'SET_ACTIVE_MAPPING') {
			coordinator.setActiveMapping(message.entry);
			sendResponse({ received: true });
			return true;
		}

		if (message.type === 'PAGE_TRANSLATED') {
			coordinator.handlePageTranslated(message);
			sendResponse({ received: true });
			return true;
		}

		if (message.type === 'CHAPTER_SYNC_UPDATE') {
			coordinator.syncWithServer().then(() => {
				sendResponse({ received: true });
			});
			return true;
		}

		if (message.type === 'TRIGGER_SYNC') {
			coordinator.syncWithServer().then(() => {
				sendResponse({ success: true });
			});
			return true;
		}

		if (message.type === 'TOGGLE_MODE') {
			coordinator.setMode(message.mode);
			sendResponse({ success: true });
			return true;
		}

		if (message.type === 'PING') {
			sendResponse({ status: 'alive' });
			return true;
		}

		if (message.type === 'FETCH_IMAGE_DATA_IN_TAB') {
			let responded = false;
			const safeSend = (resp: any) => {
				if (responded) return;
				responded = true;
				try {
					sendResponse(resp);
				} catch {
					// IGNORE IF TAB/CHANNEL CLOSED
				}
			};

			(async () => {
				try {
					const res = await fetch(message.url);
					if (res.ok) {
						const contentType = (res.headers.get('content-type') || '').toLowerCase();
						if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
							const blob = await res.blob();
							if (blob.size >= 100) {
								const reader = new FileReader();
								reader.onloadend = () => {
									safeSend({ ok: true, dataUrl: reader.result as string });
								};
								reader.onerror = () => {
									safeSend({ ok: false, error: 'FileReader failed to read blob' });
								};
								reader.readAsDataURL(blob);
								return;
							}
						}
					}
				} catch {
					// FALL THROUGH TO DOM CANVAS FALLBACK
				}

				// FALLBACK: EXTRACT FROM ALREADY LOADED DOM IMAGE ELEMENT VIA CANVAS
				try {
					const imgEl = Array.from(document.querySelectorAll<HTMLImageElement>('img')).find(
						i => i.src === message.url || i.currentSrc === message.url || i.getAttribute('data-src') === message.url
					);
					if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
						const canvas = document.createElement('canvas');
						canvas.width = imgEl.naturalWidth;
						canvas.height = imgEl.naturalHeight;
						const ctx = canvas.getContext('2d');
						if (ctx) {
							ctx.drawImage(imgEl, 0, 0);
							const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
							safeSend({ ok: true, dataUrl });
							return;
						}
					}
				} catch {
					// IGNORE CANVAS TAINT ERROR
				}

				safeSend({ ok: false, error: 'Failed to retrieve image in tab' });
			})();
			return true;
		}

		return false;
	});
}
