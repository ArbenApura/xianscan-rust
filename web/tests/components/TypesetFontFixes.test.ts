/**
 * @vitest-environment jsdom
 */
// FONT UI FIXES: SLOT-AWARE SYSTEM FONT BROWSER, IMPORT MODAL LABELS AND STALE UPLOADS, COVERAGE NOTICE ORDERING,
// FONTS TABLE IMPORT / SYSTEM FONTS / REMOVAL, COVERAGE REQUEST ORDERING, AND THE EXACT PREVIEW REQUEST.
import { render, fireEvent, screen, cleanup, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { settings, DEFAULTS, customFontsStore, systemFontsStore, effectiveTypeset, type CustomFontItem } from '$lib/stores/settings';
import SystemFontBrowserModal from '$lib/components/typeset/SystemFontBrowserModal.svelte';
import ImportFontModal from '$lib/components/typeset/ImportFontModal.svelte';
import ScriptCoverageNotice from '$lib/components/book/ScriptCoverageNotice.svelte';
import FontRolesTable from '$lib/components/settings/FontRolesTable.svelte';
import TypesettingTab from '$lib/components/settings/TypesettingTab.svelte';

// THE REAL Select PORTALS ITS DROPDOWN, WHICH DOES NOT MOUNT UNDER JSDOM
vi.mock('$lib/components/ui/Select.svelte', async () => ({ default: (await import('../helpers/SelectStub.svelte')).default }));

// -- HELPERS -- //

const SLOTS = ['han', 'kana', 'hangul', 'devanagari', 'thai', 'arabic', 'cyrillic', 'greek', 'hebrew', 'bengali', 'tamil'];

function coverageBody(chainHead = 'Noto Sans Devanagari') {
	return {
		scripts: SLOTS.map((script) => ({ script, chain: [chainHead], coveringFonts: [chainHead], covered: true, source: 'bundled' })),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const thaiFont: CustomFontItem = {
	id: 'font-thai',
	name: 'My Thai',
	fileName: 'mythai.ttf',
	format: 'truetype',
	scriptType: 'cjk',
	fileSize: 1000,
	supportedWeights: ['normal'],
	scripts: ['thai'],
};

beforeEach(() => {
	settings.set({ ...DEFAULTS });
	customFontsStore.set([]);
	systemFontsStore.set([]);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

// -- SYSTEM FONT BROWSER (BUG 4) -- //

describe('SystemFontBrowserModal with a target slot', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
		systemFontsStore.set([
			{ family: 'Tahoma', scriptType: 'dialogue', scripts: ['latin', 'thai'], supportedWeights: ['normal', 'bold'] } as never,
		]);
	});

	it('clicking an already enabled font assigns it to the slot and keeps it enabled', async () => {
		settings.update((s) => ({ ...s, enabledSystemFonts: ['Tahoma'], typesetFont: 'Tahoma', typesetScriptFonts: { arabic: 'Tahoma' } }));
		render(SystemFontBrowserModal, { props: { open: true, targetScriptType: 'cjk', targetSlot: 'thai' } });
		await fireEvent.click(await screen.findByRole('button', { name: /^Use$/ }));
		const s = get(settings);
		expect(s.typesetScriptFonts.thai).toBe('Tahoma');
		// NOTHING ELSE WAS CLEARED
		expect(s.enabledSystemFonts).toContain('Tahoma');
		expect(s.typesetFont).toBe('Tahoma');
		expect(s.typesetScriptFonts.arabic).toBe('Tahoma');
		expect(screen.getByRole('button', { name: /In use/ })).toBeTruthy();
	});

	it('disabling is a separate, explicit action', async () => {
		settings.update((s) => ({ ...s, enabledSystemFonts: ['Tahoma'], typesetScriptFonts: { thai: 'Tahoma' } }));
		render(SystemFontBrowserModal, { props: { open: true, targetScriptType: 'cjk', targetSlot: 'thai' } });
		await fireEvent.click(await screen.findByTestId('system-font-disable'));
		const s = get(settings);
		expect(s.enabledSystemFonts).not.toContain('Tahoma');
		expect(s.typesetScriptFonts.thai).toBeUndefined();
	});
});

// -- IMPORT FONT MODAL (BUG 7) -- //

describe('ImportFontModal', () => {
	it('names the target slot instead of CJK', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
		render(ImportFontModal, { props: { open: true, targetScriptType: 'cjk', targetSlot: 'thai' } });
		expect(screen.getByText('Import Thai Font')).toBeTruthy();
		expect(screen.queryByText(/CJK/)).toBeNull();
		expect((screen.getByPlaceholderText(/Noto Sans Thai/) as HTMLInputElement).placeholder).not.toMatch(/CJK/);
	});

	it('ignores an upload that finishes after the modal was closed and reopened', async () => {
		const pending = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => (String(url) === '/api/system/fonts' && !String(url).includes('?') ? pending.promise : new Response('[]', { status: 200 }))),
		);
		const imported = vi.fn();
		const { component } = render(ImportFontModal, { props: { open: true, targetScriptType: 'cjk', targetSlot: 'thai' } });
		component.$on('imported', imported);
		const input = document.getElementById('custom-font-input') as HTMLInputElement;
		await fireEvent.change(input, { target: { files: [new File(['x'], 'MyThai-Regular.ttf')] } });
		await fireEvent.click(screen.getByRole('button', { name: /Import Font/ }));
		// CLOSED FROM OUTSIDE MID-UPLOAD, THEN REOPENED
		await component.$set({ open: false });
		await component.$set({ open: true });
		pending.resolve(new Response(JSON.stringify({ success: true, font: { ...thaiFont }, scripts: ['latin'], warnings: ['old warning'] }), { status: 200 }));
		await new Promise((r) => setTimeout(r, 0));
		await tick();
		expect(imported).not.toHaveBeenCalled();
		expect(screen.queryByTestId('font-upload-result')).toBeNull();
		expect(screen.getByText('Import Thai Font')).toBeTruthy();
	});
});

// -- SCRIPT COVERAGE NOTICE (BUG 8) -- //

describe('ScriptCoverageNotice', () => {
	it('drops a coverage answer whose body arrives after a newer check started', async () => {
		vi.useFakeTimers();
		const slowBody = deferred<unknown>();
		const fetchMock = vi.fn(async (url: string) =>
			String(url).includes('thai')
				? ({ ok: true, json: () => slowBody.promise } as unknown as Response)
				: new Response(JSON.stringify({ covered: true }), { status: 200 }),
		);
		vi.stubGlobal('fetch', fetchMock);
		const { component } = render(ScriptCoverageNotice, { props: { lang: 'th' } });
		await vi.advanceTimersByTimeAsync(300);
		await component.$set({ lang: 'hi' });
		await vi.advanceTimersByTimeAsync(300);
		// THE OLD THAI CHECK NOW SAYS "UNCOVERED"; IT MUST NOT WIN
		slowBody.resolve({ covered: false });
		await vi.advanceTimersByTimeAsync(10);
		await tick();
		expect(screen.queryByTestId('script-coverage-notice')).toBeNull();
	});
});

// -- FONTS TABLE: IMPORT, SYSTEM FONTS AND REMOVAL INLINE (FEAT-010) -- //

describe('FontRolesTable your fonts, import and system fonts', () => {
	function stubAll(extra?: (url: string, init?: RequestInit) => Response | undefined) {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				calls.push(`${init?.method ?? 'GET'} ${url}`);
				const custom = extra?.(String(url), init);
				if (custom) return custom;
				if (String(url).startsWith('/api/system/fonts/coverage')) return new Response(JSON.stringify(coverageBody()), { status: 200 });
				return new Response('{}', { status: 200 });
			}),
		);
		return calls;
	}

	it('lists imported and enabled system fonts as removable chips, and nothing when there are none', async () => {
		stubAll();
		const { unmount } = render(FontRolesTable);
		expect(screen.queryByTestId('your-fonts')).toBeNull();
		unmount();
		customFontsStore.set([thaiFont, { ...thaiFont, id: 'font-deva', name: 'NotoSansDevanagari', scriptType: 'dialogue', scripts: ['latin', 'devanagari'] }]);
		settings.update((s) => ({ ...s, enabledSystemFonts: ['Tahoma'] }));
		render(FontRolesTable);
		expect(within(screen.getByTestId('your-font-My Thai')).getByTestId('your-font-delete')).toBeTruthy();
		expect(within(screen.getByTestId('your-font-NotoSansDevanagari')).getByTestId('your-font-delete')).toBeTruthy();
		expect(within(screen.getByTestId('your-font-Tahoma')).getByTestId('your-font-disable')).toBeTruthy();
	});

	it('deleting an imported font clears it from script and accent cells (review H8)', async () => {
		const calls = stubAll((url, init) => (init?.method === 'DELETE' ? new Response(JSON.stringify({ success: true }), { status: 200 }) : undefined));
		customFontsStore.set([thaiFont]);
		settings.update((s) => ({ ...s, typesetScriptFonts: { thai: 'My Thai' }, typesetAccentFonts: { thai: 'My Thai', latin: 'Bangers' } }));
		render(FontRolesTable);
		await fireEvent.click(within(screen.getByTestId('your-font-My Thai')).getByTestId('your-font-delete'));
		await fireEvent.click(await screen.findByRole('button', { name: /Delete Font/ }));
		await waitFor(() => expect(calls).toContain('DELETE /api/system/fonts/font-thai'));
		await waitFor(() => expect(get(settings).typesetAccentFonts).toEqual({ latin: 'Bangers' }));
		expect(get(settings).typesetScriptFonts.thai).toBeUndefined();
	});

	it('removing a system font chip clears it from every cell and the enabled list', async () => {
		stubAll();
		settings.update((s) => ({ ...s, enabledSystemFonts: ['Tahoma'], typesetFont: 'Tahoma', typesetScriptFonts: { thai: 'Tahoma' }, typesetAccentFonts: { latin: 'Tahoma' } }));
		render(FontRolesTable);
		await fireEvent.click(within(screen.getByTestId('your-font-Tahoma')).getByTestId('your-font-disable'));
		const s = get(settings);
		expect(s.enabledSystemFonts).not.toContain('Tahoma');
		expect(s.typesetFont).toBe(DEFAULTS.typesetFont);
		expect(s.typesetScriptFonts.thai).toBeUndefined();
		expect(s.typesetAccentFonts.latin).toBeUndefined();
	});

	it('Add system font in the Latin accent cell assigns that cell only, never the dialogue font (review H7)', async () => {
		stubAll();
		systemFontsStore.set([{ family: 'Impact', scriptType: 'dialogue', scripts: ['latin'], supportedWeights: ['normal'] } as never]);
		render(FontRolesTable);
		const [, accent] = within(screen.getByTestId('font-row-latin')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(accent, { target: { value: '__system__' } });
		await fireEvent.click(await screen.findByRole('button', { name: /^Enable$/ }));
		const s = get(settings);
		expect(s.enabledSystemFonts).toContain('Impact');
		expect(s.typesetAccentFonts.latin).toBe('Impact');
		expect(s.typesetFont).toBe(DEFAULTS.typesetFont);
	});

	it('an already enabled system font is picked for the cell with Use', async () => {
		stubAll();
		systemFontsStore.set([{ family: 'Tahoma', scriptType: 'dialogue', scripts: ['latin', 'thai'], supportedWeights: ['normal'] } as never]);
		settings.update((s) => ({ ...s, targetLang: 'th', enabledSystemFonts: ['Tahoma'] }));
		render(FontRolesTable);
		const [, accent] = within(await screen.findByTestId('font-row-thai')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(accent, { target: { value: '__system__' } });
		await fireEvent.click(await screen.findByRole('button', { name: /^Use$/ }));
		expect(get(settings).typesetAccentFonts.thai).toBe('Tahoma');
		expect(get(settings).typesetScriptFonts.thai).toBeUndefined();
	});
});

// -- FONTS TABLE COVERAGE REQUESTS (BUG 6, NOW IN FontRolesTable) -- //

describe('FontRolesTable coverage requests', () => {
	beforeEach(() => {
		settings.update((s) => ({ ...s, targetLang: 'th', sourceLang: 'ja', typesetScriptFonts: {} }));
	});

	it('sends the pending slots with the coverage request and ignores a stale answer', async () => {
		const first = deferred<Response>();
		const urls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				// ONLY COVERAGE REQUESTS COUNT (THE SETTINGS STORE AND THE BOOK SCRIPTS LOOKUP MAY FETCH TOO)
				if (!String(url).startsWith('/api/system/fonts/coverage')) return new Response(JSON.stringify({ scripts: [] }), { status: 200 });
				urls.push(String(url));
				return urls.length === 1 ? first.promise : new Response(JSON.stringify(coverageBody('Fresh Font')), { status: 200 });
			}),
		);
		render(FontRolesTable);
		const row = await screen.findByTestId('font-row-thai');
		const [select] = within(row).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(select, { target: { value: 'Noto Sans Thai' } });
		await waitFor(() => expect(urls.length).toBe(2));
		const params = new URL(urls[1], 'http://localhost').searchParams;
		expect(JSON.parse(params.get('scriptFonts') || '{}')).toEqual({ thai: 'Noto Sans Thai' });
		expect(params.get('dialogue')).toBe(DEFAULTS.typesetFont);
		await fireEvent.change(select, { target: { value: '__automatic__' } });
		await waitFor(() => expect(within(row).getAllByText('Automatic (Fresh Font)').length).toBeGreaterThan(0));
		// THE FIRST (OLDER) REQUEST RETURNS LAST; ITS ANSWER IS DROPPED
		first.resolve(new Response(JSON.stringify(coverageBody('Stale Font')), { status: 200 }));
		await new Promise((r) => setTimeout(r, 0));
		await tick();
		expect(within(row).queryByText('Automatic (Stale Font)')).toBeNull();
	});

	it('does not refetch coverage on an unrelated settings change', async () => {
		let coverageCalls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).startsWith('/api/system/fonts/coverage')) coverageCalls++;
				return new Response(JSON.stringify(coverageBody()), { status: 200 });
			}),
		);
		render(FontRolesTable);
		await waitFor(() => expect(coverageCalls).toBe(1));
		// A NEW BUT EQUAL SLOT MAP AND AN UNRELATED SETTING
		settings.update((s) => ({ ...s, typesetOutline: 'heavy', typesetScriptFonts: { ...s.typesetScriptFonts } }));
		await new Promise((r) => setTimeout(r, 300));
		expect(coverageCalls).toBe(1);
		// A REAL SLOT CHANGE DOES REFETCH
		settings.update((s) => ({ ...s, typesetScriptFonts: { thai: 'Noto Sans Thai' } }));
		await waitFor(() => expect(coverageCalls).toBe(2));
	});
});

// -- DIALOGUE FONT CASING FALLBACK (MOVED FROM SettingsModal.test.ts; THE FONT CARDS BECAME THE FONTS TABLE) -- //

describe('TypesettingTab Latin dialogue font', () => {
	it('falls back to uppercase casing when switching to CC Wild Words', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
		settings.set({ ...DEFAULTS, typesetFont: 'Friendly Sans', typesetCasing: 'lowercase', typesetAllCaps: false });
		render(TypesettingTab);
		const [latin] = within(screen.getByTestId('font-row-latin')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(latin, { target: { value: 'CC Wild Words' } });
		const s = get(settings);
		expect(s.typesetFont).toBe('CC Wild Words');
		expect(s.typesetCasing).toBe('uppercase');
		expect(s.typesetAllCaps).toBe(true);
	});
});

// -- EXACT PREVIEW (BUG 3) -- //

describe('TypesettingTab exact preview', () => {
	let previewResponse: () => Response;
	let previewBodies: any[];

	beforeEach(() => {
		previewBodies = [];
		previewResponse = () => new Response(new Blob(['img'], { type: 'image/webp' }), { status: 200 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (String(url) === '/api/typeset/preview') {
					previewBodies.push(JSON.parse(String(init?.body)));
					return previewResponse();
				}
				return new Response('{}', { status: 200 });
			}),
		);
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
	});

	it('sends the full effective style, and clears the image when an input changes', async () => {
		settings.update((s) => ({ ...s, typesetOutline: 'heavy', typesetPadding: 0.08, enableTypesetItalic: true, enableTextRotation: false }));
		render(TypesettingTab);
		await fireEvent.click(screen.getByTestId('render-exact-preview'));
		await waitFor(() => expect(screen.getByAltText('Exact typeset preview')).toBeTruthy());
		const { options, text } = previewBodies[0];
		const eff = get(effectiveTypeset);
		expect(options).toMatchObject({
			fontDialogue: DEFAULTS.typesetFont,
			casing: eff.casing,
			fontWeight: eff.weight,
			outlineMode: 'heavy',
			boxInset: 0.08,
			fontStyle: 'italic',
			enableRotation: false,
			scriptFonts: {},
		});
		// THE RAW SAMPLE: THE SERVER APPLIES THE CASING
		expect(text).toBe(get(settings).typesetPreviewText || 'Hold on! What is this Cultivation Realm...?!');

		await fireEvent.click(screen.getByText('Subtle boundary').closest('button')!);
		await tick();
		expect(screen.queryByAltText('Exact typeset preview')).toBeNull();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
	});

	it('Import font in an accent cell assigns the imported font to that cell only (FEAT-010)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (String(url) === '/api/system/fonts' && init?.method === 'POST') {
					return new Response(JSON.stringify({ success: true, font: { ...thaiFont, id: 'font-latin', name: 'My Latin', scriptType: 'dialogue', scripts: ['latin'] }, scripts: ['latin'], warnings: [] }), { status: 200 });
				}
				return new Response('{}', { status: 200 });
			}),
		);
		render(TypesettingTab);
		const [, accent] = within(screen.getByTestId('font-row-latin')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(accent, { target: { value: '__import__' } });
		const input = document.querySelectorAll<HTMLInputElement>('#custom-font-input')[0];
		await fireEvent.change(input, { target: { files: [new File(['x'], 'Some-Regular.ttf')] } });
		await fireEvent.click(screen.getByRole('button', { name: /Import Dialogue Font/ }));
		await waitFor(() => expect(get(settings).typesetAccentFonts.latin).toBe('My Latin'));
		expect(get(settings).typesetFont).toBe(DEFAULTS.typesetFont);
	});

	it('shows the accent callout in the default Sigmar One and sends it with the exact preview (FEAT-010)', async () => {
		settings.update((s) => ({ ...s, typesetAccentCasing: 'original' }));
		render(TypesettingTab);
		expect(screen.getByTestId('accent-preview').textContent?.trim()).toBe('Green Wood Sword Art');
		await fireEvent.click(screen.getByTestId('render-exact-preview'));
		await waitFor(() => expect(screen.getByAltText('Exact typeset preview')).toBeTruthy());
		expect(previewBodies[0].accentText).toBe('Green Wood Sword Art');
		expect(previewBodies[0].options).toMatchObject({ accentFonts: { latin: 'Sigmar One' }, accentCasing: 'original' });
		// CHANGING THE ACCENT FONT CLEARS THE STALE IMAGE
		settings.update((s) => ({ ...s, typesetAccentFonts: { latin: 'Lexend' } }));
		await tick();
		expect(screen.queryByAltText('Exact typeset preview')).toBeNull();
	});

	it('shows no accent callout and sends no accent sample when every accent cell is Off', async () => {
		settings.update((s) => ({ ...s, typesetAccentFonts: {} }));
		render(TypesettingTab);
		expect(screen.queryByTestId('accent-preview')).toBeNull();
		await fireEvent.click(screen.getByTestId('render-exact-preview'));
		await waitFor(() => expect(previewBodies.length).toBe(1));
		expect(previewBodies[0]).not.toHaveProperty('accentText');
	});

	it('an import without Latin letters from the Latin dialogue cell never becomes the dialogue font (restored guard)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (String(url) === '/api/system/fonts' && init?.method === 'POST') {
					return new Response(JSON.stringify({ success: true, font: { ...thaiFont }, scripts: ['thai'], warnings: [] }), { status: 200 });
				}
				return new Response('{}', { status: 200 });
			}),
		);
		render(TypesettingTab);
		const [dialogue] = within(screen.getByTestId('font-row-latin')).getAllByRole('combobox') as HTMLSelectElement[];
		await fireEvent.change(dialogue, { target: { value: '__import__' } });
		const input = document.querySelectorAll<HTMLInputElement>('#custom-font-input')[0];
		await fireEvent.change(input, { target: { files: [new File(['x'], 'MyThai-Regular.ttf')] } });
		await fireEvent.click(screen.getByRole('button', { name: /Import Dialogue Font/ }));
		await new Promise((r) => setTimeout(r, 0));
		await tick();
		expect(get(settings).typesetFont).toBe(DEFAULTS.typesetFont);
		expect(get(settings).typesetAccentFonts.latin).toBe('Sigmar One');
	});

	it("shows the server's error message, not the raw JSON body", async () => {
		previewResponse = () => new Response(JSON.stringify({ message: 'Preview request too large.' }), { status: 413 });
		render(TypesettingTab);
		await fireEvent.click(screen.getByTestId('render-exact-preview'));
		const err = await screen.findByTestId('exact-preview-error');
		expect(err.textContent).toMatch(/Preview request too large\./);
		expect(err.textContent).not.toMatch(/\{/);
	});
});
