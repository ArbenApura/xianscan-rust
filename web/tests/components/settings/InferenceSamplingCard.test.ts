/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import InferenceSamplingCard from '$lib/components/settings/InferenceSamplingCard.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';
import { lastActiveSampling } from '$lib/stores/settings-ui';

describe('InferenceSamplingCard', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		settings.set({ ...DEFAULTS });
		lastActiveSampling.temperature = 0.2;
		lastActiveSampling.topP = 1.0;
		lastActiveSampling.frequencyPenalty = 0.0;
		lastActiveSampling.presencePenalty = 0.0;
	});

	afterEach(() => cleanup());

	it('re-enables an omitted parameter with the last value even after the card remounts (tab switch)', async () => {
		settings.set({ ...DEFAULTS, translationTemperature: 0.55, translationPresencePenalty: 1.25 });
		const first = render(InferenceSamplingCard);
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: 'Omit Temperature' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Omit Presence Penalty' }));
		await tick();
		expect(get(settings).translationTemperature).toBeNull();
		expect(get(settings).translationPresencePenalty).toBeNull();

		// LEAVING THE PROVIDERS TAB UNMOUNTS THE CARD; COMING BACK MOUNTS A FRESH ONE
		first.unmount();
		render(InferenceSamplingCard);
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: 'Include Temperature' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Include Presence Penalty' }));
		await tick();
		expect(get(settings).translationTemperature).toBe(0.55);
		expect(get(settings).translationPresencePenalty).toBe(1.25);
	});

	it('falls back to the built-in value when nothing was set before', async () => {
		render(InferenceSamplingCard);
		await tick();
		expect(get(settings).translationTopP).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Include Top-P' }));
		await tick();
		expect(get(settings).translationTopP).toBe(1.0);
	});
});
