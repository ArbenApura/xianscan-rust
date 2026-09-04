import { describe, it, expect } from 'vitest';
import { buildSliceThumbnailUrl } from '../src/popup/views/tracker-view';

describe('buildSliceThumbnailUrl', () => {
	const baseUrl = 'http://127.0.0.1:8124';

	it('generates thumbnail URL for pending/original slice cards', () => {
		const url = buildSliceThumbnailUrl(baseUrl, 101, 'original', 1);
		expect(url).toBe('http://127.0.0.1:8124/api/pages/101/file?kind=thumb&target=original&w=240&rev=1');
	});

	it('generates thumbnail URL for translated/output slice cards', () => {
		const url = buildSliceThumbnailUrl(baseUrl, 101, 'output', 2);
		expect(url).toBe('http://127.0.0.1:8124/api/pages/101/file?kind=thumb&target=output&w=240&rev=2');
	});

	it('supports custom thumbnail width parameter', () => {
		const url = buildSliceThumbnailUrl(baseUrl, 101, 'output', 1, 320);
		expect(url).toBe('http://127.0.0.1:8124/api/pages/101/file?kind=thumb&target=output&w=320&rev=1');
	});

	it('preserves revision number for cache busting', () => {
		const urlRev5 = buildSliceThumbnailUrl(baseUrl, 205, 'output', 5);
		expect(urlRev5).toContain('rev=5');
		expect(urlRev5).toContain('kind=thumb');
		expect(urlRev5).toContain('target=output');
	});

	it('supports rev 0 default for untranslated pages', () => {
		const urlRev0 = buildSliceThumbnailUrl(baseUrl, 301, 'original', 0);
		expect(urlRev0).toBe('http://127.0.0.1:8124/api/pages/301/file?kind=thumb&target=original&w=240&rev=0');
	});

	it('defensively sanitizes trailing slashes from baseUrl', () => {
		const urlWithSlash = buildSliceThumbnailUrl('http://127.0.0.1:8124///', 404, 'output', 1);
		expect(urlWithSlash).toBe('http://127.0.0.1:8124/api/pages/404/file?kind=thumb&target=output&w=240&rev=1');
	});
});
