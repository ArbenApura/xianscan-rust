// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook } from '../helpers/db';
import { GET as libraryGET } from '../../src/routes/api/mihon/library/+server';
import { GET as mangaGET } from '../../src/routes/api/mihon/manga/[bookId]/+server';
import { GET as chaptersGET } from '../../src/routes/api/mihon/manga/[bookId]/chapters/+server';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- HELPERS -- //

function makeEvent(urlStr: string, params: Record<string, string> = {}) {
	return { url: new URL(urlStr), params, request: new Request(urlStr) } as unknown as RequestEvent;
}

// -- LIFECYCLES -- //

beforeEach(() => resetDb());

// -- TESTS -- //

describe('mihon API routes', () => {
	it('GET /api/mihon/library returns a book list', async () => {
		seedBook(getTestDb(), { id: 'b1', title: 'Star' });
		const res = await libraryGET(makeEvent('http://localhost/api/mihon/library?page=1'));
		const data = await res.json();
		expect(data.books.length).toBe(1);
		expect(data.books[0].title).toBe('Star');
	});

	it('GET /api/mihon/manga/:id returns detail', async () => {
		seedBook(getTestDb(), { id: 'b1', title: 'Star' });
		const res = await mangaGET(makeEvent('http://localhost/api/mihon/manga/b1', { bookId: 'b1' }));
		const data = await res.json();
		expect(data.id).toBe('b1');
		expect(data.initialized).toBe(true);
	});

	it('GET /api/mihon/manga/:id for a nonexistent book throws 404', async () => {
		let status = 0;
		try {
			await mangaGET(makeEvent('http://localhost/api/mihon/manga/nope', { bookId: 'nope' }));
		} catch (e: unknown) {
			status = (e as { status?: number })?.status ?? 0;
		}
		expect(status).toBe(404);
	});

	it('GET /api/mihon/manga/:id/chapters for a nonexistent book throws 404', async () => {
		let status = 0;
		try {
			await chaptersGET(makeEvent('http://localhost/api/mihon/manga/nope/chapters', { bookId: 'nope' }));
		} catch (e: unknown) {
			status = (e as { status?: number })?.status ?? 0;
		}
		expect(status).toBe(404);
	});
});
