// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		existsSync: vi.fn(() => true),
		readFileSync: vi.fn(() => Buffer.from('fake-image-bytes')),
		statSync: vi.fn(() => ({ mtimeMs: 1000, size: 16 })),
	};
});
vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		stat: vi.fn(async () => ({ mtimeMs: 1000, size: 16 })),
		readFile: vi.fn(async () => Buffer.from('fake-image-bytes')),
	};
});
vi.mock('$lib/server/paths', () => ({ DATA_ROOT: 'C:/fake-root' }));

import { GET as fileGet } from '../../src/routes/api/pages/[id]/file/+server';

function makeEvent(overrides: Record<string, unknown> = {}) {
	return {
		request: new Request('http://localhost:8124/api/pages/1/file?kind=output&rev=3'),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		locals: { user: null, authMode: 'no-login' as const, configured: true, authSource: null },
		params: { id: '1' },
		url: new URL('http://localhost:8124/api/pages/1/file?kind=output&rev=3'),
		...overrides,
	} as any;
}

describe('file endpoint cache behavior', () => {
	beforeEach(async () => {
		await resetDb();
		const db = getTestDb();
		seedBook(db, { id: 'book-a' });
		const chapter = seedChapter(db, { bookId: 'book-a', seq: 0 });
		seedPage(db, { chapterId: chapter.id, seq: 0, outputPath: 'output/0/0.png', outputRev: 3 });
	});

	it('serves immutable cache headers when rev is present', async () => {
		const res = await fileGet(makeEvent());
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('max-age=31536000');
		expect(res.headers.get('cache-control')).toContain('immutable');
		expect(res.headers.get('content-length')).toBe('16');
	});

	it('serves no-store when rev is absent (legacy/editor callers)', async () => {
		const evt = makeEvent();
		evt.url = new URL('http://localhost:8124/api/pages/1/file?kind=output');
		evt.request = new Request('http://localhost:8124/api/pages/1/file?kind=output');
		const res = await fileGet(evt);
		expect(res.headers.get('cache-control')).toContain('no-store');
	});

	it('404s when the requested rev is newer than the stored one', async () => {
		const evt = makeEvent();
		evt.url = new URL('http://localhost:8124/api/pages/1/file?kind=output&rev=99');
		evt.request = new Request('http://localhost:8124/api/pages/1/file?kind=output&rev=99');
		let status = 0;
		try {
			await fileGet(evt);
		} catch (e: any) {
			status = e?.status ?? 0;
		}
		expect(status).toBe(404);
	});

	it('validates original revisions (stale rev after stitch 404s)', async () => {
		const evt = makeEvent();
		evt.url = new URL('http://localhost:8124/api/pages/1/file?kind=original&rev=5');
		evt.request = new Request('http://localhost:8124/api/pages/1/file?kind=original&rev=5');
		let status = 0;
		try {
			await fileGet(evt);
		} catch (e: any) {
			status = e?.status ?? 0;
		}
		expect(status).toBe(404);
	});
});
