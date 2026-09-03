// -- POPUP TOAST NOTIFICATION COMPONENT -- //

// -- TOAST CLASS -- //

export class ToastComponent {
	private toastEl: HTMLElement;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(elementId = 'toast') {
		this.toastEl = document.getElementById(elementId) || document.createElement('div');
	}

	show(msg: string, isError = false): void {
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastEl.textContent = msg;
		this.toastEl.className = `toast visible ${isError ? 'error' : ''}`;
		this.toastTimer = setTimeout(() => {
			this.toastEl.className = 'toast';
		}, 3000);
	}
}
