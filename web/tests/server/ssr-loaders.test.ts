import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { getBooksWithTelemetry, getBookDetails, assertBookExists } from '$lib/server/books';
import { getChapterReaderData, assertChapterExists } from '$lib/server/chapters';
import { getGlossaryPage } from '$lib/server/glossary';
import { books, chapters, pages, regions, glossary } from '$lib/server/db/schema';

describe('SSR Data Loaders and Services', () => {
	beforeEach(async () => {
		resetDb();
	});

	it('getBooksWithTelemetry returns all books with rich metadata & telemetry', async () => {
		const db = getTestDb();
		db.insert(books)
			.values([
				{
					id: 'book-1',
					title: 'Martial Peak',
					titleTarget: 'Martial Peak EN',
					sourceLang: 'zh-CN',
					targetLang: 'en',
					pinned: true,
					updatedAt: 1000,
				},
				{
					id: 'book-2',
					title: 'Solo Leveling',
					sourceLang: 'ko',
					targetLang: 'en',
					pinned: false,
					updatedAt: 500,
				},
			])
			.run();

		db.insert(chapters)
			.values([
				{ id: 10, bookId: 'book-1', seq: 0, title: 'Chapter 1', status: 'done' },
				{ id: 11, bookId: 'book-1', seq: 1, title: 'Chapter 2', status: 'pending' },
			])
			.run();

		db.insert(pages)
			.values([
				{ id: 100, chapterId: 10, seq: 0, filePath: 'uploads/10/p0.webp', outputPath: 'output/10/p0.webp', status: 'done' },
				{ id: 101, chapterId: 10, seq: 1, filePath: 'uploads/10/p1.webp', outputPath: 'output/10/p1.webp', status: 'done' },
				{ id: 102, chapterId: 11, seq: 0, filePath: 'uploads/11/p0.webp', status: 'pending' },
			])
			.run();

		const result = await getBooksWithTelemetry();
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe('book-1');
		expect(result[0].pinned).toBe(true);
		expect(result[0].chapterCount).toBe(2);
		expect(result[0].translatedChapterCount).toBe(1);
		expect(result[0].pageCount).toBe(3);
		expect(result[0].translatedPageCount).toBe(2);
		expect(result[0].coverPageId).toBe(100);
		expect(result[0].coverHasOutput).toBe(true);
		expect(result[0].latestChapter?.id).toBe(11);

		expect(result[1].id).toBe('book-2');
		expect(result[1].chapterCount).toBe(0);
	});

	it('getBookDetails returns single book metadata and chapters with page counts', async () => {
		const db = getTestDb();
		db.insert(books)
			.values({
				id: 'book-1',
				title: 'Tower of God',
				sourceLang: 'ko',
				targetLang: 'en',
			})
			.run();

		db.insert(chapters)
			.values([
				{ id: 20, bookId: 'book-1', seq: 0, title: 'Floor 1', status: 'done' },
				{ id: 21, bookId: 'book-1', seq: 1, title: 'Floor 2', status: 'pending' },
			])
			.run();

		db.insert(pages)
			.values([
				{ id: 200, chapterId: 20, seq: 0, filePath: 'uploads/20/p0.webp', status: 'done' },
			])
			.run();

		const detail = await getBookDetails('book-1');
		expect(detail.book.title).toBe('Tower of God');
		expect(detail.chapters).toHaveLength(2);
		expect(detail.chapters[0].id).toBe(20);
		expect(detail.chapters[0].pageCount).toBe(1);
		expect(detail.chapters[0].status).toBe('done');
		expect(detail.chapters[1].pageCount).toBe(0);
		expect(detail.chapters[1].status).toBe('pending');
	});

	it('getBookDetails throws 404 for nonexistent book', async () => {
		await expect(getBookDetails('nonexistent')).rejects.toThrow();
	});

	it('getChapterReaderData returns chapter navigation and all pages with OCR regions', async () => {
		const db = getTestDb();
		db.insert(books)
			.values({
				id: 'book-1',
				title: 'Nano Machine',
				sourceLang: 'ko',
				targetLang: 'en',
			})
			.run();

		db.insert(chapters)
			.values([
				{ id: 30, bookId: 'book-1', seq: 0, title: 'Prologue' },
				{ id: 31, bookId: 'book-1', seq: 1, title: 'Episode 1' },
				{ id: 32, bookId: 'book-1', seq: 2, title: 'Episode 2' },
			])
			.run();

		db.insert(pages)
			.values([
				{ id: 300, chapterId: 31, seq: 0, filePath: 'uploads/31/p0.webp', outputPath: 'output/31/p0.webp', status: 'done' },
			])
			.run();

		db.insert(regions)
			.values([
				{
					id: 1,
					pageId: 300,
					seq: 0,
					box: JSON.stringify([10, 10, 100, 50]),
					textSource: '안녕하세요',
					textTarget: 'Hello',
					conf: 0.98,
				},
			])
			.run();

		const readerData = await getChapterReaderData(31);
		expect(readerData.chapter.id).toBe(31);
		expect(readerData.chapter.title).toBe('Episode 1');
		expect(readerData.prevChapter?.id).toBe(30);
		expect(readerData.nextChapter?.id).toBe(32);
		expect(readerData.pages).toHaveLength(1);
		expect(readerData.pages[0].regions).toHaveLength(1);
		expect(readerData.pages[0].regions[0].textTarget).toBe('Hello');
	});

	it('getGlossaryPage returns paginated glossary rows with total count', async () => {
		const db = getTestDb();
		db.insert(glossary)
			.values([
				{
					scope: 'global',
					sourceLang: 'zh-CN',
					targetLang: 'en',
					source: '丹药',
					target: 'Elixir',
					gender: 'neuter',
					status: 'user',
				},
				{
					scope: 'global',
					sourceLang: 'zh-CN',
					targetLang: 'en',
					source: '灵气',
					target: 'Spiritual Qi',
					gender: 'neuter',
					status: 'user',
				},
			])
			.run();

		const pageData = await getGlossaryPage('global', null, {
			limit: 10,
			offset: 0,
			pair: { sourceLang: 'zh-CN', targetLang: 'en' },
		});

		expect(pageData.total).toBe(2);
		expect(pageData.rows).toHaveLength(2);
		expect(pageData.rows.map((r) => r.source)).toContain('丹药');
		expect(pageData.rows.map((r) => r.source)).toContain('灵气');
	});
});
