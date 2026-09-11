// SYSTEM STORAGE BREAKDOWN & MAINTENANCE ENDPOINT
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';

// IMPORTED MODULES
import {
	getSystemStorageStats,
	purgeOrphanedStorage,
	clearSystemCaches,
	clearAllSystemData,
} from '$lib/server/storage-service';
import type { RequestHandler } from './$types';

// -- HANDLERS -- //

export const GET: RequestHandler = async () => {
	const stats = getSystemStorageStats();
	return json(stats);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const action = body.action;

	if (action === 'purge-orphaned') {
		const result = purgeOrphanedStorage();
		const stats = getSystemStorageStats();
		return json({ ok: true, result, stats });
	}

	if (action === 'clear-cache') {
		const result = clearSystemCaches();
		const stats = getSystemStorageStats();
		return json({ ok: true, result, stats });
	}

	if (action === 'clear-all') {
		const result = await clearAllSystemData();
		const stats = getSystemStorageStats();
		return json({ ok: true, result, stats });
	}

	throw error(400, 'Unknown storage action');
};
