import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testProviderConnection } from '$lib/server/providers';
import { testProviderSchema } from '$lib/schemas';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = testProviderSchema.safeParse(body);
		if (!parsed.success) {
			throw error(400, 'Invalid provider test payload');
		}

		const { id, apiKey, baseUrl, model } = parsed.data;

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
