import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviders, updateProvider } from '$lib/server/providers';

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
		const body = await request.json();
		const { id, apiKey, clearApiKey, baseUrl, activeModel, availableModels, enabled, isDefault } = body;

		if (!id || typeof id !== 'string') {
			throw error(400, 'Provider ID is required');
		}

		const updated = updateProvider(id, {
			apiKey,
			clearApiKey,
			baseUrl,
			activeModel,
			availableModels,
			enabled,
			isDefault,
		});

		return json({ provider: updated });
	} catch (e: any) {
		if (e?.status) throw e;
		throw error(500, e?.message || 'Failed to update AI provider');
	}
};
