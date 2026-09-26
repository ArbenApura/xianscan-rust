/**
 * @vitest-environment jsdom
 */
// THE WELCOME TOUR TELLS A FIRST-TIME USER WHERE THE ACCESS TOKEN LIVES AND OPENS THAT SETTINGS TAB (AUDIT: MISSING #12)
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import OnboardingModal from '$lib/components/OnboardingModal.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';
import { settingsModal, closeSettings } from '$lib/stores/settings-modal';

afterEach(() => {
	cleanup();
	closeSettings();
});

async function goToLastStep() {
	await fireEvent.click(screen.getByRole('tab', { name: 'Go to step 3' }));
	await tick();
}

describe('OnboardingModal', () => {
	it('lists DeepSeek and Custom endpoints among the providers', async () => {
		render(OnboardingModal, { props: { open: true } });
		await fireEvent.click(screen.getByRole('tab', { name: 'Go to step 2' }));
		await tick();
		expect(screen.getByText('DeepSeek')).toBeTruthy();
		expect(screen.getByText('Custom')).toBeTruthy();
	});

	it('says pairing needs the access token and LAN access for phones', async () => {
		render(OnboardingModal, { props: { open: true } });
		await goToLastStep();
		expect(screen.getByText(/Both need your access token from/)).toBeTruthy();
		expect(screen.getByText(/once LAN access is on/)).toBeTruthy();
	});

	it('finishes the tour and opens Settings on Network & Access', async () => {
		settings.set({ ...DEFAULTS, hasCompletedOnboarding: false });
		render(OnboardingModal, { props: { open: true } });
		await goToLastStep();
		await fireEvent.click(screen.getByRole('button', { name: 'Network & Access' }));
		await tick();
		expect(get(settingsModal)).toEqual({ open: true, tab: 'network' });
		expect(get(settings).hasCompletedOnboarding).toBe(true);
	});
});
