// REQUEST ACCESS POLICY: PURE, NO IO. hooks.server.ts BUILDS AN AccessRequestInfo AND ASKS
// decideAccess WHETHER THE REQUEST MAY PROCEED. SEE docs/features/server-access-control/SPEC.md.

// -- TYPES -- //

export type AccessVia = 'public' | 'local' | 'token' | 'cookie';
export type AccessDenyReason = 'auth_required' | 'origin_rejected' | 'host_rejected';

export type AccessDecision = { allow: true; via: AccessVia } | { allow: false; reason: AccessDenyReason };

export interface AccessRequestInfo {
	method: string;
	pathname: string;
	host: string | null;
	origin: string | null;
	secFetchSite: string | null;
	clientAddress: string;
	hasForwardingHeaders: boolean;
	bearer: string | null;
	cookie: string | null;
	accept: string | null;
	trustLoopback: boolean;
	isImageRoute: boolean;
}

export interface AccessVerifier {
	token(candidate: string): boolean;
	cookie(value: string): boolean;
}

// -- CONSTANTS -- //

export const PUBLIC_EXACT_PATHS = new Set(['/unlock', '/api/auth/unlock', '/api/auth/status', '/api/auth/logout', '/robots.txt']);
export const PUBLIC_PREFIXES = ['/_app/', '/favicon', '/fonts/', '/.well-known/'];

export const IMAGE_ROUTE_PATTERNS = [/^\/api\/pages\/\d+\/file$/, /^\/api\/covers\/[^/]+\/file$/];

export const FORWARDING_HEADERS = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-real-ip',
	'cf-connecting-ip',
	'true-client-ip',
];

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXTENSION_SCHEMES = new Set(['chrome-extension:', 'moz-extension:', 'safari-web-extension:']);

// -- FUNCTIONS -- //

export function isPublicPath(pathname: string): boolean {
	// PAGES USE trailingSlash = 'always', SO /unlock IS SERVED AS /unlock/
	const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	if (PUBLIC_EXACT_PATHS.has(trimmed)) return true;
	return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isImageRoute(pathname: string): boolean {
	return IMAGE_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export function isLoopbackAddress(addr: string | null | undefined): boolean {
	if (!addr) return false;
	const a = addr.trim().toLowerCase();
	if (a === '::1') return true;
	const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
	return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

/** Hostname part of a Host header is localhost, 127.0.0.1 or [::1] (any port). */
export function isLoopbackHostHeader(host: string | null | undefined): boolean {
	if (!host) return false;
	let hostname: string;
	try {
		hostname = new URL(`http://${host.trim()}`).hostname.toLowerCase();
	} catch {
		return false;
	}
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function isBrowserExtensionOrigin(origin: string | null | undefined): boolean {
	if (!origin) return false;
	try {
		return EXTENSION_SCHEMES.has(new URL(origin).protocol);
	} catch {
		return false;
	}
}

export function originMatchesHost(origin: string | null | undefined, host: string | null | undefined): boolean {
	if (!origin || !host) return false;
	try {
		return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
	} catch {
		return false;
	}
}

function isCrossSiteFetch(secFetchSite: string | null): boolean {
	return secFetchSite === 'cross-site' || secFetchSite === 'same-site';
}

function isTrustedLocal(info: AccessRequestInfo): boolean {
	return (
		info.trustLoopback &&
		isLoopbackAddress(info.clientAddress) &&
		!info.hasForwardingHeaders &&
		isLoopbackHostHeader(info.host)
	);
}

export function decideAccess(info: AccessRequestInfo, verify: AccessVerifier): AccessDecision {
	const method = info.method.toUpperCase();

	// 1. PUBLIC PATHS (UNLOCK PAGE, AUTH ROUTES, STATIC ASSETS)
	if (isPublicPath(info.pathname)) return { allow: true, via: 'public' };

	// 2. HEADER TOKEN. BROWSERS CANNOT ATTACH IT CROSS-SITE WITHOUT A PREFLIGHT, AND PREFLIGHTS ARE
	// ONLY GRANTED TO EXTENSION ORIGINS.
	if (info.bearer && verify.token(info.bearer)) return { allow: true, via: 'token' };

	// 3. SESSION COOKIE, WITH A CSRF CHECK ON UNSAFE METHODS
	if (info.cookie && verify.cookie(info.cookie)) {
		if (UNSAFE_METHODS.has(method)) {
			const sameOriginNoHeader =
				!info.origin && (info.secFetchSite === null || info.secFetchSite === 'same-origin' || info.secFetchSite === 'none');
			if (!sameOriginNoHeader && !originMatchesHost(info.origin, info.host)) {
				return { allow: false, reason: 'origin_rejected' };
			}
		}
		return { allow: true, via: 'cookie' };
	}

	// 4. TRUSTED LOCAL: LOOPBACK SOCKET, LOOPBACK HOST, NO PROXY HEADERS, NOT A CROSS-SITE BROWSER REQUEST
	if (isTrustedLocal(info)) {
		const originOk = !info.origin || originMatchesHost(info.origin, info.host);
		if (originOk && !isCrossSiteFetch(info.secFetchSite)) return { allow: true, via: 'local' };

		// 5. LOOPBACK IMAGE EXEMPTION (ADR-006): <img> TAGS ON MANGA SITES LOAD SERVER IMAGES CROSS-SITE
		if ((method === 'GET' || method === 'HEAD') && info.isImageRoute) return { allow: true, via: 'local' };
	}

	// 6. DENY. A LOOPBACK SOCKET WITH A FOREIGN HOST HEADER IS THE DNS-REBINDING SIGNATURE.
	if (
		info.trustLoopback &&
		isLoopbackAddress(info.clientAddress) &&
		!info.hasForwardingHeaders &&
		info.host &&
		!isLoopbackHostHeader(info.host)
	) {
		return { allow: false, reason: 'host_rejected' };
	}
	return { allow: false, reason: 'auth_required' };
}
