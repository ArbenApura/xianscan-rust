// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';

const root = vi.hoisted(() => {
	const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
	const { tmpdir } = require('node:os') as typeof import('node:os');
	const { join } = require('node:path') as typeof import('node:path');
	return mkdtempSync(join(tmpdir(), 'xianscan-thumb-'));
});

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('$lib/server/paths', () => ({ DATA_ROOT: root }));

import { GET } from '../../src/routes/api/pages/[id]/file/+server';

// -- HELPERS -- //

function png(width: number, height: number): Buffer {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#6a8caf';
	ctx.fillRect(0, 0, width, height);
	return canvas.toBuffer('image/png');
}

/** VALID PNG SIGNATURE + IHDR CLAIMING A HUGE SIZE; THE REST IS JUNK, SO IT CAN NEVER BE DECODED. */
function hugePngHeader(): Buffer {
	const buf = Buffer.alloc(64);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
	buf.writeUInt32BE(13, 8);
	buf.write('IHDR', 12, 'ascii');
	buf.writeUInt32BE(20000, 16);
	buf.writeUInt32BE(20000, 20);
	return buf;
}

function event(qs: string) {
	const url = new URL(`http://localhost/api/pages/1/file${qs}`);
	return { request: new Request(url), url, params: { id: '1' } } as never;
}

function seedWithFile(bytes: Buffer, name = 'p.png') {
	const db = getTestDb();
	seedBook(db, { id: 'b1' });
	const chapter = seedChapter(db, { bookId: 'b1', seq: 0 });
	mkdirSync(join(root, 'uploads', '1'), { recursive: true });
	writeFileSync(join(root, 'uploads', '1', name), bytes);
	return seedPage(db, { chapterId: chapter.id, seq: 0, filePath: `uploads/1/${name}` });
}

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
	rmSync(join(root, 'uploads'), { recursive: true, force: true });
	rmSync(join(root, 'cache'), { recursive: true, force: true });
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

// -- TESTS -- //

describe('page thumbnails', () => {
	it('falls back to width 280 for a non-numeric w (NaN never reaches the cache key)', async () => {
		const page = seedWithFile(png(400, 600));
		const res = await GET(event('?kind=thumb&w=abc'));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(existsSync(join(root, 'cache', 'thumbs', `${page.id}_orig_280_0.jpg`))).toBe(true);
		const img = await loadImage(Buffer.from(await res.arrayBuffer()));
		expect(img.width).toBe(280);
		expect(img.height).toBe(420);
	});

	it('caps a very tall strip at 8000 px by cropping, not squashing', async () => {
		seedWithFile(png(100, 20000));
		const res = await GET(event('?kind=thumb&w=100'));
		const img = await loadImage(Buffer.from(await res.arrayBuffer()));
		expect(img.width).toBe(100);
		expect(img.height).toBe(8000);
	});

	it('serves an over-cap source as-is with its real MIME type instead of decoding it', async () => {
		seedWithFile(hugePngHeader());
		const res = await GET(event('?kind=thumb&w=200'));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(Buffer.from(await res.arrayBuffer()).length).toBe(64);
	});

	it('writes the cache atomically (no temp files left behind)', async () => {
		seedWithFile(png(300, 300));
		await GET(event('?kind=thumb&w=150'));
		const files = readdirSync(join(root, 'cache', 'thumbs'));
		expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
		expect(files).toHaveLength(1);
	});
});
