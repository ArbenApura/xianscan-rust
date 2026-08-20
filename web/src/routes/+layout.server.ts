import type { LayoutServerLoad } from './$types';
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
} from '$lib/stores/settings';

export interface UserPreferences {
	theme: Theme;
	appFont: AppFont;
	libraryLayout: 'grid' | 'list' | 'compact';
	chapterLayout: 'grid' | 'list' | 'compact';
	readerViewMode: 'reader' | 'grid' | 'compare';
	webtoonKind: 'output' | 'original';
	webtoonWidth: 'sm' | 'md' | 'lg';
	inpaintMode: InpaintMode;
	executionDevice: ExecutionDevice;
	parallelProcesses: number;
	parallelChapters: number;
	resliceBeforeBatch: boolean;
}

const VALID_THEMES = new Set<Theme>(['light', 'sepia', 'dark']);
const VALID_FONTS = new Set<AppFont>(['comic', 'poppins', 'proxima', 'nunito', 'montserrat', 'lexend']);
const VALID_LAYOUTS = new Set(['grid', 'list', 'compact']);
const VALID_READER_MODES = new Set(['reader', 'grid', 'compare']);
const VALID_WEBTOON_KINDS = new Set(['output', 'original']);
const VALID_WEBTOON_WIDTHS = new Set(['sm', 'md', 'lg']);
const VALID_INPAINT_MODES = new Set<InpaintMode>(['patch', 'scaled', 'full']);
const VALID_EXEC_DEVICES = new Set<ExecutionDevice>(['auto', 'cuda', 'dml', 'cpu']);

export const load: LayoutServerLoad = async ({ cookies }) => {
	const rawTheme = cookies.get(THEME_COOKIE);
	const theme: Theme = VALID_THEMES.has(rawTheme as Theme) ? (rawTheme as Theme) : 'sepia';

	const rawFont = cookies.get(FONT_COOKIE);
	const appFont: AppFont = VALID_FONTS.has(rawFont as AppFont) ? (rawFont as AppFont) : 'comic';

	const rawLib = cookies.get(LIB_LAYOUT_COOKIE);
	const libraryLayout = VALID_LAYOUTS.has(rawLib as any) ? (rawLib as 'grid' | 'list' | 'compact') : 'grid';

	const rawCh = cookies.get(CH_LAYOUT_COOKIE);
	const chapterLayout = VALID_LAYOUTS.has(rawCh as any) ? (rawCh as 'grid' | 'list' | 'compact') : 'grid';

	const rawReader = cookies.get(READER_VIEW_COOKIE);
	const readerViewMode = VALID_READER_MODES.has(rawReader as any)
		? (rawReader as 'reader' | 'grid' | 'compare')
		: 'reader';

	const rawKind = cookies.get(WEBTOON_KIND_COOKIE);
	const webtoonKind = VALID_WEBTOON_KINDS.has(rawKind as any) ? (rawKind as 'output' | 'original') : 'output';

	const rawWidth = cookies.get(WEBTOON_WIDTH_COOKIE);
	const webtoonWidth = VALID_WEBTOON_WIDTHS.has(rawWidth as any) ? (rawWidth as 'sm' | 'md' | 'lg') : 'md';

	const rawInpaint = cookies.get(INPAINT_MODE_COOKIE);
	const inpaintMode: InpaintMode = VALID_INPAINT_MODES.has(rawInpaint as InpaintMode) ? (rawInpaint as InpaintMode) : 'patch';

	const rawDevice = cookies.get(EXEC_DEVICE_COOKIE);
	const executionDevice: ExecutionDevice = VALID_EXEC_DEVICES.has(rawDevice as ExecutionDevice) ? (rawDevice as ExecutionDevice) : 'auto';

	const rawParallelProcesses = cookies.get(PARALLEL_PROCESSES_COOKIE);
	const parallelProcesses = Math.max(1, Math.min(8, Number(rawParallelProcesses) || 2));

	const rawParallelChapters = cookies.get(PARALLEL_CHAPTERS_COOKIE);
	const parallelChapters = Math.max(1, Math.min(4, Number(rawParallelChapters) || 1));

	const rawReslice = cookies.get(RESLICE_BEFORE_BATCH_COOKIE);
	const resliceBeforeBatch = rawReslice !== undefined ? rawReslice === 'true' : false;

	const preferences: UserPreferences = {
		theme,
		appFont,
		libraryLayout,
		chapterLayout,
		readerViewMode,
		webtoonKind,
		webtoonWidth,
		inpaintMode,
		executionDevice,
		parallelProcesses,
		parallelChapters,
		resliceBeforeBatch,
	};

	return {
		preferences,
	};
};
