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
	FONT_DEFAULT_CJK,
	CJK_REGEX,
	type TextColor,
} from './typeset/fonts';
import { parseStatPanel, isSfxOrShout, type TypesetRegion } from './typeset/stat-panel';
import { fitFontSize, fitSingleLineSize, reflowText, isStructuredList, tryVerticalSingleWordLayout } from './typeset/layout';
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
	fontDialogue?: string;
	fontCjk?: string;
	boxInset?: number;
	outlineMode?: 'none' | 'thin' | 'standard' | 'heavy';
	colorMode?: 'auto' | 'dark' | 'light';
	casing?: 'uppercase' | 'original' | 'lowercase';
	allCaps?: boolean;
	enableRotation?: boolean;
}

export async function typesetPage(
	cleanedPng: Buffer,
	regions: TypesetRegion[],
	opts: TypesetOptions = {},
): Promise<Buffer> {
	registerFonts();
	const fontDialogue = opts.fontDialogue || FONT_DIALOGUE;
	const fontCjk = opts.fontCjk || FONT_DEFAULT_CJK;
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

	// PASS 1: PRE-PARSE REGIONS AND COMPUTE PAGE-LEVEL DIALOGUE BASELINE
	const dialogueSizes: number[] = [];
	const preparedRegions = [];

	for (const r of decollided) {
		const rawText = sanitizeForFont(r.text.trim());
		if (!rawText) continue;

		let color: TextColor;
		if (colorMode === 'dark') {
			color = { fill: 'black', stroke: 'white' };
		} else if (colorMode === 'light') {
			color = { fill: 'white', stroke: 'black' };
		} else {
			const bg = sampleBackground(img, r.box.x, r.box.y, r.box.w, r.box.h);
			color = pickTextColor(bg);
		}

		// STAT-PANEL PATH — STRUCTURED MULTI-SEGMENT RENDERING
		const statSegments = parseStatPanel(rawText);
		if (statSegments) {
			preparedRegions.push({ r, rawText, text: rawText, statSegments, color, isSfx: false, font: fontDialogue, maxW: r.box.w, maxH: r.box.h, sizeCap: 0 });
			continue;
		}

		// STANDARD PATH — UNIFIED NATURAL MULTI-LINE WRAPPING WITH USER CASING
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

		const font = fontFor(text, fontDialogue, fontCjk);
		const isSfx = isSfxOrShout(text);
		const maxW = Math.max(10, r.box.w * (1 - 2 * inset));
		const maxH = Math.max(10, r.box.h * (1 - 2 * inset));
		const sizeCap = Math.max(MAX_SFX_FONT_SIZE, Math.max(r.box.w, r.box.h));

		if (!isSfx && r.kind === 'dialogue_bubble') {
			const maxDialogueSize = Math.max(24, Math.round(img.width * 0.035));
			const cap = Math.min(sizeCap, maxDialogueSize);
			const initialSize = fitFontSize(ctx, text, font, r.box.w, r.box.h, cap, cap, inset, fontCjk);
			if (text.split(/\s+/).length >= 2) {
				dialogueSizes.push(initialSize);
			}
		}

		preparedRegions.push({ r, rawText, text, statSegments: null, color, isSfx, font, maxW, maxH, sizeCap });
	}

	// COMPUTE PAGE DIALOGUE MEDIAN BASELINE
	let pageDialogueBaseline = 0;
	if (dialogueSizes.length > 0) {
		dialogueSizes.sort((a, b) => a - b);
		pageDialogueBaseline = dialogueSizes[Math.floor(dialogueSizes.length / 2)];
	}

	// PASS 2: RENDER REGIONS WITH HARMONIZED SIZING
	for (const prep of preparedRegions) {
		const { r, text, statSegments, color, isSfx, font, maxW, maxH, sizeCap } = prep;
		if (statSegments) {
			typesetStatPanel(ctx, r, statSegments, color);
			continue;
		}

		const { x, y, w, h } = r.box;
		const angleDeg = r.angle ?? 0;
		const hasRotation = enableRotation && Math.abs(angleDeg) >= 2.0 && Math.abs(angleDeg) <= 45.0;

		const maxDialogueSize = Math.max(24, Math.round(img.width * 0.035));
		let cap = r.kind === 'dialogue_bubble' ? Math.min(sizeCap, maxDialogueSize) : sizeCap;
		const isShortNonShout = text.split(/\s+/).length <= 2 && !/[!！]/.test(text);
		if (pageDialogueBaseline > 0 && isShortNonShout && r.kind === 'dialogue_bubble') {
			cap = Math.min(cap, Math.max(18, Math.round(pageDialogueBaseline * 1.25)));
		}

		// SINGLE-WORD VERTICAL STACKING FOR NARROW TALL BUBBLES (ONLY IF REGION IS MARKED VERTICAL)
		const vertWordLayout = tryVerticalSingleWordLayout(ctx, text, font, w, h, isSfx ? sizeCap : cap, Boolean(r.vertical), inset, fontCjk);

		let size: number;
		let lines: string[];

		if (vertWordLayout) {
			size = vertWordLayout.size;
			lines = vertWordLayout.lines;
		} else if (isSfx) {
			size = fitSingleLineSize(ctx, text, font, maxW, maxH, sizeCap, fontCjk);
			lines = [text];
		} else {
			size = fitFontSize(ctx, text, font, w, h, cap, cap, inset, fontCjk);
			lines = reflowText(ctx, text, maxW);
		}

		ctx.font = fontSpec(size, font, text, fontCjk);
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

		const visualH = (lines.length - 1) * lineH + size * 0.75;

		if (hasRotation) {
			const cx = x + w / 2;
			const cy = y + h / 2;
			ctx.translate(cx, cy);
			ctx.rotate((angleDeg * Math.PI) / 180);
			let ty = -visualH / 2 + size * 0.75;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					0,
					ty,
					size,
					fontDialogue,
					fontCjk,
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
			let ty = y + (h - visualH) / 2 + size * 0.75;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					tx,
					ty,
					size,
					fontDialogue,
					fontCjk,
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
	// GLOBAL WEBP POLICY: TYPESET OUTPUT IS ALWAYS WEBP.
	return await canvas.encode('webp', 90);
}
