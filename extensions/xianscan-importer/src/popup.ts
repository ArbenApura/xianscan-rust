import { XianScanClient } from './api';
import type { BookSummary, ChapterMetadata, ChapterSummary, ScannedImage, ScanPageResponse } from './types';
import { sortImagesByCoordinates, isPlaceholderImage } from './utils/sorter';

class PopupController {
	private client: XianScanClient;
	private currentUrl = '';
	private images: ScannedImage[] = [];
	private metadata: ChapterMetadata = {};
	private books: BookSummary[] = [];
	private chapters: ChapterSummary[] = [];

	private selectedBookId: string | number | null = null;
	private selectedChapterId: number | null = null;

	// DOM Elements
	private statusDot!: HTMLElement;
	private statusText!: HTMLElement;
	private toggleSettingsBtn!: HTMLElement;
	private settingsPanel!: HTMLElement;
	private serverUrlInput!: HTMLInputElement;
	private saveServerUrlBtn!: HTMLElement;

	// Custom Selects
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

	// Toolbar
	private selectAllCheckbox!: HTMLInputElement;
	private selectionCountText!: HTMLElement;
	private fastScanBtn!: HTMLButtonElement;

	// Gallery
	private galleryEmptyState!: HTMLElement;
	private galleryGrid!: HTMLElement;

	// Progress & Toast
	private progressContainer!: HTMLElement;
	private progressStatusText!: HTMLElement;
	private progressCountText!: HTMLElement;
	private progressBarFill!: HTMLElement;
	private cancelImportBtn!: HTMLButtonElement;
	private toast!: HTMLElement;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	// Actions
	private autoTranslateCheckbox!: HTMLInputElement;
	private startImportBtn!: HTMLButtonElement;
	private importBtnText!: HTMLElement;

	// Modals
	private bookModalOverlay!: HTMLElement;
	private newBookTitleInput!: HTMLInputElement;
	private newBookSourceLangSelect!: HTMLSelectElement;
	private closeBookModalBtn!: HTMLElement;
	private cancelBookModalBtn!: HTMLElement;
	private confirmBookModalBtn!: HTMLElement;

	private chapterModalOverlay!: HTMLElement;
	private newChapterNumberInput!: HTMLInputElement;
	private newChapterTitleInput!: HTMLInputElement;
	private closeChapterModalBtn!: HTMLElement;
	private cancelChapterModalBtn!: HTMLElement;
	private confirmChapterModalBtn!: HTMLElement;

	constructor() {
		this.client = new XianScanClient();
	}

	async init() {
		this.bindElements();
		this.bindEvents();

		// Load stored preferences
		const stored = await chrome.storage.local.get(['serverUrl', 'autoTranslate']);
		if (stored.serverUrl) {
			this.client.setBaseUrl(stored.serverUrl);
			this.serverUrlInput.value = stored.serverUrl;
		} else {
			this.serverUrlInput.value = 'http://127.0.0.1:8124';
		}

		if (stored.autoTranslate !== undefined) {
			this.autoTranslateCheckbox.checked = stored.autoTranslate;
		}

		// Initial connection check
		await this.checkServerStatus();

		// Scan active tab
		await this.scanActiveTab();

		// Check for running background job
		const jobData = await chrome.storage.local.get(['activeImportJob']);
		if (jobData.activeImportJob && jobData.activeImportJob.running) {
			this.progressContainer.classList.remove('hidden');
			this.startImportBtn.disabled = true;
			this.updateProgress(jobData.activeImportJob.current, jobData.activeImportJob.total);
		}

		// Runtime progress listener
		chrome.runtime.onMessage.addListener(msg => {
			if (msg.type === 'IMPORT_PROGRESS') {
				this.updateProgress(msg.current, msg.total);
			} else if (msg.type === 'IMPORT_COMPLETE') {
				this.onImportComplete(msg.current, msg.chapterId, msg.bookId);
			} else if (msg.type === 'IMPORT_CANCELLED') {
				this.onImportCancelled();
			}
		});
	}

	private bindElements() {
		const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

		this.statusDot = $('statusDot');
		this.statusText = $('statusText');
		this.toggleSettingsBtn = $('toggleSettingsBtn');
		this.settingsPanel = $('settingsPanel');
		this.serverUrlInput = $('serverUrlInput') as HTMLInputElement;
		this.saveServerUrlBtn = $('saveServerUrlBtn');

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

		this.selectAllCheckbox = $('selectAllCheckbox') as HTMLInputElement;
		this.selectionCountText = $('selectionCountText');
		this.fastScanBtn = $('fastScanBtn') as HTMLButtonElement;

		this.galleryEmptyState = $('galleryEmptyState');
		this.galleryGrid = $('galleryGrid');

		this.progressContainer = $('progressContainer');
		this.progressStatusText = $('progressStatusText');
		this.progressCountText = $('progressCountText');
		this.progressBarFill = $('progressBarFill');
		this.cancelImportBtn = $('cancelImportBtn') as HTMLButtonElement;
		this.toast = $('toast');

		this.autoTranslateCheckbox = $('autoTranslateCheckbox') as HTMLInputElement;
		this.startImportBtn = $('startImportBtn') as HTMLButtonElement;
		this.importBtnText = $('importBtnText');

		// Modals
		this.bookModalOverlay = $('bookModalOverlay');
		this.newBookTitleInput = $('newBookTitleInput') as HTMLInputElement;
		this.newBookSourceLangSelect = $('newBookSourceLangSelect') as HTMLSelectElement;
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
		// Settings Toggle
		this.toggleSettingsBtn.addEventListener('click', () => {
			this.settingsPanel.classList.toggle('hidden');
		});

		this.saveServerUrlBtn.addEventListener('click', async () => {
			const url = this.serverUrlInput.value.trim() || 'http://127.0.0.1:8124';
			this.client.setBaseUrl(url);
			await chrome.storage.local.set({ serverUrl: url });
			this.settingsPanel.classList.add('hidden');
			this.showToast('Server URL Saved');
			await this.checkServerStatus();
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

		// Close dropdowns when clicking outside
		document.addEventListener('click', () => {
			this.bookCustomSelect.classList.remove('open');
			this.chapterCustomSelect.classList.remove('open');
		});

		// Modal Triggers
		const openBookModal = () => {
			if (this.metadata.seriesTitle) {
				this.newBookTitleInput.value = this.metadata.seriesTitle;
			}
			if (this.metadata.sourceLang && this.metadata.sourceLang !== 'auto') {
				this.newBookSourceLangSelect.value = this.metadata.sourceLang;
			}
			this.bookModalOverlay.classList.remove('hidden');
			setTimeout(() => this.newBookTitleInput.focus(), 50);
		};

		const closeBookModal = () => {
			this.bookModalOverlay.classList.add('hidden');
			this.confirmBookModalBtn.disabled = false;
			this.confirmBookModalBtn.textContent = 'Create Series';
		};

		this.newBookBtn.addEventListener('click', openBookModal);
		this.closeBookModalBtn.addEventListener('click', closeBookModal);
		this.cancelBookModalBtn.addEventListener('click', closeBookModal);
		this.bookModalOverlay.addEventListener('click', (e) => {
			if (e.target === this.bookModalOverlay) closeBookModal();
		});

		const submitBookCreation = async () => {
			const title = this.newBookTitleInput.value.trim();
			if (!title) {
				this.showToast('Please enter a series title.', true);
				this.newBookTitleInput.focus();
				return;
			}
			const sourceLang = this.newBookSourceLangSelect.value;
			this.confirmBookModalBtn.disabled = true;
			this.confirmBookModalBtn.textContent = 'Creating...';
			try {
				const book = await this.client.createBook({ title, sourceLang });
				closeBookModal();
				this.showToast(`Created series: ${title}`);
				await this.loadBooks(book.id);
			} catch (e: any) {
				this.confirmBookModalBtn.disabled = false;
				this.confirmBookModalBtn.textContent = 'Create Series';
				this.showToast(`Failed: ${e.message || 'Server error'}`, true);
			}
		};

		this.confirmBookModalBtn.addEventListener('click', submitBookCreation);
		this.newBookTitleInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submitBookCreation();
			}
		});

		// Chapter Modal
		const openChapterModal = () => {
			if (!this.selectedBookId) {
				this.showToast('Please select or create a series first.', true);
				return;
			}
			const nextChapterNum = Math.max(1, this.chapters.length + 1);
			const num = (this.metadata.chapterNumber !== undefined && this.metadata.chapterNumber > 0)
				? this.metadata.chapterNumber
				: nextChapterNum;
			this.newChapterNumberInput.value = String(num);
			this.newChapterTitleInput.value = (this.metadata.chapterTitle && !this.metadata.chapterTitle.endsWith(' 0'))
				? this.metadata.chapterTitle
				: `Chapter ${num}`;
			this.chapterModalOverlay.classList.remove('hidden');
			setTimeout(() => this.newChapterTitleInput.focus(), 50);
		};

		const closeChapterModal = () => {
			this.chapterModalOverlay.classList.add('hidden');
			this.confirmChapterModalBtn.disabled = false;
			this.confirmChapterModalBtn.textContent = 'Create Chapter';
		};

		this.newChapterBtn.addEventListener('click', openChapterModal);
		this.closeChapterModalBtn.addEventListener('click', closeChapterModal);
		this.cancelChapterModalBtn.addEventListener('click', closeChapterModal);
		this.chapterModalOverlay.addEventListener('click', (e) => {
			if (e.target === this.chapterModalOverlay) closeChapterModal();
		});

		const submitChapterCreation = async () => {
			if (!this.selectedBookId) {
				this.showToast('Please select a series first.', true);
				return;
			}
			const num = parseFloat(this.newChapterNumberInput.value);
			const title = this.newChapterTitleInput.value.trim() || `Chapter ${num || 1}`;
			if (isNaN(num)) {
				this.showToast('Please enter a valid chapter number.', true);
				this.newChapterNumberInput.focus();
				return;
			}
			this.confirmChapterModalBtn.disabled = true;
			this.confirmChapterModalBtn.textContent = 'Creating...';
			try {
				const chapter = await this.client.createChapter(this.selectedBookId, { title, chapterNumber: num });
				closeChapterModal();
				this.showToast(`Created chapter: ${title}`);
				await this.loadChapters(this.selectedBookId, chapter.id);
			} catch (e: any) {
				this.confirmChapterModalBtn.disabled = false;
				this.confirmChapterModalBtn.textContent = 'Create Chapter';
				this.showToast(`Failed: ${e.message || 'Server error'}`, true);
			}
		};

		this.confirmChapterModalBtn.addEventListener('click', submitChapterCreation);
		this.newChapterTitleInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submitChapterCreation();
			}
		});
		this.newChapterNumberInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submitChapterCreation();
			}
		});

		// Global Escape key to close modals
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				closeBookModal();
				closeChapterModal();
			}
		});

		// Selection Controls
		this.selectAllCheckbox.addEventListener('change', () => {
			const checked = this.selectAllCheckbox.checked;
			this.images.forEach(img => (img.selected = checked));
			this.renderGallery();
			this.updateSelectionSummary();
		});

		this.fastScanBtn.addEventListener('click', async () => {
			this.fastScanBtn.disabled = true;
			this.fastScanBtn.innerHTML = `
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
				</svg>
				Scanning...
			`;
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, { type: 'FAST_SCROLL_PRELOAD' }, (res: any) => {
					void chrome.runtime.lastError;
					this.fastScanBtn.disabled = false;
					this.fastScanBtn.innerHTML = `
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
						</svg>
						Fast Scan
					`;
					if (res && res.images) {
						this.images = sortImagesByCoordinates(
							res.images.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height))
						);
						this.metadata = res.metadata || {};
						this.renderGallery();
						this.updateSelectionSummary();
						this.showToast(`Found ${this.images.length} pages`);
					}
				});
			}
		});

		this.autoTranslateCheckbox.addEventListener('change', () => {
			chrome.storage.local.set({ autoTranslate: this.autoTranslateCheckbox.checked });
		});

		this.cancelImportBtn.addEventListener('click', () => {
			chrome.runtime.sendMessage({ type: 'CANCEL_IMPORT_JOB' }, () => {
				void chrome.runtime.lastError;
			});
			this.onImportCancelled();
		});

		this.startImportBtn.addEventListener('click', () => this.startBatchImport());
	}

	private showToast(msg: string, isError = false) {
		this.toast.textContent = msg;
		this.toast.classList.toggle('error', isError);
		this.toast.classList.add('show');
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			this.toast.classList.remove('show');
			this.toast.classList.remove('error');
		}, 3000);
	}

	private async checkServerStatus() {
		try {
			await this.client.checkHealth();
			this.statusDot.className = 'status-dot active';
			this.statusText.textContent = 'Online';
			await this.loadBooks();
		} catch {
			this.statusDot.className = 'status-dot error';
			this.statusText.textContent = 'Offline';
			this.bookLabel.textContent = 'Server Offline';
			this.bookDropdown.innerHTML = '<div class="custom-select-option" style="opacity:0.6">Server Unreachable</div>';
		}
	}

	private async loadBooks(selectedBookId?: string | number) {
		try {
			this.books = await this.client.getBooks();
			this.bookDropdown.innerHTML = '';

			let matchedBookId = selectedBookId;

			// Match from metadata title
			if (!matchedBookId && this.metadata.seriesTitle) {
				const match = this.books.find(
					b => b.title.toLowerCase() === this.metadata.seriesTitle!.toLowerCase()
				);
				if (match) matchedBookId = match.id;
			}

			// Match from last stored book
			if (!matchedBookId) {
				const stored = await chrome.storage.local.get(['lastBookId']);
				if (stored.lastBookId && this.books.some(b => String(b.id) === String(stored.lastBookId))) {
					matchedBookId = stored.lastBookId;
				}
			}

			if (this.books.length === 0) {
				this.bookLabel.textContent = 'No series found (+ to add)';
				return;
			}

			for (const book of this.books) {
				const btn = document.createElement('button');
				btn.className = 'custom-select-option';
				btn.type = 'button';
				btn.dataset.value = String(book.id);
				const lang = (book.sourceLang || 'ZH').toUpperCase();
				const displayTitle = book.titleTarget || book.title;
				btn.textContent = `${displayTitle} [${lang}]`;

				btn.addEventListener('click', () => {
					this.selectBook(book.id);
				});

				this.bookDropdown.appendChild(btn);
			}

			if (matchedBookId) {
				this.selectBook(matchedBookId);
			} else {
				this.selectBook(this.books[0].id);
			}
		} catch (e) {
			console.error('Failed to load books:', e);
		}
	}

	private selectBook(bookId: string | number) {
		this.selectedBookId = bookId;
		const book = this.books.find(b => String(b.id) === String(bookId));
		if (book) {
			const lang = (book.sourceLang || 'ZH').toUpperCase();
			const displayTitle = book.titleTarget || book.title;
			this.bookLabel.textContent = `${displayTitle} [${lang}]`;
		}

		this.bookDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
			opt.classList.toggle('active', (opt as HTMLElement).dataset.value === String(bookId));
		});

		this.bookCustomSelect.classList.remove('open');
		this.loadChapters(bookId);
	}

	private async loadChapters(bookId: string | number, selectedChapterId?: number) {
		try {
			this.chapterBtn.disabled = false;
			this.newChapterBtn.disabled = false;
			this.chapters = await this.client.getChapters(bookId);
			this.chapterDropdown.innerHTML = '';

			let matchedChapterId = selectedChapterId;

			// Match from metadata chapter number
			if (!matchedChapterId && this.metadata.chapterNumber !== undefined) {
				const match = this.chapters.find(c => c.chapterNumber === this.metadata.chapterNumber);
				if (match) matchedChapterId = match.id;
			}

			if (this.chapters.length === 0) {
				this.chapterLabel.textContent = 'No chapters (+ to create)';
				this.selectedChapterId = null;
				this.updateImportButtonState();
				return;
			}

			for (const ch of this.chapters) {
				const btn = document.createElement('button');
				btn.className = 'custom-select-option';
				btn.type = 'button';
				btn.dataset.value = String(ch.id);
				const displayTitle = ch.titleTarget || ch.title || `Chapter ${ch.chapterNumber}`;
				btn.textContent = displayTitle;

				btn.addEventListener('click', () => {
					this.selectChapter(ch.id);
				});

				this.chapterDropdown.appendChild(btn);
			}

			if (matchedChapterId) {
				this.selectChapter(matchedChapterId);
			} else {
				this.selectChapter(this.chapters[0].id);
			}
		} catch (e) {
			console.error('Failed to load chapters:', e);
		}
	}

	private selectChapter(chapterId: number) {
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

		// Ensure content script is injected into the active tab
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

		const sendScan = () => {
			chrome.tabs.sendMessage(tab.id!, { type: 'SCAN_PAGE' }, (res: ScanPageResponse) => {
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
				this.images = sortImagesByCoordinates(
					raw.filter((img: ScannedImage) => !isPlaceholderImage(img.url, img.width, img.height))
				);
				this.metadata = res.metadata || {};

				if (this.images.length === 0) {
					this.galleryEmptyState.innerHTML = `
						<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="11" cy="11" r="8"/>
							<line x1="21" y1="21" x2="16.65" y2="16.65"/>
						</svg>
						<p>No reader images found.<br>Click <b>Fast Scan</b> to auto-scroll.</p>
					`;
				} else {
					this.renderGallery();
					this.updateSelectionSummary();
					if (this.books.length > 0 && !this.selectedBookId) {
						this.loadBooks();
					}
				}
			});
		};

		sendScan();
	}

	private renumberGalleryCards() {
		const cards = this.galleryGrid.querySelectorAll('.thumb-card');
		cards.forEach((card, index) => {
			const indexLabel = card.querySelector('.thumb-index');
			if (indexLabel) {
				indexLabel.textContent = `#${index + 1}`;
			}
		});
	}

	private renderGallery() {
		if (this.images.length === 0) {
			this.galleryEmptyState.classList.remove('hidden');
			this.galleryGrid.classList.add('hidden');
			return;
		}

		this.galleryEmptyState.classList.add('hidden');
		this.galleryGrid.classList.remove('hidden');
		this.galleryGrid.innerHTML = '';

		this.images.forEach((img, idx) => {
			const card = document.createElement('div');
			card.className = `thumb-card ${img.selected ? 'selected' : ''}`;

			const indexLabel = document.createElement('span');
			indexLabel.className = 'thumb-index mono';
			indexLabel.textContent = `#${idx + 1}`;

			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'thumb-checkbox';
			checkbox.checked = !!img.selected;

			const image = document.createElement('img');
			image.src = img.url;
			image.loading = 'lazy';

			const dimLabel = document.createElement('div');
			dimLabel.className = 'thumb-dim mono';
			dimLabel.textContent = img.width && img.height ? `${img.width}×${img.height}` : 'HD';

			image.onload = () => {
				if (image.naturalWidth > 0 && image.naturalHeight > 0) {
					// Drop tiny blur placeholders (< 100px)
					if (image.naturalWidth < 100 && image.naturalHeight < 100) {
						this.images = this.images.filter(i => i !== img);
						card.remove();
						this.renumberGalleryCards();
						this.updateSelectionSummary();
						return;
					}
					dimLabel.textContent = `${image.naturalWidth}×${image.naturalHeight}`;
					img.width = image.naturalWidth;
					img.height = image.naturalHeight;
				}
			};

			image.onerror = () => {
				this.images = this.images.filter(i => i !== img);
				card.remove();
				this.renumberGalleryCards();
				this.updateSelectionSummary();
			};

			card.appendChild(image);
			card.appendChild(indexLabel);
			card.appendChild(checkbox);
			card.appendChild(dimLabel);

			card.addEventListener('click', (e) => {
				if (e.target !== checkbox) {
					img.selected = !img.selected;
					checkbox.checked = img.selected;
				} else {
					img.selected = checkbox.checked;
				}
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
		const isValid = !!this.selectedBookId && !!this.selectedChapterId && selectedCount > 0;
		this.startImportBtn.disabled = !isValid;
		this.importBtnText.textContent = `Import ${selectedCount} Page${selectedCount === 1 ? '' : 's'}`;
	}

	private async startBatchImport() {
		if (!this.selectedBookId || !this.selectedChapterId) return;
		const selectedUrls = this.images.filter(i => i.selected).map(i => i.url);
		if (selectedUrls.length === 0) return;

		this.startImportBtn.disabled = true;
		this.progressContainer.classList.remove('hidden');
		this.updateProgress(0, selectedUrls.length);

		chrome.runtime.sendMessage({
			type: 'START_IMPORT_JOB',
			payload: {
				bookId: this.selectedBookId,
				chapterId: this.selectedChapterId,
				imageUrls: selectedUrls,
				autoTranslate: this.autoTranslateCheckbox.checked
			},
			refererUrl: this.currentUrl
		}, () => {
			void chrome.runtime.lastError;
		});
	}

	private updateProgress(current: number, total: number) {
		this.progressStatusText.textContent = `Uploading ${current} of ${total} pages...`;
		this.progressCountText.textContent = `${current} / ${total}`;
		const pct = total > 0 ? (current / total) * 100 : 0;
		this.progressBarFill.style.width = `${pct}%`;
	}

	private onImportComplete(count: number, chapterId?: number, _bookId?: string | number) {
		this.progressContainer.classList.add('hidden');
		this.startImportBtn.disabled = false;
		this.showToast(`Imported ${count} pages to Chapter #${chapterId || ''}`);
	}

	private onImportCancelled() {
		this.progressContainer.classList.add('hidden');
		this.startImportBtn.disabled = false;
		this.showToast('Upload cancelled');
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const controller = new PopupController();
	controller.init();
});
