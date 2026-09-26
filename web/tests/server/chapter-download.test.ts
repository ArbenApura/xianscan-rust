// IMPORTED DEP-MODULES
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
// IMPORTED MODULES
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import { pages } from '$lib/server/db/schema';

const root = vi.hoisted(() => {
	const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
	const { tmpdir } = require('node:os') as typeof import('node:os');
	const { join } = require('node:path') as typeof import('node:path');
	return mkdtempSync(join(tmpdir(), 'xianscan-download-'));
});

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('$lib/server/paths', () => ({ DATA_ROOT: root }));

import { GET } from '../../src/routes/api/chapters/[id]/download/+server';

// -- HELPERS -- //

function put(rel: string, content: string) {
	mkdirSync(join(root, rel, '..'), { recursive: true });
	writeFileSync(join(root, rel), content);
}

function download(chapterId: number) {
	return GET({ params: { id: String(chapterId) } } as never);
}

// -- LIFECYCLES -- //

beforeEach(() => {
	resetDb();
	rmSync(join(root, 'uploads'), { recursive: true, force: true });
	rmSync(join(root, 'output'), { recursive: true, force: true });
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

// -- TESTS -- //

describe('chapter download (FEAT-002 ADR-010)', () => {
	it('falls back to the original when the output file is missing', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		const ch = seedChapter(db, { bookId: 'b1', seq: 0, title: 'Ch One' });
		put('uploads/1/a.webp', 'original-a');
		seedPage(db, { chapterId: ch.id, seq: 0, filePath: 'uploads/1/a.webp', outputPath: 'output/1/a.png' });

		const res = await download(ch.id);
		expect(res.headers.get('x-missing-pages')).toBeNull();
		const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
		expect(Object.keys(entries)).toEqual(['Ch_One/000.webp']);
		expect(strFromU8(entries['Ch_One/000.webp'])).toBe('original-a');
	});

	it('lists a page with no readable file in MISSING_PAGES.txt and counts it in x-missing-pages', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		const ch = seedChapter(db, { bookId: 'b1', seq: 0, title: 'Ch One' });
		put('output/1/a.png', 'translated-a');
		seedPage(db, { chapterId: ch.id, seq: 0, filePath: 'uploads/1/a.webp', outputPath: 'output/1/a.png' });
		seedPage(db, { chapterId: ch.id, seq: 1, filePath: 'uploads/1/gone.webp' });
		const empty = seedPage(db, { chapterId: ch.id, seq: 2, filePath: 'uploads/1/x.webp' });
		db.update(pages).set({ filePath: '' }).where(eq(pages.id, empty.id)).run();

		const res = await download(ch.id);
		expect(res.headers.get('x-missing-pages')).toBe('2');
		const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
		expect(strFromU8(entries['Ch_One/000.png'])).toBe('translated-a');
		const note = strFromU8(entries['Ch_One/MISSING_PAGES.txt']);
		expect(note).toContain('Page 2: image file missing or unreadable');
		expect(note).toContain('Page 3: no image recorded');
	});

	it('sends content-length and zip content-type, and names the folder after the translated title (FEAT-009 Phase 7)', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		const ch = seedChapter(db, { bookId: 'b1', seq: 0, title: 'Raw Title' });
		db.update((await import('$lib/server/db/schema')).chapters).set({ titleTarget: 'The End' }).where(eq((await import('$lib/server/db/schema')).chapters.id, ch.id)).run();
		put('uploads/1/a.webp', 'original-a');
		seedPage(db, { chapterId: ch.id, seq: 0, filePath: 'uploads/1/a.webp' });

		const res = await download(ch.id);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(res.headers.get('content-type')).toBe('application/zip');
		expect(res.headers.get('content-length')).toBe(String(body.byteLength));
		expect(res.headers.get('content-disposition')).toContain('The_End.zip');
		expect(Object.keys(unzipSync(body))).toEqual(['The_End/000.webp']);
	});

	it('is a 404 when no page can be read', async () => {
		const db = getTestDb();
		seedBook(db, { id: 'b1' });
		const ch = seedChapter(db, { bookId: 'b1', seq: 0 });
		seedPage(db, { chapterId: ch.id, seq: 0, filePath: 'uploads/1/gone.webp' });
		await expect(download(ch.id)).rejects.toMatchObject({ status: 404 });
	});
});
