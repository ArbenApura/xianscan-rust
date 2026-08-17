import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchAvailableModels } from '$lib/server/providers';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, apiKey, baseUrl } = body;

		const result = await fetchAvailableModels({
			id,
			apiKey,
			baseUrl,
		});

		return json(result);
	} catch (e: any) {
		throw error(500, e?.message || 'Failed to discover models');
	}
};
