import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { listAvailablePacks } from '$lib/server/glossary-packs';
import { invalidateAll } from '$lib/server/glossary-match';

const SETTING_KEY = 'enabled_glossary_packs';

export const GET: RequestHandler = async () => {
	const [row] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, SETTING_KEY))
		.limit(1);

	let enabledIds: string[] | null = null;
	if (row?.value) {
		try {
			enabledIds = JSON.parse(row.value);
		} catch {
			enabledIds = null;
		}
	}

	const packs = listAvailablePacks().map((p) => ({
		...p,
		enabled: enabledIds ? enabledIds.includes(p.id) : p.enabledByDefault ?? true,
	}));

	return json({ packs });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { packId, enabled, enabledPackIds } = body as {
		packId?: string;
		enabled?: boolean;
		enabledPackIds?: string[];
	};

	let nextEnabledIds: string[];

	if (Array.isArray(enabledPackIds)) {
		nextEnabledIds = [...new Set(enabledPackIds)];
	} else if (packId && typeof enabled === 'boolean') {
		const [row] = await db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, SETTING_KEY))
			.limit(1);

		let currentIds: string[];
		if (row?.value) {
			try {
				currentIds = JSON.parse(row.value);
			} catch {
				currentIds = listAvailablePacks()
					.filter((p) => p.enabledByDefault)
					.map((p) => p.id);
			}
		} else {
			currentIds = listAvailablePacks()
				.filter((p) => p.enabledByDefault)
				.map((p) => p.id);
		}

		if (enabled) {
			nextEnabledIds = [...new Set([...currentIds, packId])];
		} else {
			nextEnabledIds = currentIds.filter((id) => id !== packId);
		}
	} else {
		return json({ error: 'Invalid payload: provide packId & enabled, or enabledPackIds array' }, { status: 400 });
	}

	const now = Date.now();
	await db
		.insert(appSettings)
		.values({
			key: SETTING_KEY,
			value: JSON.stringify(nextEnabledIds),
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [appSettings.key],
			set: {
				value: JSON.stringify(nextEnabledIds),
				updatedAt: now,
			},
		});

	// PACK CHANGE INVALIDATES CACHED AUTOMATA FOR ALL BOOKS
	invalidateAll();

	return json({ success: true, enabledPackIds: nextEnabledIds });
};
