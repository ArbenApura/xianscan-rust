// PRE-TRANSLATION CLASSIFIER AND UNTRANSLATABLE FILTER
// IMPORTED TYPES
import type { RegionSource } from './prompts';

// -- TYPES -- //

export type FilterDisposition = 'translate' | 'skip_empty' | 'direct_punctuation';

export interface PreFilterResult {
	disposition: FilterDisposition;
	resolvedTarget?: string;
	reason?: string;
}

// -- CONSTANTS & REGEXES -- //

// CJK DETECTOR REGEX (MATCHES HANZI, KANJI, HIRAGANA, KATAKANA, HANGUL)
const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;

// RECOGNIZED LATIN COMIC SOUND EFFECTS & INTERJECTIONS (CASE-INSENSITIVE)
const COMMON_LATIN_SFX_REGEX =
	/^(?:MEOW|MIAOW|WOOF|BARK|BOOM|BANG|CRASH|CRACK|CLICK|CLACK|CLANG|SNAP|SLAM|SMACK|THUD|THUMP|SPLASH|RUMBLE|SWOOSH|SWISH|ZAP|POW|BAM|PING|DING|DONG|TICK|TOCK|GULP|HUH|HEH|(?:HA)+|(?:HE)+|(?:HO)+|AH+|OH+|EH+|OOF|OUCH|UGH|BRR+|ZZZ+|PFFT|SHH+|PSST|WOW|GASP|SIGH|YAWN|YAY|UH-?OH|KYA+|WAA+|WHOA|YEAH+|YEP|NOPE)[!~?.\s\-]*$/i;

// PURE PUNCTUATION AND SYMBOLS ONLY
const PURE_PUNCTUATION_REGEX =
	/^[.!?,:;~～·…\s\-_—–·・‥●○•'""`()（）[\]【】《》「」『』!！?？。，、：；]+$/;

// -- HELPER FUNCTIONS -- //

function isCjkSourceLanguage(lang: string): boolean {
	const trimmed = lang.trim().toLowerCase();
	return (
		trimmed.startsWith('zh') ||
		trimmed.startsWith('ja') ||
		trimmed.startsWith('ko') ||
		trimmed === 'auto' ||
		trimmed === ''
	);
}

function isEnglishTargetLanguage(lang: string): boolean {
	const trimmed = lang.trim().toLowerCase();
	return trimmed.startsWith('en');
}

/**
 * NORMALIZE COMMON REACTION PUNCTUATION TO TARGET FORMAT
 */
export function resolveDialoguePunctuation(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed) return '';
	if (!PURE_PUNCTUATION_REGEX.test(trimmed)) return null;

	// CONVERT FULLWIDTH / CJK PUNCTUATION TO STANDARD LATIN PUNCTUATION
	let normalized = trimmed
		.replace(/[…·‥]/g, '...')
		.replace(/。/g, '.')
		.replace(/！/g, '!')
		.replace(/？/g, '?')
		.replace(/～/g, '~')
		.replace(/，/g, ',')
		.replace(/、/g, ',')
		.replace(/：/g, ':')
		.replace(/；/g, ';');

	// COLLAPSE EXCESSIVE DOTS TO CANONICAL ELLIPSIS
	normalized = normalized.replace(/\.{3,}/g, '...');
	return normalized;
}

/**
 * CLASSIFIES A REGION BEFORE LLM DISPATCH
 * DETERMINES WHETHER IT NEEDS TRANSLATION, CAN BE RESOLVED DIRECTLY, OR SHOULD BE SKIPPED AS NOISE/PRESERVED ART.
 */
export function classifyRegionForTranslation(
	region: RegionSource,
	sourceLang: string,
	targetLang: string,
): PreFilterResult {
	const text = region.text.trim();
	if (!text) {
		return { disposition: 'skip_empty', resolvedTarget: '', reason: 'empty_text' };
	}

	// 1. DIRECT PUNCTUATION / SYMBOLS ONLY (E.G. "...", "！？", "???")
	if (PURE_PUNCTUATION_REGEX.test(text)) {
		const resolved = resolveDialoguePunctuation(text) ?? text;
		return {
			disposition: 'direct_punctuation',
			resolvedTarget: resolved,
			reason: 'pure_punctuation',
		};
	}

	const isCjk = isCjkSourceLanguage(sourceLang);
	const isEnTarget = isEnglishTargetLanguage(targetLang);
	const hasCjk = CJK_CHAR_REGEX.test(text);

	// 2. CJK SOURCE WITH STRAY ALPHANUMERIC NOISE (E.G. "E2", "2", "E", "o0", "A1", "3")
	if (isCjk && !hasCjk) {
		// SHORT STANDALONE ALPHANUMERIC FRAGMENTS (<= 4 CHARACTERS) WITHOUT SPACES OR WITH SIMPLE DIGITS/LETTERS
		const isShortAlphanumeric = /^[A-Za-z0-9\s._\-~]{1,4}$/.test(text);
		// DIGIT-LETTER COMBINATIONS OR PURE NUMBERS (E.G. "E2", "2", "3A", "100", "00")
		const isIsolatedCodeOrNumber = /^(?:[A-Za-z]\d{1,2}|\d{1,2}[A-Za-z]|\d{1,4}|[A-Za-z]{1,2})$/.test(
			text,
		);

		if (isShortAlphanumeric && isIsolatedCodeOrNumber) {
			return {
				disposition: 'skip_empty',
				resolvedTarget: '',
				reason: 'cjk_stray_alphanumeric_noise',
			};
		}

		// 3. ALREADY-ENGLISH SFX IN CJK COMICS WHEN TARGET IS ENGLISH (E.G. "MEOW", "BOOM", "BANG", "AHHH")
		if (isEnTarget && (region.kind === 'sound_effect' || COMMON_LATIN_SFX_REGEX.test(text))) {
			if (COMMON_LATIN_SFX_REGEX.test(text)) {
				return {
					disposition: 'skip_empty',
					resolvedTarget: '',
					reason: 'already_english_sfx_preserved_artwork',
				};
			}
		}
	}

	// 4. ELIGIBLE FOR FULL NEURAL LLM TRANSLATION
	return { disposition: 'translate' };
}
