// USER-FACING UPLOAD AND EXPORT MESSAGES (AUDIT: BROKEN #3, MISSING #15, WRONG #4/#5)
import { describe, expect, it } from 'vitest';
import { chapterUploadErrorMessage } from '$lib/utils/upload';
import { chapterArchiveName, zipContentDisposition, zipExportToast } from '$lib/utils/chapter-export';
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

describe('chapterArchiveName', () => {
	it('keeps letters of every script, so a CJK or Hangul title is not reduced to chapter_<id>', () => {
		expect(chapterArchiveName('第12话 重生', 'chapter_7')).toBe('第12话_重生');
		expect(chapterArchiveName('제 3화', 'chapter_7')).toBe('제_3화');
		expect(chapterArchiveName('The End', 'chapter_7')).toBe('The_End');
	});

	it('drops characters that are unsafe in file names and falls back when nothing is left', () => {
		expect(chapterArchiveName('a/b:c*?"<>|d', 'chapter_7')).toBe('abcd');
		expect(chapterArchiveName('  ...  ', 'chapter_7')).toBe('chapter_7');
		expect(chapterArchiveName(null, 'chapter_7')).toBe('chapter_7');
	});
});

describe('zipContentDisposition', () => {
	it('sends an ASCII filename plus the full UTF-8 name, since headers only carry Latin-1', () => {
		const header = zipContentDisposition('第12话', 'chapter_7');
		expect(header).toBe(`attachment; filename="12.zip"; filename*=UTF-8''${encodeURIComponent('第12话.zip')}`);
		expect(zipContentDisposition('重生', 'chapter_7')).toContain('filename="chapter_7.zip"');
		expect(zipContentDisposition('The_End', 'chapter_7')).toContain('filename="The_End.zip"');
	});
});
