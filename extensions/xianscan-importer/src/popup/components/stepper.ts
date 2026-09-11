// -- PIPELINE PROGRESS STEPPER COMPONENT -- //

// -- STEPPER CLASS -- //

// -- STEPPER CONFIGURATION INTERFACE -- //

export interface StepperConfig {
	hasReslice?: boolean;
	hasTranslate?: boolean;
}

export class StepperComponent {
	private stepUpload: HTMLElement;
	private stepUploadName: HTMLElement;
	private stepUploadMeta: HTMLElement;
	private stepReslice: HTMLElement;
	private stepResliceName: HTMLElement;
	private stepResliceMeta: HTMLElement;
	private stepTranslate: HTMLElement;
	private stepTranslateName: HTMLElement;
	private stepTranslateMeta: HTMLElement;
	private stepConnector1: HTMLElement;
	private stepConnector2: HTMLElement;

	private hasReslice = true;
	private hasTranslate = true;

	constructor() {
		const $ = (id: string) => document.getElementById(id) || document.createElement('div');
		this.stepUpload = $('stepUpload');
		this.stepUploadName = $('stepUploadName');
		this.stepUploadMeta = $('stepUploadMeta');
		this.stepReslice = $('stepReslice');
		this.stepResliceName = $('stepResliceName');
		this.stepResliceMeta = $('stepResliceMeta');
		this.stepTranslate = $('stepTranslate');
		this.stepTranslateName = $('stepTranslateName');
		this.stepTranslateMeta = $('stepTranslateMeta');
		this.stepConnector1 = $('stepConnector1');
		this.stepConnector2 = $('stepConnector2');
		this.renderStepVisibility();
	}

	configureSteps(config: StepperConfig): void {
		let changed = false;
		if (config.hasReslice !== undefined && config.hasReslice !== this.hasReslice) {
			this.hasReslice = config.hasReslice;
			changed = true;
		}
		if (config.hasTranslate !== undefined && config.hasTranslate !== this.hasTranslate) {
			this.hasTranslate = config.hasTranslate;
			changed = true;
		}
		if (changed) {
			this.renderStepVisibility();
		}
	}

	private renderStepVisibility(): void {
		let stepIndex = 1;
		if (this.stepUploadName) {
			this.stepUploadName.textContent = `${stepIndex}. Upload`;
		}

		if (this.stepReslice) {
			this.stepReslice.style.display = this.hasReslice ? '' : 'none';
		}
		if (this.stepTranslate) {
			this.stepTranslate.style.display = this.hasTranslate ? '' : 'none';
		}

		const visibleCount = 1 + (this.hasReslice ? 1 : 0) + (this.hasTranslate ? 1 : 0);

		if (this.hasReslice) {
			stepIndex++;
			if (this.stepResliceName) {
				this.stepResliceName.textContent = `${stepIndex}. Reslice`;
			}
		}

		if (this.hasTranslate) {
			stepIndex++;
			if (this.stepTranslateName) {
				this.stepTranslateName.textContent = `${stepIndex}. Translate`;
			}
		}

		if (visibleCount === 1) {
			if (this.stepConnector1) this.stepConnector1.style.display = 'none';
			if (this.stepConnector2) this.stepConnector2.style.display = 'none';
		} else if (visibleCount === 2) {
			if (this.stepConnector1) this.stepConnector1.style.display = '';
			if (this.stepConnector2) this.stepConnector2.style.display = 'none';
		} else {
			if (this.stepConnector1) this.stepConnector1.style.display = '';
			if (this.stepConnector2) this.stepConnector2.style.display = '';
		}
	}

	update(phase: string, current: number, total: number, isResliced = false): void {
		if (phase === 'reslicing' || isResliced) {
			if (!this.hasReslice) {
				this.hasReslice = true;
				this.renderStepVisibility();
			}
		}
		if (phase === 'translating') {
			if (!this.hasTranslate) {
				this.hasTranslate = true;
				this.renderStepVisibility();
			}
		}

		const isUploading = phase === 'uploading';
		const isReslicing = phase === 'reslicing';
		const isTranslating = phase === 'translating';
		const isDone = phase === 'done' || (isTranslating && current === total && total > 0);
		const isUploaded = phase === 'uploaded' || (!isUploading && total > 0);
		const isResliceDone = isResliced || isTranslating || isDone;

		// STEP 1: UPLOAD
		this.stepUpload.classList.toggle('active', isUploading);
		this.stepUpload.classList.toggle('done', !isUploading && (isUploaded || isReslicing || isTranslating || isDone));
		if (isUploading) {
			this.stepUploadMeta.textContent = `${current}/${total || '?'}`;
		} else if (isUploaded || isReslicing || isTranslating || isDone) {
			this.stepUploadMeta.textContent = 'Completed';
		} else {
			this.stepUploadMeta.textContent = 'Queued';
		}

		// STEP 2: RESLICE
		this.stepReslice.classList.toggle('active', isReslicing);
		this.stepReslice.classList.toggle('done', !isReslicing && isResliceDone);
		if (isReslicing) {
			this.stepResliceMeta.textContent = 'Running';
		} else if (isResliceDone) {
			this.stepResliceMeta.textContent = 'Completed';
		} else {
			this.stepResliceMeta.textContent = isResliced === false && phase === 'idle' ? 'Skipped' : 'Queued';
		}

		// STEP 3: TRANSLATE
		this.stepTranslate.classList.toggle('active', isTranslating && !isDone);
		this.stepTranslate.classList.toggle('done', isDone);
		if (isTranslating && !isDone) {
			this.stepTranslateMeta.textContent = `${current}/${total || '?'}`;
		} else if (isDone) {
			this.stepTranslateMeta.textContent = 'Ready';
		} else if (phase === 'idle' && current > 0 && total > 0) {
			this.stepTranslateMeta.textContent = `${current}/${total}`;
		} else {
			this.stepTranslateMeta.textContent = 'Queued';
		}
	}
}
