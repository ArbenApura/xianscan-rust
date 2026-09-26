import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, isSecureTransport } from '$lib/server/access/handle';
import { regenerateAccessToken, sessionCookieValue } from '$lib/server/access/token';

const ONE_YEAR_S = 31_536_000;

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	const via = locals.access?.via;
	if (via !== 'local' && via !== 'cookie' && via !== 'token') {
		return json({ message: 'Not allowed', code: 'auth_required' }, { status: 401 });
	}
	const token = regenerateAccessToken();
	// KEEP THE BROWSER THAT PRESSED "REGENERATE" UNLOCKED
	cookies.set(SESSION_COOKIE, sessionCookieValue(token), {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: ONE_YEAR_S,
		secure: isSecureTransport(request),
	});
	return json({ token });
};
