// -- IN-PLACE REPLACEMENT COORDINATOR AND SYNC WATCHDOG -- //

// IMPORTED TYPES
import type { ChapterReaderPage, ChapterMappingEntry, PageTranslatedMessage } from '../types';

// IMPORTED MODULES
import { XianScanClient } from '../api';
import { DomReplacerEngine } from './replacer';
import { normalizePageUrl } from '../core/heuristics/url-clustering';
import { resetCapturedImageUrls } from './scanner';

// -- HELPER FUNCTIONS -- //

function isExtensionValid(): boolean {
	try {
		return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
	} catch {
		return false;
	}
}

// -- COORDINATOR CLASS -- //

export class InPlaceTranslationCoordinator {
	private replacer: DomReplacerEngine;
	private client: XianScanClient;
	private activeMapping: ChapterMappingEntry | null = null;
	private inPlaceEnabled = false;
	private serverUrl = 'http://127.0.0.1:8124';
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private keepAlivePort: chrome.runtime.Port | null = null;
	private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.client = new XianScanClient(this.serverUrl);
		this.replacer = new DomReplacerEngine(this.serverUrl);
	}

	async init(): Promise<void> {
		if (!isExtensionValid()) return;
		const stored = await chrome.storage.local.get(['serverUrl', 'inPlaceReplacement']);
		if (stored.serverUrl) {
			this.serverUrl = stored.serverUrl;
			this.client.setBaseUrl(this.serverUrl);
			this.replacer.setBaseUrl(this.serverUrl);
		}

		this.inPlaceEnabled = stored.inPlaceReplacement !== false;
		this.bindLifecycleEvents();
		await this.recheckUrlMapping();
	}

	private bindLifecycleEvents(): void {
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
			resetCapturedImageUrls();
			void this.recheckUrlMapping();
		});

		// INTERCEPT SPA CLIENT-SIDE ROUTING (pushState AND replaceState)
		const self = this;
		const wrapHistory = (method: 'pushState' | 'replaceState') => {
			const original = history[method];
			if (typeof original === 'function') {
				history[method] = function (this: History, data: any, unused: string, url?: string | URL | null) {
					const result = original.call(this, data, unused, url);
					resetCapturedImageUrls();
					if (isExtensionValid()) {
						setTimeout(() => void self.recheckUrlMapping(), 50);
					}
					return result;
				};
			}
		};
		wrapHistory('pushState');
		wrapHistory('replaceState');

		window.addEventListener('pagehide', () => {
			// PAGE MOVED INTO THE BACK/FORWARD CACHE OR CLOSED: TEAR DOWN THE KEEPALIVE PORT
			// BEFORE CHROME CLOSES THE CHANNEL SO IT DOES NOT RAISE AN UNCHECKED lastError.
			this.stopKeepAlive();
		});

		window.addEventListener('pageshow', () => {
			if (!isExtensionValid()) {
				this.destroy();
				return;
			}
			// RESTORED FROM THE BACK/FORWARD CACHE: RE-SYNC
			if (this.activeMapping) {
				void this.syncWithServer();
			}
		});

		// LISTEN FOR EXTENSION STORAGE TOGGLES SO IN-PLACE STATE SYNC HAPPENS INSTANTLY
		if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
			chrome.storage.onChanged.addListener((changes, area) => {
				if (area === 'local' && changes.inPlaceReplacement) {
					const enabled = changes.inPlaceReplacement.newValue === true;
					this.inPlaceEnabled = enabled;
					this.replacer.setMode(enabled ? 'translated' : 'raw');
					if (enabled) {
						void this.recheckUrlMapping();
					}
				}
			});
		}
	}

	async recheckUrlMapping(): Promise<void> {
		if (!isExtensionValid()) {
			this.destroy();
			return;
		}
		chrome.runtime.sendMessage({
			type: 'GET_SITE_MAPPING',
			url: window.location.href
		}, async (res) => {
			if (chrome.runtime.lastError || !res) return;
			if (res.mapping) {
				this.activeMapping = res.mapping;
				this.inPlaceEnabled = res.mapping.enabled !== false;
				await this.syncWithServer();
			} else if (this.activeMapping) {
				// USER NAVIGATED TO AN UNMAPPED CHAPTER: TEAR DOWN PREVIOUS CHAPTER REPLACER
				this.activeMapping = null;
				this.replacer.destroy();
				this.stopPolling();
				this.stopKeepAlive();
			}
		});
	}

	setActiveMapping(entry: ChapterMappingEntry): void {
		if (entry?.url) {
			const currentNormalized = normalizePageUrl(window.location.href).replace(/\/+$/, '');
			const entryNormalized = normalizePageUrl(entry.url).replace(/\/+$/, '');

			if (currentNormalized !== entryNormalized) {
				return;
			}
		}
		this.activeMapping = entry;
		this.inPlaceEnabled = entry.enabled !== false;
		void this.syncWithServer();
	}

	private startKeepAlive(chapterId: number): void {
		if (this.keepAlivePort || !isExtensionValid()) return;
		try {
			if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
				this.keepAlivePort = chrome.runtime.connect({ name: 'xianscan-keepalive' });

				// DIRECT HIGH-SPEED PORT EVENT LISTENER
				this.keepAlivePort.onMessage.addListener((msg) => {
					if (!msg) return;
					if (msg.type === 'PAGE_TRANSLATED') {
						this.handlePageTranslated(msg);
					} else if (msg.type === 'CHAPTER_SYNC_UPDATE') {
						void this.syncWithServer(msg.pages);
					}
				});

				this.keepAlivePort.onDisconnect.addListener(() => {
					if (this.keepAliveInterval) {
						clearInterval(this.keepAliveInterval);
						this.keepAliveInterval = null;
					}
					this.keepAlivePort = null;

					// IF POLLING OR TRANSLATION IS STILL ACTIVE, RECONNECT KEEPALIVE AFTER BRIEF BACKOFF
					if (this.pollingTimer && this.activeMapping?.chapterId && isExtensionValid()) {
						setTimeout(() => {
							if (this.pollingTimer && this.activeMapping?.chapterId) {
								this.startKeepAlive(this.activeMapping.chapterId);
							}
						}, 1500);
					}
				});

				// SEND INITIAL PING WITH CHAPTER ID IMMEDIATELY SO PORT IS REGISTERED
				try {
					this.keepAlivePort.postMessage({
						type: 'KEEPALIVE_PING',
						chapterId,
						timestamp: Date.now()
					});
				} catch {
					// IGNORE
				}

				this.keepAliveInterval = setInterval(() => {
					if (!isExtensionValid()) {
						this.destroy();
						return;
					}
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

	private stopKeepAlive(): void {
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

	private startPollingIfNeeded(pages: ChapterReaderPage[]): void {
		const hasPending = pages.length === 0 || pages.some(p => !p.outputPath && (p.outputRev || 0) === 0);
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

		// BACKUP INTERVAL POLLING AND SELF-HEALING WATCHDOG (EVERY 1000MS WHILE PENDING)
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

				// IF REPLACER NOT YET MOUNTED (E.G. LAUNCHED BEFORE UPLOAD FINISHED), MOUNT NOW
				if (!this.replacer.getIsTranslatedActive() && details.pages.length > 0) {
					this.replacer.mountTranslatedPages(
						details.pages,
						this.activeMapping.excludedImageUrls,
						this.activeMapping.includedImageUrls,
						this.activeMapping.isResliced
					);
				}

				let allDone = true;
				for (const p of details.pages) {
					const isReady = !!p.outputPath;
					if (isReady) {
						this.replacer.updatePageSlice(p.id, p.seq, p.outputRev || 1);
					} else {
						allDone = false;
						if (p.status === 'processing') {
							this.replacer.updatePageStatus(p.id, p.seq, 'processing');
						}
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

	private stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
	}

	async syncWithServer(passedPages?: ChapterReaderPage[]): Promise<void> {
		if (!isExtensionValid()) {
			this.destroy();
			return;
		}
		if (!this.activeMapping) return;
		if (!this.inPlaceEnabled) return;

		try {
			let pages = passedPages && passedPages.length > 0 ? passedPages : null;
			if (!pages) {
				const chapterResult = await this.client.getChapterDetails(this.activeMapping.chapterId);
				if (!chapterResult || !chapterResult.chapter) {
					throw new Error('Chapter not found.');
				}
				pages = chapterResult.pages || [];
			}

			if (pages.length > 0) {
				this.replacer.mountTranslatedPages(
					pages,
					this.activeMapping.excludedImageUrls,
					this.activeMapping.includedImageUrls,
					this.activeMapping.isResliced
				);
				this.startPollingIfNeeded(pages);
			} else {
				// CHAPTER HAS NO PAGES ON SERVER YET (STILL UPLOADING AT LAUNCH)
				// START POLLING SO AS SOON AS CHUNKS ARRIVE ON SERVER, THEY MOUNT IN-PLACE
				this.startPollingIfNeeded([]);
			}
		} catch (err: any) {
			const errMsg = err?.message || String(err);
			if (errMsg.includes('context invalidated') || errMsg.includes('Context invalidated')) {
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

	handlePageTranslated(msg: PageTranslatedMessage): void {
		if (!this.inPlaceEnabled) return;
		if (!this.activeMapping || String(this.activeMapping.chapterId) !== String(msg.chapterId)) return;
		this.replacer.updatePageSlice(msg.pageId, msg.pageSeq, msg.outputRev);
	}

	setMode(mode: 'translated' | 'raw'): void {
		this.inPlaceEnabled = mode === 'translated';
		this.replacer.setMode(mode);
		if (this.inPlaceEnabled) {
			void this.recheckUrlMapping();
		}
	}

	destroy(): void {
		this.stopPolling();
		this.stopKeepAlive();
		this.replacer.destroy();
	}
}
