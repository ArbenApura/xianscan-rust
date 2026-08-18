import { error, json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { retypesetPage } from '$lib/server/chapters';
import { retypesetPageSchema } from '$lib/schemas';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) {
		throw error(400, 'Invalid page id');
	}

	const [existingPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!existingPage) throw error(404, 'Page not found.');

	const body = await request.json().catch(() => ({}));
	const parsed = retypesetPageSchema.safeParse(body);
	const userOpts = parsed.success ? parsed.data?.typesetOptions : undefined;

	const typesetOptions = {
		fontDialogue: userOpts?.fontFamily || cookies.get('mt_ts_font'),
		fontCjk: cookies.get('mt_ts_cjk_font'),
		boxInset: cookies.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : undefined,
		fontScale: cookies.get('mt_ts_scale') ? Number(cookies.get('mt_ts_scale')) : undefined,
		outlineMode: (userOpts?.outline || cookies.get('mt_ts_outline')) as any,
		colorMode: cookies.get('mt_ts_contrast') as any,
		casing: (userOpts?.casing || cookies.get('mt_ts_casing')) as any,
		enableRotation: cookies.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : undefined,
		...(userOpts || {}),
	};

	try {
		const result = await retypesetPage(pageId, typesetOptions);
		return json({
			success: true,
			outputPath: result.outputPath,
		});
	} catch (err: any) {
		throw error(500, err?.message || 'Failed to retypeset page');
	}
};
