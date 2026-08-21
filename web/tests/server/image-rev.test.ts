// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
// IMPORTED MODULES
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, seedRegion } from '../helpers/db';
import { pages as pagesTable } from '$lib/server/db/schema';
import { resetPageProgress } from '$lib/server/chapters/mutations';
import { updateRegionTranslation } from '$lib/server/chapters/reader';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		readFileSync: vi.fn(() => Buffer.from('fake-cleaned-image-bytes')),
		mkdirSync: vi.fn(),
		writeFileSync: vi.fn(),
	};
});
vi.mock('$lib/server/typeset', () => ({
	typesetPage: vi.fn(async () => Buffer.from('fake-typeset-output')),
}));

describe('image revision bumps', () => {
	beforeEach(async () => {
		await resetDb();
	});

	function seed(db: ReturnType<typeof getTestDb>) {
		seedBook(db, { id: 'book-a' });
		const chapter = seedChapter(db, { bookId: 'book-a', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, cleanedRev: 1, outputRev: 2 });
		return { chapter, page };
	}

	function getRevs(db: ReturnType<typeof getTestDb>, pageId: number) {
		const row = db.select().from(pagesTable).where(eq(pagesTable.id, pageId)).get();
		return { cleanedRev: row!.cleanedRev, outputRev: row!.outputRev, originalRev: row!.originalRev };
	}

	it('manual translation edit bumps only the output rev', async () => {
		const db = getTestDb();
		const { page } = seed(db);
		db.update(pagesTable).set({ cleanedPath: 'clean/0/0.png' }).where(eq(pagesTable.id, page.id)).run();
		const region = seedRegion(db, { pageId: page.id, seq: 0, textSource: '你好' });

		const before = getRevs(db, page.id);
		await updateRegionTranslation(page.id, region.id, 'hello', 'data-root');
		const after = getRevs(db, page.id);

		expect(after.cleanedRev).toBe(before.cleanedRev);
		expect(after.outputRev).toBe(before.outputRev + 1);
	});

	it('manual translation edit without a cleaned image leaves revs untouched', async () => {
		const db = getTestDb();
		const { page } = seed(db);
		const region = seedRegion(db, { pageId: page.id, seq: 0, textSource: '你好' });

		const before = getRevs(db, page.id);
		await updateRegionTranslation(page.id, region.id, 'hello', 'data-root-does-not-matter');
		const after = getRevs(db, page.id);

		expect(after).toEqual(before);
	});

	it('resetPageProgress keeps revisions monotonic (never reuses rev numbers)', () => {
		const db = getTestDb();
		const { page } = seed(db);

		resetPageProgress(page.id, 'data-root');
		const after = getRevs(db, page.id);

		expect(after.cleanedRev).toBe(1);
		expect(after.outputRev).toBe(2);
		expect(after.originalRev).toBe(0);
	});
});
