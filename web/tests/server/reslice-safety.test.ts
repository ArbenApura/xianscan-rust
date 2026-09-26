// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { pages } from '$lib/server/db/schema';
import type { PipelineClient } from '$lib/server/pipeline-client';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
// WRAP THE REAL FUNCTIONS SO TESTS CAN WATCH READS AND FAIL A RENAME (ESM EXPORTS CANNOT BE SPIED DIRECTLY)
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, readFileSync: vi.fn(actual.readFileSync), renameSync: vi.fn(actual.renameSync) };
});

// -- HELPERS -- //

const REAL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
	'base64',
);

function basePipeline(extra: Partial<PipelineClient>): PipelineClient {
	return {
		preprocess: async (b: Buffer) => b,
		analyze: async () => ({ width: 1, height: 1, backend: 'test', regions: [] }) as never,
		clean: async (b: Buffer) => b,
		health: async () => ({ status: 'ok', detector: 'x', inpainter: 'y' }),
		...extra,
	};
}

let dataRoot: string;

function seedChapterWithPages(dims: { width: number; height: number }[]) {
	const db = getTestDb();
	seedBook(db, { id: 'b1' });
	const chapter = seedChapter(db, { id: 1, bookId: 'b1', seq: 0 });
	fs.mkdirSync(path.join(dataRoot, 'uploads', '1'), { recursive: true });
	dims.forEach((d, i) => {
		const rel = `uploads/1/${i}.png`;
		fs.writeFileSync(path.join(dataRoot, rel), REAL_PNG);
		const page = seedPage(db, { chapterId: chapter.id, seq: i, filePath: rel });
		db.update(pages).set({ width: d.width, height: d.height }).where(eq(pages.id, page.id)).run();
	});
	return chapter;
}

// -- LIFECYCLES -- //

beforeEach(() => {
	vi.mocked(fs.readFileSync).mockClear();
	vi.mocked(fs.renameSync).mockClear();
	resetDb();
	dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xianscan-reslice-safety-'));
});

afterEach(() => {
	fs.rmSync(dataRoot, { recursive: true, force: true });
});

// -- TESTS -- //

describe('reslice safety (FEAT-002 Phase 9)', () => {
	it('refuses a chapter over the canvas budget before reading or uploading anything', async () => {
		const { resliceChapterPages } = await import('$lib/server/chapters/reslice');
		// 3 x (1000 x 80000) = 240 MP, over the 200 MP default
		const chapter = seedChapterWithPages([
			{ width: 1000, height: 80_000 },
			{ width: 1000, height: 80_000 },
			{ width: 1000, height: 80_000 },
		]);
		const reslice = vi.fn(async () => [REAL_PNG]);
		const readSpy = vi.mocked(fs.readFileSync);
		const pipeline = basePipeline({ reslice, getLimits: async () => null });

		await expect(resliceChapterPages(chapter.id, pipeline, undefined, undefined, dataRoot)).rejects.toMatchObject({
			status: 413,
			body: expect.objectContaining({ message: expect.stringContaining('1000 x 240000') }),
		});
		expect(reslice).not.toHaveBeenCalled();
		expect(readSpy.mock.calls.some((c) => String(c[0]).includes(path.join('uploads', '1')))).toBe(false);
	});

	it('uses the limits the sidecar reports', async () => {
		const { resliceChapterPages } = await import('$lib/server/chapters/reslice');
		const chapter = seedChapterWithPages([{ width: 100, height: 100 }, { width: 100, height: 100 }]);
		const reslice = vi.fn(async () => [REAL_PNG]);
		const pipeline = basePipeline({
			reslice,
			getLimits: async () => ({ max_image_pixels: 1e8, max_images: 1, max_canvas_pixels: 2e8, reslice_body_bytes: 1e9 }),
		});
		await expect(resliceChapterPages(chapter.id, pipeline, undefined, undefined, dataRoot)).rejects.toMatchObject({ status: 413 });
		expect(reslice).not.toHaveBeenCalled();
	});

	it('an invalid slice buffer leaves the old pages untouched', async () => {
		const { resliceChapterPages } = await import('$lib/server/chapters/reslice');
		const chapter = seedChapterWithPages([{ width: 1, height: 1 }, { width: 1, height: 1 }]);
		const before = getTestDb().select().from(pages).where(eq(pages.chapterId, chapter.id)).all();
		const pipeline = basePipeline({ reslice: async () => [REAL_PNG, Buffer.from('garbage-not-an-image')] });

		await expect(resliceChapterPages(chapter.id, pipeline, undefined, undefined, dataRoot)).rejects.toThrow(/slice 2 is not a valid image/);
		const after = getTestDb().select().from(pages).where(eq(pages.chapterId, chapter.id)).all();
		expect(after.map((p) => p.filePath)).toEqual(before.map((p) => p.filePath));
		for (const p of after) expect(fs.existsSync(path.join(dataRoot, p.filePath))).toBe(true);
	});

	it('stitchPageWithNext leaves the original intact when the write throws', async () => {
		const { stitchPageWithNext } = await import('$lib/server/chapters/reslice');
		const chapter = seedChapterWithPages([{ width: 1, height: 1 }, { width: 1, height: 1 }]);
		const [top] = getTestDb().select().from(pages).where(eq(pages.chapterId, chapter.id)).orderBy(pages.seq).all();
		const topAbs = path.join(dataRoot, top.filePath);
		const original = fs.readFileSync(topAbs);

		vi.mocked(fs.renameSync).mockImplementationOnce(() => {
			throw new Error('disk full');
		});
		const pipeline = basePipeline({ stitch: async () => Buffer.concat([REAL_PNG, Buffer.from('stitched')]) });
		await expect(stitchPageWithNext(top.id, pipeline, dataRoot)).rejects.toThrow(/disk full/);

		expect(fs.readFileSync(topAbs).equals(original)).toBe(true);
		expect(getTestDb().select().from(pages).where(eq(pages.chapterId, chapter.id)).all()).toHaveLength(2);
		expect(fs.readdirSync(path.dirname(topAbs)).some((f) => f.endsWith('.tmp'))).toBe(false);
	});
});
