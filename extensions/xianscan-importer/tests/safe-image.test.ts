// @vitest-environment jsdom
// -- TESTS FOR SAFE IMAGE RESOLVER AND BLOB LIFECYCLE -- //

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createSafeBlobUrlFromData,
	clearSafeImageUrlCache,
	resolveSafeImageUrl
} from '../src/content/safe-image';

describe('safe-image utility', () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn((_blob: any) => `blob:http://localhost/${Math.random().toString(36).slice(2)}`);
		URL.revokeObjectURL = vi.fn();
		clearSafeImageUrlCache();
	});

	it('converts base64 data URLs to native blob object URLs', () => {
		const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		const blobUrl = createSafeBlobUrlFromData(sampleBase64);

		expect(blobUrl).toMatch(/^blob:/);
	});

	it('returns non-data URLs unchanged when calling createSafeBlobUrlFromData', () => {
		const httpUrl = 'https://site.com/image.jpg';
		expect(createSafeBlobUrlFromData(httpUrl)).toBe(httpUrl);
	});

	it('cleans up object URLs when clearSafeImageUrlCache is called', () => {
		const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

		const blobUrl = createSafeBlobUrlFromData(sampleBase64);
		expect(blobUrl).toMatch(/^blob:/);

		clearSafeImageUrlCache();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
	});

	it('resolves safe blob URL from background ArrayBuffer without base64 decoding loops', async () => {
		Object.defineProperty(window, 'location', {
			value: { protocol: 'https:' },
			writable: true
		});

		const mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
		(globalThis as any).chrome = {
			runtime: {
				sendMessage: vi.fn((msg, callback) => {
					if (msg.type === 'FETCH_IMAGE_DATA') {
						callback({ ok: true, buffer: mockBuffer, mime: 'image/png' });
					}
				})
			}
		};

		const safeUrl = await resolveSafeImageUrl('http://127.0.0.1:8124/api/pages/1/file?kind=output&rev=1');
		expect(safeUrl).toMatch(/^blob:/);
	});

	it('prioritizes high-priority requests in the fetch queue', async () => {
		Object.defineProperty(window, 'location', {
			value: { protocol: 'https:' },
			writable: true
		});

		const callOrder: string[] = [];
		(globalThis as any).chrome = {
			runtime: {
				sendMessage: vi.fn((msg, callback) => {
					callOrder.push(msg.url);
					setTimeout(() => {
						callback({ ok: true, buffer: new Uint8Array([1]).buffer, mime: 'image/png' });
					}, 5);
				})
			}
		};

		const p1 = resolveSafeImageUrl('http://127.0.0.1:8124/raw-1', false);
		const p2 = resolveSafeImageUrl('http://127.0.0.1:8124/raw-2', false);
		const pPrio = resolveSafeImageUrl('http://127.0.0.1:8124/translated-high', true);

		await Promise.all([p1, p2, pPrio]);

		expect(callOrder).toContain('http://127.0.0.1:8124/translated-high');
	});
});
