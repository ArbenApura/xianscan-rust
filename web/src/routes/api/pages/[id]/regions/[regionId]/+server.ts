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

	const origTarget = existingRegion.originalTarget ?? existingRegion.textTarget;
	const update: Partial<typeof regions.$inferInsert> = {};
	// TEXT IS WRITTEN ONLY WHEN SENT (OR ON A RESET): A ROLE-ONLY REQUEST KEEPS THE TRANSLATION (FEAT-010 REVIEW M-L3)
	if (parsed.data.action === 'reset_ai' || parsed.data.textTarget !== undefined) {
		const targetToSave = parsed.data.action === 'reset_ai' ? origTarget : (parsed.data.textTarget ?? '').trim() || null;
		update.textTarget = targetToSave;
		update.originalTarget = origTarget;
		update.status = targetToSave ? 'translated' : 'pending';
	}
	// ONLY A CHANGED ROLE BECOMES A USER CHOICE; RE-SENDING THE STORED ROLE KEEPS ITS SOURCE (REVIEW H2)
	if (parsed.data.role && parsed.data.role !== existingRegion.role) {
		update.role = parsed.data.role;
		update.roleSource = 'user';
	}

	if (Object.keys(update).length > 0) {
		db.update(regions).set(update).where(eq(regions.id, regionId)).run();
	}

	// Retypeset the page canvas
	let newOutputPath = existingPage.outputPath;
	let newOutputRev = existingPage.outputRev;
	try {
		const res = await retypesetPage(pageId, parsed.data.typesetOptions as any);
		newOutputPath = res.outputPath;
		if (typeof res.outputRev === 'number') newOutputRev = res.outputRev;
	} catch (e: any) {
		console.error('Failed to retypeset page after region edit:', e);
	}

	const [updatedRegion] = db.select().from(regions).where(eq(regions.id, regionId)).all();

	return json({
		success: true,
		region: updatedRegion,
		outputPath: newOutputPath,
		outputRev: newOutputRev,
	});
};
