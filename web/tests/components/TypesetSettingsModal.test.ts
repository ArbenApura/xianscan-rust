/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import TypesetSettingsModal from '$lib/components/TypesetSettingsModal.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';
import { validateForm } from '$lib/utils/form';
import { typesetOptionsSchema } from '$lib/schemas';

describe('TypesetSettingsModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders typography settings modal with font presets and sliders', async () => {
		render(TypesetSettingsModal, {
			props: {
				open: true,
			},
		});

		expect(screen.getByText('Typesetting & Lettering Studio')).toBeTruthy();
		expect(screen.getByText('Done')).toBeTruthy();

		// Initially at defaults, Reset Defaults should not be visible
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// Modify a typesetting setting via UI button
		const poppinsBtn = screen.getByText('Poppins').closest('button');
		await fireEvent.click(poppinsBtn!);
		await tick();

		// Now Reset Defaults should appear
		const resetBtn = screen.getByText('Reset Defaults');
		expect(resetBtn).toBeTruthy();

		// Clicking Reset Defaults returns to defaults and hides the button
		await fireEvent.click(resetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
	});

	it('switches preview presets and updates sample text', async () => {
		render(TypesetSettingsModal, {
			props: {
				open: true,
			},
		});

		const zhBtn = screen.getByText('简体中文');
		await fireEvent.click(zhBtn);
		await tick();

		expect(screen.getByText('等一下！这是什么修炼境界……？！')).toBeTruthy();
	});

	it('validates settings against typesetOptionsSchema contract', () => {
		const currentOpts = {
			fontFamily: 'wild-words',
			fontSize: 16,
			lineHeight: 1.2,
			outline: 'medium' as const,
			contrast: 'standard' as const,
			casing: 'uppercase' as const,
		};

		const res = validateForm(typesetOptionsSchema, currentOpts);
		expect(res.success).toBe(true);
		expect(res.data?.fontFamily).toBe('wild-words');
		expect(res.data?.outline).toBe('medium');
	});

	it('automatically falls back dialogue casing to uppercase when font is CC Wild Words', async () => {
		settings.set({
			...DEFAULTS,
			typesetFont: 'Friendly Sans',
			typesetCasing: 'lowercase',
			typesetAllCaps: false,
		});

		render(TypesetSettingsModal, {
			props: {
				open: true,
			},
		});
		await tick();

		const ccBtn = screen.getByText('CC Wild Words').closest('button');
		await fireEvent.click(ccBtn!);
		await tick();

		expect(get(settings).typesetFont).toBe('CC Wild Words');
		expect(get(settings).typesetCasing).toBe('uppercase');
		expect(get(settings).typesetAllCaps).toBe(true);
	});
});
