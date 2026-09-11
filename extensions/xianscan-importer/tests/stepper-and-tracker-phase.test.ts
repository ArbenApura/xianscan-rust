// @vitest-environment jsdom
// -- TESTS FOR STEPPER AND TRACKER PHASE TRANSITIONS -- //

// IMPORTED MODULES
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepperComponent } from '../src/popup/components/stepper';
import { TrackerViewController } from '../src/popup/views/tracker-view';
import type { XianScanClient } from '../src/api';
import type { ToastComponent } from '../src/popup/components/toast';

describe('StepperComponent phase transitions', () => {
	beforeEach(() => {
		document.body.innerHTML = `
			<div class="stepper-step" id="stepUpload">
				<span class="step-name" id="stepUploadName">1. Upload</span>
				<span id="stepUploadMeta">Waiting</span>
			</div>
			<div class="stepper-connector" id="stepConnector1"></div>
			<div class="stepper-step" id="stepReslice">
				<span class="step-name" id="stepResliceName">2. Reslice</span>
				<span id="stepResliceMeta">Waiting</span>
			</div>
			<div class="stepper-connector" id="stepConnector2"></div>
			<div class="stepper-step" id="stepTranslate">
				<span class="step-name" id="stepTranslateName">3. Translate</span>
				<span id="stepTranslateMeta">Waiting</span>
			</div>
		`;
	});

	it('hides translate step when auto-translate is disabled', () => {
		const stepper = new StepperComponent();
		stepper.configureSteps({ hasReslice: true, hasTranslate: false });

		expect(document.getElementById('stepUpload')!.style.display).toBe('');
		expect(document.getElementById('stepReslice')!.style.display).toBe('');
		expect(document.getElementById('stepTranslate')!.style.display).toBe('none');

		expect(document.getElementById('stepUploadName')!.textContent).toBe('1. Upload');
		expect(document.getElementById('stepResliceName')!.textContent).toBe('2. Reslice');
		expect(document.getElementById('stepConnector1')!.style.display).toBe('');
		expect(document.getElementById('stepConnector2')!.style.display).toBe('none');
	});

	it('hides reslice step and renumbers translate when auto-reslice is disabled', () => {
		const stepper = new StepperComponent();
		stepper.configureSteps({ hasReslice: false, hasTranslate: true });

		expect(document.getElementById('stepUpload')!.style.display).toBe('');
		expect(document.getElementById('stepReslice')!.style.display).toBe('none');
		expect(document.getElementById('stepTranslate')!.style.display).toBe('');

		expect(document.getElementById('stepUploadName')!.textContent).toBe('1. Upload');
		expect(document.getElementById('stepTranslateName')!.textContent).toBe('2. Translate');
		expect(document.getElementById('stepConnector1')!.style.display).toBe('');
		expect(document.getElementById('stepConnector2')!.style.display).toBe('none');
	});

	it('hides both reslice and translate when both are disabled', () => {
		const stepper = new StepperComponent();
		stepper.configureSteps({ hasReslice: false, hasTranslate: false });

		expect(document.getElementById('stepUpload')!.style.display).toBe('');
		expect(document.getElementById('stepReslice')!.style.display).toBe('none');
		expect(document.getElementById('stepTranslate')!.style.display).toBe('none');

		expect(document.getElementById('stepUploadName')!.textContent).toBe('1. Upload');
		expect(document.getElementById('stepConnector1')!.style.display).toBe('none');
		expect(document.getElementById('stepConnector2')!.style.display).toBe('none');
	});

	it('dynamically makes reslice visible if reslicing starts mid-flight', () => {
		const stepper = new StepperComponent();
		stepper.configureSteps({ hasReslice: false, hasTranslate: false });
		expect(document.getElementById('stepReslice')!.style.display).toBe('none');

		stepper.update('reslicing', 0, 16);
		expect(document.getElementById('stepReslice')!.style.display).toBe('');
		expect(document.getElementById('stepResliceName')!.textContent).toBe('2. Reslice');
		expect(document.getElementById('stepConnector1')!.style.display).toBe('');
	});

	it('reflects active uploading phase', () => {
		const stepper = new StepperComponent();
		stepper.update('uploading', 8, 16);

		const upload = document.getElementById('stepUpload')!;
		const reslice = document.getElementById('stepReslice')!;
		const translate = document.getElementById('stepTranslate')!;

		expect(upload.classList.contains('active')).toBe(true);
		expect(upload.classList.contains('done')).toBe(false);
		expect(document.getElementById('stepUploadMeta')!.textContent).toBe('8/16');

		expect(reslice.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepResliceMeta')!.textContent).toBe('Queued');

		expect(translate.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepTranslateMeta')!.textContent).toBe('Queued');
	});

	it('reflects active reslicing phase', () => {
		const stepper = new StepperComponent();
		stepper.update('reslicing', 0, 16);

		const upload = document.getElementById('stepUpload')!;
		const reslice = document.getElementById('stepReslice')!;
		const translate = document.getElementById('stepTranslate')!;

		expect(upload.classList.contains('done')).toBe(true);
		expect(upload.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepUploadMeta')!.textContent).toBe('Completed');

		expect(reslice.classList.contains('active')).toBe(true);
		expect(reslice.classList.contains('done')).toBe(false);
		expect(document.getElementById('stepResliceMeta')!.textContent).toBe('Running');

		expect(translate.classList.contains('active')).toBe(false);
	});

	it('reflects completed upload when reslice and translate are disabled', () => {
		const stepper = new StepperComponent();
		stepper.update('idle', 0, 16, false);

		const upload = document.getElementById('stepUpload')!;
		const reslice = document.getElementById('stepReslice')!;
		const translate = document.getElementById('stepTranslate')!;

		expect(upload.classList.contains('done')).toBe(true);
		expect(upload.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepUploadMeta')!.textContent).toBe('Completed');

		expect(reslice.classList.contains('done')).toBe(false);
		expect(reslice.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepResliceMeta')!.textContent).toBe('Skipped');

		expect(translate.classList.contains('done')).toBe(false);
		expect(translate.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepTranslateMeta')!.textContent).toBe('Queued');
	});

	it('reflects completed reslice when auto-translate is disabled', () => {
		const stepper = new StepperComponent();
		stepper.update('idle', 0, 16, true);

		const upload = document.getElementById('stepUpload')!;
		const reslice = document.getElementById('stepReslice')!;
		const translate = document.getElementById('stepTranslate')!;

		expect(upload.classList.contains('done')).toBe(true);
		expect(upload.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepUploadMeta')!.textContent).toBe('Completed');

		expect(reslice.classList.contains('done')).toBe(true);
		expect(reslice.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepResliceMeta')!.textContent).toBe('Completed');

		expect(translate.classList.contains('done')).toBe(false);
		expect(translate.classList.contains('active')).toBe(false);
		expect(document.getElementById('stepTranslateMeta')!.textContent).toBe('Queued');
	});

	it('reflects complete translation', () => {
		const stepper = new StepperComponent();
		stepper.update('done', 16, 16, true);

		expect(document.getElementById('stepUpload')!.classList.contains('done')).toBe(true);
		expect(document.getElementById('stepReslice')!.classList.contains('done')).toBe(true);
		expect(document.getElementById('stepTranslate')!.classList.contains('done')).toBe(true);
		expect(document.getElementById('stepTranslateMeta')!.textContent).toBe('Ready');
	});
});

describe('TrackerViewController handleImportComplete', () => {
	let mockClient: Partial<XianScanClient>;
	let mockToast: Partial<ToastComponent>;
	let stepper: StepperComponent;
	let controller: TrackerViewController;

	beforeEach(() => {
		// MOCK CHROME STORAGE AND RUNTIME APIS
		(global as any).chrome = {
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({}),
					set: vi.fn().mockResolvedValue({})
				}
			},
			runtime: {
				sendMessage: vi.fn((_msg, cb) => cb && cb()),
				lastError: null
			}
		};

		document.body.innerHTML = `
			<div id="trackerView">
				<span id="trackerBookTitle"></span>
				<span id="trackerChapterTitle"></span>
				<span id="trackerStatusBadge" class="tracker-badge uploading">Uploading</span>
				<input type="checkbox" id="trackerInPlaceCheckbox" />
				<span id="trackerSummaryText"></span>
				<div id="trackerGrid"></div>
				<div id="trackerProgressWrap" class="progress-wrap">
					<span id="trackerProgressStatus">Uploading page 16 of 16...</span>
					<span id="trackerProgressCount">16 / 16</span>
					<div id="trackerProgressBarFill" style="width: 100%;"></div>
					<button id="cancelJobBtn"></button>
				</div>
				<div class="stepper-step" id="stepUpload">
					<span id="stepUploadMeta">Waiting</span>
				</div>
				<div class="stepper-step" id="stepReslice">
					<span id="stepResliceMeta">Waiting</span>
				</div>
				<div class="stepper-step" id="stepTranslate">
					<span id="stepTranslateMeta">Waiting</span>
				</div>
				<button id="trackerOpenStudioBtn"></button>
				<button id="trackerSyncTabBtn"></button>
				<button id="trackerRetryBtn" class="hidden"></button>
			</div>
		`;

		mockClient = {
			getBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:8124'),
			getChapterDetails: vi.fn().mockResolvedValue({
				chapter: { id: 1, bookId: '1', title: 'Chapter 1' },
				pages: [
					{ id: 101, seq: 0, status: 'pending', outputRev: 0 },
					{ id: 102, seq: 1, status: 'pending', outputRev: 0 }
				],
				isTranslating: false
			}),
			getBooks: vi.fn().mockResolvedValue([{ id: '1', title: 'My Comic' }])
		};

		mockToast = {
			show: vi.fn()
		};

		stepper = new StepperComponent();
		controller = new TrackerViewController(mockClient as any, mockToast as any, stepper);
	});

	it('hides progress bar and sets Idle state when reslice and translate are disabled', () => {
		controller.updateProgress(16, 16, 'uploading');
		const progressWrap = document.getElementById('trackerProgressWrap')!;
		expect(progressWrap.classList.contains('hidden')).toBe(false);

		controller.handleImportComplete({
			autoReslice: false,
			autoTranslate: false,
			total: 16,
			current: 16
		});

		expect(progressWrap.classList.contains('hidden')).toBe(true);
		const badge = document.getElementById('trackerStatusBadge')!;
		expect(badge.textContent).toBe('Idle');
		expect(badge.className).toBe('tracker-badge');

		const uploadMeta = document.getElementById('stepUploadMeta')!;
		expect(uploadMeta.textContent).toBe('Completed');
		const resliceMeta = document.getElementById('stepResliceMeta')!;
		expect(resliceMeta.textContent).toBe('Skipped');
	});

	it('hides progress bar and sets Idle state with completed reslice when auto-translate is disabled', () => {
		controller.updateProgress(16, 16, 'reslicing');
		const progressWrap = document.getElementById('trackerProgressWrap')!;
		expect(progressWrap.classList.contains('hidden')).toBe(false);

		controller.handleImportComplete({
			autoReslice: true,
			autoTranslate: false,
			total: 16,
			current: 16
		});

		expect(progressWrap.classList.contains('hidden')).toBe(true);
		const badge = document.getElementById('trackerStatusBadge')!;
		expect(badge.textContent).toBe('Idle');

		const uploadMeta = document.getElementById('stepUploadMeta')!;
		expect(uploadMeta.textContent).toBe('Completed');
		const resliceMeta = document.getElementById('stepResliceMeta')!;
		expect(resliceMeta.textContent).toBe('Completed');
	});
});
