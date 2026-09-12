// TYPESET FONT REGISTRATION, CJK DETECTION, AND RUN SPLITTING
// IMPORTED DEP-TYPES
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
// IMPORTED DEP-MODULES
import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { db as defaultDb } from '../db';
import { customFonts, customFontFiles } from '../db/schema';
import { DATA_ROOT } from '../paths';

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
let customFontsRegistered = false;

export function invalidateCustomFontsCache(): void {
	customFontsRegistered = false;
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

	// REGISTER USER-IMPORTED CUSTOM FONTS
	registerCustomFonts(db);
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

			if (row.scriptType === 'dialogue') {
				LATIN_DIALOGUE_FONTS.add(row.name);
			}
		}
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

			if (row.scriptType === 'dialogue') {
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
		seen.add(lower);

		const styles = f.styles || [];
		const hasBold = styles.some((s) => s.weight >= 600);
		const hasNormal = styles.some((s) => s.weight < 600);

		const supportedWeights: ('normal' | 'bold')[] = [];
		if (hasNormal || (!hasNormal && !hasBold)) supportedWeights.push('normal');
		if (hasBold) supportedWeights.push('bold');

		const hasItalic = styles.some((s) => s.style === 'italic');
		const scriptType: 'dialogue' | 'cjk' = CJK_FAMILY_REGEX.test(name) ? 'cjk' : 'dialogue';

		result.push({
			family: name,
			supportedWeights,
			hasItalic,
			scriptType,
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
export function resolveSystemFontFilePath(familyName: string): string | null {
	const famLower = familyName.toLowerCase().replace(/[^a-z0-9]/g, '');
	const dirs: string[] = [];

	if (process.platform === 'win32') {
		dirs.push('C:\\Windows\\Fonts');
		if (process.env.LOCALAPPDATA) {
			dirs.push(join(process.env.LOCALAPPDATA, 'Microsoft\\Windows\\Fonts'));
		}
	} else if (process.platform === 'linux') {
		dirs.push('/usr/share/fonts', '/usr/local/share/fonts');
	} else if (process.platform === 'darwin') {
		dirs.push('/System/Library/Fonts', '/Library/Fonts');
	}

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			const files = readdirSync(dir);
			for (const file of files) {
				const fLower = file.toLowerCase();
				if (!fLower.endsWith('.ttf') && !fLower.endsWith('.otf') && !fLower.endsWith('.ttc')) {
					continue;
				}
				const fClean = fLower.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/g, '');
				if (fClean.startsWith(famLower) || famLower.startsWith(fClean)) {
					return join(dir, file);
				}
			}
		} catch {
			// DIRECTORY ACCESS ERROR
		}
	}

	return null;
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
]);

export function fontSpec(
	size: number,
	fontNameOrText?: string,
	text?: string,
	customCjk?: string,
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
): string {
	const isItalic = fontStyle === true || fontStyle === 'italic';
	const stylePrefix = isItalic ? 'italic ' : '';
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

export function measureTextWithRuns(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	size: number,
	primaryFont?: string,
	fallbackFont?: string,
	customCjk?: string,
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
): number {
	const runs = splitTextRuns(text, primaryFont, fallbackFont);
	if (runs.length === 1 && !runs[0].isFallbackSymbol) {
		ctx.font = fontSpec(size, runs[0].font, text, customCjk, fontWeight, fontStyle);
		return ctx.measureText(text).width;
	}
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle);
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
	fontWeight?: 'normal' | 'bold' | string | number,
	fontStyle?: 'normal' | 'italic' | boolean,
): void {
	const runs = splitTextRuns(line, primaryFont, fallbackFont);
	let totalW = 0;
	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle);
		totalW += ctx.measureText(run.text).width;
	}

	let curX = align === 'center' ? centerX - totalW / 2 : centerX;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	for (const run of runs) {
		ctx.font = fontSpec(size, run.font, run.isFallbackSymbol ? run.text : undefined, customCjk, fontWeight, fontStyle);
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

