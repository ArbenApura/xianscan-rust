import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, seedRegion } from '../helpers/db';
import { pages, regions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { PATCH } from '../../src/routes/api/pages/[id]/regions/[regionId]/+server';
import { POST as typesetPOST } from '../../src/routes/api/pages/[id]/typeset/+server';

vi.mock('$lib/server/db', async () => ({
	db: (await import('../helpers/db')).getTestDb(),
}));

vi.mock('$lib/server/chapters', async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		retypesetPage: vi.fn(async (pageId: number) => ({
			outputPath: `output/1/retypeset-${pageId}.webp`,
		})),
	};
});

describe('Page Region Translation Edit & Retypeset API', () => {
	beforeEach(() => {
		resetDb();
	});

	it('updates region target translation and retypesets the page', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book-1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const region = seedRegion(db, {
			pageId: page.id,
			seq: 0,
			textSource: '你好世界',
		});

		// Seed initial AI translation
		db.update(regions)
			.set({ textTarget: 'Hello World', originalTarget: 'Hello World', status: 'translated' })
			.where(eq(regions.id, region.id))
			.run();

		// Call PATCH endpoint with manual edit
		const request = new Request('http://localhost/api/pages/1/regions/1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				textTarget: 'Greetings, Planet Earth!',
				action: 'save',
			}),
		});

		const response = await PATCH({
			params: { id: String(page.id), regionId: String(region.id) },
			request,
		} as any);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.success).toBe(true);
		expect(json.region.textTarget).toBe('Greetings, Planet Earth!');
		expect(json.region.originalTarget).toBe('Hello World');

		// Verify DB state
		const [dbRegion] = db.select().from(regions).where(eq(regions.id, region.id)).all();
		expect(dbRegion.textTarget).toBe('Greetings, Planet Earth!');
		expect(dbRegion.originalTarget).toBe('Hello World');
	});

	it('resets region to default AI translation when action is reset_ai', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book-1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const region = seedRegion(db, {
			pageId: page.id,
			seq: 0,
			textSource: '你好世界',
		});

		// Seed with manual edit and originalTarget
		db.update(regions)
			.set({ textTarget: 'Manual Overridden Text', originalTarget: 'Hello World', status: 'translated' })
			.where(eq(regions.id, region.id))
			.run();

		// Call PATCH endpoint with reset_ai
		const request = new Request('http://localhost/api/pages/1/regions/1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'reset_ai',
			}),
		});

		const response = await PATCH({
			params: { id: String(page.id), regionId: String(region.id) },
			request,
		} as any);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.region.textTarget).toBe('Hello World');
		expect(json.region.originalTarget).toBe('Hello World');

		// Verify in DB
		const [dbRegion] = db.select().from(regions).where(eq(regions.id, region.id)).all();
		expect(dbRegion.textTarget).toBe('Hello World');
	});

	it('triggers page retypesetting on POST /api/pages/[id]/typeset', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'book-1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0 });

		const request = new Request('http://localhost/api/pages/1/typeset', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});

		const response = await typesetPOST({
			params: { id: String(page.id) },
			request,
		} as any);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.success).toBe(true);
		expect(json.outputPath).toContain('retypeset-');
	});
});
