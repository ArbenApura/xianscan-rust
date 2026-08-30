// -- IN-PLACE IMAGE REPLACEMENT & RESLICE SYNCHRONIZATION ENGINE -- //

import type { ChapterReaderPage } from '../types';

export function normalizePageUrl(rawUrl: string): string {
	try {
		const parsed = new URL(rawUrl);
		// STRIP TRACKING & EPHEMERAL QUERY PARAMETERS
		parsed.searchParams.delete('utm_source');
		parsed.searchParams.delete('utm_medium');
		parsed.searchParams.delete('utm_campaign');
		parsed.searchParams.delete('fbclid');
		parsed.searchParams.delete('gclid');
		parsed.hash = '';
		return parsed.href.replace(/\/+$/, '');
	} catch {
		return rawUrl.split('#')[0].replace(/\/+$/, '');
	}
}

export function getCanonicalUrl(url: string): string {
	try {
		const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url;
	}
}

// IN-MEMORY CACHE FOR CONVERTED SAFE DATA / OBJECT URLS (BOUNDED TO PREVENT MEMORY LEAKS)
const MAX_SAFE_DATA_URL_CACHE_SIZE = 100;
const safeDataUrlCache = new Map<string, string>();
const activeObjectUrls = new Set<string>();

function setCachedSafeUrl(key: string, url: string): void {
	if (safeDataUrlCache.size >= MAX_SAFE_DATA_URL_CACHE_SIZE) {
		const oldestKey = safeDataUrlCache.keys().next().value;
		if (oldestKey) {
			const oldUrl = safeDataUrlCache.get(oldestKey);
			if (oldUrl && oldUrl.startsWith('blob:')) {
				try {
					URL.revokeObjectURL(oldUrl);
					activeObjectUrls.delete(oldUrl);
				} catch {
					// IGNORE
				}
			}
			safeDataUrlCache.delete(oldestKey);
		}
	}
	safeDataUrlCache.set(key, url);
}

// BOUNDED CONCURRENCY QUEUE FOR SAFE IMAGE RESOLUTION (MAX 3 CONCURRENT)
type QueueTask = () => Promise<void>;
const fetchQueue: QueueTask[] = [];
let activeFetches = 0;
const MAX_CONCURRENT_IMAGE_FETCHES = 3;

function processFetchQueue() {
	while (activeFetches < MAX_CONCURRENT_IMAGE_FETCHES && fetchQueue.length > 0) {
		const nextTask = fetchQueue.shift();
		if (nextTask) {
			activeFetches++;
			nextTask().finally(() => {
				activeFetches--;
				processFetchQueue();
			});
		}
	}
}

function enqueueFetch<T>(fn: () => Promise<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		fetchQueue.push(async () => {
			try {
				const result = await fn();
				resolve(result);
			} catch (err) {
				reject(err);
			}
		});
		processFetchQueue();
	});
}

// CONVERT BASE64 DATA URL TO BLOB OBJECT URL FOR SMOOTH RENDERING
function createSafeBlobUrlFromData(dataUrl: string): string {
	try {
		if (typeof window === 'undefined' || !window.URL || !window.URL.createObjectURL) {
			return dataUrl;
		}
		const parts = dataUrl.split(',');
		const mimeMatch = parts[0].match(/:(.*?);/);
		const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
		const bstr = atob(parts[1]);
		let n = bstr.length;
		const u8arr = new Uint8Array(n);
		while (n--) {
			u8arr[n] = bstr.charCodeAt(n);
		}
		const blob = new Blob([u8arr], { type: mime });
		const objUrl = URL.createObjectURL(blob);
		activeObjectUrls.add(objUrl);
		return objUrl;
	} catch {
		return dataUrl;
	}
}

// RESOLVE AN IMAGE URL: IF HOST PAGE IS HTTPS AND SERVER IS HTTP, PROXY THROUGH BACKGROUND TO PREVENT MIXED CONTENT
export async function resolveSafeImageUrl(rawUrl: string): Promise<string> {
	if (!rawUrl) return rawUrl;
	if (safeDataUrlCache.has(rawUrl)) {
		return safeDataUrlCache.get(rawUrl)!;
	}

	const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
	const isHttpServer = rawUrl.startsWith('http://');

	// IF WE ARE ON AN HTTPS PAGE AND THE IMAGE SERVER IS HTTP, REQUEST DATA URL FROM BACKGROUND VIA QUEUE
	if (isHttpsPage && isHttpServer && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
		return enqueueFetch(async () => {
			if (safeDataUrlCache.has(rawUrl)) {
				return safeDataUrlCache.get(rawUrl)!;
			}
			return new Promise<string>(resolve => {
				let attempts = 0;
				const maxAttempts = 3;

				const doFetch = () => {
					attempts++;
					chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_DATA', url: rawUrl }, (res) => {
						if (chrome.runtime.lastError || !res || !res.ok || !res.dataUrl) {
							if (attempts < maxAttempts) {
								setTimeout(doFetch, attempts * 250);
							} else {
								resolve(rawUrl);
							}
						} else {
							setCachedSafeUrl(rawUrl, res.dataUrl);
							resolve(res.dataUrl);
						}
					});
				};

				doFetch();
			});
		});
	}

	return rawUrl;
}

const LAZY_ATTRS = [
	'data-src',
	'data-original',
	'data-lazy-src',
	'data-actual-src',
	'data-url',
	'data-origin',
	'data-full-image',
	'data-real-src'
];

const NOISE_CONTAINER_SELECTORS = [
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

const READER_CONTAINER_SELECTORS = [
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
		if (curr.matches && curr.matches(NOISE_CONTAINER_SELECTORS)) {
			return true;
		}
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

// DISCOVER THE PRIMARY COMIC READER CONTAINER BASED ON DENSITY AND TALL-PANEL HEIGHT SCORE
export function findPrimaryReaderContainer(): HTMLElement | null {
	// 1. CHECK SPECIFIC HIGH-PRIORITY MANGA/WEBTOON READER CONTAINERS FIRST
	const priorityCandidates = Array.from(
		document.querySelectorAll<HTMLElement>(
			'#readerarea, div[class*="reading-content"], div[class*="reader-area"], div[class*="readerarea"], div[class*="chapter-images"], div[class*="wt_viewer"], #comic_view_area, div[class*="viewer-cnt"], div[class*="v-reader"]'
		)
	);
	for (const container of priorityCandidates) {
		if (container.closest && container.closest(NOISE_CONTAINER_SELECTORS)) continue;
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
		if (container.closest && container.closest(NOISE_CONTAINER_SELECTORS)) continue;

		const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img, picture img')).filter(
			img => !img.getAttribute('data-xianscan-injected') && !isLikelyAdOrBannerImage(img) && !img.closest(NOISE_CONTAINER_SELECTORS)
		);
		const placeholders = Array.from(container.querySelectorAll<HTMLElement>('[data-page], [class*="page"], [id*="page"]'));

		const totalItems = Math.max(imgs.length, placeholders.length);
		if (totalItems < 1) continue;

		let heightScore = 0;
		for (const img of imgs) {
			const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
			const h = img.naturalHeight || (rect ? rect.height : 0);
			if (h >= 700) heightScore += 5;
			else if (h >= 400) heightScore += 2;
		}
		for (const p of placeholders) {
			const style = p.getAttribute('style') || '';
			const ratioMatch = style.match(/aspect-ratio:\s*(?:auto\s+)?([0-9.]+)\s*(?:\/|\:)\s*([0-9.]+)/i);
			if (ratioMatch && ratioMatch[2]) {
				const h = parseFloat(ratioMatch[2]);
				if (h >= 700) heightScore += 5;
				else if (h >= 400) heightScore += 2;
			}
		}

		const score = totalItems * 5 + heightScore;
		if (score > highestScore && totalItems >= 1) {
			highestScore = score;
			bestContainer = container;
		}
	}

	return bestContainer;
}

// COLLECT ALL COMIC READER IMAGES PRESENT IN THE HOST DOM
export function getHostReaderImages(excludedUrls?: string[], includedUrls?: string[]): HTMLImageElement[] {
	const dynamicContainer = findPrimaryReaderContainer();
	const rootScope: Document | Element = dynamicContainer || document;

	const excludedSet = new Set((excludedUrls || []).flatMap(u => [u, getCanonicalUrl(u)]));
	const includedSet = includedUrls && includedUrls.length > 0 ? new Set(includedUrls.flatMap(u => [u, getCanonicalUrl(u)])) : null;

	const allImages = Array.from(rootScope.querySelectorAll<HTMLImageElement>('img, picture img'));
	return allImages.filter(img => {
		// IGNORE INJECTED CLONES
		if (img.getAttribute('data-xianscan-injected') === 'true') {
			return false;
		}

		// RESOLVE CANDIDATE URLS FOR EXCLUSION MATCHING
		const candidates = [
			img.getAttribute('data-xianscan-orig-src'),
			img.getAttribute('data-src'),
			img.getAttribute('data-original'),
			img.getAttribute('data-url'),
			img.getAttribute('data-lazy-src'),
			img.getAttribute('data-actual-src'),
			img.getAttribute('data-full-image'),
			img.getAttribute('data-real-src'),
			img.getAttribute('data-origin'),
			img.getAttribute('src'),
			img.currentSrc,
			img.src
		].map(s => (s ? s.trim() : null)).filter(Boolean) as string[];

		const canonicalCandidates = candidates.flatMap(c => {
			if (c.startsWith('data:')) return [];
			const list = [c, getCanonicalUrl(c)];
			try {
				const abs = new URL(c, typeof window !== 'undefined' ? window.location.href : 'http://localhost').href;
				list.push(abs, getCanonicalUrl(abs));
			} catch {
				// IGNORE URL PARSE ERRORS
			}
			return list;
		});

		// 1. IF EXPLICITLY EXCLUDED BY USER IN POPUP: SKIP COMPLETELY
		if (canonicalCandidates.some(c => excludedSet.has(c))) {
			return false;
		}

		// 2. IF INCLUDED LIST IS SPECIFIED AND THIS IMAGE IS NOT IN IT: SKIP
		if (includedSet && !canonicalCandidates.some(c => includedSet.has(c))) {
			return false;
		}

		// IGNORE ICONS, TRACKERS, NOISE
		if (img.width > 0 && img.width < 100 && img.height > 0 && img.height < 100) return false;
		if (img.closest(NOISE_CONTAINER_SELECTORS)) return false;
		if (isFloatingOrSticky(img)) return false;
		if (isLikelyAdOrBannerImage(img)) return false;

		// RESOLVE HIGHEST-PRIORITY EFFECTIVE SOURCE ATTRIBUTE (SKIPPING PLACEHOLDERS)
		let effectiveSrc: string | null = null;
		for (const cand of candidates) {
			if (!cand.startsWith('data:') && !cand.includes('placeholder') && !cand.includes('blank.gif') && !cand.includes('spacer.gif') && !cand.includes('pixel.gif')) {
				effectiveSrc = cand;
				break;
			}
		}

		if (!effectiveSrc && candidates.length > 0) {
			effectiveSrc = candidates[0];
		}

		if (!effectiveSrc || effectiveSrc.startsWith('data:') || effectiveSrc.includes('avatar') || effectiveSrc.includes('banner') || effectiveSrc.includes('logo') || effectiveSrc.includes('promo') || effectiveSrc.includes('advert')) {
			return false;
		}

		return true;
	});
}

let activeDomReplacerInstance: DomReplacerEngine | null = null;

export class DomReplacerEngine {
	private baseUrl: string;
	private isTranslatedActive = false;
	private observer: MutationObserver | null = null;
	private activePageUrls = new Map<number, string>();
	private activeExcludedUrls?: string[];
	private activeIncludedUrls?: string[];
	private latestServerPages: ChapterReaderPage[] = [];
	// LAST RENDERED PER-PAGE SLICE STATUS (pending | processing | ready): USED TO SKIP REDUNDANT
	// BADGE RE-RENDERS ON EVERY 2.5S POLL AND TO DETECT THE pending → processing TRANSITION.
	private pageStatuses = new Map<number, string>();

	constructor(baseUrl = 'http://127.0.0.1:8124') {
		if (activeDomReplacerInstance && activeDomReplacerInstance !== this) {
			activeDomReplacerInstance.destroy();
		}
		activeDomReplacerInstance = this;
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	setBaseUrl(url: string) {
		this.baseUrl = url.replace(/\/+$/, '');
	}

	private purgeOrphanedBadges(_pages: ChapterReaderPage[]): void {
		// ALL BADGES ARE NOW RENDERED IN CANVAS/BASE64 DIRECTLY - NO DOM BADGES TO PURGE
	}

	private attachImageErrorHandler(img: HTMLImageElement, pageId: number, targetUrl: string) {
		let retries = 0;
		const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

		// RESTORE THE ORIGINAL HOST IMAGE SO THE READER NEVER SHOWS A BROKEN SLICE.
		const fallbackToOriginal = () => {
			const origSrc = img.getAttribute('data-xianscan-orig-src');
			if (origSrc) {
				img.src = origSrc;
				img.srcset = '';
			}
		};

		img.onerror = () => {
			// MIXED-CONTENT BLOCK: A RAW HTTP SERVER URL ASSIGNED TO THE IMG SRC ON AN HTTPS PAGE
			// IS ALWAYS BLOCKED BY THE BROWSER, SO RETRYING THE SAME URL IS POINTLESS. WHEN THE
			// HTTPS PROXY FAILED TO REPLACE IT WITH A BLOB URL (IMG STILL HOLDS THE RAW HTTP URL),
			// RESTORE THE ORIGINAL IMAGE IMMEDIATELY: NO RETRY LOOP AND NO CONSOLE SPAM.
			const isMixedContentBlocked =
				isHttpsPage &&
				targetUrl.startsWith('http://') &&
				(img.src === targetUrl || img.currentSrc === targetUrl);

			if (isMixedContentBlocked) {
				fallbackToOriginal();
				return;
			}

			if (retries >= 3) {
				fallbackToOriginal();
				return;
			}

			retries++;
			safeDataUrlCache.delete(targetUrl);
			setTimeout(() => {
				void resolveSafeImageUrl(targetUrl).then(freshSafeUrl => {
					if (img.getAttribute('data-xianscan-page-id') !== String(pageId)) return;
					// AVOID REASSIGNING A MIXED-CONTENT-BLOCKED RAW HTTP URL ON AN HTTPS PAGE.
					if (freshSafeUrl === targetUrl && targetUrl.startsWith('http://') && isHttpsPage) {
						fallbackToOriginal();
						return;
					}
					img.src = freshSafeUrl;
					img.srcset = '';
				});
			}, retries * 500);
		};
	}

	private sanitizeLazyAttributes(img: HTMLImageElement) {
		if (!img.getAttribute('data-xianscan-orig-src')) {
			img.setAttribute('data-xianscan-orig-src', img.src || img.getAttribute('data-src') || '');
			img.setAttribute('data-xianscan-orig-srcset', img.srcset || '');
		}

		for (const attr of LAZY_ATTRS) {
			if (img.hasAttribute(attr)) {
				const val = img.getAttribute(attr);
				if (val && !img.hasAttribute(`data-xianscan-orig-${attr}`)) {
					img.setAttribute(`data-xianscan-orig-${attr}`, val);
				}
				img.removeAttribute(attr);
			}
		}
		img.srcset = '';
	}

	private startLazyLoadShield() {
		if (this.observer || typeof MutationObserver === 'undefined') return;

		this.observer = new MutationObserver(mutations => {
			if (!this.isTranslatedActive) return;

			let hasAddedNodes = false;

			for (const mutation of mutations) {
				// 1. ATTRIBUTE MUTATIONS ON MANAGED IMAGES
				if (mutation.type === 'attributes') {
					const target = mutation.target as HTMLImageElement;
					if (!target || target.tagName !== 'IMG') continue;

					const pageIdStr = target.getAttribute('data-xianscan-page-id');
					if (!pageIdStr) continue;

					const pageId = Number(pageIdStr);
					const expectedSafeUrl = this.activePageUrls.get(pageId);
					if (expectedSafeUrl && target.src !== expectedSafeUrl) {
						// NEVER OVERWRITE WITH A RAW HTTP URL ON AN HTTPS HOST
						const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';
						if (isHttpsHost && expectedSafeUrl.startsWith('http://')) {
							continue;
						}
						// SITE LAZY LOADER TRIED TO OVERWRITE OUR IMAGE: RESTORE IMMEDIATELY
						target.src = expectedSafeUrl;
						target.srcset = '';
						for (const attr of LAZY_ATTRS) {
							target.removeAttribute(attr);
						}
					}
				} else if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					for (const node of Array.from(mutation.addedNodes)) {
						if (node.nodeType === 1) {
							const el = node as HTMLElement;
							if (el.tagName === 'IMG' || el.querySelector('img')) {
								hasAddedNodes = true;
								break;
							}
						}
					}
				}
			}

			// 2. DYNAMIC VIRTUAL-SCROLL / INFINITE-SCROLL NODE RECONCILIATION
			if (hasAddedNodes && this.latestServerPages.length > 0) {
				this.reconcileDynamicHostImages();
			}
		});

		this.observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['src', 'srcset', ...LAZY_ATTRS],
			childList: true,
			subtree: true
		});
	}

	// RECONCILE FRESHLY INSERTED DOM IMAGES (FROM VIRTUAL SCROLL OR INFINITE SCROLL) WITH SERVER SCRIPT PAGES
	private reconcileDynamicHostImages(): void {
		if (!this.isTranslatedActive || this.latestServerPages.length === 0) return;

		const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';

		for (let i = 0; i < hostImgs.length && i < this.latestServerPages.length; i++) {
			const img = hostImgs[i];
			if (img.getAttribute('data-xianscan-page-id')) continue;

			const page = this.latestServerPages[i];
			const isOutputReady = !!page.outputPath || page.outputRev > 0;
			const targetUrl = isOutputReady
				? `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`
				: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 1}`;

			this.sanitizeLazyAttributes(img);
			img.setAttribute('data-xianscan-page-id', String(page.id));
			img.setAttribute('data-xianscan-page-seq', String(page.seq));
			const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

			if (!shouldProxy) {
				img.src = targetUrl;
			}
			img.style.display = '';
			img.style.filter = 'none';

			this.attachImageErrorHandler(img, page.id, targetUrl);

			void resolveSafeImageUrl(targetUrl).then(safeUrl => {
				this.activePageUrls.set(page.id, safeUrl);
				if (img.getAttribute('data-xianscan-page-id') === String(page.id)) {
					img.src = safeUrl;
					img.srcset = '';
				}
			});
		}
	}

	// SWAP ORIGINAL IMAGES IN-PLACE PRESERVING HOST CONTAINERS & EXACT STYLES
	mountTranslatedPages(pages: ChapterReaderPage[], excludedUrls?: string[], includedUrls?: string[]): boolean {
		this.activeExcludedUrls = excludedUrls;
		this.activeIncludedUrls = includedUrls;
		this.latestServerPages = pages;
		// PURGE BADGES WHOSE PAGE IDS NO LONGER EXIST (RESLICE/RE-SYNC REMAPPED THEM)
		this.purgeOrphanedBadges(pages);
		const hostImgs = getHostReaderImages(excludedUrls, includedUrls);
		if (hostImgs.length === 0 || pages.length === 0) {
			return false;
		}

		// REMOVE ANY PREVIOUSLY INJECTED CLONES TO PREVENT DUPLICATE ACCUMULATION
		document.querySelectorAll('img[data-xianscan-injected="true"]').forEach(el => el.remove());

		const totalServerPages = pages.length;
		const totalHostImgs = hostImgs.length;
		let lastAnchor: HTMLElement = hostImgs[0];
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';

		for (let i = 0; i < totalServerPages; i++) {
			const page = pages[i];
			const isOutputReady = !!page.outputPath || page.outputRev > 0;
			const pageStatus: 'ready' | 'processing' | 'pending' = isOutputReady
				? 'ready'
				: (page.status === 'processing' ? 'processing' : 'pending');
			this.pageStatuses.set(page.id, pageStatus);
			const targetUrl = isOutputReady
				? `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`
				: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 1}`;

			const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

			if (i < totalHostImgs) {
				const img = hostImgs[i];
				this.sanitizeLazyAttributes(img);

				img.setAttribute('data-xianscan-page-id', String(page.id));
				img.setAttribute('data-xianscan-page-seq', String(page.seq));
				img.setAttribute('data-xianscan-status', pageStatus);
				if (!shouldProxy) {
					img.src = targetUrl;
				}
				img.style.display = '';
				img.style.filter = 'none';
				lastAnchor = img;

				this.attachImageErrorHandler(img, page.id, targetUrl);

				void resolveSafeImageUrl(targetUrl).then(safeUrl => {
					this.activePageUrls.set(page.id, safeUrl);
					if (img.getAttribute('data-xianscan-page-id') === String(page.id)) {
						img.src = safeUrl;
						img.srcset = '';
					}
				});
			} else {
				// RESLICED COUNT > HOST COUNT: INSERT CONSECUTIVELY AFTER lastAnchor
				const templateImg = hostImgs[hostImgs.length - 1];
				const clone = templateImg.cloneNode(true) as HTMLImageElement;
				this.sanitizeLazyAttributes(clone);
				clone.setAttribute('data-xianscan-injected', 'true');
				clone.setAttribute('data-xianscan-page-id', String(page.id));
				clone.setAttribute('data-xianscan-page-seq', String(page.seq));
				clone.setAttribute('data-xianscan-status', pageStatus);
				if (!shouldProxy) {
					clone.src = targetUrl;
				}
				clone.style.display = '';
				clone.style.filter = 'none';

				lastAnchor.insertAdjacentElement('afterend', clone);
				lastAnchor = clone;

				this.attachImageErrorHandler(clone, page.id, targetUrl);

				void resolveSafeImageUrl(targetUrl).then(safeUrl => {
					this.activePageUrls.set(page.id, safeUrl);
					if (clone.getAttribute('data-xianscan-page-id') === String(page.id)) {
						clone.src = safeUrl;
						clone.srcset = '';
					}
				});
			}
		}

		// RESLICED COUNT < HOST COUNT: HIDE SURPLUS TRAILING HOST IMAGES
		if (totalHostImgs > totalServerPages) {
			for (let i = totalServerPages; i < totalHostImgs; i++) {
				const img = hostImgs[i];
				img.setAttribute('data-xianscan-hidden', 'true');
				img.style.display = 'none';
			}
		}

		this.isTranslatedActive = true;
		this.startLazyLoadShield();
		return true;
	}

	// UPDATE A SINGLE PAGE IMAGE IMMEDIATELY WHEN SSE PAGE_DONE ARRIVES
	updatePageSlice(pageId: number, pageSeq: number, outputRev: number): void {
		this.pageStatuses.set(pageId, 'ready');

		// UPDATE IN latestServerPages
		const existingMeta = this.latestServerPages.find(p => p.id === pageId || p.seq === pageSeq);
		if (existingMeta) {
			existingMeta.outputRev = outputRev;
			existingMeta.outputPath = existingMeta.outputPath || `out_${pageId}.webp`;
			existingMeta.status = 'done';
		}

		let img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-id="${pageId}"]`);
		if (!img) {
			img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq}"]`);
		}

		if (!img) {
			const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
			if (pageSeq < hostImgs.length) {
				img = hostImgs[pageSeq];
			}
		}

		const newUrl = `${this.baseUrl}/api/pages/${pageId}/file?kind=output&rev=${outputRev}`;
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';

		const shouldProxy = isHttpsHost && newUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

		if (img) {
			this.sanitizeLazyAttributes(img);
			img.setAttribute('data-xianscan-page-id', String(pageId));
			img.setAttribute('data-xianscan-page-seq', String(pageSeq));
			img.setAttribute('data-xianscan-status', 'ready');
			if (!shouldProxy) {
				img.src = newUrl;
			}
			img.style.display = '';
			img.style.filter = 'none';

			this.attachImageErrorHandler(img, pageId, newUrl);

			void resolveSafeImageUrl(newUrl).then(safeUrl => {
				this.activePageUrls.set(pageId, safeUrl);
				if (img!.getAttribute('data-xianscan-page-id') === String(pageId) ||
				    img!.getAttribute('data-xianscan-page-seq') === String(pageSeq)) {
					img!.src = safeUrl;
					img!.srcset = '';
				}
			});
		} else {
			// FIND ELEMENT FOR PREVIOUS SEQUENCE OR LAST MOUNTED IMAGE TO INSERT CONSECUTIVELY
			const prevImg = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq - 1}"]`) ||
			                document.querySelector<HTMLImageElement>('img[data-xianscan-injected="true"]:last-of-type') ||
			                getHostReaderImages().pop();

			if (prevImg) {
				const clone = prevImg.cloneNode(true) as HTMLImageElement;
				this.sanitizeLazyAttributes(clone);
				clone.setAttribute('data-xianscan-injected', 'true');
				clone.setAttribute('data-xianscan-page-id', String(pageId));
				clone.setAttribute('data-xianscan-page-seq', String(pageSeq));
				clone.setAttribute('data-xianscan-status', 'ready');
				if (!shouldProxy) {
					clone.src = newUrl;
				}
				clone.style.display = '';
				clone.style.filter = 'none';

				prevImg.insertAdjacentElement('afterend', clone);
				this.attachImageErrorHandler(clone, pageId, newUrl);

				void resolveSafeImageUrl(newUrl).then(safeUrl => {
					this.activePageUrls.set(pageId, safeUrl);
					if (clone.getAttribute('data-xianscan-page-id') === String(pageId)) {
						clone.src = safeUrl;
						clone.srcset = '';
					}
				});
			}
		}

		this.isTranslatedActive = true;
		this.startLazyLoadShield();
	}

	// UPDATE A NON-READY PAGE'S LIVE STATUS (pending / processing)
	updatePageStatus(pageId: number, pageSeq: number, status: 'pending' | 'processing'): void {
		if (this.pageStatuses.get(pageId) === status) return;
		this.pageStatuses.set(pageId, status);

		const existingMeta = this.latestServerPages.find(p => p.id === pageId || p.seq === pageSeq);
		if (existingMeta) {
			existingMeta.status = status;
		}

		let img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-id="${pageId}"]`);
		if (!img) {
			img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq}"]`);
		}
		if (!img) {
			const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
			if (pageSeq < hostImgs.length) {
				img = hostImgs[pageSeq];
			}
		}
		if (!img) return;

		img.setAttribute('data-xianscan-status', status);
		img.style.filter = 'none';
	}

	// TOGGLE BETWEEN TRANSLATED AND RAW ORIGINAL VIEW
	setMode(mode: 'translated' | 'raw'): void {
		const hostImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-orig-src]');
		const injectedImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-injected="true"]');
		const hiddenImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-hidden="true"]');

		if (mode === 'raw') {
			hostImgs.forEach(img => {
				const origSrc = img.getAttribute('data-xianscan-orig-src');
				const origSrcset = img.getAttribute('data-xianscan-orig-srcset');
				if (origSrc) img.src = origSrc;
				if (origSrcset) img.srcset = origSrcset;
				img.style.opacity = '';
				img.style.filter = '';
				img.style.transition = '';

				for (const attr of LAZY_ATTRS) {
					const origVal = img.getAttribute(`data-xianscan-orig-${attr}`);
					if (origVal) {
						img.setAttribute(attr, origVal);
					}
				}
			});
			injectedImgs.forEach(img => (img.style.display = 'none'));
			hiddenImgs.forEach(img => (img.style.display = ''));
			this.isTranslatedActive = false;
		} else {
			injectedImgs.forEach(img => (img.style.display = ''));
			hiddenImgs.forEach(img => (img.style.display = 'none'));
			hostImgs.forEach(img => {
				const pageId = Number(img.getAttribute('data-xianscan-page-id'));
				if (pageId && this.activePageUrls.has(pageId)) {
					img.src = this.activePageUrls.get(pageId)!;
				}
				img.style.filter = 'none';
			});
			this.isTranslatedActive = true;
			this.startLazyLoadShield();
		}
	}

	getIsTranslatedActive(): boolean {
		return this.isTranslatedActive;
	}

	// CLEANUP
	destroy(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		this.setMode('raw');
		document.querySelectorAll('img[data-xianscan-injected="true"]').forEach(el => el.remove());
		document.querySelectorAll('img[data-xianscan-hidden="true"]').forEach(el => {
			(el as HTMLElement).style.display = '';
			el.removeAttribute('data-xianscan-hidden');
		});
		document.querySelectorAll('[data-xianscan-badge-id]').forEach(b => b.remove());
		document.querySelectorAll('[data-xianscan-wrapper="true"]').forEach(wrapper => {
			const parent = wrapper.parentElement;
			if (parent) {
				while (wrapper.firstChild) {
					parent.insertBefore(wrapper.firstChild, wrapper);
				}
				wrapper.remove();
			}
		});

		// REVOKE ALL CREATED OBJECT URLS TO PREVENT MEMORY LEAKS
		for (const objUrl of activeObjectUrls) {
			try {
				URL.revokeObjectURL(objUrl);
			} catch {
				// IGNORE
			}
		}
		activeObjectUrls.clear();
		safeDataUrlCache.clear();
		this.latestServerPages = [];
		this.isTranslatedActive = false;
	}
}
