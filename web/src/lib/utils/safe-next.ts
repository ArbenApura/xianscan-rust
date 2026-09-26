// OPEN-REDIRECT GUARD FOR /unlock?next=...: ONLY SAME-SITE ABSOLUTE PATHS ARE FOLLOWED.

export const DEFAULT_NEXT = '/';
const BASE = 'http://xianscan.invalid';

export function safeNext(raw: string | null | undefined): string {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return DEFAULT_NEXT;
	// MUST BE A PATH ON THIS SITE: STARTS WITH ONE SLASH, NOT "//" OR "/\" (PROTOCOL-RELATIVE)
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
	// NO CONTROL CHARACTERS OR BACKSLASHES (BROWSERS NORMALISE "\" TO "/")
	if (/[\u0000-\u001f\u007f\\]/.test(raw)) return DEFAULT_NEXT;
	try {
		const url = new URL(raw, BASE);
		if (url.origin !== BASE) return DEFAULT_NEXT;
		// NEVER BOUNCE BACK INTO THE UNLOCK PAGE ITSELF
		if (url.pathname.replace(/\/+$/, '') === '/unlock') return DEFAULT_NEXT;
		const result = url.pathname + url.search + url.hash;
		// DOT SEGMENTS ("/.//x", "/%2e//x", "/a/..//x") ONLY COLLAPSE AFTER PARSING, SO RE-CHECK THE
		// NORMALISED RESULT: "//evil.com" WOULD BE PROTOCOL-RELATIVE WHEN THE BROWSER FOLLOWS IT
		if (result.startsWith('//') || result.startsWith('/\\')) return DEFAULT_NEXT;
		if (new URL(result, BASE).origin !== BASE) return DEFAULT_NEXT;
		return result;
	} catch {
		return DEFAULT_NEXT;
	}
}
