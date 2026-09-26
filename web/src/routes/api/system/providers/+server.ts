import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviders, updateProvider, ProviderUpdateError } from '$lib/server/providers';
import { updateProviderSchema } from '$lib/schemas';
import { syncBus } from '$lib/server/sync-bus';

export const GET: RequestHandler = async () => {
	try {
		const providers = getProviders();
		return json({ providers });
	} catch (e: any) {
		throw error(500, e?.message || 'Failed to fetch AI providers');
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = updateProviderSchema.safeParse(body);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message || 'Provider ID is required');
		}

		const { id, apiKey, clearApiKey, baseUrl, activeModel, availableModels, enabled, isDefault } = parsed.data;

		const updated = updateProvider(id, {
			apiKey,
			clearApiKey,
			baseUrl,
			activeModel,
			availableModels,
			enabled,
			isDefault,
		});

		// NOTIFY CONNECTED CLIENTS IN REAL-TIME OF PROVIDER / SETTINGS CHANGES
		syncBus.broadcast({ type: 'settings-updated' });

		return json({ provider: updated });
	} catch (e: any) {
		if (e instanceof ProviderUpdateError) {
			return json({ message: e.message, code: e.code }, { status: e.code === 'invalid_base_url' ? 400 : 409 });
		}
		if (e?.status) throw e;
		throw error(500, e?.message || 'Failed to update AI provider');
	}
};
