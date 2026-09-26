import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/server/access/handle';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(null, { status: 204 });
};
