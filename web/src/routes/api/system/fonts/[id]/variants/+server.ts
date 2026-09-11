// CUSTOM FONT FAMILY VARIANTS QUERY AND UPLOAD ENDPOINT
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GlobalFonts } from '@napi-rs/canvas';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { customFonts, customFontFiles } from '$lib/server/db/schema';
import { getUserFontsDir } from '$lib/server/typeset/fonts';
import { parseFontBuffer } from '$lib/server/typeset/font-parser';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ params }) => {
	const fontId = params.id;
	if (!fontId) {
		return json({ success: false, error: 'FONT ID REQUIRED' }, { status: 400 });
	}

	const font = db.select().from(customFonts).where(eq(customFonts.id, fontId)).get();
	if (!font) {
		return json({ success: false, error: 'FONT NOT FOUND' }, { status: 404 });
	}

	const variants = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, fontId)).all();
	return json({ success: true, variants, isVariable: !!font.isVariable });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const fontId = params.id;
	if (!fontId) {
		return json({ success: false, error: 'FONT ID REQUIRED' }, { status: 400 });
	}

	const font = db.select().from(customFonts).where(eq(customFonts.id, fontId)).get();
	if (!font) {
		return json({ success: false, error: 'FONT NOT FOUND' }, { status: 404 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!file || !(file instanceof File)) {
			return json({ success: false, error: 'NO FONT FILE PROVIDED' }, { status: 400 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const parsedMeta = parseFontBuffer(buffer);

		const variantId = randomUUID();
		const ext = parsedMeta.format === 'opentype' ? 'otf' : 'ttf';
		const fileName = `${variantId}.${ext}`;
		const userFontsDir = getUserFontsDir();
		const filePath = join(userFontsDir, fileName);

		writeFileSync(filePath, buffer);

		// REGISTER IN SKIA UNDER FAMILY NAME
		GlobalFonts.registerFromPath(filePath, font.name);

		db.insert(customFontFiles).values({
			id: variantId,
			fontId,
			fileName,
			format: parsedMeta.format,
			weight: parsedMeta.weightLabel,
			weightNumeric: parsedMeta.weightNumeric,
			style: parsedMeta.style,
			fileSize: buffer.length,
			createdAt: Date.now(),
		}).run();

		// UPDATE FAMILY SUPPORTED WEIGHTS
		let supportedWeights: ('normal' | 'bold')[] = ['normal'];
		try {
			supportedWeights = JSON.parse(font.supportedWeights);
		} catch {}

		for (const w of parsedMeta.supportedWeights) {
			if (!supportedWeights.includes(w)) {
				supportedWeights.push(w);
			}
		}

		db.update(customFonts)
			.set({
				supportedWeights: JSON.stringify(supportedWeights),
				isVariable: font.isVariable || parsedMeta.isVariable,
			})
			.where(eq(customFonts.id, fontId))
			.run();

		return json({
			success: true,
			variant: {
				id: variantId,
				fontId,
				fileName,
				format: parsedMeta.format,
				weight: parsedMeta.weightLabel,
				weightNumeric: parsedMeta.weightNumeric,
				style: parsedMeta.style,
				fileSize: buffer.length,
			},
		});
	} catch (e: any) {
		return json({ success: false, error: e?.message || 'FAILED TO ADD VARIANT' }, { status: 500 });
	}
};
