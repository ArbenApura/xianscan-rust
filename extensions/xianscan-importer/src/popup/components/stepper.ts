// -- PIPELINE PROGRESS STEPPER COMPONENT -- //

// -- STEPPER CLASS -- //

export class StepperComponent {
	private stepUpload: HTMLElement;
	private stepUploadMeta: HTMLElement;
	private stepReslice: HTMLElement;
	private stepResliceMeta: HTMLElement;
	private stepTranslate: HTMLElement;
	private stepTranslateMeta: HTMLElement;

	constructor() {
		const $ = (id: string) => document.getElementById(id) || document.createElement('div');
		this.stepUpload = $('stepUpload');
		this.stepUploadMeta = $('stepUploadMeta');
		this.stepReslice = $('stepReslice');
		this.stepResliceMeta = $('stepResliceMeta');
		this.stepTranslate = $('stepTranslate');
		this.stepTranslateMeta = $('stepTranslateMeta');
	}

	update(phase: string, current: number, total: number): void {
		const isUploading = phase === 'uploading';
		const isReslicing = phase === 'reslicing';
		const isTranslating = phase === 'translating';
		const isDone = phase === 'done' || (isTranslating && current === total && total > 0);

		// STEP 1: UPLOAD
		this.stepUpload.classList.toggle('active', isUploading);
		this.stepUpload.classList.toggle('done', !isUploading && (isReslicing || isTranslating || isDone));
		if (isUploading) {
			this.stepUploadMeta.textContent = `${current}/${total || '?'}`;
		} else if (isReslicing || isTranslating || isDone) {
			this.stepUploadMeta.textContent = 'Completed';
		} else {
			this.stepUploadMeta.textContent = 'Queued';
		}

		// STEP 2: RESLICE
		this.stepReslice.classList.toggle('active', isReslicing);
		this.stepReslice.classList.toggle('done', isTranslating || isDone);
		if (isReslicing) {
			this.stepResliceMeta.textContent = 'Running';
		} else if (isTranslating || isDone) {
			this.stepResliceMeta.textContent = 'Completed';
		} else {
			this.stepResliceMeta.textContent = 'Queued';
		}

		// STEP 3: TRANSLATE
		this.stepTranslate.classList.toggle('active', isTranslating && !isDone);
		this.stepTranslate.classList.toggle('done', isDone);
		if (isTranslating && !isDone) {
			this.stepTranslateMeta.textContent = `${current}/${total || '?'}`;
		} else if (isDone) {
			this.stepTranslateMeta.textContent = 'Ready';
		} else {
			this.stepTranslateMeta.textContent = 'Queued';
		}
	}
}
