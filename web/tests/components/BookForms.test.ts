import { describe, it, expect } from 'vitest';
import { validateForm } from '$lib/utils/form';
import { createBookSchema, updateBookSchema, createChapterSchema, updateChapterSchema } from '$lib/schemas';

describe('Book and Chapter Schema Form Validations', () => {
	it('validates createBookSchema requires non-empty title and validates length', () => {
		const emptyRes = validateForm(createBookSchema, {
			title: '',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
		});
		expect(emptyRes.success).toBe(false);
		expect(emptyRes.errors?.title).toBe('Book title is required');

		const validRes = validateForm(createBookSchema, {
			title: 'Tales of Demons and Gods',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
		});
		expect(validRes.success).toBe(true);
		expect(validRes.data?.title).toBe('Tales of Demons and Gods');
	});

	it('validates updateBookSchema accepts partial updates', () => {
		const res = validateForm(updateBookSchema, {
			title: 'Updated Title',
			pinned: true,
			archived: false,
		});
		expect(res.success).toBe(true);
		expect(res.data?.title).toBe('Updated Title');
		expect(res.data?.pinned).toBe(true);
	});

	it('validates createChapterSchema enforces title constraints', () => {
		const validRes = validateForm(createChapterSchema, {
			title: 'Chapter 1: The Awakening',
		});
		expect(validRes.success).toBe(true);
		expect(validRes.data?.title).toBe('Chapter 1: The Awakening');

		const tooLongRes = validateForm(createChapterSchema, {
			title: 'a'.repeat(250),
		});
		expect(tooLongRes.success).toBe(false);
		expect(tooLongRes.errors?.title).toBe('Chapter title cannot exceed 200 characters');
	});

	it('validates updateChapterSchema validates non-negative sequence number', () => {
		const validRes = validateForm(updateChapterSchema, {
			title: 'Chapter 2',
			seq: 1,
		});
		expect(validRes.success).toBe(true);
		expect(validRes.data?.seq).toBe(1);

		const negativeRes = validateForm(updateChapterSchema, {
			seq: -5,
		});
		expect(negativeRes.success).toBe(false);
		expect(negativeRes.errors?.seq).toBe('Sequence number must be non-negative');
	});

	it('validates createBookSchema accepts new metadata fields', () => {
		const res = validateForm(createBookSchema, {
			title: 'Star',
			description: 'A synopsis.',
			author: 'Er Gen',
			artist: 'Manga Artist',
			tags: ['Xianxia', 'Cultivation'],
			status: 'ongoing',
		});
		expect(res.success).toBe(true);
		expect(res.data?.description).toBe('A synopsis.');
		expect(res.data?.tags).toEqual(['Xianxia', 'Cultivation']);
		expect(res.data?.status).toBe('ongoing');
	});

	it('rejects invalid serialization statuses and oversized tag arrays', () => {
		const badStatus = validateForm(createBookSchema, { title: 'Star', status: 'airing' });
		expect(badStatus.success).toBe(false);

		const tooManyTags = validateForm(createBookSchema, {
			title: 'Star',
			tags: Array.from({ length: 31 }, (_, i) => `Tag ${i}`),
		});
		expect(tooManyTags.success).toBe(false);
	});

	it('validates updateBookSchema accepts nullable description and status', () => {
		const res = validateForm(updateBookSchema, {
			description: null,
			author: 'New Author',
			tags: ['Drama'],
			status: 'completed',
		});
		expect(res.success).toBe(true);
		expect(res.data?.description).toBeNull();
		expect(res.data?.status).toBe('completed');
	});

	it('detects when book fields are unchanged versus modified for save button enabling', () => {
		const originalBook = {
			title: 'A Will Eternal',
			titleTarget: 'Yi Nian Yong Heng',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			pinned: false,
			archived: false,
			description: 'Cultivation novel.',
			author: 'Er Gen',
			artist: null as string | null,
			tags: ['Cultivation', 'Comedy'],
			status: 'ongoing',
		};

		function hasChanges(current: typeof originalBook) {
			return Boolean(
				current.title.trim() !== (originalBook.title || '').trim() ||
					(current.titleTarget.trim() || null) !== (originalBook.titleTarget?.trim() || null) ||
					current.sourceLang !== originalBook.sourceLang ||
					current.targetLang !== originalBook.targetLang ||
					current.pinned !== !!originalBook.pinned ||
					current.archived !== !!originalBook.archived ||
					(current.description.trim() || null) !== (originalBook.description?.trim() || null) ||
					(current.author.trim() || null) !== (originalBook.author?.trim() || null) ||
					(current.artist?.trim() || null) !== (originalBook.artist?.trim() || null) ||
					(current.status || 'unknown') !== (originalBook.status || 'unknown') ||
					JSON.stringify(current.tags || []) !== JSON.stringify(originalBook.tags || [])
			);
		}

		// IDENTICAL FIELDS
		expect(hasChanges({ ...originalBook })).toBe(false);

		// TITLE MODIFIED
		expect(hasChanges({ ...originalBook, title: 'A Will Eternal 2' })).toBe(true);

		// WHITESPACE-ONLY CHANGE IN TITLE
		expect(hasChanges({ ...originalBook, title: '  A Will Eternal  ' })).toBe(false);

		// WHITESPACE-ONLY CHANGE IN OPTIONAL FIELDS
		expect(hasChanges({ ...originalBook, description: '  Cultivation novel.  ' })).toBe(false);
		expect(hasChanges({ ...originalBook, author: '  Er Gen  ' })).toBe(false);

		// PIN TOGGLED
		expect(hasChanges({ ...originalBook, pinned: true })).toBe(true);

		// ARCHIVE TOGGLED
		expect(hasChanges({ ...originalBook, archived: true })).toBe(true);

		// TAGS CHANGED
		expect(hasChanges({ ...originalBook, tags: ['Cultivation'] })).toBe(true);

		// LANGUAGE CHANGED
		expect(hasChanges({ ...originalBook, targetLang: 'es' })).toBe(true);
	});
});
