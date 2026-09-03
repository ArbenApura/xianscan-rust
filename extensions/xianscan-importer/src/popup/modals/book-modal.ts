// -- BOOK CREATION MODAL CONTROLLER -- //

// IMPORTED MODULES
import { XianScanClient } from '../../api';
import { ModalComponent } from '../components/modal';
import { ToastComponent } from '../components/toast';
import { CustomSelectComponent } from '../components/custom-select';

// -- BOOK MODAL CLASS -- //

export class BookModalController {
	private modal: ModalComponent;
	private client: XianScanClient;
	private toast: ToastComponent;

	private titleInput: HTMLInputElement;
	private titleTargetInput: HTMLInputElement;
	private translateTitleBtn: HTMLButtonElement;
	private translateTitleIcon: HTMLElement;
	private translateTitleSpinner: HTMLElement;

	private sourceLangSelect: CustomSelectComponent;
	private targetLangSelect: CustomSelectComponent;
	private confirmBtn: HTMLButtonElement;

	private selectedSourceLang = 'zh-Hans';
	private selectedTargetLang = 'en';
	private onCreatedCallback?: (newBookId: string | number) => void;

	constructor(client: XianScanClient, toast: ToastComponent, onCreated?: (newBookId: string | number) => void) {
		this.client = client;
		this.toast = toast;
		this.onCreatedCallback = onCreated;

		this.modal = new ModalComponent('bookModalOverlay', 'closeBookModalBtn', 'cancelBookModalBtn');

		this.titleInput = document.getElementById('newBookTitleInput') as HTMLInputElement;
		this.titleTargetInput = document.getElementById('newBookTitleTargetInput') as HTMLInputElement;
		this.translateTitleBtn = document.getElementById('translateBookTitleBtn') as HTMLButtonElement;
		this.translateTitleIcon = document.getElementById('translateBookTitleIcon') as HTMLElement;
		this.translateTitleSpinner = document.getElementById('translateBookTitleSpinner') as HTMLElement;
		this.confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;

		this.sourceLangSelect = new CustomSelectComponent(
			'newBookLangCustomSelect',
			'newBookLangBtn',
			'newBookLangLabel',
			'newBookLangDropdown',
			(val) => {
				this.selectedSourceLang = val;
				if (this.selectedSourceLang === this.selectedTargetLang) {
					const fallbackTarget = this.selectedSourceLang === 'en' ? 'zh-Hans' : 'en';
					this.selectedTargetLang = fallbackTarget;
					this.targetLangSelect.select(fallbackTarget);
				}
			}
		);
		this.sourceLangSelect.bindStaticOptions('zh-Hans');

		this.targetLangSelect = new CustomSelectComponent(
			'newBookTargetLangCustomSelect',
			'newBookTargetLangBtn',
			'newBookTargetLangLabel',
			'newBookTargetLangDropdown',
			(val) => {
				this.selectedTargetLang = val;
			}
		);
		this.targetLangSelect.bindStaticOptions('en');

		this.bindEvents();
	}

	private bindEvents(): void {
		// AUTO-TRANSLATE SOURCE TITLE INTO TARGET TITLE
		this.translateTitleBtn.addEventListener('click', async () => {
			const src = this.titleInput.value.trim();
			if (!src) {
				this.toast.show('Enter a book title to translate.', true);
				return;
			}

			this.translateTitleBtn.disabled = true;
			this.translateTitleIcon.classList.add('hidden');
			this.translateTitleSpinner.classList.remove('hidden');

			try {
				const sourceLang = this.sourceLangSelect.getValue() || this.selectedSourceLang || 'zh-Hans';
				const targetLang = this.targetLangSelect.getValue() || this.selectedTargetLang || 'en';
				const res = await this.client.translateText({
					text: src,
					kind: 'title',
					sourceLang,
					targetLang
				});
				if (res?.text) {
					this.titleTargetInput.value = res.text;
					this.toast.show('Title translated!');
				} else {
					this.toast.show('Could not translate title.', true);
				}
			} catch (e: any) {
				this.toast.show(e?.message || 'Could not translate title.', true);
			} finally {
				this.translateTitleBtn.disabled = false;
				this.translateTitleSpinner.classList.add('hidden');
				this.translateTitleIcon.classList.remove('hidden');
			}
		});

		// CONFIRM AND CREATE BOOK
		this.confirmBtn.addEventListener('click', async () => {
			const title = this.titleInput.value.trim();
			if (!title) {
				this.toast.show('Please enter a book title.', true);
				this.titleInput.focus();
				return;
			}

			this.confirmBtn.disabled = true;
			this.confirmBtn.textContent = 'Creating...';

			try {
				const chosenSource = this.sourceLangSelect.getValue() || this.selectedSourceLang || 'zh-Hans';
				let targetLang = this.targetLangSelect.getValue() || this.selectedTargetLang || 'en';
				if (chosenSource === targetLang) {
					targetLang = chosenSource === 'en' ? 'zh-Hans' : 'en';
				}

				const created = await this.client.createBook({
					title,
					titleTarget: this.titleTargetInput.value.trim() || undefined,
					sourceLang: chosenSource,
					targetLang
				});

				this.close();
				this.toast.show(`Book "${created.title}" created`);
				this.onCreatedCallback?.(created.id);
			} catch (e: any) {
				this.confirmBtn.disabled = false;
				this.confirmBtn.textContent = 'Create Book';
				this.toast.show(e.message || 'Failed to create book', true);
			}
		});
	}

	open(initialTitle?: string, sourceLang?: string): void {
		this.titleInput.value = initialTitle || '';
		this.titleTargetInput.value = '';

		const sLang = sourceLang && sourceLang !== 'auto' ? sourceLang : 'zh-Hans';
		this.selectedSourceLang = sLang;
		this.sourceLangSelect.select(sLang);
		const tLang = sLang === 'en' ? 'zh-Hans' : 'en';
		this.selectedTargetLang = tLang;
		this.targetLangSelect.select(tLang);

		this.confirmBtn.disabled = false;
		this.confirmBtn.textContent = 'Create Book';
		this.modal.open();
		setTimeout(() => this.titleInput.focus(), 50);
	}

	close(): void {
		this.modal.close(() => {
			this.confirmBtn.disabled = false;
			this.confirmBtn.textContent = 'Create Book';
			this.translateTitleBtn.disabled = false;
			this.translateTitleIcon.classList.remove('hidden');
			this.translateTitleSpinner.classList.add('hidden');
		});
	}
}
