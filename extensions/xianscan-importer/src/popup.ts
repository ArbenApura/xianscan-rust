import { XianScanClient } from './api';
import type { BookSummary, ChapterMetadata, ChapterSummary, ScannedImage, ScanPageResponse, ChapterReaderPage, ChapterMappingEntry } from './types';
import { sortImagesByCoordinates, isPlaceholderImage, computeDHashFromElement } from './utils/sorter';
import { resolveSafeImageUrl } from './utils/dom-replacer';

class PopupController {
	private client: XianScanClient;
	private currentUrl = '';
	private images: ScannedImage[] = [];
	private metadata: ChapterMetadata = {};
	private books: BookSummary[] = [];
	private chapters: ChapterSummary[] = [];

	private selectedBookId: string | number | null = null;
	private selectedChapterId: number | null = null;
	private isNewChapterPreset = false;
	private pendingNewChapterMeta = { chapterNumber: 1, title: 'Chapter 1' };

	// ACTIVE VIEW STATE
	private currentView: 'import' | 'tracker' = 'import';
	private activeChapterPages: ChapterReaderPage[] = [];
	private trackerPollingTimer: ReturnType<typeof setInterval> | null = null;
	private activeTrackerPhase = 'idle';
	private isChapterTranslating = false;

	// HEADER
	private serverStatusBadge!: HTMLElement;
	private toggleSettingsBtn!: HTMLElement;
	private toast!: HTMLElement;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	// VIEW 1: IMPORT VIEW ELEMENTS
	private importView!: HTMLElement;
	private bookCustomSelect!: HTMLElement;
	private bookBtn!: HTMLButtonElement;
	private bookLabel!: HTMLElement;
	private bookDropdown!: HTMLElement;
	private newBookBtn!: HTMLButtonElement;

	private chapterCustomSelect!: HTMLElement;
	private chapterBtn!: HTMLButtonElement;
	private chapterLabel!: HTMLElement;
	private chapterDropdown!: HTMLElement;
	private newChapterBtn!: HTMLButtonElement;

	private inPlaceReplacementCheckbox!: HTMLInputElement;
	private selectAllCheckbox!: HTMLInputElement;
	private selectionCountText!: HTMLElement;
	private copyDebugBtn!: HTMLButtonElement;
	private fastScanBtn!: HTMLButtonElement;

	private galleryContainer!: HTMLElement;
	private galleryEmptyState!: HTMLElement;
	private galleryGrid!: HTMLElement;
	private protectedWarningBanner!: HTMLElement;
	private protectedWarningCount!: HTMLElement;
	private protectedImagesCount = 0;

	private autoResliceCheckbox!: HTMLInputElement;
	private autoTranslateCheckbox!: HTMLInputElement;
	private startImportBtn!: HTMLButtonElement;
	private importBtnText!: HTMLElement;

	// VIEW 2: TRACKER VIEW ELEMENTS
	private trackerView!: HTMLElement;
	private trackerBookTitle!: HTMLElement;
	private trackerChapterTitle!: HTMLElement;
	private trackerStatusBadge!: HTMLElement;
	private trackerInPlaceCheckbox!: HTMLInputElement;
	private trackerSummaryText!: HTMLElement;
	private trackerGrid!: HTMLElement;

	private trackerProgressWrap!: HTMLElement;
	private trackerProgressStatus!: HTMLElement;
	private trackerProgressCount!: HTMLElement;
	private trackerProgressBarFill!: HTMLElement;
	private cancelJobBtn!: HTMLButtonElement;

	private trackerOpenStudioBtn!: HTMLButtonElement;
	private trackerSyncTabBtn!: HTMLButtonElement;
	private trackerRetryBtn!: HTMLButtonElement;

	// MODALS
	private settingsModalOverlay!: HTMLElement;
	private serverUrlInput!: HTMLInputElement;
	private closeSettingsModalBtn!: HTMLElement;
	private cancelSettingsModalBtn!: HTMLElement;
	private saveServerUrlBtn!: HTMLButtonElement;

	private bookModalOverlay!: HTMLElement;
	private newBookTitleInput!: HTMLInputElement;
	private newBookTitleTargetInput!: HTMLInputElement;
	private translateBookTitleBtn!: HTMLButtonElement;
	private translateBookTitleIcon!: HTMLElement;
	private translateBookTitleSpinner!: HTMLElement;
	private newBookLangCustomSelect!: HTMLElement;
	private newBookLangBtn!: HTMLButtonElement;
	private newBookLangLabel!: HTMLElement;
	private newBookLangDropdown!: HTMLElement;
	private selectedNewBookSourceLang = 'ko';
	private newBookTargetLangCustomSelect!: HTMLElement;
	private newBookTargetLangBtn!: HTMLButtonElement;
	private newBookTargetLangLabel!: HTMLElement;
	private newBookTargetLangDropdown!: HTMLElement;
	private selectedNewBookTargetLang = 'en';
	private closeBookModalBtn!: HTMLElement;
	private cancelBookModalBtn!: HTMLElement;
	private confirmBookModalBtn!: HTMLButtonElement;

	private chapterModalOverlay!: HTMLElement;
	private newChapterNumberInput!: HTMLInputElement;
	private newChapterTitleInput!: HTMLInputElement;
	private closeChapterModalBtn!: HTMLElement;
	private cancelChapterModalBtn!: HTMLElement;
	private confirmChapterModalBtn!: HTMLButtonElement;

	constructor() {
		this.client = new XianScanClient();
	}

	async init() {
		this.bindElements();
		this.bindEvents();

		// Load stored preferences
		const stored = await chrome.storage.local.get(['serverUrl', 'autoReslice', 'autoTranslate', 'inPlaceReplacement']);
		if (stored.serverUrl) {
			this.client.setBaseUrl(stored.serverUrl);
			this.serverUrlInput.value = stored.serverUrl;
		} else {
			this.serverUrlInput.value = 'http://127.0.0.1:8124';
		}

		const inPlace = stored.inPlaceReplacement !== false;
		this.inPlaceReplacementCheckbox.checked = inPlace;
		this.trackerInPlaceCheckbox.checked = inPlace;
		this.updateToggleState(this.inPlaceReplacementCheckbox);
		this.updateToggleState(this.trackerInPlaceCheckbox);

		if (stored.autoReslice !== undefined) {
			this.autoResliceCheckbox.checked = stored.autoReslice;
		}
		this.updateToggleState(this.autoResliceCheckbox);

		if (stored.autoTranslate !== undefined) {
			this.autoTranslateCheckbox.checked = stored.autoTranslate;
		}
		this.updateToggleState(this.autoTranslateCheckbox);

		// Initial connection check
		await this.checkServerStatus();

		// Determine initial view based on active tab mapping and background jobs
		await this.determineInitialView();

		// Setup runtime message listeners for live progress
		this.setupMessageListeners();
	}

	private bindElements() {
		const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

		// Header
		this.serverStatusBadge = $('serverStatusBadge');
		this.toggleSettingsBtn = $('toggleSettingsBtn');
		this.toast = $('toast');

		// View 1: Import View
		this.importView = $('importView');
		this.bookCustomSelect = $('bookCustomSelect');
		this.bookBtn = $('bookBtn') as HTMLButtonElement;
		this.bookLabel = $('bookLabel');
		this.bookDropdown = $('bookDropdown');
		this.newBookBtn = $('newBookBtn') as HTMLButtonElement;

		this.chapterCustomSelect = $('chapterCustomSelect');
		this.chapterBtn = $('chapterBtn') as HTMLButtonElement;
		this.chapterLabel = $('chapterLabel');
		this.chapterDropdown = $('chapterDropdown');
		this.newChapterBtn = $('newChapterBtn') as HTMLButtonElement;

		this.inPlaceReplacementCheckbox = $('inPlaceReplacementCheckbox') as HTMLInputElement;
		this.selectAllCheckbox = $('selectAllCheckbox') as HTMLInputElement;
		this.selectionCountText = $('selectionCountText');
		this.copyDebugBtn = $('copyDebugBtn') as HTMLButtonElement;
		this.fastScanBtn = $('fastScanBtn') as HTMLButtonElement;

		this.galleryContainer = $('galleryContainer');
		this.galleryEmptyState = $('galleryEmptyState');
		this.galleryGrid = $('galleryGrid');
		this.protectedWarningBanner = $('protectedWarningBanner');
		this.protectedWarningCount = $('protectedWarningCount');

		this.autoResliceCheckbox = $('autoResliceCheckbox') as HTMLInputElement;
		this.autoTranslateCheckbox = $('autoTranslateCheckbox') as HTMLInputElement;
		this.startImportBtn = $('startImportBtn') as HTMLButtonElement;
		this.importBtnText = $('importBtnText');

		// View 2: Tracker View
		this.trackerView = $('trackerView');
		this.trackerBookTitle = $('trackerBookTitle');
		this.trackerChapterTitle = $('trackerChapterTitle');
		this.trackerStatusBadge = $('trackerStatusBadge');
		this.trackerInPlaceCheckbox = $('trackerInPlaceCheckbox') as HTMLInputElement;
		this.trackerSummaryText = $('trackerSummaryText');
		this.trackerGrid = $('trackerGrid');

		this.trackerProgressWrap = $('trackerProgressWrap');
		this.trackerProgressStatus = $('trackerProgressStatus');
		this.trackerProgressCount = $('trackerProgressCount');
		this.trackerProgressBarFill = $('trackerProgressBarFill');
		this.cancelJobBtn = $('cancelJobBtn') as HTMLButtonElement;

		this.trackerOpenStudioBtn = $('trackerOpenStudioBtn') as HTMLButtonElement;
		this.trackerSyncTabBtn = $('trackerSyncTabBtn') as HTMLButtonElement;
		this.trackerRetryBtn = $('trackerRetryBtn') as HTMLButtonElement;

		// Modals
		this.settingsModalOverlay = $('settingsModalOverlay');
		this.serverUrlInput = $('serverUrlInput') as HTMLInputElement;
		this.closeSettingsModalBtn = $('closeSettingsModalBtn');
		this.cancelSettingsModalBtn = $('cancelSettingsModalBtn');
		this.saveServerUrlBtn = $('saveServerUrlBtn') as HTMLButtonElement;

		this.bookModalOverlay = $('bookModalOverlay');
		this.newBookTitleInput = $('newBookTitleInput') as HTMLInputElement;
		this.newBookTitleTargetInput = $('newBookTitleTargetInput') as HTMLInputElement;
		this.translateBookTitleBtn = $('translateBookTitleBtn') as HTMLButtonElement;
		this.translateBookTitleIcon = $('translateBookTitleIcon');
		this.translateBookTitleSpinner = $('translateBookTitleSpinner');
		this.newBookLangCustomSelect = $('newBookLangCustomSelect');
		this.newBookLangBtn = $('newBookLangBtn') as HTMLButtonElement;
		this.newBookLangLabel = $('newBookLangLabel');
		this.newBookLangDropdown = $('newBookLangDropdown');
		this.newBookTargetLangCustomSelect = $('newBookTargetLangCustomSelect');
		this.newBookTargetLangBtn = $('newBookTargetLangBtn') as HTMLButtonElement;
		this.newBookTargetLangLabel = $('newBookTargetLangLabel');
		this.newBookTargetLangDropdown = $('newBookTargetLangDropdown');
		this.closeBookModalBtn = $('closeBookModalBtn');
		this.cancelBookModalBtn = $('cancelBookModalBtn');
		this.confirmBookModalBtn = $('confirmBookModalBtn');

		this.chapterModalOverlay = $('chapterModalOverlay');
		this.newChapterNumberInput = $('newChapterNumberInput') as HTMLInputElement;
		this.newChapterTitleInput = $('newChapterTitleInput') as HTMLInputElement;
		this.closeChapterModalBtn = $('closeChapterModalBtn');
		this.cancelChapterModalBtn = $('cancelChapterModalBtn');
		this.confirmChapterModalBtn = $('confirmChapterModalBtn');
	}

	private bindEvents() {

		// In-Place Checkboxes Sync
		const handleInPlaceChange = (checked: boolean) => {
			this.inPlaceReplacementCheckbox.checked = checked;
			this.trackerInPlaceCheckbox.checked = checked;
			this.updateToggleState(this.inPlaceReplacementCheckbox);
			this.updateToggleState(this.trackerInPlaceCheckbox);
			chrome.storage.local.set({ inPlaceReplacement: checked });

			chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
				if (tab?.id) {
					chrome.tabs.sendMessage(tab.id, {
						type: 'TOGGLE_MODE',
						mode: checked ? 'translated' : 'raw'
					}, () => void chrome.runtime.lastError);
				}
			});
		};

		this.inPlaceReplacementCheckbox.addEventListener('change', () => {
			handleInPlaceChange(this.inPlaceReplacementCheckbox.checked);
		});

		this.trackerInPlaceCheckbox.addEventListener('change', () => {
			handleInPlaceChange(this.trackerInPlaceCheckbox.checked);
		});

		// Custom Selects: Toggle Dropdowns
		this.bookBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.chapterCustomSelect.classList.remove('open');
			this.bookCustomSelect.classList.toggle('open');
		});

		this.chapterBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.bookCustomSelect.classList.remove('open');
			this.chapterCustomSelect.classList.toggle('open');
		});

		document.addEventListener('click', () => {
			this.bookCustomSelect.classList.remove('open');
			this.chapterCustomSelect.classList.remove('open');
			this.newBookLangCustomSelect.classList.remove('open');
			this.newBookTargetLangCustomSelect.classList.remove('open');
		});

		this.newBookLangBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.newBookLangCustomSelect.classList.toggle('open');
		});

		this.newBookLangDropdown.querySelectorAll('.custom-select-option').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const target = btn as HTMLElement;
				const val = target.dataset.value || 'ko';
				this.selectedNewBookSourceLang = val;
				this.newBookLangLabel.textContent = target.textContent || val;
				this.newBookLangDropdown.querySelectorAll('.custom-select-option').forEach(o => {
					o.classList.toggle('active', o === target);
				});
				this.newBookLangCustomSelect.classList.remove('open');
			});
		});

		this.newBookTargetLangBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.newBookTargetLangCustomSelect.classList.toggle('open');
		});

		this.newBookTargetLangDropdown.querySelectorAll('.custom-select-option').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const target = btn as HTMLElement;
				const val = target.dataset.value || 'en';
				this.selectedNewBookTargetLang = val;
				this.newBookTargetLangLabel.textContent = target.textContent || val;
				this.newBookTargetLangDropdown.querySelectorAll('.custom-select-option').forEach(o => {
					o.classList.toggle('active', o === target);
				});
				this.newBookTargetLangCustomSelect.classList.remove('open');
			});
		});

		// Pipeline Toggles
		this.autoResliceCheckbox.addEventListener('change', () => {
			this.updateToggleState(this.autoResliceCheckbox);
			chrome.storage.local.set({ autoReslice: this.autoResliceCheckbox.checked });
		});

		this.autoTranslateCheckbox.addEventListener('change', () => {
			this.updateToggleState(this.autoTranslateCheckbox);
			chrome.storage.local.set({ autoTranslate: this.autoTranslateCheckbox.checked });
		});

		// Selection Controls
		this.selectAllCheckbox.addEventListener('change', () => {
			const checked = this.selectAllCheckbox.checked;
			this.images.forEach(img => { img.selected = checked; });
			this.renderGalleryGrid();
			this.updateSelectionSummary();
		});

		this.copyDebugBtn.addEventListener('click', async () => {
			const debugData = {
				timestamp: new Date().toISOString(),
				url: this.currentUrl,
				serverUrl: this.client.getBaseUrl(),
				serverStatus: this.serverStatusBadge.textContent?.trim() || 'unknown',
				metadata: this.metadata,
				selectedBookId: this.selectedBookId,
				selectedChapterId: this.selectedChapterId,
				settings: {
					inPlaceReplacement: this.inPlaceReplacementCheckbox.checked,
					autoReslice: this.autoResliceCheckbox.checked,
					autoTranslate: this.autoTranslateCheckbox.checked
				},
				scannedCount: this.images.length,
				images: this.images.map((img, idx) => ({
					index: idx + 1,
					url: img.url,
					canonicalUrl: img.canonicalUrl,
					width: img.width,
					height: img.height,
					top: Math.round(img.top),
					left: Math.round(img.left),
					selected: img.selected,
					dhash: img.dhash || null
				}))
			};

			const text = JSON.stringify(debugData, null, 2);
			try {
				await navigator.clipboard.writeText(text);
				const originalHtml = this.copyDebugBtn.innerHTML;
				this.copyDebugBtn.innerHTML = `
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
					Copied!
				`;
				this.showToast('Debug details copied to clipboard');
				setTimeout(() => {
					this.copyDebugBtn.innerHTML = originalHtml;
				}, 2000);
			} catch {
				this.showToast('Failed to copy to clipboard', true);
			}
		});

		this.fastScanBtn.addEventListener('click', async () => {
			this.fastScanBtn.disabled = true;
			this.fastScanBtn.innerHTML = `
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" style="width:10px;height:10px">
					<circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
					<path d="M12 2a10 10 0 0 1 10 10"/>
				</svg>
				Scanning...
			`;

			this.galleryEmptyState.classList.remove('hidden');
			this.galleryGrid.classList.add('hidden');
			this.galleryEmptyState.innerHTML = `
				<div class="loading-scanner-ring" style="margin-bottom: 8px;">
					<div class="scanner-pulse scan"></div>
					<svg class="loading-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
					</svg>
				</div>
				<p class="mono" style="font-size: 11px; font-weight: 600; color: var(--gold);">Fast Scanning Reader Page...</p>
				<p class="mono" style="font-size: 9px; color: var(--text-muted);">Auto-scrolling DOM to trigger lazy loaded comic panels</p>
			`;

			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, { type: 'FAST_SCROLL_PRELOAD' }, (res: ScanPageResponse & { success?: boolean }) => {
					this.fastScanBtn.disabled = false;
					this.fastScanBtn.innerHTML = `
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
						</svg>
						Fast Scan
					`;

					if (chrome.runtime.lastError || !res) {
						this.showToast('Scan timed out', true);
						return;
					}

					const raw = res.images || [];
					this.images = sortImagesByCoordinates(
						raw.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height))
					);
					this.metadata = res.metadata || {};
					this.renderGalleryGrid();
					this.updateSelectionSummary();
					this.showToast(`Found ${this.images.length} pages`);
				});
			} else {
				this.fastScanBtn.disabled = false;
			}
		});

		// Import Action
		this.startImportBtn.addEventListener('click', () => {
			this.startBatchImport();
		});

		// Tracker Actions
		this.trackerOpenStudioBtn.addEventListener('click', () => {
			const bId = this.selectedBookId;
			const cId = this.selectedChapterId;
			if (bId && cId) {
				const baseUrl = this.client.getBaseUrl();
				chrome.tabs.create({ url: `${baseUrl}/app/books/${bId}/chapters/${cId}` });
			}
		});

		this.trackerSyncTabBtn.addEventListener('click', async () => {
			if (this.trackerSyncTabBtn.disabled) return;
			this.trackerSyncTabBtn.disabled = true;

			const originalContent = this.trackerSyncTabBtn.innerHTML;
			this.trackerSyncTabBtn.innerHTML = `
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
					<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
				</svg>
				Syncing...
			`;

			const startTime = Date.now();

			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SYNC' }, () => {
					void chrome.runtime.lastError;
				});
			}

			if (this.selectedChapterId) {
				await this.loadAndRenderTracker(this.selectedChapterId, this.selectedBookId ?? undefined);
			}

			// ENFORCE MINIMUM 1-SECOND REFRESH LOADING DURATION
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 1000 - elapsed);
			if (remaining > 0) {
				await new Promise(resolve => setTimeout(resolve, remaining));
			}

			this.trackerSyncTabBtn.disabled = false;
			this.trackerSyncTabBtn.innerHTML = originalContent;
			this.showToast('Synced with Server');
		});

		this.cancelJobBtn.addEventListener('click', () => {
			if (this.selectedChapterId) {
				void this.client.cancelTranslation(this.selectedChapterId);
			}
			chrome.runtime.sendMessage({
				type: 'CANCEL_IMPORT_JOB',
				chapterId: this.selectedChapterId
			}, () => {
				void chrome.runtime.lastError;
			});
			this.showToast('Operation Cancelled');
			this.trackerStatusBadge.className = 'tracker-badge';
			this.trackerStatusBadge.textContent = 'Cancelled';
			this.trackerProgressWrap.classList.add('hidden');
			if (this.selectedChapterId) {
				void this.loadAndRenderTracker(this.selectedChapterId, this.selectedBookId ?? undefined);
			}
		});

		// RETRY: RESUME PENDING / ERROR PAGES AFTER A CANCEL OR PARTIAL FAILURE.
		this.trackerRetryBtn.addEventListener('click', async () => {
			if (!this.selectedChapterId) return;
			const retryPageIds = this.activeChapterPages
				.filter(p => (p.status === 'pending' || p.status === 'error') && !(p.outputPath || (p.outputRev ?? 0) > 0))
				.map(p => p.id);
			if (retryPageIds.length === 0) {
				this.showToast('No pending or failed pages to retry.', true);
				return;
			}

			this.trackerRetryBtn.disabled = true;
			try {
				let bookId = this.selectedBookId ?? '';
				if (!bookId) {
					const details = await this.client.getChapterDetails(this.selectedChapterId).catch(() => null);
					bookId = String(details?.chapter?.bookId ?? '');
				}
				const settings = await this.client.getSettings().catch(() => ({}));
				const res = await this.client.startBatchTranslation({
					bookId,
					chapterId: this.selectedChapterId,
					settings,
					pageIds: retryPageIds
				});
				if (!res.success) {
					throw new Error(res.message || 'Failed to retry translation');
				}
				// RESET THE BACKGROUND CANCELLATION FLAG SO LIVE SSE / RECONNECTS ARE NOT BLOCKED.
				chrome.runtime.sendMessage({ type: 'CLEAR_ACTIVE_JOB_CANCELLED' }, () => void chrome.runtime.lastError);
				this.showToast(`Resuming ${retryPageIds.length} pending page(s)...`);
				void this.loadAndRenderTracker(this.selectedChapterId, this.selectedBookId ?? undefined);
			} catch (e: any) {
				this.showToast(e?.message || 'Failed to retry translation.', true);
			} finally {
				this.trackerRetryBtn.disabled = false;
			}
		});

		// Modals
		const setModalSourceLang = (lang: string) => {
			this.selectedNewBookSourceLang = lang;
			const opt = this.newBookLangDropdown.querySelector<HTMLButtonElement>(`[data-value="${lang}"]`);
			if (opt) {
				this.newBookLangLabel.textContent = opt.textContent;
				this.newBookLangDropdown.querySelectorAll('.custom-select-option').forEach(o => {
					o.classList.toggle('active', o === opt);
				});
			}
		};

		const setModalTargetLang = (lang: string) => {
			this.selectedNewBookTargetLang = lang;
			const opt = this.newBookTargetLangDropdown.querySelector<HTMLButtonElement>(`[data-value="${lang}"]`);
			if (opt) {
				this.newBookTargetLangLabel.textContent = opt.textContent;
				this.newBookTargetLangDropdown.querySelectorAll('.custom-select-option').forEach(o => {
					o.classList.toggle('active', o === opt);
				});
			}
		};

		const openModal = (overlay: HTMLElement) => {
			overlay.classList.remove('hidden');
			void overlay.offsetHeight; // force reflow for smooth animation
			overlay.classList.add('open');
		};

		const closeModal = (overlay: HTMLElement, onClosed?: () => void) => {
			overlay.classList.remove('open');
			setTimeout(() => {
				if (!overlay.classList.contains('open')) {
					overlay.classList.add('hidden');
					onClosed?.();
				}
			}, 180);
		};

		// 1. Settings Modal
		const openSettingsModal = () => {
			openModal(this.settingsModalOverlay);
			setTimeout(() => this.serverUrlInput.focus(), 50);
		};

		const closeSettingsModal = () => {
			closeModal(this.settingsModalOverlay);
		};

		this.toggleSettingsBtn.addEventListener('click', openSettingsModal);
		this.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
		this.cancelSettingsModalBtn.addEventListener('click', closeSettingsModal);
		this.settingsModalOverlay.addEventListener('click', (e) => {
			if (e.target === this.settingsModalOverlay) closeSettingsModal();
		});

		this.saveServerUrlBtn.addEventListener('click', async () => {
			const url = this.serverUrlInput.value.trim() || 'http://127.0.0.1:8124';
			this.client.setBaseUrl(url);
			await chrome.storage.local.set({ serverUrl: url });
			closeSettingsModal();
			this.showToast('Server URL Saved');
			await this.checkServerStatus();
			if (this.currentView === 'import') {
				await this.loadBooks();
			}
		});

		// 2. Book Modal
		const openBookModal = () => {
			const bookTitle = this.metadata.bookTitle || this.metadata.seriesTitle;
			if (bookTitle) {
				this.newBookTitleInput.value = bookTitle;
			}
			this.newBookTitleTargetInput.value = '';
			if (this.metadata.sourceLang && this.metadata.sourceLang !== 'auto') {
				setModalSourceLang(this.metadata.sourceLang);
			} else {
				setModalSourceLang('ko');
			}
			// DEFAULT TARGET NEVER COLLIDES WITH THE SOURCE (SERVER REJECTS A MATCH).
			setModalTargetLang(this.selectedNewBookSourceLang === 'en' ? 'zh-Hans' : 'en');
			this.newBookLangCustomSelect.classList.remove('open');
			this.newBookTargetLangCustomSelect.classList.remove('open');
			openModal(this.bookModalOverlay);
			setTimeout(() => this.newBookTitleInput.focus(), 50);
		};

		const closeBookModal = () => {
			this.newBookLangCustomSelect.classList.remove('open');
			this.newBookTargetLangCustomSelect.classList.remove('open');
			closeModal(this.bookModalOverlay, () => {
				this.confirmBookModalBtn.disabled = false;
				this.confirmBookModalBtn.textContent = 'Create Book';
				this.translateBookTitleBtn.disabled = false;
				this.translateBookTitleIcon.classList.remove('hidden');
				this.translateBookTitleSpinner.classList.add('hidden');
			});
		};

		this.newBookBtn.addEventListener('click', openBookModal);
		this.closeBookModalBtn.addEventListener('click', closeBookModal);
		this.cancelBookModalBtn.addEventListener('click', closeBookModal);
		this.bookModalOverlay.addEventListener('click', (e) => {
			if (e.target === this.bookModalOverlay) closeBookModal();
		});

		// AUTO-TRANSLATE THE SOURCE TITLE INTO THE TARGET TITLE FIELD (MIRRORS WEB UI).
		this.translateBookTitleBtn.addEventListener('click', async () => {
			const src = this.newBookTitleInput.value.trim();
			if (!src) {
				this.showToast('Enter a book title to translate.', true);
				return;
			}
			this.translateBookTitleBtn.disabled = true;
			this.translateBookTitleIcon.classList.add('hidden');
			this.translateBookTitleSpinner.classList.remove('hidden');
			try {
				const res = await this.client.translateText({
					text: src,
					kind: 'title',
					sourceLang: this.selectedNewBookSourceLang || 'ko',
					targetLang: this.selectedNewBookTargetLang || 'en'
				});
				if (res?.text) {
					this.newBookTitleTargetInput.value = res.text;
					this.showToast('Title translated!');
				} else {
					this.showToast('Could not translate title.', true);
				}
			} catch (e: any) {
				this.showToast(e?.message || 'Could not translate title.', true);
			} finally {
				this.translateBookTitleBtn.disabled = false;
				this.translateBookTitleSpinner.classList.add('hidden');
				this.translateBookTitleIcon.classList.remove('hidden');
			}
		});

		this.confirmBookModalBtn.addEventListener('click', async () => {
			const title = this.newBookTitleInput.value.trim();
			if (!title) return;
			this.confirmBookModalBtn.disabled = true;
			this.confirmBookModalBtn.textContent = 'Creating...';

			try {
				const chosenSource = this.selectedNewBookSourceLang || 'ko';
				// ENSURE THE TARGET NEVER COLLIDES WITH THE SELECTED SOURCE, OR THE SERVER REJECTS
				// WITH "Target translation language must be different from source language" (400).
				let targetLang = this.selectedNewBookTargetLang || 'en';
				if (chosenSource === targetLang) {
					targetLang = chosenSource === 'en' ? 'zh-Hans' : 'en';
				}
				const created = await this.client.createBook({
					title,
					titleTarget: this.newBookTitleTargetInput.value.trim() || undefined,
					sourceLang: chosenSource,
					targetLang
				});
				closeBookModal();
				this.showToast(`Book "${created.title}" created`);
				await this.loadBooks(created.id);
			} catch (e: any) {
				this.confirmBookModalBtn.disabled = false;
				this.confirmBookModalBtn.textContent = 'Create Book';
				this.showToast(e.message || 'Failed to create book', true);
			}
		});

		const openChapterModal = () => {
			const existingChNums = new Set(this.chapters.map(c => Number(c.chapterNumber)));
			const maxNum = this.chapters.reduce((max, c) => Math.max(max, Number(c.chapterNumber) || 0), 0);
			const nextSequenceNum = maxNum > 0 ? maxNum + 1 : (this.chapters.length + 1);

			let defaultNum: number;
			if (
				this.metadata.hasExplicitChapter &&
				this.metadata.chapterNumber !== undefined &&
				!existingChNums.has(Number(this.metadata.chapterNumber))
			) {
				defaultNum = this.metadata.chapterNumber;
			} else {
				// Fall back to sequence base: next show chapter number 2, chapter title "Chapter 2", etc.
				defaultNum = nextSequenceNum;
			}

			this.newChapterNumberInput.value = String(defaultNum);

			if (
				this.metadata.hasExplicitChapter &&
				this.metadata.chapterTitle &&
				!existingChNums.has(Number(this.metadata.chapterNumber))
			) {
				this.newChapterTitleInput.value = this.metadata.chapterTitle;
			} else {
				this.newChapterTitleInput.value = `Chapter ${defaultNum}`;
			}

			openModal(this.chapterModalOverlay);
			setTimeout(() => this.newChapterTitleInput.focus(), 50);
		};

		this.newChapterNumberInput.addEventListener('input', () => {
			const numStr = this.newChapterNumberInput.value.trim();
			const currTitle = this.newChapterTitleInput.value.trim();
			if (!currTitle || /^Chapter\s+\d+(\.\d+)?$/i.test(currTitle)) {
				this.newChapterTitleInput.value = numStr ? `Chapter ${numStr}` : '';
			}
		});

		const closeChapterModal = () => {
			closeModal(this.chapterModalOverlay, () => {
				this.confirmChapterModalBtn.disabled = false;
				this.confirmChapterModalBtn.textContent = 'Create Chapter';
			});
		};

		this.newChapterBtn.addEventListener('click', openChapterModal);
		this.closeChapterModalBtn.addEventListener('click', closeChapterModal);
		this.cancelChapterModalBtn.addEventListener('click', closeChapterModal);
		this.chapterModalOverlay.addEventListener('click', (e) => {
			if (e.target === this.chapterModalOverlay) closeChapterModal();
		});

		this.confirmChapterModalBtn.addEventListener('click', async () => {
			if (!this.selectedBookId) return;
			const chapterNumber = parseFloat(this.newChapterNumberInput.value) || (this.chapters.length + 1);
			const title = this.newChapterTitleInput.value.trim() || `Chapter ${chapterNumber}`;

			this.confirmChapterModalBtn.disabled = true;
			this.confirmChapterModalBtn.textContent = 'Creating...';

			try {
				const created = await this.client.createChapter(this.selectedBookId, {
					chapterNumber,
					title
				});
				closeChapterModal();
				this.showToast(`Chapter "${title}" created`);
				await this.loadChapters(this.selectedBookId, created.id);
			} catch (e: any) {
				this.confirmChapterModalBtn.disabled = false;
				this.confirmChapterModalBtn.textContent = 'Create Chapter';
				this.showToast(e.message || 'Failed to create chapter', true);
			}
		});
	}

	private updateToggleState(checkbox: HTMLInputElement) {
		const label = checkbox.closest('.pipeline-chip');
		if (label) {
			label.classList.toggle('checked', checkbox.checked);
		}
	}

	// SWITCH BETWEEN IMPORT VIEW AND TRACKER VIEW
	private switchView(view: 'import' | 'tracker') {
		this.currentView = view;
		if (view === 'import') {
			this.stopTrackerPolling();
			this.importView.classList.remove('hidden');
			this.trackerView.classList.add('hidden');
		} else {
			this.importView.classList.add('hidden');
			this.trackerView.classList.remove('hidden');
		}
	}

	private async determineInitialView() {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		this.currentUrl = tab?.url || '';

		// 1. CHECK RUNNING BACKGROUND IMPORT JOB FIRST
		const jobData = await chrome.storage.local.get(['activeImportJob']);
		if (jobData.activeImportJob && jobData.activeImportJob.running) {
			const job = jobData.activeImportJob;
			this.selectedBookId = job.bookId;
			this.selectedChapterId = job.chapterId;
			this.switchView('tracker');
			this.updateTrackerProgress(job.current, job.total, 'uploading');
			void this.loadAndRenderTracker(job.chapterId, job.bookId);
			return;
		}

		// 2. CHECK IF CURRENT TAB URL HAS AN EXISTING RECORDED MAPPING IN DATABASE
		if (this.currentUrl && !this.currentUrl.startsWith('chrome://') && !this.currentUrl.startsWith('about:')) {
			const mappingRes: { mapping?: ChapterMappingEntry | null } = await new Promise(resolve => {
				chrome.runtime.sendMessage({ type: 'GET_SITE_MAPPING', url: this.currentUrl }, res => {
					resolve(res || {});
				});
			});

			if (mappingRes.mapping && mappingRes.mapping.chapterId) {
				const mapping = mappingRes.mapping;
				this.selectedBookId = mapping.bookId;
				this.selectedChapterId = mapping.chapterId;
				this.switchView('tracker');
				void this.loadAndRenderTracker(mapping.chapterId, mapping.bookId);
				return;
			}
		}

		// 3. DEFAULT: UNMAPPED TAB -> SHOW IMPORT VIEW & SCAN TAB
		this.switchView('import');
		await this.scanActiveTab();
		await this.loadBooks();
	}

	private startTrackerPolling(chapterId: number) {
		this.stopTrackerPolling();

		// ATTACH LIVE SSE IN BACKGROUND WORKER
		chrome.runtime.sendMessage({
			type: 'ATTACH_LIVE_SSE',
			chapterId
		}, () => {
			void chrome.runtime.lastError;
		});

		this.trackerPollingTimer = setInterval(async () => {
			if (!this.selectedChapterId || this.currentView !== 'tracker') {
				this.stopTrackerPolling();
				return;
			}

			try {
				const details = await this.client.getChapterDetails(chapterId);
				if (!details?.chapter) return;

				this.activeChapterPages = details.pages || [];
				const total = this.activeChapterPages.length;
				const doneCount = this.activeChapterPages.filter(p => p.outputPath || p.outputRev > 0).length;
				const isComplete = doneCount === total && total > 0;
				const isTranslating = details.isTranslating === true || details.jobStatus === 'running';
				this.isChapterTranslating = isTranslating;

				if (isTranslating) {
					this.trackerStatusBadge.className = 'tracker-badge translating';
					this.trackerStatusBadge.textContent = `Translating ${doneCount}/${total}`;
					this.trackerSummaryText.textContent = `${doneCount} / ${total} pages ready`;
					this.updateTrackerProgress(doneCount, total, 'translating');
				} else if (isComplete) {
					this.trackerStatusBadge.className = 'tracker-badge ready';
					this.trackerStatusBadge.textContent = 'Ready';
					this.trackerSummaryText.textContent = `All ${total} pages translated`;
					this.trackerProgressWrap.classList.add('hidden');
					this.stopTrackerPolling();
				} else {
					this.trackerStatusBadge.className = 'tracker-badge';
					this.trackerStatusBadge.textContent = doneCount > 0 ? `Stopped (${doneCount}/${total})` : 'Idle';
					this.trackerSummaryText.textContent = doneCount > 0 ? `${doneCount} of ${total} pages ready (Stopped)` : `${total} pages in chapter`;
					this.trackerProgressWrap.classList.add('hidden');
					if (!isTranslating && doneCount > 0) {
						this.stopTrackerPolling();
					}
				}

				this.renderTrackerGrid();
			} catch {
				// SILENT POLLING FAILURE
			}
		}, 1500);
	}

	private stopTrackerPolling() {
		if (this.trackerPollingTimer) {
			clearInterval(this.trackerPollingTimer);
			this.trackerPollingTimer = null;
		}
	}

	private async loadAndRenderTracker(chapterId: number, bookId?: string | number) {
		try {
			const details = await this.client.getChapterDetails(chapterId);
			if (!details || !details.chapter) {
				// CHAPTER DELETED FROM STUDIO: PURGE MAPPING AND REVERT TO SCANNER
				await new Promise(resolve => {
					chrome.runtime.sendMessage({
						type: 'DELETE_SITE_MAPPING',
						url: this.currentUrl
					}, () => resolve(true));
				});
				this.switchView('import');
				await this.scanActiveTab();
				await this.loadBooks();
				return;
			}

			this.activeChapterPages = details.pages || [];
			const total = this.activeChapterPages.length;
			const doneCount = this.activeChapterPages.filter(p => p.outputPath || p.outputRev > 0).length;
			const isComplete = doneCount === total && total > 0;
			const isTranslating = details.isTranslating === true || details.jobStatus === 'running';
			this.isChapterTranslating = isTranslating;

			this.trackerChapterTitle.textContent = details.chapter.title || `Chapter #${chapterId}`;

			if (bookId) {
				const books = await this.client.getBooks();
				const b = books.find(item => String(item.id) === String(bookId));
				this.trackerBookTitle.textContent = (b?.titleTarget || b?.title) || 'Active Book';
			} else {
				this.trackerBookTitle.textContent = 'Active Book';
			}

			if (isTranslating) {
				this.trackerStatusBadge.className = 'tracker-badge translating';
				this.trackerStatusBadge.textContent = `Translating ${doneCount}/${total}`;
				this.trackerSummaryText.textContent = `${doneCount} / ${total} pages ready`;
				this.trackerProgressWrap.classList.remove('hidden');
				this.updateTrackerProgress(doneCount, total, 'translating');
				this.startTrackerPolling(chapterId);
			} else if (isComplete) {
				this.trackerStatusBadge.className = 'tracker-badge ready';
				this.trackerStatusBadge.textContent = 'Ready';
				this.trackerSummaryText.textContent = `All ${total} pages translated`;
				this.trackerProgressWrap.classList.add('hidden');
				this.stopTrackerPolling();
			} else {
				this.trackerStatusBadge.className = 'tracker-badge';
				this.trackerStatusBadge.textContent = doneCount > 0 ? `Stopped (${doneCount}/${total})` : 'Idle';
				this.trackerSummaryText.textContent = doneCount > 0 ? `${doneCount} of ${total} pages ready (Stopped)` : `${total} pages in chapter`;
				this.trackerProgressWrap.classList.add('hidden');
				if (doneCount < total && total > 0) {
					this.startTrackerPolling(chapterId);
				} else {
					this.stopTrackerPolling();
				}
			}

			this.renderTrackerGrid();
		} catch (err) {
			console.error('Chapter not found or deleted from studio:', err);
			// AUTOMATICALLY PURGE DELETED CHAPTER MAPPING AND FALL BACK TO SCANNER
			await new Promise(resolve => {
				chrome.runtime.sendMessage({
					type: 'DELETE_SITE_MAPPING',
					url: this.currentUrl
				}, () => resolve(true));
			});
			this.switchView('import');
			await this.scanActiveTab();
			await this.loadBooks();
		}
	}

	private renderTrackerGrid() {
		this.trackerGrid.innerHTML = '';
		if (this.activeChapterPages.length === 0) {
		if (this.activeTrackerPhase === 'uploading') {
			this.trackerRetryBtn.classList.add('hidden');
			this.trackerGrid.innerHTML = `
					<div class="tracker-loading-state uploading" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<div class="scanner-pulse upload"></div>
							<svg class="loading-icon upload-anim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
								<polyline points="17 8 12 3 7 8"/>
								<line x1="12" y1="3" x2="12" y2="15"/>
							</svg>
						</div>
						<div class="loading-title mono">UPLOADING COMIC STRIPS</div>
						<div class="loading-subtitle mono">Transferring high-res panels to server...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
		if (this.activeTrackerPhase === 'reslicing') {
			this.trackerRetryBtn.classList.add('hidden');
			this.trackerGrid.innerHTML = `
					<div class="tracker-loading-state reslicing" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<div class="scanner-pulse reslice"></div>
							<svg class="loading-icon reslice-anim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="6" cy="6" r="3"/>
								<circle cx="6" cy="18" r="3"/>
								<line x1="20" y1="4" x2="8.12" y2="15.88"/>
								<line x1="14.47" y1="14.48" x2="20" y2="20"/>
								<line x1="8.12" y1="8.12" x2="12" y2="12"/>
							</svg>
						</div>
						<div class="loading-title mono">INTELLIGENT RESLICING</div>
						<div class="loading-subtitle mono">Detecting whitespace borders and slicing strips...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
		if (this.activeTrackerPhase === 'translating') {
			this.trackerRetryBtn.classList.add('hidden');
			this.trackerGrid.innerHTML = `
					<div class="tracker-loading-state translating" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<div class="scanner-pulse translate"></div>
							<svg class="loading-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"/>
								<line x1="2" y1="12" x2="22" y2="12"/>
								<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
							</svg>
						</div>
						<div class="loading-title mono">NEURAL TRANSLATION PIPELINE</div>
						<div class="loading-subtitle mono">Running text detection and OCR...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
			this.trackerGrid.innerHTML = `
				<div class="empty-state" style="grid-column: 1 / -1; min-height: 120px;">
					<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
						<circle cx="9" cy="9" r="2"/>
						<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
					</svg>
					<p>No server slices uploaded yet.</p>
				</div>
			`;
			return;
		}

		// FIND FIRST INCOMPLETE/PENDING PAGE INDEX IF TRANSLATING
		let firstIncompleteIdx = -1;
		if (this.isChapterTranslating) {
			firstIncompleteIdx = this.activeChapterPages.findIndex(
				p => !p.outputPath && (p.outputRev ?? 0) <= 0 && p.status !== 'done' && p.status !== 'error'
			);
		}

		this.activeChapterPages.forEach((page, idx) => {
			const card = document.createElement('div');
			const isReady = !!page.outputPath || (page.outputRev ?? 0) > 0 || page.status === 'done';
			const isError = page.status === 'error';
			const isProcessing = !isReady && !isError && (page.status === 'processing' || (this.isChapterTranslating && idx === firstIncompleteIdx));

			let statusClass = 'pending';
			let statusLabel = 'Pending';

			if (isReady) {
				statusClass = 'ready';
				statusLabel = 'Ready';
			} else if (isError) {
				statusClass = 'error';
				statusLabel = 'Error';
			} else if (isProcessing) {
				statusClass = 'processing';
				statusLabel = 'Processing';
			}

			card.className = `slice-card ${statusClass}`;
			card.id = `slice-card-${page.id}`;

			const indexBadge = document.createElement('span');
			indexBadge.className = 'slice-index mono';
			indexBadge.textContent = `#${idx + 1}`;
			card.appendChild(indexBadge);

			const statusBadge = document.createElement('span');
			statusBadge.className = `slice-badge mono ${statusClass}`;
			statusBadge.textContent = statusLabel;
			statusBadge.id = `slice-badge-${page.id}`;
			card.appendChild(statusBadge);

			const img = document.createElement('img');
			const targetUrl = isReady
				? `${this.client.getBaseUrl()}/api/pages/${page.id}/file?kind=output&rev=${page.outputRev ?? 1}`
				: `${this.client.getBaseUrl()}/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 1}`;

			img.src = targetUrl;
			img.id = `slice-img-${page.id}`;
			void resolveSafeImageUrl(targetUrl).then(safeUrl => {
				img.src = safeUrl;
			});

			card.appendChild(img);
			this.trackerGrid.appendChild(card);
		});

		// SHOW THE RETRY BUTTON ONLY WHEN THE PIPELINE IS NOT RUNNING AND THERE ARE
		// PENDING OR ERROR PAGES (NOT YET DONE). HIDE IT WHILE TRANSLATING.
		const hasRetryable = !this.isChapterTranslating && this.activeChapterPages.some(
			p => (p.status === 'pending' || p.status === 'error') && !(p.outputPath || (p.outputRev ?? 0) > 0)
		);
		this.trackerRetryBtn.classList.toggle('hidden', !hasRetryable);
	}

	private updateTrackerProgress(current: number, total: number, phase: string) {
		this.activeTrackerPhase = phase;
		this.trackerProgressWrap.classList.remove('hidden');
		const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
		this.trackerProgressBarFill.style.width = `${pct}%`;
		this.trackerProgressCount.textContent = `${current} / ${total}`;

		if (phase === 'uploading') {
			this.trackerProgressStatus.textContent = `Uploading page ${current} of ${total}...`;
			this.trackerStatusBadge.className = 'tracker-badge uploading';
			this.trackerStatusBadge.textContent = 'Uploading';
		} else if (phase === 'reslicing') {
			this.trackerProgressStatus.textContent = 'Smart reslicing comic strips...';
			this.trackerStatusBadge.className = 'tracker-badge reslicing';
			this.trackerStatusBadge.textContent = 'Reslicing';
		} else if (phase === 'translating') {
			this.trackerProgressStatus.textContent = `Translating page ${current} of ${total}...`;
			this.trackerStatusBadge.className = 'tracker-badge translating';
			this.trackerStatusBadge.textContent = `Translating ${current}/${total}`;
		}

		if (this.activeChapterPages.length === 0) {
			this.renderTrackerGrid();
		}
	}

	private setupMessageListeners() {
		chrome.runtime.onMessage.addListener(msg => {
			if (msg.type === 'IMPORT_PROGRESS') {
				this.updateTrackerProgress(msg.current, msg.total, 'uploading');
			} else if (msg.type === 'PIPELINE_PHASE') {
				if (msg.phase === 'reslicing') {
					this.updateTrackerProgress(0, msg.total || 0, 'reslicing');
				} else if (msg.phase === 'translating') {
					this.isChapterTranslating = true;
					this.updateTrackerProgress(0, msg.total || 0, 'translating');
					if (msg.chapterId) {
						this.startTrackerPolling(msg.chapterId);
					}
				}
			} else if (msg.type === 'PAGE_TRANSLATED') {
				const current = msg.pageSeq + 1;
				const total = msg.total || current;
				this.isChapterTranslating = current < total;
				this.updateTrackerProgress(current, total, 'translating');

				// DYNAMICALLY UPDATE SPECIFIC SLICE CARD IN 3-COLUMN TRACKER GRID
				const card = document.getElementById(`slice-card-${msg.pageId}`);
				if (card) {
					card.className = 'slice-card ready';
				}

				const sliceBadge = document.getElementById(`slice-badge-${msg.pageId}`);
				if (sliceBadge) {
					sliceBadge.className = 'slice-badge mono ready';
					sliceBadge.textContent = 'Ready';
				}

				// Find next pending page and mark as processing
				const nextSeq = msg.pageSeq + 1;
				const nextPage = this.activeChapterPages[nextSeq];
				if (nextPage) {
					const nextCard = document.getElementById(`slice-card-${nextPage.id}`);
					if (nextCard && !nextCard.classList.contains('ready')) {
						nextCard.className = 'slice-card processing';
						const nextBadge = document.getElementById(`slice-badge-${nextPage.id}`);
						if (nextBadge) {
							nextBadge.className = 'slice-badge mono processing';
							nextBadge.textContent = 'Processing';
						}
					}
				}

				const sliceImg = document.getElementById(`slice-img-${msg.pageId}`) as HTMLImageElement;
				if (sliceImg) {
					const newUrl = `${this.client.getBaseUrl()}/api/pages/${msg.pageId}/file?kind=output&rev=${msg.outputRev}`;
					sliceImg.src = newUrl;
					void resolveSafeImageUrl(newUrl).then(safeUrl => {
						sliceImg.src = safeUrl;
					});
				}
			} else if (msg.type === 'CHAPTER_SYNC_UPDATE') {
				if (msg.status === 'resliced' && msg.pages) {
					this.activeChapterPages = msg.pages;
					this.renderTrackerGrid();
				} else if (msg.status === 'done') {
					this.isChapterTranslating = false;
					this.trackerProgressWrap.classList.add('hidden');
					this.trackerStatusBadge.className = 'tracker-badge ready';
					this.trackerStatusBadge.textContent = 'Ready';
					this.trackerSummaryText.textContent = 'All pages translated & in-place synced';
					this.showToast('Chapter Translation Complete!');
					this.stopTrackerPolling();
					if (this.selectedChapterId) {
						void this.loadAndRenderTracker(this.selectedChapterId, this.selectedBookId ?? undefined);
					}
				}
			} else if (msg.type === 'IMPORT_COMPLETE') {
				if (msg.error) {
					this.showToast(`Import failed: ${msg.error}`, true);
					this.switchView('import');
				} else {
					this.showToast(`Imported ${msg.current} pages successfully`);
					if (this.selectedChapterId) {
						void this.loadAndRenderTracker(this.selectedChapterId, this.selectedBookId ?? undefined);
					}
				}
			}
		});
	}

	private async startBatchImport() {
		if (!this.selectedBookId || (!this.selectedChapterId && !this.isNewChapterPreset)) return;
		const selectedUrls = this.images.filter(i => i.selected).map(i => i.url);
		const excludedUrls = this.images.filter(i => !i.selected).map(i => i.url);
		if (selectedUrls.length === 0) return;

		let targetChapterId = this.selectedChapterId;
		let targetChapterTitle = '';

		if (this.isNewChapterPreset || !targetChapterId) {
			this.startImportBtn.disabled = true;
			this.startImportBtn.textContent = 'Creating Chapter...';
			const pendingTitle = this.pendingNewChapterMeta.title;
			const pendingNum = this.pendingNewChapterMeta.chapterNumber;
			try {
				const created = await this.client.createChapter(this.selectedBookId, {
					chapterNumber: pendingNum,
					title: pendingTitle
				});
				targetChapterId = created.id;
				targetChapterTitle = created.title || pendingTitle || `Chapter ${pendingNum}`;
				this.selectedChapterId = created.id;
				this.isNewChapterPreset = false;
				this.showToast(`Chapter "${targetChapterTitle}" created`);
				// Refresh chapters list in background
				void this.client.getChapters(this.selectedBookId).then(chs => {
					this.chapters = chs;
				});
			} catch (e: any) {
				this.showToast(e.message || 'Failed to auto-create chapter', true);
				this.updateImportButtonState();
				return;
			}
		} else {
			const c = this.chapters.find(item => item.id === targetChapterId);
			targetChapterTitle = (c?.titleTarget || c?.title) || (c?.chapterNumber ? `Chapter ${c.chapterNumber}` : `Chapter #${targetChapterId}`);
		}

		// SWITCH DIRECTLY TO TRACKER VIEW AND COMMENCE IMPORT
		this.switchView('tracker');
		this.updateTrackerProgress(0, selectedUrls.length, 'uploading');

		const b = this.books.find(item => String(item.id) === String(this.selectedBookId));
		this.trackerBookTitle.textContent = (b?.titleTarget || b?.title) || 'Active Book';
		this.trackerChapterTitle.textContent = targetChapterTitle;

		chrome.runtime.sendMessage({
			type: 'START_IMPORT_JOB',
			payload: {
				bookId: this.selectedBookId,
				chapterId: targetChapterId,
				imageUrls: selectedUrls,
				excludedImageUrls: excludedUrls,
				includedImageUrls: selectedUrls,
				autoReslice: this.autoResliceCheckbox.checked,
				autoTranslate: this.autoTranslateCheckbox.checked
			},
			refererUrl: this.currentUrl
		}, () => {
			void chrome.runtime.lastError;
		});
	}

	private async checkServerStatus() {
		try {
			const isOnline = await this.client.checkHealth();
			if (isOnline) {
				this.serverStatusBadge.className = 'server-badge online mono';
				this.serverStatusBadge.title = 'Server online and connected';
				this.serverStatusBadge.textContent = 'Online';
			} else {
				this.serverStatusBadge.className = 'server-badge offline mono';
				this.serverStatusBadge.title = 'Server is unreachable';
				this.serverStatusBadge.textContent = 'Offline';
			}
		} catch {
			this.serverStatusBadge.className = 'server-badge error mono';
			this.serverStatusBadge.title = 'Server connection failed';
			this.serverStatusBadge.textContent = 'Offline';
		}
	}

	private async loadBooks(selectBookId?: string | number) {
		try {
			this.books = await this.client.getBooks();
			this.renderBookDropdown(selectBookId);
		} catch (e) {
			console.error('Failed to load books:', e);
			this.bookLabel.textContent = 'Failed to load books';
		}
	}

	private renderBookDropdown(selectBookId?: string | number) {
		this.bookDropdown.innerHTML = '';
		if (this.books.length === 0) {
			this.bookLabel.textContent = 'No books found. Click + to create';
			this.chapterBtn.disabled = true;
			this.newChapterBtn.disabled = true;
			return;
		}

		let matchedId: string | number | null = selectBookId || null;
		const activeTitle = this.metadata.bookTitle || this.metadata.seriesTitle;
		if (!matchedId && activeTitle) {
			const needle = activeTitle.toLowerCase();
			const found = this.books.find(b =>
				(b.title && b.title.toLowerCase().includes(needle)) ||
				(b.titleTarget && b.titleTarget.toLowerCase().includes(needle)) ||
				needle.includes((b.titleTarget || b.title).toLowerCase())
			);
			if (found) matchedId = found.id;
		}

		for (const book of this.books) {
			const btn = document.createElement('button');
			btn.className = 'custom-select-option mono';
			btn.type = 'button';
			btn.dataset.value = String(book.id);
			const displayTitle = book.titleTarget || book.title;
			btn.textContent = `${displayTitle} [${book.sourceLang.toUpperCase()}]`;

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectBook(book.id);
			});

			this.bookDropdown.appendChild(btn);
		}

		if (matchedId) {
			this.selectBook(matchedId);
		} else {
			chrome.storage.local.get(['lastBookId']).then(stored => {
				if (stored.lastBookId && this.books.some(b => String(b.id) === String(stored.lastBookId))) {
					this.selectBook(stored.lastBookId);
				} else {
					this.selectBook(this.books[0].id);
				}
			});
		}
	}

	private selectBook(bookId: string | number) {
		this.selectedBookId = bookId;
		const book = this.books.find(b => String(b.id) === String(bookId));
		if (book) {
			const displayTitle = book.titleTarget || book.title;
			this.bookLabel.textContent = `${displayTitle} [${book.sourceLang.toUpperCase()}]`;
		}

		this.bookDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
			opt.classList.toggle('active', (opt as HTMLElement).dataset.value === String(bookId));
		});

		this.bookCustomSelect.classList.remove('open');
		chrome.storage.local.set({ lastBookId: bookId });

		this.chapterBtn.disabled = false;
		this.newChapterBtn.disabled = false;

		this.loadChapters(bookId);
	}

	private async loadChapters(bookId: string | number, selectChapterId?: number) {
		try {
			this.chapterLabel.textContent = 'Loading chapters...';
			this.chapters = await this.client.getChapters(bookId);
			this.chapterDropdown.innerHTML = '';

			const existingChNums = new Set(this.chapters.map(c => Number(c.chapterNumber)));
			const maxNum = this.chapters.reduce((max, c) => Math.max(max, Number(c.chapterNumber) || 0), 0);
			const nextSequenceNum = maxNum > 0 ? maxNum + 1 : (this.chapters.length + 1);

			let newNum: number;
			let newTitle: string;

			if (
				this.metadata.hasExplicitChapter &&
				this.metadata.chapterNumber !== undefined &&
				!existingChNums.has(Number(this.metadata.chapterNumber))
			) {
				newNum = this.metadata.chapterNumber;
				newTitle = this.metadata.chapterTitle || `Chapter ${newNum}`;
			} else {
				newNum = nextSequenceNum;
				newTitle = `Chapter ${newNum}`;
			}

			this.pendingNewChapterMeta = { chapterNumber: newNum, title: newTitle };

			// 1. ADD THE (NEW) PRESET BUTTON AS TOP OPTION IN DROPDOWN
			const newBtn = document.createElement('button');
			newBtn.className = 'custom-select-option mono new-chapter-opt';
			newBtn.type = 'button';
			newBtn.dataset.value = '__new__';
			newBtn.textContent = `${newTitle} (NEW)`;
			newBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectNewChapterPreset();
			});
			this.chapterDropdown.appendChild(newBtn);

			// 2. ADD ALL EXISTING CHAPTERS
			for (const ch of this.chapters) {
				const btn = document.createElement('button');
				btn.className = 'custom-select-option mono';
				btn.type = 'button';
				btn.dataset.value = String(ch.id);
				const displayTitle = ch.titleTarget || ch.title || `Chapter ${ch.chapterNumber}`;
				btn.textContent = displayTitle;

				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.selectChapter(ch.id);
				});

				this.chapterDropdown.appendChild(btn);
			}

			// 3. DETERMINE DEFAULT SELECTION
			let matchedExistingId: number | null = null;
			if (selectChapterId && this.chapters.some(c => c.id === selectChapterId)) {
				matchedExistingId = selectChapterId;
			} else if (this.metadata.hasExplicitChapter && this.metadata.chapterNumber !== undefined) {
				const found = this.chapters.find(c => Number(c.chapterNumber) === Number(this.metadata.chapterNumber));
				if (found) matchedExistingId = found.id;
			}

			if (matchedExistingId) {
				this.selectChapter(matchedExistingId);
			} else {
				this.selectNewChapterPreset();
			}
		} catch (e) {
			console.error('Failed to load chapters:', e);
		}
	}

	private selectNewChapterPreset() {
		this.isNewChapterPreset = true;
		this.selectedChapterId = null;
		this.chapterLabel.textContent = `${this.pendingNewChapterMeta.title} (NEW)`;

		this.chapterDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
			opt.classList.toggle('active', (opt as HTMLElement).dataset.value === '__new__');
		});

		this.chapterCustomSelect.classList.remove('open');
		this.updateImportButtonState();
	}

	private selectChapter(chapterId: number) {
		this.isNewChapterPreset = false;
		this.selectedChapterId = chapterId;
		const ch = this.chapters.find(c => c.id === chapterId);
		if (ch) {
			const displayTitle = ch.titleTarget || ch.title || `Chapter ${ch.chapterNumber}`;
			this.chapterLabel.textContent = displayTitle;
		}

		this.chapterDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
			opt.classList.toggle('active', (opt as HTMLElement).dataset.value === String(chapterId));
		});

		this.chapterCustomSelect.classList.remove('open');

		const bookKey = String(this.selectedBookId ?? '');
		chrome.storage.local.get(['lastChapterByBook']).then(stored => {
			const map: Record<string, number> = stored.lastChapterByBook || {};
			map[bookKey] = chapterId;
			chrome.storage.local.set({ lastChapterByBook: map, lastChapterId: chapterId });
		});

		this.updateImportButtonState();
	}

	private async scanActiveTab() {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) return;

		this.currentUrl = tab.url || '';

		if (this.currentUrl.startsWith('chrome://') || this.currentUrl.startsWith('edge://') || this.currentUrl.startsWith('about:')) {
			this.galleryEmptyState.innerHTML = `
				<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
				</svg>
				<p>Open a manga or webtoon reader tab to scan and import pages.</p>
			`;
			return;
		}

		try {
			if (chrome.scripting) {
				await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					files: ['content.js']
				});
			}
		} catch {
			// Tab may already have content script injected
		}

		chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' }, (res: ScanPageResponse) => {
			if (chrome.runtime.lastError || !res) {
				this.galleryEmptyState.innerHTML = `
					<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/>
						<line x1="21" y1="21" x2="16.65" y2="16.65"/>
					</svg>
					<p>No reader images found.<br>Click <b>Fast Scan</b> to auto-scroll.</p>
				`;
				return;
			}

			const raw = res.images || [];
			const clean = raw.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height));

			// IF FEW IMAGES FOUND (<3), AUTOMATICALLY TRIGGER FAST SCROLL PRELOAD TO UNMOUNT VIRTUAL/LAZY PANELS
			if (clean.length < 3) {
				chrome.tabs.sendMessage(tab.id, { type: 'FAST_SCROLL_PRELOAD' }, (fastRes: ScanPageResponse & { success?: boolean }) => {
					if (!chrome.runtime.lastError && fastRes && fastRes.images && fastRes.images.length > clean.length) {
						this.images = sortImagesByCoordinates(
							fastRes.images.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height))
						);
						this.metadata = fastRes.metadata || res.metadata || {};
					} else {
						this.images = sortImagesByCoordinates(clean);
						this.metadata = res.metadata || {};
					}

					if (this.images.length === 0) {
						this.galleryEmptyState.classList.remove('hidden');
						this.galleryGrid.classList.add('hidden');
					} else {
						this.galleryEmptyState.classList.add('hidden');
						this.galleryGrid.classList.remove('hidden');
						this.renderGalleryGrid();
					}
					this.updateSelectionSummary();
				});
				return;
			}

			this.images = sortImagesByCoordinates(clean);
			this.metadata = res.metadata || {};

			if (this.images.length === 0) {
				this.galleryEmptyState.classList.remove('hidden');
				this.galleryGrid.classList.add('hidden');
			} else {
				this.galleryEmptyState.classList.add('hidden');
				this.galleryGrid.classList.remove('hidden');
				this.renderGalleryGrid();
			}

			this.updateSelectionSummary();
		});
	}

	private renderGalleryGrid() {
		this.galleryGrid.innerHTML = '';
		this.protectedImagesCount = 0;
		if (this.protectedWarningBanner) {
			this.protectedWarningBanner.classList.add('hidden');
		}

		if (this.images.length === 0) {
			this.galleryEmptyState.classList.remove('hidden');
			this.galleryGrid.classList.add('hidden');
			return;
		}

		this.galleryEmptyState.classList.add('hidden');
		this.galleryGrid.classList.remove('hidden');

		this.images.forEach((img, idx) => {
			const card = document.createElement('div');
			card.className = `thumb-card ${img.selected ? 'selected' : ''}`;
			card.dataset.index = String(idx);

			const image = document.createElement('img');
			image.src = img.url;
			image.loading = 'lazy';
			image.alt = `Page ${idx + 1}`;

			const indexBadge = document.createElement('span');
			indexBadge.className = 'thumb-index mono';
			indexBadge.textContent = `#${idx + 1}`;

			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'thumb-checkbox';
			checkbox.checked = img.selected;

			const dim = document.createElement('span');
			dim.className = 'thumb-dim mono';
			dim.textContent = img.width > 0 ? `${img.width}×${img.height}` : '...';

			image.addEventListener('load', () => {
				if (!img.dhash && image.naturalWidth > 0) {
					const hash = computeDHashFromElement(image);
					if (hash) img.dhash = hash;
				}
				if (img.width === 0 && image.naturalWidth > 0) {
					img.width = image.naturalWidth;
					img.height = image.naturalHeight;
					dim.textContent = `${img.width}×${img.height}`;
				}
			});

			let fallbackAttempted = false;
			image.addEventListener('error', () => {
				if (fallbackAttempted) return;
				fallbackAttempted = true;

				// RENDER BEAUTIFULLY STYLED PROTECTED / ACCESS RESTRICTED CARD
				card.classList.add('failed');
				image.style.display = 'none';

				if (!card.querySelector('.failed-protected-view')) {
					const failedView = document.createElement('div');
					failedView.className = 'failed-protected-view';
					failedView.innerHTML = `
						<svg class="failed-shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
							<line x1="12" y1="8" x2="12" y2="12"/>
							<line x1="12" y1="16" x2="12.01" y2="16"/>
						</svg>
						<span class="failed-tag mono">PROTECTED</span>
						<span class="failed-sub mono">CORS / Hotlink</span>
					`;
					card.insertBefore(failedView, dim);
				}

				dim.textContent = img.width > 0 ? `${img.width}×${img.height}` : 'Protected';

				this.protectedImagesCount++;
				if (this.protectedWarningBanner) {
					this.protectedWarningBanner.classList.remove('hidden');
					if (this.protectedWarningCount) {
						this.protectedWarningCount.textContent = `${this.protectedImagesCount} page${this.protectedImagesCount > 1 ? 's' : ''} protected by CDN hotlink policy.`;
					}
				}
			});

			card.appendChild(image);
			card.appendChild(indexBadge);
			card.appendChild(checkbox);
			card.appendChild(dim);

			card.addEventListener('click', (e) => {
				if (e.target === checkbox) return;
				checkbox.checked = !checkbox.checked;
				img.selected = checkbox.checked;
				card.classList.toggle('selected', img.selected);
				this.updateSelectionSummary();
			});

			checkbox.addEventListener('change', () => {
				img.selected = checkbox.checked;
				card.classList.toggle('selected', img.selected);
				this.updateSelectionSummary();
			});

			this.galleryGrid.appendChild(card);
		});
	}

	private updateSelectionSummary() {
		const selectedCount = this.images.filter(i => i.selected).length;
		const total = this.images.length;
		this.selectionCountText.textContent = `${selectedCount} / ${total} pages`;
		this.selectAllCheckbox.checked = selectedCount === total && total > 0;
		this.updateImportButtonState();
	}

	private updateImportButtonState() {
		const selectedCount = this.images.filter(i => i.selected).length;
		const hasValidChapter = !!this.selectedChapterId || this.isNewChapterPreset;
		const isValid = !!this.selectedBookId && hasValidChapter && selectedCount > 0;
		this.startImportBtn.disabled = !isValid;
		this.importBtnText.textContent = `Import ${selectedCount} Page${selectedCount === 1 ? '' : 's'}`;
	}

	private showToast(msg: string, isError = false) {
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toast.textContent = msg;
		this.toast.className = `toast visible ${isError ? 'error' : ''}`;
		this.toastTimer = setTimeout(() => {
			this.toast.className = 'toast';
		}, 3000);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const controller = new PopupController();
	controller.init();
});
