// TYPESET FONT REGISTRATION, CJK DETECTION, AND RUN SPLITTING
// IMPORTED DEP-TYPES
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
// IMPORTED DEP-MODULES
import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { db as defaultDb } from '../db';
import { customFonts, customFontFiles } from '../db/schema';
import { DATA_ROOT } from '../paths';
import { JOINER_REGEX, SCRIPT_RANGES, dominantScript, scriptOfChar } from '$lib/typeset-scripts';
import { buildScriptFontChain, fontStackString, textFontStack, type ScriptFontContext } from './script-fonts';
import { familyCovers, invalidateCoverageCache, registerCoverageSource } from './coverage';
import { parseFontBuffer, readCmapCoverage, scriptsCoveredBy, splitFontCollection } from './font-parser';
import { BUNDLED_FONT_FILES, bundledFontFileFor, isBundledFontFamily } from './bundled-families';
import type { ScriptFontSlot } from '$lib/typeset-scripts';
import type { Script } from '$lib/languages';

// -- CONSTANTS -- //

export const FONT_DIALOGUE = 'CC Wild Words';
export const FONT_SFX = 'CC Wild Words';
export const FONT_MONO = 'CC Wild Words';
export const FONT_FALLBACK_NAME = 'Friendly Sans';
export const FONT_DEFAULT_CJK = 'WenQuanYi Micro Hei';

/** THE BUNDLED FONT THAT RENDERS EACH SCRIPT ON EVERY PLATFORM (DOCKER INCLUDED) WHEN NOTHING BETTER IS SET. */
export const BUNDLED_SCRIPT_FONTS: Partial<Record<ScriptFontSlot, string>> = {
	han: 'WenQuanYi Micro Hei',
	kana: 'WenQuanYi Micro Hei',
	hangul: 'WenQuanYi Micro Hei',
	cyrillic: 'WenQuanYi Micro Hei',
	devanagari: 'Noto Sans Devanagari',
	thai: 'Noto Sans Thai',
	arabic: 'Tajawal',
};

/**
 * SCRIPT COVERAGE OF EVERY BUNDLED FAMILY (AND ITS ALIASES), READ FROM THE FONT FILES' cmap WHEN THEY ARE
 * REGISTERED, SO IT CAN NEVER DRIFT FROM THE FILES THEMSELVES. familyCovers CONSULTS IT BEFORE ANY PROBE.
 */
export const BUNDLED_COVERAGE = new Map<string, Script[]>();

registerCoverageSource((family, script) => BUNDLED_COVERAGE.get(family.toLowerCase())?.includes(script));

/** SCRIPTS OF EACH USER-UPLOADED FAMILY, FROM THE custom_fonts.scripts COLUMN (FEAT-006 PHASE 8). */
export const CUSTOM_COVERAGE = new Map<string, Script[]>();
registerCoverageSource((family, script) => {
	const scripts = CUSTOM_COVERAGE.get(family.toLowerCase());
	return scripts && scripts.length > 0 ? scripts.includes(script) : undefined;
});

/** EVERY SCRIPT THE COVERAGE ENGINE CAN ANSWER FOR (LATIN PLUS THE SLOT SCRIPTS). */
const ALL_SCRIPTS: Script[] = ['latin', 'han', 'kana', 'hangul', 'devanagari', 'thai', 'arabic', 'cyrillic', 'greek', 'hebrew', 'bengali', 'tamil'];

// BUILT FROM THE SHARED SCRIPT RANGES (typeset-scripts.ts) SO EVERY CALLER AGREES ON WHAT EACH SCRIPT IS.
const anyOf = (...parts: RegExp[]) => new RegExp(parts.map((r) => `(?:${r.source})`).join('|'), 'u');
// CJK, DEVANAGARI (HINDI), THAI, CYRILLIC, FULLWIDTH / CJK PUNCTUATION, GUILLEMETS AND SMART QUOTES. ARABIC IS
// DELIBERATELY NOT HERE YET: IT JOINS BEHIND THE SINGLE-RUN RTL GUARD (FEAT-006 PHASE 5, ADR-007).
export const NON_LATIN_SCRIPT_REGEX = anyOf(
	SCRIPT_RANGES.han,
	SCRIPT_RANGES.kana,
	SCRIPT_RANGES.hangul,
	SCRIPT_RANGES.devanagari,
	SCRIPT_RANGES.thai,
	SCRIPT_RANGES.cyrillic,
	/[\u00ab\u00bb\u2018-\u201f\u2039\u203a]/u,
);
// STRICT CJK: CHINESE HANZI, JAPANESE KANA / KANJI, KOREAN HANGUL, AND FULLWIDTH / CJK PUNCTUATION
export const CJK_REGEX = anyOf(SCRIPT_RANGES.han, SCRIPT_RANGES.kana, SCRIPT_RANGES.hangul);

export const CJK_FONT_STACK = '"Microsoft YaHei Bold", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Yu Gothic Bold", "Yu Gothic", "Malgun Gothic Bold", "Malgun Gothic", "PingFang SC", "PingFang TC", "WenQuanYi Zen Hei", "Nirmala UI Bold", "Nirmala UI", "Leelawadee UI Bold", "Leelawadee UI", "Friendly Sans", Arial, "Segoe UI", sans-serif';

export const FONT_FALLBACK = `, ${CJK_FONT_STACK}`;

// CHARACTERS REMAPPED TO ARROW GLYPHS IN CC WILD WORDS (e.g. [ AND ] ARE COMIC BUBBLE ARROWS)
export const UNSUPPORTED_WILDWORDS_REGEX = /[\[\]{}|\\]/;

export interface TextRun {
	text: string;
	font: string;
	isFallbackSymbol: boolean;
	/** SCRIPT OF THIS RUN (SCRIPT-AWARE PATH ONLY). */
	script?: Script;
	/** FONT FAMILIES TO DRAW THIS RUN WITH, BEST FIRST (SCRIPT-AWARE PATH ONLY). */
	stack?: string[];
}

export interface TextColor {
	fill: string;
	stroke: string;
}

let fontsRegistered = false;
let customFontsRegistered = false;

export function invalidateCustomFontsCache(): void {
	customFontsRegistered = false;
	invalidateCoverageCache();
}

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

/** WINDOWS FONT FILES TO REGISTER EXPLICITLY: [CANDIDATE FILE NAMES (ANY CASE), FAMILY NAME]. */
const WINDOWS_SYSTEM_FONTS: [string[], string][] = [
	// Standard Western
	[['arial.ttf'], 'Arial'],
	[['arialbd.ttf'], 'Arial Bold'],
	[['segoeui.ttf'], 'Segoe UI'],
	[['segoeuib.ttf'], 'Segoe UI Bold'],
	[['tahoma.ttf'], 'Tahoma'],
	// Chinese (Simplified & Traditional)
	[['msyhbd.ttc', 'msyhbd.ttf'], 'Microsoft YaHei Bold'],
	[['msyh.ttc', 'msyh.ttf'], 'Microsoft YaHei'],
	[['simhei.ttf'], 'SimHei'],
	[['simsun.ttc'], 'SimSun'],
	[['msjh.ttc', 'msjh.ttf'], 'Microsoft JhengHei'],
	[['msjhbd.ttc', 'msjhbd.ttf'], 'Microsoft JhengHei Bold'],
	// Japanese (Kanji, Hiragana, Katakana)
	[['YuGothB.ttc'], 'Yu Gothic Bold'],
	[['YuGothM.ttc'], 'Yu Gothic'],
	[['msgothic.ttc'], 'MS Gothic'],
	[['meiryo.ttc'], 'Meiryo'],
	// Korean (Hangul)
	[['malgunbd.ttf'], 'Malgun Gothic Bold'],
	[['malgun.ttf'], 'Malgun Gothic'],
	[['gulim.ttc'], 'Gulim'],
	// Indic & Devanagari (Hindi, Marathi, Nepali, Sanskrit)
	[['Nirmala.ttc', 'Nirmala.ttf'], 'Nirmala UI'],
	[['NirmalaB.ttf'], 'Nirmala UI Bold'],
	[['mangal.ttf'], 'Mangal'],
	[['mangalb.ttf'], 'Mangal Bold'],
	// Thai (Thai Webtoons)
	[['LeelaUIb.ttf'], 'Leelawadee UI Bold'],
	[['LeelawUI.ttf'], 'Leelawadee UI'],
	[['LEELAWAD.TTF'], 'Leelawadee'],
];

// LOWERCASE FILE NAME -> ACTUAL FILE NAME, BUILT ONCE PER DIRECTORY
const dirIndexCache = new Map<string, Map<string, string>>();

/** CASE-INSENSITIVE LISTING OF A FONT DIRECTORY (EMPTY WHEN IT CANNOT BE READ). */
export function fontDirIndex(dir: string, readdir: (dir: string) => string[] = readdirSync): Map<string, string> {
	const cached = dirIndexCache.get(dir);
	if (cached) return cached;
	const index = new Map<string, string>();
	try {
		for (const name of readdir(dir)) index.set(name.toLowerCase(), name);
	} catch {
		// MISSING OR UNREADABLE DIRECTORY
	}
	dirIndexCache.set(dir, index);
	return index;
}

/** REGISTERS THE FIRST OF `fileNames` PRESENT IN `dir` (ANY CASE) UNDER `family`. */
export function registerFirstExisting(dir: string, fileNames: string[], family: string): boolean {
	const index = fontDirIndex(dir);
	for (const name of fileNames) {
		const actual = index.get(name.toLowerCase());
		if (actual && tryRegisterFont(join(dir, actual), family)) return true;
	}
	return false;
}

export function registerFonts(db: any = defaultDb): void {
	registerCustomFonts(db);
	if (fontsRegistered) return;
	const fontDir = resolveFontDir();
	tryRegisterFont(join(fontDir, 'CCWildWords-Roman.ttf'), FONT_DIALOGUE);
	tryRegisterFont(join(fontDir, 'FriendlySans-Regular.ttf'), FONT_FALLBACK_NAME);
	tryRegisterFont(join(fontDir, 'GeneralSans-Regular.ttf'), 'General Sans');
	tryRegisterFont(join(fontDir, 'GeneralSans-Bold.ttf'), 'General Sans');
	tryRegisterFont(join(fontDir, 'GeneralSans-Bold.ttf'), 'General Sans Bold');
	tryRegisterFont(join(fontDir, 'Poppins-Bold.ttf'), 'Poppins Bold');
	tryRegisterFont(join(fontDir, 'Poppins-Bold.ttf'), 'Poppins');
	tryRegisterFont(join(fontDir, 'Montserrat-Bold.ttf'), 'Montserrat Bold');
	tryRegisterFont(join(fontDir, 'Montserrat-Bold.ttf'), 'Montserrat');
	tryRegisterFont(join(fontDir, 'Lexend-Bold.ttf'), 'Lexend Bold');
	tryRegisterFont(join(fontDir, 'Lexend-Bold.ttf'), 'Lexend');
	tryRegisterFont(join(fontDir, 'wqy-microhei.ttc'), 'WenQuanYi Micro Hei');
	tryRegisterFont(join(fontDir, 'wqy-microhei.ttc'), 'WenQuanYi Micro Hei Bold');
	// SCRIPT FONTS (FEAT-006 ADR-005 / ADR-006): BOTH WEIGHTS, SO BOLD NON-LATIN TEXT GETS A REAL BOLD FACE
	tryRegisterFont(join(fontDir, 'NotoSansDevanagari-Regular.ttf'), 'Noto Sans Devanagari');
	tryRegisterFont(join(fontDir, 'NotoSansDevanagari-Bold.ttf'), 'Noto Sans Devanagari');
	tryRegisterFont(join(fontDir, 'NotoSansThai-Regular.ttf'), 'Noto Sans Thai');
	tryRegisterFont(join(fontDir, 'NotoSansThai-Bold.ttf'), 'Noto Sans Thai');
	tryRegisterFont(join(fontDir, 'Tajawal-Regular.ttf'), 'Tajawal');
	tryRegisterFont(join(fontDir, 'Tajawal-Bold.ttf'), 'Tajawal');
	recordBundledCoverage(fontDir);

	// PLATFORM SYSTEM FONTS (WINDOWS, LINUX, MACOS)
	if (process.platform === 'win32') {
		const winFontDir = join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'Fonts');
		// FILE NAMES VARY IN CASE BETWEEN WINDOWS VERSIONS (LeelaUIb.ttf, LEELAWAD.TTF): LOOK THEM UP CASE-INSENSITIVELY.
		// THIS ONLY SUPPLEMENTS SKIA'S OWN SYSTEM ENUMERATION (E.G. FOR PER-USER FONTS IT CAN MISS).
		for (const [files, family] of WINDOWS_SYSTEM_FONTS) {
			registerFirstExisting(winFontDir, files, family);
		}
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
			// SCRIPT FONTS (DEBIAN / UBUNTU fonts-noto-core, lohit AND tlwg LAYOUTS); BEST EFFORT, THE BUNDLED FONTS
			// ARE THE GUARANTEE
			['/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf', 'Noto Sans Devanagari'],
			['/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf', 'Noto Sans Devanagari'],
			['/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf', 'Noto Sans Thai'],
			['/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf', 'Noto Sans Thai'],
			['/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
			['/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf', 'Noto Sans Arabic'],
			['/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf', 'Lohit Devanagari'],
			['/usr/share/fonts/truetype/tlwg/Loma.ttf', 'Loma'],
			['/usr/share/fonts/truetype/tlwg/Garuda.ttf', 'Garuda'],
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
			// SCRIPT FONTS; PATHS UNCONFIRMED (VALIDATION M5), A MISSING FILE IS SKIPPED
			['/System/Library/Fonts/Kohinoor.ttc', 'Kohinoor Devanagari'],
			['/System/Library/Fonts/Supplemental/DevanagariMT.ttc', 'Devanagari MT'],
			['/System/Library/Fonts/Supplemental/Thonburi.ttc', 'Thonburi'],
			['/System/Library/Fonts/GeezaPro.ttc', 'Geeza Pro'],
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

	// REGISTER USER-IMPORTED CUSTOM FONTS
	registerCustomFonts(db);
}

/** FILE PER BUNDLED FAMILY NAME (ALIASES SHARE A FILE) USED TO FILL BUNDLED_COVERAGE. */
const BUNDLED_COVERAGE_FILES = BUNDLED_FONT_FILES;

function recordBundledCoverage(fontDir: string): void {
	for (const [file, families] of BUNDLED_COVERAGE_FILES) {
		try {
			const buf = readFileSync(join(fontDir, file));
			const scripts = scriptsCoveredBy(readCmapCoverage(buf, splitFontCollection(buf)[0]));
			for (const family of families) BUNDLED_COVERAGE.set(family.toLowerCase(), scripts);
		} catch {
			// A MISSING BUNDLED FILE IS REPORTED BY REGISTRATION; THE PROBE STILL ANSWERS FOR IT
		}
	}
	invalidateCoverageCache();
}

export function getUserFontsDir(): string {
	const envDataRoot = process.env.DATA_ROOT;
	const candidates = [
		envDataRoot ? join(envDataRoot, 'fonts') : null,
		join(DATA_ROOT, 'fonts'),
		resolve(process.cwd(), 'data/fonts'),
		resolve(process.cwd(), 'web/data/fonts'),
		process.env.APPDATA ? join(process.env.APPDATA, 'XianScan', 'data', 'fonts') : null,
		process.env.APPDATA ? join(process.env.APPDATA, 'XianScan', 'app', 'data', 'fonts') : null,
	].filter((d): d is string => Boolean(d));

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	const primary = candidates[0] || resolve(process.cwd(), 'data/fonts');
	if (!existsSync(primary)) {
		try {
			mkdirSync(primary, { recursive: true });
		} catch {
			// DIRECTORY MAY ALREADY EXIST
		}
	}
	return primary;
}

export function resolveUserFontFilePath(fileName: string): string | null {
	const envDataRoot = process.env.DATA_ROOT;
	const candidates = [
		envDataRoot ? join(envDataRoot, 'fonts') : null,
		join(DATA_ROOT, 'fonts'),
		resolve(process.cwd(), 'data/fonts'),
		resolve(process.cwd(), 'web/data/fonts'),
		process.env.APPDATA ? join(process.env.APPDATA, 'XianScan', 'data', 'fonts') : null,
		process.env.APPDATA ? join(process.env.APPDATA, 'XianScan', 'app', 'data', 'fonts') : null,
	].filter((d): d is string => Boolean(d));

	for (const dir of candidates) {
		const p = join(dir, fileName);
		if (existsSync(p)) {
			return p;
		}
	}
	return null;
}

/**
 * THE SCRIPTS OF A CUSTOM FONT ROW. ROWS FROM BEFORE FEAT-006 HAVE '[]': THEIR FILES ARE PARSED ONCE AND THE ROW
 * UPDATED (LAZY BACKFILL). RECORDS THE RESULT FOR familyCovers.
 */
function customFontScripts(row: { id: string; name: string; fileName: string; scripts?: string | null }, db: any): Script[] {
	let scripts: Script[] = [];
	try {
		const parsed = JSON.parse(row.scripts || '[]');
		if (Array.isArray(parsed)) scripts = parsed as Script[];
	} catch {
		// TREAT AS NOT SCANNED
	}
	if (scripts.length === 0) {
		const userFontsDir = getUserFontsDir();
		const files = [row.fileName];
		try {
			for (const v of db.select().from(customFontFiles).where(eq(customFontFiles.fontId, row.id)).all()) files.push(v.fileName);
		} catch {
			// VARIANT TABLE MAY BE ABSENT IN SOME UNIT TESTS
		}
		const found = new Set<Script>();
		for (const file of files) {
			const path = resolveUserFontFilePath(file) || join(userFontsDir, file);
			try {
				if (!existsSync(path)) continue;
				const buf = readFileSync(path);
				for (const script of scriptsCoveredBy(readCmapCoverage(buf, splitFontCollection(buf)[0]))) found.add(script);
			} catch {
				// UNREADABLE FILE: SKIP
			}
		}
		scripts = [...found];
		if (scripts.length > 0) {
			try {
				db.update(customFonts).set({ scripts: JSON.stringify(scripts) }).where(eq(customFonts.id, row.id)).run();
			} catch {
				// OLD SCHEMA WITHOUT THE COLUMN: KEEP THE IN-MEMORY RESULT
			}
		}
	}
	CUSTOM_COVERAGE.set(row.name.toLowerCase(), scripts);
	return scripts;
}

/** A CUSTOM FONT IS A LATIN DIALOGUE FONT WHEN IT HAS LATIN LETTERS (OR, UNSCANNED, WHEN IT WAS UPLOADED AS ONE). */
function isLatinCustomFont(scripts: Script[], scriptType: string): boolean {
	return scripts.length > 0 ? scripts.includes('latin') : scriptType === 'dialogue';
}

// IMPORTED FAMILIES: REGISTERED IN THE CANVAS ENGINE LIKE OS FONTS, BUT NOT SYSTEM FONTS
const CUSTOM_FAMILY_NAMES = new Set<string>();

export function registerCustomFonts(db: any = defaultDb): void {
	if (customFontsRegistered) return;
	try {
		const userFontsDir = getUserFontsDir();
		const rows = db.select().from(customFonts).all();
		for (const row of rows) {
			// REGISTER PRIMARY FONT FILE
			const fontPath = resolveUserFontFilePath(row.fileName) || join(userFontsDir, row.fileName);
			if (existsSync(fontPath)) {
				tryRegisterFont(fontPath, row.name);
			}
			CUSTOM_FAMILY_NAMES.add(String(row.name).toLowerCase());

			// REGISTER ALL ADDITIONAL MULTI-WEIGHT VARIANT FILES
			try {
				const variantRows = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, row.id)).all();
				for (const variant of variantRows) {
					const variantPath = resolveUserFontFilePath(variant.fileName) || join(userFontsDir, variant.fileName);
					if (existsSync(variantPath)) {
						tryRegisterFont(variantPath, row.name);
					}
				}
			} catch {
				// custom_font_files TABLE MAY NOT BE INITIALIZED YET IN UNIT TESTS
			}

			if (isLatinCustomFont(customFontScripts(row, db), row.scriptType)) {
				LATIN_DIALOGUE_FONTS.add(row.name);
			}
		}
		invalidateCoverageCache();
		customFontsRegistered = true;
	} catch {
		// DATABASE MAY NOT BE INITIALIZED YET IN CERTAIN UNIT TESTS
	}
}

/**
 * ENSURES A FONT (BUNDLED, CUSTOM UPLOADED, OR INSTALLED OS SYSTEM FONT)
 * IS FULLY REGISTERED IN SKIA CANVAS ENGINE BEFORE TYPESETTING RUNS.
 */
export function ensureFontRegistered(fontName?: string, db: any = defaultDb): boolean {
	if (!fontName) return false;
	const trimmed = fontName.trim();
	if (!trimmed) return false;

	// ALREADY REGISTERED IN SKIA
	if (GlobalFonts.has(trimmed)) {
		if (!CJK_FAMILY_REGEX.test(trimmed)) {
			LATIN_DIALOGUE_FONTS.add(trimmed);
		}
		return true;
	}

	// CHECK IF IT IS IN CUSTOM FONTS TABLE (USER IMPORTED)
	try {
		const row = db.select().from(customFonts).where(eq(customFonts.name, trimmed)).get();
		if (row) {
			const userFontsDir = getUserFontsDir();
			const fontPath = resolveUserFontFilePath(row.fileName) || join(userFontsDir, row.fileName);
			if (existsSync(fontPath)) {
				tryRegisterFont(fontPath, trimmed);
			}

			// REGISTER ALL ADDITIONAL MULTI-WEIGHT VARIANTS
			try {
				const variants = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, row.id)).all();
				for (const variant of variants) {
					const variantPath = resolveUserFontFilePath(variant.fileName) || join(userFontsDir, variant.fileName);
					if (existsSync(variantPath)) {
						tryRegisterFont(variantPath, trimmed);
					}
				}
			} catch {
				// VARIANT TABLE LOOKUP SAFEGUARD
			}

			if (isLatinCustomFont(customFontScripts(row, db), row.scriptType)) {
				LATIN_DIALOGUE_FONTS.add(trimmed);
			}
			return GlobalFonts.has(trimmed);
		}
	} catch {
		// DB MAY BE INACCESSIBLE IN CERTAIN TEST HARNESS RUNS
	}

	// CHECK IF IT IS AN INSTALLED OS SYSTEM FONT
	const sysPath = resolveSystemFontFilePath(trimmed);
	if (sysPath && existsSync(sysPath)) {
		tryRegisterFont(sysPath, trimmed);
		if (!CJK_FAMILY_REGEX.test(trimmed)) {
			LATIN_DIALOGUE_FONTS.add(trimmed);
		}
		return GlobalFonts.has(trimmed);
	}

	return false;
}

export interface FontAvailabilityItem {
	available: boolean;
	bundled: boolean;
	/** SCRIPTS THE FONT HAS GLYPHS FOR (FEAT-006). */
	scripts?: Script[];
	custom?: boolean;
	system?: boolean;
	id?: string;
	scriptType?: 'dialogue' | 'cjk';
	note: string;
	supportedWeights: ('normal' | 'bold' | string)[];
	hasItalic?: boolean;
	isVariable?: boolean;
	variantsCount?: number;
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: ('uppercase' | 'original' | 'lowercase')[];
}

/**
 * RESOLVES THE EFFECTIVE FONT WEIGHT FOR A FAMILY WITH SAFE FALLBACK IF UNSUPPORTED
 */
export function resolveEffectiveFontWeight(
	fontFamily: string,
	requestedWeight?: 'normal' | 'bold' | string | number,
): 'normal' | 'bold' | number {
	let targetWeight = 400;
	if (requestedWeight === 'bold' || requestedWeight === '700' || requestedWeight === 700) {
		targetWeight = 700;
	} else if (requestedWeight === 'normal' || requestedWeight === '400' || requestedWeight === 400) {
		targetWeight = 400;
	} else if (typeof requestedWeight === 'number' && requestedWeight >= 100 && requestedWeight <= 900) {
		targetWeight = requestedWeight;
	} else if (typeof requestedWeight === 'string') {
		const parsed = Number(requestedWeight);
		if (!Number.isNaN(parsed) && parsed >= 100 && parsed <= 900) {
			targetWeight = parsed;
		}
	}

	const fam = (fontFamily || '').trim();

	// CC WILD WORDS AND FRIENDLY SANS ONLY BUNDLE REGULAR (400)
	if (fam === 'CC Wild Words' || fam === 'Friendly Sans') {
		return 'normal';
	}
	// MONTSERRAT, POPPINS, AND LEXEND ONLY BUNDLE BOLD (700)
	if (fam === 'Montserrat' || fam === 'Poppins' || fam === 'Lexend' || fam === 'General Sans Bold') {
		return 'bold';
	}
	// GENERAL SANS BUNDLES 400 AND 700
	if (fam === 'General Sans') {
		return targetWeight >= 600 ? 'bold' : 'normal';
	}

	// QUERY SKIA FAMILIES CACHE FOR SYSTEM AND NON-BUNDLED FONTS
	try {
		const parsed = GlobalFonts.families;
		if (parsed && Array.isArray(parsed) && parsed.length > 0) {
			const match = parsed.find((f) => f.family.toLowerCase() === fam.toLowerCase());
			if (match && Array.isArray(match.styles) && match.styles.length > 0) {
				let closestWeight = match.styles[0].weight;
				let minDiff = Math.abs(closestWeight - targetWeight);
				for (const s of match.styles) {
					const diff = Math.abs(s.weight - targetWeight);
					if (diff < minDiff) {
						minDiff = diff;
						closestWeight = s.weight;
					}
				}
				if (closestWeight === 400) return 'normal';
				if (closestWeight === 700) return 'bold';
				return closestWeight;
			}
		}
	} catch {
		// FALLBACK TO TARGET WEIGHT ON ERROR
	}

	if (targetWeight === 400) return 'normal';
	if (targetWeight === 700) return 'bold';
	return targetWeight;
}

/**
 * RESOLVES THE EFFECTIVE CASING FOR A FONT WITH SAFE FALLBACK IF UNSUPPORTED
 */
export function resolveEffectiveCasing(
	fontFamily: string,
	requestedCasing?: 'uppercase' | 'original' | 'lowercase' | string,
): 'uppercase' | 'original' | 'lowercase' {
	const fam = (fontFamily || '').trim().toLowerCase();
	if (fam === 'cc wild words' || fam.includes('wild words') || fam.includes('allcaps') || fam.includes('all-caps')) {
		return 'uppercase';
	}
	const normalized =
		requestedCasing === 'lowercase' || requestedCasing === 'original' ? requestedCasing : 'uppercase';
	return normalized;
}

/**
 * DETECTS AND RETURNS AVAILABILITY STATUS AND SUPPORTED WEIGHTS FOR ALL DIALOGUE & CJK FONTS
 */
export function getFontAvailability(db: any = defaultDb): Record<string, FontAvailabilityItem> {
	registerFonts(db);
	const fontMeta: Record<
		string,
		{
			bundled: boolean;
			note: string;
			defaultWeights?: ('normal' | 'bold' | string)[];
			allCapsOnly?: boolean;
			lowercaseOnly?: boolean;
			supportedCasings?: ('uppercase' | 'original' | 'lowercase')[];
		}
	> = {
		'CC Wild Words': { bundled: true, note: 'Bundled comic dialogue font', defaultWeights: ['normal'], allCapsOnly: true, supportedCasings: ['uppercase'] },
		'Friendly Sans': { bundled: true, note: 'Bundled clean Latin / symbol fallback', defaultWeights: ['normal'] },
		'General Sans': { bundled: true, note: 'Bundled clean modern sans', defaultWeights: ['normal', 'bold'] },
		'Poppins': { bundled: true, note: 'Bundled geometric rounded', defaultWeights: ['bold'] },
		'Montserrat': { bundled: true, note: 'Bundled bold contemporary', defaultWeights: ['bold'] },
		'Lexend': { bundled: true, note: 'Bundled high legibility', defaultWeights: ['bold'] },
		'WenQuanYi Micro Hei': { bundled: true, note: 'Bundled universal CJK engine', defaultWeights: ['normal', 'bold'] },
		'Noto Sans Devanagari': { bundled: true, note: 'Bundled Hindi / Devanagari font (no Latin letters)', defaultWeights: ['normal', 'bold'] },
		'Noto Sans Thai': { bundled: true, note: 'Bundled Thai font (no Latin letters)', defaultWeights: ['normal', 'bold'] },
		'Tajawal': { bundled: true, note: 'Bundled Arabic font (also covers Latin letters and digits)', defaultWeights: ['normal', 'bold'] },
		'Microsoft YaHei': { bundled: false, note: 'Windows Chinese font' },
		'Yu Gothic': { bundled: false, note: 'Windows Japanese font' },
		'Malgun Gothic': { bundled: false, note: 'Windows Korean font' },
		'Noto Sans CJK SC': { bundled: false, note: 'Linux / Open Source Noto CJK package' },
		'PingFang SC': { bundled: false, note: 'macOS Chinese font' },
		'Proxima Nova': { bundled: false, note: 'Proprietary font (requires local install)' },
	};

	let skiaFamilies: Array<{ family: string; styles: Array<{ weight: number }> }> = [];
	try {
		skiaFamilies = (GlobalFonts.families || []) as Array<{ family: string; styles: Array<{ weight: number }> }>;
	} catch {
		// IGNORE ERROR
	}

	const result: Record<string, FontAvailabilityItem> = {};
	for (const [name, meta] of Object.entries(fontMeta)) {
		const isAvail = meta.bundled || GlobalFonts.has(name);
		let supportedWeights: ('normal' | 'bold' | string)[] = meta.defaultWeights ? [...meta.defaultWeights] : ['normal'];

		if (!meta.defaultWeights) {
			const entry = skiaFamilies.find((f) => f.family.toLowerCase() === name.toLowerCase());
			if (entry && Array.isArray(entry.styles) && entry.styles.length > 0) {
				const weights = new Set<string>();
				for (const s of entry.styles) {
					weights.add(String(s.weight));
					if (s.weight >= 600) weights.add('bold');
					if (s.weight < 600) weights.add('normal');
				}
				supportedWeights = Array.from(weights);
			}
		}

		result[name] = {
			available: isAvail,
			bundled: meta.bundled,
			custom: false,
			scripts: isAvail ? BUNDLED_COVERAGE.get(name.toLowerCase()) ?? ALL_SCRIPTS.filter((sc) => familyCovers(name, sc)) : [],
			note: meta.note,
			supportedWeights,
			allCapsOnly: meta.allCapsOnly,
			lowercaseOnly: meta.lowercaseOnly,
			supportedCasings: meta.supportedCasings,
		};
	}

	// INCLUDE USER-IMPORTED CUSTOM FONTS FROM DATABASE
	try {
		const customRows = db.select().from(customFonts).all();
		for (const row of customRows) {
			let supportedWeights: ('normal' | 'bold' | string)[] = ['normal'];
			try {
				const parsed = JSON.parse(row.supportedWeights);
				if (Array.isArray(parsed)) {
					supportedWeights = parsed.map(String);
				}
			} catch {
				// FALLBACK TO NORMAL
			}

			let variantsCount = 1;
			try {
				const variants = db.select().from(customFontFiles).where(eq(customFontFiles.fontId, row.id)).all();
				if (variants && variants.length > 0) {
					variantsCount = variants.length;
					for (const v of variants) {
						if (v.weightNumeric) {
							const wStr = String(v.weightNumeric);
							if (!supportedWeights.includes(wStr)) supportedWeights.push(wStr);
						}
						const mapped: 'normal' | 'bold' = v.weightNumeric >= 600 ? 'bold' : 'normal';
						if (!supportedWeights.includes(mapped)) {
							supportedWeights.push(mapped);
						}
					}
				}
			} catch {
				// TABLE MAY NOT BE AVAILABLE IN RAW UNIT TESTS
			}

			result[row.name] = {
				available: GlobalFonts.has(row.name),
				bundled: false,
				custom: true,
				id: row.id,
				scripts: customFontScripts(row, db),
				scriptType: row.scriptType as 'dialogue' | 'cjk',
				note: row.scriptType === 'dialogue' ? 'User-imported dialogue font' : 'User-imported CJK font',
				supportedWeights,
				isVariable: !!row.isVariable,
				variantsCount,
			};
		}
	} catch {
		// DATABASE MAY BE ABSENT OR UNINITIALIZED IN CERTAIN TEST HARNESS RUNS
	}

	return result;
}

export interface SystemFontItem {
	family: string;
	supportedWeights: ('normal' | 'bold')[];
	hasItalic: boolean;
	scriptType: 'dialogue' | 'cjk';
	/** SCRIPTS THE FAMILY HAS GLYPHS FOR, FROM THE RENDER PROBE (FEAT-006). */
	scripts: Script[];
	stylesCount: number;
}

const IGNORED_SYSTEM_FONTS = new Set([
	'marlett',
	'webdings',
	'wingdings',
	'wingdings 2',
	'wingdings 3',
	'symbol',
	'segoe mdl2 assets',
	'segoe fluent icons',
	'hololens mdl2 assets',
]);

const CJK_FAMILY_REGEX =
	/(ms|yu|malgun|hiragino|biz)\s*gothic|yahei|mincho|simsun|simhei|kaiti|fangsong|jhenghei|pingfang|malgun|gulim|batang|dotum|gungsuh|noto sans cjk|noto serif cjk|source han|wenquanyi/i;

let cachedSystemFonts: SystemFontItem[] | null = null;

/**
 * SCANS ALL OPERATING SYSTEM FONTS DISCOVERED BY SKIA ENGINE
 */
export function getAvailableSystemFonts(): SystemFontItem[] {
	if (cachedSystemFonts) return cachedSystemFonts;

	const families = (GlobalFonts.families || []) as Array<{
		family: string;
		styles: Array<{ weight: number; style: string }>;
	}>;

	const result: SystemFontItem[] = [];
	const seen = new Set<string>();

	for (const f of families) {
		const name = (f.family || '').trim();
		if (!name || name.startsWith('@')) continue;
		const lower = name.toLowerCase();
		if (IGNORED_SYSTEM_FONTS.has(lower) || seen.has(lower)) continue;
		// THE CANVAS ENGINE ALSO LISTS THE FONTS XIANSCAN SHIPS OR IMPORTED: THOSE ARE NOT INSTALLED OS FONTS, AND
		// ENABLING ONE AS A "SYSTEM FONT" MADE THE BROWSER ASK THE OS FONT ROUTE FOR A FILE THAT IS NOT THERE (404)
		if (isBundledFontFamily(name) || CUSTOM_FAMILY_NAMES.has(lower)) continue;
		seen.add(lower);

		const styles = f.styles || [];
		const hasBold = styles.some((s) => s.weight >= 600);
		const hasNormal = styles.some((s) => s.weight < 600);

		const supportedWeights: ('normal' | 'bold')[] = [];
		if (hasNormal || (!hasNormal && !hasBold)) supportedWeights.push('normal');
		if (hasBold) supportedWeights.push('bold');

		const hasItalic = styles.some((s) => s.style === 'italic');
		// COVERAGE, NOT THE NAME, DECIDES THE CATEGORY (E13); THE NAME REGEX ONLY WHEN THE PROBE FINDS NOTHING
		const scripts = ALL_SCRIPTS.filter((script) => familyCovers(name, script));
		const scriptType: 'dialogue' | 'cjk' =
			scripts.length === 0
				? CJK_FAMILY_REGEX.test(name)
					? 'cjk'
					: 'dialogue'
				: scripts.includes('latin')
					? 'dialogue'
					: 'cjk';

		result.push({
			family: name,
			supportedWeights,
			hasItalic,
			scriptType,
			scripts,
			stylesCount: styles.length,
		});
	}

	result.sort((a, b) => a.family.localeCompare(b.family));
	cachedSystemFonts = result;
	return result;
}

/**
 * ATTEMPTS TO LOCATE PHYSICAL FONT BINARY FOR AN OS SYSTEM FONT ON DISK
 */
const systemFontPathCache = new Map<string, string | null>();

/**
 * THE SYSTEM FONT FILE FOR A FAMILY. FILE NAMES ONLY NARROW THE SEARCH (A PREFIX MATCH ALONE PICKED ARIALN.TTF,
 * ARIAL NARROW, FOR "Arial"); EACH CANDIDATE IS PARSED AND THE ONE WHOSE FAMILY NAME MATCHES WINS, ELSE THE
 * SHORTEST FILE NAME. CACHED PER FAMILY.
 */
/** PATH OF A FONT THAT SHIPS WITH XIANSCAN, OR null. */
export function resolveBundledFontFilePath(familyName: string): string | null {
	const file = bundledFontFileFor(familyName);
	if (!file) return null;
	const path = join(resolveFontDir(), file);
	return existsSync(path) ? path : null;
}

export function resolveSystemFontFilePath(familyName: string): string | null {
	const cacheKey = familyName.toLowerCase();
	if (systemFontPathCache.has(cacheKey)) return systemFontPathCache.get(cacheKey) ?? null;
	const famLower = familyName.toLowerCase().replace(/[^a-z0-9]/g, '');
	const dirs: string[] = [];

	if (process.platform === 'win32') {
		dirs.push(join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'Fonts'));
		if (process.env.LOCALAPPDATA) {
			dirs.push(join(process.env.LOCALAPPDATA, 'Microsoft\\Windows\\Fonts'));
		}
	} else if (process.platform === 'linux') {
		dirs.push('/usr/share/fonts', '/usr/local/share/fonts');
	} else if (process.platform === 'darwin') {
		dirs.push('/System/Library/Fonts', '/Library/Fonts');
	}

	const candidates: string[] = [];
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				const fLower = file.toLowerCase();
				if (!fLower.endsWith('.ttf') && !fLower.endsWith('.otf') && !fLower.endsWith('.ttc')) continue;
				const fClean = fLower.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/g, '');
				if (fClean.startsWith(famLower) || famLower.startsWith(fClean)) candidates.push(join(dir, file));
			}
		} catch {
			// DIRECTORY ACCESS ERROR
		}
	}

	let result: string | null = null;
	for (const path of candidates) {
		try {
			if (parseFontBuffer(readFileSync(path)).familyName.toLowerCase() === cacheKey) {
				result = path;
				break;
			}
		} catch {
			// UNPARSEABLE FILE: NOT A MATCH
		}
	}
	if (!result && candidates.length > 0) {
		result = [...candidates].sort((a, b) => a.length - b.length)[0];
	}
	systemFontPathCache.set(cacheKey, result);
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
	// THE DOMINANT NON-LATIN SCRIPT (HAN WHEN THERE IS NONE, AS BEFORE) THROUGH THE SCRIPT-AWARE CHAIN
	const dominant = text ? dominantScript(text, 'han') : 'han';
	const script: ScriptFontSlot = dominant === 'latin' ? 'han' : dominant;
	return buildScriptFontChain(script, defaultScriptContext(FONT_DIALOGUE, undefined, script))[0] ?? FONT_FALLBACK_NAME;
}

// CC WILD WORDS HAS NO ACCENTED LATIN (À-ɏ, ¡ ¿); THOSE GO TO THE LATIN FALLBACK FONT
const WILD_WORDS_MISSING_LATIN = /[\u00C0-\u024F\u00A1\u00BF]/;

/** A CONTEXT FOR CALLERS THAT DO NOT KNOW THE BOOK (CJK SLOT MAPPED FROM THE OLD customCjk SETTING). */
export function defaultScriptContext(dialogue: string = FONT_DIALOGUE, customCjk?: string, targetScript: Script = 'latin'): ScriptFontContext {
	const cjk = customCjk && customCjk !== FONT_FALLBACK_NAME && customCjk !== FONT_DIALOGUE ? customCjk : undefined;
	return {
		dialogue,
		scriptFonts: cjk ? { han: cjk, kana: cjk, hangul: cjk } : {},
		targetScript,
		bundled: BUNDLED_SCRIPT_FONTS,
	};
}

/**
 * SCRIPT-AWARE RUN SPLITTING (FEAT-006): EACH CHARACTER GOES TO ITS SCRIPT'S RUN; DIGITS, SPACES, PUNCTUATION,
 * JOINERS (ZWNJ / ZWJ) AND COMBINING MARKS STAY IN THE CURRENT RUN, SO THEY NEVER BREAK A WORD APART. A LINE WITH
 * ANY ARABIC OR HEBREW LETTER IS ONE RUN (ADR-007): SKIA SHAPES AND ORDERS IT IN A SINGLE fillText.
 */
export function splitTextRunsByScript(text: string, primaryFont: string | undefined, scriptCtx: ScriptFontContext): TextRun[] {
	const fontMain = primaryFont || scriptCtx.dialogue || FONT_DIALOGUE;
	const isWildWords = fontMain === FONT_DIALOGUE || fontMain.toLowerCase().includes('wild words');
	const chainFor = (script: ScriptFontSlot) => buildScriptFontChain(script, scriptCtx);

	for (const ch of text) {
		const script = scriptOfChar(ch);
		if (script === 'arabic' || script === 'hebrew') {
			const stack = [...chainFor(script), fontMain];
			return [{ text, font: stack[0], isFallbackSymbol: true, script, stack }];
		}
	}

	type Key = 'main' | 'symbol' | ScriptFontSlot;
	const pieces: { key: Key; text: string }[] = [];
	for (const ch of text) {
		const script = scriptOfChar(ch);
		let key: Key;
		if (script === 'common' || JOINER_REGEX.test(ch)) {
			if (isWildWords && UNSUPPORTED_WILDWORDS_REGEX.test(ch)) {
				key = 'symbol';
			} else if (pieces.length > 0) {
				pieces[pieces.length - 1].text += ch;
				continue;
			} else {
				key = 'main';
			}
		} else if (script === 'latin') {
			key = isWildWords && WILD_WORDS_MISSING_LATIN.test(ch) ? 'symbol' : 'main';
		} else {
			key = script as ScriptFontSlot;
		}
		const last = pieces[pieces.length - 1];
		if (last && last.key === key) last.text += ch;
		else pieces.push({ key, text: ch });
	}

	if (pieces.length === 0) return [{ text, font: fontMain, isFallbackSymbol: false, script: 'latin' }];
	return pieces.map(({ key, text: runText }): TextRun => {
		if (key === 'main') return { text: runText, font: fontMain, isFallbackSymbol: false, script: 'latin' };
		if (key === 'symbol') return { text: runText, font: FONT_FALLBACK_NAME, isFallbackSymbol: true, script: 'latin' };
		const stack = [...chainFor(key), fontMain];
		return { text: runText, font: stack[0], isFallbackSymbol: true, script: key, stack };
	});
}

/**
 * SPLITS A STRING INTO RUNS SO COMPATIBLE CHARACTERS STAY IN PRIMARY DIALOGUE FONT (e.g. CC WILD WORDS)
 * WHILE NON-LATIN CHARACTERS (HANGUL, CJK, DEVANAGARI, THAI, ETC.) AND UNMATCHED/REMAPPED SYMBOLS
 * USE THE DESIGNATED SCRIPT-AWARE FALLBACK / CJK FONT STACK.
 */
export function splitTextRuns(
	text: string,
	primaryFont?: string,
	fallbackFont?: string,
	scriptCtx?: ScriptFontContext,
): TextRun[] {
	if (scriptCtx) return splitTextRunsByScript(text, primaryFont, scriptCtx);
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

export function fontFor(text?: string, customDialogue?: string, customCjk?: string, scriptCtx?: ScriptFontContext): string {
	const fontDialogue = customDialogue || FONT_DIALOGUE;
	if (!text) return fontDialogue;
	if (scriptCtx) {
		// THE DOMINANT SCRIPT DECIDES: A HINDI LINE WITH ONE ENGLISH NAME IS A HINDI LINE
		const script = dominantScript(text, scriptCtx.targetScript);
		if (script === 'latin') return fontDialogue;
		return buildScriptFontChain(script as ScriptFontSlot, scriptCtx)[0] ?? fontDialogue;
	}
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

export const LATIN_DIALOGUE_FONTS = new Set([
	'CC Wild Words',
	'Friendly Sans',
	'General Sans',
	'General Sans Bold',
	'Poppins',
	'Poppins Bold',
	'Montserrat',
	'Montserrat Bold',
	'Lexend',
	'Lexend Bold',
	// TAJAWAL ALSO HAS LATIN LETTERS (NOTO DEVANAGARI / THAI DO NOT), SO A MIXED ARABIC LINE STAYS IN ONE FONT
	'Tajawal',
]);

export function fontSpec(
	size: number,
	fontNameOrText?: string,
	text?: string,
	customCjk?: string,
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
	stack?: string[],
): string {
	const isItalic = fontStyle === true || fontStyle === 'italic';
	const stylePrefix = isItalic ? 'italic ' : '';
	if (stack && stack.length > 0) {
		// SCRIPT-AWARE PATH: THE CALLER BUILT THE FAMILY LIST. NON-LATIN TEXT KEEPS THE BOLD DEFAULT IT ALWAYS HAD.
		const nonLatin = Boolean(text && dominantScript(text, 'latin') !== 'latin');
		const effectiveWeight = resolveEffectiveFontWeight(stack[0], fontWeight ?? (nonLatin ? 'bold' : undefined));
		return `${stylePrefix}${effectiveWeight} ${size}px ${fontStackString(stack, [], FONT_FALLBACK_NAME)}`;
	}
	const isPureNonLatin = Boolean(text && NON_LATIN_SCRIPT_REGEX.test(text) && !/[a-zA-Z]/.test(text));

	if (isPureNonLatin) {
		const cjkPrimary =
			customCjk && customCjk !== FONT_FALLBACK_NAME && customCjk !== FONT_DIALOGUE
				? customCjk
				: resolveScriptFont(text, customCjk);
		const effectiveWeight = resolveEffectiveFontWeight(cjkPrimary, fontWeight ?? 'bold');
		return `${stylePrefix}${effectiveWeight} ${size}px "${cjkPrimary}", ${CJK_FONT_STACK}`;
	}

	const fontName = fontNameOrText ?? FONT_DIALOGUE;
	const effectiveWeight = resolveEffectiveFontWeight(fontName, fontWeight);
	return `${stylePrefix}${effectiveWeight} ${size}px "${fontName}"${FONT_FALLBACK}`;
}

export { textFontStack };

/**
 * FONT STRING FOR A WHOLE RIGHT-TO-LEFT LINE (FEAT-007): THE RTL SCRIPT'S CHAIN FROM THE FEAT-006 RESOLVER, THEN
 * THE DIALOGUE FONT. ONE FONT STRING FOR THE WHOLE LINE, SO SKIA SHAPES AND ORDERS IT IN A SINGLE CALL (ADR-001).
 */
export function rtlFontSpec(
	size: number,
	primaryFont: string,
	line: string,
	customCjk?: string,
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
	scriptCtx?: ScriptFontContext,
): string {
	const ctxForLine = scriptCtx ?? defaultScriptContext(primaryFont, customCjk, 'arabic');
	const rtlScript = [...line].some((ch) => scriptOfChar(ch) === 'hebrew') && ![...line].some((ch) => scriptOfChar(ch) === 'arabic') ? 'hebrew' : 'arabic';
	const stack = [...buildScriptFontChain(rtlScript, ctxForLine)];
	for (const family of textFontStack(line, primaryFont, ctxForLine)) {
		if (!stack.includes(family)) stack.push(family);
	}
	return fontSpec(size, stack[0] ?? primaryFont, line, customCjk, fontWeight, fontStyle, stack);
}

export function measureTextWithRuns(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	size: number,
	primaryFont?: string,
	fallbackFont?: string,
	customCjk?: string,
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
	scriptCtx?: ScriptFontContext,
	direction: 'ltr' | 'rtl' = 'ltr',
): number {
	if (direction === 'rtl') {
		// THE WHOLE LINE IN ONE FONT STRING, EXACTLY AS drawTextLineWithRuns DRAWS IT
		ctx.font = rtlFontSpec(size, primaryFont || FONT_DIALOGUE, text, customCjk, fontWeight, fontStyle, scriptCtx);
		return ctx.measureText(text).width;
	}
	const runs = splitTextRuns(text, primaryFont, fallbackFont, scriptCtx);
	if (runs.length === 1 && !runs[0].isFallbackSymbol) {
		ctx.font = fontSpec(size, runs[0].font, text, customCjk, fontWeight, fontStyle, runs[0].stack);
		return ctx.measureText(text).width;
	}
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle, run.stack);
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
	align: 'center' | 'left' | 'start' = 'center',
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
	scriptCtx?: ScriptFontContext,
	direction: 'ltr' | 'rtl' = 'ltr',
): void {
	if (direction === 'rtl') {
		// ONE strokeText + ONE fillText FOR THE WHOLE LINE: SKIA APPLIES THE BIDI ALGORITHM AND ARABIC SHAPING
		// ACROSS IT. SPLITTING INTO RUNS AND ADVANCING LEFT TO RIGHT WOULD REVERSE THE WORD ORDER (FEAT-007 ADR-001).
		// 'center' CENTRES ON centerX; 'start' / 'left' ANCHORS THE LINE'S RIGHT EDGE AT centerX.
		ctx.font = rtlFontSpec(size, primaryFont || FONT_DIALOGUE, line, customCjk, fontWeight, fontStyle, scriptCtx);
		ctx.direction = 'rtl';
		ctx.textAlign = align === 'center' ? 'center' : 'right';
		ctx.textBaseline = 'alphabetic';
		if (strokeWidth > 0) {
			ctx.lineWidth = strokeWidth;
			ctx.lineJoin = 'round';
			ctx.strokeStyle = textColor.stroke;
			ctx.shadowColor = isDarkStroke ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
			ctx.shadowBlur = Math.max(2.5, size * 0.18);
			ctx.shadowOffsetX = isDarkStroke ? 1.0 : 0;
			ctx.shadowOffsetY = isDarkStroke ? 1.5 : 0;
			ctx.strokeText(line, centerX, y);
		}
		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.fillStyle = textColor.fill;
		ctx.fillText(line, centerX, y);
		return;
	}
	const runs = splitTextRuns(line, primaryFont, fallbackFont, scriptCtx);
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle, run.stack);
		totalW += ctx.measureText(run.text).width;
	}

	let curX = align === 'center' ? centerX - totalW / 2 : centerX;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle, run.stack);
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

