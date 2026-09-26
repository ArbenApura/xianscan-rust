// SCRIPT MODEL FOR TYPESETTING (FEAT-006): WHICH WRITING SYSTEM A CHARACTER, A STRING OR A LANGUAGE BELONGS TO.
// SHARED BY SERVER AND CLIENT, SO NO NODE IMPORTS. UNICODE PROPERTY ESCAPES (THE `u` FLAG) ARE SUPPORTED BY
// NODE 22+ AND EVERY TARGET BROWSER.
// IMPORTED MODULES
import type { Script } from '$lib/languages';

// -- TYPES -- //

/** EVERY SCRIPT THAT CAN HAVE ITS OWN FONT SETTING (LATIN USES THE MAIN DIALOGUE FONT). */
export type ScriptFontSlot = Exclude<Script, 'latin'>;

// -- CONSTANTS -- //

/** SCRIPT FONT SLOTS IN DISPLAY ORDER. */
export const SCRIPT_FONT_SLOTS: readonly ScriptFontSlot[] = [
	'han',
	'kana',
	'hangul',
	'devanagari',
	'thai',
	'arabic',
	'cyrillic',
	'greek',
	'hebrew',
	'bengali',
	'tamil',
];

/**
 * ONE CHARACTER OF EACH SCRIPT. `Script_Extensions` IS USED WHERE A SCRIPT'S OWN PUNCTUATION IS CODED AS
 * `Common` (DEVANAGARI DANDA U+0964/U+0965, ARABIC ، ؛ ؟). HAN ALSO TAKES CJK PUNCTUATION AND FULLWIDTH FORMS
 * (U+3000-303F, U+FF01-FFEE), MATCHING THE OLD CJK_REGEX; `、` IS `Common` SO IT NEEDS THE EXPLICIT RANGE.
 */
export const SCRIPT_RANGES: Record<ScriptFontSlot, RegExp> = {
	han: /[\p{Script=Han}\u3000-\u303f\uff01-\uffee]/u,
	// U+3040-30FF ALSO HOLDS ー AND ・ (Common), WHICH THE OLD CJK_REGEX TREATED AS KANA
	kana: /[\p{Script=Hiragana}\p{Script=Katakana}\u3040-\u30ff\u31f0-\u31ff]/u,
	hangul: /\p{Script=Hangul}/u,
	devanagari: /\p{Script_Extensions=Devanagari}/u,
	thai: /\p{Script=Thai}/u,
	arabic: /\p{Script_Extensions=Arabic}/u,
	cyrillic: /\p{Script=Cyrillic}/u,
	greek: /\p{Script=Greek}/u,
	hebrew: /\p{Script=Hebrew}/u,
	bengali: /\p{Script_Extensions=Bengali}/u,
	tamil: /\p{Script_Extensions=Tamil}/u,
};

const LATIN = /\p{Script=Latin}/u;

// ORDER MATTERS WHERE RANGES OVERLAP: KANA AND HANGUL BEFORE HAN (HAN OWNS THE SHARED CJK PUNCTUATION BLOCK),
// AND THE SCRIPT_EXTENSIONS SCRIPTS (DANDA IS ALSO IN BENGALI'S EXTENSIONS) IN A FIXED ORDER.
const CHAR_ORDER: readonly ScriptFontSlot[] = [
	'kana',
	'hangul',
	'han',
	'devanagari',
	'bengali',
	'tamil',
	'thai',
	'arabic',
	'hebrew',
	'cyrillic',
	'greek',
];

/** HUMAN-READABLE NAMES FOR SCRIPT BADGES AND SETTINGS ROWS. */
export const SCRIPT_LABELS: Record<Script, string> = {
	latin: 'Latin',
	han: 'Chinese (Han)',
	kana: 'Japanese (Kana)',
	hangul: 'Korean (Hangul)',
	devanagari: 'Hindi (Devanagari)',
	thai: 'Thai',
	arabic: 'Arabic',
	cyrillic: 'Cyrillic',
	greek: 'Greek',
	hebrew: 'Hebrew',
	bengali: 'Bengali',
	tamil: 'Tamil',
};

/** SHORT COMIC-STYLE SAMPLE LINES PER SCRIPT FOR FONT PREVIEWS. */
export const SCRIPT_SAMPLES: Record<Script, string> = {
	latin: 'WAIT! WHAT IS THIS REALM?!',
	han: '道生一，一生二，二生三，三生万物',
	kana: 'ちょっと待って！ここはどこ？！',
	hangul: '잠깐! 여기가 어디야?!',
	devanagari: 'रुको! यह कौन सा लोक है?!',
	thai: 'เดี๋ยวก่อน! นี่มันที่ไหนกัน?!',
	arabic: 'انتظر! ما هذا العالم؟!',
	cyrillic: 'Стой! Что это за мир?!',
	greek: 'Στάσου! Τι κόσμος είναι αυτός;',
	hebrew: 'רגע! מה העולם הזה?!',
	bengali: 'থামো! এটা কোন জগৎ?!',
	tamil: 'நில்! இது எந்த உலகம்?!',
};

/** ZERO-WIDTH (NON-)JOINERS AND COMBINING MARKS: THEY BELONG TO THE PRECEDING RUN, NEVER START A NEW ONE. */
export const JOINER_REGEX = /[\u200c\u200d\p{M}]/u;

// -- FUNCTIONS -- //

/** THE SCRIPT OF ONE CHARACTER (ONE CODE POINT), OR `common` FOR DIGITS, SPACES AND SHARED PUNCTUATION. */
export function scriptOfChar(ch: string): Script | 'common' {
	for (const script of CHAR_ORDER) {
		if (SCRIPT_RANGES[script].test(ch)) return script;
	}
	return LATIN.test(ch) ? 'latin' : 'common';
}

/** HOW MANY CHARACTERS OF EACH SCRIPT `text` CONTAINS (COMMON CHARACTERS ARE NOT COUNTED). */
export function detectScripts(text: string): Map<Script, number> {
	const counts = new Map<Script, number>();
	for (const ch of text) {
		const script = scriptOfChar(ch);
		if (script === 'common') continue;
		counts.set(script, (counts.get(script) ?? 0) + 1);
	}
	return counts;
}

/** THE SCRIPT WITH THE MOST CHARACTERS IN `text`; `fallback` WHEN EMPTY OR ON A TIE WITH IT. */
export function dominantScript(text: string, fallback: Script): Script {
	let best: Script = fallback;
	let bestCount = -1;
	for (const [script, count] of detectScripts(text)) {
		if (count > bestCount || (count === bestCount && script === fallback)) {
			best = script;
			bestCount = count;
		}
	}
	return best;
}
