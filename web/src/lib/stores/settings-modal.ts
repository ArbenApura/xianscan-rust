// THE ONE SETTINGS MODAL (FEAT-009 PHASE 5): THE APP LAYOUT MOUNTS IT ONCE; ANY PAGE OPENS IT THROUGH THIS STORE
// INSTEAD OF MOUNTING A SECOND INSTANCE.
import { writable } from 'svelte/store';
import type { SettingsCategory } from '$lib/components/SettingsModal.svelte';

export type SettingsTab = SettingsCategory | 'ai' | 'compute' | 'general';

export const settingsModal = writable<{ open: boolean; tab: SettingsTab }>({ open: false, tab: 'ai' });

// THE DEFAULT MATCHES THE LAYOUT'S OLD DEFAULT; SettingsModal.normalizeCategory MAPS 'ai' TO ITS PROVIDERS TAB
export function openSettings(tab: SettingsTab = 'ai'): void {
	settingsModal.set({ open: true, tab });
}

export function closeSettings(): void {
	settingsModal.update((s) => ({ ...s, open: false }));
}
