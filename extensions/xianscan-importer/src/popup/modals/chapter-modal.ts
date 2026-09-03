// -- CHAPTER CREATION MODAL CONTROLLER -- //

// IMPORTED MODULES
import { XianScanClient } from '../../api';
import { ModalComponent } from '../components/modal';
import { ToastComponent } from '../components/toast';

// -- CHAPTER MODAL CLASS -- //

export class ChapterModalController {
	private modal: ModalComponent;
	private client: XianScanClient;
	private toast: ToastComponent;

	private numberInput: HTMLInputElement;
	private titleInput: HTMLInputElement;
	private confirmBtn: HTMLButtonElement;
	private currentBookId: string | number | null = null;
	private onCreatedCallback?: (newChapterId: number) => void;

	constructor(client: XianScanClient, toast: ToastComponent, onCreated?: (newChapterId: number) => void) {
		this.client = client;
		this.toast = toast;
		this.onCreatedCallback = onCreated;

		this.modal = new ModalComponent('chapterModalOverlay', 'closeChapterModalBtn', 'cancelChapterModalBtn');

		this.numberInput = document.getElementById('newChapterNumberInput') as HTMLInputElement;
		this.titleInput = document.getElementById('newChapterTitleInput') as HTMLInputElement;
		this.confirmBtn = document.getElementById('confirmChapterModalBtn') as HTMLButtonElement;

		this.bindEvents();
	}

	private bindEvents(): void {
		this.numberInput.addEventListener('input', () => {
			const numStr = this.numberInput.value.trim();
			const currTitle = this.titleInput.value.trim();
			if (!currTitle || /^Chapter\s+\d+(\.\d+)?$/i.test(currTitle)) {
				this.titleInput.value = numStr ? `Chapter ${numStr}` : '';
			}
		});

		this.confirmBtn.addEventListener('click', async () => {
			if (!this.currentBookId) return;
			const chapterNumber = parseFloat(this.numberInput.value) || 1;
			const title = this.titleInput.value.trim() || `Chapter ${chapterNumber}`;

			this.confirmBtn.disabled = true;
			this.confirmBtn.textContent = 'Creating...';

			try {
				const created = await this.client.createChapter(this.currentBookId, {
					chapterNumber,
					title
				});
				this.close();
				this.toast.show(`Chapter "${title}" created`);
				this.onCreatedCallback?.(created.id);
			} catch (e: any) {
				this.confirmBtn.disabled = false;
				this.confirmBtn.textContent = 'Create Chapter';
				this.toast.show(e.message || 'Failed to create chapter', true);
			}
		});
	}

	open(bookId: string | number, defaultNumber: number, defaultTitle?: string): void {
		this.currentBookId = bookId;
		this.numberInput.value = String(defaultNumber);
		this.titleInput.value = defaultTitle || `Chapter ${defaultNumber}`;

		this.confirmBtn.disabled = false;
		this.confirmBtn.textContent = 'Create Chapter';
		this.modal.open();
		setTimeout(() => this.titleInput.focus(), 50);
	}

	close(): void {
		this.modal.close(() => {
			this.confirmBtn.disabled = false;
			this.confirmBtn.textContent = 'Create Chapter';
		});
	}
}
