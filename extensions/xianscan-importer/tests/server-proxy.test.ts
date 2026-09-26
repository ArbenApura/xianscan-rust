// -- TESTS FOR THE BACKGROUND SERVER PROXY -- //

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProxyRejectedError, proxyServerRequest } from '../src/background/server-proxy';

const SERVER = 'http://192.168.1.10:8124';

function okFetch(): any {
	return vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
}

describe('proxyServerRequest', () => {
	it('rejects foreign origins', async () => {
		const fetchImpl = okFetch();
		await expect(
			proxyServerRequest('https://evil.example/api/books', {}, { serverUrl: SERVER, token: 't', fetchImpl }),
		).rejects.toBeInstanceOf(ProxyRejectedError);
		await expect(
			proxyServerRequest('http://192.168.1.10:9999/api/books', {}, { serverUrl: SERVER, token: 't', fetchImpl }),
		).rejects.toBeInstanceOf(ProxyRejectedError);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('rejects unusual methods', async () => {
		const fetchImpl = okFetch();
		await expect(
			proxyServerRequest(`${SERVER}/api/books`, { method: 'TRACE' }, { serverUrl: SERVER, token: 't', fetchImpl }),
		).rejects.toBeInstanceOf(ProxyRejectedError);
	});

	it('strips caller auth headers, adds the stored token and omits cookies', async () => {
		const fetchImpl = okFetch();
		await proxyServerRequest(
			`${SERVER}/api/books`,
			{ method: 'POST', headers: { Authorization: 'Bearer stolen', 'X-XianScan-Token': 'forged', Cookie: 'a=b', 'Content-Type': 'application/json' } },
			{ serverUrl: SERVER, token: 'stored-token', fetchImpl },
		);
		const init = fetchImpl.mock.calls[0][1]!;
		const headers = new Headers(init.headers);
		expect(headers.get('authorization')).toBeNull();
		expect(headers.get('cookie')).toBeNull();
		expect(headers.get('x-xianscan-token')).toBe('stored-token');
		expect(headers.get('content-type')).toBe('application/json');
		expect(init.credentials).toBe('omit');
	});

	it('allows the localhost / 127.0.0.1 alias and falls back between them', async () => {
		const fetchImpl = vi
			.fn()
			.mockRejectedValueOnce(new Error('Failed to fetch'))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		const res = await proxyServerRequest('http://localhost:8124/api/books', {}, {
			serverUrl: 'http://127.0.0.1:8124',
			token: '',
			fetchImpl,
		});
		expect(res.status).toBe(200);
		expect(fetchImpl.mock.calls[1][0]).toBe('http://127.0.0.1:8124/api/books');
	});
});

describe('background message listener', () => {
	let listener: (msg: any, sender: any, sendResponse: (r: any) => void) => boolean | undefined;

	beforeEach(async () => {
		vi.resetModules();
		(globalThis as any).chrome = {
			runtime: {
				id: 'own-extension-id',
				onMessage: { addListener: (fn: typeof listener) => (listener = fn) },
				onInstalled: { addListener: () => undefined },
			},
			storage: { local: { get: async () => ({ serverUrl: SERVER, accessToken: 'stored' }), set: async () => undefined } },
			alarms: { create: () => undefined, onAlarm: { addListener: () => undefined } },
		};
		await import('../src/background');
	});

	afterEach(() => {
		delete (globalThis as any).chrome;
	});

	it('ignores messages from other extensions', () => {
		const sendResponse = vi.fn();
		const handled = listener({ type: 'PROXY_REQUEST', url: `${SERVER}/api/books` }, { id: 'someone-else' }, sendResponse);
		expect(handled).toBe(false);
		expect(sendResponse).not.toHaveBeenCalled();
	});
});
