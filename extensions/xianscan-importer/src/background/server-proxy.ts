// -- BACKGROUND SERVER PROXY: THE ONLY PLACE THE ACCESS TOKEN IS ATTACHED FOR PAGE-ORIGINATED REQUESTS -- //

// IMPORTED MODULES
import { XianScanClient } from '../api';
import { getAccessToken, getServerUrl } from '../core/storage';
import { isServerUrl, swapLoopbackAlias } from '../core/origin';
import { safeFetch } from './downloader';

// -- CONSTANTS -- //

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
// CALLER-SUPPLIED CREDENTIALS ARE NEVER FORWARDED; THE WORKER ADDS ITS OWN
const STRIPPED_HEADERS = ['authorization', 'x-xianscan-token', 'cookie'];
const PROXY_TIMEOUT_MS = 12000;

// -- TYPES -- //

export interface ProxyContext {
	serverUrl: string;
	token: string;
	fetchImpl?: typeof fetch;
}

export class ProxyRejectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProxyRejectedError';
	}
}

// -- FUNCTIONS -- //

function sanitizedHeaders(raw: HeadersInit | undefined, token: string): Headers {
	const headers = new Headers(raw);
	for (const name of STRIPPED_HEADERS) headers.delete(name);
	if (token) headers.set('X-XianScan-Token', token);
	return headers;
}

function collapseSlashes(url: string): string {
	try {
		const u = new URL(url);
		u.pathname = u.pathname.replace(/\/+/g, '/');
		return u.href;
	} catch {
		return url;
	}
}

/**
 * PROXY_REQUEST handler: only the configured server origin (or its localhost / 127.0.0.1 alias),
 * only the usual methods, caller auth headers dropped, the stored token added, cookies omitted.
 */
export async function proxyServerRequest(url: string, options: RequestInit = {}, ctx: ProxyContext): Promise<Response> {
	if (!isServerUrl(url, ctx.serverUrl)) {
		throw new ProxyRejectedError('Proxy target is not the configured XianScan server');
	}
	const method = (options.method || 'GET').toUpperCase();
	if (!ALLOWED_METHODS.has(method)) {
		throw new ProxyRejectedError(`Method ${method} is not allowed through the proxy`);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
	const init: RequestInit = {
		...options,
		method,
		headers: sanitizedHeaders(options.headers, ctx.token),
		credentials: 'omit',
		signal: controller.signal,
	};
	const fetchImpl = ctx.fetchImpl ?? safeFetch;
	const cleanUrl = collapseSlashes(url);

	try {
		return await fetchImpl(cleanUrl, init);
	} catch (err: any) {
		const isConnIssue = err?.message?.includes('Failed to fetch') || err?.name === 'AbortError';
		const fallbackUrl = swapLoopbackAlias(cleanUrl);
		if (isConnIssue && fallbackUrl) {
			return await fetchImpl(fallbackUrl, init);
		}
		throw err;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Fetch used by background code for server calls (SSE, uploads, API). Attaches the token only when
 * the target is the configured server; any other URL is fetched untouched and without it.
 */
export async function serverFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const serverUrl = await getServerUrl();
	if (!isServerUrl(url, serverUrl)) return safeFetch(input, init);
	const token = await getAccessToken();
	const headers = new Headers(init.headers);
	if (token) headers.set('X-XianScan-Token', token);
	return safeFetch(input, { ...init, headers, credentials: 'omit' });
}

// API CLIENT FOR BACKGROUND CODE, WIRED WITH THE STORED SERVER URL AND TOKEN
export async function createServerClient(): Promise<XianScanClient> {
	const [serverUrl, token] = await Promise.all([getServerUrl(), getAccessToken()]);
	return new XianScanClient(serverUrl, safeFetch, token);
}
