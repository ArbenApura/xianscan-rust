import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { retypesetPage } from '$lib/server/chapters';

const schema = z.object({
	typesetOptions: z.record(z.unknown()).optional(),
}).optional();

export const POST: RequestHandler = async ({ params, request }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) {
		throw error(400, 'Invalid page id');
	}

	const [existingPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!existingPage) throw error(404, 'Page not found.');

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	const opts = parsed.success ? parsed.data?.typesetOptions : undefined;

	try {
		const result = await retypesetPage(pageId, opts as any);
		return json({
			success: true,
			outputPath: result.outputPath,
		});
	} catch (err: any) {
		throw error(500, err?.message || 'Failed to retypeset page');
	}
};
