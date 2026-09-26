import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessHandle } from '$lib/server/access/handle';
import { __resetAccessTokenCacheForTests, getAccessToken, sessionCookieValue } from '$lib/server/access/token';
import { fakeEvent } from '../helpers/request-event';

describe('accessHandle', () => {
	let dir: string;
	const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'xianscan-hook-'));
		process.env.ACCESS_TOKEN_PATH = join(dir, 'access-token');
		__resetAccessTokenCacheForTests();
		resolve.mockClear();
	});

	afterEach(() => {
		delete process.env.ACCESS_TOKEN_PATH;
		__resetAccessTokenCacheForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it('answers an OPTIONS preflight from a web origin with 403 and no CORS headers', async () => {
		const res = await accessHandle({
			event: fakeEvent({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
			resolve,
		});
		expect(res.status).toBe(403);
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
		expect(resolve).not.toHaveBeenCalled();
	});

	it('answers an OPTIONS preflight from an extension with 204 and the reflected origin', async () => {
		const res = await accessHandle({
			event: fakeEvent({ method: 'OPTIONS', headers: { origin: 'chrome-extension://x' } }),
			resolve,
		});
		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('chrome-extension://x');
	});

	it('rejects a LAN API call without a token with 401 JSON', async () => {
		const res = await accessHandle({
			event: fakeEvent({ url: 'http://192.168.1.10:8124/api/books', clientAddress: '192.168.1.20' }),
			resolve,
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.code).toBe('auth_required');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('redirects a LAN page request to /unlock with next', async () => {
		const res = await accessHandle({
			event: fakeEvent({ url: 'http://192.168.1.10:8124/app', clientAddress: '192.168.1.20' }),
			resolve,
		});
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/unlock/?next=%2Fapp');
	});

	it('lets a bearer token through and records how', async () => {
		const event = fakeEvent({
			url: 'http://192.168.1.10:8124/api/books',
			clientAddress: '192.168.1.20',
			headers: { authorization: `Bearer ${getAccessToken()}` },
		});
		const res = await accessHandle({ event, resolve });
		expect(res.status).toBe(200);
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(event.locals.access).toEqual({ via: 'token' });
	});

	it('lets a valid session cookie through for a LAN page', async () => {
		getAccessToken();
		const event = fakeEvent({
			url: 'http://192.168.1.10:8124/app',
			clientAddress: '192.168.1.20',
			cookies: { xianscan_session: sessionCookieValue() },
		});
		const res = await accessHandle({ event, resolve });
		expect(res.status).toBe(200);
		expect(event.locals.access).toEqual({ via: 'cookie' });
	});

	it('lets the local UI through and adds CORS only for extension origins', async () => {
		const local = await accessHandle({ event: fakeEvent(), resolve });
		expect(local.status).toBe(200);
		expect(local.headers.get('access-control-allow-origin')).toBeNull();

		const ext = await accessHandle({
			event: fakeEvent({
				headers: { origin: 'chrome-extension://x', 'x-xianscan-token': getAccessToken(), 'sec-fetch-site': 'cross-site' },
			}),
			resolve,
		});
		expect(ext.status).toBe(200);
		expect(ext.headers.get('access-control-allow-origin')).toBe('chrome-extension://x');
	});

	it('never answers with a wildcard CORS header', async () => {
		const cases = [
			fakeEvent({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
			fakeEvent({ headers: { origin: 'https://evil.example' } }),
			fakeEvent(),
			fakeEvent({ url: 'http://192.168.1.10:8124/api/books', clientAddress: '192.168.1.20' }),
		];
		for (const event of cases) {
			const res = await accessHandle({ event, resolve });
			expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
		}
	});

	it('passes SvelteKit sub-requests through', async () => {
		const res = await accessHandle({
			event: fakeEvent({ url: 'http://192.168.1.10:8124/api/books', clientAddress: '192.168.1.20', isSubRequest: true }),
			resolve,
		});
		expect(res.status).toBe(200);
	});
});
