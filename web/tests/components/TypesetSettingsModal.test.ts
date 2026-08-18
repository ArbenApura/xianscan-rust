/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import TypesetSettingsModal from '$lib/components/TypesetSettingsModal.svelte';
import { settings } from '$lib/stores/settings';
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
		expect(screen.getByText('Reset Defaults')).toBeTruthy();
		expect(screen.getByText('Done')).toBeTruthy();
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
});
