// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

vi.mock('$lib/server/batch-service', () => ({
	batchService: {
		startBatch: vi.fn().mockResolvedValue({ id: 'mock-batch-1', status: 'working' }),
	},
}));

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
	vi.clearAllMocks();
});

// -- TESTS -- //

describe('POST /api/pages/[id]/translate', () => {
	it('returns 400 for invalid or non-integer page id', async () => {
		const { POST } = await import('../../src/routes/api/pages/[id]/translate/+server');
		await expect(
			POST({ params: { id: 'abc' }, cookies: { get: () => undefined } } as unknown as RequestEvent),
		).rejects.toMatchObject({ status: 400 });
	});

	it('returns 404 if page does not exist', async () => {
		const { POST } = await import('../../src/routes/api/pages/[id]/translate/+server');
		await expect(
			POST({ params: { id: '9999' }, cookies: { get: () => undefined } } as unknown as RequestEvent),
		).rejects.toMatchObject({ status: 404 });
	});

	it('resets page progress and queues targeted translation batch', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b_target' });
		const chapter = seedChapter(db, { bookId: 'b_target', seq: 0 });
		const page = seedPage(db, { chapterId: chapter.id, seq: 0, filePath: 'uploads/p0.png', status: 'error' });

		const { POST } = await import('../../src/routes/api/pages/[id]/translate/+server');
		const res = await POST({
			params: { id: String(page.id) },
			cookies: { get: () => undefined },
		} as unknown as RequestEvent);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.pageId).toBe(page.id);
		expect(body.chapterId).toBe(chapter.id);
		expect(body.bookId).toBe('b_target');
		expect(body.status).toBe('working');
	});
});
