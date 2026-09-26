/**
 * @vitest-environment jsdom
 */
// A SYSTEM FONT THAT CANNOT BE LOADED (NOT INSTALLED) IS REQUESTED ONCE, NOT ON EVERY SETTINGS WRITE
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSystemBrowserFontFace, unloadBrowserFontFace } from '$lib/stores/settings';

const requested: string[] = [];

beforeEach(() => {
	requested.length = 0;
	// FONT FACE STUB: EVERY LOAD FAILS, LIKE A 404 FROM THE SYSTEM FONT ROUTE
	vi.stubGlobal(
		'FontFace',
		class {
			constructor(_family: string, source: string) {
				requested.push(source);
			}
			load() {
				return Promise.reject(new Error('404'));
			}
		},
	);
	Object.defineProperty(document, 'fonts', { value: { add: vi.fn() }, configurable: true });
});

afterEach(() => {
	vi.unstubAllGlobals();
	unloadBrowserFontFace('Missing Sans');
});

describe('loadSystemBrowserFontFace', () => {
	it('does not request a family again after it failed to load', async () => {
		expect(await loadSystemBrowserFontFace('Missing Sans')).toBe(false);
		expect(await loadSystemBrowserFontFace('Missing Sans')).toBe(false);
		expect(await loadSystemBrowserFontFace('Missing Sans')).toBe(false);
		expect(requested).toHaveLength(1);
	});

	it('retries when the user enables the font again', async () => {
		await loadSystemBrowserFontFace('Missing Sans');
		await loadSystemBrowserFontFace('Missing Sans', true);
		expect(requested).toHaveLength(2);
	});
});
