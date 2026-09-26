/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import InpaintingTab from '$lib/components/settings/InpaintingTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

describe('InpaintingTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the strategy picker and the shrinkwrap switch', () => {
		render(InpaintingTab);
		expect(screen.getByRole('heading', { name: /Inpainting & Cleaning/i })).toBeTruthy();
		expect(screen.getByText('Inpainting Strategy')).toBeTruthy();
		expect(screen.getByRole('switch', { name: /White Bubble Shrinkwrap Cleaning/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
	});

	it('writes inpaintExpansionPct when a margin preset is clicked', async () => {
		render(InpaintingTab);
		await fireEvent.click(screen.getByText('9%').closest('button')!);
		await tick();
		expect(get(settings).inpaintExpansionPct).toBe(0.09);
		expect(screen.getByText('Reset Defaults')).toBeTruthy();
	});
});
