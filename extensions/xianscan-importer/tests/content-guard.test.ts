// -- TESTS FOR SERVER ORIGIN HELPERS (CONTENT SCRIPT GUARD, IMAGE PROXY RULE) -- //

import { describe, it, expect, afterEach } from 'vitest';
import { isOnServerDashboard, isServerUrl, shouldProxyServerImage, swapLoopbackAlias } from '../src/core/origin';

describe('content script dashboard guard', () => {
	it('skips the configured server origin, including a LAN IP', () => {
		expect(isOnServerDashboard('http://192.168.1.10:8124/app/book/1', 'http://192.168.1.10:8124')).toBe(true);
		expect(isOnServerDashboard('http://localhost:8124/app/', 'http://127.0.0.1:8124')).toBe(true);
	});

	it('does not skip unrelated sites, even with an /app path or localhost-like host', () => {
		expect(isOnServerDashboard('https://site.example/app/chapter-1', 'http://127.0.0.1:8124')).toBe(false);
		expect(isOnServerDashboard('https://localhost.site.example/', 'http://127.0.0.1:8124')).toBe(false);
		expect(isOnServerDashboard('http://127.0.0.1:3000/', 'http://127.0.0.1:8124')).toBe(false);
	});
});

describe('origin helpers', () => {
	it('isServerUrl compares origins only', () => {
		expect(isServerUrl('http://127.0.0.1:8124/api/x', 'http://127.0.0.1:8124/')).toBe(true);
		expect(isServerUrl('http://127.0.0.1:8124.evil.example/api', 'http://127.0.0.1:8124')).toBe(false);
		expect(isServerUrl('javascript:alert(1)', 'http://127.0.0.1:8124')).toBe(false);
	});

	it('swapLoopbackAlias touches only the host', () => {
		expect(swapLoopbackAlias('http://localhost:8124/localhost/x')).toBe('http://127.0.0.1:8124/localhost/x');
		expect(swapLoopbackAlias('http://192.168.1.10:8124/')).toBeNull();
	});
});

describe('shouldProxyServerImage', () => {
	afterEach(() => {
		delete (globalThis as any).chrome;
	});

	it('proxies a non-loopback server even on an http page, and mixed content on https pages', () => {
		(globalThis as any).chrome = { runtime: { sendMessage: () => undefined } };
		expect(shouldProxyServerImage('http://192.168.1.10:8124/api/pages/1/file', 'http:')).toBe(true);
		expect(shouldProxyServerImage('http://127.0.0.1:8124/api/pages/1/file', 'https:')).toBe(true);
		expect(shouldProxyServerImage('http://127.0.0.1:8124/api/pages/1/file', 'http:')).toBe(false);
		expect(shouldProxyServerImage('data:image/png;base64,xx', 'https:')).toBe(false);
	});

	it('never proxies without the extension runtime', () => {
		expect(shouldProxyServerImage('http://192.168.1.10:8124/api/pages/1/file', 'http:')).toBe(false);
	});
});
