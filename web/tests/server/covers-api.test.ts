// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- HELPERS -- //

function makeJpeg(): Uint8Array {
	const canvas = createCanvas(8, 12);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#4f7a64';
	ctx.fillRect(0, 0, 8, 12);
	return new Uint8Array(canvas.toBuffer('image/jpeg', 90));
}

// -- LIFECYCLES -- //

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'xianscan-cover-api-'));
	resetDb();
	vi.stubEnv('DATA_ROOT', dir);
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(dir, { recursive: true, force: true });
});

// -- TESTS -- //

describe('covers API routes', () => {
	it('uploads, serves resized + full, and deletes a cover', async () => {
		seedBook(getTestDb(), { id: 'b1' });
		vi.resetModules();
		const { POST, DELETE } = await import('../../src/routes/api/covers/[bookId]/+server');
		const { GET } = await import('../../src/routes/api/covers/[bookId]/file/+server');

		const form = new FormData();
		form.append('cover', new File([makeJpeg()], 'cover.jpg', { type: 'image/jpeg' }));
		const uploadReq = new Request('http://localhost/api/covers/b1', { method: 'POST', body: form });
		const up = await POST({ request: uploadReq, params: { bookId: 'b1' } } as unknown as RequestEvent);
		expect(up.status).toBe(200);
		const data = await up.json();
		expect(data.coverPath).toBe('covers/b1.jpg');
		expect(data.coverRev).toBe(1);

		const thumbReq = new Request('http://localhost/api/covers/b1/file?w=128');
		const thumb = await GET({
			request: thumbReq,
			url: new URL('http://localhost/api/covers/b1/file?w=128'),
			params: { bookId: 'b1' },
		} as unknown as RequestEvent);
		expect(thumb.status).toBe(200);
		expect(thumb.headers.get('content-type')).toBe('image/jpeg');
		const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
		expect(thumbBytes.length).toBeGreaterThan(0);

		const fullReq = new Request('http://localhost/api/covers/b1/file?kind=full');
		const full = await GET({
			request: fullReq,
			url: new URL('http://localhost/api/covers/b1/file?kind=full'),
			params: { bookId: 'b1' },
		} as unknown as RequestEvent);
		expect(full.headers.get('content-type')).toBe('image/jpeg');

		const del = await DELETE({ params: { bookId: 'b1' } } as unknown as RequestEvent);
		expect(del.status).toBe(200);
		expect(existsSync(join(dir, 'covers', 'b1.jpg'))).toBe(false);

		let goneStatus = 0;
		try {
			await GET({
				request: new Request('http://localhost/api/covers/b1/file'),
				url: new URL('http://localhost/api/covers/b1/file'),
				params: { bookId: 'b1' },
			} as unknown as RequestEvent);
		} catch (e: unknown) {
			goneStatus = (e as { status?: number })?.status ?? 0;
		}
		expect(goneStatus).toBe(404);
	});

	it('rejects an empty upload body', async () => {
		seedBook(getTestDb(), { id: 'b1' });
		vi.resetModules();
		const { POST } = await import('../../src/routes/api/covers/[bookId]/+server');

		const req = new Request('http://localhost/api/covers/b1', { method: 'POST', body: new Uint8Array(0) });
		let status = 0;
		try {
			await POST({ request: req, params: { bookId: 'b1' } } as unknown as RequestEvent);
		} catch (e: unknown) {
			status = (e as { status?: number })?.status ?? 0;
		}
		expect(status).toBe(400);
	});
});
