// IMPORTED DEP-MODULES
import { describe, it, expect } from 'vitest';

// IMPORTED MODULES
import {
	naturalCompare,
	isImageFile,
	parseChapterSeqHint,
	parseFileList,
} from '$lib/utils/folder-drop';

// -- TESTS -- //

describe('folder-drop utility', () => {
	it('naturalCompare sorts numeric filenames correctly', () => {
		const files = ['page_10.jpg', 'page_1.jpg', 'page_2.jpg', 'page_20.jpg', 'page_3.jpg'];
		files.sort(naturalCompare);
		expect(files).toEqual(['page_1.jpg', 'page_2.jpg', 'page_3.jpg', 'page_10.jpg', 'page_20.jpg']);
	});

	it('isImageFile recognizes supported image extensions and mimes', () => {
		const webp = new File([''], 'test.webp', { type: 'image/webp' });
		const pngNoMime = new File([''], 'test.PNG', { type: '' });
		const txt = new File([''], 'readme.txt', { type: 'text/plain' });
		const zip = new File([''], 'archive.zip', { type: 'application/zip' });

		expect(isImageFile(webp)).toBe(true);
		expect(isImageFile(pngNoMime)).toBe(true);
		expect(isImageFile(txt)).toBe(false);
		expect(isImageFile(zip)).toBe(false);
	});

	it('parseChapterSeqHint extracts numbers from various chapter folder names', () => {
		expect(parseChapterSeqHint('Ch. 05 - The Encounter')).toEqual({
			title: 'Ch. 05 - The Encounter',
			seqHint: 5,
		});

		expect(parseChapterSeqHint('Chapter 123')).toEqual({
			title: 'Chapter 123',
			seqHint: 123,
		});

		expect(parseChapterSeqHint('第15话 觉醒')).toEqual({
			title: '第15话 觉醒',
			seqHint: 15,
		});

		expect(parseChapterSeqHint('001 - Prologue')).toEqual({
			title: '001 - Prologue',
			seqHint: 1,
		});

		expect(parseChapterSeqHint('Extra Illustrations')).toEqual({
			title: 'Extra Illustrations',
			seqHint: null,
		});
	});

	it('parseFileList correctly groups multi-chapter folder paths', async () => {
		const f1 = new File([''], '01.webp', { type: 'image/webp' });
		Object.defineProperty(f1, 'webkitRelativePath', { value: 'Manga/Ch. 01/01.webp' });

		const f2 = new File([''], '02.webp', { type: 'image/webp' });
		Object.defineProperty(f2, 'webkitRelativePath', { value: 'Manga/Ch. 01/02.webp' });

		const f3 = new File([''], '01.webp', { type: 'image/webp' });
		Object.defineProperty(f3, 'webkitRelativePath', { value: 'Manga/Ch. 02/01.webp' });

		const result = await parseFileList([f1, f2, f3]);
		expect(result.isMultiChapter).toBe(true);
		expect(result.totalImages).toBe(3);
		expect(result.chapters.length).toBe(2);
		expect(result.chapters[0].title).toBe('Ch. 01');
		expect(result.chapters[0].files.length).toBe(2);
		expect(result.chapters[1].title).toBe('Ch. 02');
		expect(result.chapters[1].files.length).toBe(1);
	});
});
