// TYPESET FONT REGISTRATION, CJK DETECTION, AND RUN SPLITTING
import { GlobalFonts, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// -- CONSTANTS -- //

export const FONT_DIALOGUE = 'CC Wild Words';
export const FONT_SFX = 'CC Wild Words';
export const FONT_MONO = 'CC Wild Words';
export const FONT_FALLBACK_NAME = 'Friendly Sans';

// MATCHES CJK, DEVANAGARI (HINDI), THAI, CYRILLIC, AND OTHER NON-LATIN COMPLEX SCRIPTS
export const NON_LATIN_SCRIPT_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff]/;
export const CJK_REGEX = NON_LATIN_SCRIPT_REGEX;

export const FONT_FALLBACK = ', "Friendly Sans", "Nirmala UI Bold", "Nirmala UI", "Leelawadee UI Bold", "Leelawadee UI", "Malgun Gothic Bold", "Malgun Gothic", "Yu Gothic Bold", "Yu Gothic", "Microsoft YaHei Bold", "Microsoft YaHei", Arial, "Segoe UI", sans-serif';

// CHARACTERS REMAPPED TO ARROW GLYPHS IN CC WILD WORDS (e.g. [ AND ] ARE COMIC BUBBLE ARROWS)
export const UNSUPPORTED_WILDWORDS_REGEX = /[\[\]{}|\\]/;

export interface TextRun {
	text: string;
	font: string;
	isFallbackSymbol: boolean;
}

export interface TextColor {
	fill: string;
	stroke: string;
}

let fontsRegistered = false;

// -- FUNCTIONS & RESOLUTION -- //

export function resolveFontDir(): string {
	const candidates = [
		// 1. Process cwd relative (standard in production node app where cwd is app root)
		resolve(process.cwd(), 'static/fonts'),
		// 2. Monorepo cwd relative (when running from xianscan-rust root)
		resolve(process.cwd(), 'web/static/fonts'),
		// 3. User AppData standard desktop application paths
		join(process.env.APPDATA || '', 'XianScan', 'app', 'static', 'fonts'),
		join(process.env.APPDATA || '', 'XianScan', 'static', 'fonts'),
		// 4. Source URL relative (Vite / Dev server)
		fileURLToPath(new URL('../../../../static/fonts', import.meta.url)),
		// 5. Build chunks relative (SvelteKit node adapter build)
		fileURLToPath(new URL('../../../static/fonts', import.meta.url)),
		fileURLToPath(new URL('../../static/fonts', import.meta.url)),
		fileURLToPath(new URL('../static/fonts', import.meta.url)),
		// 6. Build client asset directories
		resolve(process.cwd(), 'build/client/fonts'),
		resolve(process.cwd(), 'client/fonts')
	];

	for (const dir of candidates) {
		if (existsSync(join(dir, 'CCWildWords-Roman.ttf')) && existsSync(join(dir, 'FriendlySans-Regular.ttf'))) {
			return dir;
		}
	}

	return candidates[0];
}

export function registerFonts(): void {
	if (fontsRegistered) return;
	const fontDir = resolveFontDir();
	GlobalFonts.registerFromPath(join(fontDir, 'CCWildWords-Roman.ttf'), FONT_DIALOGUE);
	GlobalFonts.registerFromPath(join(fontDir, 'FriendlySans-Regular.ttf'), FONT_FALLBACK_NAME);
	try {
		if (process.platform === 'win32') {
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arial.ttf', 'Arial');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\arialbd.ttf', 'Arial Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\segoeui.ttf', 'Segoe UI');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\segoeuib.ttf', 'Segoe UI Bold');
			// Indic & Devanagari (Hindi, Marathi, Nepali, Sanskrit)
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\Nirmala.ttc', 'Nirmala UI');
			// Thai (Thai Webtoons)
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\LeelaUIb.ttf', 'Leelawadee UI Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\LeelawUI.ttf', 'Leelawadee UI');
			// Korean (Hangul)
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\malgunbd.ttf', 'Malgun Gothic Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\malgun.ttf', 'Malgun Gothic');
			// Japanese (Kanji, Hiragana, Katakana)
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\YuGothB.ttc', 'Yu Gothic Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\YuGothM.ttc', 'Yu Gothic');
			// Chinese (Simplified & Traditional)
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\msyhbd.ttc', 'Microsoft YaHei Bold');
			GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\msyh.ttc', 'Microsoft YaHei');
		}
	} catch {
		// FALLBACK TO SKIA SYSTEM FONT RESOLUTION
	}
	if (!GlobalFonts.has(FONT_DIALOGUE) || !GlobalFonts.has(FONT_FALLBACK_NAME)) {
		fontsRegistered = false;
		throw new Error(`typeset fonts not found in ${fontDir} — run the font download step`);
	}
	fontsRegistered = true;
}

/**
 * SPLITS A STRING INTO RUNS SO COMPATIBLE CHARACTERS STAY IN PRIMARY DIALOGUE FONT (e.g. CC WILD WORDS)
 * WHILE NON-LATIN CHARACTERS (HANGUL, CJK, DEVANAGARI, THAI, ETC.) AND UNMATCHED/REMAPPED SYMBOLS
 * (e.g. [ ], { }, |, \) USE THE DESIGNATED FALLBACK / CJK FONT STACK.
 */
export function splitTextRuns(text: string, primaryFont?: string, fallbackFont?: string): TextRun[] {
	const fontMain = primaryFont || FONT_DIALOGUE;
	const fontFb = fallbackFont || FONT_FALLBACK_NAME;

	if (fontMain === fontFb) {
		return [{ text, font: fontMain, isFallbackSymbol: false }];
	}

	// MATCHES ANY NON-LATIN SCRIPT CHUNKS OR CC WILD WORDS REMAPPED SYMBOLS ([ ], { }, |, \)
	const fallbackCharsRegex = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff]+|[\[\]{}|\\]+)/g;

	if (!fallbackCharsRegex.test(text)) {
		return [{ text, font: fontMain, isFallbackSymbol: false }];
	}

	fallbackCharsRegex.lastIndex = 0;
	const rawRuns: TextRun[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = fallbackCharsRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = fallbackCharsRegex.lastIndex;

		if (matchStart > lastIndex) {
			const slice = text.slice(lastIndex, matchStart);
			// IF SLICE IS PURE WHITESPACE BETWEEN TWO FALLBACK MATCHES, KEEP IT IN FALLBACK FONT
			if (slice.trim() === '' && rawRuns.length > 0 && rawRuns[rawRuns.length - 1].isFallbackSymbol) {
				rawRuns.push({ text: slice, font: fontFb, isFallbackSymbol: true });
			} else {
				rawRuns.push({ text: slice, font: fontMain, isFallbackSymbol: false });
			}
		}

		rawRuns.push({ text: match[0], font: fontFb, isFallbackSymbol: true });
		lastIndex = matchEnd;
	}

	if (lastIndex < text.length) {
		rawRuns.push({ text: text.slice(lastIndex), font: fontMain, isFallbackSymbol: false });
	}

	// MERGE CONSECUTIVE RUNS OF THE SAME FONT AND SYMBOL TYPE
	const merged: TextRun[] = [];
	for (const run of rawRuns) {
		if (!run.text) continue;
		const prev = merged[merged.length - 1];
		if (prev && prev.font === run.font && prev.isFallbackSymbol === run.isFallbackSymbol) {
			prev.text += run.text;
		} else {
			merged.push({ ...run });
		}
	}

	return merged.length > 0 ? merged : [{ text, font: fontMain, isFallbackSymbol: false }];
}

export function fontFor(text?: string, customDialogue?: string, customCjk?: string): string {
	const fontDialogue = customDialogue || FONT_DIALOGUE;
	const fontCjk = customCjk || FONT_FALLBACK_NAME;
	if (!text) return fontDialogue;
	// IF TEXT CONTAINS LATIN CHARACTERS ALONGSIDE NON-LATIN SCRIPTS, USE DIALOGUE FONT AS PRIMARY
	// (RUN SPLITTING WILL ROUTE THE NON-LATIN/CJK WORDS TO FONT_CJK)
	if (/[a-zA-Z]/.test(text)) {
		return fontDialogue;
	}
	// PURELY NON-LATIN (CJK / HANGUL / DEVANAGARI)
	if (NON_LATIN_SCRIPT_REGEX.test(text)) {
		return fontCjk;
	}
	return fontDialogue;
}

export function fontSpec(size: number, fontNameOrText?: string, text?: string, customCjk?: string): string {
	let fontName: string;
	if (fontNameOrText && fontNameOrText !== FONT_DIALOGUE && fontNameOrText !== FONT_FALLBACK_NAME && fontNameOrText !== customCjk) {
		fontName = fontNameOrText;
	} else if (text && NON_LATIN_SCRIPT_REGEX.test(text) && !/[a-zA-Z]/.test(text)) {
		fontName = customCjk || FONT_FALLBACK_NAME;
	} else {
		fontName = fontNameOrText ?? FONT_DIALOGUE;
	}
	if (fontName === (customCjk || FONT_FALLBACK_NAME)) {
		return `bold ${size}px "${fontName}", "${FONT_FALLBACK_NAME}", "Nirmala UI Bold", "Nirmala UI", "Leelawadee UI Bold", "Leelawadee UI", "Malgun Gothic Bold", "Malgun Gothic", "Yu Gothic Bold", "Yu Gothic", "Microsoft YaHei Bold", "Microsoft YaHei", Arial, "Segoe UI", sans-serif`;
	}
	return `${size}px "${fontName}"${FONT_FALLBACK}`;
}

export function measureTextWithRuns(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	size: number,
	primaryFont?: string,
	fallbackFont?: string,
	customCjk?: string,
): number {
	const runs = splitTextRuns(text, primaryFont, fallbackFont);
	if (runs.length === 1 && !runs[0].isFallbackSymbol) {
		ctx.font = fontSpec(size, runs[0].font, text, customCjk);
		return ctx.measureText(text).width;
	}
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk);
		totalW += ctx.measureText(run.text).width;
	}
	return totalW;
}

export function drawTextLineWithRuns(
	ctx: SKRSContext2D | CanvasRenderingContext2D,
	line: string,
	centerX: number,
	y: number,
	size: number,
	primaryFont: string,
	fallbackFont: string,
	textColor: TextColor,
	strokeWidth: number,
	isDarkStroke: boolean,
	customCjk?: string,
	align: 'center' | 'left' = 'center',
): void {
	const runs = splitTextRuns(line, primaryFont, fallbackFont);
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk);
		totalW += ctx.measureText(run.text).width;
	}

	let curX = align === 'center' ? centerX - totalW / 2 : centerX;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk);
		if (strokeWidth > 0) {
			ctx.lineWidth = strokeWidth;
			ctx.lineJoin = 'round';
			ctx.strokeStyle = textColor.stroke;
			ctx.shadowColor = isDarkStroke ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
			ctx.shadowBlur = Math.max(2.5, size * 0.18);
			ctx.shadowOffsetX = isDarkStroke ? 1.0 : 0;
			ctx.shadowOffsetY = isDarkStroke ? 1.5 : 0;
			ctx.strokeText(run.text, curX, y);
		}

		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.fillStyle = textColor.fill;
		ctx.fillText(run.text, curX, y);

		curX += ctx.measureText(run.text).width;
	}
}
