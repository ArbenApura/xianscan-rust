import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST as unlock } from '../../src/routes/api/auth/unlock/+server';
import { POST as logout } from '../../src/routes/api/auth/logout/+server';
import { GET as status } from '../../src/routes/api/auth/status/+server';
import { __resetAccessTokenCacheForTests, getAccessToken, verifySessionCookie } from '$lib/server/access/token';
import { __resetUnlockLimiterForTests } from '$lib/server/access/unlock-limiter';
import { safeNext } from '$lib/utils/safe-next';
import { fakeEvent } from '../helpers/request-event';

const LAN = { url: 'http://192.168.1.10:8124/api/auth/unlock', clientAddress: '192.168.1.20' };

describe('auth routes', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'xianscan-auth-'));
		process.env.ACCESS_TOKEN_PATH = join(dir, 'access-token');
		__resetAccessTokenCacheForTests();
		__resetUnlockLimiterForTests();
	});

	afterEach(() => {
		delete process.env.ACCESS_TOKEN_PATH;
		__resetAccessTokenCacheForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it('sets the session cookie on a correct token', async () => {
		const event = fakeEvent({ ...LAN, method: 'POST', body: { token: getAccessToken() } });
		const res = await unlock(event);
		expect(res.status).toBe(204);
		expect(event.setCookies).toHaveLength(1);
		expect(event.setCookies[0].name).toBe('xianscan_session');
		expect(event.setCookies[0].opts.httpOnly).toBe(true);
		expect(event.setCookies[0].opts.sameSite).toBe('lax');
		expect(verifySessionCookie(event.setCookies[0].value)).toBe(true);
	});

	it('marks the cookie Secure only behind a TLS proxy (adapter-node reports https: by default)', async () => {
		// event.url SAYS https: (AS adapter-node DOES) BUT THE TRANSPORT IS PLAIN HTTP ON THE LAN
		const plain = fakeEvent({
			...LAN,
			url: 'https://192.168.1.10:8124/api/auth/unlock',
			method: 'POST',
			body: { token: getAccessToken() },
		});
		await unlock(plain);
		expect(plain.setCookies[0].opts.secure).toBe(false);

		const tunnel = fakeEvent({
			...LAN,
			method: 'POST',
			headers: { 'x-forwarded-proto': 'https' },
			body: { token: getAccessToken() },
		});
		await unlock(tunnel);
		expect(tunnel.setCookies[0].opts.secure).toBe(true);
	});

	it('returns 401 on a wrong token and 429 on the 11th failure in a minute', async () => {
		getAccessToken();
		for (let i = 0; i < 10; i++) {
			const res = await unlock(fakeEvent({ ...LAN, method: 'POST', body: { token: 'wrong' } }));
			expect(res.status).toBe(401);
		}
		const blocked = await unlock(fakeEvent({ ...LAN, method: 'POST', body: { token: getAccessToken() } }));
		expect(blocked.status).toBe(429);

		// OTHER CLIENTS ARE NOT AFFECTED
		const other = await unlock(
			fakeEvent({ ...LAN, clientAddress: '192.168.1.30', method: 'POST', body: { token: getAccessToken() } }),
		);
		expect(other.status).toBe(204);
	});

	it('rejects a malformed body', async () => {
		const res = await unlock(fakeEvent({ ...LAN, method: 'POST', body: { nope: 1 } }));
		expect(res.status).toBe(401);
	});

	it('logout clears the cookie', async () => {
		const event = fakeEvent({ ...LAN, method: 'POST', cookies: { xianscan_session: 'x' } });
		const res = await logout(event);
		expect(res.status).toBe(204);
		expect(event.deleted).toContain('xianscan_session');
	});

	it('status reports whether the caller is authenticated', async () => {
		const anon = await (await status(fakeEvent({ ...LAN, url: 'http://192.168.1.10:8124/api/auth/status' }))).json();
		expect(anon.authenticated).toBe(false);

		const local = await (await status(fakeEvent({ url: 'http://localhost:8124/api/auth/status' }))).json();
		expect(local).toMatchObject({ authenticated: true, via: 'local' });
	});
});

describe('safeNext', () => {
	it.each([
		['/app', '/app'],
		['/app/book/1?x=2#y', '/app/book/1?x=2#y'],
		[null, '/'],
		['', '/'],
		['https://evil.example', '/'],
		['//evil.example', '/'],
		['/\\evil.example', '/'],
		['javascript:alert(1)', '/'],
		['/unlock/', '/'],
		['/app/../unlock', '/'],
		['/app/books/1?x=1#h', '/app/books/1?x=1#h'],
		['/app/./books/../books/2', '/app/books/2'],
		// DOT SEGMENTS THAT NORMALISE INTO A PROTOCOL-RELATIVE "//HOST" PATH
		['/.//evil.com', '/'],
		['/..//evil.com/x', '/'],
		['/%2e//evil.com', '/'],
		['/%2E%2E//evil.com', '/'],
		['/a/..//evil.com', '/'],
		['/a/b/../..//evil.com', '/'],
		['/ok\u0000', '/'],
	])('%s -> %s', (raw, expected) => {
		expect(safeNext(raw as string | null)).toBe(expected);
	});
});
