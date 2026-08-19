// CONTENT SCRIPT: HEURISTIC READER SCANNER & AUTO-SCROLL PRELOADER

import type { ScannedImage, ScanPageResponse } from './types';
import { parseChapterMetadata } from './utils/chapter-parser';
import { sortImagesByCoordinates } from './utils/sorter';

// Extract potential image URLs from srcset
function parseSrcset(srcset: string): string[] {
	return srcset
		.split(',')
		.map(entry => entry.trim().split(/\s+/)[0])
		.filter(Boolean);
}

// Find images in reader JSON state if available
function extractFromEmbeddedJson(): string[] {
	const results: string[] = [];
	try {
		const jsonScripts = document.querySelectorAll('script[type="application/json"], script[id*="data"], script[id*="state"]');
		for (const el of Array.from(jsonScripts)) {
			const text = el.textContent || '';
			// Look for arrays of image URLs
			const matches = text.match(/https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s\\]*)?/gi);
			if (matches && matches.length >= 3) {
				results.push(...matches);
			}
		}
	} catch {
		// Ignore parse errors on arbitrary script blocks
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

// Scan DOM for reader images
export function scanPageForImages(): ScannedImage[] {
	const imagesMap = new Map<string, ScannedImage>();

	// Check if a dedicated high-confidence reader container exists
	const readerContainers = document.querySelectorAll(READER_CONTAINER_SELECTOR);
	let rootScope: Document | Element = document;
	for (const container of Array.from(readerContainers)) {
		const imgsInContainer = container.querySelectorAll('img, picture img');
		if (imgsInContainer.length >= 3) {
			rootScope = container;
			break;
		}
	}

	// 1. Scan standard <img> and <picture> elements within rootScope
	const imgElements = rootScope.querySelectorAll<HTMLImageElement>('img, picture img');
	for (const img of Array.from(imgElements)) {
		// Drop images nested within noise containers (headers, footers, sidebars, comments, ads)
		if (img.closest(NOISE_CONTAINER_SELECTOR)) continue;

		// Resolve highest-priority source attribute (favoring true lazy attributes over placeholder src)
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

		// Find the first valid non-placeholder candidate
		let possibleSrc: string | null = null;
		for (const cand of candidates) {
			if (!cand.startsWith('data:') && !cand.includes('placeholder') && !cand.includes('blur')) {
				possibleSrc = cand;
				break;
			}
		}

		// Fallback to first available if none matched
		if (!possibleSrc && candidates.length > 0) {
			possibleSrc = candidates[0];
		}

		if (!possibleSrc || possibleSrc.startsWith('data:')) continue;

		// Convert to absolute URL
		let absoluteUrl = possibleSrc;
		try {
			absoluteUrl = new URL(possibleSrc, window.location.href).href;
		} catch {
			continue;
		}

		const rect = img.getBoundingClientRect();
		const top = rect.top + window.scrollY;
		const left = rect.left + window.scrollX;
		const width = img.naturalWidth || rect.width || 0;
		const height = img.naturalHeight || rect.height || 0;

		// Detect micro-thumbnail rendered in large container (unloaded blur placeholder)
		if (img.naturalWidth > 0 && img.naturalWidth < 80 && rect.width > 200) {
			continue;
		}

		imagesMap.set(absoluteUrl, {
			url: absoluteUrl,
			width,
			height,
			top,
			left,
			alt: img.alt || '',
			selected: true
		});
	}

	// 2. Scan CSS background-image containers
	const bgElements = document.querySelectorAll<HTMLElement>('div[style*="background-image"], section[style*="background-image"]');
	for (const el of Array.from(bgElements)) {
		const style = el.getAttribute('style') || '';
		const match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
		if (match && match[1] && !match[1].startsWith('data:')) {
			try {
				const absoluteUrl = new URL(match[1], window.location.href).href;
				const rect = el.getBoundingClientRect();
				imagesMap.set(absoluteUrl, {
					url: absoluteUrl,
					width: rect.width || 800,
					height: rect.height || 1200,
					top: rect.top + window.scrollY,
					left: rect.left + window.scrollX,
					selected: true
				});
			} catch {
				// Ignore invalid URL
			}
		}
	}

	// 3. Supplement with embedded JSON state if DOM has few images
	if (imagesMap.size < 3) {
		const jsonUrls = extractFromEmbeddedJson();
		let fallbackTop = 0;
		for (const url of jsonUrls) {
			if (!imagesMap.has(url)) {
				imagesMap.set(url, {
					url,
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

// Auto-scroll through the entire reader to trigger lazy-loads
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

// Runtime message listener
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
