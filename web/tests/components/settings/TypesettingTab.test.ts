/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import TypesettingTab from '$lib/components/settings/TypesettingTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

// THE DROPDOWN AS A PLAIN <select>, AS IN THE OTHER SETTINGS TESTS
vi.mock('$lib/components/ui/Select.svelte', async () => ({ default: (await import('../../helpers/SelectStub.svelte')).default }));

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

	it('has no diacritics setting (FEAT-011: the font decides)', () => {
		render(TypesettingTab);
		expect(screen.queryByRole('switch', { name: /Diacritics/i })).toBeNull();
		expect(document.getElementById('setting-typeset-diacritics')).toBeNull();
	});

	it('previews letters the dialogue font lacks as plain letters, and keeps the ones it has (FEAT-011)', async () => {
		global.fetch = vi.fn().mockImplementation(async (url: string) => ({
			ok: true,
			json: async () =>
				String(url).includes('/coverage') ? { scripts: [], accent: [{ script: 'latin', family: 'CC Wild Words', missing: ['É', 'Ñ'] }] } : {},
		}));
		settings.set({ ...DEFAULTS, typesetPreviewPreset: 'custom', typesetPreviewText: 'Café Ü' });
		render(TypesettingTab);
		await waitFor(() => expect(screen.getByText('CAFE Ü')).toBeTruthy());
	});

	it('switches the preview between the dialogue bubble and an editable accent callout', async () => {
		settings.set({ ...DEFAULTS, typesetAccentCasing: 'original' });
		render(TypesettingTab);
		expect(screen.getByTestId('preview-mode-dialogue').getAttribute('aria-selected')).toBe('true');
		expect(screen.queryByTestId('accent-preview')).toBeNull();
		await fireEvent.click(screen.getByTestId('preview-mode-accent'));
		expect(screen.getByTestId('accent-preview').textContent?.trim()).toBe('Green Wood Sword Art');
		await fireEvent.click(screen.getByText('Custom').closest('button')!);
		const input = screen.getByLabelText('Custom accent text') as HTMLInputElement;
		expect(input.value).toBe('Green Wood Sword Art');
		await fireEvent.input(input, { target: { value: 'Flowing Blade' } });
		expect(screen.getByTestId('accent-preview').textContent?.trim()).toBe('Flowing Blade');
		// THE DIALOGUE CUSTOM TEXT IS UNTOUCHED
		await fireEvent.click(screen.getByTestId('preview-mode-dialogue'));
		expect((screen.getByLabelText('Custom dialogue text') as HTMLInputElement).value).not.toBe('Flowing Blade');
	});

	it('keeps every letter in the preview while the font coverage is unknown (FEAT-011)', () => {
		settings.set({ ...DEFAULTS, typesetPreviewPreset: 'custom', typesetPreviewText: 'Café' });
		render(TypesettingTab);
		expect(screen.getByText('CAFÉ')).toBeTruthy();
	});
});
