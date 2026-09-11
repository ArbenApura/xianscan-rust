// SPECIFIC CUSTOM FONT VARIANT STREAMING AND DELETION
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { customFonts, customFontFiles } from '$lib/server/db/schema';
import { getUserFontsDir } from '$lib/server/typeset/fonts';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ params }) => {
	const { id: fontId, variantId } = params;
	if (!fontId || !variantId) {
		return new Response('FONT ID AND VARIANT ID REQUIRED', { status: 400 });
	}

	const variant = db
		.select()
		.from(customFontFiles)
		.where(and(eq(customFontFiles.fontId, fontId), eq(customFontFiles.id, variantId)))
		.get();

	if (!variant) {
		return new Response('VARIANT NOT FOUND', { status: 404 });
	}

	const userFontsDir = getUserFontsDir();
	const filePath = join(userFontsDir, variant.fileName);

	if (!existsSync(filePath)) {
		return new Response('VARIANT FILE NOT FOUND ON DISK', { status: 404 });
	}

	const buffer = readFileSync(filePath);
	const mimeType = variant.format === 'opentype' ? 'font/otf' : 'font/ttf';

	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': mimeType,
			'Content-Length': buffer.length.toString(),
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id: fontId, variantId } = params;
	if (!fontId || !variantId) {
		return json({ success: false, error: 'FONT ID AND VARIANT ID REQUIRED' }, { status: 400 });
	}

	const variant = db
		.select()
		.from(customFontFiles)
		.where(and(eq(customFontFiles.fontId, fontId), eq(customFontFiles.id, variantId)))
		.get();

	if (!variant) {
		return json({ success: false, error: 'VARIANT NOT FOUND' }, { status: 404 });
	}

	const userFontsDir = getUserFontsDir();
	const filePath = join(userFontsDir, variant.fileName);
	if (existsSync(filePath)) {
		try {
			unlinkSync(filePath);
		} catch (err) {
			console.error(`[fonts] failed to unlink variant ${filePath}`, err);
		}
	}

	db.delete(customFontFiles).where(eq(customFontFiles.id, variantId)).run();

	// RECOMPUTE REMAINING SUPPORTED WEIGHTS FOR FAMILY
	const font = db.select().from(customFonts).where(eq(customFonts.id, fontId)).get();
	if (font) {
		const remaining = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, fontId)).all();
		const weights: ('normal' | 'bold')[] = [];
		if (remaining.some((r) => r.weightNumeric < 600) || (!font.isVariable && remaining.length === 0)) {
			weights.push('normal');
		}
		if (remaining.some((r) => r.weightNumeric >= 600) || font.isVariable) {
			weights.push('bold');
		}
		if (weights.length === 0) weights.push('normal');

		db.update(customFonts)
			.set({ supportedWeights: JSON.stringify(weights) })
			.where(eq(customFonts.id, fontId))
			.run();
	}

	return json({ success: true });
};
