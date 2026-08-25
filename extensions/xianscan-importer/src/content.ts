// CONTENT SCRIPT: HEURISTIC READER SCANNER & AUTO-SCROLL PRELOADER

import type { ScannedImage, ScanPageResponse } from './types';
import { parseChapterMetadata } from './utils/chapter-parser';
import { sortImagesByCoordinates, getCanonicalUrl, computeDHashFromElement } from './utils/sorter';

// EXTRACT POTENTIAL IMAGE URLS FROM SRCSET
function parseSrcset(srcset: string): string[] {
	return srcset
		.split(',')
		.map(entry => entry.trim().split(/\s+/)[0])
		.filter(Boolean);
}

// FIND IMAGES IN READER JSON STATE IF AVAILABLE
function extractFromEmbeddedJson(): string[] {
	const results: string[] = [];
	try {
		const jsonScripts = document.querySelectorAll('script[type="application/json"], script[id*="data"], script[id*="state"]');
		for (const el of Array.from(jsonScripts)) {
			const text = el.textContent || '';
			// LOOK FOR ARRAYS OF IMAGE URLS
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
	'[class*="recommend"]',
	'[class*="related"]',
	'[class*="popular"]',
	'[class*="trending"]',
	'[class*="social"]',
	'[class*="share"]',
	'[class*="widget"]',
	'[class*="avatar"]'
].join(',');

const READER_CONTAINER_SELECTOR = [
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

// SCAN DOM FOR READER IMAGES WITH SCAN-TIME DEDUPLICATION
export function scanPageForImages(): ScannedImage[] {
	const imagesMap = new Map<string, ScannedImage>();
	const seenHashes = new Set<string>();
	const seenCanonicalUrls = new Set<string>();

	// CHECK IF A DEDICATED HIGH-CONFIDENCE READER CONTAINER EXISTS
	const readerContainers = document.querySelectorAll(READER_CONTAINER_SELECTOR);
	let rootScope: Document | Element = document;
	for (const container of Array.from(readerContainers)) {
		const imgsInContainer = container.querySelectorAll('img, picture img');
		if (imgsInContainer.length >= 3) {
			rootScope = container;
			break;
		}
	}

	// 1. SCAN STANDARD <img> AND <picture> ELEMENTS WITHIN ROOTSCOPE
	const imgElements = rootScope.querySelectorAll<HTMLImageElement>('img, picture img');
	for (const img of Array.from(imgElements)) {
		// DROP IMAGES NESTED WITHIN NOISE CONTAINERS (HEADERS, FOOTERS, SIDEBARS, COMMENTS, ADS)
		if (img.closest(NOISE_CONTAINER_SELECTOR)) continue;

		// RESOLVE HIGHEST-PRIORITY SOURCE ATTRIBUTE (FAVORING TRUE LAZY ATTRIBUTES OVER PLACEHOLDER SRC)
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
		].filter(Boolean) as string[];

		// FIND THE FIRST VALID NON-PLACEHOLDER CANDIDATE
		let possibleSrc: string | null = null;
		for (const cand of candidates) {
			if (!cand.startsWith('data:') && !cand.includes('placeholder') && !cand.includes('blur')) {
				possibleSrc = cand;
				break;
			}
		}

		// FALLBACK TO FIRST AVAILABLE IF NONE MATCHED
		if (!possibleSrc && candidates.length > 0) {
			possibleSrc = candidates[0];
		}

		if (!possibleSrc || possibleSrc.startsWith('data:')) continue;

		// CONVERT TO ABSOLUTE URL
		let absoluteUrl = possibleSrc;
		try {
			absoluteUrl = new URL(possibleSrc, window.location.href).href;
		} catch {
			continue;
		}

		// CANONICAL URL DE-DUPLICATION CHECK
		const canonicalUrl = getCanonicalUrl(absoluteUrl);
		if (seenCanonicalUrls.has(canonicalUrl)) {
			continue;
		}

		// EXTRACT VISUAL DHASH IF IMAGE IS RENDERED IN DOM
		let dhash: string | undefined;
		if (img.complete && img.naturalWidth > 0) {
			const computedHash = computeDHashFromElement(img);
			if (computedHash) {
				if (seenHashes.has(computedHash)) {
					// DROP DUPLICATE IMAGE WITH IDENTICAL VISUAL FINGERPRINT
					continue;
				}
				seenHashes.add(computedHash);
				dhash = computedHash;
			}
		}

		const rect = img.getBoundingClientRect();
		const top = rect.top + window.scrollY;
		const left = rect.left + window.scrollX;
		const width = img.naturalWidth || rect.width || 0;
		const height = img.naturalHeight || rect.height || 0;

		// DETECT MICRO-THUMBNAIL RENDERED IN LARGE CONTAINER (UNLOADED BLUR PLACEHOLDER)
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

	// 2. SCAN CSS BACKGROUND-IMAGE CONTAINERS
	const bgElements = document.querySelectorAll<HTMLElement>('div[style*="background-image"], section[style*="background-image"]');
	for (const el of Array.from(bgElements)) {
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
	if (imagesMap.size < 3) {
		const jsonUrls = extractFromEmbeddedJson();
		let fallbackTop = 0;
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

	const rawImages = Array.from(imagesMap.values());
	return sortImagesByCoordinates(rawImages);
}

// AUTO-SCROLL THROUGH THE ENTIRE READER TO TRIGGER LAZY-LOADS
export async function fastScrollPreload(): Promise<void> {
	const initialScrollY = window.scrollY;
	const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
	const step = 800;
	const delay = 40;

	for (let y = 0; y < scrollHeight; y += step) {
		window.scrollTo(0, y);
		await new Promise(r => setTimeout(r, delay));
	}

	window.scrollTo(0, initialScrollY);
}

// RUNTIME MESSAGE LISTENER (GUARDED AGAINST DUPLICATE INJECTIONS)
if (typeof window !== 'undefined' && !(window as any).__xianscan_content_injected) {
	(window as any).__xianscan_content_injected = true;

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message.type === 'SCAN_PAGE') {
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

		if (message.type === 'PING') {
			sendResponse({ status: 'alive' });
			return true;
		}

		return false;
	});
}
