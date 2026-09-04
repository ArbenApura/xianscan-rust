// -- IN-PLACE IMAGE REPLACEMENT AND RESLICE SYNCHRONIZATION ENGINE -- //

// IMPORTED TYPES
import type { ChapterReaderPage } from '../types';

// IMPORTED MODULES
import { NOISE_CONTAINER_SELECTORS, isFloatingOrSticky, isLikelyAdOrBannerImage } from '../core/heuristics/ad-detector';
import { getCanonicalUrl } from '../core/heuristics/url-clustering';
import { resolveSafeImageUrl, clearSafeImageUrlCache, invalidateCachedSafeUrl } from './safe-image';
import { findPrimaryReaderContainer } from './scanner';

// -- CONSTANTS -- //

export const BLANK_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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

// -- HELPER FUNCTIONS -- //

// RESOLVE ALL CANDIDATE URLS FROM AN IMAGE ELEMENT
export function getImageCandidateUrls(img: HTMLImageElement): string[] {
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

	return candidates.flatMap(c => {
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
}

// COLLECT ALL COMIC READER IMAGES PRESENT IN THE HOST DOM
export function getHostReaderImages(excludedUrls?: string[], includedUrls?: string[]): HTMLImageElement[] {
	const dynamicContainer = findPrimaryReaderContainer();
	const rootScope: Document | Element = dynamicContainer || document;

	const excludedSet = new Set((excludedUrls || []).flatMap(u => [u, getCanonicalUrl(u)]));
	const includedSet = includedUrls && includedUrls.length > 0 ? new Set(includedUrls.flatMap(u => [u, getCanonicalUrl(u)])) : null;

	const allImages = Array.from(rootScope.querySelectorAll<HTMLImageElement>('img, picture img'));
	const filtered = allImages.filter(img => {
		// IGNORE INJECTED CLONES
		if (img.getAttribute('data-xianscan-injected') === 'true') {
			return false;
		}

		const canonicalCandidates = getImageCandidateUrls(img);

		// 1. IF EXPLICITLY EXCLUDED BY USER IN POPUP: SKIP COMPLETELY
		if (canonicalCandidates.some(c => excludedSet.has(c))) {
			return false;
		}

		// 2. IF INCLUDED LIST IS SPECIFIED AND THIS IMAGE MATCHES IT: ALWAYS ACCEPT
		const isExplicitlyIncluded = includedSet && canonicalCandidates.some(c => includedSet.has(c));
		if (includedSet && !isExplicitlyIncluded) {
			return false;
		}

		// IF EXPLICITLY INCLUDED: BYPASS NOISE / PLACEHOLDER SIZE FILTERS (PREVENTS REJECTING LAZY-LOADED IMAGES)
		if (!isExplicitlyIncluded) {
			// IGNORE ICONS, TRACKERS, NOISE
			if (img.width > 0 && img.width < 100 && img.height > 0 && img.height < 100) return false;
			if (img.closest(NOISE_CONTAINER_SELECTORS)) return false;
			if (isFloatingOrSticky(img)) return false;
			if (isLikelyAdOrBannerImage(img)) return false;
		}

		// RESOLVE HIGHEST-PRIORITY EFFECTIVE SOURCE ATTRIBUTE (SKIPPING PLACEHOLDERS)
		let effectiveSrc: string | null = null;
		for (const cand of canonicalCandidates) {
			if (!cand.startsWith('data:') && !cand.includes('placeholder') && !cand.includes('blank.gif') && !cand.includes('spacer.gif') && !cand.includes('pixel.gif')) {
				effectiveSrc = cand;
				break;
			}
		}

		if (!effectiveSrc && canonicalCandidates.length > 0) {
			effectiveSrc = canonicalCandidates[0];
		}

		if (!isExplicitlyIncluded) {
			if (!effectiveSrc || effectiveSrc.startsWith('data:') || effectiveSrc.includes('avatar') || effectiveSrc.includes('banner') || effectiveSrc.includes('logo') || effectiveSrc.includes('promo') || effectiveSrc.includes('advert')) {
				return false;
			}
		}

		return true;
	});

	// SORT HOST IMAGES BY DOM DOCUMENT POSITION (NATURAL READING ORDER)
	return filtered.sort((a, b) => {
		const pos = a.compareDocumentPosition(b);
		if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
			return -1;
		}
		if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
			return 1;
		}
		return 0;
	});
}

let activeDomReplacerInstance: DomReplacerEngine | null = null;

// -- DOM REPLACER ENGINE CLASS -- //

export class DomReplacerEngine {
	private baseUrl: string;
	private isTranslatedActive = false;
	private observer: MutationObserver | null = null;
	private activePageUrls = new Map<number, string>();
	private activeExcludedUrls?: string[];
	private activeIncludedUrls?: string[];
	private latestServerPages: ChapterReaderPage[] = [];
	private pageStatuses = new Map<number, string>();
	private reconciliationScheduled = false;
	private isSelfMutating = false;
	private explicitIsResliced?: boolean;

	constructor(baseUrl = 'http://127.0.0.1:8124') {
		if (activeDomReplacerInstance && activeDomReplacerInstance !== this) {
			activeDomReplacerInstance.destroy();
		}
		activeDomReplacerInstance = this;
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	setBaseUrl(url: string): void {
		this.baseUrl = url.replace(/\/+$/, '');
	}

	private runSelfMutation(fn: () => void): void {
		this.isSelfMutating = true;
		try {
			fn();
		} finally {
			// MICROTASK TICK RESTORES LISTENER ONLY AFTER BROWSER RE-ENTRANCY SETTLES
			setTimeout(() => {
				this.isSelfMutating = false;
			}, 30);
		}
	}

	private isReslicedChapter(): boolean {
		if (this.explicitIsResliced !== undefined) {
			return this.explicitIsResliced;
		}
		if (!this.activeIncludedUrls || this.activeIncludedUrls.length === 0) {
			return false;
		}
		return this.latestServerPages.length > this.activeIncludedUrls.length;
	}

	private attachImageErrorHandler(img: HTMLImageElement, pageId: number, targetUrl: string): void {
		let retries = 0;
		const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

		img.onerror = () => {
			if (retries >= 3) {
				return;
			}

			retries++;
			invalidateCachedSafeUrl(targetUrl);
			setTimeout(() => {
				void resolveSafeImageUrl(targetUrl).then(freshSafeUrl => {
					if (img.getAttribute('data-xianscan-page-id') !== String(pageId)) return;
					if (!freshSafeUrl || (isHttpsPage && freshSafeUrl.startsWith('http://'))) {
						return;
					}
					this.runSelfMutation(() => {
						img.src = freshSafeUrl;
						img.setAttribute('data-xianscan-applied-src', freshSafeUrl);
						img.srcset = '';
					});
				});
			}, retries * 500);
		};
	}

	private sanitizeLazyAttributes(img: HTMLImageElement): void {
		this.runSelfMutation(() => {
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
		});
	}

	private scheduleReconciliation(): void {
		if (this.reconciliationScheduled) return;
		this.reconciliationScheduled = true;
		setTimeout(() => {
			this.reconciliationScheduled = false;
			if (this.isTranslatedActive && this.latestServerPages.length > 0) {
				this.reconcileDynamicHostImages();
			}
		}, 100);
	}

	private startLazyLoadShield(): void {
		if (this.observer || typeof MutationObserver === 'undefined') return;

		this.observer = new MutationObserver(mutations => {
			if (!this.isTranslatedActive || this.isSelfMutating) return;

			let needsReconciliation = false;

			for (const mutation of mutations) {
				if (mutation.type === 'attributes') {
					const target = mutation.target as HTMLImageElement;
					if (!target || target.tagName !== 'IMG') continue;
					if (target.getAttribute('data-xianscan-injected') === 'true') continue;
					if (target.getAttribute('data-xianscan-hidden') === 'true') continue;

					const pageIdStr = target.getAttribute('data-xianscan-page-id');
					if (pageIdStr) {
						// PROTECT ALREADY-CLAIMED IMAGE: REVERT ONLY IF HOST OVERWROTE OUR SRC
						const pageId = Number(pageIdStr);
						const expectedSafeUrl = this.activePageUrls.get(pageId);
						const appliedSrc = target.getAttribute('data-xianscan-applied-src');
						if (expectedSafeUrl && target.src !== appliedSrc && target.src !== expectedSafeUrl) {
							const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';
							if (isHttpsHost && expectedSafeUrl.startsWith('http://')) {
								continue;
							}
							this.runSelfMutation(() => {
								target.src = expectedSafeUrl;
								target.setAttribute('data-xianscan-applied-src', expectedSafeUrl);
								target.srcset = '';
								for (const attr of LAZY_ATTRS) {
									target.removeAttribute(attr);
								}
							});
						}
					} else {
						// UNCLAIMED IMAGE: ITS SRC OR LAZY ATTRIBUTE JUST MUTATED (LAZY LOADING TRIGGERED)
						needsReconciliation = true;
					}
				} else if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					for (const node of Array.from(mutation.addedNodes)) {
						if (node.nodeType === 1) {
							const el = node as HTMLElement;
							if (el.tagName === 'IMG' || el.querySelector('img')) {
								needsReconciliation = true;
								break;
							}
						}
					}
				}
			}

			if (needsReconciliation && this.latestServerPages.length > 0) {
				this.scheduleReconciliation();
			}
		});

		const observeTarget = findPrimaryReaderContainer() || document.body;
		this.observer.observe(observeTarget, {
			attributes: true,
			attributeFilter: ['src', 'srcset', ...LAZY_ATTRS],
			childList: true,
			subtree: true
		});
	}

	private reconcileDynamicHostImages(): void {
		if (!this.isTranslatedActive || this.latestServerPages.length === 0) return;

		const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';

		// RESLICED CHAPTER: HIDE ANY DYNAMICALLY ADDED RAW HOST STRIPS
		if (this.isReslicedChapter()) {
			const dynamicContainer = findPrimaryReaderContainer() || document;
			const candidateImgs = Array.from(dynamicContainer.querySelectorAll<HTMLImageElement>('img'));
			this.runSelfMutation(() => {
				for (const img of candidateImgs) {
					if (!img.getAttribute('data-xianscan-page-id') && img.getAttribute('data-xianscan-injected') !== 'true') {
						img.setAttribute('data-xianscan-hidden', 'true');
						img.style.display = 'none';
					}
				}
			});
			return;
		}

		// NON-RESLICED CHAPTER: 1-TO-1 MAPPING BETWEEN HOST IMAGES AND SERVER PAGES
		const urlToPageMap = new Map<string, ChapterReaderPage>();
		if (this.activeIncludedUrls) {
			for (let idx = 0; idx < this.activeIncludedUrls.length; idx++) {
				const u = this.activeIncludedUrls[idx];
				const page = this.latestServerPages[idx];
				if (page && u) {
					urlToPageMap.set(u, page);
					urlToPageMap.set(getCanonicalUrl(u), page);
				}
			}
		}

		for (const img of hostImgs) {
			if (img.getAttribute('data-xianscan-page-id')) continue;

			let matchedPage: ChapterReaderPage | null = null;
			const candidates = getImageCandidateUrls(img);
			for (const cand of candidates) {
				if (urlToPageMap.has(cand)) {
					const candidatePage = urlToPageMap.get(cand)!;
					const alreadyClaimed = document.querySelector(`img[data-xianscan-page-id="${candidatePage.id}"]:not([data-xianscan-injected="true"])`);
					if (!alreadyClaimed) {
						matchedPage = candidatePage;
						break;
					}
				}
			}

			// FALLBACK BY DOCUMENT SEQUENCE ONLY IF URL MAP HAS NO MATCH
			if (!matchedPage && urlToPageMap.size === 0) {
				for (const page of this.latestServerPages) {
					const hostMounted = document.querySelector(`img[data-xianscan-page-id="${page.id}"]:not([data-xianscan-injected="true"])`);
					if (!hostMounted) {
						matchedPage = page;
						break;
					}
				}
			}

			if (!matchedPage) continue;

			// REMOVE ANY TEMPORARY INJECTED CLONE FOR THIS PAGE
			const tempClone = document.querySelector(`img[data-xianscan-page-id="${matchedPage.id}"][data-xianscan-injected="true"]`) ||
			                  document.querySelector(`img[data-xianscan-page-seq="${matchedPage.seq}"][data-xianscan-injected="true"]`);
			if (tempClone) {
				tempClone.remove();
			}

			const isOutputReady = !!matchedPage.outputPath && (matchedPage.outputRev ?? 0) > 0;
			if (isOutputReady) {
				const targetUrl = `${this.baseUrl}/api/pages/${matchedPage.id}/file?kind=output&rev=${matchedPage.outputRev}`;
				this.sanitizeLazyAttributes(img);
				this.runSelfMutation(() => {
					img.setAttribute('data-xianscan-page-id', String(matchedPage.id));
					img.setAttribute('data-xianscan-page-seq', String(matchedPage.seq));
					const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

					if (!shouldProxy) {
						img.src = targetUrl;
						img.setAttribute('data-xianscan-applied-src', targetUrl);
					}
					img.style.display = '';
					img.style.filter = 'none';
				});

				this.attachImageErrorHandler(img, matchedPage.id, targetUrl);

				const capturedPageId = matchedPage.id;
				void resolveSafeImageUrl(targetUrl, true).then(safeUrl => {
					if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
						return;
					}
					this.activePageUrls.set(capturedPageId, safeUrl);
					if (img.getAttribute('data-xianscan-page-id') === String(capturedPageId)) {
						this.runSelfMutation(() => {
							img.src = safeUrl;
							img.setAttribute('data-xianscan-applied-src', safeUrl);
							img.srcset = '';
						});
					}
				});
			} else {
				// KEEP RAW HOST IMAGE DISPLAYED WHILE PENDING TRANSLATION
				this.runSelfMutation(() => {
					img.setAttribute('data-xianscan-page-id', String(matchedPage.id));
					img.setAttribute('data-xianscan-page-seq', String(matchedPage.seq));
				});
			}
		}
	}

	mountTranslatedPages(pages: ChapterReaderPage[], excludedUrls?: string[], includedUrls?: string[], isResliced?: boolean): boolean {
		if (isResliced !== undefined) {
			this.explicitIsResliced = isResliced;
		}
		this.activeExcludedUrls = excludedUrls;
		this.activeIncludedUrls = includedUrls;
		this.latestServerPages = pages;
		const hostImgs = getHostReaderImages(excludedUrls, includedUrls);
		if (hostImgs.length === 0 || pages.length === 0) {
			return false;
		}

		// PURGE PREVIOUS INJECTED CLONES
		document.querySelectorAll('img[data-xianscan-injected="true"]').forEach(el => el.remove());

		const totalServerPages = pages.length;
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';
		const reslicedMode = this.isReslicedChapter();

		// SCENARIO 1: RESLICED CHAPTER (CONTINUOUS WEBCOMIC STRIPS SLICED INTO STANDARDIZED PAGES)
		if (reslicedMode) {
			const anchorImg = hostImgs[0];
			let lastAnchor: HTMLElement = anchorImg;

			for (let i = 0; i < totalServerPages; i++) {
				const page = pages[i];
				const isOutputReady = !!page.outputPath && (page.outputRev ?? 0) > 0;
				const pageStatus: 'ready' | 'processing' | 'pending' = isOutputReady
					? 'ready'
					: (page.status === 'processing' ? 'processing' : 'pending');
				this.pageStatuses.set(page.id, pageStatus);
				const targetUrl = isOutputReady
					? `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`
					: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 1}`;

				const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

				if (i === 0) {
					// SLICE 0 DIRECTLY REPLACES THE ANCHOR HOST IMAGE
					this.sanitizeLazyAttributes(anchorImg);
					this.runSelfMutation(() => {
						anchorImg.setAttribute('data-xianscan-page-id', String(page.id));
						anchorImg.setAttribute('data-xianscan-page-seq', String(page.seq));
						anchorImg.setAttribute('data-xianscan-status', pageStatus);
						if (shouldProxy) {
							anchorImg.src = BLANK_IMAGE_PLACEHOLDER;
						} else {
							anchorImg.src = targetUrl;
							anchorImg.setAttribute('data-xianscan-applied-src', targetUrl);
						}
						anchorImg.style.display = '';
						anchorImg.style.filter = 'none';
					});
					this.attachImageErrorHandler(anchorImg, page.id, targetUrl);

					void resolveSafeImageUrl(targetUrl).then(safeUrl => {
						if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
							return;
						}
						this.activePageUrls.set(page.id, safeUrl);
						if (anchorImg.getAttribute('data-xianscan-page-id') === String(page.id)) {
							// PREVENT OVERWRITING IF THE PAGE HAS ALREADY BEEN TRANSLATED TO READY STATUS
							if (targetUrl.includes('kind=original') && anchorImg.getAttribute('data-xianscan-status') === 'ready') {
								return;
							}
							this.runSelfMutation(() => {
								anchorImg.src = safeUrl;
								anchorImg.setAttribute('data-xianscan-applied-src', safeUrl);
								anchorImg.srcset = '';
							});
						}
					});
				} else {
					// SLICES 1..N ARE INJECTED SEQUENTIALLY AFTER THE ANCHOR
					const clone = anchorImg.cloneNode(true) as HTMLImageElement;
					this.sanitizeLazyAttributes(clone);
					this.runSelfMutation(() => {
						clone.setAttribute('data-xianscan-injected', 'true');
						clone.setAttribute('data-xianscan-page-id', String(page.id));
						clone.setAttribute('data-xianscan-page-seq', String(page.seq));
						clone.setAttribute('data-xianscan-status', pageStatus);
						if (shouldProxy) {
							clone.src = BLANK_IMAGE_PLACEHOLDER;
						} else {
							clone.src = targetUrl;
							clone.setAttribute('data-xianscan-applied-src', targetUrl);
						}
						clone.style.display = '';
						clone.style.filter = 'none';

						lastAnchor.insertAdjacentElement('afterend', clone);
					});
					lastAnchor = clone;

					this.attachImageErrorHandler(clone, page.id, targetUrl);

					void resolveSafeImageUrl(targetUrl).then(safeUrl => {
						if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
							return;
						}
						this.activePageUrls.set(page.id, safeUrl);
						if (clone.getAttribute('data-xianscan-page-id') === String(page.id)) {
							// PREVENT OVERWRITING IF THE PAGE HAS ALREADY BEEN TRANSLATED TO READY STATUS
							if (targetUrl.includes('kind=original') && clone.getAttribute('data-xianscan-status') === 'ready') {
								return;
							}
							this.runSelfMutation(() => {
								clone.src = safeUrl;
								clone.setAttribute('data-xianscan-applied-src', safeUrl);
								clone.srcset = '';
							});
						}
					});
				}
			}

			// HIDE ALL OTHER HOST IMAGES TO ELIMINATE DUPLICATE RAW STRIPS
			this.runSelfMutation(() => {
				for (let i = 1; i < hostImgs.length; i++) {
					const img = hostImgs[i];
					img.setAttribute('data-xianscan-hidden', 'true');
					img.style.display = 'none';
					if (img.parentElement?.tagName === 'PICTURE') {
						img.parentElement.setAttribute('data-xianscan-hidden', 'true');
						(img.parentElement as HTMLElement).style.display = 'none';
					}
				}
			});

			this.isTranslatedActive = true;
			this.startLazyLoadShield();
			return true;
		}

		// SCENARIO 2: NON-RESLICED CHAPTER (1-TO-1 DISCRETE PAGES)
		const urlToPageMap = new Map<string, ChapterReaderPage>();
		if (includedUrls && includedUrls.length > 0) {
			const mapLen = Math.min(includedUrls.length, pages.length);
			for (let idx = 0; idx < mapLen; idx++) {
				const u = includedUrls[idx];
				const page = pages[idx];
				if (page && u) {
					urlToPageMap.set(u, page);
					urlToPageMap.set(getCanonicalUrl(u), page);
				}
			}
		}

		const assignedPageIds = new Set<number>();
		const hostToPage = new Map<HTMLImageElement, ChapterReaderPage>();

		for (const img of hostImgs) {
			const candidates = getImageCandidateUrls(img);
			for (const cand of candidates) {
				const match = urlToPageMap.get(cand);
				if (match && !assignedPageIds.has(match.id)) {
					hostToPage.set(img, match);
					assignedPageIds.add(match.id);
					break;
				}
			}
		}

		let remainingPageIdx = 0;
		for (const img of hostImgs) {
			if (!hostToPage.has(img)) {
				while (remainingPageIdx < totalServerPages && assignedPageIds.has(pages[remainingPageIdx].id)) {
					remainingPageIdx++;
				}
				if (remainingPageIdx < totalServerPages) {
					const page = pages[remainingPageIdx];
					hostToPage.set(img, page);
					assignedPageIds.add(page.id);
					remainingPageIdx++;
				}
			}
		}

		let lastAnchor: HTMLElement = hostImgs[0];
		for (const img of hostImgs) {
			const page = hostToPage.get(img);
			if (!page) continue;

			const isOutputReady = !!page.outputPath && (page.outputRev ?? 0) > 0;
			const pageStatus: 'ready' | 'processing' | 'pending' = isOutputReady
				? 'ready'
				: (page.status === 'processing' ? 'processing' : 'pending');
			this.pageStatuses.set(page.id, pageStatus);

			if (isOutputReady) {
				const targetUrl = `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`;
				const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

				this.sanitizeLazyAttributes(img);
				this.runSelfMutation(() => {
					img.setAttribute('data-xianscan-page-id', String(page.id));
					img.setAttribute('data-xianscan-page-seq', String(page.seq));
					img.setAttribute('data-xianscan-status', pageStatus);
					if (!shouldProxy) {
						img.src = targetUrl;
						img.setAttribute('data-xianscan-applied-src', targetUrl);
					}
					img.srcset = '';
					img.style.display = '';
					img.style.filter = 'none';
				});
				lastAnchor = img;

				this.attachImageErrorHandler(img, page.id, targetUrl);

				void resolveSafeImageUrl(targetUrl, true).then(safeUrl => {
					if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
						return;
					}
					this.activePageUrls.set(page.id, safeUrl);
					if (img.getAttribute('data-xianscan-page-id') === String(page.id)) {
						this.runSelfMutation(() => {
							img.src = safeUrl;
							img.setAttribute('data-xianscan-applied-src', safeUrl);
							img.srcset = '';
						});
					}
				});
			} else {
				// UNTRANSLATED DISCRETE PAGE: LEAVE CURRENT RAW HOST IMAGE VISIBLE WITHOUT QUEUE SATURATION
				this.runSelfMutation(() => {
					img.setAttribute('data-xianscan-page-id', String(page.id));
					img.setAttribute('data-xianscan-page-seq', String(page.seq));
					img.setAttribute('data-xianscan-status', pageStatus);
				});
				lastAnchor = img;
			}
		}

		// INJECT TEMPORARY CLONES FOR UNMOUNTED PAGES (WILL BE DYNAMICALLY CLAIMED AND REMOVED AS USER SCROLLS)
		if (totalServerPages > hostImgs.length) {
			for (let i = 0; i < totalServerPages; i++) {
				const page = pages[i];
				if (assignedPageIds.has(page.id)) continue;

				const isOutputReady = !!page.outputPath && (page.outputRev ?? 0) > 0;
				const pageStatus: 'ready' | 'processing' | 'pending' = isOutputReady
					? 'ready'
					: (page.status === 'processing' ? 'processing' : 'pending');
				this.pageStatuses.set(page.id, pageStatus);
				const targetUrl = isOutputReady
					? `${this.baseUrl}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev}`
					: `${this.baseUrl}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 1}`;

				const shouldProxy = isHttpsHost && targetUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

				const templateImg = hostImgs[hostImgs.length - 1];
				const clone = templateImg.cloneNode(true) as HTMLImageElement;
				this.sanitizeLazyAttributes(clone);
				this.runSelfMutation(() => {
					clone.setAttribute('data-xianscan-injected', 'true');
					clone.setAttribute('data-xianscan-page-id', String(page.id));
					clone.setAttribute('data-xianscan-page-seq', String(page.seq));
					clone.setAttribute('data-xianscan-status', pageStatus);
					if (!shouldProxy) {
						clone.src = targetUrl;
						clone.setAttribute('data-xianscan-applied-src', targetUrl);
					} else {
						clone.src = BLANK_IMAGE_PLACEHOLDER;
						clone.setAttribute('data-xianscan-applied-src', BLANK_IMAGE_PLACEHOLDER);
					}
					clone.srcset = '';
					clone.style.display = '';
					clone.style.filter = 'none';

					lastAnchor.insertAdjacentElement('afterend', clone);
				});
				lastAnchor = clone;

				this.attachImageErrorHandler(clone, page.id, targetUrl);

				void resolveSafeImageUrl(targetUrl).then(safeUrl => {
					if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
						return;
					}
					this.activePageUrls.set(page.id, safeUrl);
					if (clone.getAttribute('data-xianscan-page-id') === String(page.id)) {
						this.runSelfMutation(() => {
							clone.src = safeUrl;
							clone.setAttribute('data-xianscan-applied-src', safeUrl);
							clone.srcset = '';
						});
					}
				});
			}
		}

		// HIDE SURPLUS HOST IMAGES IF HOST HAS MORE IMAGES THAN SERVER PAGES
		if (hostImgs.length > totalServerPages) {
			this.runSelfMutation(() => {
				for (const img of hostImgs) {
					if (!hostToPage.has(img)) {
						img.setAttribute('data-xianscan-hidden', 'true');
						img.style.display = 'none';
						const picParent = img.closest('picture');
						if (picParent && picParent !== img) {
							picParent.setAttribute('data-xianscan-hidden', 'true');
							picParent.style.display = 'none';
						}
					}
				}
			});
		}

		this.isTranslatedActive = true;
		this.startLazyLoadShield();
		return true;
	}

	updatePageSlice(pageId: number, pageSeq: number, outputRev: number): void {
		this.pageStatuses.set(pageId, 'ready');

		const existingMeta = this.latestServerPages.find(p => p.id === pageId || p.seq === pageSeq);
		if (existingMeta) {
			// IF ALREADY DONE AT THIS REVISION, DO NOT RE-MUTATE DOM
			if (existingMeta.status === 'done' && existingMeta.outputRev === outputRev) {
				return;
			}
			existingMeta.outputRev = outputRev;
			existingMeta.outputPath = existingMeta.outputPath || `out_${pageId}.webp`;
			existingMeta.status = 'done';
		}

		let img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-id="${pageId}"]`);
		if (!img) {
			img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq}"]`);
		}

		if (!img && this.activeIncludedUrls && this.activeIncludedUrls[pageSeq]) {
			const targetUrl = this.activeIncludedUrls[pageSeq];
			const canonicalTarget = getCanonicalUrl(targetUrl);
			const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
			for (const candidate of hostImgs) {
				if (candidate.getAttribute('data-xianscan-page-id')) continue;
				const cands = getImageCandidateUrls(candidate);
				if (cands.includes(targetUrl) || cands.includes(canonicalTarget)) {
					img = candidate;
					break;
				}
			}
		}

		const newUrl = `${this.baseUrl}/api/pages/${pageId}/file?kind=output&rev=${outputRev}`;
		const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';
		const shouldProxy = isHttpsHost && newUrl.startsWith('http://') && typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

		if (img) {
			this.sanitizeLazyAttributes(img);
			this.runSelfMutation(() => {
				img.setAttribute('data-xianscan-page-id', String(pageId));
				img.setAttribute('data-xianscan-page-seq', String(pageSeq));
				img.setAttribute('data-xianscan-status', 'ready');
				if (!shouldProxy) {
					img.src = newUrl;
					img.setAttribute('data-xianscan-applied-src', newUrl);
				}
				img.srcset = '';
				img.style.display = '';
				img.style.filter = 'none';
			});

			this.attachImageErrorHandler(img, pageId, newUrl);

			void resolveSafeImageUrl(newUrl, true).then(safeUrl => {
				if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
					return;
				}
				this.activePageUrls.set(pageId, safeUrl);
				if (img!.getAttribute('data-xianscan-page-id') === String(pageId) ||
				    img!.getAttribute('data-xianscan-page-seq') === String(pageSeq)) {
					this.runSelfMutation(() => {
						img!.src = safeUrl;
						img!.setAttribute('data-xianscan-applied-src', safeUrl);
						img!.srcset = '';
					});
				}
			});
		} else {
			// CACHE THE TRANSLATED SAFE URL FOR WHEN THE HOST VIRTUAL SCROLLER MOUNTS THIS ELEMENT
			void resolveSafeImageUrl(newUrl, true).then(safeUrl => {
				if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
					return;
				}
				this.activePageUrls.set(pageId, safeUrl);
			});

			// ONLY INJECT CLONES IF IN RESLICED MODE OR IF TEST MANUALLY TRIGGERS WITH RESLICED PAGES
			const isResliced = this.isReslicedChapter();
			if (isResliced || (!this.activeIncludedUrls && pageSeq > 0)) {
				const existingClone = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-id="${pageId}"], img[data-xianscan-page-seq="${pageSeq}"]`);
				if (existingClone) return;

				const prevImg = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq - 1}"]`) ||
				                document.querySelector<HTMLImageElement>('img[data-xianscan-injected="true"]:last-of-type') ||
				                getHostReaderImages().pop();

				if (prevImg) {
					const clone = prevImg.cloneNode(true) as HTMLImageElement;
					this.sanitizeLazyAttributes(clone);
					this.runSelfMutation(() => {
						clone.setAttribute('data-xianscan-injected', 'true');
						clone.setAttribute('data-xianscan-page-id', String(pageId));
						clone.setAttribute('data-xianscan-page-seq', String(pageSeq));
						clone.setAttribute('data-xianscan-status', 'ready');
						if (!shouldProxy) {
							clone.src = newUrl;
							clone.setAttribute('data-xianscan-applied-src', newUrl);
						} else {
							clone.src = BLANK_IMAGE_PLACEHOLDER;
							clone.setAttribute('data-xianscan-applied-src', BLANK_IMAGE_PLACEHOLDER);
						}
						clone.srcset = '';
						clone.style.display = '';
						clone.style.filter = 'none';

						prevImg.insertAdjacentElement('afterend', clone);
					});
					this.attachImageErrorHandler(clone, pageId, newUrl);

					void resolveSafeImageUrl(newUrl, true).then(safeUrl => {
						if (!safeUrl || (isHttpsHost && safeUrl.startsWith('http://'))) {
							return;
						}
						this.activePageUrls.set(pageId, safeUrl);
						if (clone.getAttribute('data-xianscan-page-id') === String(pageId)) {
							this.runSelfMutation(() => {
								clone.src = safeUrl;
								clone.setAttribute('data-xianscan-applied-src', safeUrl);
								clone.srcset = '';
							});
						}
					});
				}
			}
		}

		this.isTranslatedActive = true;
		this.startLazyLoadShield();
	}

	updatePageStatus(pageId: number, pageSeq: number, status: 'pending' | 'processing'): void {
		if (this.pageStatuses.get(pageId) === status) return;
		this.pageStatuses.set(pageId, status);

		const existingMeta = this.latestServerPages.find(s => s.id === pageId || s.seq === pageSeq);
		if (existingMeta) {
			existingMeta.status = status;
		}

		let img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-id="${pageId}"]`);
		if (!img) {
			img = document.querySelector<HTMLImageElement>(`img[data-xianscan-page-seq="${pageSeq}"]`);
		}
		if (!img && this.activeIncludedUrls && this.activeIncludedUrls[pageSeq]) {
			const targetUrl = this.activeIncludedUrls[pageSeq];
			const canonicalTarget = getCanonicalUrl(targetUrl);
			const hostImgs = getHostReaderImages(this.activeExcludedUrls, this.activeIncludedUrls);
			for (const candidate of hostImgs) {
				if (candidate.getAttribute('data-xianscan-page-id')) continue;
				const cands = getImageCandidateUrls(candidate);
				if (cands.includes(targetUrl) || cands.includes(canonicalTarget)) {
					img = candidate;
					break;
				}
			}
		}
		if (!img) return;

		this.runSelfMutation(() => {
			img.setAttribute('data-xianscan-status', status);
			img.style.filter = 'none';
		});
	}

	setMode(mode: 'translated' | 'raw'): void {
		const hostImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-orig-src]');
		const injectedImgs = document.querySelectorAll<HTMLImageElement>('img[data-xianscan-injected="true"]');
		const hiddenElements = document.querySelectorAll<HTMLElement>('[data-xianscan-hidden="true"]');

		this.runSelfMutation(() => {
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
				hiddenElements.forEach(el => (el.style.display = ''));
				this.isTranslatedActive = false;
			} else {
				injectedImgs.forEach(img => (img.style.display = ''));
				hiddenElements.forEach(el => (el.style.display = 'none'));
				hostImgs.forEach(img => {
					const pageId = Number(img.getAttribute('data-xianscan-page-id'));
					if (pageId && this.activePageUrls.has(pageId)) {
						const safeUrl = this.activePageUrls.get(pageId);
						const isHttpsHost = typeof window !== 'undefined' && window.location.protocol === 'https:';
						if (safeUrl && !(isHttpsHost && safeUrl.startsWith('http://'))) {
							img.src = safeUrl;
							img.setAttribute('data-xianscan-applied-src', safeUrl);
						}
					}
					img.style.filter = 'none';
				});
				this.isTranslatedActive = true;
				this.startLazyLoadShield();
			}
		});
	}

	getIsTranslatedActive(): boolean {
		return this.isTranslatedActive;
	}

	destroy(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		this.setMode('raw');
		clearSafeImageUrlCache();
		document.querySelectorAll('img[data-xianscan-injected="true"]').forEach(el => el.remove());
		document.querySelectorAll('[data-xianscan-hidden="true"]').forEach(el => {
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

		this.latestServerPages = [];
		this.activeExcludedUrls = undefined;
		this.activeIncludedUrls = undefined;
		this.activePageUrls.clear();
		this.pageStatuses.clear();
		this.isTranslatedActive = false;
	}
}
