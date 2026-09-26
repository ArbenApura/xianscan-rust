// TEXT DIRECTION FOR TYPESETTING AND UI (FEAT-007). SHARED BY SERVER AND CLIENT, SO NO NODE IMPORTS.
// PROPERTY ESCAPES COVER THE SAME CODE POINTS AS THE BLOCK RANGES IN THE PLAN (HEBREW, ARABIC AND ITS
// SUPPLEMENT / EXTENDED-A BLOCKS, SYRIAC, THAANA, NKO, AND THE HEBREW / ARABIC PRESENTATION FORMS).

// -- CONSTANTS -- //

/** ONE CHARACTER OF A RIGHT-TO-LEFT SCRIPT (INCLUDING ARABIC PUNCTUATION SUCH AS ، ؛ ؟). */
export const RTL_CHAR_REGEX =
	/[\p{Script_Extensions=Hebrew}\p{Script_Extensions=Arabic}\p{Script_Extensions=Syriac}\p{Script_Extensions=Thaana}\p{Script_Extensions=Nko}]/u;

/** ONE ARABIC-SCRIPT CHARACTER (FOR RULES THAT ARE ARABIC SPECIFIC, SUCH AS NEVER HYPHENATING). */
export const ARABIC_SCRIPT_REGEX = /\p{Script_Extensions=Arabic}/u;

const LETTER = /\p{L}/u;

// -- TYPES -- //

export type TextDirection = 'ltr' | 'rtl';
export type DirectionOverride = 'auto' | TextDirection;

// -- FUNCTIONS -- //

/**
 * MAJORITY RULE (ADR-002): 'rtl' WHEN THE TEXT HAS RIGHT-TO-LEFT LETTERS AND AT LEAST AS MANY OF THEM AS
 * LEFT-TO-RIGHT LETTERS. AN ARABIC LINE THAT STARTS WITH A LATIN NAME ("Goku ...") IS STILL AN ARABIC LINE,
 * WHICH THE UNICODE FIRST-STRONG RULE WOULD GET WRONG. DIGITS AND PUNCTUATION DO NOT COUNT.
 */
export function detectTextDirection(text: string): TextDirection {
	let rtl = 0;
	let ltr = 0;
	for (const ch of text ?? '') {
		if (!LETTER.test(ch)) continue;
		if (RTL_CHAR_REGEX.test(ch)) rtl++;
		else ltr++;
	}
	return rtl > 0 && rtl >= ltr ? 'rtl' : 'ltr';
}

/** AN EXPLICIT 'ltr' / 'rtl' OVERRIDE WINS; 'auto' OR NOTHING DETECTS FROM THE TEXT. */
export function resolveDirection(text: string, override?: DirectionOverride): TextDirection {
	if (override === 'ltr' || override === 'rtl') return override;
	return detectTextDirection(text);
}
