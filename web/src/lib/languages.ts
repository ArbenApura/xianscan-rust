// LANGUAGE REGISTRY — ADAPTED FROM xianslate
// SINGLE SOURCE OF TRUTH FOR LANGUAGE SELECTION, CODES, ENDONYMS, AND QUALITY TIERS.

export type Script =
	| 'han'
	| 'kana'
	| 'hangul'
	| 'latin'
	| 'cyrillic'
	| 'greek'
	| 'arabic'
	| 'hebrew'
	| 'devanagari'
	| 'bengali'
	| 'tamil'
	| 'thai';

export interface Language {
	code: string;
	name: string;
	endonym: string;
	script: Script;
	romanization: string | null;
	wordDelimited: boolean;
	tier: 1 | 2 | 3;
	rtl?: boolean;
}

export interface TargetOption {
	value: string;
	name: string;
	endonym: string;
	tier: 1 | 2 | 3;
	script: Script;
	rtl: boolean;
}

export const DEFAULT_SOURCE_LANG = 'zh-Hans';
export const DEFAULT_TARGET_LANG = 'en';
export const NO_TRANSLATION = 'none';

export const LANGUAGES: Record<string, Language> = {
	// TIER 1: Native primary training corpora (High proficiency, literary fluency, native comprehension)
	'zh-Hans': { code: 'zh-Hans', name: 'Simplified Chinese', endonym: '简体中文', script: 'han', romanization: 'Hanyu Pinyin with NO tone marks', wordDelimited: false, tier: 1 },
	'zh-Hant': { code: 'zh-Hant', name: 'Traditional Chinese', endonym: '繁體中文', script: 'han', romanization: 'Hanyu Pinyin with NO tone marks', wordDelimited: false, tier: 1 },
	en: { code: 'en', name: 'English', endonym: 'English', script: 'latin', romanization: null, wordDelimited: true, tier: 1 },

	// TIER 2: Major multilingual corpora with strong comic/manga/localization performance
	ja: { code: 'ja', name: 'Japanese', endonym: '日本語', script: 'kana', romanization: 'Hepburn romaji', wordDelimited: false, tier: 2 },
	ko: { code: 'ko', name: 'Korean', endonym: '한국어', script: 'hangul', romanization: 'Revised Romanization of Korean', wordDelimited: true, tier: 2 },
	es: { code: 'es', name: 'Spanish', endonym: 'Español', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	fr: { code: 'fr', name: 'French', endonym: 'Français', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	de: { code: 'de', name: 'German', endonym: 'Deutsch', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	ru: { code: 'ru', name: 'Russian', endonym: 'Русский', script: 'cyrillic', romanization: null, wordDelimited: true, tier: 2 },
	pt: { code: 'pt', name: 'Portuguese', endonym: 'Português', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	it: { code: 'it', name: 'Italian', endonym: 'Italiano', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	id: { code: 'id', name: 'Indonesian', endonym: 'Bahasa Indonesia', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },
	vi: { code: 'vi', name: 'Vietnamese', endonym: 'Tiếng Việt', script: 'latin', romanization: null, wordDelimited: true, tier: 2 },

	// TIER 3: Moderate corpora (good grammar, but less specialized comic/nuanced phrasing)
	tr: { code: 'tr', name: 'Turkish', endonym: 'Türkçe', script: 'latin', romanization: null, wordDelimited: true, tier: 3 },
	nl: { code: 'nl', name: 'Dutch', endonym: 'Nederlands', script: 'latin', romanization: null, wordDelimited: true, tier: 3 },
	pl: { code: 'pl', name: 'Polish', endonym: 'Polski', script: 'latin', romanization: null, wordDelimited: true, tier: 3 },
	th: { code: 'th', name: 'Thai', endonym: 'ไทย', script: 'thai', romanization: null, wordDelimited: false, tier: 3 },
	hi: { code: 'hi', name: 'Hindi', endonym: 'हिन्दी', script: 'devanagari', romanization: null, wordDelimited: true, tier: 3 },
	uk: { code: 'uk', name: 'Ukrainian', endonym: 'Українська', script: 'cyrillic', romanization: null, wordDelimited: true, tier: 3 },
	sv: { code: 'sv', name: 'Swedish', endonym: 'Svenska', script: 'latin', romanization: null, wordDelimited: true, tier: 3 },
	fi: { code: 'fi', name: 'Finnish', endonym: 'Suomi', script: 'latin', romanization: null, wordDelimited: true, tier: 3 },
};

export const SOURCE_LANGUAGE_OPTIONS = [
	{ value: 'zh-Hans', label: '🇨🇳 简体中文 (Chinese Manhua)', name: 'Simplified Chinese', endonym: '简体中文' },
	{ value: 'zh-Hant', label: '🇹🇼 繁體中文 (Traditional Manhua)', name: 'Traditional Chinese', endonym: '繁體中文' },
	{ value: 'ja', label: '🇯🇵 日本語 (Japanese Manga)', name: 'Japanese', endonym: '日本語' },
	{ value: 'ko', label: '🇰🇷 한국어 (Korean Manhwa)', name: 'Korean', endonym: '한국어' },
	{ value: 'fr', label: '🇫🇷 Français (Bande Dessinée)', name: 'French', endonym: 'Français' },
	{ value: 'es', label: '🇪🇸 Español (Historietas / Tebeos)', name: 'Spanish', endonym: 'Español' },
	{ value: 'id', label: '🇮🇩 Bahasa Indonesia (Komik Webtoon)', name: 'Indonesian', endonym: 'Bahasa Indonesia' },
	{ value: 'vi', label: '🇻🇳 Tiếng Việt (Truyện Tranh)', name: 'Vietnamese', endonym: 'Tiếng Việt' },
	{ value: 'ru', label: '🇷🇺 Русский (Russian Comics)', name: 'Russian', endonym: 'Русский' },
	{ value: 'th', label: '🇹🇭 ไทย (Thai Webtoons)', name: 'Thai', endonym: 'ไทย' },
	{ value: 'en', label: '🇺🇸 English (Western Comics)', name: 'English', endonym: 'English' },
];

export const TARGET_LANGUAGE_OPTIONS = [
	{ value: 'en', label: 'English (Tier 1)' },
	{ value: 'zh-Hans', label: '简体中文 (Simplified - Tier 1)' },
	{ value: 'zh-Hant', label: '繁體中文 (Traditional - Tier 1)' },
	{ value: 'ja', label: '日本語 (Japanese - Tier 2)' },
	{ value: 'ko', label: '한국어 (Korean - Tier 2)' },
	{ value: 'es', label: 'Español (Spanish - Tier 2)' },
	{ value: 'fr', label: 'Français (French - Tier 2)' },
	{ value: 'de', label: 'Deutsch (German - Tier 2)' },
	{ value: 'ru', label: 'Русский (Russian - Tier 2)' },
	{ value: 'id', label: 'Bahasa Indonesia (Indonesian - Tier 2)' },
	{ value: 'vi', label: 'Tiếng Việt (Vietnamese - Tier 2)' },
];

const TRADITIONAL_CHAR_PATTERN = /[們這為會經說國動時現實體學業發問門沒進聽階級歡迎龍鳳飛鳥馬魚車書長萬與變並單當點對讓頭儘幾後畫兒極總處愛鐵無樂義氣開專鬥蒼術靈斬寶閣莊記話職師歸來劍聖陣傳廣導應隊戰惡獸護衛歷險煉]/;
const SIMPLIFIED_CHAR_PATTERN = /[们这为会经说国动时现实体学业发问门没进听阶级欢迎龙凤飞鸟马鱼车书长万与变并单当点对让头尽几后画儿极总处爱铁无乐义气开专斗苍术灵斩宝阁庄记话职师归来剑圣阵传广导应队战恶兽护卫历险炼]/;
const ENGLISH_WORD_PATTERN = /^[a-zA-Z0-9\s.,!?'"()\-–—:;]+$/;
const JAPANESE_CHAR_PATTERN = /[\u3040-\u30ff]/;
const KOREAN_CHAR_PATTERN = /[\uac00-\ud7af]/;
const CYRILLIC_CHAR_PATTERN = /[\u0400-\u04ff]/;
const THAI_CHAR_PATTERN = /[\u0e00-\u0e7f]/;
const VIETNAMESE_CHAR_PATTERN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

/**
 * Auto-detect the source language of a text string (defaults to Chinese variants for manhua).
 */
export function detectSourceLanguage(text: string, fallback = 'zh-Hans'): string {
	const trimmed = (text || '').trim();
	if (!trimmed) return fallback;

	if (JAPANESE_CHAR_PATTERN.test(trimmed)) {
		return 'ja';
	}
	if (KOREAN_CHAR_PATTERN.test(trimmed)) {
		return 'ko';
	}
	if (CYRILLIC_CHAR_PATTERN.test(trimmed)) {
		return 'ru';
	}
	if (THAI_CHAR_PATTERN.test(trimmed)) {
		return 'th';
	}
	if (VIETNAMESE_CHAR_PATTERN.test(trimmed)) {
		return 'vi';
	}
	if (ENGLISH_WORD_PATTERN.test(trimmed) && !/[\u4e00-\u9fff]/.test(trimmed)) {
		return 'en';
	}

	let tradCount = 0;
	let simpCount = 0;
	for (const ch of trimmed) {
		if (TRADITIONAL_CHAR_PATTERN.test(ch)) tradCount++;
		if (SIMPLIFIED_CHAR_PATTERN.test(ch)) simpCount++;
	}

	if (tradCount > simpCount) return 'zh-Hant';
	if (simpCount > 0) return 'zh-Hans';
	return fallback;
}

export function getLanguage(code: string | null | undefined): Language {
	if (!code || code === 'auto') return LANGUAGES['zh-Hans'];
	if (LANGUAGES[code]) return LANGUAGES[code];
	if (code === 'zh-CN' || code === 'zh_CN' || code === 'zh') return LANGUAGES['zh-Hans'];
	if (code === 'zh-TW' || code === 'zh_TW' || code === 'zh-HK') return LANGUAGES['zh-Hant'];
	if (code === 'ja-JP' || code === 'ja_JP') return LANGUAGES['ja'];
	if (code === 'ko-KR' || code === 'ko_KR') return LANGUAGES['ko'];
	return LANGUAGES['zh-Hans'];
}

export function languageName(code: string | null | undefined): string {
	if (code === NO_TRANSLATION) return 'Original';
	if (code === 'auto') return 'Auto Detect Language';
	return getLanguage(code).name;
}

export function targetLanguageOptions(): TargetOption[] {
	return Object.values(LANGUAGES)
		.map((l) => ({
			value: l.code,
			name: l.name,
			endonym: l.endonym,
			tier: l.tier,
			script: l.script,
			rtl: !!l.rtl,
		}))
		.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

const SCRIPT_RESIDUE: Record<Script, RegExp | null> = {
	han: /[㐀-䶿一-鿿豈-﫿]|[\u{20000}-\u{2a6df}]/u,
	kana: /[぀-ヿㇰ-ㇿ]/u,
	hangul: /[가-힣ᄀ-ᇿ㄰-㆏]/u,
	latin: null,
	cyrillic: null,
	greek: null,
	arabic: null,
	hebrew: null,
	devanagari: null,
	bengali: null,
	tamil: null,
	thai: null,
};

export function hasSourceResidue(text: string, sourceLang: string): boolean {
	const { script } = getLanguage(sourceLang);
	const re = SCRIPT_RESIDUE[script];
	if (re?.test(text)) return true;
	if (script === 'kana') return SCRIPT_RESIDUE.han!.test(text);
	return false;
}

export function leakRepairApplies(sourceLang: string): boolean {
	const { script } = getLanguage(sourceLang);
	return script === 'han' || script === 'kana' || script === 'hangul';
}
