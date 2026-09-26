// POST /api/typeset/preview (FEAT-006 ADR-009)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { resetDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { invalidateSettingsCache } from '$lib/server/settings-service';
import { POST } from '../../src/routes/api/typeset/preview/+server';

function request(body: unknown) {
	const raw = JSON.stringify(body);
	return POST({
		request: new Request('http://localhost/api/typeset/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw }),
		cookies: { get: () => undefined },
	} as unknown as RequestEvent);
}

beforeEach(() => {
	resetDb();
	invalidateSettingsCache();
});

describe('typeset preview endpoint', () => {
	it('returns a WebP for Hindi text', async () => {
		const res = await request({ text: 'रुको! यह कौन सा लोक है?!', targetLang: 'hi' });
		expect(res.headers.get('content-type')).toBe('image/webp');
		expect(res.headers.get('cache-control')).toBe('no-store');
		const buf = Buffer.from(await res.arrayBuffer());
		expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
		expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
	});

	it('renders real glyphs: two different Hindi words give different images', async () => {
		const a = Buffer.from(await (await request({ text: 'कमल', targetLang: 'hi' })).arrayBuffer());
		const b = Buffer.from(await (await request({ text: 'नयन', targetLang: 'hi' })).arrayBuffer());
		expect(a.equals(b)).toBe(false);
	});

	it('renders with the style sent in the request, not the saved settings', async () => {
		const png = async (options: Record<string, unknown>) => Buffer.from(await (await request({ text: 'hello there', targetLang: 'en', options })).arrayBuffer());
		const base = { fontDialogue: 'Poppins', fontWeight: 'normal', fontStyle: 'normal', outlineMode: 'standard', boxInset: 0.05, enableRotation: true, colorMode: 'auto' };
		const upper = await png({ ...base, casing: 'uppercase' });
		const original = await png({ ...base, casing: 'original' });
		expect(upper.equals(original)).toBe(false);
		const heavy = await png({ ...base, casing: 'original', outlineMode: 'heavy' });
		expect(heavy.equals(original)).toBe(false);
	});

	it('rejects text over 500 characters', async () => {
		await expect(request({ text: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an oversized body', async () => {
		await expect(request({ text: 'ok', pad: 'y'.repeat(20000) })).rejects.toMatchObject({ status: 413 });
	});
});
