// THE FONT CATALOG KEEPS EACH IMPORTED FONT'S SCRIPTS: THE SERVER SENDS THEM AS A JSON STRING, AND DROPPING THEM HID
// A LATIN + DEVANAGARI FONT FROM ITS HINDI SLOT AND FROM THE SCRIPT FONTS LIST
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { customFontsStore, refreshFontAvailability, getMergedScriptFonts } from '$lib/stores/settings';

afterEach(() => {
	vi.unstubAllGlobals();
	customFontsStore.set([]);
});

describe('refreshFontAvailability', () => {
	it('parses the scripts of imported fonts so they are offered in their script slot', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						success: true,
						fonts: {},
						customFonts: [
							{ id: 'f1', name: 'NotoSansDevanagari', fileName: 'x.ttf', format: 'truetype', scriptType: 'dialogue', fileSize: 1, supportedWeights: '["normal","bold"]', isVariable: 1, scripts: '["latin","devanagari"]' },
						],
					}),
					{ status: 200 },
				),
			),
		);
		await refreshFontAvailability();
		expect(get(customFontsStore)[0].scripts).toEqual(['latin', 'devanagari']);
		const offered = getMergedScriptFonts('devanagari', get(customFontsStore), [], []).map((o) => o.id);
		expect(offered).toContain('NotoSansDevanagari');
	});
});
