// -- POPUP APPLICATION ENTRY POINT AND VIEW ORCHESTRATOR -- //

// IMPORTED TYPES
import type { ChapterMappingEntry } from './types';

// IMPORTED MODULES
import { XianScanClient } from './api';
import { ToastComponent } from './popup/components/toast';
import { StepperComponent } from './popup/components/stepper';
import { SettingsModalController } from './popup/modals/settings-modal';
import { BookModalController } from './popup/modals/book-modal';
import { ChapterModalController } from './popup/modals/chapter-modal';
import { ImportViewController } from './popup/views/import-view';
import { TrackerViewController } from './popup/views/tracker-view';

// -- POPUP CONTROLLER CLASS -- //

class PopupController {
	private client: XianScanClient;
	private toast: ToastComponent;
	private stepper: StepperComponent;

	private settingsModal: SettingsModalController;
	private bookModal: BookModalController;
	private chapterModal: ChapterModalController;

	private importView: ImportViewController;
	private trackerView: TrackerViewController;

	private serverStatusBadge: HTMLElement;
	private toggleSettingsBtn: HTMLElement;
	private currentUrl = '';
	private currentView: 'import' | 'tracker' = 'import';

	constructor() {
		this.client = new XianScanClient();
		this.toast = new ToastComponent('toast');
		this.stepper = new StepperComponent();

		this.serverStatusBadge = document.getElementById('serverStatusBadge') || document.createElement('span');
		this.toggleSettingsBtn = document.getElementById('toggleSettingsBtn') || document.createElement('button');

		this.settingsModal = new SettingsModalController(this.client, this.toast, async () => {
			await this.checkServerStatus();
			if (this.currentView === 'import') {
				await this.importView.loadBooks();
			}
		});

		this.bookModal = new BookModalController(this.client, this.toast, async (newBookId) => {
			await this.importView.loadBooks(newBookId);
		});

		this.chapterModal = new ChapterModalController(this.client, this.toast, async (newChapterId) => {
			const activeBookId = this.importView.getSelectedBookId();
			if (activeBookId) {
				await this.importView.loadChapters(activeBookId, newChapterId);
			}
		});

		this.importView = new ImportViewController(this.client, this.toast, {
			onStartImport: async (params) => {
				this.switchView('tracker');
				this.trackerView.updateProgress(0, params.imageUrls.length, 'uploading');
				const bTitle = document.getElementById('trackerBookTitle');
				const cTitle = document.getElementById('trackerChapterTitle');
				if (bTitle) bTitle.textContent = 'Active Book';
				if (cTitle) cTitle.textContent = params.chapterTitle;

				// IMMEDIATELY INITIALIZE TRACKER VIEW AND START LIVE POLLING
				void this.trackerView.loadAndRenderTracker(params.chapterId, params.bookId);

				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				const tabId = tab?.id;

				const mappingEntry: ChapterMappingEntry = {
					url: this.currentUrl,
					bookId: params.bookId,
					chapterId: params.chapterId,
					isResliced: !!params.autoReslice,
					pageCount: params.imageUrls.length,
					excludedImageUrls: params.excludedUrls,
					includedImageUrls: params.imageUrls,
					enabled: params.inPlaceReplacement !== false,
					lastSyncedAt: Date.now()
				};

				// DIRECTLY NOTIFY ACTIVE TAB OF NEW MAPPING SO IN-PLACE REPLACEMENT ENGAGES IMMEDIATELY
				if (tabId) {
					chrome.tabs.sendMessage(tabId, {
						type: 'SET_ACTIVE_MAPPING',
						entry: mappingEntry
					}, () => {
						void chrome.runtime.lastError;
					});
				}

				chrome.runtime.sendMessage({
					type: 'START_IMPORT_JOB',
					payload: {
						bookId: params.bookId,
						chapterId: params.chapterId,
						imageUrls: params.imageUrls,
						excludedImageUrls: params.excludedUrls,
						includedImageUrls: params.imageUrls,
						autoReslice: params.autoReslice,
						autoTranslate: params.autoTranslate
					},
					refererUrl: this.currentUrl
				}, () => {
					void chrome.runtime.lastError;
				});
			},
			onOpenBookModal: (meta) => {
				this.bookModal.open(meta.title, meta.sourceLang);
			},
			onOpenChapterModal: (meta) => {
				this.chapterModal.open(meta.bookId, meta.nextNumber, meta.defaultTitle);
			},
			onInPlaceChanged: (checked) => {
				this.handleInPlaceSync(checked);
			}
		});

		this.trackerView = new TrackerViewController(this.client, this.toast, this.stepper, {
			onSwitchToImport: async () => {
				this.switchView('import');
				await this.importView.scanActiveTab();
				await this.importView.loadBooks();
			},
			onInPlaceChanged: (checked) => {
				this.handleInPlaceSync(checked);
			}
		});
	}

	async init(): Promise<void> {
		this.bindHeaderEvents();

		const stored = await chrome.storage.local.get(['serverUrl', 'inPlaceReplacement']);
		if (stored.serverUrl) {
			this.client.setBaseUrl(stored.serverUrl);
		}

		const inPlace = stored.inPlaceReplacement === true;
		this.importView.updateInPlaceState(inPlace);
		this.trackerView.setInPlaceChecked(inPlace);

		await this.checkServerStatus();
		await this.determineInitialView();
		this.setupMessageListeners();
	}

	private bindHeaderEvents(): void {
		this.toggleSettingsBtn.addEventListener('click', () => {
			this.settingsModal.open(this.client.getBaseUrl());
		});
	}

	private handleInPlaceSync(checked: boolean): void {
		this.importView.updateInPlaceState(checked);
		this.trackerView.setInPlaceChecked(checked);
		chrome.storage.local.set({ inPlaceReplacement: checked });

		chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, {
					type: 'TOGGLE_MODE',
					mode: checked ? 'translated' : 'raw'
				}, () => void chrome.runtime.lastError);
			}
		});
	}

	private switchView(view: 'import' | 'tracker'): void {
		this.currentView = view;
		const importViewEl = document.getElementById('importView');
		const trackerViewEl = document.getElementById('trackerView');

		if (view === 'import') {
			this.trackerView.stopPolling();
			importViewEl?.classList.remove('hidden');
			trackerViewEl?.classList.add('hidden');
		} else {
			importViewEl?.classList.add('hidden');
			trackerViewEl?.classList.remove('hidden');
		}
	}

	private async determineInitialView(): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		this.currentUrl = tab?.url || '';
		this.importView.setCurrentUrl(this.currentUrl);
		this.trackerView.setCurrentUrl(this.currentUrl);

		// 1. CHECK RUNNING BACKGROUND IMPORT JOB FIRST
		const jobData = await chrome.storage.local.get(['activeImportJob']);
		if (jobData.activeImportJob && jobData.activeImportJob.running) {
			const job = jobData.activeImportJob;
			this.switchView('tracker');
			this.trackerView.updateProgress(job.current, job.total, 'uploading');
			void this.trackerView.loadAndRenderTracker(job.chapterId, job.bookId);
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
				this.switchView('tracker');
				void this.trackerView.loadAndRenderTracker(mapping.chapterId, mapping.bookId);
				return;
			}
		}

		// 3. DEFAULT: UNMAPPED TAB -> SHOW IMPORT VIEW AND SCAN TAB
		this.switchView('import');
		await this.importView.scanActiveTab();
		await this.importView.loadBooks();
	}

	private async checkServerStatus(): Promise<void> {
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

	private setupMessageListeners(): void {
		chrome.runtime.onMessage.addListener(msg => {
			if (msg.type === 'IMPORT_PROGRESS') {
				this.trackerView.updateProgress(msg.current, msg.total, 'uploading');
			} else if (msg.type === 'PIPELINE_PHASE') {
				if (msg.phase === 'reslicing') {
					this.trackerView.updateProgress(0, msg.total || 0, 'reslicing');
				} else if (msg.phase === 'translating') {
					this.trackerView.updateProgress(0, msg.total || 0, 'translating');
					if (msg.chapterId) {
						this.trackerView.startPolling(msg.chapterId);
					}
				}
			} else if (msg.type === 'PAGE_TRANSLATED') {
				this.trackerView.handlePageTranslated(msg.pageId, msg.pageSeq, msg.outputRev, msg.total);
			} else if (msg.type === 'CHAPTER_SYNC_UPDATE') {
				if (msg.status === 'resliced' && msg.pages) {
					this.trackerView.setPages(msg.pages);
				} else if (msg.status === 'done') {
					this.stepper.update('done', 1, 1);
					const statusBadge = document.getElementById('trackerStatusBadge');
					const summaryText = document.getElementById('trackerSummaryText');
					const progressWrap = document.getElementById('trackerProgressWrap');
					if (statusBadge) {
						statusBadge.className = 'tracker-badge ready';
						statusBadge.textContent = 'Ready';
					}
					if (summaryText) {
						summaryText.textContent = 'All pages translated & in-place synced';
					}
					progressWrap?.classList.add('hidden');
					this.toast.show('Chapter Translation Complete!');
					this.trackerView.stopPolling();
				}
			} else if (msg.type === 'IMPORT_COMPLETE') {
				if (msg.error) {
					this.toast.show(`Import failed: ${msg.error}`, true);
					this.switchView('import');
				} else {
					this.toast.show(`Imported ${msg.current} pages successfully`);
				}
			}
		});
	}
}

// -- DOM READY INITIALIZATION -- //

document.addEventListener('DOMContentLoaded', () => {
	const controller = new PopupController();
	void controller.init();
});
