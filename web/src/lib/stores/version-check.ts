// VERSION CHECK STORE WITH PERSISTENT USER DISMISSAL
// Manages background updates check from GitHub Releases and persists user dismissal in localStorage.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface VersionCheckState {
	checking: boolean;
	hasUpdate: boolean;
	currentVersion: string;
	webBuildHash: string;
	latestVersion: string | null;
	releaseUrl: string | null;
	releaseName: string | null;
	publishedAt: string | null;
	body: string | null;
	isDismissed: boolean;
	lastChecked: number | null;
	error: string | null;
}

const STORAGE_KEY_PREFIX = 'xianscan_dismissed_update_';

const initialState: VersionCheckState = {
	checking: false,
	hasUpdate: false,
	currentVersion: '0.5.0-beta.1',
	webBuildHash: 'dev',
	latestVersion: null,
	releaseUrl: null,
	releaseName: null,
	publishedAt: null,
	body: null,
	isDismissed: false,
	lastChecked: null,
	error: null,
};

function isVersionDismissed(version: string | null): boolean {
	if (!browser || !version) return false;
	try {
		return localStorage.getItem(`${STORAGE_KEY_PREFIX}${version}`) === 'true';
	} catch {
		return false;
	}
}

function persistVersionDismissed(version: string | null, dismissed: boolean): void {
	if (!browser || !version) return;
	try {
		if (dismissed) {
			localStorage.setItem(`${STORAGE_KEY_PREFIX}${version}`, 'true');
		} else {
			localStorage.removeItem(`${STORAGE_KEY_PREFIX}${version}`);
		}
	} catch {
		// IGNORE STORAGE ERRORS (QUOTA / COOKIE BLOCK)
	}
}

function createVersionCheckStore() {
	const { subscribe, set, update } = writable<VersionCheckState>(initialState);

	async function checkForUpdates(force = false): Promise<{ ok: boolean; hasUpdate: boolean; latestVersion: string | null; error?: string }> {
		if (!browser) return { ok: false, hasUpdate: false, latestVersion: null };

		const current = get({ subscribe });
		if (current.checking) return { ok: true, hasUpdate: current.hasUpdate, latestVersion: current.latestVersion };

		update((s) => ({ ...s, checking: true, error: null }));

		try {
			const res = await fetch(`/api/system/version${force ? '?force=true' : ''}`);
			if (!res.ok) {
				const errMsg = `HTTP ${res.status}`;
				update((s) => ({
					...s,
					checking: false,
					lastChecked: Date.now(),
					error: errMsg,
				}));
				return { ok: false, hasUpdate: false, latestVersion: null, error: errMsg };
			}

			const data = await res.json();
			const latestVer = data.latest_version || null;
			const isDismissed = isVersionDismissed(latestVer);
			const hasUpdate = Boolean(data.has_update);

			update((s) => ({
				...s,
				checking: false,
				hasUpdate,
				currentVersion: data.current_version || s.currentVersion,
				webBuildHash: data.web_build_hash || s.webBuildHash,
				latestVersion: latestVer,
				releaseUrl: data.release_url || null,
				releaseName: data.release_name || null,
				publishedAt: data.published_at || null,
				body: data.body || null,
				isDismissed,
				lastChecked: Date.now(),
				error: data.error || null,
			}));

			return { ok: true, hasUpdate, latestVersion: latestVer, error: data.error || undefined };
		} catch (err: any) {
			const errMsg = err?.message || 'Failed to check version';
			update((s) => ({
				...s,
				checking: false,
				lastChecked: Date.now(),
				error: errMsg,
			}));
			return { ok: false, hasUpdate: false, latestVersion: null, error: errMsg };
		}
	}

	function dismissCurrentUpdate(): void {
		const current = get({ subscribe });
		if (current.latestVersion) {
			persistVersionDismissed(current.latestVersion, true);
		}
		update((s) => ({ ...s, isDismissed: true }));
	}

	function resetDismissed(): void {
		const current = get({ subscribe });
		if (current.latestVersion) {
			persistVersionDismissed(current.latestVersion, false);
		}
		update((s) => ({ ...s, isDismissed: false }));
	}

	return {
		subscribe,
		checkForUpdates,
		dismissCurrentUpdate,
		resetDismissed,
	};
}

export const versionCheck = createVersionCheckStore();
