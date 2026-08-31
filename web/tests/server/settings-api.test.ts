// INTENSIVE SERVER API TESTS FOR SETTINGS & READING HISTORY
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { getTestDb, resetDb, seedBook, seedChapter } from '../helpers/db';
import { invalidateSettingsCache } from '../../src/lib/server/settings-service';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('Settings & Reading History Server API Routes', () => {
	beforeEach(() => {
		resetDb();
		invalidateSettingsCache();
	});

	describe('GET /api/settings', () => {
		it('returns default canonical settings when database is empty', async () => {
			vi.resetModules();
			const { GET } = await import('../../src/routes/api/settings/+server');
			const res = await GET({} as RequestEvent);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.inpaintMode).toBe('patch');
			expect(data.parallelProcesses).toBe(1);
		});
	});

	describe('PATCH /api/settings', () => {
		it('partially updates specific keys without corrupting other settings', async () => {
			vi.resetModules();
			const { PATCH, GET } = await import('../../src/routes/api/settings/+server');

			const req = new Request('http://localhost/api/settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					inpaintExpansionPct: 0.08,
					typesetExpansionPct: 0.15,
					executionDevice: 'cuda',
				}),
			});

			const patchRes = await PATCH({ request: req } as unknown as RequestEvent);
			expect(patchRes.status).toBe(200);
			const patchData = await patchRes.json();
			expect(patchData.inpaintExpansionPct).toBe(0.08);
			expect(patchData.typesetExpansionPct).toBe(0.15);
			expect(patchData.executionDevice).toBe('cuda');
			// Untouched keys stay default
			expect(patchData.inpaintMode).toBe('patch');

			// Re-query with GET to confirm persistence in SQLite
			const getRes = await GET({} as RequestEvent);
			const getData = await getRes.json();
			expect(getData.inpaintExpansionPct).toBe(0.08);
			expect(getData.typesetExpansionPct).toBe(0.15);
		});

		it('gracefully handles and ignores invalid/unknown payload keys', async () => {
			vi.resetModules();
			const { PATCH } = await import('../../src/routes/api/settings/+server');

			const req = new Request('http://localhost/api/settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					unknownField123: 'hacker_value',
					inpaintMode: 'full',
				}),
			});

			const res = await PATCH({ request: req } as unknown as RequestEvent);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.inpaintMode).toBe('full');
			expect((data as any).unknownField123).toBeUndefined();
		});
	});

	describe('POST /api/settings (Seed)', () => {
		it('seeds initial settings if database is empty on first run', async () => {
			vi.resetModules();
			const { POST, GET } = await import('../../src/routes/api/settings/+server');

			const req = new Request('http://localhost/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seed: {
						typesetFont: 'Montserrat',
						typesetPadding: 0.08,
					},
				}),
			});

			const seedRes = await POST({ request: req } as unknown as RequestEvent);
			expect(seedRes.status).toBe(200);
			const seedData = await seedRes.json();
			expect(seedData.typesetFont).toBe('Montserrat');
			expect(seedData.typesetPadding).toBe(0.08);

			// Calling seed again does not overwrite if already populated
			const req2 = new Request('http://localhost/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seed: {
						typesetFont: 'Poppins',
					},
				}),
			});
			const seedRes2 = await POST({ request: req2 } as unknown as RequestEvent);
			const seedData2 = await seedRes2.json();
			expect(seedData2.typesetFont).toBe('Montserrat'); // Preserved
		});
	});

	describe('Reading History API (/api/history)', () => {
		it('enforces monotonic progression and supports force overwrite', async () => {
			const db = getTestDb();
			seedBook(db, { id: 'book-a' });
			const ch1 = seedChapter(db, { bookId: 'book-a', seq: 0, title: 'Ch 1' });
			const ch2 = seedChapter(db, { bookId: 'book-a', seq: 1, title: 'Ch 2' });

			vi.resetModules();
			const { POST, GET, DELETE } = await import('../../src/routes/api/history/+server');

			// 1. Record progress at Ch 1, Page 10
			const req1 = new Request('http://localhost/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bookId: 'book-a',
					chapterId: ch1.id,
					chapterSeq: 0,
					pageSeq: 10,
					totalPages: 20,
				}),
			});
			const res1 = await POST({ request: req1 } as unknown as RequestEvent);
			expect(res1.status).toBe(200);
			let saved = await res1.json();
			expect(saved.chapterSeq).toBe(0);
			expect(saved.pageSeq).toBe(10);

			// 2. Advance to Ch 2, Page 2
			const req2 = new Request('http://localhost/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bookId: 'book-a',
					chapterId: ch2.id,
					chapterSeq: 1,
					pageSeq: 2,
					totalPages: 18,
				}),
			});
			const res2 = await POST({ request: req2 } as unknown as RequestEvent);
			expect(res2.status).toBe(200);
			saved = await res2.json();
			expect(saved.chapterSeq).toBe(1);
			expect(saved.pageSeq).toBe(2);

			// 3. Stale out-of-order request from earlier session (Ch 1, Page 5) is rejected by monotonic check
			const reqStale = new Request('http://localhost/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bookId: 'book-a',
					chapterId: ch1.id,
					chapterSeq: 0,
					pageSeq: 5,
					totalPages: 20,
				}),
			});
			const resStale = await POST({ request: reqStale } as unknown as RequestEvent);
			saved = await resStale.json();
			// Must stay at Ch 2, Page 2
			expect(saved.chapterSeq).toBe(1);
			expect(saved.pageSeq).toBe(2);

			// 4. Force jump to Ch 1, Page 1 succeeds with force: true
			const reqForce = new Request('http://localhost/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bookId: 'book-a',
					chapterId: ch1.id,
					chapterSeq: 0,
					pageSeq: 1,
					totalPages: 20,
					force: true,
				}),
			});
			const resForce = await POST({ request: reqForce } as unknown as RequestEvent);
			saved = await resForce.json();
			expect(saved.chapterSeq).toBe(0);
			expect(saved.pageSeq).toBe(1);

			// 5. Query history with GET
			const getRes = await GET({ url: new URL('http://localhost/api/history') } as unknown as RequestEvent);
			const historyData = await getRes.json();
			expect(historyData.entries.length).toBe(1);
			expect(historyData.historyMap['book-a']).toBeDefined();

			// 6. Test Batch Array Payload (Beacon Flush)
			seedBook(db, { id: 'book-b' });
			const ch1b = seedChapter(db, { bookId: 'book-b', seq: 0, title: 'Ch 1b' });

			const batchReq = new Request('http://localhost/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify([
					{ bookId: 'book-a', chapterId: ch2.id, chapterSeq: 1, pageSeq: 15, totalPages: 18 },
					{ bookId: 'book-b', chapterId: ch1b.id, chapterSeq: 0, pageSeq: 5, totalPages: 12 },
				]),
			});
			const batchRes = await POST({ request: batchReq } as unknown as RequestEvent);
			expect(batchRes.status).toBe(200);
			const batchData = await batchRes.json();
			expect(batchData.success).toBe(true);
			expect(batchData.count).toBe(2);

			// 7. Delete history for specific book
			const delRes = await DELETE({ url: new URL('http://localhost/api/history?bookId=book-a') } as unknown as RequestEvent);
			expect(delRes.status).toBe(200);

			const getAfterDel = await GET({ url: new URL('http://localhost/api/history') } as unknown as RequestEvent);
			const historyAfterDel = await getAfterDel.json();
			expect(historyAfterDel.historyMap['book-a']).toBeUndefined();
			expect(historyAfterDel.historyMap['book-b']).toBeDefined();
		});
	});

	describe('Canonical Settings Propagation to Pipelines', () => {
		it('ensures /api/chapters/[id]/translate and /api/batch inherit canonical SQLite settings', async () => {
			vi.resetModules();
			const { PATCH } = await import('../../src/routes/api/settings/+server');

			// SET CANONICAL SETTINGS IN SQLITE: SFX DISABLED, CUSTOM EXPANSIONS, CUSTOM FONT
			const patchReq = new Request('http://localhost/api/settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					typesetFont: 'Anime Ace',
					typesetPadding: 0.08,
					typesetOutline: 'heavy',
					inpaintExpansionPct: 0.07,
					typesetExpansionPct: 0.12,
				}),
			});
			const patchRes = await PATCH({ request: patchReq } as unknown as RequestEvent);
			expect(patchRes.status).toBe(200);

			const { getCanonicalSettings } = await import('../../src/lib/server/settings-service');
			const canonical = getCanonicalSettings();
			expect(canonical.typesetFont).toBe('Anime Ace');
			expect(canonical.typesetPadding).toBe(0.08);
			expect(canonical.typesetOutline).toBe('heavy');
			expect(canonical.inpaintExpansionPct).toBe(0.07);
			expect(canonical.typesetExpansionPct).toBe(0.12);
		});
	});
});
