// CUSTOM FONT FILE STREAMING AND DELETION API ENDPOINT
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { customFonts, customFontFiles } from '$lib/server/db/schema';
import { getUserFontsDir, resolveUserFontFilePath, LATIN_DIALOGUE_FONTS } from '$lib/server/typeset/fonts';
import { getCanonicalSettings, updateCanonicalSettings } from '$lib/server/settings-service';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ params }) => {
	const fontId = params.id;
	if (!fontId) {
		return new Response('FONT ID REQUIRED', { status: 400 });
	}

	const row = db.select().from(customFonts).where(eq(customFonts.id, fontId)).get();
	if (!row) {
		return new Response('FONT NOT FOUND', { status: 404 });
	}

	const userFontsDir = getUserFontsDir();
	const filePath = resolveUserFontFilePath(row.fileName) || join(userFontsDir, row.fileName);

	if (!existsSync(filePath)) {
		return new Response('FONT FILE NOT FOUND ON DISK', { status: 404 });
	}

	const buffer = readFileSync(filePath);
	const mimeType = row.format === 'opentype' ? 'font/otf' : 'font/ttf';

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
	const fontId = params.id;
	if (!fontId) {
		return json({ success: false, error: 'FONT ID REQUIRED' }, { status: 400 });
	}

	const row = db.select().from(customFonts).where(eq(customFonts.id, fontId)).get();
	if (!row) {
		return json({ success: false, error: 'FONT NOT FOUND' }, { status: 404 });
	}

	const userFontsDir = getUserFontsDir();

	// DELETE VARIANT FILES FROM DISK
	const variants = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, fontId)).all();
	for (const v of variants) {
		const vPath = resolveUserFontFilePath(v.fileName) || join(userFontsDir, v.fileName);
		if (existsSync(vPath)) {
			try {
				unlinkSync(vPath);
			} catch (err) {
				console.error(`[fonts] failed to delete physical variant file ${vPath}`, err);
			}
		}
	}

	// DELETE PRIMARY FILE FROM DISK
	const filePath = resolveUserFontFilePath(row.fileName) || join(userFontsDir, row.fileName);
	if (existsSync(filePath)) {
		try {
			unlinkSync(filePath);
		} catch (err) {
			console.error(`[fonts] failed to delete physical font file ${filePath}`, err);
		}
	}

	// REMOVE FROM IN-MEMORY DIALOGUE FONTS CACHE
	LATIN_DIALOGUE_FONTS.delete(row.name);

	// DELETE FROM DATABASE
	db.delete(customFonts).where(eq(customFonts.id, fontId)).run();

	// FALLBACK CANONICAL SETTINGS IF DELETED FONT WAS ACTIVELY CONFIGURED
	const canonical = getCanonicalSettings();
	let needsSettingsUpdate = false;
	const nextSettings: any = {};

	if (canonical.typesetFont === row.name) {
		nextSettings.typesetFont = 'CC Wild Words';
		needsSettingsUpdate = true;
	}
	if (canonical.typesetCjkFont === row.name) {
		nextSettings.typesetCjkFont = 'WenQuanYi Micro Hei';
		needsSettingsUpdate = true;
	}

	if (needsSettingsUpdate) {
		updateCanonicalSettings(nextSettings);
	}

	return json({ success: true });
};
