import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { evaluateAccess } from '$lib/server/access/handle';
import { getEffectiveBind } from '$lib/server/access/bind';

// PUBLIC ROUTE: REPORTS WHETHER THIS CALLER WOULD BE LET INTO A PROTECTED ROUTE, WITHOUT ANY DATA.
export const GET: RequestHandler = async (event) => {
	// EVALUATE AS IF FOR A PROTECTED PATH (THIS PATH ITSELF IS PUBLIC)
	const decision = evaluateAccess(event, '/api/auth/probe');
	return json({
		authenticated: decision.allow,
		via: decision.allow ? decision.via : null,
		lanAccess: getEffectiveBind() === 'lan',
	});
};
