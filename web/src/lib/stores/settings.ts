// IMPORTED ENVS
import { browser } from '$app/environment';
// IMPORTED DEP-MODULES
import { writable } from 'svelte/store';
// IMPORTED MODULES
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';

// -- TYPES -- //

export type Theme = 'light' | 'sepia' | 'dark';
export type AppFont = 'comic' | 'clash' | 'general' | 'poppins' | 'proxima' | 'nunito' | 'montserrat' | 'lexend';
export type InpaintMode = 'patch' | 'scaled' | 'full';
export type ExecutionDevice = 'auto' | 'cuda' | 'dml' | 'coreml' | 'cpu';
export type TypesetOutline = 'none' | 'thin' | 'standard' | 'heavy';
export type TypesetContrast = 'auto' | 'dark' | 'light';
export type TypesetCasing = 'uppercase' | 'original' | 'lowercase';

export interface AppSettings {
	version: number;
	theme: Theme;
	// APP INTERFACE TYPOGRAPHY FONT
	appFont: AppFont;
	// THE GLOBAL DEEPSEEK MODEL THE TRANSLATE PIPELINE USES (flash = fast/cheap, pro = best). SENT WITH
	// EVERY TRANSLATE REQUEST; THE SERVER VALIDATES IT AGAINST ITS ALLOWLIST (src/lib/server/deepseek).
	model: string;
	// INPAINTING STRATEGY (patch = fast & native sharp, scaled = 512x512 balanced, full = dynamic canvas)
	inpaintMode: InpaintMode;
	// HARDWARE EXECUTION ACCELERATOR FOR ML MODELS
	executionDevice: ExecutionDevice;
	// PARALLEL PROCESSES (WORKERS) FOR BATCH AND CHAPTER TRANSLATION
	parallelProcesses: number; // Parallel page workers per chapter (1 to 8, default 2)
	parallelChapters: number; // Parallel chapters in batch queue (1 to 4, default 1)
	resliceBeforeBatch: boolean; // Auto smart-reslice chapter pages before batch translation begins (default false)
	// DEFAULT TRANSLATION DIRECTION FOR NEWLY CREATED BOOKS (PER-BOOK OVERRIDES AT CREATION)
	sourceLang: string;
	targetLang: string;
	// PERSISTENT READER CONFIGURATIONS
	readerViewMode: 'reader' | 'grid' | 'compare';
	webtoonKind: 'output' | 'original';
	webtoonWidth: 'sm' | 'md' | 'lg';
	// TYPESETTING & LETTERING STUDIO CONFIGURATIONS
	typesetFont: string; // Primary Latin dialogue font (default 'CC Wild Words')
	typesetCjkFont: string; // CJK East Asian fallback font (default 'Friendly Sans')
	typesetPadding: number; // Bubble inset padding margin ratio (default 0.05)
	typesetFontScale: number; // Sizing multiplier (default 1.0)
	typesetOutline: TypesetOutline; // Outline stroke weight ('none' | 'thin' | 'standard' | 'heavy')
	typesetContrast: TypesetContrast; // Color contrast mode ('auto' | 'dark' | 'light')
	typesetCasing: TypesetCasing; // Casing mode ('uppercase' | 'original' | 'lowercase')
	typesetPreviewText: string; // Persistent preview dialogue text
	typesetPreviewPreset: string; // Active preview language preset ('en' | 'zh-hans' | 'zh-hant' | 'ja' | 'ko' | 'custom')
	typesetAllCaps?: boolean; // Deprecated alias
	enableTextRotation: boolean; // Follow detected bubble angle (default true)
}

// CLIENT-FACING MODEL CHOICES FOR THE GLOBAL PICKER. THE IDS MIRROR THE SERVER DEFAULTS IN
// $lib/server/deepseek (resolveModel VALIDATES WHATEVER THE CLIENT SENDS, SO A STALE ID IS SAFE).
export const TRANSLATION_MODELS: { id: string; label: string; blurb: string }[] = [
	{ id: 'deepseek-v4-flash', label: 'Flash', blurb: 'Ultra-fast (1-2s) — great for everyday comic translation' },
	{ id: 'deepseek-v4-pro', label: 'Pro', blurb: 'Flagship model — higher-quality prose for complex idioms' },
];

export const INPAINT_MODES: { id: InpaintMode; label: string; tag: string; badgeColor: string; blurb: string }[] = [
	{
		id: 'patch',
		label: 'Patch Crop',
		tag: 'Fastest · Recommended',
		badgeColor: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300',
		blurb: 'Fastest with native 1:1 sharpness. Inpaints localized dialogue bubble patches at full resolution, keeping the rest of the page pristine with minimal latency.',
	},
	{
		id: 'scaled',
		label: 'Balanced (512×512)',
		tag: 'Fast · Standard',
		badgeColor: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300',
		blurb: 'Standard quality for low-end hardware. Downsamples canvas to 512×512 before inpainting and upscales; fast and memory-efficient.',
	},
	{
		id: 'full',
		label: 'Full Dynamic',
		tag: 'Slowest · Full Canvas',
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
		id: 'proxima',
		label: 'Proxima Nova',
		sample: 'Clean Editorial Sans',
		blurb: 'Modern proportions blending classic geometric and humanist sans',
		stack: "'Proxima Nova', 'Montserrat', sans-serif",
	},
	{
		id: 'nunito',
		label: 'Nunito Sans',
		sample: 'Balanced Rounded Sans',
		blurb: 'Highly readable modern sans-serif optimized for reading UI',
		stack: "'Nunito Sans', sans-serif",
	},
	{
		id: 'montserrat',
		label: 'Montserrat',
		sample: 'Urban Modern Sans',
		blurb: 'Bold geometric typeface inspired by classic urban posters',
		stack: "'Montserrat', sans-serif",
	},
	{
		id: 'lexend',
		label: 'Lexend',
		sample: 'Fluent Reading Sans',
		blurb: 'Engineered specifically to reduce visual stress and improve readability',
		stack: "'Lexend', sans-serif",
	},
];

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

// INPUT/TEXTAREA FONT STACKS — EXEMPTS ALL-CAPS COMIC FONTS SO TYPING CASE IS CLEAR
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

export const AVAILABLE_TYPESET_FONTS = [
	{ id: 'CC Wild Words', label: 'CC Wild Words', sub: 'Classic Comic All-Caps', stack: "'CC Wild Words', 'WildWorld', sans-serif", allCapsOnly: true },
	{ id: 'General Sans', label: 'General Sans', sub: 'Clean Modern Sans', stack: "'General Sans', sans-serif" },
	{ id: 'Poppins', label: 'Poppins', sub: 'Geometric Rounded', stack: "'Poppins', sans-serif" },
	{ id: 'Proxima Nova', label: 'Proxima Nova', sub: 'Editorial Clean', stack: "'Proxima Nova', sans-serif" },
	{ id: 'Montserrat', label: 'Montserrat', sub: 'Bold Contemporary', stack: "'Montserrat', sans-serif" },
	{ id: 'Lexend', label: 'Lexend', sub: 'High Legibility', stack: "'Lexend', sans-serif" },
];

export const AVAILABLE_CJK_FONTS = [
	{ id: 'Friendly Sans', label: 'Friendly Sans', sub: 'Clean Universal CJK & Latin Fallback' },
	{ id: 'Yu Gothic', label: 'Yu Gothic', sub: 'Japanese Manga Standard' },
	{ id: 'Microsoft YaHei', label: 'Microsoft YaHei', sub: 'Chinese Simplified & Traditional' },
	{ id: 'Malgun Gothic', label: 'Malgun Gothic', sub: 'Korean Hangul Manhwa' },
];

// -- CONSTANTS -- //

// BUMP version WHEN DEFAULTS CHANGE — TRIGGERS A ONE-TIME MIGRATION OF SAVED SETTINGS
export const DEFAULTS: AppSettings = {
	version: 11,
	theme: 'sepia',
	appFont: 'comic',
	model: 'deepseek-v4-flash',
	inpaintMode: 'patch',
	executionDevice: 'auto',
	parallelProcesses: 2,
	parallelChapters: 1,
	resliceBeforeBatch: false,
	sourceLang: DEFAULT_SOURCE_LANG,
	targetLang: DEFAULT_TARGET_LANG,
	readerViewMode: 'reader',
	webtoonKind: 'output',
	webtoonWidth: 'md',
	typesetFont: 'CC Wild Words',
	typesetCjkFont: 'Friendly Sans',
	typesetPadding: 0.05,
	typesetFontScale: 1.0,
	typesetOutline: 'standard',
	typesetContrast: 'auto',
	typesetCasing: 'uppercase',
	typesetPreviewText: 'Hold on! What is this Cultivation Realm...?!',
	typesetPreviewPreset: 'en',
	typesetAllCaps: true,
	enableTextRotation: true,
};

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
export const EXEC_DEVICE_COOKIE = 'mt_exec_device';
export const PARALLEL_PROCESSES_COOKIE = 'mt_parallel_processes';
export const PARALLEL_CHAPTERS_COOKIE = 'mt_parallel_chapters';
export const RESLICE_BEFORE_BATCH_COOKIE = 'mt_reslice_batch';
export const TYPESET_FONT_COOKIE = 'mt_ts_font';
export const TYPESET_CJK_FONT_COOKIE = 'mt_ts_cjk_font';
export const TYPESET_PADDING_COOKIE = 'mt_ts_padding';
export const TYPESET_SCALE_COOKIE = 'mt_ts_scale';
export const TYPESET_OUTLINE_COOKIE = 'mt_ts_outline';
export const TYPESET_CONTRAST_COOKIE = 'mt_ts_contrast';
export const TYPESET_CASING_COOKIE = 'mt_ts_casing';
export const TYPESET_ALL_CAPS_COOKIE = 'mt_ts_allcaps';
export const TYPESET_ROTATION_COOKIE = 'mt_ts_rot';

export function setCookie(name: string, value: string): void {
	if (typeof document === 'undefined') return;
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

const DARK_THEMES: Theme[] = ['dark'];

// SINGLE SOURCE OF TRUTH FOR THEME SURFACE COLOURS — APPLIED APP-WIDE AT THE LAYOUT ROOT
// WARM INK ON PAPER (light/sepia) AND WARM OFF-WHITE ON WARM LACQUER (dark).
export const THEME_CLASS: Record<Theme, string> = {
	light: 'bg-[#fbfaf7] text-[#2b2320]',
	sepia: 'bg-[#f4ecd8] text-[#5b4636]',
	dark: 'bg-[#13100c] text-[#d8cfc2]',
};

// ROOT BACKGROUND PER THEME — KEEPS BROWSER CHROME, SCROLLBARS, AND OVERSCROLL IN SYNC
export const THEME_BG: Record<Theme, string> = {
	light: '#fbfaf7',
	sepia: '#f4ecd8',
	dark: '#13100c',
};

// OPAQUE ELEVATED SURFACE FOR OVERLAYS (MODALS, BOTTOM SHEETS, DRAWERS). UNLIKE PAGE CARDS — WHICH USE
// TRANSLUCENT TINTS THAT LAYER OVER THE THEME BG — A FLOATING PANEL MUST BE OPAQUE. SO EACH THEME GETS ITS
// OWN SOLID PANEL COLOUR THAT SITS ONE STEP ABOVE ITS PAGE BACKGROUND, PLUS A FOREGROUND TUNED FOR CONTRAST.
export const THEME_PANEL: Record<Theme, string> = {
	light: 'bg-white text-[#2b2320]',
	sepia: 'bg-[#fbf6ea] text-[#5b4636]',
	dark: 'bg-[#211c15] text-[#e6ded2]',
};

// POPOVERS / DROPDOWN MENUS — ONE ELEVATION HIGHER THAN A PANEL (THEY OFTEN OPEN ON TOP OF ONE)
export const THEME_POPOVER: Record<Theme, string> = {
	light: 'bg-white text-[#2b2320]',
	sepia: 'bg-[#fdf9f0] text-[#5b4636]',
	dark: 'bg-[#2a231a] text-[#e6ded2]',
};

// BORDER FOR ELEVATED OVERLAYS — A SOFT TINT ON LIGHT/DARK, A WARM HAIRLINE ON SEPIA.
export const THEME_PANEL_BORDER: Record<Theme, string> = {
	light: 'border-black/10',
	sepia: 'border-[#e2d4b5]',
	dark: 'border-white/10',
};

// TRANSLUCENT CHROME BARS (STICKY HEADERS) — SIT OVER backdrop-blur AND THE THEME BG.
export const THEME_BAR: Record<Theme, string> = {
	light: 'bg-white/70',
	sepia: 'bg-[#f4ecd8]/72',
	dark: 'bg-[#13100c]/70',
};

// BRAND PALETTE — COMPLETE LITERAL CLASS STRINGS SO TAILWIND'S CONTENT SCANNER PICKS THEM UP FROM THIS
// .ts FILE. CINNABAR 朱砂 — THE PRIMARY ACTION ACCENT (BUTTONS, LINKS, SELECTED STATES, PROGRESS).
export const ACCENT_SOLID = 'bg-[#b23a2e] text-white hover:bg-[#c0392b]';
// CINNABAR TEXT / ICON ACCENT — ONE STEP BRIGHTER ON THE DARK GROUP FOR CONTRAST.
export const ACCENT_TEXT = 'text-[#b23a2e] dark:text-[#e08a63]';
// CINNABAR TINTED FILL FOR ACTIVE / SELECTED PILLS.
export const ACCENT_SOFT = 'bg-[#b23a2e]/12 text-[#b23a2e] dark:text-[#e08a63]';
// CINNABAR FOCUS RING.
export const ACCENT_RING = 'focus:ring-2 focus:ring-[#b23a2e]/40';
// JADE 青 — SUCCESS / "READ" / CONSISTENT STATE.
export const JADE_TEXT = 'text-[#4f7a64] dark:text-[#83b39a]';
export const JADE_SOFT = 'bg-[#5b8a72]/14 text-[#4f7a64] dark:text-[#83b39a]';
// AGED GOLD 赤金 — PREMIUM (PRO MODEL).
export const GOLD_TEXT = 'text-[#a97f28] dark:text-[#d8b15a]';
export const GOLD_SOFT = 'bg-[#c9a24b]/16 text-[#a97f28] dark:text-[#d8b15a]';

// -- STORES -- //

export const settings = createSettings();

// -- FUNCTIONS -- //

export function isDarkTheme(theme: Theme): boolean {
	return DARK_THEMES.includes(theme);
}

// APPLY THE THEME AT THE DOCUMENT ROOT: dark CLASS, color-scheme, AND ROOT BACKGROUND
export function applyThemeClass(theme: Theme): void {
	if (!browser || typeof document === 'undefined') return;
	const isDark = DARK_THEMES.includes(theme);
	const root = document.documentElement;
	root.classList.toggle('dark', isDark);
	root.style.colorScheme = isDark ? 'dark' : 'light';
	root.style.backgroundColor = THEME_BG[theme];
	// KEEP THE MOBILE BROWSER CHROME (ADDRESS / STATUS BAR) IN SYNC WITH THE ACTIVE THEME — THE SSR HOOK
	// SEEDS THIS META ON FIRST PAINT; THIS UPDATES IT WHENEVER THE USER SWITCHES THEMES.
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme]);
}

// APPLY THE APP-WIDE INTERFACE FONT FAMILY (WITH INPUT/TEXTAREA EXEMPTION FOR ALL-CAPS FONTS)
export function applyFontFamily(font: AppFont): void {
	if (!browser || typeof document === 'undefined') return;
	const stack = FONT_STACKS[font] || FONT_STACKS.comic;
	const inputStack = INPUT_FONT_STACKS[font] || INPUT_FONT_STACKS.comic;
	document.documentElement.style.setProperty('--app-font-family', stack);
	document.documentElement.style.setProperty('--app-input-font-family', inputStack);
	document.documentElement.style.fontFamily = stack;
	if (document.body) {
		document.body.style.setProperty('--app-font-family', stack);
		document.body.style.setProperty('--app-input-font-family', inputStack);
		document.body.style.fontFamily = stack;
	}
}

export function resetSettings() {
	settings.set({ ...DEFAULTS });
}

// MERGE A PARSED OBJECT ONTO DEFAULTS, KEEPING ONLY KNOWN KEYS WHOSE VALUE TYPE MATCHES THE DEFAULT —
// SO STALE/REMOVED KEYS AND TYPE-CORRUPTED VALUES ARE DROPPED WHILE VALID PREFERENCES SURVIVE.
function mergeKnown(parsed: unknown): AppSettings {
	const out = { ...DEFAULTS };
	if (parsed && typeof parsed === 'object') {
		for (const k of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
			const v = (parsed as Record<string, unknown>)[k];
			if (v !== undefined && typeof v === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = v;
		}
	}
	if (!['light', 'sepia', 'dark'].includes(out.theme)) out.theme = 'sepia';
	if (!['comic', 'poppins', 'proxima', 'nunito', 'montserrat', 'lexend'].includes(out.appFont)) out.appFont = 'comic';
	if (!['patch', 'scaled', 'full'].includes(out.inpaintMode)) out.inpaintMode = 'patch';
	if (!['auto', 'cuda', 'dml', 'coreml', 'cpu'].includes(out.executionDevice)) out.executionDevice = 'auto';
	out.parallelProcesses = Math.max(1, Math.min(8, Number(out.parallelProcesses) || 2));
	out.parallelChapters = Math.max(1, Math.min(4, Number(out.parallelChapters) || 1));
	out.resliceBeforeBatch = typeof (parsed as any)?.resliceBeforeBatch === 'boolean' ? (parsed as any).resliceBeforeBatch : false;
	if (!['reader', 'grid', 'compare'].includes(out.readerViewMode)) out.readerViewMode = 'reader';
	if (!['output', 'original'].includes(out.webtoonKind)) out.webtoonKind = 'output';
	if (!['sm', 'md', 'lg'].includes(out.webtoonWidth)) out.webtoonWidth = 'md';
	if (!out.typesetFont || typeof out.typesetFont !== 'string') out.typesetFont = 'CC Wild Words';
	if (!out.typesetCjkFont || typeof out.typesetCjkFont !== 'string') out.typesetCjkFont = 'Friendly Sans';
	out.typesetPadding = Math.max(0.01, Math.min(0.15, Number(out.typesetPadding) || 0.05));
	out.typesetFontScale = Math.max(0.6, Math.min(2.0, Number(out.typesetFontScale) || 1.0));
	if (!['none', 'thin', 'standard', 'heavy'].includes(out.typesetOutline)) out.typesetOutline = 'standard';
	if (!['auto', 'dark', 'light'].includes(out.typesetContrast)) out.typesetContrast = 'auto';
	if (!['uppercase', 'original', 'lowercase'].includes(out.typesetCasing)) {
		out.typesetCasing = (parsed as any)?.typesetAllCaps === false ? 'original' : 'uppercase';
	}
	out.typesetPreviewText = typeof (parsed as any)?.typesetPreviewText === 'string' && (parsed as any).typesetPreviewText.trim().length > 0
		? (parsed as any).typesetPreviewText
		: DEFAULTS.typesetPreviewText;
	out.typesetPreviewPreset = typeof (parsed as any)?.typesetPreviewPreset === 'string'
		? (parsed as any).typesetPreviewPreset
		: DEFAULTS.typesetPreviewPreset;
	out.typesetAllCaps = out.typesetCasing === 'uppercase';
	out.enableTextRotation = typeof (parsed as any)?.enableTextRotation === 'boolean' ? (parsed as any).enableTextRotation : true;
	if ((parsed as any)?.version < 5 || out.sourceLang === 'zh-CN' || out.sourceLang === 'zh-Hans') {
		out.sourceLang = DEFAULT_SOURCE_LANG;
	}
	if ((parsed as any)?.version < 10 && out.typesetPadding === 0.02) {
		out.typesetPadding = 0.05;
	}
	if ((parsed as any)?.version < 11 && (parsed as any)?.parallelProcesses === 3) {
		out.parallelProcesses = 2;
	}
	out.version = DEFAULTS.version;
	return out;
}

function load(): AppSettings {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY) || localStorage.getItem('manua:settings');
		if (raw) {
			const parsed = JSON.parse(raw);
			// MERGE THE USER'S SAVED VALUES *FORWARD* ONTO THE CURRENT DEFAULTS RATHER THAN DISCARDING THEM
			// ON A version BUMP — NEW KEYS COME FROM DEFAULTS; KNOWN KEYS KEEP THE SAVED VALUE (TYPE-CHECKED).
			return mergeKnown(parsed);
		}
	} catch {
		// IGNORE CORRUPT STATE
	}
	return { ...DEFAULTS };
}

function createSettings() {
	const initial = load();
	const store = writable<AppSettings>(initial);
	if (browser) {
		let prevTheme: Theme | null = null;
		let prevFont: AppFont | null = null;

		// INITIAL APPLICATION
		applyThemeClass(initial.theme);
		applyFontFamily(initial.appFont);
		prevTheme = initial.theme;
		prevFont = initial.appFont;

		store.subscribe((s) => {
			try {
				localStorage.setItem(KEY, JSON.stringify(s));
				// MIRROR THE THEME & READER PREFERENCES TO COOKIES SO SSR CAN PRE-RENDER THEM
				setCookie(THEME_COOKIE, s.theme);
				setCookie(FONT_COOKIE, s.appFont);
				setCookie(INPAINT_MODE_COOKIE, s.inpaintMode);
				setCookie(EXEC_DEVICE_COOKIE, s.executionDevice);
				setCookie(PARALLEL_PROCESSES_COOKIE, String(s.parallelProcesses));
				setCookie(PARALLEL_CHAPTERS_COOKIE, String(s.parallelChapters));
				setCookie(RESLICE_BEFORE_BATCH_COOKIE, String(s.resliceBeforeBatch));
				setCookie(READER_VIEW_COOKIE, s.readerViewMode);
				setCookie(WEBTOON_KIND_COOKIE, s.webtoonKind);
				setCookie(WEBTOON_WIDTH_COOKIE, s.webtoonWidth);
				setCookie(TYPESET_FONT_COOKIE, s.typesetFont);
				setCookie(TYPESET_CJK_FONT_COOKIE, s.typesetCjkFont);
				setCookie(TYPESET_PADDING_COOKIE, String(s.typesetPadding));
				setCookie(TYPESET_SCALE_COOKIE, String(s.typesetFontScale));
				setCookie(TYPESET_OUTLINE_COOKIE, s.typesetOutline);
				setCookie(TYPESET_CONTRAST_COOKIE, s.typesetContrast);
				setCookie(TYPESET_CASING_COOKIE, s.typesetCasing);
				setCookie(TYPESET_ALL_CAPS_COOKIE, String(s.typesetAllCaps));
				setCookie(TYPESET_ROTATION_COOKIE, String(s.enableTextRotation));
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
		});
	}
	return store;
}
