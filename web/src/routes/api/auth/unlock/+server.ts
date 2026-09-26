import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, isSecureTransport } from '$lib/server/access/handle';
import { sessionCookieValue, verifyToken } from '$lib/server/access/token';
import { clearUnlockFailures, isUnlockBlocked, recordUnlockFailure } from '$lib/server/access/unlock-limiter';

const ONE_YEAR_S = 31_536_000;

const unlockSchema = z.object({ token: z.string().min(1).max(200) });

function clientAddress(getClientAddress: () => string): string {
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const addr = clientAddress(getClientAddress);
	if (isUnlockBlocked(addr)) {
		return json({ message: 'Too many attempts. Wait a minute and try again.', code: 'rate_limited' }, { status: 429 });
	}

	const body = await request.json().catch(() => null);
	const parsed = unlockSchema.safeParse(body);
	if (!parsed.success || !verifyToken(parsed.data.token)) {
		recordUnlockFailure(addr);
		return json({ message: 'That access token is not correct.', code: 'invalid_token' }, { status: 401 });
	}

	clearUnlockFailures(addr);
	cookies.set(SESSION_COOKIE, sessionCookieValue(), {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: ONE_YEAR_S,
		secure: isSecureTransport(request),
	});
	return new Response(null, { status: 204 });
};
