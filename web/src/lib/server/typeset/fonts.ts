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
export const FONT_DEFAULT_CJK = 'WenQuanYi Micro Hei';

// MATCHES CJK, DEVANAGARI (HINDI), THAI, CYRILLIC, FULLWIDTH / CJK PUNCTUATION, GUILLEMETS, AND OTHER NON-LATIN COMPLEX SCRIPTS
export const NON_LATIN_SCRIPT_REGEX = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff\uff01-\uffee\u3000-\u303f\u00ab\u00bb\u2018-\u201f\u2039\u203a]/;
export const CJK_REGEX = NON_LATIN_SCRIPT_REGEX;

export const CJK_FONT_STACK = '"Microsoft YaHei Bold", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Yu Gothic Bold", "Yu Gothic", "Malgun Gothic Bold", "Malgun Gothic", "PingFang SC", "PingFang TC", "WenQuanYi Zen Hei", "Nirmala UI Bold", "Nirmala UI", "Leelawadee UI Bold", "Leelawadee UI", "Friendly Sans", Arial, "Segoe UI", sans-serif';

export const FONT_FALLBACK = `, ${CJK_FONT_STACK}`;

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

function tryRegisterFont(fontPath: string, fontName?: string): boolean {
	try {
		if (!existsSync(fontPath)) return false;
		if (fontName) {
			GlobalFonts.registerFromPath(fontPath, fontName);
		} else {
			GlobalFonts.registerFromPath(fontPath);
		}
		return true;
	} catch {
		return false;
	}
}

export function registerFonts(): void {
	if (fontsRegistered) return;
	const fontDir = resolveFontDir();
	tryRegisterFont(join(fontDir, 'CCWildWords-Roman.ttf'), FONT_DIALOGUE);
	tryRegisterFont(join(fontDir, 'FriendlySans-Regular.ttf'), FONT_FALLBACK_NAME);
	tryRegisterFont(join(fontDir, 'GeneralSans-Bold.ttf'), 'General Sans Bold');
	tryRegisterFont(join(fontDir, 'GeneralSans-Regular.ttf'), 'General Sans');
	tryRegisterFont(join(fontDir, 'Poppins-Bold.ttf'), 'Poppins Bold');
	tryRegisterFont(join(fontDir, 'Poppins-Bold.ttf'), 'Poppins');
	tryRegisterFont(join(fontDir, 'Montserrat-Bold.ttf'), 'Montserrat Bold');
	tryRegisterFont(join(fontDir, 'Montserrat-Bold.ttf'), 'Montserrat');
	tryRegisterFont(join(fontDir, 'Lexend-Bold.ttf'), 'Lexend Bold');
	tryRegisterFont(join(fontDir, 'Lexend-Bold.ttf'), 'Lexend');
	tryRegisterFont(join(fontDir, 'wqy-microhei.ttc'), 'WenQuanYi Micro Hei');
	tryRegisterFont(join(fontDir, 'wqy-microhei.ttc'), 'WenQuanYi Micro Hei Bold');

	// PLATFORM SYSTEM FONTS (WINDOWS, LINUX, MACOS)
	if (process.platform === 'win32') {
		const winFontDir = 'C:\\Windows\\Fonts';
		// Standard Western
		tryRegisterFont(join(winFontDir, 'arial.ttf'), 'Arial');
		tryRegisterFont(join(winFontDir, 'arialbd.ttf'), 'Arial Bold');
		tryRegisterFont(join(winFontDir, 'segoeui.ttf'), 'Segoe UI');
		tryRegisterFont(join(winFontDir, 'segoeuib.ttf'), 'Segoe UI Bold');
		// Chinese (Simplified & Traditional)
		tryRegisterFont(join(winFontDir, 'msyhbd.ttc'), 'Microsoft YaHei Bold');
		tryRegisterFont(join(winFontDir, 'msyh.ttc'), 'Microsoft YaHei');
		tryRegisterFont(join(winFontDir, 'simhei.ttf'), 'SimHei');
		tryRegisterFont(join(winFontDir, 'simsun.ttc'), 'SimSun');
		tryRegisterFont(join(winFontDir, 'msjh.ttc'), 'Microsoft JhengHei');
		tryRegisterFont(join(winFontDir, 'msjhbd.ttc'), 'Microsoft JhengHei Bold');
		// Japanese (Kanji, Hiragana, Katakana)
		tryRegisterFont(join(winFontDir, 'YuGothB.ttc'), 'Yu Gothic Bold');
		tryRegisterFont(join(winFontDir, 'YuGothM.ttc'), 'Yu Gothic');
		tryRegisterFont(join(winFontDir, 'msgothic.ttc'), 'MS Gothic');
		tryRegisterFont(join(winFontDir, 'meiryo.ttc'), 'Meiryo');
		// Korean (Hangul)
		tryRegisterFont(join(winFontDir, 'malgunbd.ttf'), 'Malgun Gothic Bold');
		tryRegisterFont(join(winFontDir, 'malgun.ttf'), 'Malgun Gothic');
		tryRegisterFont(join(winFontDir, 'gulim.ttc'), 'Gulim');
		// Indic & Devanagari (Hindi, Marathi, Nepali, Sanskrit)
		tryRegisterFont(join(winFontDir, 'Nirmala.ttc'), 'Nirmala UI');
		// Thai (Thai Webtoons)
		tryRegisterFont(join(winFontDir, 'LeelaUIb.ttf'), 'Leelawadee UI Bold');
		tryRegisterFont(join(winFontDir, 'LeelawUI.ttf'), 'Leelawadee UI');
	} else if (process.platform === 'linux') {
		// Linux Font Paths (Debian/Ubuntu, Arch, RHEL, Alpine, EC2)
		const linuxFonts = [
			['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'],
			['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 'Noto Sans CJK SC Bold'],
			['/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'],
			['/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', 'WenQuanYi Micro Hei'],
			['/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 'WenQuanYi Zen Hei'],
			['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
			['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVu Sans Bold'],
			['/usr/share/fonts/truetype/freefont/FreeSans.ttf', 'FreeSans'],
		];
		for (const [fontPath, alias] of linuxFonts) {
			tryRegisterFont(fontPath, alias);
		}
	} else if (process.platform === 'darwin') {
		// macOS Font Paths
		const macFonts = [
			['/System/Library/Fonts/PingFang.ttc', 'PingFang SC'],
			['/System/Library/Fonts/Hiragino Sans GB.ttc', 'Hiragino Sans GB'],
			['/System/Library/Fonts/AppleSDGothicNeo.ttc', 'Apple SD Gothic Neo'],
			['/Library/Fonts/Arial Unicode.ttf', 'Arial Unicode MS'],
		];
		for (const [fontPath, alias] of macFonts) {
			tryRegisterFont(fontPath, alias);
		}
	}

	if (!GlobalFonts.has(FONT_DIALOGUE) && !GlobalFonts.has(FONT_FALLBACK_NAME)) {
		fontsRegistered = false;
		throw new Error(`typeset fonts not found in ${fontDir} : run the font download step`);
	}
	fontsRegistered = true;
}

export interface FontAvailabilityItem {
	available: boolean;
	bundled: boolean;
	note: string;
}

/**
 * DETECTS AND RETURNS AVAILABILITY STATUS FOR ALL SUPPORTED DIALOGUE & CJK FONTS
 */
export function getFontAvailability(): Record<string, FontAvailabilityItem> {
	registerFonts();
	const fontMeta: Record<string, { bundled: boolean; note: string }> = {
		'CC Wild Words': { bundled: true, note: 'Bundled comic dialogue font' },
		'Friendly Sans': { bundled: true, note: 'Bundled clean Latin / symbol fallback' },
		'General Sans': { bundled: true, note: 'Bundled clean modern sans' },
		'Poppins': { bundled: true, note: 'Bundled geometric rounded' },
		'Montserrat': { bundled: true, note: 'Bundled bold contemporary' },
		'Lexend': { bundled: true, note: 'Bundled high legibility' },
		'WenQuanYi Micro Hei': { bundled: true, note: 'Bundled universal CJK engine' },
		'Microsoft YaHei': { bundled: false, note: 'Windows Chinese font' },
		'Yu Gothic': { bundled: false, note: 'Windows Japanese font' },
		'Malgun Gothic': { bundled: false, note: 'Windows Korean font' },
		'Noto Sans CJK SC': { bundled: false, note: 'Linux / Open Source Noto CJK package' },
		'PingFang SC': { bundled: false, note: 'macOS Chinese font' },
		'Proxima Nova': { bundled: false, note: 'Proprietary font (requires local install)' },
	};

	const result: Record<string, FontAvailabilityItem> = {};
	for (const [name, meta] of Object.entries(fontMeta)) {
		const isAvail = meta.bundled || GlobalFonts.has(name);
		result[name] = {
			available: isAvail,
			bundled: meta.bundled,
			note: meta.note,
		};
	}

	return result;
}

/**
 * AUTOMATICALLY RESOLVES THE MOST APPROPRIATE CJK / NON-LATIN SCRIPT FONT FAMILY FOR GIVEN TEXT
 */
export function resolveScriptFont(text?: string, customCjk?: string): string {
	registerFonts();

	if (customCjk && customCjk !== FONT_FALLBACK_NAME && customCjk !== FONT_DIALOGUE) {
		return customCjk;
	}
	if (!text) {
		if (GlobalFonts.has(FONT_DEFAULT_CJK)) return FONT_DEFAULT_CJK;
		if (GlobalFonts.has('WenQuanYi Micro Hei')) return 'WenQuanYi Micro Hei';
		return FONT_FALLBACK_NAME;
	}

	// KOREAN HANGUL
	if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(text)) {
		if (GlobalFonts.has('Malgun Gothic')) return 'Malgun Gothic';
		if (GlobalFonts.has('WenQuanYi Micro Hei')) return 'WenQuanYi Micro Hei';
		return 'Malgun Gothic';
	}
	// JAPANESE KANA
	if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(text)) {
		if (GlobalFonts.has('Yu Gothic')) return 'Yu Gothic';
		if (GlobalFonts.has('WenQuanYi Micro Hei')) return 'WenQuanYi Micro Hei';
		return 'Yu Gothic';
	}
	// THAI
	if (/[\u0e00-\u0e7f]/.test(text)) {
		if (GlobalFonts.has('Leelawadee UI')) return 'Leelawadee UI';
		return 'Leelawadee UI';
	}
	// DEVANAGARI (HINDI)
	if (/[\u0900-\u097f]/.test(text)) {
		if (GlobalFonts.has('Nirmala UI')) return 'Nirmala UI';
		return 'Nirmala UI';
	}
	// CYRILLIC
	if (/[\u0400-\u04ff]/.test(text)) {
		if (GlobalFonts.has('Arial')) return 'Arial';
		return 'Arial';
	}
	// CHINESE HANZI & DEFAULT CJK
	if (GlobalFonts.has('Microsoft YaHei')) return 'Microsoft YaHei';
	if (GlobalFonts.has('Noto Sans CJK SC')) return 'Noto Sans CJK SC';
	if (GlobalFonts.has('WenQuanYi Micro Hei')) return 'WenQuanYi Micro Hei';
	if (GlobalFonts.has('PingFang SC')) return 'PingFang SC';

	return FONT_DEFAULT_CJK;
}

/**
 * SPLITS A STRING INTO RUNS SO COMPATIBLE CHARACTERS STAY IN PRIMARY DIALOGUE FONT (e.g. CC WILD WORDS)
 * WHILE NON-LATIN CHARACTERS (HANGUL, CJK, DEVANAGARI, THAI, ETC.) AND UNMATCHED/REMAPPED SYMBOLS
 * USE THE DESIGNATED SCRIPT-AWARE FALLBACK / CJK FONT STACK.
 */
export function splitTextRuns(text: string, primaryFont?: string, fallbackFont?: string): TextRun[] {
	const fontMain = primaryFont || FONT_DIALOGUE;

	// CC WILD WORDS DOES NOT CONTAIN ACCENTED LATIN GLYPHS (À-ÿ, Ā-ž) OR REMAPPED COMIC BRACKETS
	const isWildWords = fontMain === FONT_DIALOGUE || fontMain.toLowerCase().includes('wild words');

	// MATCHES NON-LATIN SCRIPTS, CJK / FULLWIDTH PUNCTUATION, REMAPPED SYMBOLS ([ ], { }, |, \), AND EXTENDED LATIN (IF WILD WORDS)
	const fallbackCharsRegex = isWildWords
		? /([\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff\uff01-\uffee\u3000-\u303f\u00ab\u00bb\u2018-\u201f\u2039\u203a]+|[\[\]{}|\\]+|[\u00C0-\u024F\u00A1\u00BF]+)/g
		: /([\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u0900-\u097f\u0e00-\u0e7f\u0400-\u04ff\uff01-\uffee\u3000-\u303f\u00ab\u00bb\u2018-\u201f\u2039\u203a]+|[\[\]{}|\\]+)/g;

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
		const matchedStr = match[0];

		const chunkFont = fallbackFont
			? fallbackFont
			: (NON_LATIN_SCRIPT_REGEX.test(matchedStr) ? resolveScriptFont(matchedStr) : FONT_FALLBACK_NAME);

		if (matchStart > lastIndex) {
			const slice = text.slice(lastIndex, matchStart);
			// IF SLICE IS PURE WHITESPACE BETWEEN TWO FALLBACK MATCHES, KEEP IT IN FALLBACK FONT
			if (slice.trim() === '' && rawRuns.length > 0 && rawRuns[rawRuns.length - 1].isFallbackSymbol) {
				rawRuns.push({ text: slice, font: chunkFont, isFallbackSymbol: true });
			} else {
				rawRuns.push({ text: slice, font: fontMain, isFallbackSymbol: false });
			}
		}

		rawRuns.push({ text: matchedStr, font: chunkFont, isFallbackSymbol: true });
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
	if (!text) return fontDialogue;
	// IF TEXT CONTAINS LATIN CHARACTERS ALONGSIDE NON-LATIN SCRIPTS, USE DIALOGUE FONT AS PRIMARY
	// (RUN SPLITTING WILL ROUTE THE NON-LATIN/CJK WORDS TO SCRIPT FONT)
	if (/[a-zA-Z]/.test(text)) {
		return fontDialogue;
	}
	// PURELY NON-LATIN (CJK / HANGUL / DEVANAGARI / THAI)
	if (NON_LATIN_SCRIPT_REGEX.test(text)) {
		return customCjk || resolveScriptFont(text);
	}
	return fontDialogue;
}

export function fontSpec(size: number, fontNameOrText?: string, text?: string, customCjk?: string): string {
	const isPureNonLatin = Boolean(text && NON_LATIN_SCRIPT_REGEX.test(text) && !/[a-zA-Z]/.test(text));
	const isNonLatinFont = fontNameOrText && fontNameOrText !== FONT_DIALOGUE && fontNameOrText !== FONT_FALLBACK_NAME;

	if (isPureNonLatin || isNonLatinFont) {
		const cjkPrimary = fontNameOrText && fontNameOrText !== FONT_DIALOGUE && fontNameOrText !== FONT_FALLBACK_NAME
			? fontNameOrText
			: resolveScriptFont(text, customCjk);
		return `bold ${size}px "${cjkPrimary}", ${CJK_FONT_STACK}`;
	}

	const fontName = fontNameOrText ?? FONT_DIALOGUE;
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

