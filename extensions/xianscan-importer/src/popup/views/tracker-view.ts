// -- POPUP TRACKER VIEW CONTROLLER -- //

// IMPORTED TYPES
import type { ChapterReaderPage, ChapterMappingEntry } from '../../types';

// IMPORTED MODULES
import { XianScanClient } from '../../api';
import { resolveSafeImageUrl } from '../../content/safe-image';
import { ToastComponent } from '../components/toast';
import { StepperComponent } from '../components/stepper';

// -- HELPER FUNCTIONS -- //

// BUILD LIGHTWEIGHT SERVER THUMBNAIL URL FOR SLICE CARD
export function buildSliceThumbnailUrl(
	baseUrl: string,
	pageId: number,
	target: 'output' | 'original',
	rev: number,
	width = 240
): string {
	const sanitizedBase = (baseUrl || '').replace(/\/+$/, '');
	return `${sanitizedBase}/api/pages/${pageId}/file?kind=thumb&target=${target}&w=${width}&rev=${rev}`;
}

// -- TRACKER VIEW CLASS -- //

export class TrackerViewController {
	private viewEl: HTMLElement;
	private client: XianScanClient;
	private toast: ToastComponent;
	private stepper: StepperComponent;

	private bookTitleEl: HTMLElement;
	private chapterTitleEl: HTMLElement;
	private statusBadgeEl: HTMLElement;
	private inPlaceCheckbox: HTMLInputElement;
	private summaryTextEl: HTMLElement;
	private gridEl: HTMLElement;

	private progressWrap: HTMLElement;
	private progressStatus: HTMLElement;
	private progressCount: HTMLElement;
	private progressBarFill: HTMLElement;
	private cancelBtn: HTMLButtonElement;

	private openStudioBtn: HTMLButtonElement;
	private syncTabBtn: HTMLButtonElement;
	private retryBtn: HTMLButtonElement;

	private activeChapterPages: ChapterReaderPage[] = [];
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private activePhase = 'idle';
	private isTranslating = false;
	private currentChapterId: number | null = null;
	private currentBookId: string | number | null = null;
	private currentUrl = '';

	private onSwitchToImport?: () => void;
	private onInPlaceChanged?: (checked: boolean) => void;

	constructor(
		client: XianScanClient,
		toast: ToastComponent,
		stepper: StepperComponent,
		callbacks: {
			onSwitchToImport?: () => void;
			onInPlaceChanged?: (checked: boolean) => void;
		} = {}
	) {
		this.client = client;
		this.toast = toast;
		this.stepper = stepper;
		this.onSwitchToImport = callbacks.onSwitchToImport;
		this.onInPlaceChanged = callbacks.onInPlaceChanged;

		const $ = (id: string) => document.getElementById(id) || document.createElement('div');
		this.viewEl = $('trackerView');
		this.bookTitleEl = $('trackerBookTitle');
		this.chapterTitleEl = $('trackerChapterTitle');
		this.statusBadgeEl = $('trackerStatusBadge');
		this.inPlaceCheckbox = document.getElementById('trackerInPlaceCheckbox') as HTMLInputElement;
		this.summaryTextEl = $('trackerSummaryText');
		this.gridEl = $('trackerGrid');

		this.progressWrap = $('trackerProgressWrap');
		this.progressStatus = $('trackerProgressStatus');
		this.progressCount = $('trackerProgressCount');
		this.progressBarFill = $('trackerProgressBarFill');
		this.cancelBtn = document.getElementById('cancelJobBtn') as HTMLButtonElement;

		this.openStudioBtn = document.getElementById('trackerOpenStudioBtn') as HTMLButtonElement;
		this.syncTabBtn = document.getElementById('trackerSyncTabBtn') as HTMLButtonElement;
		this.retryBtn = document.getElementById('trackerRetryBtn') as HTMLButtonElement;

		this.bindEvents();
	}

	private bindEvents(): void {
		this.inPlaceCheckbox.addEventListener('change', () => {
			this.onInPlaceChanged?.(this.inPlaceCheckbox.checked);
		});

		this.openStudioBtn.addEventListener('click', () => {
			if (this.currentBookId && this.currentChapterId) {
				const baseUrl = this.client.getBaseUrl();
				chrome.tabs.create({ url: `${baseUrl}/app/books/${this.currentBookId}/chapters/${this.currentChapterId}` });
			}
		});

		this.syncTabBtn.addEventListener('click', async () => {
			if (this.syncTabBtn.disabled) return;
			this.syncTabBtn.disabled = true;

			const originalContent = this.syncTabBtn.innerHTML;
			this.syncTabBtn.innerHTML = `
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

			if (this.currentChapterId) {
				await this.loadAndRenderTracker(this.currentChapterId, this.currentBookId ?? undefined);
			}

			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 1000 - elapsed);
			if (remaining > 0) {
				await new Promise(resolve => setTimeout(resolve, remaining));
			}

			this.syncTabBtn.disabled = false;
			this.syncTabBtn.innerHTML = originalContent;
			this.toast.show('Synced with Server');
		});

		this.cancelBtn.addEventListener('click', () => {
			if (this.currentChapterId) {
				void this.client.cancelTranslation(this.currentChapterId);
			}
			chrome.runtime.sendMessage({
				type: 'CANCEL_IMPORT_JOB',
				chapterId: this.currentChapterId
			}, () => {
				void chrome.runtime.lastError;
			});
			this.toast.show('Operation Cancelled');
			this.statusBadgeEl.className = 'tracker-badge';
			this.statusBadgeEl.textContent = 'Cancelled';
			this.progressWrap.classList.add('hidden');
			if (this.currentChapterId) {
				void this.loadAndRenderTracker(this.currentChapterId, this.currentBookId ?? undefined);
			}
		});

		this.retryBtn.addEventListener('click', async () => {
			if (!this.currentChapterId) return;
			const retryPageIds = this.activeChapterPages
				.filter(p => (p.status === 'pending' || p.status === 'error') && !(p.outputPath || (p.outputRev ?? 0) > 0))
				.map(p => p.id);
			if (retryPageIds.length === 0) {
				this.toast.show('No pending or failed pages to retry.', true);
				return;
			}

			this.retryBtn.disabled = true;
			try {
				let bookId = this.currentBookId ?? '';
				if (!bookId) {
					const details = await this.client.getChapterDetails(this.currentChapterId).catch(() => null);
					bookId = String(details?.chapter?.bookId ?? '');
				}
				const settings = await this.client.getSettings().catch(() => ({}));
				const res = await this.client.startBatchTranslation({
					bookId,
					bookTitle: this.bookTitleEl.textContent || '',
					chapterId: this.currentChapterId,
					settings
				});
				if (res?.success) {
					this.toast.show('Translation job started');
					this.startPolling(this.currentChapterId);
				}
			} catch (e: any) {
				this.toast.show(e?.message || 'Failed to start translation', true);
			} finally {
				this.retryBtn.disabled = false;
			}
		});
	}

	setInPlaceChecked(checked: boolean): void {
		this.inPlaceCheckbox.checked = checked;
	}

	setCurrentUrl(url: string): void {
		this.currentUrl = url;
	}

	async loadAndRenderTracker(chapterId: number, bookId?: string | number): Promise<void> {
		this.currentChapterId = chapterId;
		if (bookId) this.currentBookId = bookId;

		try {
			const details = await this.client.getChapterDetails(chapterId);
			if (!details || !details.chapter) {
				// CHAPTER REMOVED FROM SERVER: PURGE MAPPING
				await new Promise(resolve => {
					chrome.runtime.sendMessage({
						type: 'DELETE_SITE_MAPPING',
						url: this.currentUrl
					}, () => resolve(true));
				});
				this.onSwitchToImport?.();
				return;
			}

			this.activeChapterPages = details.pages || [];
			const total = this.activeChapterPages.length;
			const doneCount = this.activeChapterPages.filter(p => p.outputPath || (p.outputRev ?? 0) > 0).length;
			const isComplete = doneCount === total && total > 0;
			const isTranslating = details.isTranslating === true || details.jobStatus === 'running';
			this.isTranslating = isTranslating;

			this.chapterTitleEl.textContent = details.chapter.title || `Chapter #${chapterId}`;

			if (bookId) {
				const books = await this.client.getBooks().catch(() => []);
				const b = books.find(item => String(item.id) === String(bookId));
				this.bookTitleEl.textContent = (b?.titleTarget || b?.title) || 'Active Book';
			} else {
				this.bookTitleEl.textContent = 'Active Book';
			}

			if (isTranslating) {
				this.statusBadgeEl.className = 'tracker-badge translating';
				this.statusBadgeEl.textContent = `Translating ${doneCount}/${total}`;
				this.summaryTextEl.textContent = `${doneCount} / ${total} pages ready`;
				this.progressWrap.classList.remove('hidden');
				this.updateProgress(doneCount, total, 'translating');
				this.startPolling(chapterId);
			} else if (isComplete) {
				this.statusBadgeEl.className = 'tracker-badge ready';
				this.statusBadgeEl.textContent = 'Ready';
				this.summaryTextEl.textContent = `All ${total} pages translated`;
				this.progressWrap.classList.add('hidden');
				this.stepper.update('done', total, total);
				this.stopPolling();
			} else {
				this.statusBadgeEl.className = 'tracker-badge';
				this.statusBadgeEl.textContent = doneCount > 0 ? `Stopped (${doneCount}/${total})` : 'Idle';
				this.summaryTextEl.textContent = doneCount > 0 ? `${doneCount} of ${total} pages ready (Stopped)` : `${total} pages in chapter`;
				this.progressWrap.classList.add('hidden');
				if (doneCount < total && total > 0) {
					this.stepper.update('translating', doneCount, total);
					this.startPolling(chapterId);
				} else {
					this.stepper.update(isComplete ? 'done' : 'idle', doneCount, total);
					this.stopPolling();
				}
			}

			this.renderGrid();
		} catch (err) {
			console.error('Chapter not found:', err);
			await new Promise(resolve => {
				chrome.runtime.sendMessage({
					type: 'DELETE_SITE_MAPPING',
					url: this.currentUrl
				}, () => resolve(true));
			});
			this.onSwitchToImport?.();
		}
	}

	updateProgress(current: number, total: number, phase: string): void {
		this.activePhase = phase;
		this.progressWrap.classList.remove('hidden');
		const safeTotal = total > 0 ? total : this.activeChapterPages.length;
		const pct = safeTotal > 0 ? Math.min(100, Math.round((current / safeTotal) * 100)) : 0;
		this.progressBarFill.style.width = `${pct}%`;

		this.stepper.update(phase, current, safeTotal);

		if (phase === 'uploading') {
			this.progressCount.textContent = safeTotal > 0 ? `${current} / ${safeTotal}` : `${current}`;
			this.progressStatus.textContent = safeTotal > 0 ? `Uploading page ${current} of ${safeTotal}...` : 'Uploading pages...';
			this.statusBadgeEl.className = 'tracker-badge uploading';
			this.statusBadgeEl.textContent = 'Uploading';
		} else if (phase === 'reslicing') {
			this.progressBarFill.style.width = '100%';
			this.progressCount.textContent = safeTotal > 0 ? `${safeTotal} pages` : 'In Progress';
			this.progressStatus.textContent = safeTotal > 0 ? `Reslicing ${safeTotal} pages...` : 'Smart reslicing strips...';
			this.statusBadgeEl.className = 'tracker-badge reslicing';
			this.statusBadgeEl.textContent = 'Reslicing';
		} else if (phase === 'translating') {
			this.progressCount.textContent = safeTotal > 0 ? `${current} / ${safeTotal}` : `${current}`;
			this.progressStatus.textContent = safeTotal > 0 ? `Translating page ${current} of ${safeTotal}...` : 'Translating pages...';
			this.statusBadgeEl.className = 'tracker-badge translating';
			this.statusBadgeEl.textContent = safeTotal > 0 ? `Translating ${current}/${safeTotal}` : 'Translating';
		}

		if (this.activeChapterPages.length === 0) {
			this.renderGrid();
		}
	}

	renderGrid(): void {
		this.gridEl.innerHTML = '';
		if (this.activeChapterPages.length === 0) {
			if (this.activePhase === 'uploading') {
				this.retryBtn.classList.add('hidden');
				this.gridEl.innerHTML = `
					<div class="tracker-loading-state uploading" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<svg class="loading-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
								<path d="M12 2a10 10 0 0 1 10 10"/>
							</svg>
						</div>
						<div class="loading-title mono">Uploading Chapter Assets</div>
						<div class="loading-subtitle mono">Transferring pages to server chapter...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
			if (this.activePhase === 'reslicing') {
				this.retryBtn.classList.add('hidden');
				this.gridEl.innerHTML = `
					<div class="tracker-loading-state reslicing" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<svg class="loading-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
								<path d="M12 2a10 10 0 0 1 10 10"/>
							</svg>
						</div>
						<div class="loading-title mono">Detecting Seams & Reslicing</div>
						<div class="loading-subtitle mono">Dividing continuous strip into reader pages...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
			if (this.activePhase === 'translating') {
				this.retryBtn.classList.add('hidden');
				this.gridEl.innerHTML = `
					<div class="tracker-loading-state translating" style="grid-column: 1 / -1;">
						<div class="loading-scanner-ring">
							<svg class="loading-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
								<path d="M12 2a10 10 0 0 1 10 10"/>
							</svg>
						</div>
						<div class="loading-title mono">Translating & Typesetting</div>
						<div class="loading-subtitle mono">Running OCR, inpainting, and text rendering...</div>
						<div class="skeleton-grid">
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
							<div class="skeleton-card"></div>
						</div>
					</div>
				`;
				return;
			}
			this.gridEl.innerHTML = `
				<div class="empty-state" style="grid-column: 1 / -1; min-height: 120px;">
					<svg class="empty-vector" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
						<circle cx="9" cy="9" r="2"/>
						<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
					</svg>
					<p>No chapter pages uploaded yet.</p>
				</div>
			`;
			return;
		}

		let firstIncompleteIdx = -1;
		if (this.isTranslating) {
			firstIncompleteIdx = this.activeChapterPages.findIndex(
				p => !p.outputPath && (p.outputRev ?? 0) <= 0 && p.status !== 'done' && p.status !== 'error'
			);
		}

		this.activeChapterPages.forEach((page, idx) => {
			const card = document.createElement('div');
			const isReady = !!page.outputPath || (page.outputRev ?? 0) > 0 || page.status === 'done';
			const isError = page.status === 'error';
			const isProcessing = !isReady && !isError && (page.status === 'processing' || (this.isTranslating && idx === firstIncompleteIdx));

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
			img.loading = 'lazy';
			img.decoding = 'async';
			img.alt = `Slice #${idx + 1}`;

			const target = isReady ? 'output' : 'original';
			const rev = isReady ? (page.outputRev ?? 1) : (page.originalRev ?? 1);
			const targetUrl = buildSliceThumbnailUrl(this.client.getBaseUrl(), page.id, target, rev, 240);

			img.src = targetUrl;
			img.id = `slice-img-${page.id}`;
			void resolveSafeImageUrl(targetUrl).then(safeUrl => {
				if (safeUrl) img.src = safeUrl;
			});

			card.appendChild(img);
			this.gridEl.appendChild(card);
		});

		const hasRetryable = !this.isTranslating && this.activeChapterPages.some(
			p => (p.status === 'pending' || p.status === 'error') && !(p.outputPath || (p.outputRev ?? 0) > 0)
		);
		this.retryBtn.classList.toggle('hidden', !hasRetryable);
	}

	handlePageTranslated(pageId: number, pageSeq: number, outputRev: number, serverTotal?: number): void {
		// SYNCHRONIZE IN-MEMORY CONTROLLER STATE SO SUBSEQUENT RE-RENDERS PRESERVE READY STATUS
		const targetPage = this.activeChapterPages.find(p => p.id === pageId) || this.activeChapterPages[pageSeq];
		if (targetPage) {
			targetPage.status = 'done';
			targetPage.outputRev = outputRev;
			if (!targetPage.outputPath) targetPage.outputPath = 'ready';
		}

		const card = document.getElementById(`slice-card-${pageId}`);
		if (card) {
			card.className = 'slice-card ready';
		}

		const sliceBadge = document.getElementById(`slice-badge-${pageId}`);
		if (sliceBadge) {
			sliceBadge.className = 'slice-badge mono ready';
			sliceBadge.textContent = 'Ready';
		}

		const nextSeq = pageSeq + 1;
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

		const sliceImg = document.getElementById(`slice-img-${pageId}`) as HTMLImageElement;
		if (sliceImg) {
			const newUrl = buildSliceThumbnailUrl(this.client.getBaseUrl(), pageId, 'output', outputRev, 240);
			sliceImg.src = newUrl;
			void resolveSafeImageUrl(newUrl).then(safeUrl => {
				if (safeUrl) sliceImg.src = safeUrl;
			});
		}

		const hasPages = this.activeChapterPages.length > 0;
		const total = hasPages ? this.activeChapterPages.length : (serverTotal || 0);
		const doneCount = hasPages
			? this.activeChapterPages.filter(p => p.outputPath || (p.outputRev ?? 0) > 0 || p.status === 'done').length
			: Math.min(pageSeq + 1, total || (pageSeq + 1));

		if (total > 0) {
			if (doneCount >= total) {
				this.statusBadgeEl.className = 'tracker-badge ready';
				this.statusBadgeEl.textContent = 'Ready';
				this.summaryTextEl.textContent = `All ${total} pages translated`;
				this.progressWrap.classList.add('hidden');
				this.stepper.update('done', total, total);
				this.stopPolling();
			} else {
				this.statusBadgeEl.className = 'tracker-badge translating';
				this.statusBadgeEl.textContent = `Translating ${doneCount}/${total}`;
				this.summaryTextEl.textContent = `${doneCount} / ${total} pages ready`;
				this.updateProgress(doneCount, total, 'translating');
			}
		}
	}

	setPages(pages: ChapterReaderPage[]): void {
		this.activeChapterPages = pages;
		this.renderGrid();
	}

	startPolling(chapterId: number): void {
		this.stopPolling();

		chrome.runtime.sendMessage({
			type: 'ATTACH_LIVE_SSE',
			chapterId
		}, () => {
			void chrome.runtime.lastError;
		});

		this.pollingTimer = setInterval(async () => {
			if (!this.currentChapterId) {
				this.stopPolling();
				return;
			}

			try {
				const details = await this.client.getChapterDetails(chapterId);
				if (!details?.chapter) return;

				this.activeChapterPages = details.pages || [];
				const total = this.activeChapterPages.length;
				const doneCount = this.activeChapterPages.filter(p => p.outputPath || (p.outputRev ?? 0) > 0).length;
				const isComplete = doneCount === total && total > 0;
				const isTranslating = details.isTranslating === true || details.jobStatus === 'running';
				this.isTranslating = isTranslating;

				if (isTranslating) {
					this.statusBadgeEl.className = 'tracker-badge translating';
					this.statusBadgeEl.textContent = `Translating ${doneCount}/${total}`;
					this.summaryTextEl.textContent = `${doneCount} / ${total} pages ready`;
					this.updateProgress(doneCount, total, 'translating');
				} else if (isComplete) {
					this.statusBadgeEl.className = 'tracker-badge ready';
					this.statusBadgeEl.textContent = 'Ready';
					this.summaryTextEl.textContent = `All ${total} pages translated`;
					this.progressWrap.classList.add('hidden');
					this.stopPolling();
				} else {
					this.statusBadgeEl.className = 'tracker-badge';
					this.statusBadgeEl.textContent = doneCount > 0 ? `Stopped (${doneCount}/${total})` : 'Idle';
					this.summaryTextEl.textContent = doneCount > 0 ? `${doneCount} of ${total} pages ready (Stopped)` : `${total} pages in chapter`;
					this.progressWrap.classList.add('hidden');
					if (!isTranslating && doneCount > 0) {
						this.stopPolling();
					}
				}

				this.renderGrid();
			} catch {
				// SILENT POLLING FAILURE
			}
		}, 1500);
	}

	stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
	}
}
