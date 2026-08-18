import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';
import { nextPageSeq, reorderPages, deletePage, compactChapterPageSeqs } from '$lib/server/chapters';
import { chapters, pages, regions, translations } from '$lib/server/db/schema';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- STATES -- //

let db: TestDb;

// -- LIFECYCLES -- //

beforeEach(() => {
	db = getTestDb();
	resetDb();
});

// -- TESTS -- //

describe('nextPageSeq & reorderPages', () => {
	it('starts at 0 for an empty chapter', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		expect(nextPageSeq(chapter.id)).toBe(0);
	});

	it('continues after the highest existing seq (regression: every upload used to restart at 0)', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 1 });
		expect(nextPageSeq(chapter.id)).toBe(2);
	});

	it('is per-chapter (other chapters do not affect the counter)', () => {
		seedBook(db, { id: 'b1' });
		const c1 = seedChapter(db, { bookId: 'b1', seq: 0 });
		const c2 = seedChapter(db, { bookId: 'b1', seq: 1 });
		seedPage(db, { chapterId: c1.id, seq: 0 });
		seedPage(db, { chapterId: c1.id, seq: 1 });
		seedPage(db, { chapterId: c1.id, seq: 2 });
		expect(nextPageSeq(c1.id)).toBe(3);
		expect(nextPageSeq(c2.id)).toBe(0);
	});

	it('inserting at the returned seq never collides (the original 500)', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0 });
		const seq = nextPageSeq(chapter.id);
		expect(() => {
			db.insert(pages).values({ chapterId: chapter.id, seq, filePath: 'uploads/x.png' }).run();
		}).not.toThrow();
		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).all();
		expect(rows).toHaveLength(2);
	});

	it('reorders page sequence numbers without unique index collisions', () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1 });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 2 });

		// REVERSE THE ORDER: [p2, p1, p0]
		reorderPages(chapter.id, [p2.id, p1.id, p0.id]);

		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows).toHaveLength(3);
		expect(rows[0].id).toBe(p2.id);
		expect(rows[0].seq).toBe(0);
		expect(rows[1].id).toBe(p1.id);
		expect(rows[1].seq).toBe(1);
		expect(rows[2].id).toBe(p0.id);
		expect(rows[2].seq).toBe(2);
	});

	it('reorderPages safely handles partial ID arrays by appending omitted pages', () => {
		seedBook(db, { id: 'b_partial' });
		const chapter = seedChapter(db, { bookId: 'b_partial', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1 });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 2 });

		// ONLY PASS p2
		reorderPages(chapter.id, [p2.id]);

		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows).toHaveLength(3);
		expect(rows[0].id).toBe(p2.id);
		expect(rows[0].seq).toBe(0);
		expect(rows[1].id).toBe(p0.id);
		expect(rows[1].seq).toBe(1);
		expect(rows[2].id).toBe(p1.id);
		expect(rows[2].seq).toBe(2);
	});

	it('deletePage removes disk records and renumbers remaining pages contiguously (no gaps)', () => {
		seedBook(db, { id: 'b_del' });
		const chapter = seedChapter(db, { bookId: 'b_del', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1 });
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 2 });
		const p3 = seedPage(db, { chapterId: chapter.id, seq: 3 });

		// DELETE p1
		deletePage(p1.id);

		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows).toHaveLength(3);
		expect(rows[0].id).toBe(p0.id);
		expect(rows[0].seq).toBe(0);
		expect(rows[1].id).toBe(p2.id);
		expect(rows[1].seq).toBe(1); // Renumbered from 2 to 1!
		expect(rows[2].id).toBe(p3.id);
		expect(rows[2].seq).toBe(2); // Renumbered from 3 to 2!
	});

	it('compactChapterPageSeqs heals arbitrary historical gaps in page sequences', () => {
		seedBook(db, { id: 'b_compact' });
		const chapter = seedChapter(db, { bookId: 'b_compact', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 5 }); // GAP
		const p2 = seedPage(db, { chapterId: chapter.id, seq: 12 }); // GAP

		compactChapterPageSeqs(chapter.id);

		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows).toHaveLength(3);
		expect(rows[0].id).toBe(p0.id);
		expect(rows[0].seq).toBe(0);
		expect(rows[1].id).toBe(p1.id);
		expect(rows[1].seq).toBe(1);
		expect(rows[2].id).toBe(p2.id);
		expect(rows[2].seq).toBe(2);
	});

	it('stitchPageWithNext manually merges a page with the next page', async () => {
		const os = await import('node:os');
		const { stitchPageWithNext } = await import('$lib/server/chapters');

		const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manua-test-'));
		fs.mkdirSync(path.join(dataRoot, 'uploads', '1'), { recursive: true });
		fs.writeFileSync(path.join(dataRoot, 'uploads/1/0.png'), Buffer.from('page0'));
		fs.writeFileSync(path.join(dataRoot, 'uploads/1/1.png'), Buffer.from('page1'));

		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { id: 1, bookId: 'b1', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/1/0.png' });
		seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/1/1.png' });

		const fakePipeline = {
			preprocess: async (b: Buffer) => b,
			analyze: async () => ({ width: 100, height: 100, backend: 'comic-ctd', regions: [] }),
			clean: async (b: Buffer) => b,
			health: async () => ({ status: 'ok', detector: 'comic-ctd', inpainter: 'lama' }),
			stitch: async (top: Buffer, bot: Buffer) => Buffer.concat([top, bot]),
		};

		await stitchPageWithNext(p0.id, fakePipeline, dataRoot);

		const remaining = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).all();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].seq).toBe(0);
		expect(fs.readFileSync(path.join(dataRoot, remaining[0].filePath)).toString()).toBe('page0page1');

		fs.rmSync(dataRoot, { recursive: true, force: true });
	});

	it('uploadPages never reuses a file name still referenced by another page (regression: after a stitch, re-uploading clobbered the last page\'s image)', async () => {
		const fs = await import('node:fs');
		const path = await import('node:path');
		const { uploadPages } = await import('$lib/server/chapters');
		const { DATA_ROOT } = await import('$lib/server/paths');

		// THE DIVERGENT STATE AFTER STITCHING THE FIRST TWO OF FIVE PAGES: DB seqs ARE RENUMBERED
		// (0-3) BUT FILES KEEP THEIR ORIGINAL NAMES (0, 2, 3, 4) — SO seq 3 STILL POINTS AT "4.png".
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { id: 1, bookId: 'b1', seq: 0 });
		const legacyFiles = ['0.png', '2.png', '3.png', '4.png'];
		const uploadDir = path.join(DATA_ROOT, 'uploads', '1');
		fs.mkdirSync(uploadDir, { recursive: true });
		try {
			for (const f of legacyFiles) {
				const filePath = `uploads/1/${f}`;
				seedPage(db, { chapterId: chapter.id, seq: legacyFiles.indexOf(f), filePath });
				fs.writeFileSync(path.join(DATA_ROOT, filePath), Buffer.from(`content-${f}`));
			}

			const file = new File([Buffer.from('brand-new-image')], 'new.png', { type: 'image/png' });
			await uploadPages(chapter.id, [file]);

			const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
			expect(rows).toHaveLength(5);

			// THE NEW PAGE MUST GET ITS OWN FILE — NOT "4.png" (THE OLD SCHEME COLLIDED: seq 4 → "4.png",
			// OVERWRITING THE LAST REMAINING PAGE'S IMAGE AND DUPLICATING IT ON SCREEN).
			const newPage = rows[4];
			const existing = new Set(rows.slice(0, 4).map((p) => p.filePath));
			expect(existing.has(newPage.filePath)).toBe(false);
			expect(newPage.filePath).toMatch(/^uploads\/1\/[0-9a-f-]{36}\.png$/);

			// AND THE OLD FILE'S CONTENT MUST BE UNTOUCHED ON DISK
			expect(fs.readFileSync(path.join(DATA_ROOT, 'uploads/1/4.png')).toString()).toBe('content-4.png');
			expect(fs.readFileSync(path.join(DATA_ROOT, newPage.filePath)).toString()).toBe('brand-new-image');
		} finally {
			fs.rmSync(uploadDir, { recursive: true, force: true });
		}
	});

	it('resetPageProgress clears regions, cached translations, and output state', async () => {
		const { resetPageProgress } = await import('$lib/server/chapters');

		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/0.png' });

		// SIMULATE A FINISHED PAGE: OUTPUTS + A REGION + A MEMOIZED TRANSLATION
		db.update(pages)
			.set({ status: 'done', cleanedPath: 'clean/1/0.png', outputPath: 'output/1/0.png', width: 100, height: 200 })
			.where(eq(pages.id, page.id))
			.run();
		db.insert(regions)
			.values({
				pageId: page.id,
				seq: 0,
				box: JSON.stringify({ x: 0, y: 0, w: 10, h: 10 }),
				textSource: '你好',
				textTarget: 'Hello',
				status: 'translated',
			})
			.run();
		db.insert(translations)
			.values({ pageId: page.id, cacheKey: 'k1', contentTarget: '{"r0":"Hello"}', model: 'm' })
			.run();

		resetPageProgress(page.id);

		const got = db.select().from(pages).where(eq(pages.id, page.id)).get();
		expect(got?.status).toBe('pending');
		expect(got?.cleanedPath).toBeNull();
		expect(got?.outputPath).toBeNull();
		expect(got?.width).toBeNull();
		expect(got?.height).toBeNull();
		expect(got?.error).toBeNull();
		expect(db.select().from(regions).where(eq(regions.pageId, page.id)).all()).toHaveLength(0);
		expect(db.select().from(translations).where(eq(translations.pageId, page.id)).all()).toHaveLength(0);
	});

	it('resetChapterProgress clears every page of the chapter', async () => {
		const { resetChapterProgress } = await import('$lib/server/chapters');

		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		const p0 = seedPage(db, { chapterId: chapter.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: chapter.id, seq: 1 });
		db.update(pages).set({ status: 'done', outputPath: 'output/1/0.png' }).where(eq(pages.id, p0.id)).run();
		db.update(pages).set({ status: 'error', error: 'boom' }).where(eq(pages.id, p1.id)).run();

		const reset = resetChapterProgress(chapter.id);

		expect(reset).toBe(2);
		const rows = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(rows.every((r) => r.status === 'pending' && r.outputPath === null && r.error === null)).toBe(true);
	});

	it('resetAllBookProgress clears progress across all chapters in a book while preserving pages', async () => {
		const { resetAllBookProgress } = await import('$lib/server/chapters');

		seedBook(db, { id: 'b_multi' });
		const ch1 = seedChapter(db, { bookId: 'b_multi', seq: 0 });
		const ch2 = seedChapter(db, { bookId: 'b_multi', seq: 1 });
		const p0 = seedPage(db, { chapterId: ch1.id, seq: 0 });
		const p1 = seedPage(db, { chapterId: ch2.id, seq: 0 });

		db.update(pages).set({ status: 'done', outputPath: 'output/1/0.png' }).where(eq(pages.id, p0.id)).run();
		db.update(pages).set({ status: 'done', outputPath: 'output/2/0.png' }).where(eq(pages.id, p1.id)).run();
		db.update(chapters).set({ status: 'done', translatedAt: Date.now() }).where(eq(chapters.bookId, 'b_multi')).run();

		const result = resetAllBookProgress('b_multi');

		expect(result.chaptersReset).toBe(2);
		expect(result.pagesReset).toBe(2);

		const remainingPages = db.select().from(pages).all();
		expect(remainingPages.filter((p) => p.id === p0.id || p.id === p1.id)).toHaveLength(2);
		expect(remainingPages.every((p) => p.status === 'pending' && p.outputPath === null)).toBe(true);

		const updatedChs = db.select().from(chapters).where(eq(chapters.bookId, 'b_multi')).all();
		expect(updatedChs.every((c) => c.status === 'pending' && c.translatedAt === null)).toBe(true);
	});

	it('resliceChapterPages combines slices and swaps them for newly sliced pages', async () => {
		const fs = await import('node:fs');
		const path = await import('node:path');
		const os = await import('node:os');
		const { resliceChapterPages } = await import('$lib/server/chapters');

		const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manua-reslice-'));
		fs.mkdirSync(path.join(dataRoot, 'uploads', '1'), { recursive: true });
		fs.writeFileSync(path.join(dataRoot, 'uploads/1/s0.png'), Buffer.from('slice0'));
		fs.writeFileSync(path.join(dataRoot, 'uploads/1/s1.png'), Buffer.from('slice1'));
		fs.writeFileSync(path.join(dataRoot, 'uploads/1/s2.png'), Buffer.from('slice2'));

		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { id: 1, bookId: 'b1', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/1/s0.png' });
		seedPage(db, { chapterId: chapter.id, seq: 1, filePath: 'uploads/1/s1.png' });
		seedPage(db, { chapterId: chapter.id, seq: 2, filePath: 'uploads/1/s2.png' });

		const fakePipeline = {
			preprocess: async (b: Buffer) => b,
			analyze: async () => ({ width: 100, height: 100, backend: 'comic-ctd', regions: [] }),
			clean: async (b: Buffer) => b,
			health: async () => ({ status: 'ok', detector: 'mock', inpainter: 'mock' }),
			reslice: async (images: Buffer[]) => {
				expect(images).toHaveLength(3);
				return [Buffer.from('pageA'), Buffer.from('pageB')]; // 3 SLICES -> 2 CLEAN PAGES
			},
		};

		const stepsLogged: string[] = [];
		const result = await resliceChapterPages(
			chapter.id,
			fakePipeline,
			(step) => stepsLogged.push(step),
			undefined,
			dataRoot,
		);

		expect(result).toEqual({ originalCount: 3, newCount: 2 });
		expect(stepsLogged).toContain('read');
		expect(stepsLogged).toContain('reslice');
		expect(stepsLogged).toContain('save');

		const newPages = db.select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		expect(newPages).toHaveLength(2);
		expect(newPages[0].seq).toBe(0);
		expect(newPages[1].seq).toBe(1);

		// DISK FILES CREATED
		expect(fs.readFileSync(path.join(dataRoot, newPages[0].filePath)).toString()).toBe('pageA');
		expect(fs.readFileSync(path.join(dataRoot, newPages[1].filePath)).toString()).toBe('pageB');

		fs.rmSync(dataRoot, { recursive: true, force: true });
	});

	it('GET /api/chapters/[id] returns chapter record metadata alongside pages', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, {
			bookId: 'b1',
			seq: 3,
			title: '第4话 初露锋芒',
		});
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/${chapter.id}/0.png` });

		const { GET } = await import('../../src/routes/api/chapters/[id]/+server');
		const res = await GET({ params: { id: String(chapter.id) } } as any);
		const data = await res.json();

		expect(data.chapter).not.toBeNull();
		expect(data.chapter.id).toBe(chapter.id);
		expect(data.chapter.seq).toBe(3);
		expect(data.chapter.title).toBe('第4话 初露锋芒');
		expect(data.pages).toHaveLength(1);
	});

	it('DELETE /api/chapters/[id]/job aborts a running chapter job', async () => {
		seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });

		const { DELETE } = await import('../../src/routes/api/chapters/[id]/job/+server');
		const res = await DELETE({ params: { id: String(chapter.id) } } as any);
		const data = await res.json();
		expect(data.ok).toBe(true);
	});
});


