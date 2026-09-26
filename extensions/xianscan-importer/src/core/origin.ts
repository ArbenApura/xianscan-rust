// -- SERVER ORIGIN HELPERS (PURE, NO CHROME APIS) -- //

// -- CONSTANTS -- //

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// -- FUNCTIONS -- //

// ORIGIN OF A URL, OR NULL WHEN IT DOES NOT PARSE OR IS NOT HTTP(S)
export function httpOrigin(raw: string | null | undefined): string | null {
	if (!raw) return null;
	try {
		const u = new URL(raw);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		return u.origin.toLowerCase();
	} catch {
		return null;
	}
}

// localhost AND 127.0.0.1 NAME THE SAME LOCAL SERVER; TREAT THEM AS ONE ORIGIN
export function serverOriginAliases(serverUrl: string): string[] {
	const origin = httpOrigin(serverUrl);
	if (!origin) return [];
	const u = new URL(origin);
	const out = [origin];
	if (u.hostname === 'localhost') out.push(origin.replace('//localhost', '//127.0.0.1'));
	if (u.hostname === '127.0.0.1') out.push(origin.replace('//127.0.0.1', '//localhost'));
	return out;
}

// TRUE WHEN url POINTS AT THE CONFIGURED XIANSCAN SERVER (ANY PATH)
export function isServerUrl(url: string, serverUrl: string): boolean {
	const origin = httpOrigin(url);
	return origin !== null && serverOriginAliases(serverUrl).includes(origin);
}

export function isLoopbackUrl(url: string): boolean {
	try {
		return LOOPBACK_HOSTNAMES.has(new URL(url).hostname.toLowerCase());
	} catch {
		return false;
	}
}

// SWAP ONLY THE HOST (localhost <-> 127.0.0.1); NEVER A SUBSTRING ELSEWHERE IN THE URL
export function swapLoopbackAlias(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
		else if (u.hostname === '127.0.0.1') u.hostname = 'localhost';
		else return null;
		return u.href;
	} catch {
		return null;
	}
}

/**
 * Server images must go through the background proxy when an <img> cannot load them directly:
 * mixed content (https page, http server), or a non-loopback server, which needs the access token
 * that an <img> request cannot carry.
 */
export function shouldProxyServerImage(url: string, pageProtocol?: string): boolean {
	if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
	if (!/^https?:\/\//i.test(url)) return false;
	const protocol = pageProtocol ?? (typeof window !== 'undefined' ? window.location?.protocol : undefined);
	if (protocol === 'https:' && url.startsWith('http://')) return true;
	return !isLoopbackUrl(url);
}

// THE CONTENT SCRIPT MUST NOT RUN ON THE XIANSCAN DASHBOARD ITSELF
export function isOnServerDashboard(pageUrl: string, serverUrl: string): boolean {
	return isServerUrl(pageUrl, serverUrl);
}
