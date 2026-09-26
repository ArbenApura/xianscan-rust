// SYSTEM FONTS AVAILABILITY AND USER FONT UPLOAD API ENDPOINT
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
import { getFontAvailability, getUserFontsDir, LATIN_DIALOGUE_FONTS, registerCustomFonts, invalidateCustomFontsCache } from '$lib/server/typeset/fonts';
import { parseFontBuffer, groupFontFilesByFamily, detectLegacyEncoding } from '$lib/server/typeset/font-parser';
import { SCRIPT_FONT_SLOTS, type ScriptFontSlot } from '$lib/typeset-scripts';
import type { Script } from '$lib/languages';

// -- CONSTANTS -- //

const MAX_FONT_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const RESERVED_BUNDLED_FONTS = new Set([
	'cc wild words',
	'friendly sans',
	'general sans',
	'general sans bold',
	'poppins',
	'poppins bold',
	'montserrat',
	'montserrat bold',
	'lexend',
	'lexend bold',
	'wenquanyi micro hei',
	'wenquanyi micro hei bold',
	'noto sans devanagari',
	'noto sans thai',
	'tajawal',
]);

// -- HANDLERS -- //

export const GET: RequestHandler = async () => {
	try {
		const fonts = getFontAvailability(db);
		const customList = db.select().from(customFonts).all();
		const allVariants = db.select().from(customFontFiles).all();
		const variantsByFontId = new Map<string, typeof allVariants>();
		for (const v of allVariants) {
			const list = variantsByFontId.get(v.fontId) || [];
			list.push(v);
			variantsByFontId.set(v.fontId, list);
		}
		const enrichedCustomList = customList.map((f) => ({
			...f,
			variants: variantsByFontId.get(f.id) || [],
		}));
		return json({ success: true, fonts, customFonts: enrichedCustomList });
	} catch (e: any) {
		return json({ success: false, error: e?.message || 'FAILED TO DETECT FONTS' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();

		// ACCEPT BOTH SINGLE ('file') AND MULTIPLE ('files') UPLOAD INPUTS
		const rawFiles = formData.getAll('files').filter((f): f is File => f instanceof File);
		const singleFile = formData.get('file');
		if (singleFile instanceof File && !rawFiles.includes(singleFile)) {
			rawFiles.unshift(singleFile);
		}

		if (rawFiles.length === 0) {
			return json({ success: false, error: 'NO FONT FILE PROVIDED' }, { status: 400 });
		}

		for (const f of rawFiles) {
			if (f.size > MAX_FONT_FILE_SIZE) {
				return json({ success: false, error: `FONT FILE "${f.name}" EXCEEDS 20 MB SIZE LIMIT` }, { status: 400 });
			}
			const lowerName = (f.name || '').toLowerCase();
			if (!lowerName.endsWith('.ttf') && !lowerName.endsWith('.otf')) {
				return json({ success: false, error: `FILE "${f.name}" IS NOT A SUPPORTED .TTF OR .OTF FONT` }, { status: 400 });
			}
		}

		const parsedFiles: Array<{ fileName: string; buffer: Buffer }> = [];
		for (const f of rawFiles) {
			const arrayBuffer = await f.arrayBuffer();
			parsedFiles.push({ fileName: f.name || 'font.ttf', buffer: Buffer.from(arrayBuffer) });
		}

		let groups;
		try {
			groups = groupFontFilesByFamily(parsedFiles);
		} catch (err: any) {
			return json({ success: false, error: `INVALID FONT FILE: ${err?.message || 'UNKNOWN FORMAT'}` }, { status: 400 });
		}

		if (groups.size === 0) {
			return json({ success: false, error: 'COULD NOT DETECT VALID FONT FAMILIES' }, { status: 400 });
		}

		const rawLabel = (formData.get('name')?.toString() || '').trim();
		const sanitizedCustom = rawLabel.replace(/["'\\;\x00-\x1f\x7f]/g, '').trim().slice(0, 64);
		const scriptTypeRaw = (formData.get('scriptType')?.toString() || 'dialogue').toLowerCase();
		const requestedScriptType: 'dialogue' | 'cjk' = scriptTypeRaw === 'cjk' ? 'cjk' : 'dialogue';
		// THE SCRIPT SLOT THE USER UPLOADED FROM, IF ANY (FOR THE "DOES NOT COVER" WARNING)
		const slotRaw = formData.get('slot')?.toString() as ScriptFontSlot | undefined;
		const uploadSlot = slotRaw && SCRIPT_FONT_SLOTS.includes(slotRaw) ? slotRaw : undefined;
		const warnings: string[] = [];
		let resultScripts: Script[] = [];

		const userFontsDir = getUserFontsDir();
		let primaryResultFont: any = null;

		for (const [, group] of groups) {
			const fontName = (groups.size === 1 && sanitizedCustom) ? sanitizedCustom : group.familyName;
			// COVERAGE FROM THE FILES' cmap DECIDES THE CATEGORY; THE FORM FIELD ONLY WHEN NOTHING COULD BE READ
			const groupScripts = [...new Set(group.variants.flatMap((v) => v.meta.scripts ?? []))] as Script[];
			const scriptType: 'dialogue' | 'cjk' =
				groupScripts.length === 0 ? requestedScriptType : groupScripts.includes('latin') ? 'dialogue' : 'cjk';
			for (const v of group.variants) {
				const warning = detectLegacyEncoding({ ...v.meta, fileName: v.fileName }, v.meta.scripts ?? []);
				if (warning && !warnings.includes(warning)) warnings.push(warning);
			}
			if (uploadSlot && groupScripts.length > 0 && !groupScripts.includes(uploadSlot)) {
				warnings.push(`"${fontName}" has no ${uploadSlot} characters, so it cannot render text in that script.`);
			} else if (!uploadSlot && requestedScriptType === 'cjk' && groupScripts.length > 0 && groupScripts.every((sc) => sc === 'latin')) {
				warnings.push(`"${fontName}" only covers Latin letters; it will not help with non-Latin text.`);
			} else if (!uploadSlot && requestedScriptType === 'dialogue' && groupScripts.length > 0 && !groupScripts.includes('latin')) {
				// STORED AS A SCRIPT FONT: THE DIALOGUE FONT MUST DRAW LATIN TEXT, SO THE CLIENT DOES NOT SELECT IT THERE
				warnings.push(`"${fontName}" has no Latin letters, so it cannot be the Latin dialogue font. Pick it for its script in the Fonts table instead.`);
			}

			// DISALLOW NAMES THAT COLLIDE WITH BUNDLED SYSTEM FONTS
			if (RESERVED_BUNDLED_FONTS.has(fontName.toLowerCase())) {
				return json({ success: false, error: `FONT NAME "${fontName}" COLLIDES WITH A RESERVED SYSTEM PRESET` }, { status: 400 });
			}

			const existingFont = db.select().from(customFonts).where(eq(customFonts.name, fontName)).get();

			if (existingFont) {
				// IF USER UPLOADED SINGLE FILE WITH NO NEW WEIGHTS AND SAME NAME, DISALLOW REDUNDANT DUPLICATE
				const existingVariants = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, existingFont.id)).all();
				const hasNewVariant = group.variants.some((v) => !existingVariants.some((ev) => ev.weightNumeric === v.meta.weightNumeric && ev.style === v.meta.style));

				if (!hasNewVariant && rawFiles.length === 1) {
					return json({ success: false, error: `A CUSTOM FONT NAMED "${fontName}" ALREADY EXISTS` }, { status: 400 });
				}

				// ATTACH NEW VARIANTS TO EXISTING FAMILY
				let currentWeights: ('normal' | 'bold')[] = ['normal'];
				try {
					currentWeights = JSON.parse(existingFont.supportedWeights);
				} catch {}

				for (const variant of group.variants) {
					const variantId = randomUUID();
					const ext = variant.meta.format === 'opentype' ? 'otf' : 'ttf';
					const fileName = `${variantId}.${ext}`;
					const filePath = join(userFontsDir, fileName);

					writeFileSync(filePath, variant.buffer);
					GlobalFonts.registerFromPath(filePath, fontName);

					db.insert(customFontFiles).values({
						id: variantId,
						fontId: existingFont.id,
						fileName,
						format: variant.meta.format,
						weight: variant.meta.weightLabel,
						weightNumeric: variant.meta.weightNumeric,
						style: variant.meta.style,
						fileSize: variant.buffer.length,
						createdAt: Date.now(),
					}).run();

					for (const w of variant.meta.supportedWeights) {
						if (!currentWeights.includes(w)) {
							currentWeights.push(w);
						}
					}
				}

				let existingScripts: Script[] = [];
				try {
					existingScripts = JSON.parse((existingFont as { scripts?: string }).scripts || '[]');
				} catch {}
				const mergedScripts = [...new Set([...existingScripts, ...groupScripts])] as Script[];
				resultScripts = mergedScripts;

				db.update(customFonts)
					.set({
						supportedWeights: JSON.stringify(currentWeights),
						isVariable: existingFont.isVariable || group.isVariable,
						scripts: JSON.stringify(mergedScripts),
					})
					.where(eq(customFonts.id, existingFont.id))
					.run();

				if (mergedScripts.length > 0 ? mergedScripts.includes('latin') : existingFont.scriptType === 'dialogue') {
					LATIN_DIALOGUE_FONTS.add(fontName);
				}

				primaryResultFont = {
					id: existingFont.id,
					name: fontName,
					fileName: existingFont.fileName,
					format: existingFont.format,
					scriptType: existingFont.scriptType,
					fileSize: existingFont.fileSize,
					supportedWeights: currentWeights,
					isVariable: existingFont.isVariable || group.isVariable,
					scripts: mergedScripts,
				};
			} else {
				// CREATE NEW FONT FAMILY RECORD
				const familyId = randomUUID();
				const primaryVariant = group.variants[0];
				const primaryExt = primaryVariant.meta.format === 'opentype' ? 'otf' : 'ttf';
				const primaryFileName = `${familyId}.${primaryExt}`;
				const primaryPath = join(userFontsDir, primaryFileName);

				writeFileSync(primaryPath, primaryVariant.buffer);
				GlobalFonts.registerFromPath(primaryPath, fontName);

				let totalSize = 0;
				for (const variant of group.variants) {
					totalSize += variant.buffer.length;
				}

				if (scriptType === 'dialogue') {
					LATIN_DIALOGUE_FONTS.add(fontName);
				}
				resultScripts = groupScripts;

				// INSERT PARENT CUSTOM FONT FAMILY FIRST
				db.insert(customFonts).values({
					id: familyId,
					name: fontName,
					fileName: primaryFileName,
					format: primaryVariant.meta.format,
					scriptType,
					fileSize: totalSize,
					supportedWeights: JSON.stringify(group.supportedWeights),
					isVariable: group.isVariable,
					scripts: JSON.stringify(groupScripts),
					createdAt: Date.now(),
				}).run();

				// INSERT ALL VARIANTS INTO CHILD TABLE
				for (const variant of group.variants) {
					const variantId = randomUUID();
					const ext = variant.meta.format === 'opentype' ? 'otf' : 'ttf';
					const fileName = `${variantId}.${ext}`;
					const filePath = join(userFontsDir, fileName);

					writeFileSync(filePath, variant.buffer);
					GlobalFonts.registerFromPath(filePath, fontName);

					db.insert(customFontFiles).values({
						id: variantId,
						fontId: familyId,
						fileName,
						format: variant.meta.format,
						weight: variant.meta.weightLabel,
						weightNumeric: variant.meta.weightNumeric,
						style: variant.meta.style,
						fileSize: variant.buffer.length,
						createdAt: Date.now(),
					}).run();
				}

				primaryResultFont = {
					id: familyId,
					name: fontName,
					fileName: primaryFileName,
					format: primaryVariant.meta.format,
					scriptType,
					fileSize: totalSize,
					supportedWeights: group.supportedWeights,
					isVariable: group.isVariable,
					scripts: groupScripts,
				};
			}
		}

		// RE-REGISTER CUSTOM FONTS TO ENSURE ALL RUNTIMES SEE FRESH METRICS IMMEDIATELY
		invalidateCustomFontsCache();
		registerCustomFonts(db);

		return json({
			success: true,
			font: primaryResultFont,
			scripts: resultScripts,
			warnings,
		});
	} catch (e: any) {
		return json({ success: false, error: e?.message || 'FAILED TO UPLOAD FONT' }, { status: 500 });
	}
};
