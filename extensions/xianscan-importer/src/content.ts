// -- CONTENT SCRIPT: HEURISTIC SCANNER, AUTO-SCROLLER & IN-PLACE LIVE TRANSLATOR -- //

// IMPORTED TYPES
import type { ScanPageResponse } from './types';

// IMPORTED MODULES
import { parseChapterMetadata } from './utils/chapter-parser';
import { isFloatingOrSticky, isLikelyAdOrBannerImage } from './core/heuristics/ad-detector';
import {
	attachImageCaptureObserver,
	getCapturedImageUrls,
	registerCapturedImageUrl,
	resetCapturedImageUrls,
	findPrimaryReaderContainer,
	scanPageForImages,
	forcePromoteLazyAttributes,
	fastScrollPreload
} from './content/scanner';
import { InPlaceTranslationCoordinator } from './content/coordinator';

// -- RE-EXPORTS FOR BACKWARD COMPATIBILITY & TEST SUITES -- //

export {
	isFloatingOrSticky,
	isLikelyAdOrBannerImage,
	attachImageCaptureObserver,
	getCapturedImageUrls,
	registerCapturedImageUrl,
	resetCapturedImageUrls,
	findPrimaryReaderContainer,
	scanPageForImages,
	forcePromoteLazyAttributes,
	fastScrollPreload
};

// -- RUNTIME MESSAGE LISTENER (GUARDED AGAINST SELF-HOSTED DASHBOARD) -- //

if (
	typeof window !== 'undefined' &&
	!window.location.hostname.includes('localhost') &&
	!window.location.hostname.includes('127.0.0.1') &&
	!window.location.pathname.startsWith('/app')
) {
	try {
		(window as any).__xianscan_coordinator?.destroy?.();
	} catch {
		// IGNORE TEARDOWN ERRORS
	}

	const coordinator = new InPlaceTranslationCoordinator();
	(window as any).__xianscan_coordinator = coordinator;
	coordinator.init();

	if (!(window as any).__xianscan_msg_listener_attached) {
		(window as any).__xianscan_msg_listener_attached = true;
		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			const activeCoordinator: InPlaceTranslationCoordinator | undefined = (window as any).__xianscan_coordinator;

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
				attachImageCaptureObserver();
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
				activeCoordinator?.setActiveMapping(message.entry);
				sendResponse({ received: true });
				return true;
			}

			if (message.type === 'PAGE_TRANSLATED') {
				activeCoordinator?.handlePageTranslated(message);
				sendResponse({ received: true });
				return true;
			}

			if (message.type === 'CHAPTER_SYNC_UPDATE') {
				activeCoordinator?.syncWithServer(message.pages).then(() => {
					sendResponse({ received: true });
				});
				return true;
			}

			if (message.type === 'TRIGGER_SYNC') {
				activeCoordinator?.syncWithServer().then(() => {
					sendResponse({ success: true });
				});
				return true;
			}

			if (message.type === 'TOGGLE_MODE') {
				activeCoordinator?.setMode(message.mode);
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
					// IGNORE IF TAB OR CHANNEL CLOSED
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
					// FALL THROUGH TO CANVAS DOM EXTRACTION
				}

				try {
					const imgEl = Array.from(document.querySelectorAll<HTMLImageElement>('img')).find(
						i => i.src === message.url || i.currentSrc === message.url || i.getAttribute('data-src') === message.url
					);
					if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
						// PROTECT AGAINST THREAD-LOCKING CANVAS ALLOCATIONS ON ULTRA-TALL PANELS
						const maxPixels = 4096 * 4096;
						if (imgEl.naturalWidth * imgEl.naturalHeight <= maxPixels) {
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
}
