/**
 * @vitest-environment jsdom
 */
// FONTS TABLE (FEAT-010 PHASE 8): REPLACES THE FEAT-006 SCRIPT FONTS SECTION TESTS AND ADDS THE ACCENT COLUMN
import { render, fireEvent, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import FontRolesTable from '$lib/components/settings/FontRolesTable.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

// THE REAL Select PORTALS ITS DROPDOWN, WHICH DOES NOT MOUNT UNDER JSDOM; A NATIVE <select> KEEPS THE SAME CONTRACT
vi.mock('$lib/components/ui/Select.svelte', async () => ({ default: (await import('../helpers/SelectStub.svelte')).default }));

// -- HELPERS -- //

function coverage(overrides: Record<string, unknown> = {}, accent: unknown[] = []) {
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
		accent,
	};
}

function stubFetch(cov: unknown, bookScripts: string[] = ['devanagari']) {
	const fetchMock = vi.fn(async (url: string) => {
		if (String(url).includes('/book-scripts')) return new Response(JSON.stringify({ scripts: bookScripts }), { status: 200 });
		return new Response(JSON.stringify(cov), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

// -- LIFECYCLES -- //

beforeEach(() => {
	settings.set({ ...DEFAULTS, targetLang: 'en', sourceLang: 'zh-Hans', typesetScriptFonts: {}, typesetAccentFonts: {} });
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

// -- TESTS -- //

describe('FontRolesTable rows', () => {
	it('shows Latin, the library scripts and the default pair; other scripts wait behind Show all', async () => {
		stubFetch(coverage(), ['devanagari', 'latin']);
		render(FontRolesTable);
		expect(screen.getByTestId('font-row-latin')).toBeTruthy();
		await screen.findByTestId('font-row-devanagari');
		// THE DEFAULT SOURCE LANGUAGE (zh-Hans) SHOWS ITS SCRIPT TOO
		expect(screen.getByTestId('font-row-han')).toBeTruthy();
		expect(screen.queryByTestId('font-row-thai')).toBeNull();
		await fireEvent.click(screen.getByTestId('font-rows-toggle'));
		expect(screen.getByTestId('font-row-thai')).toBeTruthy();
		// ONLY SCRIPTS A BOOK CAN BE TRANSLATED INTO: NO LANGUAGE USES GREEK, HEBREW, BENGALI OR TAMIL
		for (const script of ['greek', 'hebrew', 'bengali', 'tamil']) expect(screen.queryByTestId(`font-row-${script}`)).toBeNull();
		const rows = [...document.querySelectorAll('[data-testid^="font-row-"]')].filter((e) => /^font-row-[a-z]+$/.test(e.getAttribute('data-testid') ?? ''));
		expect(rows.map((e) => e.getAttribute('data-testid')?.slice('font-row-'.length)).sort()).toEqual(
			['arabic', 'cyrillic', 'devanagari', 'han', 'hangul', 'kana', 'latin', 'thai'],
		);
	});

	it('choosing a dialogue font for a script writes typesetScriptFonts; Automatic removes it', async () => {
		stubFetch(coverage());
		render(FontRolesTable);
		const row = await screen.findByTestId('font-row-devanagari');
		const [dialogue] = within(row).getAllByRole('combobox') as HTMLSelectElement[];
		expect([...dialogue.options].map((o) => o.value)).toContain('Noto Sans Devanagari');
		await fireEvent.change(dialogue, { target: { value: 'Noto Sans Devanagari' } });
		expect(get(settings).typesetScriptFonts.devanagari).toBe('Noto Sans Devanagari');
		await fireEvent.change(dialogue, { target: { value: '__automatic__' } });
		expect(get(settings).typesetScriptFonts.devanagari).toBeUndefined();
	});

	it('asks the parent to set the Latin dialogue font (it adjusts weight and casing)', async () => {
		stubFetch(coverage());
		const { component } = render(FontRolesTable);
		const handler = vi.fn();
		component.$on('setDialogueFont', handler);
		const [dialogue] = within(screen.getByTestId('font-row-latin')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(dialogue, { target: { value: 'Friendly Sans' } });
		expect(handler).toHaveBeenCalled();
		expect(handler.mock.calls[0][0].detail).toBe('Friendly Sans');
	});

	it('shows a red note when nothing covers a script', async () => {
		stubFetch(coverage({ devanagari: { chain: [], coveringFonts: [], covered: false, source: 'none' } }));
		render(FontRolesTable);
		await waitFor(() => expect(screen.getByTestId('font-row-devanagari-dialogue-note').textContent).toMatch(/shows as boxes/));
	});
});

describe('FontRolesTable accent column (FEAT-010)', () => {
	it('choosing an accent font writes typesetAccentFonts; Off removes it', async () => {
		stubFetch(coverage());
		render(FontRolesTable);
		const [accent] = within(screen.getByTestId('font-row-latin-accent')).getAllByRole('combobox') as HTMLSelectElement[];
		expect(accent.value).toBe('__off__');
		await fireEvent.change(accent, { target: { value: 'Montserrat' } });
		expect(get(settings).typesetAccentFonts.latin).toBe('Montserrat');
		await fireEvent.change(accent, { target: { value: '__off__' } });
		expect(get(settings).typesetAccentFonts.latin).toBeUndefined();
	});

	it('sends the pending accent fonts with the coverage request', async () => {
		const fetchMock = stubFetch(coverage());
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'BadaBoom BB' } }));
		render(FontRolesTable);
		await waitFor(() => {
			const call = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/coverage'));
			expect(call && new URL(call, 'http://x').searchParams.get('accentFonts')).toBe('{"latin":"BadaBoom BB"}');
		});
	});

	it('lists the letters the accent font lacks, and says when a system font cannot be checked', async () => {
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'BadaBoom BB', han: 'System Brush' } }));
		stubFetch(
			coverage({}, [
				{ script: 'latin', family: 'BadaBoom BB', available: true, verified: true, coversScript: true, missing: ['É', 'Ñ', '7'] },
				{ script: 'han', family: 'System Brush', available: true, verified: false, coversScript: true, missing: [] },
			]),
		);
		render(FontRolesTable);
		await waitFor(() => expect(screen.getByTestId('font-row-latin-accent-note').textContent).toMatch(/lacks 7\./));
		expect(screen.getByTestId('font-row-han-accent-note').textContent).toMatch(/could not be checked/);
	});

	it('has no diacritics control and no accent style row (owner review)', async () => {
		stubFetch(coverage());
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'Montserrat' } }));
		render(FontRolesTable);
		await screen.findByTestId('font-row-latin');
		expect(screen.queryByTestId('latin-diacritics')).toBeNull();
		expect(screen.queryByTestId('accent-style')).toBeNull();
		expect(screen.queryByRole('switch', { name: /Accent in speech bubbles/i })).toBeNull();
	});

	it('leaves out missing accented letters, which are drawn plain in the accent font (FEAT-011)', async () => {
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'BadaBoom BB' } }));
		stubFetch(coverage({}, [{ script: 'latin', family: 'BadaBoom BB', available: true, verified: true, coversScript: true, missing: ['É', 'Ñ', '['] }]));
		render(FontRolesTable);
		const note = () => screen.queryByTestId('font-row-latin-accent-note')?.textContent ?? '';
		await waitFor(() => expect(note()).toMatch(/lacks \[\./));
		expect(note()).not.toMatch(/É|Ñ/);
	});

	it('shows no note when the only missing letters are drawn plain (FEAT-011)', async () => {
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'BadaBoom BB' } }));
		stubFetch(coverage({}, [{ script: 'latin', family: 'BadaBoom BB', available: true, verified: true, coversScript: true, missing: ['É', 'Ñ'] }]));
		render(FontRolesTable);
		await waitFor(() => expect(screen.getByTestId('font-row-latin-accent')).toBeTruthy());
		await tick();
		expect(screen.queryByTestId('font-row-latin-accent-note')).toBeNull();
	});
});

describe('FontRolesTable rows with a font set (code critic)', () => {
	it('keeps a Greek row visible while it holds a font, although no supported language uses Greek', async () => {
		stubFetch(coverage());
		settings.update((s) => ({ ...s, typesetScriptFonts: { greek: 'Some Greek Font' } }));
		render(FontRolesTable);
		expect(await screen.findByTestId('font-row-greek')).toBeTruthy();
	});

	it('keeps the accent search target in the page when every accent cell is Off', () => {
		stubFetch(coverage());
		settings.update((s) => ({ ...s, typesetAccentFonts: {} }));
		render(FontRolesTable);
		expect(document.getElementById('setting-typeset-accent')).toBeTruthy();
	});
});

