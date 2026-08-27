import { error, json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { retypesetPage } from '$lib/server/chapters';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { retypesetPageSchema } from '$lib/schemas';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) {
		throw error(400, 'Invalid page id');
	}

	const [existingPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!existingPage) throw error(404, 'Page not found.');

	const canonical = getCanonicalSettings();
	const body = await request.json().catch(() => ({}));
	const parsed = retypesetPageSchema.safeParse(body);
	const userOpts = parsed.success ? parsed.data?.typesetOptions : undefined;

	const typesetOptions = {
		fontDialogue: userOpts?.fontDialogue || userOpts?.fontFamily || (cookies?.get('mt_ts_font') || canonical.typesetFont || 'CC Wild Words'),
		fontCjk: userOpts?.fontCjk || (cookies?.get('mt_ts_cjk_font') || canonical.typesetCjkFont || 'Microsoft YaHei'),
		boxInset: typeof userOpts?.boxInset === 'number'
			? userOpts.boxInset
			: (cookies?.get('mt_ts_padding') ? Number(cookies.get('mt_ts_padding')) : canonical.typesetPadding ?? 0.05),
		outlineMode: (userOpts?.outlineMode || userOpts?.outline || (cookies?.get('mt_ts_outline') as any) || canonical.typesetOutline || 'standard') as any,
		colorMode: (userOpts?.colorMode || (cookies?.get('mt_ts_contrast') as any) || canonical.typesetContrast || 'auto') as any,
		casing: (userOpts?.casing || (cookies?.get('mt_ts_casing') as any) || canonical.typesetCasing || 'uppercase') as any,
		enableRotation: typeof userOpts?.enableRotation === 'boolean'
			? userOpts.enableRotation
			: (cookies?.get('mt_ts_rot') ? cookies.get('mt_ts_rot') === 'true' : (canonical.enableTextRotation ?? true)),
	};

	try {
		const result = await retypesetPage(pageId, typesetOptions);
		return json({
			success: true,
			outputPath: result.outputPath,
			outputRev: result.outputRev,
		});
	} catch (err: any) {
		throw error(500, err?.message || 'Failed to retypeset page');
	}
};
