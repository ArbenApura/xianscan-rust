// USER-FACING UPLOAD AND EXPORT MESSAGES (AUDIT: BROKEN #3, MISSING #15, WRONG #4/#5)
import { describe, expect, it } from 'vitest';
import { chapterUploadErrorMessage } from '$lib/utils/upload';
import { zipExportToast } from '$lib/utils/chapter-export';
import { INPAINT_MODES } from '$lib/stores/settings';

describe('chapterUploadErrorMessage', () => {
	it('keeps the server reason for an image over the pixel limit', async () => {
		const res = new Response(JSON.stringify({ message: '"huge.png": huge.png is 20000 x 8000 (160 MP); the limit is 100 MP.' }), {
			status: 422,
			headers: { 'content-type': 'application/json' },
		});
		expect(await chapterUploadErrorMessage('Chapter 3', res)).toBe(
			'Failed to upload images for "Chapter 3": "huge.png": huge.png is 20000 x 8000 (160 MP); the limit is 100 MP.',
		);
	});

	it('falls back to the status when the body has no message', async () => {
		const res = new Response('Payload Too Large', { status: 413 });
		expect(await chapterUploadErrorMessage('Chapter 3', res)).toBe('Failed to upload images for "Chapter 3" (HTTP 413).');
	});
});

describe('zipExportToast', () => {
	it('is a plain success when nothing is missing', () => {
		expect(zipExportToast(null)).toEqual({ kind: 'success', message: 'ZIP exported.' });
		expect(zipExportToast('0')).toEqual({ kind: 'success', message: 'ZIP exported.' });
	});

	it('warns and points at MISSING_PAGES.txt when pages were left out', () => {
		expect(zipExportToast('2')).toEqual({
			kind: 'warning',
			message: 'ZIP exported. 2 pages could not be included; see MISSING_PAGES.txt.',
		});
		expect(zipExportToast('1').message).toBe('ZIP exported. 1 page could not be included; see MISSING_PAGES.txt.');
	});
});

describe('inpaint mode descriptions', () => {
	const mode = (id: string) => INPAINT_MODES.find((m) => m.id === id)!;

	it('describes scaled as aspect-kept 512 px tiles, not a 512x512 squash', () => {
		const scaled = mode('scaled');
		expect(`${scaled.label} ${scaled.blurb}`).not.toMatch(/512x512|memory-efficient/i);
		expect(scaled.blurb).toMatch(/tiles/i);
		expect(scaled.blurb).toMatch(/aspect ratio/i);
		expect(scaled.blurb).toMatch(/slower on very tall/i);
	});

	it('describes full as banded with bounded memory, not a one-pass high-VRAM run', () => {
		const full = mode('full');
		expect(full.blurb).not.toMatch(/high VRAM|entire uncut image/i);
		expect(full.blurb).toMatch(/bands/i);
	});

	it('uses no em dashes', () => {
		for (const m of INPAINT_MODES) expect(`${m.label}${m.tag}${m.blurb}`).not.toContain(String.fromCharCode(0x2014));
	});
});
