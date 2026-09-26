import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAccessStatus, setAccessNoticePending, setLanAccessEnabled } from '$lib/server/access/access-settings';
import { syncBus } from '$lib/server/sync-bus';

const patchSchema = z
	.object({
		lanAccessEnabled: z.boolean().optional(),
		dismissNotice: z.boolean().optional(),
	})
	.strict();

// THE TOKEN IS ONLY EVER SHOWN TO A CALLER THAT IS ALREADY TRUSTED (LOCAL, COOKIE OR TOKEN)
function isTrusted(via: string | undefined): boolean {
	return via === 'local' || via === 'cookie' || via === 'token';
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!isTrusted(locals.access?.via)) {
		return json({ message: 'Not allowed', code: 'auth_required' }, { status: 401 });
	}
	return json(getAccessStatus());
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!isTrusted(locals.access?.via)) {
		return json({ message: 'Not allowed', code: 'auth_required' }, { status: 401 });
	}
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ message: 'Invalid access settings payload' }, { status: 400 });
	}
	if (parsed.data.lanAccessEnabled !== undefined) setLanAccessEnabled(parsed.data.lanAccessEnabled);
	if (parsed.data.dismissNotice) setAccessNoticePending(false);
	syncBus.broadcast({ type: 'settings-updated' });
	return json(getAccessStatus());
};
