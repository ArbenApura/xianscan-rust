import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testProviderConnection } from '$lib/server/providers';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, apiKey, baseUrl, model } = body;

		const result = await testProviderConnection({
			id,
			apiKey,
			baseUrl,
			model,
		});

		return json(result);
	} catch (e: any) {
		throw error(500, e?.message || 'Failed to test provider connection');
	}
};
