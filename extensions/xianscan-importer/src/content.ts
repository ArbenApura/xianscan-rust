// -- CONTENT SCRIPT: HEURISTIC SCANNER, AUTO-SCROLLER & IN-PLACE LIVE TRANSLATOR -- //

import type { ScannedImage, ScanPageResponse, ChapterMappingEntry, PageTranslatedMessage, ChapterSyncMessage } from './types';
import { XianScanClient } from './api';
import { parseChapterMetadata } from './utils/chapter-parser';
import { sortImagesByCoordinates, getCanonicalUrl, computeDHashFromElement } from './utils/sorter';
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
	// 1. CHECK PARENT LINK (<a> TAGS): COMIC PANELS ARE ALMOST NEVER EXTERNAL AD LINKS
	const parentLink = img.closest('a');
	if (parentLink && parentLink.href) {
		const href = parentLink.href.toLowerCase();
		if (
			href.includes('telegram') ||
			href.includes('t.me') ||
			href.includes('click') ||
			href.includes('affiliate') ||
			href.includes('track') ||
			href.includes('redirect') ||
			href.includes('casino') ||
			href.includes('bet') ||
			href.includes('game') ||
			href.includes('apk') ||
			href.includes('app') ||
			parentLink.target === '_blank'
		) {
			return true;
		}
	}

	// 2. CHECK AD NOISE CONTAINERS & AD CLASS NAMES
	const AD_CLASS_PATTERNS = [
		'ad', 'ads', 'advert', 'banner', 'promo', 'sponsor', 'floating',
		'sticky', 'fixed', 'guanggao', 'gg', 'pop', 'aff', 'tg', 'notice'
	];
	let curr: HTMLElement | null = img;
	let depth = 0;
	while (curr && curr !== document.body && depth < 5) {
		const classList = curr.className ? String(curr.className).toLowerCase() : '';
		const id = curr.id ? String(curr.id).toLowerCase() : '';
		for (const pattern of AD_CLASS_PATTERNS) {
			if (
				(classList && (classList === pattern || classList.includes(`-${pattern}`) || classList.includes(`${pattern}-`) || classList.includes(`_${pattern}`) || classList.includes(`${pattern}_`))) ||
				(id && (id === pattern || id.includes(`-${pattern}`) || id.includes(`${pattern}-`) || id.includes(`_${pattern}`) || id.includes(`${pattern}_`)))
			) {
				return true;
			}
		}
		curr = curr.parentElement;
		depth++;
	}

	// 3. ASPECT RATIO & DIMENSION FILTER FOR AD BANNERS
	const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: img.width || 0, height: img.height || 0 };
	const width = img.naturalWidth || rect.width || img.width || 0;
	const height = img.naturalHeight || rect.height || img.height || 0;

	if (width > 0 && height > 0) {
		const aspectRatio = width / height;
		// HORIZONTAL BANNER AD DETECTION (e.g. 880x99, 728x90, 970x90, 1000x120)
		if (aspectRatio >= 3.0 && height <= 260) {
			return true;
		}
		if (aspectRatio >= 4.5) {
			return true;
		}
		if (width >= 250 && height < 130) {
			return true;
		}
		// VERTICAL SKYSCRAPER BANNER AD DETECTION
		if (aspectRatio <= 0.25 && width <= 200) {
			return true;
		}
	}

	// 4. SOURCE URL NOISE DETECTION
	const src = (img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '').toLowerCase();
	if (
		src.includes('banner') ||
		src.includes('advert') ||
		src.includes('guanggao') ||
		src.includes('promo') ||
		src.includes('sponsor') ||
		src.includes('avatar') ||
		src.includes('logo') ||
		src.includes('/ad/') ||
		src.includes('_ad.') ||
		src.includes('-ad.')
	) {
		return true;
	}

	return false;
}

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
		].filter(Boolean) as string[];

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
			absoluteUrl = new URL(possibleSrc, window.location.href).href;
		} catch {
			continue;
		}

		const canonicalUrl = getCanonicalUrl(absoluteUrl);
		if (seenCanonicalUrls.has(canonicalUrl)) {
			continue;
		}

		let dhash: string | undefined;
		if (img.complete && img.naturalWidth > 0) {
			const computedHash = computeDHashFromElement(img);
			if (computedHash) {
				if (seenHashes.has(computedHash)) {
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

// -- IN-PLACE REPLACEMENT COORDINATOR -- //

class InPlaceTranslationCoordinator {
	private replacer: DomReplacerEngine;
	private client: XianScanClient;
	private activeMapping: ChapterMappingEntry | null = null;
	private serverUrl = 'http://127.0.0.1:8124';
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;
	private keepAlivePort: chrome.runtime.Port | null = null;
	private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.client = new XianScanClient(this.serverUrl);
		this.replacer = new DomReplacerEngine(this.serverUrl);
	}

	async init() {
		const stored = await chrome.storage.local.get(['serverUrl', 'inPlaceReplacement']);
		if (stored.serverUrl) {
			this.serverUrl = stored.serverUrl;
			this.client.setBaseUrl(this.serverUrl);
			this.replacer.setBaseUrl(this.serverUrl);
		}

		const inPlaceEnabled = stored.inPlaceReplacement !== false;
		if (!inPlaceEnabled) return;

		this.bindLifecycleEvents();
		await this.recheckUrlMapping();
	}

	private bindLifecycleEvents() {
		// 1. INSTANT CATCH-UP SYNC ON TAB VISIBILITY CHANGE
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && this.activeMapping) {
				void this.syncWithServer();
			}
		});

		// 2. INSTANT CATCH-UP SYNC ON WINDOW FOCUS
		window.addEventListener('focus', () => {
			if (this.activeMapping) {
				void this.syncWithServer();
			}
		});

		// 3. SPA ROUTE NAVIGATION (POPSTATE)
		window.addEventListener('popstate', () => {
			void this.recheckUrlMapping();
		});
	}

	async recheckUrlMapping() {
		chrome.runtime.sendMessage(
			{ type: 'GET_SITE_MAPPING', url: window.location.href },
			async (res: { mapping?: ChapterMappingEntry | null }) => {
				if (chrome.runtime.lastError || !res || !res.mapping) {
					return;
				}

				this.activeMapping = res.mapping;
				await this.syncWithServer();
			}
		);
	}

	setActiveMapping(entry: ChapterMappingEntry) {
		this.activeMapping = entry;
		void this.syncWithServer();
	}

	private startKeepAlive(chapterId: number) {
		if (this.keepAlivePort) return;
		try {
			if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
				this.keepAlivePort = chrome.runtime.connect({ name: 'xianscan-keepalive' });
				this.keepAlivePort.onDisconnect.addListener(() => {
					this.keepAlivePort = null;
				});

				this.keepAliveInterval = setInterval(() => {
					if (this.keepAlivePort) {
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
		if (this.activeMapping?.chapterId) {
			chrome.runtime.sendMessage({
				type: 'ATTACH_LIVE_SSE',
				chapterId: this.activeMapping.chapterId
			}, () => {
				void chrome.runtime.lastError;
			});
		}

		// BACKUP INTERVAL POLLING & SELF-HEALING WATCHDOG (EVERY 2.5S)
		this.pollingTimer = setInterval(async () => {
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
					}
				}

				if (allDone) {
					this.stopPolling();
					this.stopKeepAlive();
				}
			} catch {
				// SILENT POLLING FAILURE
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
		if (!this.activeMapping) return;

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
			if (errMsg.includes('Chapter not found') || errMsg.includes('404')) {
				console.info('[XianScan] Mapped chapter was removed from server. Auto-clearing local mapping.');
				this.stopPolling();
				this.stopKeepAlive();
				chrome.runtime.sendMessage({
					type: 'DELETE_SITE_MAPPING',
					url: window.location.href
				}, () => {
					void chrome.runtime.lastError;
				});
				this.activeMapping = null;
				this.replacer.destroy();
			} else {
				console.warn('[XianScan] Could not sync in-place translation with server:', err);
			}
		}
	}

	handlePageTranslated(msg: PageTranslatedMessage) {
		if (!this.activeMapping) {
			this.activeMapping = {
				url: window.location.href,
				bookId: '',
				chapterId: msg.chapterId,
				isResliced: true,
				pageCount: msg.total || 0,
				enabled: true,
				lastSyncedAt: Date.now()
			};
		}

		if (String(this.activeMapping.chapterId) === String(msg.chapterId)) {
			this.replacer.updatePageSlice(msg.pageId, msg.pageSeq, msg.outputRev);
		}
	}

	setMode(mode: 'translated' | 'raw') {
		this.replacer.setMode(mode);
	}

	destroy() {
		this.stopPolling();
		this.stopKeepAlive();
		this.replacer.destroy();
	}
}

// RUNTIME MESSAGE LISTENER (GUARDED AGAINST DUPLICATE INJECTIONS)
if (typeof window !== 'undefined' && !(window as any).__xianscan_content_injected) {
	(window as any).__xianscan_content_injected = true;

	const coordinator = new InPlaceTranslationCoordinator();
	coordinator.init();

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

		return false;
	});
}
