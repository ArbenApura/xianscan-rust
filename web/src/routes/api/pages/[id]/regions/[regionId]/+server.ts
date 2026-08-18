import { error, json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages, regions } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { retypesetPage } from '$lib/server/chapters';
import { updateRegionSchema } from '$lib/schemas';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const pageId = Number(params.id);
	const regionId = Number(params.regionId);
	if (!Number.isInteger(pageId) || !Number.isInteger(regionId)) {
		throw error(400, 'Invalid pageId or regionId');
	}

	const [existingPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!existingPage) throw error(404, 'Page not found.');

	const [existingRegion] = db.select().from(regions).where(and(eq(regions.id, regionId), eq(regions.pageId, pageId))).all();
	if (!existingRegion) throw error(404, 'Region not found on this page.');

	const body = await request.json().catch(() => ({}));
	const parsed = updateRegionSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid request body');
	}

	let targetToSave: string | null = null;
	let origTarget = existingRegion.originalTarget ?? existingRegion.textTarget;
	if (parsed.data.action === 'reset_ai') {
		targetToSave = origTarget;
	} else {
		targetToSave = (parsed.data.textTarget ?? '').trim() || null;
	}

	db.update(regions)
		.set({
			textTarget: targetToSave,
			originalTarget: origTarget,
			status: targetToSave ? 'translated' : 'pending',
		})
		.where(eq(regions.id, regionId))
		.run();

	// Retypeset the page canvas
	let newOutputPath = existingPage.outputPath;
	try {
		const res = await retypesetPage(pageId, parsed.data.typesetOptions as any);
		newOutputPath = res.outputPath;
	} catch (e: any) {
		console.error('Failed to retypeset page after region edit:', e);
	}

	const [updatedRegion] = db.select().from(regions).where(eq(regions.id, regionId)).all();

	return json({
		success: true,
		region: updatedRegion,
		outputPath: newOutputPath,
	});
};
