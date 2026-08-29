// SETTINGS STORE WITH SCHEMA VERSIONING & SAFE PROGRESSIVE UPGRADE
// Manages application preferences with SQLite synchronization and cookie mirroring.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

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

export type LibraryLayout = 'grid' | 'list' | 'compact';

export type LibrarySort = 'recent' | 'title_asc' | 'title_desc' | 'chapters_desc' | 'chapters_asc';

export type ChapterLayout = 'grid' | 'list' | 'compact';

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
	// ADVANCED TYPESETTING & INPAINTING CONFIGURATION
	typesetFont: string;
	typesetCjkFont: string;
	typesetPadding: number;
	typesetOutline: TypesetOutline;
	typesetContrast: TypesetContrast;
	typesetCasing: TypesetCasing;
	typesetPreviewText: string;
	typesetPreviewPreset: string;
	typesetAllCaps: boolean;
	enableTextRotation: boolean;
	inpaintExpansionPct: number;
	typesetExpansionPct: number;
	hasCompletedOnboarding: boolean;
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
		label: 'Balanced (512x512)',
		tag: 'Fast - Standard',
		badgeColor: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300',
		blurb: 'Standard quality for low-end hardware. Downsamples canvas to 512x512 before inpainting and upscales; fast and memory-efficient.',
	},
	{
		id: 'full',
		label: 'Full Dynamic',
		tag: 'Slowest - Full Canvas',
		badgeColor: 'text-sky-700 bg-sky-500/10 border-sky-500/30 dark:text-sky-300',
		blurb: 'Highest global context quality. Inpaints the entire uncut image in one pass for seamless full-page texture blending; requires high VRAM and compute.',
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
	version: 11,
	model: 'qwen2.5:7b',
	inpaintMode: 'patch',
	theme: 'sepia',
	appFont: 'comic',
	readerViewMode: 'reader',
	webtoonKind: 'output',
	webtoonWidth: 'md',
	libraryLayout: 'grid',
	librarySort: 'recent',
	chapterLayout: 'grid',
	chapterSortAsc: true,
	executionDevice: 'auto',
	cudaVramLimitMb: null,
	parallelProcesses: 2,
	parallelChapters: 1,
	resliceBeforeBatch: true,
	sourceLang: 'zh-Hans',
	targetLang: 'en',
	typesetFont: 'CC Wild Words',
	typesetCjkFont: 'WenQuanYi Micro Hei',
	typesetPadding: 0.05,
	typesetOutline: 'standard',
	typesetContrast: 'auto',
	typesetCasing: 'uppercase',
	typesetPreviewText: 'Hold on! What is this Cultivation Realm...?!',
	typesetPreviewPreset: 'en',
	typesetAllCaps: true,
	enableTextRotation: true,
	inpaintExpansionPct: 0.03,
	typesetExpansionPct: 0.0,
	hasCompletedOnboarding: false,
};

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
	'typesetFont',
	'typesetCjkFont',
	'typesetPadding',
	'typesetOutline',
	'typesetContrast',
	'typesetCasing',
	'typesetPreviewText',
	'typesetPreviewPreset',
	'typesetAllCaps',
	'enableTextRotation',
	'inpaintExpansionPct',
	'typesetExpansionPct',
	'hasCompletedOnboarding',
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
export const WATERMARK_INPAINT_COOKIE = 'mt_watermark_inpaint';
export const EXEC_DEVICE_COOKIE = 'mt_exec_device';
export const PARALLEL_PROCESSES_COOKIE = 'mt_parallel_processes';
export const PARALLEL_CHAPTERS_COOKIE = 'mt_parallel_chapters';
export const RESLICE_BEFORE_BATCH_COOKIE = 'mt_reslice_batch';
export const TYPESET_FONT_COOKIE = 'mt_ts_font';
export const TYPESET_CJK_FONT_COOKIE = 'mt_ts_cjk_font';
export const TYPESET_PADDING_COOKIE = 'mt_ts_padding';
export const TYPESET_OUTLINE_COOKIE = 'mt_ts_outline';
export const TYPESET_CONTRAST_COOKIE = 'mt_ts_contrast';
export const TYPESET_CASING_COOKIE = 'mt_ts_casing';
export const TYPESET_ALL_CAPS_COOKIE = 'mt_ts_allcaps';
export const TYPESET_ROTATION_COOKIE = 'mt_ts_rot';
export const INPAINT_EXPANSION_COOKIE = 'mt_inpaint_exp';
export const TYPESET_EXPANSION_COOKIE = 'mt_typeset_exp';

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
	label: string;
	sub: string;
	stack?: string;
	allCapsOnly?: boolean;
	bundled?: boolean;
}

export const AVAILABLE_TYPESET_FONTS: TypesetFontOption[] = [
	{ id: 'CC Wild Words', label: 'CC Wild Words', sub: 'Classic Comic All-Caps', stack: "'CC Wild Words', 'WildWorld', sans-serif", allCapsOnly: true, bundled: true },
	{ id: 'Friendly Sans', label: 'Friendly Sans', sub: 'Clean Comic Sans-Serif', stack: "'Friendly Sans', sans-serif", bundled: true },
	{ id: 'General Sans', label: 'General Sans', sub: 'Clean Modern Sans', stack: "'General Sans', sans-serif", bundled: true },
	{ id: 'Poppins', label: 'Poppins', sub: 'Geometric Rounded', stack: "'Poppins', sans-serif", bundled: true },
	{ id: 'Montserrat', label: 'Montserrat', sub: 'Bold Contemporary', stack: "'Montserrat', sans-serif", bundled: true },
	{ id: 'Lexend', label: 'Lexend', sub: 'High Legibility', stack: "'Lexend', sans-serif", bundled: true },
];

export const AVAILABLE_CJK_FONTS: TypesetFontOption[] = [
	{ id: 'WenQuanYi Micro Hei', label: 'WenQuanYi Micro Hei', sub: 'Bundled Universal CJK Engine', bundled: true },
	{ id: 'Microsoft YaHei', label: 'Microsoft YaHei', sub: 'Chinese Simplified & Traditional' },
	{ id: 'Yu Gothic', label: 'Yu Gothic', sub: 'Japanese Manga Standard' },
	{ id: 'Malgun Gothic', label: 'Malgun Gothic', sub: 'Korean Hangul Manhwa' },
	{ id: 'Noto Sans CJK SC', label: 'Noto Sans CJK', sub: 'Universal CJK (Linux / Noto)' },
	{ id: 'Friendly Sans', label: 'Friendly Sans', sub: 'Clean Latin / Symbol Fallback', bundled: true },
];

export interface FontAvailabilityStatus {
	available: boolean;
	bundled: boolean;
	note: string;
}

export const fontAvailabilityStore = writable<Record<string, FontAvailabilityStatus>>({
	'CC Wild Words': { available: true, bundled: true, note: 'Bundled comic dialogue font' },
	'Friendly Sans': { available: true, bundled: true, note: 'Bundled clean Latin / symbol fallback' },
	'General Sans': { available: true, bundled: true, note: 'Bundled clean modern sans' },
	'Poppins': { available: true, bundled: true, note: 'Bundled geometric rounded' },
	'Montserrat': { available: true, bundled: true, note: 'Bundled bold contemporary' },
	'Lexend': { available: true, bundled: true, note: 'Bundled high legibility' },
	'WenQuanYi Micro Hei': { available: true, bundled: true, note: 'Bundled universal CJK engine' },
});

export async function refreshFontAvailability(): Promise<Record<string, FontAvailabilityStatus>> {
	try {
		const res = await fetch('/api/system/fonts');
		if (res.ok) {
			const data = await res.json();
			if (data.fonts) {
				fontAvailabilityStore.set(data.fonts);
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
	out.version = DEFAULTS.version;
	return out;
}

function load(): AppSettings {
	if (!browser || typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY) || localStorage.getItem('manua:settings');
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
				if (current[k] !== lastSyncedCanonical[k]) {
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

			// SYNC CANONICAL SERVER SETTINGS (WITH LOOP PROTECTION & ACCUMULATING DEBOUNCE)
			if (!isRemoteSyncing) {
				let hasChanges = false;

				for (const k of SERVER_CANONICAL_KEYS) {
					if (s[k] !== lastSyncedCanonical[k]) {
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
					if (updated[k] !== current[k]) {
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
