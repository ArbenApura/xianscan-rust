import { describe, it, expect } from 'vitest';
import {
	decideAccess,
	isImageRoute,
	isLoopbackAddress,
	isLoopbackHostHeader,
	type AccessRequestInfo,
} from '$lib/server/access/policy';

const TOKEN = 'good-token';
const COOKIE = 'good-cookie';
const verify = { token: (c: string) => c === TOKEN, cookie: (v: string) => v === COOKIE };

function req(overrides: Partial<AccessRequestInfo> = {}): AccessRequestInfo {
	const pathname = overrides.pathname ?? '/api/books';
	return {
		method: 'GET',
		pathname,
		host: 'localhost:8124',
		origin: null,
		secFetchSite: null,
		clientAddress: '127.0.0.1',
		hasForwardingHeaders: false,
		bearer: null,
		cookie: null,
		accept: null,
		trustLoopback: true,
		isImageRoute: isImageRoute(pathname),
		...overrides,
	};
}

describe('decideAccess', () => {
	it('allows the same-origin UI on localhost from 127.0.0.1', () => {
		expect(
			decideAccess(req({ method: 'POST', origin: 'http://localhost:8124', secFetchSite: 'same-origin' }), verify),
		).toEqual({ allow: true, via: 'local' });
	});

	it('denies a cross-origin POST to 127.0.0.1:8124', () => {
		const d = decideAccess(
			req({ method: 'POST', host: '127.0.0.1:8124', origin: 'https://evil.example', secFetchSite: 'cross-site' }),
			verify,
		);
		expect(d.allow).toBe(false);
	});

	it('denies GET with Sec-Fetch-Site cross-site and no Origin', () => {
		expect(decideAccess(req({ secFetchSite: 'cross-site' }), verify).allow).toBe(false);
	});

	it('denies Sec-Fetch-Site same-site (another localhost port)', () => {
		expect(decideAccess(req({ secFetchSite: 'same-site', origin: 'http://localhost:5173' }), verify).allow).toBe(false);
	});

	it('flags DNS rebinding as host_rejected', () => {
		expect(decideAccess(req({ host: 'evil.example:8124' }), verify)).toEqual({ allow: false, reason: 'host_rejected' });
	});

	it('LAN client: denied without credentials, allowed with bearer or cookie', () => {
		const lan = { clientAddress: '192.168.1.20', host: '192.168.1.10:8124' };
		expect(decideAccess(req(lan), verify)).toEqual({ allow: false, reason: 'auth_required' });
		expect(decideAccess(req({ ...lan, bearer: TOKEN }), verify)).toEqual({ allow: true, via: 'token' });
		expect(decideAccess(req({ ...lan, cookie: COOKIE }), verify)).toEqual({ allow: true, via: 'cookie' });
		expect(decideAccess(req({ ...lan, bearer: 'wrong' }), verify).allow).toBe(false);
	});

	it('denies a cookie with a cross-origin POST as origin_rejected', () => {
		expect(
			decideAccess(
				req({
					method: 'POST',
					clientAddress: '192.168.1.20',
					host: '192.168.1.10:8124',
					cookie: COOKIE,
					origin: 'https://evil.example',
				}),
				verify,
			),
		).toEqual({ allow: false, reason: 'origin_rejected' });
	});

	it('allows a cookie POST from the same origin', () => {
		expect(
			decideAccess(
				req({
					method: 'POST',
					clientAddress: '192.168.1.20',
					host: '192.168.1.10:8124',
					cookie: COOKIE,
					origin: 'http://192.168.1.10:8124',
				}),
				verify,
			),
		).toEqual({ allow: true, via: 'cookie' });
	});

	it('denies loopback requests that carry forwarding headers', () => {
		expect(decideAccess(req({ hasForwardingHeaders: true }), verify).allow).toBe(false);
	});

	it('denies local trust when trustLoopback is off', () => {
		expect(decideAccess(req({ trustLoopback: false }), verify)).toEqual({ allow: false, reason: 'auth_required' });
	});

	it('extension origins need the token', () => {
		expect(decideAccess(req({ origin: 'chrome-extension://abc', secFetchSite: 'cross-site' }), verify).allow).toBe(false);
		expect(
			decideAccess(req({ origin: 'chrome-extension://abc', secFetchSite: 'cross-site', bearer: TOKEN }), verify),
		).toEqual({ allow: true, via: 'token' });
	});

	it('image route exemption applies to loopback GET only (ADR-006)', () => {
		const img = { pathname: '/api/pages/12/file', secFetchSite: 'cross-site', origin: 'https://manga.example' };
		expect(decideAccess(req(img), verify)).toEqual({ allow: true, via: 'local' });
		expect(decideAccess(req({ ...img, clientAddress: '192.168.1.20', host: '192.168.1.10:8124' }), verify).allow).toBe(
			false,
		);
		expect(decideAccess(req({ ...img, method: 'DELETE' }), verify).allow).toBe(false);
		expect(decideAccess(req({ ...img, pathname: '/api/covers/abc/file' }), verify).allow).toBe(true);
	});

	it('allows public paths without credentials', () => {
		const lan = { clientAddress: '192.168.1.20', host: '192.168.1.10:8124' };
		for (const pathname of ['/unlock', '/api/auth/unlock', '/api/auth/status', '/_app/immutable/x.js', '/favicon.ico']) {
			expect(decideAccess(req({ ...lan, pathname }), verify)).toEqual({ allow: true, via: 'public' });
		}
		expect(decideAccess(req({ ...lan, pathname: '/app' }), verify).allow).toBe(false);
	});

	it('treats ::1 and ::ffff:127.0.0.1 as loopback', () => {
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('127.8.9.10')).toBe(true);
		expect(isLoopbackAddress('::ffff:192.168.1.1')).toBe(false);
		expect(isLoopbackAddress('10.0.0.1')).toBe(false);
		expect(decideAccess(req({ clientAddress: '::1', host: '[::1]:8124' }), verify)).toEqual({ allow: true, via: 'local' });
		expect(decideAccess(req({ clientAddress: '::ffff:127.0.0.1' }), verify)).toEqual({ allow: true, via: 'local' });
	});

	it('isLoopbackHostHeader checks only the hostname', () => {
		expect(isLoopbackHostHeader('localhost:8124')).toBe(true);
		expect(isLoopbackHostHeader('127.0.0.1')).toBe(true);
		expect(isLoopbackHostHeader('[::1]:8124')).toBe(true);
		expect(isLoopbackHostHeader('localhost.evil.example')).toBe(false);
		expect(isLoopbackHostHeader(null)).toBe(false);
	});
});
