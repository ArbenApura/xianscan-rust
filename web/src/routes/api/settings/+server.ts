import { json, type RequestHandler } from '@sveltejs/kit';
import {
	getCanonicalSettings,
	updateCanonicalSettings,
	seedInitialSettingsIfEmpty,
} from '$lib/server/settings-service';
import type { AppSettings } from '$lib/stores/settings';

// GET /api/settings - Fetch canonical server settings
export const GET: RequestHandler = async () => {
	try {
		const settings = getCanonicalSettings();
		return json(settings);
	} catch (err) {
		console.error('[api/settings] GET failed:', err);
		return json({ error: 'Failed to fetch settings' }, { status: 500 });
	}
};

// PATCH /api/settings - Partial update of canonical server settings
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Partial<AppSettings>;
		if (!body || typeof body !== 'object') {
			return json({ error: 'Invalid settings payload' }, { status: 400 });
		}

		const updated = updateCanonicalSettings(body);
		return json(updated);
	} catch (err) {
		console.error('[api/settings] PATCH failed:', err);
		return json({ error: 'Failed to update settings' }, { status: 500 });
	}
};

// POST /api/settings - Seed settings if empty (first-boot migration)
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { seed?: Partial<AppSettings> };
		if (body?.seed && typeof body.seed === 'object') {
			seedInitialSettingsIfEmpty(body.seed);
		}
		const settings = getCanonicalSettings();
		return json(settings);
	} catch (err) {
		console.error('[api/settings] POST seed failed:', err);
		return json({ error: 'Failed to seed settings' }, { status: 500 });
	}
};
