// TYPESETTING — RENDER TRANSLATED TEXT ONTO THE CLEANED PAGE WITH @napi-rs/canvas (SKIA).
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// -- TYPES -- //



export interface TypesetBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface TypesetRegion {
	id: string;
	box: TypesetBox;
	text: string;
	vertical?: boolean;
	angle?: number;
}

export interface TextColor {
	fill: string;
	stroke: string;
}

// -- STAT-PANEL SEGMENT TYPES -- //

export type SegmentKind = 'title' | 'rarity' | 'subtitle' | 'body' | 'flavour';

export interface TextSegment {
	kind: SegmentKind;
	text: string;
}

function findFontDir(): string {
	const candidates = [
		fileURLToPath(new URL('../../../static/fonts', import.meta.url)),
		fileURLToPath(new URL('../../static/fonts', import.meta.url)),
		fileURLToPath(new URL('../../../../static/fonts', import.meta.url)),
		join(process.cwd(), 'static', 'fonts'),
		join(process.cwd(), 'web', 'static', 'fonts'),
		join(process.env.APPDATA || '', 'XianScan', 'app', 'static', 'fonts'),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, 'CCWildWords-Roman.ttf'))) {
			return dir;
		}
	}
	return candidates[0];
}

const FONT_DIR = findFontDir();

export const FONT_DIALOGUE = 'CC Wild Words';
export const FONT_SFX = 'CC Wild Words';
export const FONT_MONO = 'CC Wild Words';
export const FONT_FALLBACK_NAME = 'Friendly Sans';
export const FONT_FALLBACK = ', "Friendly Sans", "Yu Gothic Bold", "Yu Gothic", "Microsoft YaHei Bold", "Microsoft YaHei", Arial, "Segoe UI", sans-serif';

// RENDER MARGINS INSIDE THE DETECTED BOX — 5% INSET (0.05) GIVES BALANCED BOUNDARY UTILIZATION WITH CLEAN EDGE PADDING
const BOX_INSET = 0.05;
const SFX_BOX_INSET = 0.02;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
// TEXT OUTLINE (THE BLACK/WHITE STROKE DRAWN UNDER THE FILL) — SIZED RELATIVE TO THE FONT WITH A
// FLOOR FOR SMALL TEXT. HEAVY ENOUGH TO KEEP TRANSLATED TEXT READABLE ON BUSY ARTWORK.
const OUTLINE_FACTOR = 0.18;
const OUTLINE_MIN = 2.5;

// A FRAGMENT OF NOTHING BUT TRAILING PUNCTUATION (e.g. THE "." THAT CHARACTER-BREAKING WOULD
// OTHERWISE STRAND ON ITS OWN LINE).
const LONE_PUNCT = /^[.．…·!！?？,，;；:：~～)"'']{1,3}$/;
// ABSOLUTE FONT-SIZE CEILING CAP — SCALES WITH REGION DIMENSIONS TO MAXIMIZE BOUNDARY
const MAX_SFX_FONT_SIZE = 100;

// KEYWORDS THAT MARK A LINE AS A RARITY+TYPE LINE
const RARITY_KEYWORDS = new Set([
	'LEGENDARY', 'MYTHIC', 'DIVINE', 'EPIC', 'RARE', 'FINE', 'UNCOMMON', 'COMMON',
	'TRANSCENDENT', 'IMMORTAL', 'SACRED', 'ANCIENT', 'UNIQUE',
]);

let fontsRegistered = false;

function registerFonts(): void {
	if (fontsRegistered) return;
	fontsRegistered = true;
	const fontDir = findFontDir();
	GlobalFonts.registerFromPath(join(fontDir, 'CCWildWords-Roman.ttf'), FONT_DIALOGUE);
	GlobalFonts.registerFromPath(join(fontDir, 'FriendlySans-Regular.ttf'), FONT_FALLBACK_NAME);
	try {
		if (process.platform === 'win32') {
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arial.ttf', 'Arial');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\segoeui.ttf', 'Segoe UI');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\YuGothB.ttc', 'Yu Gothic Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\YuGothM.ttc', 'Yu Gothic');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\msyhbd.ttc', 'Microsoft YaHei Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\msyh.ttc', 'Microsoft YaHei');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\malgunbd.ttf', 'Malgun Gothic Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\malgun.ttf', 'Malgun Gothic');
		}
	} catch {
		// FALLBACK TO SKIA SYSTEM FONT RESOLUTION
	}
	if (!GlobalFonts.has(FONT_DIALOGUE) || !GlobalFonts.has(FONT_FALLBACK_NAME)) {
		fontsRegistered = false;
		throw new Error(`typeset fonts not found in ${fontDir} — run the font download step`);
	}
}

// Matches Japanese Hiragana, Katakana, Kanji, and Korean Hangul
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
// Characters remapped to arrow glyphs in CC Wild Words (e.g. [ and ] are comic bubble arrows)
const UNSUPPORTED_WILDWORDS_REGEX = /[\[\]{}|\\]/;

export function fontFor(text?: string, fontDialogue = FONT_DIALOGUE, fontCjk = FONT_FALLBACK_NAME): string {
	if (text && (CJK_REGEX.test(text) || (fontDialogue === FONT_DIALOGUE && UNSUPPORTED_WILDWORDS_REGEX.test(text)))) {
		return fontCjk;
	}
	return fontDialogue;
}

export function fontSpec(size: number, fontNameOrText?: string, text?: string, fontCjk = FONT_FALLBACK_NAME): string {
	let fontName: string;
	if (fontNameOrText && fontNameOrText !== FONT_DIALOGUE && fontNameOrText !== FONT_FALLBACK_NAME && fontNameOrText !== fontCjk) {
		fontName = fontNameOrText;
	} else if (text && (CJK_REGEX.test(text) || UNSUPPORTED_WILDWORDS_REGEX.test(text))) {
		fontName = fontCjk;
	} else {
		fontName = fontNameOrText ?? FONT_DIALOGUE;
	}
	if (fontName === fontCjk || fontName === FONT_FALLBACK_NAME) {
		return `bold ${size}px "${fontName}", "Yu Gothic Bold", "Yu Gothic", "Microsoft YaHei Bold", "Microsoft YaHei", Arial, "Segoe UI", sans-serif`;
	}
	return `${size}px "${fontName}"${FONT_FALLBACK}`;
}

// -- COLOR / CONTRAST (PURE) -- //

function luminance(r: number, g: number, b: number): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function pickTextColor(bg: { r: number; g: number; b: number }): TextColor {
	return luminance(bg.r, bg.g, bg.b) < 0.18
		? { fill: 'white', stroke: 'black' }
		: { fill: 'black', stroke: 'white' };
}


// -- STAT-PANEL PARSING (PURE) -- //

/**
 * Detect whether `text` is a wuxia stat-panel block (starts with a [TITLE] line).
 * Returns an ordered array of segments; returns null if not a stat-panel.
 */
export function parseStatPanel(text: string): TextSegment[] | null {
	const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	if (rawLines.length === 0) return null;

	// -- CASE 1a: starts with 【TITLE】 CJK brackets (LLM now outputs this directly) --
	// -- CASE 1b: starts with [TITLE] ASCII brackets (fallback — convert to CJK to avoid font arrow remapping) --
	const hasCjkBracket = /^【.+】$/.test(rawLines[0]);
	const hasAsciiBracket = /^\[.+\]$/.test(rawLines[0]);
	if (hasCjkBracket || hasAsciiBracket) {
		const segments: TextSegment[] = [
			{ kind: 'title', text: rawLines[0] },
		];
		for (let i = 1; i < rawLines.length; i++) {
			segments.push(..._classifyLine(rawLines[i]));
		}
		return segments;
	}

	// -- CASE 2: starts with a rarity keyword (body region — no title prefix) --
	// The OCR may split the title and the body into separate regions. The body region
	// looks like: "LEGENDARY WAR CHARIOT\n(IMPROVED VERSION)\nForged by…"
	const firstWord = rawLines[0].split(/\s+/)[0].toUpperCase();
	if (RARITY_KEYWORDS.has(firstWord) && rawLines.length >= 2) {
		return rawLines.map((l) => _classifyLine(l)[0]);
	}

	return null;
}


/** Classify one line into the right segment kind. */
function _classifyLine(line: string): TextSegment[] {
	if (/^\(.+\)$/.test(line)) return [{ kind: 'subtitle', text: line }];
	if (line.startsWith('*')) return [{ kind: 'flavour', text: line }];
	const fw = line.split(/\s+/)[0].toUpperCase();
	if (RARITY_KEYWORDS.has(fw)) return [{ kind: 'rarity', text: line.toUpperCase() }];
	return [{ kind: 'body', text: line }];
}

/**
 * Detects whether text is an SFX / sound effect / impact exclamation (e.g. "WEI!", "NIAN!", "BOOM!", "SWOOSH!").
 */
export function isSfxOrShout(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (trimmed.includes('\n')) return false;
	if (trimmed.includes('?') || trimmed.includes('？') || trimmed.includes(',') || trimmed.includes('，')) return false;

	const words = trimmed.split(/\s+/);
	// Single standalone token (e.g. "WEI!", "NIAN!", "BOOM!", "SLASH!", "咻")
	if (words.length === 1) return true;
	// Short 2-word sound effect (e.g. "CLANG CLANG!", "HEH HEH", "THUMP THUMP")
	if (words.length === 2 && trimmed.length <= 15) {
		const w1 = words[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
		const w2 = words[1].replace(/[^a-zA-Z]/g, '').toLowerCase();
		if (w1 && w2 && (w1 === w2 || trimmed.endsWith('!') || trimmed.endsWith('！'))) {
			const commonDialogue = new Set([
				'lets', 'let', 'thank', 'thanks', 'help', 'stop', 'come', 'get', 'look',
				'wait', 'shut', 'dont', 'you', 'i', 'we', 'they', 'he', 'she', 'who', 'what',
				'where', 'when', 'why', 'how',
			]);
			if (commonDialogue.has(w1) || commonDialogue.has(w2)) {
				return false;
			}
			return true;
		}
	}
	return false;
}

// -- LAYOUT (PURE, CANVAS-MEASURED) -- //

export function wrapText(ctx: { measureText(t: string): { width: number } }, text: string, maxWidth: number): string[] {
	const lines: string[] = [];

	function breakLongWord(word: string): { head: string[]; tail: string } {
		let current = word;
		const heads: string[] = [];

		// If current ends in trailing punctuation (e.g. "WORD..."), don't hyphenate into the dots
		const punctMatch = current.match(/^(.*?)([.!?,:;~…"']+)?$/);
		const stem = punctMatch && punctMatch[1] ? punctMatch[1] : current;
		const trailingPunct = punctMatch && punctMatch[2] ? punctMatch[2] : '';

		// If the entire word only overflows by its trailing punctuation, force it on line
		if (ctx.measureText(current).width > maxWidth && trailingPunct) {
			const stemWidth = ctx.measureText(stem).width;
			if (stemWidth <= maxWidth) {
				return { head: [], tail: current };
			}
		}

		while (ctx.measureText(current).width > maxWidth && current.length > 1) {
			// First, check how many characters of current fit on the boundary rect WITHOUT hyphen
			let kRaw = current.length - 1;
			while (kRaw > 0 && ctx.measureText(current.slice(0, kRaw)).width > maxWidth) {
				kRaw--;
			}
			const overflowLetters = current.length - kRaw;
			// STRICT RULE: If only 1 letter overflows the boundary rect (e.g. "ANOTHE" fits, only "R" overflows),
			// force the whole word on the line without breaking!
			if (overflowLetters <= 1) {
				break;
			}

			// If 2 or more letters overflow, proceed to break off with a hyphen '-'
			let k = current.length - 2;
			while (k > 0 && ctx.measureText(current.slice(0, k) + '-').width > maxWidth) {
				k--;
			}
			if (k <= 0) {
				k = current.length - 2;
				while (k > 0 && ctx.measureText(current.slice(0, k)).width > maxWidth) {
					k--;
				}
			}
			const remainderLen = current.length - k;
			if (remainderLen <= 1) {
				break;
			}
			if (k >= 2) {
				const prefix = current.slice(0, k);
				heads.push(prefix.endsWith('-') ? prefix : `${prefix}-`);
				current = current.slice(k);
			} else if (current.length >= 4) {
				const prefix = current.slice(0, 2);
				heads.push(prefix.endsWith('-') ? prefix : `${prefix}-`);
				current = current.slice(2);
			} else {
				break; // Force remaining short token
			}
		}
		return { head: heads, tail: current };
	}

	for (const paragraph of text.split('\n')) {
		let current = '';
		// Check if paragraph contains CJK characters (Japanese/Chinese/Korean)
		if (CJK_REGEX.test(paragraph)) {
			for (let i = 0; i < paragraph.length; i++) {
				const char = paragraph[i];
				const candidate = `${current}${char}`;
				if (ctx.measureText(candidate).width <= maxWidth) {
					current = candidate;
				} else {
					if (current) lines.push(current);
					current = char;
				}
			}
			if (current) lines.push(current);
			continue;
		}

		for (const word of paragraph.split(/\s+/)) {
			if (!word) continue;
			if (!current) {
				if (ctx.measureText(word).width <= maxWidth) {
					current = word;
				} else {
					const { head, tail } = breakLongWord(word);
					lines.push(...head);
					current = tail;
				}
			} else {
				const candidate = `${current} ${word}`;
				if (ctx.measureText(candidate).width <= maxWidth) {
					current = candidate;
				} else {
					lines.push(current);
					if (ctx.measureText(word).width <= maxWidth) {
						current = word;
					} else {
						const { head, tail } = breakLongWord(word);
						lines.push(...head);
						current = tail;
					}
				}
			}
		}
		if (current) {
			// EXCEPTION: AN OVERFLOWING TRAILING "." / "？" / "!" MUST NOT BE STRANDED ON ITS
			// OWN LINE — RE-ATTACH IT TO THE LAST LINE, ACCEPTING A SLIGHT OVERFLOW. THIS IS
			// THE "TRANSMIGRATION.. / ." FAILURE: CHARACTER-BREAKING DROPPED THE FINAL DOT.
			if (LONE_PUNCT.test(current) && lines.length > 0) {
				lines[lines.length - 1] += current;
			} else {
				lines.push(current);
			}
		}
	}
	return lines;
}

/**
 * Balanced word-wrap: distributes words evenly across lines so no line is
 * disproportionately short. Uses the same greedy algorithm but binary-searches
 * for the narrowest target width that still produces the same number of lines
 * as a full-width greedy wrap. The result looks typeset rather than ragged.
 */
export function balancedWrapText(
	ctx: { measureText(t: string): { width: number } },
	text: string,
	maxWidth: number,
): string[] {
	const greedy = wrapText(ctx, text, maxWidth);
	const N = greedy.length;
	if (N <= 1) return greedy; // nothing to balance

	// Lower bound: widest single word (target width can never be narrower)
	const allWords = text.split(/[\n\s]+/).filter(Boolean);
	const minW = Math.max(...allWords.map((w) => ctx.measureText(w).width));

	// Binary search for the minimum target width that still wraps into N lines
	let lo = Math.min(maxWidth, Math.ceil(minW));
	let hi = maxWidth;
	while (lo < hi - 1) {
		const mid = Math.floor((lo + hi) / 2);
		if (wrapText(ctx, text, mid).length <= N) hi = mid;
		else lo = mid + 1;
	}
	return wrapText(ctx, text, hi);
}

/**
 * THE STANDARD DIALOGUE/MONO WRAP: source '\n' breaks are OCR artifacts (one bubble's
 * paragraph split across detected lines), not layout — join them into one paragraph and
 * re-wrap BALANCED. Greedy-at-minimal-width means the upper lines come out as full as
 * possible and the LAST line is the shortest (the desired manhua bubble look) — an
 * orphaned single word like "Xin" on its own line can never happen.
 */
export function reflowText(
	ctx: { measureText(t: string): { width: number } },
	text: string,
	maxWidth: number,
): string[] {
	const paragraph = text.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
	return balancedWrapText(ctx, paragraph, maxWidth);
}

export function fitFontSize(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	fontFamily: string,
	boxW: number,
	boxH: number,
	startSize: number,
	maxSize?: number,
	boxInset: number = BOX_INSET,
): number {
	const maxW = Math.max(10, boxW * (1 - 2 * boxInset));
	const maxH = Math.max(10, boxH * (1 - 2 * boxInset));
	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, maxSize ?? startSize);
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		ctx.font = fontSpec(mid, fontFamily);
		const lines = reflowText(ctx, text, maxW);
		const lineH = mid * LINE_HEIGHT;
		if (lines.length * lineH <= maxH) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/**
 * Like fitFontSize but the text MUST stay on a single line (no wrapping).
 * Used for titles where wrapping would break the expected one-line layout.
 */
export function fitSingleLineSize(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	fontFamily: string,
	maxW: number,
	maxH: number,
	startSize: number,
): number {
	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, startSize);
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		ctx.font = fontSpec(mid, fontFamily);
		const textWidth = ctx.measureText(text).width;
		const lineH = mid * LINE_HEIGHT;
		if (textWidth <= maxW && lineH <= maxH) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}



// -- PAGE COMPOSITION -- //

/**
 * Normalizes text to replace symbols unsupported by CC Wild Words (em-dashes, curly quotes,
 * ellipsis unicode glyphs, brackets, etc.) with supported ASCII equivalents.
 */
export function sanitizeForFont(text: string): string {
	if (!text) return '';
	const trimmed = text.trim();
	if (CJK_REGEX.test(trimmed)) {
		return trimmed
			.replace(/[ \t]{2,}/g, ' ')
			.trim();
	}
	return trimmed
		.replace(/[【〔]/g, '[')
		.replace(/[】〕]/g, ']')
		.replace(/[《「『]/g, '"')
		.replace(/[》」』]/g, '"')
		.replace(/[“”„‟]/g, '"')
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[〜～]/g, '~')
		.replace(/,\s*,/g, ', ')
		.replace(/\.\s*,/g, '. ')
		.replace(/!\s*,/g, '! ')
		.replace(/\?\s*,/g, '? ')
		.replace(/…\s*,/g, '… ')
		.replace(/,\s*([.!?…])/g, '$1')
		.replace(/,\s*$/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

export function renderText(r: TypesetRegion): string {
	// Stat-panel body text keeps sentence case; everything else is uppercased.
	const sanitized = sanitizeForFont(r.text.trim());
	if (CJK_REGEX.test(sanitized)) {
		return sanitized;
	}
	const segs = parseStatPanel(sanitized);
	if (segs) {
		return segs.map((s) => s.text).join('\n');
	}
	return sanitized.toUpperCase();
}

export type TypesetOutline = 'none' | 'thin' | 'standard' | 'heavy';
export type TypesetContrast = 'auto' | 'dark' | 'light';
export type TypesetCasing = 'uppercase' | 'original' | 'lowercase';

export interface TypesetOptions {
	fontScale?: number;
	fontDialogue?: string;
	fontCjk?: string;
	boxInset?: number;
	outlineMode?: TypesetOutline;
	colorMode?: TypesetContrast;
	casing?: TypesetCasing;
	allCaps?: boolean; // backwards-compatible alias
	enableRotation?: boolean;
}

// -- STAT-PANEL RENDERER -- //

/**
 * Draw a structured stat-panel (title / rarity / subtitle / body / flavour segments)
 * stacked vertically, centre-aligned, inside the region box.
 */
export function typesetStatPanel(
	ctx: SKRSContext2D | CanvasRenderingContext2D,
	r: TypesetRegion,
	segments: TextSegment[],
	bgColor: TextColor,
): void {
	const { x, y, w, h } = r.box;
	const insetW = Math.max(10, w * (1 - 2 * BOX_INSET));
	const insetH = Math.max(10, h * (1 - 2 * BOX_INSET));

	// -- MEASURE: binary-search a single base font size so ALL segments fit at maximum size --
	const SEG_SCALE: Record<SegmentKind, number> = {
		title:    segments.length === 1 ? 1.0 : 1.30,  // standalone title fills its own box
		rarity:   1.15,
		subtitle: 0.80,
		body:     1.00,
		flavour:  0.80,
	};

	const gap = Math.max(2, h * 0.012);

	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, Math.round(h * 0.40));
	while (lo < hi) {
		const base = Math.ceil((lo + hi) / 2);
		let fits = true;
		let totalHeight = 0;

		for (const seg of segments) {
			const sz = Math.max(MIN_FONT_SIZE, Math.round(base * SEG_SCALE[seg.kind]));
			ctx.font = fontSpec(sz, FONT_DIALOGUE, seg.text);
			const lines = reflowText(ctx, seg.text, insetW);
			const segH = lines.length * (sz * LINE_HEIGHT);
			totalHeight += segH + gap;
			if (totalHeight - gap > insetH) {
				fits = false;
				break;
			}
		}

		if (fits) lo = base;
		else hi = base - 1;
	}

	const baseSize = lo;

	// -- RENDER: draw each segment top-to-bottom --
	const rendered: Array<{ lines: string[]; size: number; font: string; isTitle: boolean; isRarity: boolean }> = [];
	let contentHeight = 0;
	for (const seg of segments) {
		const size = Math.max(MIN_FONT_SIZE, Math.round(baseSize * SEG_SCALE[seg.kind]));
		const font = fontSpec(size, FONT_DIALOGUE, seg.text);
		ctx.font = font;
		const lines = reflowText(ctx, seg.text, insetW);
		const segH = lines.length * (size * LINE_HEIGHT);
		contentHeight += segH + gap;
		rendered.push({
			lines,
			size,
			font,
			isTitle: seg.kind === 'title',
			isRarity: seg.kind === 'rarity',
		});
	}
	contentHeight -= gap; // remove trailing gap

	// Centre the entire block vertically inside the bounding box
	let curY = y + (h - contentHeight) / 2;

	ctx.save();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	for (const seg of rendered) {
		ctx.font = seg.font;
		const lineH = seg.size * LINE_HEIGHT;
		for (const line of seg.lines) {
			const baselineY = curY + seg.size * 0.85;
			const tx = x + w / 2;

			// Stroke outline for contrast
			ctx.lineWidth = Math.max(2.0, seg.size * OUTLINE_FACTOR);
			ctx.lineJoin = 'round';
			ctx.strokeStyle = bgColor.stroke;
			ctx.strokeText(line, tx, baselineY);

			// Fill
			ctx.fillStyle = bgColor.fill;
			ctx.fillText(line, tx, baselineY);

			curY += lineH;
		}
		curY += gap;
	}

	ctx.restore();
}

/**
 * Adjust bounding boxes of vertically or horizontally adjacent regions that overlap or nearly touch,
 * eliminating the visual "collision" where two bubbles render on top of each other.
 */
export function decollideRegions(regions: TypesetRegion[], margin: number = 4): TypesetRegion[] {
	if (regions.length < 2) return regions;

	// Deep clone to avoid mutating input objects
	const adjusted = regions.map((r) => ({
		...r,
		box: { ...r.box },
	}));

	for (let i = 0; i < adjusted.length; i++) {
		for (let j = i + 1; j < adjusted.length; j++) {
			const a = adjusted[i];
			const b = adjusted[j];

			// Check bounding box intersection with safety margin
			const xOverlap = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
			const yOverlap = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);

			if (xOverlap > 0 && yOverlap > 0) {
				const areaA = a.box.w * a.box.h;
				const areaB = b.box.w * b.box.h;
				const overlapArea = xOverlap * yOverlap;
				const minArea = Math.min(areaA, areaB);

				// Ignore heavy overlaps (>50% of min area) as duplicate or nested detections
				if (minArea > 0 && overlapArea / minArea > 0.50) {
					continue;
				}

				// Overlap detected! Determine whether vertical or horizontal separation is better.
				if (yOverlap <= xOverlap) {
					// Vertical collision resolution
					const top = a.box.y <= b.box.y ? a : b;
					const bot = a.box.y <= b.box.y ? b : a;

					const shift = Math.ceil((yOverlap + margin) / 2);
					top.box.h = Math.max(10, top.box.h - shift);
					bot.box.y = bot.box.y + shift;
					bot.box.h = Math.max(10, bot.box.h - shift);
				} else {
					// Horizontal collision resolution
					const left = a.box.x <= b.box.x ? a : b;
					const right = a.box.x <= b.box.x ? b : a;

					const shift = Math.ceil((xOverlap + margin) / 2);
					left.box.w = Math.max(10, left.box.w - shift);
					right.box.x = right.box.x + shift;
					right.box.w = Math.max(10, right.box.w - shift);
				}
			}
		}
	}

	return adjusted;
}

export async function typesetPage(cleanedPng: Buffer, regions: TypesetRegion[], opts: TypesetOptions = {}): Promise<Buffer> {
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

	const adjustedRegions = regions.map((r) => {
		const rawText = sanitizeForFont(r.text.trim());
		const isVerticalDialogue =
			(r.vertical || (r.box.h / r.box.w >= 1.6 && r.box.h >= 60)) &&
			!CJK_REGEX.test(rawText);
		if (isVerticalDialogue) {
			const renderW = Math.min(img.width, Math.max(r.box.w, Math.min(Math.round(r.box.h * 0.75), Math.round(r.box.w * 2.5), 160)));
			const renderX = Math.max(0, Math.min(img.width - renderW, Math.round(r.box.x + r.box.w / 2 - renderW / 2)));
			return {
				...r,
				box: {
					...r.box,
					x: renderX,
					w: renderW,
				},
			};
		}
		return r;
	});

	const decollided = decollideRegions(adjustedRegions);

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

		// STANDARD PATH — unified natural multi-line wrapping
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
		const maxW = Math.max(10, w * (1 - 2 * inset));
		const maxH = Math.max(10, h * (1 - 2 * inset));

		const sizeCap = Math.max(100, Math.max(w, h)) * scale;
		const size = fitFontSize(ctx, text, font, w, h, sizeCap, sizeCap, inset);

		ctx.font = fontSpec(size, font, text, fontCjk);
		const lines = reflowText(ctx, text, maxW);
		const lineH = size * LINE_HEIGHT;
		const totalH = lines.length * lineH;

		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		
		// High-contrast stroke + shadow for maximum legibility on comics and floating captions
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
			// standard
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
				if (strokeWidth > 0) {
					ctx.shadowColor = isDarkStroke ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
					ctx.shadowBlur = Math.max(2.5, size * 0.18);
					ctx.shadowOffsetX = isDarkStroke ? 1.0 : 0;
					ctx.shadowOffsetY = isDarkStroke ? 1.5 : 0;
					ctx.strokeText(line, 0, ty);
				}

				ctx.shadowColor = 'transparent';
				ctx.shadowBlur = 0;
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 0;
				ctx.fillText(line, 0, ty);
				ty += lineH;
			}
		} else {
			const tx = x + w / 2;
			let ty = y + (h - totalH) / 2 + size * 0.85;
			for (const line of lines) {
				if (strokeWidth > 0) {
					ctx.shadowColor = isDarkStroke ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
					ctx.shadowBlur = Math.max(2.5, size * 0.18);
					ctx.shadowOffsetX = isDarkStroke ? 1.0 : 0;
					ctx.shadowOffsetY = isDarkStroke ? 1.5 : 0;
					ctx.strokeText(line, tx, ty);
				}

				ctx.shadowColor = 'transparent';
				ctx.shadowBlur = 0;
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 0;
				ctx.fillText(line, tx, ty);
				ty += lineH;
			}
		}
		ctx.restore();
	}
	return await canvas.encode('webp', 90);
}

export function sampleBackground(
	source: SKRSContext2D | Image,
	x: number,
	y: number,
	w: number,
	h: number,
): { r: number; g: number; b: number } {
	const srcW = 'canvas' in source ? source.canvas.width : source.width;
	const srcH = 'canvas' in source ? source.canvas.height : source.height;

	const sx = Math.max(0, Math.floor(x + w * 0.2));
	const sy = Math.max(0, Math.floor(y + h * 0.2));
	const ex = Math.min(srcW, Math.ceil(x + w * 0.8));
	const ey = Math.min(srcH, Math.ceil(y + h * 0.8));
	const cw = ex - sx;
	const ch = ey - sy;
	if (cw < 4 || ch < 4) return { r: 255, g: 255, b: 255 };

	let data: Uint8ClampedArray;
	if ('getImageData' in source) {
		// Fast path: sample directly from the existing canvas context without allocating a new Skia canvas
		data = source.getImageData(sx, sy, cw, ch).data;
	} else {
		const probe = createCanvas(cw, ch);
		const pctx = probe.getContext('2d');
		pctx.drawImage(source, sx, sy, cw, ch, 0, 0, cw, ch);
		data = pctx.getImageData(0, 0, cw, ch).data;
	}

	let r = 0;
	let g = 0;
	let b = 0;
	const n = cw * ch;
	for (let i = 0; i < data.length; i += 4) {
		r += data[i];
		g += data[i + 1];
		b += data[i + 2];
	}
	return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

