// TYPESETTING — RENDER TRANSLATED TEXT ONTO THE CLEANED PAGE WITH @napi-rs/canvas (SKIA).
import { createCanvas, loadImage } from '@napi-rs/canvas';

// SUBMODULE RE-EXPORTS FOR BACKWARD COMPATIBILITY
export * from './typeset/fonts';
export * from './typeset/stat-panel';
export * from './typeset/layout';
export * from './typeset/color';
export * from './typeset/decollision';
export * from './typeset/sanitize';
export * from './typeset/stat-renderer';

import {
	registerFonts,
	fontFor,
	fontSpec,
	drawTextLineWithRuns,
	FONT_DIALOGUE,
	FONT_FALLBACK_NAME,
	CJK_REGEX,
	type TextColor,
} from './typeset/fonts';
import { parseStatPanel, isSfxOrShout, type TypesetRegion } from './typeset/stat-panel';
import { fitFontSize, fitSingleLineSize, reflowText } from './typeset/layout';
import { pickTextColor, sampleBackground } from './typeset/color';
import { decollideRegions } from './typeset/decollision';
import { sanitizeForFont } from './typeset/sanitize';
import { typesetStatPanel } from './typeset/stat-renderer';

// -- CONSTANTS -- //

const BOX_INSET = 0.05;
const MAX_SFX_FONT_SIZE = 100;
const LINE_HEIGHT = 1.2;
const OUTLINE_FACTOR = 0.18;

export interface TypesetOptions {
	fontScale?: number;
	fontDialogue?: string;
	fontCjk?: string;
	boxInset?: number;
	outlineMode?: 'none' | 'thin' | 'standard' | 'heavy';
	colorMode?: 'auto' | 'dark' | 'light';
	casing?: 'uppercase' | 'original' | 'lowercase';
	allCaps?: boolean;
	enableRotation?: boolean;
	format?: 'png' | 'webp';
}

export async function typesetPage(
	cleanedPng: Buffer,
	regions: TypesetRegion[],
	opts: TypesetOptions = {},
): Promise<Buffer> {
	registerFonts();
	const scale = opts.fontScale ?? 1;
	const fontDialogue = opts.fontDialogue || FONT_DIALOGUE;
	const fontCjk = opts.fontCjk || FONT_FALLBACK_NAME;
	const inset = opts.boxInset ?? BOX_INSET;
	const outlineMode = opts.outlineMode ?? 'standard';
	const colorMode = opts.colorMode ?? 'auto';
	const casing = opts.casing ?? (opts.allCaps === false ? 'original' : 'uppercase');
	const enableRotation = opts.enableRotation ?? true;

	const img = await loadImage(cleanedPng);
	const canvas = createCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);

	const decollided = decollideRegions(regions);

	for (const r of decollided) {
		const rawText = sanitizeForFont(r.text.trim());
		if (!rawText) continue;

		let color: TextColor;
		if (colorMode === 'dark') {
			color = { fill: 'black', stroke: 'white' };
		} else if (colorMode === 'light') {
			color = { fill: 'white', stroke: 'black' };
		} else {
			const bg = sampleBackground(ctx, r.box.x, r.box.y, r.box.w, r.box.h);
			color = pickTextColor(bg);
		}

		// STAT-PANEL PATH — structured multi-segment rendering
		const statSegments = parseStatPanel(rawText);
		if (statSegments) {
			typesetStatPanel(ctx, r, statSegments, color);
			continue;
		}

		// STANDARD PATH — unified natural multi-line wrapping with user casing
		const isCjk = CJK_REGEX.test(rawText);
		let text: string;
		if (isCjk) {
			text = rawText;
		} else if (casing === 'lowercase') {
			text = rawText.toLowerCase();
		} else if (casing === 'original') {
			text = rawText;
		} else {
			text = rawText.toUpperCase();
		}
		const { x, y, w, h } = r.box;

		const angleDeg = r.angle ?? 0;
		const hasRotation = enableRotation && Math.abs(angleDeg) >= 2.0 && Math.abs(angleDeg) <= 45.0;

		const font = fontFor(text, fontDialogue, fontCjk);
		const isSfx = isSfxOrShout(text);

		const maxW = Math.max(10, w * (1 - 2 * inset));
		const maxH = Math.max(10, h * (1 - 2 * inset));

		const sizeCap = Math.max(MAX_SFX_FONT_SIZE, Math.max(w, h)) * scale;
		let size: number;
		if (isSfx) {
			size = fitSingleLineSize(ctx, text, font, maxW, maxH, sizeCap);
		} else {
			size = fitFontSize(ctx, text, font, w, h, sizeCap, sizeCap, inset);
		}

		ctx.font = fontSpec(size, font, text, fontCjk);
		const lines = isSfx ? [text] : reflowText(ctx, text, maxW);
		const lineH = size * LINE_HEIGHT;
		const totalH = lines.length * lineH;

		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';

		const isBlackOnLight = color.fill === 'black' || color.fill === '#111111';
		const isDarkStroke = color.stroke === 'black' || color.stroke === '#000000' || color.stroke === '#111111';

		let strokeWidth: number;
		if (outlineMode === 'none') {
			strokeWidth = 0;
		} else if (outlineMode === 'thin') {
			strokeWidth = isBlackOnLight ? Math.max(1.0, size * 0.06) : Math.max(1.5, size * 0.10);
		} else if (outlineMode === 'heavy') {
			strokeWidth = isBlackOnLight ? Math.max(3.0, size * 0.16) : Math.max(5.0, size * 0.26);
		} else {
			strokeWidth = isBlackOnLight
				? Math.max(1.8, size * 0.10)
				: Math.max(3.0, size * OUTLINE_FACTOR);
		}

		ctx.lineWidth = strokeWidth;
		ctx.lineJoin = 'round';
		ctx.strokeStyle = color.stroke;
		ctx.fillStyle = color.fill;

		if (hasRotation) {
			const cx = x + w / 2;
			const cy = y + h / 2;
			ctx.translate(cx, cy);
			ctx.rotate((angleDeg * Math.PI) / 180);
			let ty = -totalH / 2 + size * 0.85;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					0,
					ty,
					size,
					font,
					FONT_FALLBACK_NAME,
					color,
					strokeWidth,
					isDarkStroke,
					fontCjk,
					'center',
				);
				ty += lineH;
			}
		} else {
			const tx = x + w / 2;
			let ty = y + (h - totalH) / 2 + size * 0.85;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					tx,
					ty,
					size,
					font,
					FONT_FALLBACK_NAME,
					color,
					strokeWidth,
					isDarkStroke,
					fontCjk,
					'center',
				);
				ty += lineH;
			}
		}
		ctx.restore();
	}
	if (opts.format === 'webp') {
		return await canvas.encode('webp', 90);
	}
	return canvas.toBuffer('image/png');
}
