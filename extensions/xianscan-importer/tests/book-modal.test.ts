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
						<button class="custom-select-option mono" type="button" data-value="zh-Hans">Chinese (Simplified)</button>
						<button class="custom-select-option mono" type="button" data-value="ko">Korean</button>
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
});
