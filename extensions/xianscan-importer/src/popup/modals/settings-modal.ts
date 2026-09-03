// -- SETTINGS MODAL CONTROLLER -- //

// IMPORTED MODULES
import { XianScanClient } from '../../api';
import { setServerUrl } from '../../core/storage';
import { ModalComponent } from '../components/modal';
import { ToastComponent } from '../components/toast';

// -- SETTINGS MODAL CLASS -- //

export class SettingsModalController {
	private modal: ModalComponent;
	private serverUrlInput: HTMLInputElement;
	private saveBtn: HTMLButtonElement;
	private client: XianScanClient;
	private toast: ToastComponent;
	private onSavedCallback?: (newUrl: string) => void;

	constructor(client: XianScanClient, toast: ToastComponent, onSaved?: (newUrl: string) => void) {
		this.client = client;
		this.toast = toast;
		this.onSavedCallback = onSaved;

		this.modal = new ModalComponent('settingsModalOverlay', 'closeSettingsModalBtn', 'cancelSettingsModalBtn');
		this.serverUrlInput = document.getElementById('serverUrlInput') as HTMLInputElement;
		this.saveBtn = document.getElementById('saveServerUrlBtn') as HTMLButtonElement;

		this.bindEvents();
	}

	private bindEvents(): void {
		this.saveBtn.addEventListener('click', async () => {
			const rawUrl = this.serverUrlInput.value.trim();
			if (!rawUrl) {
				this.toast.show('Please enter a valid server URL', true);
				return;
			}

			const normalized = rawUrl.replace(/\/+$/, '');
			this.client.setBaseUrl(normalized);
			await setServerUrl(normalized);

			this.modal.close();
			this.toast.show('Server URL saved');
			this.onSavedCallback?.(normalized);
		});
	}

	open(currentUrl: string): void {
		this.serverUrlInput.value = currentUrl;
		this.modal.open();
		setTimeout(() => this.serverUrlInput.focus(), 50);
	}

	close(): void {
		this.modal.close();
	}
}
