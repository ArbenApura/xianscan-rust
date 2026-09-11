// MULTI-WEIGHT FONT FAMILIES AND SYSTEM FONT SCANNING INTEGRATION TESTS
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getTestDb, resetDb } from '../helpers/db';
import { getUserFontsDir } from '$lib/server/typeset';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('Multi-Weight Font Families and System Fonts Scanning API', () => {
	const fontDir = join(process.cwd(), 'static/fonts');
	const cleanupFiles: string[] = [];

	beforeEach(() => {
		resetDb();
	});

	afterEach(() => {
		const userFontsDir = getUserFontsDir();
		for (const f of cleanupFiles) {
			const p = join(userFontsDir, f);
			if (existsSync(p)) {
				try {
					unlinkSync(p);
				} catch {}
			}
		}
		cleanupFiles.length = 0;
	});

	it('POST /api/system/fonts accepts multiple weight files and creates unified font family with variants', async () => {
		vi.resetModules();
		const { POST, GET: listFonts } = await import('../../src/routes/api/system/fonts/+server');
		const { GET: getVariants, POST: addVariant } = await import('../../src/routes/api/system/fonts/[id]/variants/+server');
		const { GET: getVariantBinary, DELETE: deleteVariant } = await import('../../src/routes/api/system/fonts/[id]/variants/[variantId]/+server');

		const regBuf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const boldBuf = readFileSync(join(fontDir, 'GeneralSans-Bold.ttf'));

		const file1 = new File([regBuf], 'TestFamily-Regular.ttf', { type: 'font/ttf' });
		const file2 = new File([boldBuf], 'TestFamily-Bold.ttf', { type: 'font/ttf' });

		const formData = new FormData();
		formData.append('files', file1);
		formData.append('files', file2);
		formData.append('name', 'Test Multi Family');
		formData.append('scriptType', 'dialogue');

		// 1. UPLOAD MULTIPLE FILES
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: formData }),
		} as unknown as RequestEvent);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.font.name).toBe('Test Multi Family');
		expect(data.font.supportedWeights).toContain('normal');
		expect(data.font.supportedWeights).toContain('bold');

		const fontId = data.font.id;
		cleanupFiles.push(data.font.fileName);

		// 2. CHECK GET /api/system/fonts RETURNS CUSTOM FAMILY WITH VARIANTS
		const listRes = await listFonts({} as RequestEvent);
		const listData = await listRes.json();
		expect(listData.customFonts.length).toBe(1);
		expect(listData.customFonts[0].variants.length).toBeGreaterThanOrEqual(1);

		for (const v of listData.customFonts[0].variants) {
			cleanupFiles.push(v.fileName);
		}

		// 3. CHECK GET /api/system/fonts/[id]/variants
		const variantsRes = await getVariants({
			params: { id: fontId },
		} as unknown as RequestEvent);
		expect(variantsRes.status).toBe(200);
		const variantsData = await variantsRes.json();
		expect(variantsData.success).toBe(true);
		expect(variantsData.variants.length).toBeGreaterThanOrEqual(1);

		const variantId = variantsData.variants[0].id;

		// 4. STREAM SPECIFIC VARIANT BINARY
		const streamRes = await getVariantBinary({
			params: { id: fontId, variantId },
		} as unknown as RequestEvent);
		expect(streamRes.status).toBe(200);
		expect(streamRes.headers.get('Content-Type')).toBe('font/ttf');
		const streamedBuf = await streamRes.arrayBuffer();
		expect(streamedBuf.byteLength).toBeGreaterThan(1000);

		// 5. DELETE SPECIFIC VARIANT
		const delRes = await deleteVariant({
			params: { id: fontId, variantId },
		} as unknown as RequestEvent);
		expect(delRes.status).toBe(200);
		const delData = await delRes.json();
		expect(delData.success).toBe(true);

		// 6. VERIFY VARIANT WAS REMOVED
		const afterDelRes = await getVariants({
			params: { id: fontId },
		} as unknown as RequestEvent);
		const afterDelData = await afterDelRes.json();
		expect(afterDelData.variants.some((v: any) => v.id === variantId)).toBe(false);
	});

	it('GET /api/system/fonts/system queries installed OS fonts and resolves fonts', async () => {
		vi.resetModules();
		const { GET: getSystemFonts } = await import('../../src/routes/api/system/fonts/system/+server');
		const { GET: streamSystemFont } = await import('../../src/routes/api/system/fonts/system/[family]/+server');

		const url = new URL('http://localhost/api/system/fonts/system');
		const res = await getSystemFonts({ url } as unknown as RequestEvent);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(Array.isArray(data.fonts)).toBe(true);
		expect(data.total).toBeGreaterThan(0);

		// TEST SCRIPT FILTER
		const cjkUrl = new URL('http://localhost/api/system/fonts/system?script=cjk');
		const cjkRes = await getSystemFonts({ url: cjkUrl } as unknown as RequestEvent);
		expect(cjkRes.status).toBe(200);
		const cjkData = await cjkRes.json();
		for (const f of cjkData.fonts) {
			expect(f.scriptType).toBe('cjk');
		}

		// TEST STREAMING SYSTEM FONT THAT DOES NOT EXIST
		const nonexistentRes = await streamSystemFont({
			params: { family: 'NonExistentFontFamily12345' },
		} as unknown as RequestEvent);
		expect(nonexistentRes.status).toBe(404);
	});
});
