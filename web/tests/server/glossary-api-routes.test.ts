// IMPORTED DEP-MODULES
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedGlossary } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// -- TESTS -- //

describe('glossary export API route (GET /api/glossary/export)', () => {
	it('exports global scope terms as CSV with correct headers and sanitized filename', async () => {
		const db = getTestDb();
		seedGlossary(db, {
			scope: 'global',
			source: '金丹',
			target: 'Golden Core',
			sourceLang: 'zh-Hans',
			targetLang: 'en',
			gender: 'neuter',
			category: 'cultivation',
			pinned: true,
			aliases: ['金丹期'],
			context: 'cultivation stage',
			tags: '#xianxia',
		});

		vi.resetModules();
		const { GET } = await import('../../src/routes/api/glossary/export/+server');

		const url = new URL('http://localhost/api/glossary/export?scope=global&sourceLang=zh-Hans&targetLang=en');
		const res = await GET({ url } as unknown as RequestEvent);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/csv');
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="glossary-global-zh-Hans-en.csv"');

		const text = await res.text();
		expect(text).toContain('source,target,context,category,pinned,aliases,description');
		expect(text).toContain('金丹,Golden Core,cultivation stage,cultivation,true,金丹期,#xianxia');
	});

	it('exports active system preset packs when no custom terms exist in global scope', async () => {
		vi.resetModules();
		const { GET } = await import('../../src/routes/api/glossary/export/+server');

		const url = new URL('http://localhost/api/glossary/export?scope=global&sourceLang=zh-Hans&targetLang=en');
		const res = await GET({ url } as unknown as RequestEvent);

		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain('source,target,context,category,pinned,aliases,description');
		expect(text.length).toBeGreaterThan(100);
	});

	it('exports book scope terms and validates book existence', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'book-1', title: 'Cultivation Chronicle' });
		seedGlossary(db, {
			scope: 'book',
			bookId: 'book-1',
			source: '陆沉',
			target: 'Lu Chen',
			gender: 'masculine',
			category: 'character',
		});

		vi.resetModules();
		const { GET } = await import('../../src/routes/api/glossary/export/+server');

		const url = new URL('http://localhost/api/glossary/export?scope=book&bookId=book-1');
		const res = await GET({ url } as unknown as RequestEvent);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="glossary-book-book-1.csv"');
		const text = await res.text();
		expect(text).toContain('陆沉,Lu Chen');
	});

	it('throws 400 when exporting book/effective scope without bookId', async () => {
		vi.resetModules();
		const { GET } = await import('../../src/routes/api/glossary/export/+server');

		const url = new URL('http://localhost/api/glossary/export?scope=book');
		let errStatus = 0;
		try {
			await GET({ url } as unknown as RequestEvent);
		} catch (e: unknown) {
			errStatus = (e as { status?: number })?.status ?? 0;
		}
		expect(errStatus).toBe(400);
	});
});

describe('glossary import API route (POST /api/glossary/import)', () => {
	it('imports valid CSV and merges into global glossary', async () => {
		vi.resetModules();
		const { POST } = await import('../../src/routes/api/glossary/import/+server');

		const csvContent = 'source,target,context,category,pinned,aliases,description\n元婴,Nascent Soul,stage,cultivation,true,元婴期,#xianxia\n';
		const form = new FormData();
		form.append('file', new File([csvContent], 'terms.csv', { type: 'text/csv' }));
		form.append('scope', 'global');
		form.append('sourceLang', 'zh-Hans');
		form.append('targetLang', 'en');

		const req = new Request('http://localhost/api/glossary/import', { method: 'POST', body: form });
		const res = await POST({ request: req } as unknown as RequestEvent);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.parsed).toBe(1);
		expect(data.added).toBe(1);
	});

	it('rejects import request without file or invalid scope', async () => {
		vi.resetModules();
		const { POST } = await import('../../src/routes/api/glossary/import/+server');

		const form = new FormData();
		form.append('scope', 'global');

		const req = new Request('http://localhost/api/glossary/import', { method: 'POST', body: form });
		let errStatus = 0;
		try {
			await POST({ request: req } as unknown as RequestEvent);
		} catch (e: unknown) {
			errStatus = (e as { status?: number })?.status ?? 0;
		}
		expect(errStatus).toBe(400);
	});
});
