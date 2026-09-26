/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import TypesettingTab from '$lib/components/settings/TypesettingTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

describe('TypesettingTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the live preview card and the lettering controls', () => {
		render(TypesettingTab);
		expect(screen.getByRole('heading', { name: /Typesetting & Lettering Studio/i })).toBeTruthy();
		expect(screen.getByText('Live Speech Bubble Preview')).toBeTruthy();
		expect(screen.getByText('Text Stroke Outline')).toBeTruthy();
		expect(screen.getByRole('switch', { name: /Bubble Centering & Expansion/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
	});

	it('writes typesetOutline when an outline preset is clicked', async () => {
		render(TypesettingTab);
		await fireEvent.click(screen.getByText('Heavy').closest('button')!);
		await tick();
		expect(get(settings).typesetOutline).toBe('heavy');
		expect(screen.getByText('Reset Defaults')).toBeTruthy();
	});
});
