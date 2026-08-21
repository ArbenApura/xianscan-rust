// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Transformer } from '@napi-rs/image';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { resolveCoverTarget, saveCover, deleteCover } from '$lib/server/covers';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- HELPERS -- //

function jpegBytes(): Uint8Array {
	const canvas = createCanvas(2, 3);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#b23a2e';
	ctx.fillRect(0, 0, 2, 3);
	return new Uint8Array(canvas.toBuffer('image/jpeg', 90));
}

// -- LIFECYCLES -- //

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'xianscan-covers-'));
	resetDb();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

// -- TESTS -- //

describe('book cover storage', () => {
	it('resolves nothing without a cover or pages, then falls back to the first page', () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		expect(resolveCoverTarget('b1')).toBeNull();

		const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/x.png' });

		const fallback = resolveCoverTarget('b1');
		expect(fallback?.kind).toBe('page');
		expect(fallback?.rel).toBe('uploads/x.png');
	});

	it('prefers the dedicated cover and bumps coverRev per upload', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		await saveCover('b1', jpegBytes(), dir);
		const target = resolveCoverTarget('b1');
		expect(target?.kind).toBe('dedicated');
		expect(target?.rel).toBe('covers/b1.jpg');
		expect(target?.rev).toBe(1);

		await saveCover('b1', jpegBytes(), dir);
		expect(resolveCoverTarget('b1')?.rev).toBe(2);
	});

	it('writes a decodable JPEG file on disk', async () => {
		seedBook(getTestDb(), { id: 'b1' });
		await saveCover('b1', jpegBytes(), dir);
		const abs = join(dir, 'covers', 'b1.jpg');
		expect(existsSync(abs)).toBe(true);
		const bytes = readFileSync(abs);
		expect(bytes.length).toBeGreaterThan(100);
		expect(bytes[0]).toBe(0xff);
		expect(bytes[1]).toBe(0xd8);
	});

	it('deleteCover clears the path, suppresses the page fallback, and re-upload restores it', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/x.png' });

		await saveCover('b1', jpegBytes(), dir);
		expect(resolveCoverTarget('b1')?.kind).toBe('dedicated');

		// DELIBERATE REMOVE — MUST NOT FALL BACK TO A CHAPTER PAGE.
		deleteCover('b1', dir);
		expect(resolveCoverTarget('b1')).toBeNull();
		expect(existsSync(join(dir, 'covers', 'b1.jpg'))).toBe(false);

		// RE-UPLOAD AFTER A REMOVE — THE CLEARED FLAG RESETS AND THE DEDICATED COVER RETURNS.
		await saveCover('b1', jpegBytes(), dir);
		expect(resolveCoverTarget('b1')?.kind).toBe('dedicated');
		expect(resolveCoverTarget('b1')?.rel).toBe('covers/b1.jpg');
	});

	it('remove suppresses the page-proxy fallback even when no dedicated cover exists', async () => {
		const db = getTestDb();
		const book = seedBook(db, { id: 'b1' });
		const chapter = seedChapter(db, { bookId: book.id, seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/x.png' });

		// BOOK WITH ONLY A PAGE-PROXY COVER (NO DEDICATED UPLOAD).
		expect(resolveCoverTarget('b1')?.kind).toBe('page');

		// "REMOVE" ON SUCH A BOOK MUST CLEAR THE FLAG AND KILL THE FALLBACK.
		deleteCover('b1', dir);
		expect(resolveCoverTarget('b1')).toBeNull();
	});

	it('decodes AVIF uploads via the wide-format fallback', async () => {
		seedBook(getTestDb(), { id: 'b1' });
		// @napi-rs/canvas CANNOT READ AVIF — THE @napi-rs/image FALLBACK MUST HANDLE IT.
		const canvas = createCanvas(8, 12);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#a97f28';
		ctx.fillRect(0, 0, 8, 12);
		const jpeg = new Uint8Array(canvas.toBuffer('image/jpeg', 90));
		const avif = new Uint8Array(new Transformer(jpeg).avifSync());

		await saveCover('b1', avif, dir);
		const abs = join(dir, 'covers', 'b1.jpg');
		expect(existsSync(abs)).toBe(true);
		const stored = readFileSync(abs);
		expect(stored[0]).toBe(0xff);
		expect(stored[1]).toBe(0xd8);

		// THE STORED FILE MUST BE DECODABLE AND PRESERVE ASPECT RATIO.
		const img = await loadImage(stored);
		expect(img.width).toBe(8);
		expect(img.height).toBe(12);
	});

	it('rejects undecodable uploads with a friendly error', async () => {
		seedBook(getTestDb(), { id: 'b1' });
		await expect(saveCover('b1', new Uint8Array([1, 2, 3, 4]), dir)).rejects.toThrow(/Unsupported or corrupt image/);
	});
});
