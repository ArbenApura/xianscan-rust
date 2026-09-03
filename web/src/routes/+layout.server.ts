import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { readingHistory as readingHistoryTable } from '$lib/server/db/schema';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { isLlmProviderConfigured } from '$lib/server/providers';
import {
	THEME_COOKIE,
	FONT_COOKIE,
	LIB_LAYOUT_COOKIE,
	CH_LAYOUT_COOKIE,
	READER_VIEW_COOKIE,
	WEBTOON_KIND_COOKIE,
	WEBTOON_WIDTH_COOKIE,
	INPAINT_MODE_COOKIE,
	EXEC_DEVICE_COOKIE,
	PARALLEL_PROCESSES_COOKIE,
	PARALLEL_CHAPTERS_COOKIE,
	RESLICE_BEFORE_BATCH_COOKIE,
	type Theme,
	type AppFont,
	type InpaintMode,
	type ExecutionDevice,
	type AppSettings,
} from '$lib/stores/settings';

export interface UserPreferences {
	theme: Theme;
	appFont: AppFont;
	libraryLayout: 'grid' | 'list' | 'compact';
	librarySort: 'recent' | 'title_asc' | 'title_desc' | 'chapters_desc' | 'chapters_asc';
	chapterLayout: 'grid' | 'list' | 'compact';
	chapterSortAsc: boolean;
	readerViewMode: 'reader' | 'grid' | 'compare';
	webtoonKind: 'output' | 'original';
	webtoonWidth: 'sm' | 'md' | 'lg';
	inpaintMode: InpaintMode;
	executionDevice: ExecutionDevice;
	parallelProcesses: number;
	parallelChapters: number;
	resliceBeforeBatch: boolean;
}

const VALID_THEMES = new Set<Theme>(['auto', 'light', 'sepia', 'dark']);
const VALID_FONTS = new Set<AppFont>(['comic', 'clash', 'general', 'poppins', 'proxima', 'nunito', 'montserrat', 'lexend']);
const VALID_LAYOUTS = new Set(['grid', 'list', 'compact']);
const VALID_READER_MODES = new Set(['reader', 'grid', 'compare']);
const VALID_WEBTOON_KINDS = new Set(['output', 'original']);
const VALID_WEBTOON_WIDTHS = new Set(['sm', 'md', 'lg']);
const VALID_INPAINT_MODES = new Set<InpaintMode>(['patch', 'scaled', 'full']);
const VALID_EXEC_DEVICES = new Set<ExecutionDevice>(['auto', 'cuda', 'dml', 'coreml', 'cpu']);

export const load: LayoutServerLoad = async ({ cookies }) => {
	let canonicalSettings: AppSettings | null = null;
	const historyMap: Record<string, { chapterId: number; seq: number; pageSeq: number; totalPages: number; completed: boolean; updatedAt: number }> = {};

	try {
		canonicalSettings = getCanonicalSettings();
		const rows = db.select().from(readingHistoryTable).all();
		for (const r of rows) {
			historyMap[r.bookId] = {
				chapterId: r.chapterId,
				seq: r.chapterSeq,
				pageSeq: r.pageSeq,
				totalPages: r.totalPages,
				completed: Boolean(r.completed),
				updatedAt: r.updatedAt,
			};
		}
	} catch {
		// Fallback gracefully if database is initializing
	}

	const rawTheme = cookies.get(THEME_COOKIE);
	const defaultTheme = canonicalSettings?.theme && VALID_THEMES.has(canonicalSettings.theme) ? canonicalSettings.theme : 'sepia';
	const theme: Theme = VALID_THEMES.has(rawTheme as Theme) ? (rawTheme as Theme) : defaultTheme;

	const rawFont = cookies.get(FONT_COOKIE);
	const defaultFont = canonicalSettings?.appFont && VALID_FONTS.has(canonicalSettings.appFont) ? canonicalSettings.appFont : 'comic';
	const appFont: AppFont = VALID_FONTS.has(rawFont as AppFont) ? (rawFont as AppFont) : defaultFont;

	const rawLib = cookies.get(LIB_LAYOUT_COOKIE);
	const defaultLib = canonicalSettings?.libraryLayout && VALID_LAYOUTS.has(canonicalSettings.libraryLayout) ? canonicalSettings.libraryLayout : 'grid';
	const libraryLayout = VALID_LAYOUTS.has(rawLib as any) ? (rawLib as 'grid' | 'list' | 'compact') : defaultLib;

	const rawCh = cookies.get(CH_LAYOUT_COOKIE);
	const defaultCh = canonicalSettings?.chapterLayout && VALID_LAYOUTS.has(canonicalSettings.chapterLayout) ? canonicalSettings.chapterLayout : 'list';
	const chapterLayout = VALID_LAYOUTS.has(rawCh as any) ? (rawCh as 'grid' | 'list' | 'compact') : defaultCh;

	const librarySort = canonicalSettings?.librarySort || 'recent';
	const chapterSortAsc = canonicalSettings?.chapterSortAsc !== undefined ? canonicalSettings.chapterSortAsc : true;

	const rawReader = cookies.get(READER_VIEW_COOKIE);
	const defaultReader = canonicalSettings?.readerViewMode && VALID_READER_MODES.has(canonicalSettings.readerViewMode) ? canonicalSettings.readerViewMode : 'compare';
	const readerViewMode = VALID_READER_MODES.has(rawReader as any)
		? (rawReader as 'reader' | 'grid' | 'compare')
		: defaultReader;

	const rawKind = cookies.get(WEBTOON_KIND_COOKIE);
	const defaultKind = canonicalSettings?.webtoonKind && VALID_WEBTOON_KINDS.has(canonicalSettings.webtoonKind) ? canonicalSettings.webtoonKind : 'output';
	const webtoonKind = VALID_WEBTOON_KINDS.has(rawKind as any) ? (rawKind as 'output' | 'original') : defaultKind;

	const rawWidth = cookies.get(WEBTOON_WIDTH_COOKIE);
	const defaultWidth = canonicalSettings?.webtoonWidth && VALID_WEBTOON_WIDTHS.has(canonicalSettings.webtoonWidth) ? canonicalSettings.webtoonWidth : 'md';
	const webtoonWidth = VALID_WEBTOON_WIDTHS.has(rawWidth as any) ? (rawWidth as 'sm' | 'md' | 'lg') : defaultWidth;

	const rawInpaint = cookies.get(INPAINT_MODE_COOKIE);
	const defaultInpaint = canonicalSettings?.inpaintMode && VALID_INPAINT_MODES.has(canonicalSettings.inpaintMode) ? canonicalSettings.inpaintMode : 'patch';
	const inpaintMode: InpaintMode = VALID_INPAINT_MODES.has(rawInpaint as InpaintMode) ? (rawInpaint as InpaintMode) : defaultInpaint;

	const rawDevice = cookies.get(EXEC_DEVICE_COOKIE);
	const defaultDevice = canonicalSettings?.executionDevice && VALID_EXEC_DEVICES.has(canonicalSettings.executionDevice) ? canonicalSettings.executionDevice : 'auto';
	const executionDevice: ExecutionDevice = VALID_EXEC_DEVICES.has(rawDevice as ExecutionDevice) ? (rawDevice as ExecutionDevice) : defaultDevice;

	const rawParallelProcesses = cookies.get(PARALLEL_PROCESSES_COOKIE);
	const parallelProcesses = Math.max(1, Math.min(8, Number(rawParallelProcesses) || canonicalSettings?.parallelProcesses || 1));

	const rawParallelChapters = cookies.get(PARALLEL_CHAPTERS_COOKIE);
	const parallelChapters = Math.max(1, Math.min(4, Number(rawParallelChapters) || canonicalSettings?.parallelChapters || 1));

	const rawReslice = cookies.get(RESLICE_BEFORE_BATCH_COOKIE);
	const resliceBeforeBatch = rawReslice !== undefined ? rawReslice === 'true' : (canonicalSettings?.resliceBeforeBatch ?? false);

	const preferences: UserPreferences = {
		theme,
		appFont,
		libraryLayout,
		librarySort,
		chapterLayout,
		chapterSortAsc,
		readerViewMode,
		webtoonKind,
		webtoonWidth,
		inpaintMode,
		executionDevice,
		parallelProcesses,
		parallelChapters,
		resliceBeforeBatch,
	};

	const llmStatus = isLlmProviderConfigured();

	return {
		preferences,
		canonicalSettings,
		readingHistory: historyMap,
		llmStatus,
	};
};
