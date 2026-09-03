// -- POPUP MODAL DIALOG COMPONENT -- //

// -- MODAL CLASS -- //

export class ModalComponent {
	private overlay: HTMLElement;
	private closeBtn?: HTMLElement | null;
	private cancelBtn?: HTMLElement | null;

	constructor(overlayId: string, closeBtnId?: string, cancelBtnId?: string) {
		this.overlay = document.getElementById(overlayId) || document.createElement('div');
		if (closeBtnId) this.closeBtn = document.getElementById(closeBtnId);
		if (cancelBtnId) this.cancelBtn = document.getElementById(cancelBtnId);

		this.closeBtn?.addEventListener('click', () => this.close());
		this.cancelBtn?.addEventListener('click', () => this.close());

		this.overlay.addEventListener('click', (e) => {
			if (e.target === this.overlay) {
				this.close();
			}
		});

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this.isOpen()) {
				this.close();
			}
		});
	}

	open(): void {
		this.overlay.classList.remove('hidden');
		// FORCE REFLOW SO CSS OPACITY & SCALE TRANSITIONS RENDER SMOOTHLY
		void this.overlay.offsetHeight;
		this.overlay.classList.add('open');
	}

	close(onClosed?: () => void): void {
		this.overlay.classList.remove('open');
		setTimeout(() => {
			if (!this.overlay.classList.contains('open')) {
				this.overlay.classList.add('hidden');
				onClosed?.();
			}
		}, 180);
	}

	isOpen(): boolean {
		return this.overlay.classList.contains('open');
	}
}
