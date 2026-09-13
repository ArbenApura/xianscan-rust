// @vitest-environment jsdom
// -- TESTS FOR BOOK MODAL CONTROLLER -- //

// IMPORTED MODULES
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookModalController } from '../src/popup/modals/book-modal';
import type { XianScanClient } from '../src/api';
import type { ToastComponent } from '../src/popup/components/toast';

// -- TEST SUITE -- //

describe('BookModalController', () => {
	let mockClient: Partial<XianScanClient>;
	let mockToast: Partial<ToastComponent>;
	let controller: BookModalController;

	beforeEach(() => {
		document.body.innerHTML = `
			<div id="bookModalOverlay" class="hidden">
				<button id="closeBookModalBtn"></button>
				<input id="newBookTitleInput" />
				<input id="newBookTitleTargetInput" />
				<button id="translateBookTitleBtn">
					<span id="translateBookTitleIcon"></span>
					<span id="translateBookTitleSpinner" class="hidden"></span>
				</button>
				<div class="custom-select" id="newBookLangCustomSelect">
					<button id="newBookLangBtn" class="custom-select-btn mono" type="button">
						<span id="newBookLangLabel">Chinese (Simplified - 简体中文)</span>
					</button>
					<div id="newBookLangDropdown" class="custom-select-dropdown">
						<button class="custom-select-option mono" type="button" data-value="ko">Korean</button>
						<button class="custom-select-option mono" type="button" data-value="ja">Japanese</button>
						<button class="custom-select-option mono active" type="button" data-value="zh-Hans">Chinese (Simplified)</button>
						<button class="custom-select-option mono" type="button" data-value="en">English</button>
					</div>
				</div>
				<div class="custom-select" id="newBookTargetLangCustomSelect">
					<button id="newBookTargetLangBtn" class="custom-select-btn mono" type="button">
						<span id="newBookTargetLangLabel">English</span>
					</button>
					<div id="newBookTargetLangDropdown" class="custom-select-dropdown">
						<button class="custom-select-option mono active" type="button" data-value="en">English</button>
						<button class="custom-select-option mono" type="button" data-value="zh-Hans">Chinese (Simplified - 简体中文)</button>
						<button class="custom-select-option mono" type="button" data-value="zh-Hant">Chinese (Traditional - 繁體中文)</button>
						<button class="custom-select-option mono" type="button" data-value="ja">Japanese (日本語)</button>
						<button class="custom-select-option mono" type="button" data-value="ko">Korean (한국어)</button>
						<button class="custom-select-option mono" type="button" data-value="es">Spanish (Español)</button>
						<button class="custom-select-option mono" type="button" data-value="fr">French (Français)</button>
						<button class="custom-select-option mono" type="button" data-value="de">German (Deutsch)</button>
						<button class="custom-select-option mono" type="button" data-value="ru">Russian (Русский)</button>
						<button class="custom-select-option mono" type="button" data-value="pt">Portuguese (Português)</button>
						<button class="custom-select-option mono" type="button" data-value="it">Italian (Italiano)</button>
						<button class="custom-select-option mono" type="button" data-value="id">Indonesian (Bahasa Indonesia)</button>
						<button class="custom-select-option mono" type="button" data-value="tr">Turkish (Türkçe)</button>
						<button class="custom-select-option mono" type="button" data-value="nl">Dutch (Nederlands)</button>
						<button class="custom-select-option mono" type="button" data-value="pl">Polish (Polski)</button>
						<button class="custom-select-option mono" type="button" data-value="th">Thai (ไทย)</button>
						<button class="custom-select-option mono" type="button" data-value="hi">Hindi (हिन्दी)</button>
						<button class="custom-select-option mono" type="button" data-value="uk">Ukrainian (Українська)</button>
						<button class="custom-select-option mono" type="button" data-value="sv">Swedish (Svenska)</button>
						<button class="custom-select-option mono" type="button" data-value="fi">Finnish (Suomi)</button>
					</div>
				</div>
				<button id="cancelBookModalBtn"></button>
				<button id="confirmBookModalBtn">Create Book</button>
			</div>
		`;

		mockClient = {
			createBook: vi.fn().mockResolvedValue({ id: '123', title: 'Test Novel' }),
			translateText: vi.fn().mockResolvedValue({ text: 'Translated Title' })
		};

		mockToast = {
			show: vi.fn()
		};

		controller = new BookModalController(mockClient as XianScanClient, mockToast as ToastComponent);
	});

	it('defaults source language to zh-Hans and target language to en upon creation', async () => {
		controller.open('Test Novel');

		const confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;
		confirmBtn.click();

		await Promise.resolve();

		expect(mockClient.createBook).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Test Novel',
			sourceLang: 'zh-Hans',
			targetLang: 'en'
		}));
	});

	it('falls back to zh-Hans when open is called with auto', async () => {
		controller.open('Another Novel', 'auto');

		const confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;
		confirmBtn.click();

		await Promise.resolve();

		expect(mockClient.createBook).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Another Novel',
			sourceLang: 'zh-Hans',
			targetLang: 'en'
		}));
	});

	it('honors explicitly passed source language such as ko', async () => {
		controller.open('Solo Leveling', 'ko');

		const confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;
		confirmBtn.click();

		await Promise.resolve();

		expect(mockClient.createBook).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Solo Leveling',
			sourceLang: 'ko',
			targetLang: 'en'
		}));
	});

	it('reads dynamically selected language when user changes dropdown option', async () => {
		controller.open('Manga Title');

		const jaOption = document.querySelector<HTMLButtonElement>('#newBookLangDropdown [data-value="ja"]');
		jaOption?.click();

		const confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;
		confirmBtn.click();

		await Promise.resolve();

		expect(mockClient.createBook).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Manga Title',
			sourceLang: 'ja',
			targetLang: 'en'
		}));
	});

	it('contains all 20 supported target languages in target dropdown', () => {
		const expectedTargetLangs = [
			'en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'ru',
			'pt', 'it', 'id', 'tr', 'nl', 'pl', 'th', 'hi', 'uk', 'sv', 'fi'
		];
		const renderedOptions = Array.from(
			document.querySelectorAll<HTMLButtonElement>('#newBookTargetLangDropdown .custom-select-option')
		).map(el => el.dataset.value);

		expect(renderedOptions).toHaveLength(20);
		for (const code of expectedTargetLangs) {
			expect(renderedOptions).toContain(code);
		}
	});

	it('honors dynamically selected target language such as Portuguese or Turkish', async () => {
		controller.open('Cultivation Chronicle', 'zh-Hans');

		const ptOption = document.querySelector<HTMLButtonElement>('#newBookTargetLangDropdown [data-value="pt"]');
		ptOption?.click();

		const confirmBtn = document.getElementById('confirmBookModalBtn') as HTMLButtonElement;
		confirmBtn.click();

		await Promise.resolve();

		expect(mockClient.createBook).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Cultivation Chronicle',
			sourceLang: 'zh-Hans',
			targetLang: 'pt'
		}));
	});
});

