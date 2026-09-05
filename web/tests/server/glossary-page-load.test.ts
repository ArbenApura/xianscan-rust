// IMPORTED DEP-TYPES
import type { RequestEvent } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// IMPORTED MODULES (POST-MOCK)
import { load } from '../../src/routes/app/glossary/+page.server';

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// -- TESTS -- //

describe('glossary page server load (/app/glossary/+page.server.ts)', () => {
	it('filters out archived books from the returned books list', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'book-active-1', title: 'Active Book 1', pinned: true, archived: false });
		seedBook(db, { id: 'book-archived-1', title: 'Archived Book 1', archived: true });
		seedBook(db, { id: 'book-active-2', title: 'Active Book 2', pinned: false, archived: false });
		seedBook(db, { id: 'book-archived-2', title: 'Archived Book 2', archived: true });

		const url = new URL('http://localhost/app/glossary?scope=book');
		const result = (await load({ url } as unknown as RequestEvent)) as Awaited<ReturnType<typeof load>>;

		expect(result.books).toHaveLength(2);
		expect(result.books.map((b) => b.id)).toEqual(['book-active-1', 'book-active-2']);
		expect(result.initialBookId).toBe('book-active-1');
	});

	it('selects requested active book and excludes archived books', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'book-active-1', title: 'Active Book 1', archived: false });
		seedBook(db, { id: '63dde948-3403-4bb1-9ede-a2cc29146a64', title: 'Target Book', archived: false });
		seedBook(db, { id: 'book-archived-1', title: 'Archived Book', archived: true });

		const url = new URL('http://localhost/app/glossary?scope=book&bookId=63dde948-3403-4bb1-9ede-a2cc29146a64');
		const result = (await load({ url } as unknown as RequestEvent)) as Awaited<ReturnType<typeof load>>;

		expect(result.initialBookId).toBe('63dde948-3403-4bb1-9ede-a2cc29146a64');
		expect(result.books).toHaveLength(2);
		expect(result.books.find((b) => b.id === 'book-archived-1')).toBeUndefined();
		expect(result.books.map((b) => b.id)).toContain('63dde948-3403-4bb1-9ede-a2cc29146a64');
		expect(result.books.map((b) => b.id)).toContain('book-active-1');
	});

	it('provides fallback book when requesting an archived book directly without leaking other archived books', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'book-active-1', title: 'Active Book', archived: false });
		seedBook(db, { id: 'book-archived-target', title: 'Archived Target', archived: true });
		seedBook(db, { id: 'book-archived-other', title: 'Other Archived', archived: true });

		const url = new URL('http://localhost/app/glossary?scope=book&bookId=book-archived-target');
		const result = (await load({ url } as unknown as RequestEvent)) as Awaited<ReturnType<typeof load>>;

		expect(result.initialBookId).toBe('book-archived-target');
		expect(result.books.map((b) => b.id)).toContain('book-archived-target');
		expect(result.books.map((b) => b.id)).toContain('book-active-1');
		expect(result.books.find((b) => b.id === 'book-archived-other')).toBeUndefined();
	});
});
