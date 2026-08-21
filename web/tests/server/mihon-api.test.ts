// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { books } from '$lib/server/db/schema';
import {
	getLibraryPage,
	getSearchPage,
	getMangaDetail,
	getChaptersDto,
	getPagesDto,
	getGenresDto,
} from '$lib/server/mihon';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
});

// -- TESTS -- //

describe('mihon API builders', () => {
	it('builds a SManga-shaped DTO', () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1', title: '星尘' });
		db.update(books)
			.set({
				titleTarget: 'Stardust',
				author: 'Er Gen',
				artist: 'Manga Artist',
				description: 'd',
				tags: JSON.stringify(['Xianxia', 'Cultivation']),
				status: 'ongoing',
			})
			.where(eq(books.id, 'b1'))
			.run();

		const dto = getMangaDetail('b1');
		expect(dto.title).toBe('Stardust');
		expect(dto.author).toBe('Er Gen');
		expect(dto.artist).toBe('Manga Artist');
		expect(dto.genre).toBe('Xianxia, Cultivation');
		expect(dto.status).toBe('ongoing');
		expect(dto.url).toBe('/api/mihon/manga/b1');
		expect(dto.thumbnailUrl).toBe('/api/covers/b1/file?w=512');
		expect(dto.initialized).toBe(true);
	});

	it('paginates the library and filters by status', () => {
		const db = getTestDb();
		for (let i = 0; i < 3; i++) seedBook(db, { id: `b${i}` });
		db.update(books).set({ status: 'completed' }).where(eq(books.id, 'b0')).run();
		db.update(books).set({ status: 'ongoing' }).where(eq(books.id, 'b1')).run();

		const page1 = getLibraryPage(1, {});
		expect(page1.books.length).toBe(3);
		expect(page1.hasNextPage).toBe(false);

		const ongoing = getLibraryPage(1, { status: 'ongoing' });
		expect(ongoing.books.map((b) => b.id)).toEqual(['b1']);
	});

	it('filters by genre and searches by title', () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1', title: 'Tales of Demons' });
		seedBook(db, { id: 'b2', title: 'Rise of Ghost' });
		db.update(books)
			.set({ tags: JSON.stringify(['Action']) })
			.where(eq(books.id, 'b1'))
			.run();

		const action = getSearchPage(1, { q: '', genre: 'Action' });
		expect(action.books.map((b) => b.id)).toEqual(['b1']);

		const searched = getSearchPage(1, { q: 'demons' });
		expect(searched.books.map((b) => b.id)).toEqual(['b1']);
	});

	it('maps chapters and pages to the extension DTO shapes', () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0, title: 'Ch 1' });
		const page = seedPage(db, {
			chapterId: chapter.id,
			seq: 0,
			filePath: 'uploads/x.png',
			outputPath: 'output/1/0.webp',
			outputRev: 3,
		});

		const chapters = getChaptersDto('b1');
		expect(chapters[0].name).toBe('Ch 1');
		expect(chapters[0].chapterNumber).toBe(1);
		expect(chapters[0].url).toBe(`/api/mihon/chapters/${chapter.id}`);

		const pages = getPagesDto(chapter.id);
		expect(pages[0].index).toBe(0);
		expect(pages[0].imageUrl).toBe(`/api/pages/${page.id}/file?kind=output&rev=3`);
	});

	it('lists distinct genres', () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		seedBook(db, { id: 'b2' });
		db.update(books)
			.set({ tags: JSON.stringify(['Action', 'Drama']) })
			.where(eq(books.id, 'b1'))
			.run();
		db.update(books)
			.set({ tags: JSON.stringify(['Drama', 'Fantasy']) })
			.where(eq(books.id, 'b2'))
			.run();

		expect(getGenresDto().sort()).toEqual(['Action', 'Drama', 'Fantasy']);
	});
});
