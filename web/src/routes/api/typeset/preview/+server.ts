// EXACT TYPESET PREVIEW (FEAT-006 ADR-009): RUNS THE REAL SKIA TYPESETTER ON ONE SAMPLE BUBBLE, SO THE USER SEES
// WHAT THE PIPELINE WILL DRAW (THE CSS PREVIEW CAN FALL BACK TO ANY OS FONT; SKIA CANNOT).
// IMPORTED DEP-MODULES
import { error, type RequestHandler } from '@sveltejs/kit';
import { createCanvas } from '@napi-rs/canvas';
import { z } from 'zod';
// IMPORTED MODULES
import { getCanonicalSettings } from '$lib/server/settings-service';
import { buildTypesetOptions } from '$lib/server/typeset/options';
import { typesetPage, type TypesetRegion } from '$lib/server/typeset';
import { typesetOptionsSchema } from '$lib/schemas/typeset.schema';
import { scriptOfLanguage } from '$lib/languages';
import { dominantScript } from '$lib/typeset-scripts';

// -- CONSTANTS -- //

const MAX_BODY_BYTES = 16 * 1024;
const WIDTH = 600;
const HEIGHT = 300;
// WITH AN ACCENT SAMPLE (FEAT-010) THE CANVAS GROWS BY A BAND BELOW THE UNCHANGED BUBBLE
const ACCENT_BAND = 120;

const previewSchema = z.object({
	text: z.string().trim().min(1).max(500),
	targetLang: z.string().max(16).optional(),
	options: typesetOptionsSchema.optional(),
	/** A SKILL OR TITLE CALLOUT DRAWN AS ACCENT TEXT BELOW THE BUBBLE (FEAT-010). */
	accentText: z.string().trim().min(1).max(200).optional(),
});

// -- HANDLERS -- //

export const POST: RequestHandler = async ({ request, cookies }) => {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BODY_BYTES) throw error(413, 'Preview request too large.');
	const raw = await request.text();
	if (raw.length > MAX_BODY_BYTES) throw error(413, 'Preview request too large.');

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		throw error(400, 'Body must be JSON.');
	}
	const parsed = previewSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Invalid preview request.');
	const { text, targetLang, options, accentText } = parsed.data;

	const targetScript = scriptOfLanguage(targetLang) ?? dominantScript(text, 'latin');
	const typesetOptions = buildTypesetOptions({
		canonical: getCanonicalSettings(),
		cookies,
		userOpts: options as Record<string, unknown> | undefined,
		targetScript,
	});

	const height = accentText ? HEIGHT + ACCENT_BAND : HEIGHT;
	const canvas = createCanvas(WIDTH, height);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fbfaf7';
	ctx.fillRect(0, 0, WIDTH, height);
	const page = canvas.toBuffer('image/png');

	const regions: TypesetRegion[] = [{ id: 'preview', box: { x: 40, y: 30, w: WIDTH - 80, h: HEIGHT - 60 }, text, kind: 'dialogue_bubble' }];
	if (accentText) {
		regions.push({ id: 'preview-accent', box: { x: 60, y: HEIGHT, w: WIDTH - 120, h: ACCENT_BAND - 20 }, text: accentText, kind: 'free_text', role: 'accent' });
	}
	const image = await typesetPage(page, regions, typesetOptions);
	return new Response(new Uint8Array(image), {
		headers: { 'content-type': 'image/webp', 'cache-control': 'no-store', 'content-length': String(image.byteLength) },
	});
};
