// TYPESETTING - RENDER TRANSLATED TEXT ONTO THE CLEANED PAGE WITH @napi-rs/canvas (SKIA).
import { createCanvas, loadImage } from '@napi-rs/canvas';

// SUBMODULE RE-EXPORTS FOR BACKWARD COMPATIBILITY
export * from './typeset/fonts';
export * from './typeset/stat-panel';
export * from './typeset/layout';
export * from './typeset/color';
export * from './typeset/decollision';
export * from './typeset/sanitize';

import {
	registerFonts,
	ensureFontRegistered,
	fontFor,
	fontSpec,
	drawTextLineWithRuns,
	resolveEffectiveCasing,
	FONT_DIALOGUE,
	FONT_FALLBACK_NAME,
	BUNDLED_SCRIPT_FONTS,
	rtlFontSpec,
	type TextColor,
} from './typeset/fonts';
import type { Script } from '$lib/languages';
import { plainDiacritics } from '$lib/diacritics';
import { familyCodepoints } from './typeset/coverage';
import { dominantScript, type ScriptFontSlot } from '$lib/typeset-scripts';
import { resolveDirection, type DirectionOverride } from '$lib/text-direction';
import type { ScriptFontContext } from './typeset/script-fonts';
import { isSfxOrShout, type TypesetRegion } from './typeset/stat-panel';
import { fitFontSize, fitFontSizeWithLines, fitSingleLineSize, isStructuredList } from './typeset/layout';
import { textFontStack } from './typeset/script-fonts';
import { pickTextColor, sampleBackground } from './typeset/color';
import { decollideRegions } from './typeset/decollision';
import { sanitizeForFont } from './typeset/sanitize';
import { accentActive, accentScriptContext, appliesAccent, heavierOutline, resolveAccentFont, runMeasuringContext } from './typeset/accent';

// -- CONSTANTS -- //

const BOX_INSET = 0.05;
const MAX_SFX_FONT_SIZE = 100;
const LINE_HEIGHT = 1.2;
const OUTLINE_FACTOR = 0.18;
// OPTICAL SIZE FACTOR FOR RIGHT-TO-LEFT DIALOGUE (FEAT-007 ADR-007). 1.0 = NO BOOST UNTIL THE OWNER'S VISUAL
// REVIEW; 1.1 TO 1.15 IS THE LIKELY RANGE.
const RTL_SIZE_BOOST = 1.0;

// SCRIPTS WITHOUT LETTER CASE: CASING TRANSFORMS ARE SKIPPED FOR TEXT DOMINATED BY THEM
const CASELESS_SCRIPTS = new Set<Script>(['han', 'kana', 'hangul', 'devanagari', 'thai', 'arabic', 'hebrew', 'bengali', 'tamil']);

export interface TypesetOptions {
	fontDialogue?: string;
	/** @deprecated USE scriptFonts; STILL APPLIED TO THE han / kana / hangul SLOTS WHEN THOSE ARE NOT SET. */
	fontCjk?: string;
	/** THE SCRIPT THE BOOK IS TYPESET IN; DEFAULTS TO THE DOMINANT SCRIPT OF ALL REGION TEXT. */
	targetScript?: Script;
	/** THE USER'S FONT PER SCRIPT (FEAT-006). */
	scriptFonts?: Partial<Record<ScriptFontSlot, string>>;
	/** TEXT DIRECTION PER REGION: 'auto' (DEFAULT) DETECTS IT FROM THE TEXT (FEAT-007). */
	direction?: DirectionOverride;
	fontSize?: number;
	boxInset?: number;
	lineHeight?: number;
	outlineMode?: 'none' | 'thin' | 'standard' | 'heavy';
	colorMode?: 'auto' | 'dark' | 'light';
	casing?: 'uppercase' | 'original' | 'lowercase';
	allCaps?: boolean;
	enableRotation?: boolean;
	align?: 'center' | 'left' | 'right';
	textColor?: string;
	strokeColor?: string;
	strokeWidth?: number;
	fontWeight?: 'normal' | 'bold' | string | number;
	fontStyle?: 'normal' | 'italic' | boolean;
	enableItalic?: boolean;
	/** ACCENT FONT PER SCRIPT, 'latin' INCLUDED (FEAT-010); EMPTY OR UNSET LEAVES OUTPUT UNCHANGED. */
	accentFonts?: Partial<Record<Script, string>>;
	accentCasing?: 'uppercase' | 'original' | 'lowercase';
	accentFontWeight?: 'normal' | 'bold' | string | number;
	/** ALSO APPLY THE ACCENT FONT TO ACCENT REGIONS INSIDE SPEECH BUBBLES (ADR-004). */
	accentInBubbles?: boolean;
}

// -- FUNCTIONS -- //

/** THE DEPRECATED fontCjk OPTION, OR UNDEFINED WHEN IT IS UNSET OR THE PLAIN FALLBACK FONT. */
function legacyCjkFont(opts: Pick<TypesetOptions, 'fontCjk'>): string | undefined {
	return opts.fontCjk && opts.fontCjk !== FONT_FALLBACK_NAME ? opts.fontCjk : undefined;
}

/**
 * THE SLOT MAP THE RENDERER USES. A LEGACY fontCjk (ONLY SET FOR AN OLD CLIENT'S EXPLICIT REQUEST, SEE
 * buildTypesetOptions) FILLS THE han / kana / hangul SLOTS THAT ARE STILL UNSET; EVERY OTHER SLOT IS AS GIVEN.
 */
/**
 * LATIN LETTERS WITH DIACRITICS THE FAMILY HAS NO GLYPH FOR ARE DRAWN PLAIN (É -> E), SO A WORD NEVER SWITCHES TO A FALLBACK
 * FONT MID-WORD (FEAT-011). A FAMILY WHOSE CODE POINTS ARE UNKNOWN KEEPS EVERY LETTER. RUNS AFTER CASING, BECAUSE A FONT
 * CAN HAVE É BUT NOT é. STORED TRANSLATIONS ARE NEVER CHANGED.
 */
export function plainForFont(text: string, family: string): string {
	const codepoints = familyCodepoints(family);
	return codepoints ? plainDiacritics(text, (codePoint) => codepoints.has(codePoint)) : text;
}

export function resolveScriptFontSlots(opts: Pick<TypesetOptions, 'fontCjk' | 'scriptFonts'>): Partial<Record<ScriptFontSlot, string>> {
	const scriptFonts: Partial<Record<ScriptFontSlot, string>> = { ...(opts.scriptFonts ?? {}) };
	const fontCjk = legacyCjkFont(opts);
	if (fontCjk) {
		for (const slot of ['han', 'kana', 'hangul'] as const) scriptFonts[slot] ??= fontCjk;
	}
	return scriptFonts;
}

export async function typesetPage(
	cleanedPng: Buffer,
	regions: TypesetRegion[],
	opts: TypesetOptions = {},
): Promise<Buffer> {
	registerFonts();
	const fontDialogue = opts.fontDialogue || FONT_DIALOGUE;
	// NO FORCED CJK DEFAULT ANY MORE: AN UNSET SLOT RESOLVES THROUGH THE SCRIPT-AWARE CHAIN (FEAT-006)
	const fontCjk = legacyCjkFont(opts);
	const scriptFonts = resolveScriptFontSlots(opts);
	ensureFontRegistered(fontDialogue);
	for (const family of new Set(Object.values(scriptFonts))) {
		if (family) ensureFontRegistered(family);
	}
	const scriptCtx: ScriptFontContext = {
		dialogue: fontDialogue,
		scriptFonts,
		targetScript: opts.targetScript ?? dominantScript(regions.map((r) => r.text).join(' '), 'latin'),
		bundled: BUNDLED_SCRIPT_FONTS,
	};
	const fontWeight = opts.fontWeight ?? 'normal';
	const fontStyle = opts.fontStyle ?? (opts.enableItalic ? 'italic' : 'normal');
	const inset = opts.boxInset ?? BOX_INSET;
	const outlineMode = opts.outlineMode ?? 'standard';
	const colorMode = opts.colorMode ?? 'auto';
	const casing = opts.casing ?? (opts.allCaps === false ? 'original' : 'uppercase');
	const enableRotation = opts.enableRotation ?? true;
	const align = opts.align === 'right' ? 'center' : (opts.align ?? 'center');
	const effectiveLineHeight = opts.lineHeight ?? LINE_HEIGHT;
	// ACCENT FONT (FEAT-010): OFF UNLESS A CONFIGURED ACCENT FAMILY IS AVAILABLE, SO OUTPUT IS UNCHANGED WITHOUT ONE
	const accentOn = accentActive(opts);
	const accentCasing = opts.accentCasing ?? 'uppercase';
	const accentWeight = opts.accentFontWeight ?? 'normal';

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
		if (opts.textColor) {
			color = {
				fill: opts.textColor,
				stroke: opts.strokeColor || (opts.textColor === 'white' ? 'black' : 'white'),
			};
		} else if (colorMode === 'dark') {
			color = { fill: 'black', stroke: 'white' };
		} else if (colorMode === 'light') {
			color = { fill: 'white', stroke: 'black' };
		} else {
			// SAMPLE BACKGROUND DIRECTLY FROM EXISTING CANVAS CONTEXT TO PREVENT TEMPORARY SKIA ALLOCATIONS
			const bg = sampleBackground(ctx, r.box.x, r.box.y, r.box.w, r.box.h);
			color = pickTextColor(bg);
		}

		// STANDARD PATH: UNIFIED NATURAL MULTI-LINE WRAPPING WITH USER CASING
		// CASING ONLY APPLIES TO CASED SCRIPTS; LATIN NAMES INSIDE HINDI / ARABIC / CJK TEXT KEEP THE MODEL'S CASING
		const dir = resolveDirection(rawText, opts.direction);
		// RIGHT-TO-LEFT TEXT IS NEVER RE-CASED: LATIN NAMES INSIDE ARABIC KEEP THE MODEL'S CASING (ADR-005)
		const isCaseless = dir === 'rtl' || CASELESS_SCRIPTS.has(dominantScript(rawText, scriptCtx.targetScript));
		const applyCasing = (value: string, family: string, requested: typeof casing): string => {
			if (isCaseless) return value;
			const effectiveCasing = resolveEffectiveCasing(family, requested);
			if (effectiveCasing === 'lowercase') return value.toLowerCase();
			if (effectiveCasing === 'original') return value;
			return value.toUpperCase();
		};
		let font = fontFor(rawText, fontDialogue, fontCjk, scriptCtx);
		let text = plainForFont(applyCasing(rawText, font, casing), font);

		// PER-REGION STYLE: THE PAGE-LEVEL VALUES UNLESS THIS REGION IS DRAWN IN THE ACCENT FONT (FEAT-010)
		let regionCtx = scriptCtx;
		let regionWeight = fontWeight;
		let regionOutline = outlineMode;
		let accentRendered = false;
		if (accentOn && appliesAccent(r, opts)) {
			const accent = resolveAccentFont(rawText, opts, scriptCtx, (value, family) => plainForFont(applyCasing(value, family, accentCasing), family));
			if (accent) {
				regionCtx = accentScriptContext(scriptCtx, accent);
				font = fontFor(rawText, accent.font, fontCjk, regionCtx);
				text = accent.text;
				regionWeight = accentWeight;
				accentRendered = true;
			} else {
				// NO ACCENT FONT HAS EVERY LETTER: DIALOGUE FONT, ONE OUTLINE STEP HEAVIER (ADR-009)
				regionOutline = heavierOutline(outlineMode);
			}
		}
		// LEFT-TO-RIGHT ACCENT REGIONS MEASURE BY THE RUNS THEY ARE DRAWN WITH. RIGHT-TO-LEFT LINES ARE NEVER SPLIT INTO
		// RUNS (ONE fillText PER LINE), SO THEY MEASURE ON THE CANVAS LIKE RIGHT-TO-LEFT DIALOGUE
		const measureCtx = accentRendered && dir === 'ltr' ? runMeasuringContext(ctx, font, regionCtx, fontCjk, regionWeight, fontStyle, dir) : ctx;

		const isSfx = isSfxOrShout(text);
		const maxW = Math.max(10, r.box.w * (1 - 2 * inset));
		const maxH = Math.max(10, r.box.h * (1 - 2 * inset));
		const sizeCap = Math.max(MAX_SFX_FONT_SIZE, Math.max(r.box.w, r.box.h));

		let initialFitted: { size: number; lines: string[] } | undefined;
		if (!isSfx && r.kind === 'dialogue_bubble') {
			const maxDialogueSize = opts.fontSize ? opts.fontSize : Math.max(24, Math.round(img.width * 0.035));
			const cap = Math.min(sizeCap, Math.round(maxDialogueSize * (dir === 'rtl' ? RTL_SIZE_BOOST : 1)));
			initialFitted = fitFontSizeWithLines(measureCtx, text, font, r.box.w, r.box.h, cap, cap, inset, fontCjk, regionWeight, fontStyle, regionCtx);
			// A REGION DRAWN IN THE ACCENT FONT NEVER MOVES THE PAGE BASELINE; A LABELLED REGION DRAWN AS DIALOGUE STILL
			// COUNTS, SO THE MEDIAN IS UNCHANGED WHEN THE FEATURE IS OFF (REVIEW H6)
			if (text.split(/\s+/).length >= 2 && !accentRendered) {
				dialogueSizes.push(initialFitted.size);
			}
		}

		preparedRegions.push({
			r,
			rawText,
			text,
			color,
			isSfx,
			font,
			maxW,
			maxH,
			sizeCap,
			initialFitted,
			dir,
			regionCtx,
			regionWeight,
			regionOutline,
			accentRendered,
			measureCtx,
		});
	}

	// COMPUTE PAGE DIALOGUE MEDIAN BASELINE
	let pageDialogueBaseline = 0;
	if (dialogueSizes.length > 0) {
		dialogueSizes.sort((a, b) => a - b);
		pageDialogueBaseline = dialogueSizes[Math.floor(dialogueSizes.length / 2)];
	}

	// PASS 2: RENDER REGIONS WITH HARMONIZED SIZING
	for (const prep of preparedRegions) {
		const { r, text, color, isSfx, font, maxW, maxH, sizeCap, initialFitted, dir, regionCtx, regionWeight, regionOutline, accentRendered, measureCtx } = prep;

		const { x, y, w, h } = r.box;
		const angleDeg = r.angle ?? 0;
		const hasRotation = enableRotation && Math.abs(angleDeg) >= 2.0 && Math.abs(angleDeg) <= 45.0;

		const maxDialogueSize = opts.fontSize ? opts.fontSize : Math.max(24, Math.round(img.width * 0.035));
		let cap = r.kind === 'dialogue_bubble' ? Math.min(sizeCap, Math.round(maxDialogueSize * (dir === 'rtl' ? RTL_SIZE_BOOST : 1))) : sizeCap;
		const isShortNonShout = text.split(/\s+/).length <= 2 && !/[!！]/.test(text);
		if (pageDialogueBaseline > 0 && isShortNonShout && r.kind === 'dialogue_bubble' && !opts.fontSize) {
			cap = Math.min(cap, Math.max(18, Math.round(pageDialogueBaseline * 1.25)));
		}

		let size: number;
		let lines: string[];

		if (isSfx) {
			size = fitSingleLineSize(measureCtx, text, font, maxW, maxH, sizeCap, fontCjk, regionWeight, fontStyle, regionCtx);
			lines = [text];
		} else if (initialFitted && initialFitted.size <= cap) {
			// REUSE PASS 1 FITTED RESULT DIRECTLY IF CAP WAS NOT REDUCED BELOW INITIAL FIT
			size = initialFitted.size;
			lines = initialFitted.lines;
		} else {
			// USE THE FITTED LAYOUT DIRECTLY SO THE RENDER MATCHES THE VALIDATED FIT CHECKS
			const fitted = fitFontSizeWithLines(measureCtx, text, font, w, h, cap, cap, inset, fontCjk, regionWeight, fontStyle, regionCtx);
			size = fitted.size;
			lines = fitted.lines;
		}

		ctx.font = fontSpec(size, font, text, fontCjk, regionWeight, fontStyle, textFontStack(text, font, regionCtx));
		const lineH = size * effectiveLineHeight;
		const totalH = lines.length * lineH;

		ctx.save();
		ctx.direction = dir;
		ctx.textAlign = align === 'left' ? 'left' : 'center';
		// 'left' MEANS START-ALIGNED (ADR-004): THE RIGHT EDGE FOR A RIGHT-TO-LEFT REGION
		const lineAlign: 'center' | 'start' = align === 'left' ? 'start' : 'center';
		ctx.textBaseline = 'alphabetic';

		const isBlackOnLight = color.fill === 'black' || color.fill === '#111111';
		const isDarkStroke = color.stroke === 'black' || color.stroke === '#000000' || color.stroke === '#111111';

		let strokeWidth: number;
		if (opts.strokeWidth !== undefined) {
			strokeWidth = opts.strokeWidth;
		} else if (regionOutline === 'none') {
			strokeWidth = 0;
		} else if (regionOutline === 'thin') {
			strokeWidth = isBlackOnLight ? Math.max(1.0, size * 0.06) : Math.max(1.5, size * 0.10);
		} else if (regionOutline === 'heavy') {
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

		// LATIN KEEPS THE FIXED 0.75 EM CAP-HEIGHT BASELINE (ITS OUTPUT MUST NOT MOVE). RIGHT-TO-LEFT TEXT IS CENTRED ON ITS
		// REAL INK: ARABIC HAS TALL ASCENDERS AND DEEP DESCENDERS, SO THE FIXED RULE SITS IT TOO LOW (FEAT-007 PHASE 4)
		let topToBaseline = size * 0.75;
		let inkBelow = 0;
		// ACCENT FONTS VARY WIDELY IN CAP HEIGHT AND DESCENT, SO THEY ARE CENTRED ON THEIR MEASURED INK TOO (ADR-013)
		if (dir === 'rtl' || accentRendered) {
			ctx.font =
				dir === 'rtl'
					? rtlFontSpec(size, font, text, fontCjk, regionWeight, fontStyle, regionCtx)
					: fontSpec(size, font, text, fontCjk, regionWeight, fontStyle, textFontStack(text, font, regionCtx));
			let ascent = 0;
			let descent = 0;
			for (const line of lines) {
				const m = ctx.measureText(line);
				ascent = Math.max(ascent, m.actualBoundingBoxAscent ?? 0);
				descent = Math.max(descent, m.actualBoundingBoxDescent ?? 0);
			}
			if (ascent > 0) {
				topToBaseline = ascent;
				inkBelow = descent;
			}
		}
		const visualH = (lines.length - 1) * lineH + topToBaseline + inkBelow;

		if (hasRotation) {
			const cx = x + w / 2;
			const cy = y + h / 2;
			ctx.translate(cx, cy);
			ctx.rotate((angleDeg * Math.PI) / 180);
			let ty = -visualH / 2 + topToBaseline;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					align === 'left' ? (dir === 'rtl' ? maxW / 2 : -maxW / 2) : 0,
					ty,
					size,
					font,
					// NO FORCED FALLBACK FONT: EACH SCRIPT RUN USES ITS OWN CHAIN
					'',
					color,
					strokeWidth,
					isDarkStroke,
					fontCjk,
					lineAlign,
					regionWeight,
					fontStyle,
					regionCtx,
					dir,
				);
				ty += lineH;
			}
		} else {
			const tx = align === 'left' ? (dir === 'rtl' ? x + (w + maxW) / 2 : x + (w - maxW) / 2) : x + w / 2;
			let ty = y + (h - visualH) / 2 + topToBaseline;
			for (const line of lines) {
				drawTextLineWithRuns(
					ctx,
					line,
					tx,
					ty,
					size,
					font,
					// NO FORCED FALLBACK FONT: EACH SCRIPT RUN USES ITS OWN CHAIN
					'',
					color,
					strokeWidth,
					isDarkStroke,
					fontCjk,
					lineAlign,
					regionWeight,
					fontStyle,
					regionCtx,
					dir,
				);
				ty += lineH;
			}
		}
		ctx.restore();
	}
	// GLOBAL WEBP POLICY: TYPESET OUTPUT IS ALWAYS WEBP.
	return await canvas.encode('webp', 90);
}
