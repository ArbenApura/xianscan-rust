// CUSTOM FONTS SERVER API AND INTEGRATION TESTS
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getTestDb, resetDb } from '../helpers/db';
import { typesetPage, getUserFontsDir } from '$lib/server/typeset';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('Custom Fonts Server API and Typesetting Integration', () => {
	const fontDir = join(process.cwd(), 'static/fonts');
	let createdFontId: string | null = null;
	let createdFileName: string | null = null;

	beforeEach(() => {
		resetDb();
	});

	afterEach(() => {
		if (createdFileName) {
			const userFontsDir = getUserFontsDir();
			const p = join(userFontsDir, createdFileName);
			if (existsSync(p)) {
				try {
					unlinkSync(p);
				} catch {}
			}
		}
	});

	it('GET /api/system/fonts returns default bundled fonts and empty custom list initially', async () => {
		vi.resetModules();
		const { GET } = await import('../../src/routes/api/system/fonts/+server');
		const res = await GET({} as RequestEvent);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.fonts['CC Wild Words']).toBeDefined();
		expect(data.fonts['CC Wild Words'].bundled).toBe(true);
		expect(Array.isArray(data.customFonts)).toBe(true);
		expect(data.customFonts.length).toBe(0);
	});

	it('POST /api/system/fonts rejects invalid file extension, missing file, or reserved name', async () => {
		vi.resetModules();
		const { POST } = await import('../../src/routes/api/system/fonts/+server');

		// 1. NO FILE PROVIDED
		const emptyFormData = new FormData();
		const res1 = await POST({ request: new Request('http://localhost', { method: 'POST', body: emptyFormData }) } as unknown as RequestEvent);
		expect(res1.status).toBe(400);

		// 2. INVALID FILE EXTENSION (.TXT)
		const txtFormData = new FormData();
		const dummyTxt = new File(['not a font'], 'test.txt', { type: 'text/plain' });
		txtFormData.append('file', dummyTxt);
		const res2 = await POST({ request: new Request('http://localhost', { method: 'POST', body: txtFormData }) } as unknown as RequestEvent);
		expect(res2.status).toBe(400);

		// 3. COLLISION WITH RESERVED BUNDLED FONT NAME
		const sampleBuf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const reservedFormData = new FormData();
		reservedFormData.append('file', new File([sampleBuf], 'Reserved.ttf', { type: 'font/ttf' }));
		reservedFormData.append('name', 'CC Wild Words');
		const res3 = await POST({ request: new Request('http://localhost', { method: 'POST', body: reservedFormData }) } as unknown as RequestEvent);
		expect(res3.status).toBe(400);
		const res3Data = await res3.json();
		expect(res3Data.error).toContain('RESERVED');
	});

	it('POST, GET, and DELETE custom font lifecycle with typesetting integration', async () => {
		vi.resetModules();
		const { POST, GET: listFonts } = await import('../../src/routes/api/system/fonts/+server');
		const { GET: getFontBinary, DELETE: deleteFont } = await import('../../src/routes/api/system/fonts/[id]/+server');
		const { LATIN_DIALOGUE_FONTS } = await import('$lib/server/typeset/fonts');

		const sampleBuf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const fontFile = new File([sampleBuf], 'CustomSans-Regular.ttf', { type: 'font/ttf' });

		const formData = new FormData();
		formData.append('file', fontFile);
		formData.append('name', 'Custom Test Sans');
		formData.append('scriptType', 'dialogue');

		// 1. UPLOAD CUSTOM FONT
		const uploadRes = await POST({ request: new Request('http://localhost', { method: 'POST', body: formData }) } as unknown as RequestEvent);
		expect(uploadRes.status).toBe(200);
		const uploadData = await uploadRes.json();
		expect(uploadData.success).toBe(true);
		expect(uploadData.font.name).toBe('Custom Test Sans');
		expect(uploadData.font.format).toBe('truetype');
		expect(uploadData.font.scriptType).toBe('dialogue');

		createdFontId = uploadData.font.id;
		createdFileName = uploadData.font.fileName;
		expect(LATIN_DIALOGUE_FONTS.has('Custom Test Sans')).toBe(true);

		// 1B. REJECT DUPLICATE CUSTOM FONT NAME
		const dupFormData = new FormData();
		dupFormData.append('file', fontFile);
		dupFormData.append('name', 'Custom Test Sans');
		const dupRes = await POST({ request: new Request('http://localhost', { method: 'POST', body: dupFormData }) } as unknown as RequestEvent);
		expect(dupRes.status).toBe(400);
		const dupData = await dupRes.json();
		expect(dupData.error).toContain('ALREADY EXISTS');

		// 2. VERIFY GET LIST INCLUDES CUSTOM FONT
		const listRes = await listFonts({} as RequestEvent);
		const listData = await listRes.json();
		expect(listData.customFonts.length).toBe(1);
		expect(listData.customFonts[0].name).toBe('Custom Test Sans');
		expect(listData.fonts['Custom Test Sans']).toBeDefined();
		expect(listData.fonts['Custom Test Sans'].custom).toBe(true);

		// 3. FETCH BINARY VIA STREAMING ENDPOINT
		const binaryRes = await getFontBinary({ params: { id: createdFontId! } } as unknown as RequestEvent);
		expect(binaryRes.status).toBe(200);
		expect(binaryRes.headers.get('Content-Type')).toBe('font/ttf');
		const fetchedArrayBuffer = await binaryRes.arrayBuffer();
		expect(fetchedArrayBuffer.byteLength).toBe(sampleBuf.byteLength);

		// 4. TYPESET A TEST PAGE WITH THE CUSTOM FONT
		const dummyPng = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
			'base64'
		);
		const typesetResult = await typesetPage(
			dummyPng,
			[
				{
					id: 'region-custom-1',
					box: { x: 0, y: 0, w: 100, h: 50 },
					text: 'TEST DIALOGUE IN CUSTOM FONT',
					kind: 'dialogue_bubble',
				},
			],
			{
				fontDialogue: 'Custom Test Sans',
			}
		);
		expect(typesetResult).toBeInstanceOf(Buffer);
		expect(typesetResult.length).toBeGreaterThan(0);

		// 5. DELETE CUSTOM FONT
		const deleteRes = await deleteFont({ params: { id: createdFontId! } } as unknown as RequestEvent);
		expect(deleteRes.status).toBe(200);
		const deleteData = await deleteRes.json();
		expect(deleteData.success).toBe(true);
		expect(LATIN_DIALOGUE_FONTS.has('Custom Test Sans')).toBe(false);

		// 6. VERIFY NOT FOUND AFTER DELETION
		const notFoundRes = await getFontBinary({ params: { id: createdFontId! } } as unknown as RequestEvent);
		expect(notFoundRes.status).toBe(404);
	});
});
