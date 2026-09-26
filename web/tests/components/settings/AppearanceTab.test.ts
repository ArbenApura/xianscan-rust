/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import AppearanceTab from '$lib/components/settings/AppearanceTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

describe('AppearanceTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the theme picker and the localization pair', () => {
		render(AppearanceTab);
		expect(screen.getByRole('heading', { name: /General & Appearance/i })).toBeTruthy();
		expect(screen.getByText('Reader Surface Theme')).toBeTruthy();
		expect(screen.getByText('Default Localization Pair')).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
	});

	it('writes the theme key when a theme is clicked', async () => {
		render(AppearanceTab);
		await fireEvent.click(screen.getByText('Dark').closest('button')!);
		await tick();
		expect(get(settings).theme).toBe('dark');
		expect(screen.getByText('Reset Defaults')).toBeTruthy();
	});
});
