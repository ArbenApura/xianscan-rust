/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import ScriptFontsSection from '$lib/components/settings/ScriptFontsSection.svelte';
import { settings } from '$lib/stores/settings';

// THE REAL Select PORTALS ITS DROPDOWN, WHICH DOES NOT MOUNT UNDER JSDOM; A NATIVE <select> KEEPS THE SAME CONTRACT
vi.mock('$lib/components/ui/Select.svelte', async () => ({ default: (await import('../helpers/SelectStub.svelte')).default }));

function coverage(overrides: Record<string, unknown> = {}) {
	const slots = ['han', 'kana', 'hangul', 'devanagari', 'thai', 'arabic', 'cyrillic', 'greek', 'hebrew', 'bengali', 'tamil'];
	return {
		scripts: slots.map((script) => ({
			script,
			chain: script === 'devanagari' ? ['Noto Sans Devanagari'] : ['WenQuanYi Micro Hei'],
			coveringFonts: script === 'devanagari' ? ['Noto Sans Devanagari'] : ['WenQuanYi Micro Hei'],
			covered: true,
			source: 'bundled',
			...(overrides[script] as object | undefined),
		})),
	};
}

beforeEach(() => {
	settings.update((s) => ({ ...s, targetLang: 'hi', sourceLang: 'ja', typesetScriptFonts: {} }));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('ScriptFontsSection (FEAT-006)', () => {
	it("shows the target language's script first, with the font that will render it", async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(coverage()), { status: 200 })));
		render(ScriptFontsSection);
		const row = await screen.findByTestId('script-font-row-devanagari');
		expect(within(row).getByText('Hindi (Devanagari)')).toBeTruthy();
		await waitFor(() => expect(within(row).getByText('Renders with Noto Sans Devanagari')).toBeTruthy());
		// THE SOURCE LANGUAGE'S SCRIPT IS SHOWN TOO; UNRELATED ONES WAIT UNDER "OTHER SCRIPTS"
		expect(screen.getByTestId('script-font-row-kana')).toBeTruthy();
		expect(screen.queryByTestId('script-font-row-thai')).toBeNull();
	});

	it('choosing a font writes typesetScriptFonts for that script', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(coverage()), { status: 200 })));
		render(ScriptFontsSection);
		const row = await screen.findByTestId('script-font-row-devanagari');
		const select = within(row).getByRole('combobox') as HTMLSelectElement;
		expect([...select.options].map((o) => o.value)).toContain('Noto Sans Devanagari');
		await fireEvent.change(select, { target: { value: 'Noto Sans Devanagari' } });
		expect(get(settings).typesetScriptFonts.devanagari).toBe('Noto Sans Devanagari');
		// BACK TO AUTOMATIC REMOVES THE SLOT
		await fireEvent.change(select, { target: { value: '__automatic__' } });
		expect(get(settings).typesetScriptFonts.devanagari).toBeUndefined();
	});

	it('shows a red warning when nothing covers the script', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(coverage({ devanagari: { chain: [], coveringFonts: [], covered: false, source: 'none' } })), { status: 200 })),
		);
		render(ScriptFontsSection);
		const row = await screen.findByTestId('script-font-row-devanagari');
		await waitFor(() => expect(within(row).getByRole('alert').textContent).toMatch(/will render as boxes/));
	});
});
