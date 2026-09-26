// PRE-TRANSLATION CLASSIFIER AND UNTRANSLATABLE FILTER
// IMPORTED TYPES
import type { RegionSource } from './prompts';
import { scriptOfLanguage } from '$lib/languages';

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
	/^[.!?,:;~～·…\s\-_\u2014–·・‥●○•'""`()（）[\]【】《》「」『』!！?？。，、：；؟،؛«»]+$/;

// RECOVERS SYSTEMATIC MANHWA HANGUL OCR CONFUSIONS (E.G. "윗들 하고" / "못들 하고" -> "뭣들 하고")
const KOREAN_OCR_CONFUSION_REGEX = /(?:윗들|못들)(\s*(?:하고|하[는며시냐고]|해))/gu;

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

// THE CHAPTER PIPELINE'S STRICT TABLE (CAPS REPEATED MARKS AT THREE). MOVED HERE FROM chapter-pipeline.ts SO THERE IS
// ONE IMPLEMENTATION; ITS OUTPUT IS UNCHANGED (FEAT-007 PHASE 5).
const DIALOGUE_PUNCT_MAP: Record<string, string> = {
	'……': '...',
	'……！': '...!',
	'……!': '...!',
	'……？': '...?',
	'……?': '...?',
	'……！？': '...?!',
	'……!?': '...?!',
	'……？！': '...?!',
	'……?!': '...?!',
	'！': '!',
	'!': '!',
	'？': '?',
	'?': '?',
	'？！': '?!',
	'?!': '?!',
	'！？': '!?',
	'!?': '!?',
	'...': '...',
	'...!': '...!',
	'...?': '...?',
};

function strictDialoguePunctuation(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (DIALOGUE_PUNCT_MAP[trimmed]) return DIALOGUE_PUNCT_MAP[trimmed];
	if (/^[.．…]+[！!]$/.test(trimmed)) return '...!';
	if (/^[.．…]+[？?]$/.test(trimmed)) return '...?';
	if (/^[.．…]+$/.test(trimmed)) return '...';
	if (/^[！!]+$/.test(trimmed)) return '!'.repeat(Math.min(3, trimmed.length));
	if (/^[？?]+$/.test(trimmed)) return '?'.repeat(Math.min(3, trimmed.length));
	return null;
}

function normalizeDialoguePunctuation(text: string): string | null {
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

/** ARABIC WRITES ؟ ، ؛ WHERE LATIN WRITES ? , ; (! AND ... ARE SHARED). */
function toArabicPunctuation(text: string): string {
	return text.replace(/\?/g, '؟').replace(/,/g, '،').replace(/;/g, '؛');
}

/**
 * NORMALIZE COMMON REACTION PUNCTUATION TO TARGET FORMAT.
 * - 'normalize' (DEFAULT, THE PRE-FILTER): ANY PURE-PUNCTUATION TEXT, FULLWIDTH MARKS MAPPED TO LATIN.
 * - 'strict' (THE PIPELINE'S FALLBACK FOR AN EMPTY TRANSLATION): ONLY THE KNOWN REACTION SHAPES, RUNS CAPPED AT THREE.
 * WITH AN ARABIC TARGET, ? , ; BECOME ؟ ، ؛ (FEAT-007).
 */
export function resolveDialoguePunctuation(
	text: string,
	targetLang?: string,
	mode: 'normalize' | 'strict' = 'normalize',
): string | null {
	const resolved = mode === 'strict' ? strictDialoguePunctuation(text) : normalizeDialoguePunctuation(text);
	if (resolved && targetLang && scriptOfLanguage(targetLang) === 'arabic') return toArabicPunctuation(resolved);
	return resolved;
}

/**
 * PRE-CLEANS STRAY BORDER OCR NOISE AND RECOVERS SYSTEMATIC MANHWA HANGUL OCR CONFUSIONS
 */
export function sanitizeOcrSourceText(text: string): string {
	if (!text) return '';
	let cleaned = text.normalize('NFKC');
	// STRIP STRAY LEADING / TRAILING BORDER ARTIFACTS (| \ / _ -)
	cleaned = cleaned.replace(/^[\s|/\\_—–~`-]+/u, '').replace(/[\s|/\\_—–~`-]+$/u, '').trim();
	// RECOVER SYSTEMATIC MANHWA HANGUL OCR CONFUSIONS
	cleaned = cleaned.replace(KOREAN_OCR_CONFUSION_REGEX, '뭣들$1');
	return cleaned;
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
	const text = sanitizeOcrSourceText(region.text);
	if (!text) {
		return { disposition: 'skip_empty', resolvedTarget: '', reason: 'empty_text' };
	}

	// 1. DIRECT PUNCTUATION / SYMBOLS ONLY (E.G. "...", "！？", "???")
	if (PURE_PUNCTUATION_REGEX.test(text)) {
		const resolved = resolveDialoguePunctuation(text, targetLang) ?? text;
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

		// WATERMARKS / URL DOMAINS (E.G. "www.baozimh.com", "baozicdn.com", "https://...")
		const isWatermarkDomain =
			/^(?:https?:\/\/)?(?:www\.)?[a-z0-9_\-]+\.(?:com|cn|org|net|cc|tv|xyz|vip|me|top|fun|site|info|icu|io|app|club|space|co|moe)(?:\/[^\s]*)?$/i.test(
				text,
			);
		if (isWatermarkDomain) {
			return {
				disposition: 'skip_empty',
				resolvedTarget: '',
				reason: 'watermark_domain_url',
			};
		}

		// 3. ALREADY-ENGLISH INTERJECTIONS IN CJK COMICS WHEN TARGET IS ENGLISH (E.G. "MEOW", "BOOM", "BANG", "AHHH")
		if (isEnTarget && COMMON_LATIN_SFX_REGEX.test(text)) {
			return {
				disposition: 'skip_empty',
				resolvedTarget: '',
				reason: 'already_english_sfx_preserved_artwork',
			};
		}
	}

	// 4. ELIGIBLE FOR FULL NEURAL LLM TRANSLATION
	return { disposition: 'translate' };
}
