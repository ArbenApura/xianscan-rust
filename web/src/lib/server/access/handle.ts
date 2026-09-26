// ACCESS HANDLE: FIRST IN THE hooks.server.ts SEQUENCE. EVERY REQUEST IS CHECKED WITH decideAccess;
// EXTENSION ORIGINS GET CORS HEADERS, EVERYONE ELSE GETS NONE. LIVES HERE (NOT IN hooks.server.ts)
// SO TESTS CAN IMPORT IT WITHOUT THE HOOK FILE'S STARTUP SIDE EFFECTS.
// IMPORTED DEP-TYPES
import type { Handle, RequestEvent } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
// IMPORTED MODULES
import { corsHeadersFor } from './cors';
import {
	FORWARDING_HEADERS,
	decideAccess,
	isImageRoute,
	type AccessDecision,
	type AccessRequestInfo,
} from './policy';
import { verifySessionCookie, verifyToken } from './token';

// -- CONSTANTS -- //

export const SESSION_COOKIE = 'xianscan_session';
export const AUTH_REQUIRED_MESSAGE =
	'XianScan access token required. Copy it from Settings, Network & Access, then paste it into the extension or open /unlock.';
const LOG_INTERVAL_MS = 60_000;

// -- STATE -- //

const lastLogged = new Map<string, number>();

// -- FUNCTIONS -- //

/**
 * Whether the browser reached us over TLS. adapter-node reports `https:` in event.url unless ORIGIN or
 * PROTOCOL_HEADER is configured, so url.protocol cannot be trusted here: a Secure cookie on a plain-http
 * LAN address is dropped by the browser and the unlock would never stick. Node itself only serves plain
 * http, so TLS means a proxy or tunnel in front that says so.
 */
export function isSecureTransport(request: Request): boolean {
	const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
	if (proto === 'https') return true;
	const cfVisitor = request.headers.get('cf-visitor');
	return cfVisitor !== null && cfVisitor.includes('"scheme":"https"');
}

function bearerFrom(headers: Headers): string | null {
	const auth = headers.get('authorization');
	if (auth && /^bearer\s+/i.test(auth)) {
		const value = auth.replace(/^bearer\s+/i, '').trim();
		if (value.length > 0) return value;
	}
	const header = headers.get('x-xianscan-token');
	return header && header.trim().length > 0 ? header.trim() : null;
}

function clientAddressOf(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

export function buildAccessInfo(event: RequestEvent, pathnameOverride?: string): AccessRequestInfo {
	const headers = event.request.headers;
	const pathname = pathnameOverride ?? event.url.pathname;
	return {
		method: event.request.method,
		pathname,
		host: headers.get('host'),
		origin: headers.get('origin'),
		secFetchSite: headers.get('sec-fetch-site'),
		clientAddress: clientAddressOf(event),
		hasForwardingHeaders: FORWARDING_HEADERS.some((h) => headers.has(h)),
		bearer: bearerFrom(headers),
		cookie: event.cookies.get(SESSION_COOKIE) ?? null,
		accept: headers.get('accept'),
		trustLoopback: env.XIANSCAN_TRUST_LOOPBACK !== '0',
		isImageRoute: isImageRoute(pathname),
	};
}

export function evaluateAccess(event: RequestEvent, pathnameOverride?: string): AccessDecision {
	return decideAccess(buildAccessInfo(event, pathnameOverride), {
		token: (c) => verifyToken(c),
		cookie: (v) => verifySessionCookie(v),
	});
}

function logDenied(reason: string, clientAddress: string, method: string, pathname: string): void {
	const key = `${reason}|${clientAddress}`;
	const now = Date.now();
	const last = lastLogged.get(key);
	if (last !== undefined && now - last < LOG_INTERVAL_MS) return;
	lastLogged.set(key, now);
	if (lastLogged.size > 1000) lastLogged.clear();
	console.warn(`[access] denied (${reason}) ${method} ${pathname} from ${clientAddress || 'unknown'}`);
}

function withCors(response: Response, cors: Record<string, string> | null): Response {
	if (!cors) return response;
	try {
		for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
		return response;
	} catch {
		// IMMUTABLE HEADERS (E.G. A PASSED-THROUGH fetch RESPONSE): COPY INTO A NEW RESPONSE
		const headers = new Headers(response.headers);
		for (const [k, v] of Object.entries(cors)) headers.set(k, v);
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	}
}

export const accessHandle: Handle = async ({ event, resolve }) => {
	const origin = event.request.headers.get('origin');
	const cors = corsHeadersFor(origin);

	// PREFLIGHT: ONLY EXTENSION ORIGINS ARE ANSWERED
	if (event.request.method === 'OPTIONS') {
		return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
	}

	// SERVER-SIDE fetch FROM A load FUNCTION: THE PARENT REQUEST WAS ALREADY CHECKED
	if (event.isSubRequest) {
		event.locals.access = event.locals.access ?? { via: 'local' };
		return resolve(event);
	}

	const decision = evaluateAccess(event);
	const pathname = event.url.pathname;

	if (!decision.allow) {
		logDenied(decision.reason, clientAddressOf(event), event.request.method, pathname);
		if (pathname.startsWith('/api/')) {
			const status = decision.reason === 'origin_rejected' ? 403 : 401;
			return withCors(json({ message: AUTH_REQUIRED_MESSAGE, code: decision.reason }, { status }), cors);
		}
		const next = encodeURIComponent(pathname + event.url.search);
		return new Response(null, { status: 303, headers: { location: `/unlock/?next=${next}` } });
	}

	event.locals.access = { via: decision.via };
	const response = await resolve(event);
	return withCors(response, cors);
};
