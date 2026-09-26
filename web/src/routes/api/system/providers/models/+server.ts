import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchAvailableModels } from '$lib/server/providers';
import { fetchModelsSchema } from '$lib/schemas';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = fetchModelsSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message || 'Invalid model discovery payload');
	}

	try {
		const { id, apiKey, baseUrl } = parsed.data;
		const result = await fetchAvailableModels({ id, apiKey, baseUrl });
		return json(result);
	} catch (e: any) {
		throw error(500, e?.message || 'Failed to discover models');
	}
};
