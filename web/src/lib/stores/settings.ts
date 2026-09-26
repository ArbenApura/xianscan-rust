// SETTINGS STORE WITH SCHEMA VERSIONING & SAFE PROGRESSIVE UPGRADE
// Manages application preferences with SQLite synchronization and cookie mirroring.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { Script } from '$lib/languages';
import { SCRIPT_FONT_SLOTS, type ScriptFontSlot } from '$lib/typeset-scripts';

// -- TYPES -- //

export type Theme = 'auto' | 'light' | 'sepia' | 'dark';

export type InpaintMode = 'patch' | 'scaled' | 'full';

export type ExecutionDevice = 'auto' | 'cuda' | 'dml' | 'coreml' | 'cpu';

export type ReaderViewMode = 'reader' | 'grid' | 'compare';

export type WebtoonKind = 'output' | 'original';

export type WebtoonWidth = 'sm' | 'md' | 'lg';

export type AppFont = 'comic' | 'clash' | 'general' | 'poppins' | 'proxima' | 'nunito' | 'montserrat' | 'lexend';

export type TypesetOutline = 'none' | 'thin' | 'standard' | 'heavy';

export type TypesetContrast = 'auto' | 'dark' | 'light';

export type TypesetCasing = 'uppercase' | 'original' | 'lowercase';

export type TypesetFontWeight =
	| '100'
	| '200'
	| '300'
	| '400'
	| '500'
	| '600'
	| '700'
	| '800'
	| '900'
	| 'normal'
	| 'bold';

export type LibraryLayout = 'grid' | 'list' | 'compact';

export type LibrarySort = 'recent' | 'title_asc' | 'title_desc' | 'chapters_desc' | 'chapters_asc';

export type ChapterLayout = 'grid' | 'list' | 'compact';

export type ReasoningEffortOption = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'max' | (string & {});

export interface AppSettings {
	version: number;
	model: string;
	inpaintMode: InpaintMode;
	theme: Theme;
	appFont: AppFont;
	readerViewMode: ReaderViewMode;
	webtoonKind: WebtoonKind;
	webtoonWidth: WebtoonWidth;
	libraryLayout: LibraryLayout;
	librarySort: LibrarySort;
	chapterLayout: ChapterLayout;
	chapterSortAsc: boolean;
	executionDevice: ExecutionDevice;
	cudaVramLimitMb: number | null;
	parallelProcesses: number;
	parallelChapters: number;
	resliceBeforeBatch: boolean;
	sourceLang: string;
	targetLang: string;
	// CONVENTIONAL INFERENCE & SAMPLING CONFIGURATION
	translationMaxTokens: number;
	translationTemperature: number | null;
	translationTopP: number | null;
	translationReasoningEffort: ReasoningEffortOption;
	translationFrequencyPenalty: number | null;
	translationPresencePenalty: number | null;
	translationDialogueContextPages: number;
	// ADVANCED TYPESETTING & INPAINTING CONFIGURATION
	typesetFont: string;
	typesetFontWeight: TypesetFontWeight;
	/** @deprecated SUPERSEDED BY typesetScriptFonts (han / kana / hangul); KEPT FOR OLDER CLIENTS AND ROUTES. */
	typesetCjkFont: string;
	/** THE USER'S FONT PER SCRIPT; A MISSING SLOT MEANS AUTOMATIC (FEAT-006). */
	typesetScriptFonts: Partial<Record<ScriptFontSlot, string>>;
	/** ACCENT FONT PER SCRIPT, 'latin' INCLUDED; AN EMPTY MAP LEAVES ACCENT TEXT LOOKING LIKE DIALOGUE (FEAT-010). */
	typesetAccentFonts: Partial<Record<Script, string>>;
	typesetAccentCasing: TypesetCasing;
	typesetAccentFontWeight: TypesetFontWeight;
	/** ALSO USE THE ACCENT FONT FOR ACCENT TEXT INSIDE SPEECH BUBBLES (FEAT-010 ADR-004). */
	typesetAccentInBubbles: boolean;
	typesetPadding: number;
	typesetOutline: TypesetOutline;
	typesetContrast: TypesetContrast;
	typesetCasing: TypesetCasing;
	typesetPreviewText: string;
	typesetPreviewPreset: string;
	typesetAllCaps: boolean;
	enableTextRotation: boolean;
	enableTypesetCentering: boolean;
	enableTypesetItalic: boolean;
	enableWhiteInpaint: boolean;
	inpaintExpansionPct: number;
	hasCompletedOnboarding: boolean;
	livePipelinePreview: boolean;
	enabledSystemFonts: string[];
}

// -- CONSTANTS -- //

export const TRANSLATION_MODELS: { id: string; label: string; blurb: string }[] = [
	{ id: 'deepseek-v4-flash', label: 'Flash', blurb: 'Ultra-fast (1-2s) - great for everyday comic translation' },
	{ id: 'deepseek-v4-pro', label: 'Pro', blurb: 'Flagship model - higher-quality prose for complex idioms' },
];

export const INPAINT_MODES: { id: InpaintMode; label: string; tag: string; badgeColor: string; blurb: string }[] = [
	{
		id: 'patch',
		label: 'Patch Crop',
		tag: 'Fastest - Recommended',
		badgeColor: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300',
		blurb: 'Fastest with native 1:1 sharpness. Inpaints localized dialogue bubble patches at full resolution, keeping the rest of the page pristine with minimal latency.',
	},
	{
		id: 'scaled',
		label: 'Balanced (512 px Tiles)',
		tag: 'Balanced - Slower on Long Strips',
		badgeColor: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300',
		blurb: 'Splits the page into square tiles and runs each at 512 px, keeping the aspect ratio. Sharper than one downscale, but much slower on very tall webtoon strips.',
	},
	{
		id: 'full',
		label: 'Full Dynamic',
		tag: 'Slowest - Full Canvas',
		badgeColor: 'text-sky-700 bg-sky-500/10 border-sky-500/30 dark:text-sky-300',
		blurb: 'Full-page context. Pages under about 4 MP run in one pass; larger pages run in overlapping bands, so memory stays bounded. Slowest mode.',
	},
];

export const EXECUTION_DEVICES: { id: ExecutionDevice; label: string; blurb: string }[] = [
	{ id: 'auto', label: 'Auto Detect', blurb: 'Automatically selects Dedicated GPU or CPU Multi-threaded (safely avoids iGPU)' },
	{ id: 'cuda', label: 'NVIDIA Dedicated GPU (CUDA)', blurb: 'High-performance tensor acceleration on NVIDIA GeForce/RTX GPUs' },
	{ id: 'coreml', label: 'CoreML (Apple Silicon)', blurb: 'Metal / Neural Engine acceleration on Apple Silicon Macs' },
	{ id: 'dml', label: 'DirectML (Dedicated GPU)', blurb: 'DirectX 12 acceleration on dedicated AMD Radeon RX, Intel Arc, or NVIDIA GPUs' },
	{ id: 'cpu', label: 'CPU Multi-threaded', blurb: 'Fast, crash-free execution on multi-core CPU (recommended for non-dGPU)' },
];

export const CUDA_VRAM_LIMIT_PRESETS: { value: number | null; label: string; sub: string }[] = [
	{ value: null, label: 'Auto', sub: 'Hardware adaptive (8 GB on 16 GB+ GPUs)' },
	{ value: 8192, label: '8 GB', sub: 'Minimum viable - Tesla T4 / RTX 3070+ (16 GB)' },
	{ value: 12288, label: '12 GB', sub: 'RTX 4070 / 3080' },
	{ value: 16384, label: '16 GB', sub: 'RTX 4090 / A10G' },
	{ value: 24576, label: '24 GB', sub: 'A100 / RTX 3090 / 4090 24 GB' },
];

export const APP_FONTS: { id: AppFont; label: string; sample: string; blurb: string; stack: string }[] = [
	{
		id: 'comic',
		label: 'Wild Words',
		sample: 'COMIC SCANLATION',
		blurb: 'Iconic all-caps scanlation typography for authentic comic feel',
		stack: "'CC Wild Words', 'WildWorld', 'Montserrat', sans-serif",
	},
	{
		id: 'clash',
		label: 'Clash Grotesk',
		sample: 'Contemporary Display',
		blurb: 'Striking contemporary sans with dramatic personality and geometric precision',
		stack: "'Clash Grotesk', 'Cabinet Grotesk', sans-serif",
	},
	{
		id: 'general',
		label: 'General Sans',
		sample: 'Rational Neutral Sans',
		blurb: 'Crisp, rational Swiss-inspired grotesque designed for clear UI hierarchy',
		stack: "'General Sans', sans-serif",
	},
	{
		id: 'poppins',
		label: 'Poppins',
		sample: 'Modern Geometric Sans',
		blurb: 'Friendly, balanced geometric sans-serif with circular letterforms',
		stack: "'Poppins', sans-serif",
	},
	{
		id: 'nunito',
		label: 'Nunito Sans',
		sample: 'Balanced Rounded Sans',
		blurb: 'Soft, readable rounded sans-serif optimal for clean navigation',
		stack: "'Nunito Sans', sans-serif",
	},
	{
		id: 'proxima',
		label: 'Proxima Nova',
		sample: 'Clean Modern Editorial',
		blurb: 'Clear modern grotesque bridging geometric and classic sans proportions',
		stack: "'Proxima Nova', 'Montserrat', sans-serif",
	},
	{
		id: 'montserrat',
		label: 'Montserrat',
		sample: 'Geometric Urban Display',
		blurb: 'Warm, geometric sans inspired by traditional Buenos Aires neighborhood signage',
		stack: "'Montserrat', sans-serif",
	},
	{
		id: 'lexend',
		label: 'Lexend',
		sample: 'High-Legibility Reading',
		blurb: 'Specially engineered typography designed to reduce visual reading fatigue',
		stack: "'Lexend', sans-serif",
	},
];

export const DEFAULTS: AppSettings = {
	version: 12,
	model: 'qwen3.5:9b',
	inpaintMode: 'patch',
	theme: 'sepia',
	appFont: 'comic',
	readerViewMode: 'compare',
	webtoonKind: 'output',
	webtoonWidth: 'md',
	libraryLayout: 'grid',
	librarySort: 'recent',
	chapterLayout: 'list',
	chapterSortAsc: true,
	executionDevice: 'auto',
	cudaVramLimitMb: null,
	parallelProcesses: 1,
	parallelChapters: 1,
	resliceBeforeBatch: true,
	sourceLang: 'zh-Hans',
	targetLang: 'en',
	translationMaxTokens: 4096,
	translationTemperature: null,
	translationTopP: null,
	translationReasoningEffort: 'none',
	translationFrequencyPenalty: null,
	translationPresencePenalty: null,
	translationDialogueContextPages: 4,
	typesetFont: 'CC Wild Words',
	typesetFontWeight: 'normal',
	typesetCjkFont: 'WenQuanYi Micro Hei',
	typesetScriptFonts: {},
	// SIGMAR ONE SHIPS WITH XIANSCAN AS THE LATIN ACCENT FONT; OTHER SCRIPTS START OFF (FEAT-010)
	typesetAccentFonts: { latin: 'Sigmar One' },
	typesetAccentCasing: 'uppercase',
	typesetAccentFontWeight: 'normal',
	typesetAccentInBubbles: false,
	typesetPadding: 0.05,
	typesetOutline: 'standard',
	typesetContrast: 'auto',
	typesetCasing: 'uppercase',
	typesetPreviewText: 'Hold on! What is this Cultivation Realm...?!',
	typesetPreviewPreset: 'en',
	typesetAllCaps: true,
	enableTextRotation: true,
	enableTypesetCentering: true,
	enableTypesetItalic: false,
	enableWhiteInpaint: true,
	inpaintExpansionPct: 0.03,
	hasCompletedOnboarding: false,
	livePipelinePreview: true,
	enabledSystemFonts: [],
};

export const DIALOGUE_CONTEXT_PAGES_PRESETS = [0, 1, 2, 3, 4, 5, 6] as const;

export const SERVER_CANONICAL_KEYS: (keyof AppSettings)[] = [
	'theme',
	'appFont',
	'readerViewMode',
	'webtoonKind',
	'webtoonWidth',
	'libraryLayout',
	'librarySort',
	'chapterLayout',
	'chapterSortAsc',
	'model',
	'inpaintMode',
	'executionDevice',
	'cudaVramLimitMb',
	'parallelProcesses',
	'parallelChapters',
	'resliceBeforeBatch',
	'sourceLang',
	'targetLang',
	'translationMaxTokens',
	'translationTemperature',
	'translationTopP',
	'translationReasoningEffort',
	'translationFrequencyPenalty',
	'translationPresencePenalty',
	'translationDialogueContextPages',
	'typesetFont',
	'typesetFontWeight',
	'typesetCjkFont',
	'typesetScriptFonts',
	'typesetAccentFonts',
	'typesetAccentCasing',
	'typesetAccentFontWeight',
	'typesetAccentInBubbles',
	'typesetPadding',
	'typesetOutline',
	'typesetContrast',
	'typesetCasing',
	'typesetPreviewText',
	'typesetPreviewPreset',
	'typesetAllCaps',
	'enableTextRotation',
	'enableTypesetCentering',
	'enableTypesetItalic',
	'enableWhiteInpaint',
	'inpaintExpansionPct',
	'hasCompletedOnboarding',
	'livePipelinePreview',
	'enabledSystemFonts',
];

const KEY = 'xianscan:settings';

// COOKIE CONSTANTS FOR SSR PRE-RENDERING (NO FLICKER)
export const THEME_COOKIE = 'mt_theme';
export const FONT_COOKIE = 'mt_font';
export const LIB_LAYOUT_COOKIE = 'mt_lib_layout';
export const CH_LAYOUT_COOKIE = 'mt_ch_layout';
export const READER_VIEW_COOKIE = 'mt_reader_view';
export const WEBTOON_KIND_COOKIE = 'mt_webtoon_kind';
export const WEBTOON_WIDTH_COOKIE = 'mt_webtoon_width';
export const INPAINT_MODE_COOKIE = 'mt_inpaint_mode';
export const WHITE_INPAINT_COOKIE = 'mt_white_inpaint';
export const INPAINT_EXPANSION_COOKIE = 'mt_inpaint_exp';
export const WATERMARK_INPAINT_COOKIE = 'mt_watermark_inpaint';
export const EXEC_DEVICE_COOKIE = 'mt_exec_device';
export const PARALLEL_PROCESSES_COOKIE = 'mt_parallel_processes';
export const PARALLEL_CHAPTERS_COOKIE = 'mt_parallel_chapters';
export const RESLICE_BEFORE_BATCH_COOKIE = 'mt_reslice_batch';
export const TYPESET_FONT_COOKIE = 'mt_ts_font';
export const TYPESET_FONT_WEIGHT_COOKIE = 'mt_ts_font_weight';
export const TYPESET_PADDING_COOKIE = 'mt_ts_padding';
export const TYPESET_OUTLINE_COOKIE = 'mt_ts_outline';
export const TYPESET_CONTRAST_COOKIE = 'mt_ts_contrast';
export const TYPESET_CASING_COOKIE = 'mt_ts_casing';
export const TYPESET_ALL_CAPS_COOKIE = 'mt_ts_allcaps';
export const TYPESET_ROTATION_COOKIE = 'mt_ts_rot';
export const TYPESET_CENTERING_COOKIE = 'mt_ts_centering';
export const TYPESET_ITALIC_COOKIE = 'mt_ts_italic';

export const DARK_THEMES: Theme[] = ['dark'];

export const THEME_BG: Record<Theme, string> = {
	auto: '#fbfaf7',
	light: '#fbfaf7',
	sepia: '#f4ecd8',
	dark: '#13100c',
};

export const DEFAULT_SOURCE_LANG = 'zh-Hans';
export const DEFAULT_TARGET_LANG = 'en';

export const THEME_CLASS: Record<Theme, string> = {
	auto: 'bg-[#fbfaf7] dark:bg-[#13100c] text-[#2b2320] dark:text-[#d8cfc2]',
	light: 'bg-[#fbfaf7] text-[#2b2320]',
	sepia: 'bg-[#f4ecd8] text-[#5b4636]',
	dark: 'bg-[#13100c] text-[#d8cfc2]',
};

export const THEME_PANEL: Record<Theme, string> = {
	auto: 'bg-white dark:bg-[#211c15] text-[#2b2320] dark:text-[#e6ded2]',
	light: 'bg-white text-[#2b2320]',
	sepia: 'bg-[#fbf6ea] text-[#5b4636]',
	dark: 'bg-[#211c15] text-[#e6ded2]',
};

export const THEME_POPOVER: Record<Theme, string> = {
	auto: 'bg-white dark:bg-[#2a231a] text-[#2b2320] dark:text-[#e6ded2]',
	light: 'bg-white text-[#2b2320]',
	sepia: 'bg-[#fdf9f0] text-[#5b4636]',
	dark: 'bg-[#2a231a] text-[#e6ded2]',
};

export const THEME_PANEL_BORDER: Record<Theme, string> = {
	auto: 'border-black/10 dark:border-white/10',
	light: 'border-black/10',
	sepia: 'border-[#e2d4b5]',
	dark: 'border-white/10',
};

export const THEME_BAR: Record<Theme, string> = {
	auto: 'bg-white/70 dark:bg-[#13100c]/70',
	light: 'bg-white/70',
	sepia: 'bg-[#f4ecd8]/72',
	dark: 'bg-[#13100c]/70',
};

export interface TypesetFontOption {
	id: string;
	/** SCRIPTS THIS FONT HAS GLYPHS FOR (FEAT-006); ABSENT FOR OLDER DATA. */
	scripts?: Script[];
	label: string;
	sub: string;
	stack?: string;
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: TypesetCasing[];
	bundled?: boolean;
	custom?: boolean;
	system?: boolean;
	customId?: string;
	scriptType?: 'dialogue' | 'cjk';
	supportedWeights?: ('normal' | 'bold' | string)[];
	isVariable?: boolean;
	variants?: CustomFontVariantItem[];
}

/** ACCENT-ONLY BUNDLED FONTS (FEAT-010): OFFERED IN THE LATIN ACCENT CELL, NOT AS DIALOGUE FONTS. */
export const BUNDLED_ACCENT_FONTS: TypesetFontOption[] = [
	{ id: 'Sigmar One', label: 'Sigmar One', sub: 'Bundled accent font', stack: "'Sigmar One', sans-serif", bundled: true, scripts: ['latin'], supportedWeights: ['normal', '400'] },
];

export const AVAILABLE_TYPESET_FONTS: TypesetFontOption[] = [
	{ id: 'CC Wild Words', label: 'CC Wild Words', sub: 'Classic Comic All-Caps', stack: "'CC Wild Words', 'WildWorld', sans-serif", allCapsOnly: true, supportedCasings: ['uppercase'], bundled: true, supportedWeights: ['normal', '400'] },
	{ id: 'Friendly Sans', label: 'Friendly Sans', sub: 'Clean Comic Sans-Serif', stack: "'Friendly Sans', sans-serif", bundled: true, supportedWeights: ['normal', '400'] },
	{ id: 'General Sans', label: 'General Sans', sub: 'Clean Modern Sans', stack: "'General Sans', sans-serif", bundled: true, supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Poppins', label: 'Poppins', sub: 'Geometric Rounded', stack: "'Poppins', sans-serif", bundled: true, supportedWeights: ['bold', '700'] },
	{ id: 'Montserrat', label: 'Montserrat', sub: 'Bold Contemporary', stack: "'Montserrat', sans-serif", bundled: true, supportedWeights: ['bold', '700'] },
	{ id: 'Lexend', label: 'Lexend', sub: 'High Legibility', stack: "'Lexend', sans-serif", bundled: true, supportedWeights: ['bold', '700'] },
];

export const AVAILABLE_CJK_FONTS: TypesetFontOption[] = [
	{ id: 'WenQuanYi Micro Hei', label: 'WenQuanYi Micro Hei', sub: 'Bundled Universal CJK Engine', bundled: true, supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Microsoft YaHei', label: 'Microsoft YaHei', sub: 'Chinese Simplified & Traditional', supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Yu Gothic', label: 'Yu Gothic', sub: 'Japanese Manga Standard', supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Malgun Gothic', label: 'Malgun Gothic', sub: 'Korean Hangul Manhwa', supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Noto Sans CJK SC', label: 'Noto Sans CJK', sub: 'Universal CJK (Linux / Noto)', supportedWeights: ['normal', 'bold', '400', '700'] },
	{ id: 'Friendly Sans', label: 'Friendly Sans', sub: 'Clean Latin / Symbol Fallback', bundled: true, supportedWeights: ['normal', '400'] },
];

export interface FontAvailabilityStatus {
	available: boolean;
	bundled: boolean;
	custom?: boolean;
	system?: boolean;
	id?: string;
	scriptType?: 'dialogue' | 'cjk';
	note: string;
	supportedWeights?: ('normal' | 'bold' | string)[];
	isVariable?: boolean;
	variantsCount?: number;
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: TypesetCasing[];
}

export interface CustomFontVariantItem {
	id: string;
	weight: 'normal' | 'bold' | string;
	weightNumeric: number;
	weightLabel: string;
	style: 'normal' | 'italic';
	fileName: string;
	fileSize: number;
}

export interface CustomFontItem {
	id: string;
	name: string;
	fileName: string;
	format: 'truetype' | 'opentype';
	scriptType: 'dialogue' | 'cjk';
	fileSize: number;
	supportedWeights: ('normal' | 'bold' | string)[];
	isVariable?: boolean;
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: TypesetCasing[];
	variants?: CustomFontVariantItem[];
	/** SCRIPTS THE FONT'S cmap COVERS (FEAT-006); ABSENT FOR FONTS UPLOADED BEFORE IT. */
	scripts?: Script[];
}

export interface CasingPreset {
	id: TypesetCasing;
	label: string;
	sample: string;
	desc: string;
}

export const CASING_PRESETS: CasingPreset[] = [
	{ id: 'uppercase', label: 'UPPERCASE', sample: 'HOLD ON! WHAT IS...', desc: 'Standard comic scanlation' },
	{ id: 'original', label: 'Normal / As Is', sample: 'Hold on! What is...', desc: 'Keep sentence casing' },
	{ id: 'lowercase', label: 'lowercase', sample: 'hold on! what is...', desc: 'All lower case' },
];

export function isCasingSupportedByFont(
	casing: TypesetCasing,
	supportedCasings?: TypesetCasing[],
	allCapsOnly?: boolean,
	lowercaseOnly?: boolean,
): boolean {
	if (allCapsOnly) {
		return casing === 'uppercase';
	}
	if (lowercaseOnly) {
		return casing === 'lowercase';
	}
	if (supportedCasings && supportedCasings.length > 0) {
		return supportedCasings.includes(casing);
	}
	return true;
}

export function getValidCasingForFont(
	currentCasing?: TypesetCasing | string | null,
	supportedCasings?: TypesetCasing[],
	allCapsOnly?: boolean,
	lowercaseOnly?: boolean,
): TypesetCasing {
	const normalized: TypesetCasing =
		currentCasing === 'lowercase' || currentCasing === 'original' ? currentCasing : 'uppercase';

	if (isCasingSupportedByFont(normalized, supportedCasings, allCapsOnly, lowercaseOnly)) {
		return normalized;
	}

	// PREFER UPPERCASE FOR SCANLATIONS
	if (isCasingSupportedByFont('uppercase', supportedCasings, allCapsOnly, lowercaseOnly)) {
		return 'uppercase';
	}
	// PREFER ORIGINAL
	if (isCasingSupportedByFont('original', supportedCasings, allCapsOnly, lowercaseOnly)) {
		return 'original';
	}
	// PREFER LOWERCASE
	if (isCasingSupportedByFont('lowercase', supportedCasings, allCapsOnly, lowercaseOnly)) {
		return 'lowercase';
	}

	return 'uppercase';
}

export interface FontWeightPreset {
	value: TypesetFontWeight;
	label: string;
	numeric: number;
	hint: string;
}

export const FONT_WEIGHT_PRESETS: FontWeightPreset[] = [
	{ value: '100', label: 'Thin', numeric: 100, hint: 'Weight 100' },
	{ value: '200', label: 'Extra Light', numeric: 200, hint: 'Weight 200' },
	{ value: '300', label: 'Light', numeric: 300, hint: 'Weight 300' },
	{ value: '400', label: 'Regular', numeric: 400, hint: 'Weight 400' },
	{ value: '500', label: 'Medium', numeric: 500, hint: 'Weight 500' },
	{ value: '600', label: 'Semi Bold', numeric: 600, hint: 'Weight 600' },
	{ value: '700', label: 'Bold', numeric: 700, hint: 'Weight 700' },
	{ value: '800', label: 'Extra Bold', numeric: 800, hint: 'Weight 800' },
	{ value: '900', label: 'Black', numeric: 900, hint: 'Weight 900' },
];

export function normalizeFontWeightNumeric(weight?: TypesetFontWeight | string | number | null): number {
	if (!weight) return 400;
	if (weight === 'bold' || weight === 700 || weight === '700') return 700;
	if (weight === 'normal' || weight === 400 || weight === '400') return 400;
	const parsed = Number(weight);
	if (!Number.isNaN(parsed) && parsed >= 100 && parsed <= 900) return parsed;
	return 400;
}

export function normalizeFontWeightSelectValue(weight?: TypesetFontWeight | string | number | null): TypesetFontWeight {
	if (!weight || weight === 'normal' || weight === 400 || weight === '400') return '400';
	if (weight === 'bold' || weight === 700 || weight === '700') return '700';
	const parsed = Number(weight);
	if (!Number.isNaN(parsed) && parsed >= 100 && parsed <= 900) {
		return String(Math.round(parsed / 100) * 100) as TypesetFontWeight;
	}
	return '400';
}

export function isWeightSupportedByFont(
	numericWeight: number,
	supportedWeights?: string[],
	isVariable?: boolean,
): boolean {
	if (isVariable) return true;
	if (!supportedWeights || supportedWeights.length === 0) return numericWeight === 400;
	if (supportedWeights.includes(String(numericWeight))) return true;
	if (numericWeight === 700 && supportedWeights.includes('bold')) return true;
	if (numericWeight === 400 && supportedWeights.includes('normal')) return true;
	return false;
}

export function getValidFontWeightForFont(
	currentWeight?: TypesetFontWeight | string | number | null,
	supportedWeights?: string[],
	isVariable?: boolean,
): TypesetFontWeight {
	if (isVariable) {
		return normalizeFontWeightSelectValue(currentWeight);
	}
	const num = normalizeFontWeightNumeric(currentWeight);
	if (isWeightSupportedByFont(num, supportedWeights, isVariable)) {
		return normalizeFontWeightSelectValue(currentWeight);
	}
	// PREFER REGULAR 400
	if (isWeightSupportedByFont(400, supportedWeights, isVariable)) {
		return '400';
	}
	// PREFER BOLD 700
	if (isWeightSupportedByFont(700, supportedWeights, isVariable)) {
		return '700';
	}
	// FIRST AVAILABLE SUPPORTED WEIGHT
	const match = FONT_WEIGHT_PRESETS.find((p) => isWeightSupportedByFont(p.numeric, supportedWeights, isVariable));
	return match ? match.value : '400';
}

export interface SystemFontInfo {
	family: string;
	scriptType: 'dialogue' | 'cjk';
	/** SCRIPTS THE FONT COVERS (FEAT-006); ABSENT FROM OLDER SERVERS. */
	scripts?: Script[];
	supportedWeights: ('normal' | 'bold')[];
	isVariable?: boolean;
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: TypesetCasing[];
}

export const customFontsStore = writable<CustomFontItem[]>([]);
export const systemFontsStore = writable<SystemFontInfo[]>([]);
export const systemFontsLoadingStore = writable<boolean>(false);

export async function fetchInstalledSystemFonts(script?: 'dialogue' | 'cjk'): Promise<SystemFontInfo[]> {
	systemFontsLoadingStore.set(true);
	try {
		const url = script ? `/api/system/fonts/system?script=${script}` : '/api/system/fonts/system';
		const res = await fetch(url);
		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data.fonts)) {
				systemFontsStore.set(data.fonts);
				return data.fonts;
			}
		}
	} catch {
		// PRESERVE CURRENT SYSTEM FONTS LIST UPON NETWORK ERROR
	} finally {
		systemFontsLoadingStore.set(false);
	}
	return get(systemFontsStore);
}

const loadedBrowserFonts = new Set<string>();
// SYSTEM FAMILIES THAT FAILED TO LOAD THIS SESSION (E.G. NO LONGER INSTALLED): NOT REQUESTED AGAIN UNTIL RE-ENABLED
const failedSystemBrowserFonts = new Set<string>();

// DYNAMICALLY REGISTERS CUSTOM FONT IN THE BROWSER DOM FOR LIVE PREVIEW
export async function loadBrowserFontFace(font: {
	id: string;
	name: string;
	supportedWeights?: ('normal' | 'bold' | string)[];
	isVariable?: boolean;
	variants?: CustomFontVariantItem[];
}): Promise<boolean> {
	if (typeof window === 'undefined' || typeof document === 'undefined' || !('fonts' in document)) {
		return false;
	}
	if (loadedBrowserFonts.has(font.id)) {
		return true;
	}
	try {
		if (font.variants && font.variants.length > 0) {
			// LOAD EACH VARIANT FILE DISCRIMINATED BY WEIGHT AND STYLE
			for (const v of font.variants) {
				const fontFace = new FontFace(font.name, `url(/api/system/fonts/${font.id}/variants/${v.id})`, {
					weight: `${v.weightNumeric}`,
					style: v.style,
				});
				await fontFace.load();
				document.fonts.add(fontFace);
			}
		} else if (font.isVariable) {
			// VARIABLE FONT SPANNING WEIGHT RANGE
			const fontFace = new FontFace(font.name, `url(/api/system/fonts/${font.id})`, {
				weight: '100 900',
				style: 'normal',
			});
			await fontFace.load();
			document.fonts.add(fontFace);
		} else {
			const isBoldOnly = font.supportedWeights?.includes('bold') && !font.supportedWeights?.includes('normal');
			const weightDescriptor = isBoldOnly ? '700' : '400 700';
			const fontFace = new FontFace(font.name, `url(/api/system/fonts/${font.id})`, {
				weight: weightDescriptor,
			});
			await fontFace.load();
			document.fonts.add(fontFace);
		}
		loadedBrowserFonts.add(font.id);
		return true;
	} catch {
		return false;
	}
}

// DYNAMICALLY REGISTERS SYSTEM INSTALLED FONT IN THE BROWSER DOM FOR LIVE PREVIEW
// retryFailed: AN EXPLICIT ENABLE FROM THE SYSTEM FONT BROWSER TRIES AGAIN (THE FONT MAY HAVE BEEN INSTALLED SINCE)
export async function loadSystemBrowserFontFace(familyName: string, retryFailed = false): Promise<boolean> {
	if (typeof window === 'undefined' || typeof document === 'undefined' || !('fonts' in document)) {
		return false;
	}
	const cacheKey = `system:${familyName}`;
	if (loadedBrowserFonts.has(cacheKey)) {
		return true;
	}
	if (failedSystemBrowserFonts.has(familyName) && !retryFailed) {
		return false;
	}
	try {
		const fontFace = new FontFace(familyName, `url(/api/system/fonts/system/${encodeURIComponent(familyName)})`, {
			weight: '100 900',
			style: 'normal',
		});
		await fontFace.load();
		document.fonts.add(fontFace);
		loadedBrowserFonts.add(cacheKey);
		return true;
	} catch {
		failedSystemBrowserFonts.add(familyName);
		return false;
	}
}

export function unloadBrowserFontFace(fontId: string): void {
	loadedBrowserFonts.delete(fontId);
	loadedBrowserFonts.delete(`system:${fontId}`);
	failedSystemBrowserFonts.delete(fontId);
}

const CJK_SYSTEM_FAMILY_REGEX =
	/(ms|yu|malgun|hiragino|biz)\s*gothic|yahei|mincho|simsun|simhei|kaiti|fangsong|jhenghei|pingfang|malgun|gulim|batang|dotum|gungsuh|noto sans cjk|noto serif cjk|source han|wenquanyi/i;

function isSystemFontCjk(familyName: string, systemFonts: SystemFontInfo[] = []): boolean {
	const found = systemFonts.find((f) => f.family.toLowerCase() === familyName.toLowerCase());
	if (found) {
		return found.scriptType === 'cjk';
	}
	return CJK_SYSTEM_FAMILY_REGEX.test(familyName);
}

export function getMergedDialogueFonts(
	customFonts: CustomFontItem[],
	enabledSystemFonts: string[] = [],
	systemFonts: SystemFontInfo[] = []
): TypesetFontOption[] {
	const customDialogueOptions: TypesetFontOption[] = customFonts
		.filter((f) => f.scriptType === 'dialogue')
		.map((f) => {
			let sub = 'Imported Dialogue Font';
			if (f.isVariable) {
				sub = 'Variable Custom Font';
			} else if (f.variants && f.variants.length > 0) {
				sub = `Multi-weight (${f.variants.length + 1} files)`;
			}
			return {
				id: f.name,
				label: f.name,
				sub,
				stack: `"${f.name}", sans-serif`,
				custom: true,
				customId: f.id,
				scriptType: 'dialogue',
				supportedWeights: f.supportedWeights,
				isVariable: f.isVariable,
				allCapsOnly: f.allCapsOnly,
				lowercaseOnly: f.lowercaseOnly,
				supportedCasings: f.supportedCasings,
				variants: f.variants,
			};
		});

	const systemDialogueOptions: TypesetFontOption[] = enabledSystemFonts
		.filter((name) => !isSystemFontCjk(name, systemFonts))
		.map((familyName) => {
			const info = systemFonts.find((s) => s.family.toLowerCase() === familyName.toLowerCase());
			return {
				id: familyName,
				label: familyName,
				sub: 'System Installed Font',
				stack: `"${familyName}", sans-serif`,
				system: true,
				scriptType: 'dialogue',
				supportedWeights: info?.supportedWeights || ['normal', 'bold'],
				allCapsOnly: info?.allCapsOnly,
				lowercaseOnly: info?.lowercaseOnly,
				supportedCasings: info?.supportedCasings,
			};
		});

	return [...AVAILABLE_TYPESET_FONTS, ...customDialogueOptions, ...systemDialogueOptions];
}

export function getMergedCjkFonts(
	customFonts: CustomFontItem[],
	enabledSystemFonts: string[] = [],
	systemFonts: SystemFontInfo[] = []
): TypesetFontOption[] {
	const customCjkOptions: TypesetFontOption[] = customFonts
		.filter((f) => f.scriptType === 'cjk')
		.map((f) => {
			let sub = 'Imported CJK Fallback Font';
			if (f.isVariable) {
				sub = 'Variable CJK Custom Font';
			} else if (f.variants && f.variants.length > 0) {
				sub = `Multi-weight (${f.variants.length + 1} files)`;
			}
			return {
				id: f.name,
				label: f.name,
				sub,
				stack: `"${f.name}", sans-serif`,
				custom: true,
				customId: f.id,
				scriptType: 'cjk',
				supportedWeights: f.supportedWeights,
				isVariable: f.isVariable,
				allCapsOnly: f.allCapsOnly,
				lowercaseOnly: f.lowercaseOnly,
				supportedCasings: f.supportedCasings,
				variants: f.variants,
			};
		});

	const systemCjkOptions: TypesetFontOption[] = enabledSystemFonts
		.filter((name) => isSystemFontCjk(name, systemFonts))
		.map((familyName) => ({
			id: familyName,
			label: familyName,
			sub: 'System Installed CJK Font',
			stack: `"${familyName}", sans-serif`,
			system: true,
			scriptType: 'cjk',
			supportedWeights: ['normal', 'bold'],
		}));

	return [...AVAILABLE_CJK_FONTS, ...customCjkOptions, ...systemCjkOptions];
}

const CJK_SLOTS = new Set<ScriptFontSlot>(['han', 'kana', 'hangul']);

/** THE BUNDLED FONT OFFERED FOR EACH SCRIPT (THE SERVER RENDERS WITH THE SAME FILES). */
const BUNDLED_SCRIPT_FONT_OPTIONS: Partial<Record<ScriptFontSlot, TypesetFontOption>> = {
	han: AVAILABLE_CJK_FONTS[0],
	kana: AVAILABLE_CJK_FONTS[0],
	hangul: AVAILABLE_CJK_FONTS[0],
	cyrillic: AVAILABLE_CJK_FONTS[0],
	devanagari: { id: 'Noto Sans Devanagari', label: 'Noto Sans Devanagari', sub: 'Bundled Hindi / Devanagari', bundled: true, supportedWeights: ['normal', 'bold'], scripts: ['devanagari'] },
	thai: { id: 'Noto Sans Thai', label: 'Noto Sans Thai', sub: 'Bundled Thai', bundled: true, supportedWeights: ['normal', 'bold'], scripts: ['thai'] },
	arabic: { id: 'Tajawal', label: 'Tajawal', sub: 'Bundled Arabic', bundled: true, supportedWeights: ['normal', 'bold'], scripts: ['arabic', 'latin'] },
};

/** EACH BUNDLED SCRIPT FONT ONCE (THE FONT LIBRARY LISTS THEM BESIDE THE BUNDLED DIALOGUE FONTS, FEAT-010). */
export function bundledScriptFontOptions(): TypesetFontOption[] {
	const seen = new Set<string>();
	return Object.values(BUNDLED_SCRIPT_FONT_OPTIONS).filter((f): f is TypesetFontOption => Boolean(f) && !seen.has(f!.id) && Boolean(seen.add(f!.id)));
}

/** THE FAMILY A PREVIEW SHOULD USE FOR A SCRIPT: THE USER'S CHOICE, ELSE THE BUNDLED FONT. */
export function scriptPreviewFamily(slot: ScriptFontSlot, scriptFonts: Partial<Record<ScriptFontSlot, string>> = {}): string | undefined {
	return scriptFonts[slot] || BUNDLED_SCRIPT_FONT_OPTIONS[slot]?.id;
}

/**
 * FONTS OFFERED FOR ONE SCRIPT SLOT: THE BUNDLED ONE, THEN CUSTOM AND ENABLED SYSTEM FONTS WHOSE `scripts` INCLUDE
 * IT. DATA WITHOUT `scripts` (OLDER UPLOADS / SERVERS) FALLS BACK TO THE OLD CJK CATEGORY FOR THE CJK SLOTS.
 */
export function getMergedScriptFonts(
	script: ScriptFontSlot,
	customFonts: CustomFontItem[],
	enabledSystemFonts: string[] = [],
	systemFonts: SystemFontInfo[] = []
): TypesetFontOption[] {
	const covers = (scripts: Script[] | undefined, legacyCjk: boolean) =>
		scripts ? scripts.includes(script) : CJK_SLOTS.has(script) && legacyCjk;
	const options: TypesetFontOption[] = [];
	const bundled = BUNDLED_SCRIPT_FONT_OPTIONS[script];
	if (bundled) options.push(bundled);
	for (const f of customFonts) {
		if (!covers(f.scripts, f.scriptType === 'cjk')) continue;
		options.push({
			id: f.name,
			label: f.name,
			sub: f.variants && f.variants.length > 0 ? `Multi-weight (${f.variants.length + 1} files)` : 'Imported Font',
			stack: `"${f.name}", sans-serif`,
			custom: true,
			customId: f.id,
			scriptType: f.scriptType,
			supportedWeights: f.supportedWeights,
			isVariable: f.isVariable,
			variants: f.variants,
			scripts: f.scripts,
		});
	}
	for (const familyName of enabledSystemFonts) {
		const info = systemFonts.find((s) => s.family.toLowerCase() === familyName.toLowerCase());
		if (!covers(info?.scripts, isSystemFontCjk(familyName, systemFonts))) continue;
		options.push({
			id: familyName,
			label: familyName,
			sub: 'System Installed Font',
			stack: `"${familyName}", sans-serif`,
			system: true,
			supportedWeights: info?.supportedWeights || ['normal', 'bold'],
			scripts: info?.scripts,
		});
	}
	const seen = new Set<string>();
	return options.filter((o) => !seen.has(o.id) && (seen.add(o.id), true));
}

export const fontAvailabilityStore = writable<Record<string, FontAvailabilityStatus>>({
	'CC Wild Words': { available: true, bundled: true, note: 'Bundled comic dialogue font', supportedWeights: ['normal'], allCapsOnly: true, supportedCasings: ['uppercase'] },
	'Friendly Sans': { available: true, bundled: true, note: 'Bundled clean Latin / symbol fallback', supportedWeights: ['normal'] },
	'General Sans': { available: true, bundled: true, note: 'Bundled clean modern sans', supportedWeights: ['normal', 'bold'] },
	'Poppins': { available: true, bundled: true, note: 'Bundled geometric rounded', supportedWeights: ['bold'] },
	'Montserrat': { available: true, bundled: true, note: 'Bundled bold contemporary', supportedWeights: ['bold'] },
	'Lexend': { available: true, bundled: true, note: 'Bundled high legibility', supportedWeights: ['bold'] },
	'WenQuanYi Micro Hei': { available: true, bundled: true, note: 'Bundled universal CJK engine', supportedWeights: ['normal', 'bold'] },
});

/** TRUE ONCE THE FONT CATALOG (SYSTEM + CUSTOM FONTS) HAS BEEN FETCHED FROM THE SERVER. */
export const fontCatalogLoaded = writable(false);

export interface EffectiveTypeset {
	/** THE SELECTED DIALOGUE FONT, OR null WHEN ITS ID IS NOT (YET) IN THE CATALOG. */
	font: TypesetFontOption | null;
	fontKnown: boolean;
	weight: TypesetFontWeight;
	casing: TypesetCasing;
	supportedWeights: string[];
	supportedCasings?: TypesetCasing[];
	isAllCaps: boolean;
	isLowercaseOnly: boolean;
	catalogLoaded: boolean;
}

/**
 * THE TYPESET STYLE THAT WILL ACTUALLY BE USED, DERIVED AND NEVER WRITTEN BACK (FEAT-009 ADR-004): A FALLBACK FOR A
 * FONT THAT CANNOT DO THE STORED WEIGHT OR CASING IS COMPUTED HERE, SO A FONT THAT IS SIMPLY NOT LOADED YET NEVER
 * OVERWRITES THE USER'S CHOICE. AN UNKNOWN FONT KEEPS THE STORED VALUES.
 */
export function resolveEffectiveTypeset(
	s: Pick<AppSettings, 'typesetFont' | 'typesetFontWeight' | 'typesetCasing'>,
	catalog: { dialogueFonts: TypesetFontOption[]; fontStatus: Record<string, FontAvailabilityStatus>; loaded: boolean },
): EffectiveTypeset {
	const font = catalog.dialogueFonts.find((f) => f.id === s.typesetFont) ?? null;
	const status = catalog.fontStatus[s.typesetFont];
	const supportedWeights = status?.supportedWeights || font?.supportedWeights || ['normal'];
	const isAllCaps = status?.allCapsOnly ?? font?.allCapsOnly ?? false;
	const isLowercaseOnly = status?.lowercaseOnly ?? font?.lowercaseOnly ?? false;
	const supportedCasings = status?.supportedCasings || font?.supportedCasings;
	const storedCasing: TypesetCasing =
		s.typesetCasing === 'lowercase' || s.typesetCasing === 'original' ? s.typesetCasing : 'uppercase';
	if (!font) {
		return {
			font: null,
			fontKnown: false,
			weight: normalizeFontWeightSelectValue(s.typesetFontWeight),
			casing: storedCasing,
			supportedWeights,
			supportedCasings,
			isAllCaps,
			isLowercaseOnly,
			catalogLoaded: catalog.loaded,
		};
	}
	return {
		font,
		fontKnown: true,
		weight: getValidFontWeightForFont(s.typesetFontWeight, supportedWeights, font.isVariable),
		casing: getValidCasingForFont(storedCasing, supportedCasings, isAllCaps, isLowercaseOnly),
		supportedWeights,
		supportedCasings,
		isAllCaps,
		isLowercaseOnly,
		catalogLoaded: catalog.loaded,
	};
}

export async function refreshFontAvailability(): Promise<Record<string, FontAvailabilityStatus>> {
	try {
		const res = await fetch('/api/system/fonts');
		if (res.ok) {
			const data = await res.json();
			if (data.fonts) {
				fontAvailabilityStore.set(data.fonts);
			}
			if (data.customFonts && Array.isArray(data.customFonts)) {
				const items: CustomFontItem[] = data.customFonts.map((row: any) => {
					let supportedWeights: ('normal' | 'bold')[] = ['normal'];
					try {
						supportedWeights = typeof row.supportedWeights === 'string' ? JSON.parse(row.supportedWeights) : row.supportedWeights;
					} catch {}
					// SCRIPTS THE FILE COVERS (A JSON STRING FROM THE DB ROW). WITHOUT THEM A FONT THAT ALSO HAS LATIN LETTERS NEVER
					// SHOWED UP IN ITS SCRIPT SLOT OR IN THE SCRIPT FONTS LIST, SO IT COULD ONLY BE DELETED FROM THE DIALOGUE GRID
					let scripts: Script[] | undefined;
					try {
						const parsed = typeof row.scripts === 'string' ? JSON.parse(row.scripts) : row.scripts;
						if (Array.isArray(parsed)) scripts = parsed.filter((sc: unknown): sc is Script => typeof sc === 'string');
					} catch {}
					return {
						id: row.id,
						name: row.name,
						fileName: row.fileName,
						format: row.format,
						scriptType: row.scriptType,
						fileSize: row.fileSize,
						supportedWeights,
						isVariable: Boolean(row.isVariable),
						variants: Array.isArray(row.variants) ? row.variants : [],
						scripts,
					};
				});
				customFontsStore.set(items);
				for (const item of items) {
					loadBrowserFontFace(item);
				}
			}
			fontCatalogLoaded.set(true);
			if (data.fonts) {
				return data.fonts;
			}
		}
	} catch {
		// FALLBACK: PRESERVE DEFAULT BUNDLED STATUS
	}
	return get(fontAvailabilityStore);
}

export const ACCENT_SOLID = 'bg-[#b23a2e] text-white hover:bg-[#c0392b]';

export function resetSettings() {
	settings.set({ ...DEFAULTS });
}

export const FONT_STACKS: Record<AppFont, string> = {
	comic: "'CC Wild Words', 'WildWorld', 'Montserrat', sans-serif",
	clash: "'Clash Grotesk', 'Cabinet Grotesk', sans-serif",
	general: "'General Sans', sans-serif",
	poppins: "'Poppins', sans-serif",
	proxima: "'Proxima Nova', 'Montserrat', sans-serif",
	nunito: "'Nunito Sans', sans-serif",
	montserrat: "'Montserrat', sans-serif",
	lexend: "'Lexend', sans-serif",
};

export const INPUT_FONT_STACKS: Record<AppFont, string> = {
	comic: "'Montserrat', 'Inter', system-ui, sans-serif",
	clash: "'Clash Grotesk', 'Cabinet Grotesk', sans-serif",
	general: "'General Sans', sans-serif",
	poppins: "'Poppins', sans-serif",
	proxima: "'Proxima Nova', 'Montserrat', sans-serif",
	nunito: "'Nunito Sans', sans-serif",
	montserrat: "'Montserrat', sans-serif",
	lexend: "'Lexend', sans-serif",
};

export const FONT_CLASSES: Record<AppFont, string> = {
	comic: 'font-comic',
	clash: 'font-clash',
	general: 'font-general',
	poppins: 'font-poppins',
	proxima: 'font-sans',
	nunito: 'font-nunito',
	montserrat: 'font-montserrat',
	lexend: 'font-lexend',
};

export const THEME_PREVIEWS: Record<Theme, { name: string; bg: string; surface: string; border: string; text: string; subtext: string; accent: string }> = {
	auto: {
		name: 'Auto',
		bg: 'bg-[#faf8f5] dark:bg-[#141210]',
		surface: 'bg-[#f4efe8] dark:bg-[#1c1917]',
		border: 'border-[#dfd7cc] dark:border-neutral-800',
		text: 'text-slate-800 dark:text-slate-200',
		subtext: 'text-slate-500 dark:text-neutral-500',
		accent: 'bg-[#b23a2e]',
	},
	light: {
		name: 'Light',
		bg: 'bg-[#faf8f5]',
		surface: 'bg-[#f4efe8]',
		border: 'border-[#dfd7cc]',
		text: 'text-slate-800',
		subtext: 'text-slate-500',
		accent: 'bg-[#b23a2e]',
	},
	sepia: {
		name: 'Sepia',
		bg: 'bg-[#f4ede2]',
		surface: 'bg-[#ebe2d3]',
		border: 'border-[#d8ccb8]',
		text: 'text-slate-800',
		subtext: 'text-slate-500',
		accent: 'bg-[#b23a2e]',
	},
	dark: {
		name: 'Dark',
		bg: 'bg-[#141210]',
		surface: 'bg-[#1c1917]',
		border: 'border-neutral-800',
		text: 'text-slate-200',
		subtext: 'text-neutral-500',
		accent: 'bg-[#b23a2e]',
	},
};

export const FONT_OPTIONS: Array<{ id: AppFont; name: string; tag: string; description: string }> = [
	{ id: 'comic', name: 'Anime Ace', tag: 'Manga / Comic', description: 'Classic comic-book lettering' },
	{ id: 'clash', name: 'Clash Grotesk', tag: 'Modern / Display', description: 'Striking contemporary sans' },
	{ id: 'general', name: 'General Sans', tag: 'Neutral / Clean', description: 'Balanced high-legibility UI sans' },
	{ id: 'poppins', name: 'Poppins', tag: 'Geometric', description: 'Clean modern geometric sans' },
	{ id: 'proxima', name: 'Plus Jakarta Sans', tag: 'Modern UI', description: 'Crisp contemporary interface font' },
	{ id: 'nunito', name: 'Nunito', tag: 'Rounded / Soft', description: 'Friendly rounded sans-serif' },
	{ id: 'montserrat', name: 'Montserrat', tag: 'Classic Sans', description: 'Versatile modernist sans' },
	{ id: 'lexend', name: 'Lexend', tag: 'High Legibility', description: 'Optimized reading proficiency font' },
];

export const ACCENT_TEXT = 'text-[#b23a2e] dark:text-[#e08a63]';
export const ACCENT_SOFT = 'bg-[#b23a2e]/12 text-[#b23a2e] dark:text-[#e08a63]';
export const ACCENT_RING = 'focus:ring-2 focus:ring-[#b23a2e]/40';
export const JADE_TEXT = 'text-[#4f7a64] dark:text-[#83b39a]';
export const JADE_SOFT = 'bg-[#5b8a72]/14 text-[#4f7a64] dark:text-[#83b39a]';
export const GOLD_TEXT = 'text-[#a97f28] dark:text-[#d8b15a]';
export const GOLD_SOFT = 'bg-[#c9a24b]/16 text-[#a97f28] dark:text-[#d8b15a]';

// -- STORES -- //

export const settings = createSettings();

// -- FUNCTIONS -- //

export function isDarkTheme(theme: Theme): boolean {
	if (theme === 'auto') {
		if (browser && typeof window !== 'undefined' && window.matchMedia) {
			return window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		return false;
	}
	return theme === 'dark';
}

export function resolveTheme(theme: Theme): 'light' | 'sepia' | 'dark' {
	if (theme !== 'auto') return theme;
	if (browser && typeof window !== 'undefined' && window.matchMedia) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return 'light';
}

export function applyThemeClass(theme: Theme): void {
	if (!browser || typeof document === 'undefined') return;
	const isDark = isDarkTheme(theme);
	const root = document.documentElement;
	const body = document.body;

	if (isDark) {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}

	root.style.colorScheme = isDark ? 'dark' : 'light';
	const resolved = resolveTheme(theme);
	const bg = THEME_BG[resolved] || (isDark ? THEME_BG.dark : THEME_BG.light);
	root.style.backgroundColor = bg;
	if (body) {
		body.style.backgroundColor = bg;
	}
}

export function applyFontFamily(font: AppFont): void {
	if (!browser || typeof document === 'undefined') return;
	const fontStack = FONT_STACKS[font] || FONT_STACKS.comic;
	const inputFontStack = INPUT_FONT_STACKS[font] || INPUT_FONT_STACKS.comic;
	const root = document.documentElement;
	root.style.setProperty('--app-font-family', fontStack);
	root.style.setProperty('--app-input-font-family', inputFontStack);
}

export function setCookie(name: string, value: string, maxAgeDays = 365): void {
	if (!browser || typeof document === 'undefined') return;
	const maxAge = maxAgeDays * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** KEEPS ONLY KNOWN SCRIPT SLOTS WITH A NON-EMPTY FAMILY NAME OF AT MOST 128 CHARACTERS. */
export function sanitizeScriptFonts(value: unknown): Partial<Record<ScriptFontSlot, string>> {
	const out: Partial<Record<ScriptFontSlot, string>> = {};
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
	for (const slot of SCRIPT_FONT_SLOTS) {
		const family = (value as Record<string, unknown>)[slot];
		if (typeof family === 'string' && family.trim() && family.length <= 128) out[slot] = family.trim();
	}
	return out;
}

/** ACCENT FONTS: 'latin' PLUS THE SCRIPT SLOTS, EACH A NON-EMPTY FAMILY NAME OF AT MOST 128 CHARACTERS (FEAT-010). */
export function sanitizeAccentFonts(value: unknown): Partial<Record<Script, string>> {
	const out: Partial<Record<Script, string>> = {};
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
	for (const script of ['latin', ...SCRIPT_FONT_SLOTS] as Script[]) {
		const family = (value as Record<string, unknown>)[script];
		if (typeof family === 'string' && family.trim() && family.length <= 128) out[script] = family.trim();
	}
	return out;
}

/**
 * THE SETTINGS CHANGES WHEN A FONT IS DELETED OR A SYSTEM FONT IS DISABLED (FEAT-010 REVIEW H8): THE DIALOGUE AND
 * LEGACY CJK FONTS GO BACK TO THEIR DEFAULTS, SCRIPT SLOTS TO AUTOMATIC AND ACCENT SLOTS TO OFF. ONLY CHANGED KEYS ARE
 * RETURNED. `disableSystem` ALSO DROPS THE FAMILY FROM THE ENABLED SYSTEM FONTS.
 */
export function fontRemovalPatch(
	s: Pick<AppSettings, 'typesetFont' | 'typesetCjkFont' | 'typesetScriptFonts' | 'typesetAccentFonts' | 'enabledSystemFonts'>,
	family: string,
	options: { disableSystem?: boolean } = {},
): Partial<AppSettings> {
	const patch: Partial<AppSettings> = {};
	if (s.typesetFont === family) patch.typesetFont = DEFAULTS.typesetFont;
	if (s.typesetCjkFont === family) patch.typesetCjkFont = DEFAULTS.typesetCjkFont;
	const scriptFonts = s.typesetScriptFonts ?? {};
	const keptScript = Object.fromEntries(Object.entries(scriptFonts).filter(([, f]) => f !== family));
	if (Object.keys(keptScript).length !== Object.keys(scriptFonts).length) patch.typesetScriptFonts = keptScript;
	const accentFonts = s.typesetAccentFonts ?? {};
	const keptAccent = Object.fromEntries(Object.entries(accentFonts).filter(([, f]) => f !== family));
	if (Object.keys(keptAccent).length !== Object.keys(accentFonts).length) patch.typesetAccentFonts = keptAccent;
	if (options.disableSystem) {
		const enabled = s.enabledSystemFonts ?? [];
		if (enabled.includes(family)) patch.enabledSystemFonts = enabled.filter((f) => f !== family);
	}
	return patch;
}

/** VALUE EQUALITY FOR SETTINGS: OBJECTS AND ARRAYS COMPARE BY CONTENT, SO AN UNCHANGED MAP NEVER RE-SYNCS. */
export function settingEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	return false;
}

/** READS A STORED SETTINGS OBJECT: UNKNOWN KEYS DROPPED, WRONG TYPES DEFAULTED, OLD VERSIONS UPGRADED. */
export function mergeKnownSettings(parsed: unknown): AppSettings {
	return mergeKnown(parsed);
}

function mergeKnown(parsed: unknown): AppSettings {
	const out: AppSettings = { ...DEFAULTS };
	if (typeof parsed !== 'object' || parsed === null) return out;
	const rec = parsed as Record<string, unknown>;

	for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
		if (key in rec) {
			const val = rec[key];
			const def = DEFAULTS[key];
			if (def === null) {
				if (typeof val === 'number' || val === null) {
					(out as unknown as Record<string, unknown>)[key] = val;
				}
			} else if (typeof val === typeof def) {
				(out as unknown as Record<string, unknown>)[key] = val;
			}
		}
	}

	if ((parsed as any)?.version < 11 && (parsed as any)?.typesetPadding === 0.08) {
		out.typesetPadding = 0.05;
	}
	if ((parsed as any)?.version < 11 && (parsed as any)?.parallelProcesses === 3) {
		out.parallelProcesses = 2;
	}
	out.typesetScriptFonts = sanitizeScriptFonts(out.typesetScriptFonts);
	out.typesetAccentFonts = sanitizeAccentFonts(out.typesetAccentFonts);
	// VERSION 12: A CUSTOM CJK FONT BECOMES THE han / kana / hangul SCRIPT SLOTS
	if ((parsed as any)?.version < 12 && out.typesetCjkFont && out.typesetCjkFont !== DEFAULTS.typesetCjkFont) {
		const slots = out.typesetScriptFonts;
		if (!slots.han && !slots.kana && !slots.hangul) {
			out.typesetScriptFonts = { ...slots, han: out.typesetCjkFont, kana: out.typesetCjkFont, hangul: out.typesetCjkFont };
		}
	}
	out.version = DEFAULTS.version;
	return out;
}

function load(): AppSettings {
	if (!browser || typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return mergeKnown(parsed);
		}
	} catch {
		// Ignore corrupted state
	}
	return { ...DEFAULTS };
}

function createSettings() {
	const initial = load();
	const store = writable<AppSettings>(initial);
	let isRemoteSyncing = false;
	let lastSyncedCanonical: Partial<AppSettings> = {};
	let syncTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingServerSyncPatch: Partial<AppSettings> = {};
	const userModifiedKeys = new Set<keyof AppSettings>();

	// Cross-tab broadcast channel
	let broadcastChannel: BroadcastChannel | null = null;
	if (browser && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
		try {
			broadcastChannel = new BroadcastChannel('xianscan_settings_channel');
			broadcastChannel.onmessage = (event) => {
				if (event?.data && typeof event.data === 'object') {
					isRemoteSyncing = true;
					store.update((local) => {
						const safePatch: Partial<AppSettings> = {};
						for (const k of SERVER_CANONICAL_KEYS) {
							if (k in event.data) {
								(safePatch as any)[k] = event.data[k];
							}
						}
						return { ...local, ...safePatch };
					});
					isRemoteSyncing = false;
				}
			};
		} catch {
			// Channel unavailable in restricted context
		}
	}

	// Populate initial canonical snapshot
	for (const k of SERVER_CANONICAL_KEYS) {
		lastSyncedCanonical[k] = initial[k] as any;
	}

	function flushServerSync() {
		if (Object.keys(pendingServerSyncPatch).length === 0) return;
		if (!browser || typeof fetch === 'undefined') return;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

		const patchToSend = { ...pendingServerSyncPatch };
		pendingServerSyncPatch = {};

		fetch('/api/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patchToSend),
			keepalive: true,
		}).catch(() => {
			// Re-queue on network error
			pendingServerSyncPatch = { ...patchToSend, ...pendingServerSyncPatch };
		});
	}

	if (browser && typeof window !== 'undefined') {
		let prevTheme: Theme | null = null;
		let prevFont: AppFont | null = null;
		let prevEnabledSystemFonts = '';

		// INITIAL APPLICATION
		applyThemeClass(initial.theme);
		applyFontFamily(initial.appFont);
		prevTheme = initial.theme;
		prevFont = initial.appFont;

		// BFCACHE RESTORATION
		window.addEventListener('pageshow', (event) => {
			if (event.persisted) {
				const fresh = load();
				store.update((current) => ({ ...current, ...fresh }));
			}
		});

		// SYSTEM COLOR SCHEME PREFERENCE LISTENER (FOR AUTO THEME)
		if (typeof window.matchMedia !== 'undefined') {
			const mql = window.matchMedia('(prefers-color-scheme: dark)');
			mql.addEventListener?.('change', () => {
				const current = get(store);
				if (current.theme === 'auto') {
					applyThemeClass('auto');
				}
			});
		}

		// BACKGROUNDING & PAGEHIDE FLUSH
		window.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				if (syncTimeout) {
					clearTimeout(syncTimeout);
					syncTimeout = null;
				}
				flushServerSync();
			}
		});

		window.addEventListener('pagehide', () => {
			if (syncTimeout) {
				clearTimeout(syncTimeout);
				syncTimeout = null;
			}
			flushServerSync();
		});

		// RECONNECTION HANDLER
		window.addEventListener('online', () => {
			const current = load();
			for (const k of SERVER_CANONICAL_KEYS) {
				if (!settingEquals(current[k], lastSyncedCanonical[k])) {
					pendingServerSyncPatch[k] = current[k] as any;
				}
			}
			flushServerSync();
		});

		store.subscribe((s) => {
			try {
				localStorage.setItem(KEY, JSON.stringify(s));
				// MIRROR ONLY ESSENTIAL SSR VISUAL COOKIES (<1KB TOTAL HEADER IMPACT)
				setCookie(THEME_COOKIE, s.theme);
				setCookie(FONT_COOKIE, s.appFont);
				setCookie(READER_VIEW_COOKIE, s.readerViewMode);
				setCookie(WEBTOON_KIND_COOKIE, s.webtoonKind);
				setCookie(WEBTOON_WIDTH_COOKIE, s.webtoonWidth);
				setCookie(INPAINT_MODE_COOKIE, s.inpaintMode);
				setCookie(WHITE_INPAINT_COOKIE, String(s.enableWhiteInpaint));
				setCookie(INPAINT_EXPANSION_COOKIE, String(s.inpaintExpansionPct));
				setCookie(TYPESET_CENTERING_COOKIE, String(s.enableTypesetCentering));
				if (s.typesetFontWeight) {
					setCookie(TYPESET_FONT_WEIGHT_COOKIE, s.typesetFontWeight);
				}
				setCookie(EXEC_DEVICE_COOKIE, s.executionDevice);
			} catch {
				// IGNORE STORAGE ERRORS (PRIVATE MODE / QUOTA)
			}

			// ONLY TOUCH THE DOCUMENT ROOT WHEN THE THEME OR FONT ACTUALLY CHANGED
			if (s.theme !== prevTheme) {
				prevTheme = s.theme;
				applyThemeClass(s.theme);
			}
			if (s.appFont !== prevFont) {
				prevFont = s.appFont;
				applyFontFamily(s.appFont);
			}

			// PRELOAD ENABLED SYSTEM FONTS IN THE BROWSER FOR THE TYPESET PREVIEW, ONLY WHEN THE LIST CHANGES
			// (THIS SUBSCRIBER RUNS ON EVERY SETTINGS WRITE)
			const enabledKey = Array.isArray(s.enabledSystemFonts) ? JSON.stringify(s.enabledSystemFonts) : '';
			if (enabledKey !== prevEnabledSystemFonts) {
				prevEnabledSystemFonts = enabledKey;
				for (const fam of s.enabledSystemFonts ?? []) {
					loadSystemBrowserFontFace(fam);
				}
			}

			// SYNC CANONICAL SERVER SETTINGS (WITH LOOP PROTECTION & ACCUMULATING DEBOUNCE)
			if (!isRemoteSyncing) {
				let hasChanges = false;

				for (const k of SERVER_CANONICAL_KEYS) {
					if (!settingEquals(s[k], lastSyncedCanonical[k])) {
						pendingServerSyncPatch[k] = s[k] as any;
						lastSyncedCanonical[k] = s[k] as any;
						userModifiedKeys.add(k);
						hasChanges = true;
					}
				}

				if (hasChanges) {
					// Broadcast to other open tabs
					try {
						broadcastChannel?.postMessage(pendingServerSyncPatch);
					} catch {
						// Ignore channel errors
					}

					if (syncTimeout) clearTimeout(syncTimeout);
					syncTimeout = setTimeout(() => {
						flushServerSync();
					}, 500);
				}
			}
		});
	}

	return {
		subscribe: store.subscribe,
		set: (value: AppSettings) => {
			for (const k of SERVER_CANONICAL_KEYS) {
				userModifiedKeys.add(k);
			}
			store.set(value);
		},
		update: (fn: (current: AppSettings) => AppSettings) => {
			store.update((current) => {
				const updated = fn(current);
				for (const k of SERVER_CANONICAL_KEYS) {
					if (!settingEquals(updated[k], current[k])) {
						userModifiedKeys.add(k);
					}
				}
				return updated;
			});
		},

		// Hydrate from SSR canonical server state with hydration race protection
		hydrateFromRemote(remoteSettings: Partial<AppSettings>) {
			if (!remoteSettings || typeof remoteSettings !== 'object') return;
			isRemoteSyncing = true;
			store.update((local) => {
				const merged: AppSettings = { ...local };
				for (const k of SERVER_CANONICAL_KEYS) {
					// If user already modified this key during early boot, preserve user choice
					if (userModifiedKeys.has(k)) continue;

					if (remoteSettings[k] !== undefined && remoteSettings[k] !== null) {
						(merged as any)[k] = remoteSettings[k];
						lastSyncedCanonical[k] = remoteSettings[k] as any;
					}
				}
				return merged;
			});
			isRemoteSyncing = false;
		},
	};
}

/** THE EFFECTIVE TYPESET STYLE FOR THE CURRENT SETTINGS AND FONT CATALOG (SEE resolveEffectiveTypeset). */
export const effectiveTypeset = derived(
	[settings, customFontsStore, systemFontsStore, fontAvailabilityStore, fontCatalogLoaded],
	([$settings, $custom, $system, $status, $loaded]) =>
		resolveEffectiveTypeset($settings, {
			dialogueFonts: getMergedDialogueFonts($custom, $settings.enabledSystemFonts, $system),
			fontStatus: $status,
			loaded: $loaded,
		}),
);
