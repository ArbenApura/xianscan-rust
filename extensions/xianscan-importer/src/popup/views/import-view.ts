// -- POPUP IMPORT AND SCANNER VIEW CONTROLLER -- //

// IMPORTED TYPES
import type { BookSummary, ChapterSummary, ChapterMetadata, ScannedImage, ScanPageResponse } from '../../types';

// IMPORTED MODULES
import { XianScanClient } from '../../api';
import { sortImagesByCoordinates, isPlaceholderImage, computeDHashFromElement } from '../../utils/sorter';
import { CustomSelectComponent, type SelectOption } from '../components/custom-select';
import { ToastComponent } from '../components/toast';

// -- IMPORT VIEW CLASS -- //

export class ImportViewController {
	private viewEl: HTMLElement;
	private client: XianScanClient;
	private toast: ToastComponent;

	private bookSelect: CustomSelectComponent;
	private newBookBtn: HTMLButtonElement;

	private chapterSelect: CustomSelectComponent;
	private newChapterBtn: HTMLButtonElement;

	private inPlaceCheckbox: HTMLInputElement;
	private inPlaceNoticeBanner: HTMLElement;

	private selectAllCheckbox: HTMLInputElement;
	private selectionCountText: HTMLElement;
	private copyDebugBtn: HTMLButtonElement;
	private fastScanBtn: HTMLButtonElement;

	private galleryContainer: HTMLElement;
	private galleryEmptyState: HTMLElement;
	private galleryGrid: HTMLElement;
	private protectedWarningBanner: HTMLElement;
	private protectedWarningCount: HTMLElement;
	private protectedImagesCount = 0;

	private autoResliceCheckbox: HTMLInputElement;
	private autoTranslateChip: HTMLElement;
	private autoTranslateLockBadge: HTMLElement;
	private autoTranslateCheckbox: HTMLInputElement;
	private startImportBtn: HTMLButtonElement;
	private importBtnText: HTMLElement;

	private books: BookSummary[] = [];
	private chapters: ChapterSummary[] = [];
	private images: ScannedImage[] = [];
	private metadata: ChapterMetadata = {};
	private selectedBookId: string | number | null = null;
	private selectedChapterId: number | null = null;
	private isNewChapterPreset = false;
	private pendingNewChapterMeta = { chapterNumber: 1, title: 'Chapter 1' };
	private currentUrl = '';

	private onStartImportCallback?: (params: {
		bookId: string | number;
		chapterId: number;
		chapterTitle: string;
		imageUrls: string[];
		excludedUrls: string[];
		autoReslice: boolean;
		autoTranslate: boolean;
		inPlaceReplacement: boolean;
	}) => void;
	private onOpenBookModalCallback?: (meta: { title?: string; sourceLang?: string }) => void;
	private onOpenChapterModalCallback?: (meta: { bookId: string | number; nextNumber: number; defaultTitle: string }) => void;
	private onInPlaceChangedCallback?: (checked: boolean) => void;

	constructor(
		client: XianScanClient,
		toast: ToastComponent,
		callbacks: {
			onStartImport?: (params: any) => void;
			onOpenBookModal?: (meta: any) => void;
			onOpenChapterModal?: (meta: any) => void;
			onInPlaceChanged?: (checked: boolean) => void;
		} = {}
	) {
		this.client = client;
		this.toast = toast;
		this.onStartImportCallback = callbacks.onStartImport;
		this.onOpenBookModalCallback = callbacks.onOpenBookModal;
		this.onOpenChapterModalCallback = callbacks.onOpenChapterModal;
		this.onInPlaceChangedCallback = callbacks.onInPlaceChanged;

		const $ = (id: string) => document.getElementById(id) || document.createElement('div');
		this.viewEl = $('importView');

		this.bookSelect = new CustomSelectComponent(
			'bookCustomSelect',
			'bookBtn',
			'bookLabel',
			'bookDropdown',
			(val) => this.selectBook(val)
		);
		this.newBookBtn = document.getElementById('newBookBtn') as HTMLButtonElement;

		this.chapterSelect = new CustomSelectComponent(
			'chapterCustomSelect',
			'chapterBtn',
			'chapterLabel',
			'chapterDropdown',
			(val) => {
				if (val === '__new__') {
					this.selectNewChapterPreset();
				} else {
					this.selectChapter(Number(val));
				}
			}
		);
		this.newChapterBtn = document.getElementById('newChapterBtn') as HTMLButtonElement;

		this.inPlaceCheckbox = document.getElementById('inPlaceReplacementCheckbox') as HTMLInputElement;
		this.inPlaceNoticeBanner = $('inPlaceNoticeBanner');

		this.selectAllCheckbox = document.getElementById('selectAllCheckbox') as HTMLInputElement;
		this.selectionCountText = $('selectionCountText');
		this.copyDebugBtn = document.getElementById('copyDebugBtn') as HTMLButtonElement;
		this.fastScanBtn = document.getElementById('fastScanBtn') as HTMLButtonElement;

		this.galleryContainer = $('galleryContainer');
		this.galleryEmptyState = $('galleryEmptyState');
		this.galleryGrid = $('galleryGrid');
		this.protectedWarningBanner = $('protectedWarningBanner');
		this.protectedWarningCount = $('protectedWarningCount');

		this.autoResliceCheckbox = document.getElementById('autoResliceCheckbox') as HTMLInputElement;
		this.autoTranslateChip = $('autoTranslateChip');
		this.autoTranslateLockBadge = $('autoTranslateLockBadge');
		this.autoTranslateCheckbox = document.getElementById('autoTranslateCheckbox') as HTMLInputElement;
		this.startImportBtn = document.getElementById('startImportBtn') as HTMLButtonElement;
		this.importBtnText = $('importBtnText');

		this.bindEvents();
		this.updateToggleState(this.autoResliceCheckbox);
		this.updateToggleState(this.autoTranslateCheckbox);
		this.updateToggleState(this.inPlaceCheckbox);

		chrome.storage.local.get(['autoReslice', 'autoTranslate']).then(stored => {
			if (stored.autoReslice !== undefined) {
				this.autoResliceCheckbox.checked = stored.autoReslice === true;
				this.updateToggleState(this.autoResliceCheckbox);
			}
			if (stored.autoTranslate !== undefined && !this.inPlaceCheckbox.checked) {
				this.autoTranslateCheckbox.checked = stored.autoTranslate === true;
				this.updateToggleState(this.autoTranslateCheckbox);
			}
		});
	}

	private bindEvents(): void {
		this.inPlaceCheckbox.addEventListener('change', () => {
			const checked = this.inPlaceCheckbox.checked;
			this.updateInPlaceState(checked);
			this.onInPlaceChangedCallback?.(checked);
		});

		this.newBookBtn.addEventListener('click', () => {
			const activeTitle = this.metadata.bookTitle || this.metadata.seriesTitle;
			this.onOpenBookModalCallback?.({
				title: activeTitle,
				sourceLang: this.metadata.sourceLang
			});
		});

		this.newChapterBtn.addEventListener('click', () => {
			if (!this.selectedBookId) return;
			const existingChNums = new Set(this.chapters.map(c => Number(c.chapterNumber)));
			const maxNum = this.chapters.reduce((max, c) => Math.max(max, Number(c.chapterNumber) || 0), 0);
			const nextSequenceNum = maxNum > 0 ? maxNum + 1 : (this.chapters.length + 1);

			let defaultNum: number;
			let defaultTitle: string;

			if (
				this.metadata.hasExplicitChapter &&
				this.metadata.chapterNumber !== undefined &&
				!existingChNums.has(Number(this.metadata.chapterNumber))
			) {
				defaultNum = this.metadata.chapterNumber;
				defaultTitle = this.metadata.chapterTitle || `Chapter ${defaultNum}`;
			} else {
				defaultNum = nextSequenceNum;
				defaultTitle = `Chapter ${defaultNum}`;
			}

			this.onOpenChapterModalCallback?.({
				bookId: this.selectedBookId,
				nextNumber: defaultNum,
				defaultTitle
			});
		});

		this.autoResliceCheckbox.addEventListener('change', () => {
			this.updateToggleState(this.autoResliceCheckbox);
			chrome.storage.local.set({ autoReslice: this.autoResliceCheckbox.checked });
		});

		this.autoTranslateCheckbox.addEventListener('change', () => {
			this.updateToggleState(this.autoTranslateCheckbox);
			chrome.storage.local.set({ autoTranslate: this.autoTranslateCheckbox.checked });
		});

		this.autoTranslateChip?.addEventListener('click', () => {
			if (this.inPlaceCheckbox.checked) {
				this.toast.show('Auto-Translate is required while In-Place Translation is active');
			}
		});

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
				metadata: this.metadata,
				selectedBookId: this.selectedBookId,
				selectedChapterId: this.selectedChapterId,
				settings: {
					inPlaceReplacement: this.inPlaceCheckbox.checked,
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

			try {
				await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
				const originalHtml = this.copyDebugBtn.innerHTML;
				this.copyDebugBtn.innerHTML = `
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
					Copied!
				`;
				this.toast.show('Debug details copied to clipboard');
				setTimeout(() => {
					this.copyDebugBtn.innerHTML = originalHtml;
				}, 2000);
			} catch {
				this.toast.show('Failed to copy to clipboard', true);
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
						this.toast.show('Scan timed out', true);
						return;
					}

					const raw = res.images || [];
					this.images = sortImagesByCoordinates(
						raw.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height))
					);
					this.metadata = res.metadata || {};
					this.renderGalleryGrid();
					this.updateSelectionSummary();
					if (this.selectedBookId) {
						void this.loadChapters(this.selectedBookId);
					}
					this.toast.show(`Found ${this.images.length} pages`);
				});
			} else {
				this.fastScanBtn.disabled = false;
			}
		});

		this.startImportBtn.addEventListener('click', () => {
			this.triggerImport();
		});
	}

	updateInPlaceState(checked: boolean): void {
		this.inPlaceCheckbox.checked = checked;
		this.updateToggleState(this.inPlaceCheckbox);
		this.inPlaceNoticeBanner.classList.toggle('hidden', !checked);

		if (checked) {
			this.autoTranslateCheckbox.checked = true;
			this.autoTranslateCheckbox.disabled = true;
			this.autoTranslateChip?.classList.add('locked');
			this.autoTranslateLockBadge?.classList.remove('hidden');
			this.autoTranslateChip?.setAttribute('title', 'Auto-Translate is required and locked while In-Place Translation is active');
			this.updateToggleState(this.autoTranslateCheckbox);
			chrome.storage.local.set({ autoTranslate: true });
		} else {
			chrome.storage.local.get(['autoTranslate']).then(stored => {
				this.autoTranslateCheckbox.checked = stored.autoTranslate !== false;
				this.autoTranslateCheckbox.disabled = false;
				this.autoTranslateChip?.classList.remove('locked');
				this.autoTranslateLockBadge?.classList.add('hidden');
				this.autoTranslateChip?.setAttribute('title', 'Automatically translate and typeset pages after upload');
				this.updateToggleState(this.autoTranslateCheckbox);
			});
		}
	}

	updateToggleState(checkbox: HTMLInputElement): void {
		const label = checkbox.closest('.pipeline-chip');
		if (label) {
			label.classList.toggle('checked', checkbox.checked);
			label.classList.toggle('disabled', checkbox.disabled);
		}
	}

	setCurrentUrl(url: string): void {
		this.currentUrl = url;
	}

	async scanActiveTab(): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) return;
		const tabId = tab.id;

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
					target: { tabId },
					files: ['content.js']
				});
			}
		} catch {
			// Tab may already have content script injected
		}

		await new Promise<void>((resolve) => {
			chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' }, (res: ScanPageResponse) => {
				if (chrome.runtime.lastError || !res) {
					this.galleryEmptyState.innerHTML = `
						<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="11" cy="11" r="8"/>
							<line x1="21" y1="21" x2="16.65" y2="16.65"/>
						</svg>
						<p>No reader images found.<br>Click <b>Fast Scan</b> to auto-scroll.</p>
					`;
					resolve();
					return;
				}

				const raw = res.images || [];
				const clean = raw.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height));

				if (clean.length < 3) {
					chrome.tabs.sendMessage(tabId, { type: 'FAST_SCROLL_PRELOAD' }, (fastRes: ScanPageResponse & { success?: boolean }) => {
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
						resolve();
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
				resolve();
			});
		});

		// RE-EVALUATE BOOK AND CHAPTER DROPDOWNS IF BOOKS ARE ALREADY LOADED
		if (this.books.length > 0) {
			this.renderBookDropdown(this.selectedBookId || undefined);
		}
	}

	async loadBooks(selectBookId?: string | number): Promise<void> {
		try {
			this.books = await this.client.getBooks();
			this.renderBookDropdown(selectBookId);
		} catch (e) {
			console.error('Failed to load books:', e);
			this.bookSelect.setLabel('Server unreachable. Click + or check settings');
			this.chapterSelect.setDisabled(true);
			this.newChapterBtn.disabled = true;
			this.updateImportButtonState();
		}
	}

	private renderBookDropdown(selectBookId?: string | number): void {
		if (this.books.length === 0) {
			this.bookSelect.setLabel('No books found. Click + to create');
			this.chapterSelect.setDisabled(true);
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

		const options: SelectOption[] = this.books.map(book => ({
			value: String(book.id),
			label: `${book.titleTarget || book.title} [${book.sourceLang.toUpperCase()}]`
		}));

		this.bookSelect.setOptions(options);

		if (matchedId) {
			this.selectBook(matchedId);
		} else {
			this.selectBook(this.books[0].id);
			chrome.storage.local.get(['lastBookId']).then(stored => {
				if (stored.lastBookId && this.books.some(b => String(b.id) === String(stored.lastBookId)) && String(stored.lastBookId) !== String(this.books[0].id)) {
					this.selectBook(stored.lastBookId);
				}
			});
		}
	}

	getSelectedBookId(): string | number | null {
		return this.selectedBookId;
	}

	selectBook(bookId: string | number): void {
		this.selectedBookId = bookId;
		const book = this.books.find(b => String(b.id) === String(bookId));
		if (book) {
			this.bookSelect.select(String(bookId), `${book.titleTarget || book.title} [${book.sourceLang.toUpperCase()}]`);
		}

		chrome.storage.local.set({ lastBookId: bookId });
		this.chapterSelect.setDisabled(false);
		this.newChapterBtn.disabled = false;

		void this.loadChapters(bookId);
	}

	async loadChapters(bookId: string | number, selectChapterId?: number): Promise<void> {
		try {
			this.chapterSelect.setLabel('Loading chapters...');
			this.chapters = await this.client.getChapters(bookId);

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

			const options: SelectOption[] = [
				{
					value: '__new__',
					label: `${newTitle} (NEW)`,
					className: 'new-chapter-opt'
				},
				...this.chapters.map(ch => ({
					value: String(ch.id),
					label: ch.titleTarget || ch.title || `Chapter ${ch.chapterNumber}`
				}))
			];

			this.chapterSelect.setOptions(options);

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
			this.chapterSelect.setLabel('Failed to load chapters');
			this.selectNewChapterPreset();
		}
	}

	selectNewChapterPreset(): void {
		this.isNewChapterPreset = true;
		this.selectedChapterId = null;
		this.chapterSelect.select('__new__', `${this.pendingNewChapterMeta.title} (NEW)`);
		this.updateImportButtonState();
	}

	selectChapter(chapterId: number): void {
		this.isNewChapterPreset = false;
		this.selectedChapterId = chapterId;
		const ch = this.chapters.find(c => c.id === chapterId);
		if (ch) {
			this.chapterSelect.select(String(chapterId), ch.titleTarget || ch.title || `Chapter ${ch.chapterNumber}`);
		}

		const bookKey = String(this.selectedBookId ?? '');
		chrome.storage.local.get(['lastChapterByBook']).then(stored => {
			const map: Record<string, number> = stored.lastChapterByBook || {};
			map[bookKey] = chapterId;
			chrome.storage.local.set({ lastChapterByBook: map, lastChapterId: chapterId });
		});

		this.updateImportButtonState();
	}

	renderGalleryGrid(): void {
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
			image.loading = 'lazy';
			image.decoding = 'async';
			image.alt = `Page ${idx + 1}`;

			const indexBadge = document.createElement('span');
			indexBadge.className = 'thumb-index mono';
			indexBadge.textContent = `#${idx + 1}`;

			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'thumb-checkbox';
			checkbox.checked = img.selected ?? true;

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

			image.src = img.url;

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

	updateSelectionSummary(): void {
		const selectedCount = this.images.filter(i => i.selected).length;
		const total = this.images.length;
		this.selectionCountText.textContent = `${selectedCount} / ${total} pages`;
		this.selectAllCheckbox.checked = selectedCount === total && total > 0;
		this.updateImportButtonState();
	}

	updateImportButtonState(): void {
		const selectedCount = this.images.filter(i => i.selected).length;
		const hasValidChapter = !!this.selectedChapterId || this.isNewChapterPreset;
		const isValid = !!this.selectedBookId && hasValidChapter && selectedCount > 0;
		this.startImportBtn.disabled = !isValid;
		this.importBtnText.textContent = `Import ${selectedCount} Page${selectedCount === 1 ? '' : 's'}`;
	}

	async triggerImport(): Promise<void> {
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
				this.toast.show(`Chapter "${targetChapterTitle}" created`);
				void this.client.getChapters(this.selectedBookId).then(chs => {
					this.chapters = chs;
				});
			} catch (e: any) {
				this.toast.show(e.message || 'Failed to auto-create chapter', true);
				this.updateImportButtonState();
				return;
			}
		} else {
			const c = this.chapters.find(item => item.id === targetChapterId);
			targetChapterTitle = (c?.titleTarget || c?.title) || (c?.chapterNumber ? `Chapter ${c.chapterNumber}` : `Chapter #${targetChapterId}`);
		}

		this.onStartImportCallback?.({
			bookId: this.selectedBookId,
			chapterId: targetChapterId,
			chapterTitle: targetChapterTitle,
			imageUrls: selectedUrls,
			excludedUrls,
			autoReslice: this.autoResliceCheckbox.checked,
			autoTranslate: this.autoTranslateCheckbox.checked,
			inPlaceReplacement: this.inPlaceCheckbox.checked
		});
	}
}
