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

// IN-MEMORY CACHE FOR CONVERTED SAFE DATA / OBJECT URLS
const safeDataUrlCache = new Map<string, string>();
const activeObjectUrls = new Set<string>();

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
				chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_DATA', url: rawUrl }, res => {
					if (chrome.runtime.lastError || !res || !res.ok || !res.dataUrl) {
						resolve(rawUrl);
					} else {
						const safeUrl = createSafeBlobUrlFromData(res.dataUrl);
						safeDataUrlCache.set(rawUrl, safeUrl);
						resolve(safeUrl);
					}
				});
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

// COLLECT ALL COMIC READER IMAGES PRESENT IN THE HOST DOM
export function getHostReaderImages(excludedUrls?: string[], includedUrls?: string[]): HTMLImageElement[] {
	const readerContainers = document.querySelectorAll(READER_CONTAINER_SELECTORS);
	let rootScope: Document | Element = document;
	for (const container of Array.from(readerContainers)) {
		const imgsInContainer = container.querySelectorAll('img, picture img');
		if (imgsInContainer.length >= 3) {
			rootScope = container;
			break;
		}
	}

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
			img.getAttribute('src'),
			img.getAttribute('data-src'),
			img.getAttribute('data-original'),
			img.getAttribute('data-url'),
			img.getAttribute('data-actual-src'),
			img.src,
			img.currentSrc
		].filter(Boolean) as string[];

		const canonicalCandidates = candidates.flatMap(c => {
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

		const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
		if (!src || src.startsWith('data:') || src.includes('avatar') || src.includes('banner') || src.includes('logo') || src.includes('promo') || src.includes('advert')) {
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

	private ensureSliceWrapper(img: HTMLImageElement): HTMLElement {
		const parent = img.parentElement;
		if (parent && parent.getAttribute('data-xianscan-wrapper') === 'true') {
			return parent;
		}

		const wrapper = document.createElement('div');
		wrapper.setAttribute('data-xianscan-wrapper', 'true');
		wrapper.style.position = 'relative';
		wrapper.style.display = 'inline-block';
		wrapper.style.width = 'fit-content';
		wrapper.style.maxWidth = '100%';
		wrapper.style.lineHeight = '0';
		wrapper.style.verticalAlign = 'top';

		// PRESERVE IMAGE ALIGNMENT AND MARGINS ON THE WRAPPER
		try {
			const computed = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(img) : null;
			if (computed && computed.margin && computed.margin !== '0px') {
				wrapper.style.margin = computed.margin;
			}
			if (computed && computed.alignSelf && computed.alignSelf !== 'auto') {
				wrapper.style.alignSelf = computed.alignSelf;
			}
		} catch {
			// IGNORE COMPUTED STYLE FAILURES IN HEADLESS OR SANDBOX CONTEXTS
		}

		img.insertAdjacentElement('beforebegin', wrapper);
		wrapper.appendChild(img);
		return wrapper;
	}

	private attachPendingBadge(img: HTMLImageElement, pageId: number): void {
		this.removePendingBadge(pageId);
		const wrapper = this.ensureSliceWrapper(img);

		const badge = document.createElement('span');
		badge.className = 'xianscan-slice-badge pending';
		badge.setAttribute('data-xianscan-badge-id', String(pageId));
		badge.textContent = 'PENDING';
		badge.style.cssText = [
			'position: absolute',
			'top: 10px',
			'right: 10px',
			'z-index: 9999',
			'background: rgba(15, 23, 42, 0.88)',
			'color: #f87171',
			'border: 1px solid rgba(239, 68, 68, 0.55)',
			'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
			'font-size: 10px',
			'font-weight: 700',
			'letter-spacing: 0.08em',
			'text-transform: uppercase',
			'padding: 3px 9px',
			'border-radius: 9999px',
			'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), 0 0 10px rgba(239, 68, 68, 0.25)',
			'pointer-events: none',
			'user-select: none',
			'backdrop-filter: blur(4px)',
			'transition: opacity 0.3s ease, transform 0.3s ease',
			'line-height: 1.2'
		].join('; ');

		wrapper.appendChild(badge);
	}

	private removePendingBadge(pageId: number): void {
		const badge = document.querySelector<HTMLElement>(`[data-xianscan-badge-id="${pageId}"]`);
		if (badge) {
			badge.style.opacity = '0';
			badge.style.transform = 'scale(0.9)';
			setTimeout(() => {
				badge.remove();
			}, 300);
		}
	}

	private attachImageErrorHandler(img: HTMLImageElement, pageId: number, targetUrl: string) {
		let retries = 0;
		img.onerror = () => {
			if (retries < 3) {
				retries++;
				console.warn(`[XianScan] Image load error on page #${pageId}, retrying (attempt ${retries})...`);
				safeDataUrlCache.delete(targetUrl);
				setTimeout(() => {
					void resolveSafeImageUrl(targetUrl).then(freshSafeUrl => {
						if (img.getAttribute('data-xianscan-page-id') === String(pageId)) {
							img.src = freshSafeUrl;
							img.srcset = '';
						}
					});
				}, retries * 500);
			}
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
				: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev || 0}`;

			this.sanitizeLazyAttributes(img);
			img.setAttribute('data-xianscan-page-id', String(page.id));
			img.setAttribute('data-xianscan-page-seq', String(page.seq));
			img.setAttribute('data-xianscan-status', isOutputReady ? 'ready' : 'pending');

			if (!isHttpsHost || !targetUrl.includes('127.0.0.1') && !targetUrl.includes('localhost')) {
				img.src = targetUrl;
			}
			img.style.display = '';
			img.style.transition = 'filter 0.35s ease';
			img.style.filter = isOutputReady ? 'none' : 'brightness(0.38) contrast(1.15)';

			this.attachImageErrorHandler(img, page.id, targetUrl);
			this.activePageUrls.set(page.id, targetUrl);

			if (!isOutputReady) {
				this.attachPendingBadge(img, page.id);
			} else {
				this.removePendingBadge(page.id);
			}

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
			const targetUrl = isOutputReady
				? `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`
				: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev || 0}`;

			if (i < totalHostImgs) {
				const img = hostImgs[i];
				this.sanitizeLazyAttributes(img);

				img.setAttribute('data-xianscan-page-id', String(page.id));
				img.setAttribute('data-xianscan-page-seq', String(page.seq));
				img.setAttribute('data-xianscan-status', isOutputReady ? 'ready' : 'pending');
				if (!isHttpsHost || !targetUrl.includes('127.0.0.1') && !targetUrl.includes('localhost')) {
					img.src = targetUrl;
				}
				img.style.display = '';
				img.style.transition = 'filter 0.35s ease';
				img.style.filter = isOutputReady ? 'none' : 'brightness(0.38) contrast(1.15)';
				lastAnchor = img;

				this.attachImageErrorHandler(img, page.id, targetUrl);
				this.activePageUrls.set(page.id, targetUrl);

				if (!isOutputReady) {
					this.attachPendingBadge(img, page.id);
				} else {
					this.removePendingBadge(page.id);
				}

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
				clone.setAttribute('data-xianscan-status', isOutputReady ? 'ready' : 'pending');
				if (!isHttpsHost || !targetUrl.includes('127.0.0.1') && !targetUrl.includes('localhost')) {
					clone.src = targetUrl;
				}
				clone.style.display = '';
				clone.style.transition = 'filter 0.35s ease';
				clone.style.filter = isOutputReady ? 'none' : 'brightness(0.38) contrast(1.15)';

				lastAnchor.insertAdjacentElement('afterend', clone);
				lastAnchor = clone;

				this.attachImageErrorHandler(clone, page.id, targetUrl);
				this.activePageUrls.set(page.id, targetUrl);

				if (!isOutputReady) {
					this.attachPendingBadge(clone, page.id);
				} else {
					this.removePendingBadge(page.id);
				}

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
		this.removePendingBadge(pageId);

		// Update in latestServerPages
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

		if (img) {
			this.sanitizeLazyAttributes(img);
			img.setAttribute('data-xianscan-page-id', String(pageId));
			img.setAttribute('data-xianscan-page-seq', String(pageSeq));
			img.setAttribute('data-xianscan-status', 'ready');
			if (!isHttpsHost || !newUrl.includes('127.0.0.1') && !newUrl.includes('localhost')) {
				img.src = newUrl;
			}
			img.style.display = '';
			img.style.transition = 'filter 0.35s ease';
			img.style.filter = 'none';

			this.attachImageErrorHandler(img, pageId, newUrl);
			this.activePageUrls.set(pageId, newUrl);

			void resolveSafeImageUrl(newUrl).then(safeUrl => {
				this.activePageUrls.set(pageId, safeUrl);
				if (img!.getAttribute('data-xianscan-page-id') === String(pageId) ||
				    img!.getAttribute('data-xianscan-page-seq') === String(pageSeq)) {
					img!.src = safeUrl;
					img!.srcset = '';
				}
			});
		} else {
			// Find element for previous sequence or last mounted image to insert consecutively
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
				if (!isHttpsHost || !newUrl.includes('127.0.0.1') && !newUrl.includes('localhost')) {
					clone.src = newUrl;
				}
				clone.style.display = '';
				clone.style.transition = 'filter 0.35s ease';
				clone.style.filter = 'none';

				prevImg.insertAdjacentElement('afterend', clone);
				this.attachImageErrorHandler(clone, pageId, newUrl);
				this.activePageUrls.set(pageId, newUrl);

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

	// TOGGLE BETWEEN TRANSLATED AND RAW ORIGINAL VIEW
	setMode(mode: 'translated' | 'raw'): void {
		const hostImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-orig-src]');
		const injectedImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-injected="true"]');
		const hiddenImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-hidden="true"]');
		const badges = document.querySelectorAll('[data-xianscan-badge-id]');

		if (mode === 'raw') {
			badges.forEach(b => (b as HTMLElement).style.display = 'none');
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
			badges.forEach(b => (b as HTMLElement).style.display = '');
			injectedImgs.forEach(img => (img.style.display = ''));
			hiddenImgs.forEach(img => (img.style.display = 'none'));
			hostImgs.forEach(img => {
				const pageId = Number(img.getAttribute('data-xianscan-page-id'));
				if (pageId && this.activePageUrls.has(pageId)) {
					img.src = this.activePageUrls.get(pageId)!;
				}
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
