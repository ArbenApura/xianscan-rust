// OS FONT FAMILIES PER SCRIPT (FEAT-006 PHASE 4). FAMILY NAMES ONLY: SKIA RESOLVES INSTALLED FAMILIES BY NAME.
// ENTRIES MARKED * IN THE PLAN (MANGAL, APARAJITA, ITF DEVANAGARI, SUKHUMVIT SET, SF ARABIC, HIRAGINO SANS,
// HIRAGINO KAKU GOTHIC PRON, TLWG TYPIST, NANUMGOTHIC) ARE UNCONFIRMED ON THEIR OS; A MISSING FAMILY IS SIMPLY
// SKIPPED, AND THE BUNDLED FONTS REMAIN THE GUARANTEE.
// IMPORTED MODULES
import type { ScriptFontSlot } from '$lib/typeset-scripts';

// -- TYPES -- //

type ScriptFamilies = Partial<Record<ScriptFontSlot, string[]>>;

// -- CONSTANTS -- //

const MAC_ALL_SCRIPTS_FALLBACK = 'Arial Unicode MS';

export const SYSTEM_SCRIPT_FAMILIES: Partial<Record<NodeJS.Platform | 'default', ScriptFamilies>> = {
	win32: {
		devanagari: ['Nirmala UI', 'Mangal', 'Aparajita'],
		thai: ['Leelawadee UI', 'Leelawadee', 'Tahoma'],
		arabic: ['Segoe UI', 'Arial', 'Tahoma'],
		han: ['Microsoft YaHei', 'SimHei', 'Microsoft JhengHei'],
		kana: ['Yu Gothic', 'Meiryo', 'MS Gothic'],
		hangul: ['Malgun Gothic', 'Gulim'],
		cyrillic: ['Segoe UI', 'Arial'],
		greek: ['Segoe UI', 'Arial'],
		hebrew: ['Segoe UI', 'Arial'],
		bengali: ['Nirmala UI'],
		tamil: ['Nirmala UI'],
	},
	darwin: {
		devanagari: ['Kohinoor Devanagari', 'Devanagari Sangam MN', 'ITF Devanagari', MAC_ALL_SCRIPTS_FALLBACK],
		thai: ['Thonburi', 'Sukhumvit Set', MAC_ALL_SCRIPTS_FALLBACK],
		arabic: ['Geeza Pro', 'SF Arabic', MAC_ALL_SCRIPTS_FALLBACK],
		han: ['PingFang SC', 'Hiragino Sans GB', MAC_ALL_SCRIPTS_FALLBACK],
		kana: ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', MAC_ALL_SCRIPTS_FALLBACK],
		hangul: ['Apple SD Gothic Neo', MAC_ALL_SCRIPTS_FALLBACK],
		cyrillic: ['Helvetica Neue', 'Arial', MAC_ALL_SCRIPTS_FALLBACK],
		greek: ['Helvetica Neue', 'Arial', MAC_ALL_SCRIPTS_FALLBACK],
		hebrew: ['Arial Hebrew', MAC_ALL_SCRIPTS_FALLBACK],
		bengali: ['Kohinoor Bangla', MAC_ALL_SCRIPTS_FALLBACK],
		tamil: ['Tamil Sangam MN', MAC_ALL_SCRIPTS_FALLBACK],
	},
	linux: {
		devanagari: ['Noto Sans Devanagari', 'Lohit Devanagari', 'FreeSans'],
		thai: ['Noto Sans Thai', 'Loma', 'Garuda', 'TLWG Typist'],
		arabic: ['Noto Sans Arabic', 'Noto Naskh Arabic', 'DejaVu Sans'],
		han: ['Noto Sans CJK SC', 'WenQuanYi Zen Hei'],
		kana: ['Noto Sans CJK JP'],
		hangul: ['Noto Sans CJK KR', 'NanumGothic'],
		cyrillic: ['DejaVu Sans', 'FreeSans'],
		greek: ['DejaVu Sans', 'FreeSans'],
		hebrew: ['Noto Sans Hebrew', 'DejaVu Sans'],
		bengali: ['Noto Sans Bengali', 'Lohit Bengali'],
		tamil: ['Noto Sans Tamil', 'Lohit Tamil'],
	},
	default: {},
};

// -- FUNCTIONS -- //

/** SYSTEM FAMILIES TO TRY FOR `script` ON THIS PLATFORM, IN PREFERENCE ORDER. */
export function systemFamiliesFor(script: ScriptFontSlot, platform: NodeJS.Platform = process.platform): string[] {
	return (SYSTEM_SCRIPT_FAMILIES[platform] ?? SYSTEM_SCRIPT_FAMILIES.default ?? {})[script] ?? [];
}
