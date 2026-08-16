// ML SIDECAR HEALTH & HARDWARE STATUS STORE
// Monitors connection health to the Python OCR/Inpaint sidecar service with background heartbeat & window focus checks.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface MLStatusState {
	online: boolean;
	deviceLabel: string;
	activeProvider: string;
	hasCuda: boolean;
	hasDirectMl: boolean;
	hasCoreMl: boolean;
	hasDedicatedGpu: boolean;
	gpuWarning: string | null;
	loading: boolean;
	lastChecked: number | null;
	error: string | null;
}

const initialState: MLStatusState = {
	online: false,
	deviceLabel: 'Checking...',
	activeProvider: 'None',
	hasCuda: false,
	hasDirectMl: false,
	hasCoreMl: false,
	hasDedicatedGpu: false,
	gpuWarning: null,
	loading: true,
	lastChecked: null,
	error: null,
};

function createMLStatusStore() {
	const { subscribe, set, update } = writable<MLStatusState>(initialState);
	let checkTimer: ReturnType<typeof setInterval> | null = null;
	let isChecking = false;

	async function checkHealth(): Promise<void> {
		if (!browser || isChecking) return;
		isChecking = true;

		try {
			const res = await fetch('/api/system/hardware');
			if (!res.ok) {
				update((s) => ({
					...s,
					online: false,
					deviceLabel: 'Offline',
					activeProvider: 'None',
					loading: false,
					lastChecked: Date.now(),
					error: `HTTP ${res.status}`,
				}));
				return;
			}

			const data = await res.json();
			const isOnline = data && data.active_provider !== 'None' && !data.error;

			set({
				online: isOnline,
				deviceLabel: data.device_label || (isOnline ? 'Online' : 'Offline'),
				activeProvider: data.active_provider || 'None',
				hasCuda: Boolean(data.has_cuda),
				hasDirectMl: Boolean(data.has_directml),
				hasCoreMl: Boolean(data.has_coreml),
				hasDedicatedGpu: Boolean(data.has_dedicated_gpu),
				gpuWarning: data.gpu_warning || null,
				loading: false,
				lastChecked: Date.now(),
				error: data.error || null,
			});
		} catch (err: any) {
			update((s) => ({
				...s,
				online: false,
				deviceLabel: 'Offline',
				activeProvider: 'None',
				loading: false,
				lastChecked: Date.now(),
				error: err?.message || 'Connection failed',
			}));
		} finally {
			isChecking = false;
		}
	}

	function startPolling(intervalMs = 25000) {
		if (!browser) return;
		if (checkTimer) clearInterval(checkTimer);
		void checkHealth();

		checkTimer = setInterval(() => {
			void checkHealth();
		}, intervalMs);

		// Re-check when user focuses window/tab
		window.addEventListener('focus', onWindowFocus);
	}

	function onWindowFocus() {
		const current = get({ subscribe });
		// Only recheck if last check was > 5 seconds ago
		if (!current.lastChecked || Date.now() - current.lastChecked > 5000) {
			void checkHealth();
		}
	}

	function stopPolling() {
		if (checkTimer) {
			clearInterval(checkTimer);
			checkTimer = null;
		}
		if (browser) {
			window.removeEventListener('focus', onWindowFocus);
		}
	}

	return {
		subscribe,
		checkHealth,
		startPolling,
		stopPolling,
	};
}

export const mlStatus = createMLStatusStore();
