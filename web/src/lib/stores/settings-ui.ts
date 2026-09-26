// SETTINGS MODAL UI STATE THAT MUST OUTLIVE A SINGLE TAB MOUNT (FEAT-009 PHASE 6 FOLLOW-UP)
// THE SHELL REMOUNTS EACH TAB ON EVERY SWITCH, SO ANYTHING THE OLD ALWAYS-MOUNTED SHELL KEPT ACROSS SWITCHES LIVES HERE.
import { writable } from 'svelte/store';
import type { HardwareInfo } from '$lib/components/settings/settings-helpers';
import type { ExecutionDevice } from '$lib/stores/settings';

// -- TYPES -- //

export interface ProviderTestResult {
	ok: boolean;
	message: string;
	latencyMs: number;
}

export interface ProvidersSession {
	selectedProviderId: string;
	testResult: ProviderTestResult | null;
}

export interface ComputeWork {
	switchingDevice: ExecutionDevice | null;
	settingVramLimit: boolean;
}

// -- STORES -- //

// PROVIDERS TAB: THE PICKED PROVIDER AND ITS LAST CONNECTION TEST SURVIVE TAB SWITCHES AND RESET WHEN THE MODAL REOPENS.
// UNSAVED KEY / URL / MODEL DRAFTS ARE DELIBERATELY NOT KEPT HERE (LEAVING THE TAB DISCARDS THEM).
export const providersSession = writable<ProvidersSession>({ selectedProviderId: '', testResult: null });

// BUMPED ON EVERY MODAL OPEN. A REOPEN DURING THE CLOSE ANIMATION REVERSES THE OUTRO INSTEAD OF REMOUNTING THE TAB, SO A
// STILL-MOUNTED TAB WATCHES THIS TO DROP ITS STALE STATE
export const settingsOpenEpoch = writable(0);

// COMPUTE TAB: A DEVICE SWITCH OR VRAM CHANGE KEEPS POLLING AFTER THE TAB UNMOUNTS, SO ITS BUSY FLAGS LIVE HERE AND ARE
// NEVER RESET BY A TAB SWITCH OR A MODAL REOPEN (ONLY THE WORK ITSELF CLEARS THEM)
export const computeWork = writable<ComputeWork>({ switchingDevice: null, settingVramLimit: false });

// THE HARDWARE STATUS THE SHELL LOADS ON OPEN; THE COMPUTE TAB PUBLISHES FRESHER ANSWERS HERE, EVEN AFTER IT UNMOUNTS
export const settingsHardwareInfo = writable<HardwareInfo | null>(null);

// -- STATES -- //

// LOADING TOAST IDS OF THE COMPUTE WORK ABOVE (NOT RENDERED, SO PLAIN MODULE STATE)
export const computeToastIds: { switching: string | number | null; vram: string | number | null } = {
	switching: null,
	vram: null,
};

// LAST NON-OMITTED SAMPLING VALUES: RE-ENABLING AN OMITTED PARAMETER RESTORES THE USER'S LAST VALUE, NOT THE DEFAULT.
// GLOBAL (NOT PER PROVIDER), MATCHING THE PRE-SPLIT SHELL.
export const lastActiveSampling = {
	temperature: 0.2,
	topP: 1.0,
	frequencyPenalty: 0.0,
	presencePenalty: 0.0,
};

// -- FUNCTIONS -- //

// CALLED BY THE SHELL EACH TIME THE MODAL OPENS
export function resetSettingsSession(): void {
	providersSession.set({ selectedProviderId: '', testResult: null });
	settingsOpenEpoch.update((n) => n + 1);
}
