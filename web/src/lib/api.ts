// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/public';

// -- CONSTANTS -- //

// THE LIVE API ORIGIN FOR A DECOUPLED FRONTEND — BAKED INTO THE BUNDLE AT BUILD TIME. EMPTY →
// SAME-ORIGIN (THE WEB APP: PAGES AND /api SHARE ONE ORIGIN, SO NO PREFIX IS NEEDED AND SSR KEEPS USING
// RELATIVE URLS VIA THE SVELTEKIT LOAD fetch).
const API_BASE = (env.PUBLIC_API_BASE ?? '').replace(/\/+$/, '');

// -- FUNCTIONS -- //

// RESOLVE AN API PATH TO A FETCHABLE URL: ABSOLUTE (PUBLIC_API_BASE + path) WHEN SET, ELSE THE RELATIVE PATH.
export function apiUrl(path: string): string {
	return API_BASE ? `${API_BASE}${path}` : path;
}

// THE ONE CLIENT ENTRY POINT FOR /api CALLS — SAME-ORIGIN fetch ON THE WEB APP. STREAMING RESPONSES (THE
// TRANSLATE SSE) PASS STRAIGHT THROUGH. NO AUTH HEADERS — SINGLE-USER SELF-HOSTED APP.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(apiUrl(path), init);
}

// CONVENIENCE WRAPPER OVER apiFetch FOR JSON ENDPOINTS — PARSES THE BODY, AND ON A NON-OK RESPONSE THROWS AN
// Error CARRYING THE SERVER'S { message } (FALLING BACK TO fallbackMsg).
export async function apiJson<T = unknown>(
	path: string,
	init: RequestInit = {},
	fallbackMsg = 'Something went wrong. Try again.',
): Promise<T> {
	const res = await apiFetch(path, init);
	const data = await res.json().catch(() => ({}) as Record<string, unknown>);
	if (!res.ok) throw new Error((data as { message?: string }).message ?? fallbackMsg);
	return data as T;
}
