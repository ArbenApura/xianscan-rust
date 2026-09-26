// -- SETTINGS MODAL CONTROLLER -- //

// IMPORTED MODULES
import { AuthRequiredError, XianScanClient } from '../../api';
import { getAccessToken, setAccessToken, setServerUrl } from '../../core/storage';
import { ModalComponent } from '../components/modal';
import { ToastComponent } from '../components/toast';

// -- FUNCTIONS -- //

// ONLY HTTP(S) SERVER URLS ARE ACCEPTED
export function normalizeServerUrl(raw: string): string | null {
	const trimmed = raw.trim().replace(/\/+$/, '');
	try {
		const u = new URL(trimmed);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		return trimmed;
	} catch {
		return null;
	}
}

// -- SETTINGS MODAL CLASS -- //

export class SettingsModalController {
	private modal: ModalComponent;
	private serverUrlInput: HTMLInputElement;
	private accessTokenInput: HTMLInputElement | null;
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
		this.accessTokenInput = document.getElementById('accessTokenInput') as HTMLInputElement | null;
		this.saveBtn = document.getElementById('saveServerUrlBtn') as HTMLButtonElement;

		this.bindEvents();
	}

	private bindEvents(): void {
		this.saveBtn.addEventListener('click', async () => {
			const normalized = normalizeServerUrl(this.serverUrlInput.value);
			if (!normalized) {
				this.toast.show('Please enter an http:// or https:// server URL', true);
				return;
			}
			const token = (this.accessTokenInput?.value ?? '').trim();

			this.client.setBaseUrl(normalized);
			this.client.setAccessToken(token);
			await setServerUrl(normalized);
			await setAccessToken(token);

			// "SAVE & CONNECT": CHECK THE CONNECTION AND THE TOKEN RIGHT AWAY
			try {
				await this.client.checkHealth();
				this.modal.close();
				this.toast.show('Connected to XianScan');
			} catch (err) {
				if (err instanceof AuthRequiredError) {
					this.toast.show('Token rejected. Copy it again from Settings, Network & Access.', true);
					return;
				}
				this.modal.close();
				this.toast.show('Settings saved, but the server is not reachable right now', true);
			}
			this.onSavedCallback?.(normalized);
		});
	}

	async open(currentUrl: string, hint?: string): Promise<void> {
		this.serverUrlInput.value = currentUrl;
		if (this.accessTokenInput) this.accessTokenInput.value = await getAccessToken();
		this.modal.open();
		if (hint) this.toast.show(hint, true);
		const focusTarget = hint && this.accessTokenInput ? this.accessTokenInput : this.serverUrlInput;
		setTimeout(() => focusTarget.focus(), 50);
	}

	close(): void {
		this.modal.close();
	}
}
