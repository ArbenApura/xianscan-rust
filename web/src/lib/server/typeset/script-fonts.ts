// SCRIPT-AWARE FONT CHAINS (FEAT-006 PHASE 5): FOR EACH SCRIPT, THE FAMILIES TO TRY, IN ORDER, BUILT FROM THE
// USER'S SLOT, THE DIALOGUE FONT (WHEN IT HAS THE GLYPHS), THE BUNDLED SCRIPT FONT AND THE OS FAMILIES.
// IMPORTED DEP-MODULES
import { GlobalFonts } from '@napi-rs/canvas';
// IMPORTED MODULES
import type { Script } from '$lib/languages';
import { detectScripts, dominantScript, type ScriptFontSlot } from '$lib/typeset-scripts';
import { familyCovers } from './coverage';
import { systemFamiliesFor } from './system-script-fonts';

// -- TYPES -- //

export interface ScriptFontContext {
	/** THE BOOK'S DIALOGUE FONT (LATIN TEXT, AND ANY SCRIPT IT HAPPENS TO COVER). */
	dialogue: string;
	/** THE USER'S PER-SCRIPT CHOICES. */
	scriptFonts: Partial<Record<ScriptFontSlot, string>>;
	/** THE SCRIPT THE BOOK IS TYPESET IN (TIE-BREAKER, AND JAPANESE FORMS FOR KANJI). */
	targetScript: Script;
	/** BUNDLED FALLBACK PER SCRIPT (INJECTED TO AVOID AN IMPORT CYCLE WITH fonts.ts). */
	bundled: Partial<Record<ScriptFontSlot, string>>;
	/**
	 * ACCENT REGIONS ONLY (FEAT-010 ADR-008): ROUTE EVERY CHARACTER THE PRIMARY FONT LACKS (BY ITS cmap) TO A SYMBOL
	 * RUN INSTEAD OF RELYING ON SKIA'S PER-CHARACTER FALLBACK. UNSET FOR DIALOGUE, WHOSE RUNS STAY UNCHANGED.
	 */
	codepointRouting?: boolean;
	/** THE PAGE'S DIALOGUE FONT: SYMBOL RUNS OF AN ACCENT REGION USE IT WHEN IT REALLY HAS THE CHARACTER. */
	symbolFallback?: string;
}

// -- CONSTANTS -- //

/**
 * FOR CJK THE INSTALLED OS FAMILIES COME BEFORE THE BUNDLED WENQUANYI, AS BEFORE FEAT-006 (MICROSOFT YAHEI,
 * YU GOTHIC, MALGUN GOTHIC ON WINDOWS), SO EXISTING CJK OUTPUT DOES NOT CHANGE AND JAPANESE / KOREAN TEXT KEEPS ITS
 * NATIVE GLYPH FORMS. EVERY OTHER SCRIPT USES THE BUNDLED FONT FIRST: IDENTICAL OUTPUT ON EVERY PLATFORM.
 */
const SYSTEM_BEFORE_BUNDLED = new Set<ScriptFontSlot>(['han', 'kana', 'hangul']);

// -- FUNCTIONS -- //

/** INSTALLED FAMILIES FOR `script`, BEST FIRST, NO DUPLICATES. */
export function buildScriptFontChain(script: ScriptFontSlot, ctx: ScriptFontContext): string[] {
	// KANJI IN A JAPANESE BOOK USE THE JAPANESE CHAIN SO THEY GET JAPANESE GLYPH FORMS
	const effective: ScriptFontSlot = script === 'han' && ctx.targetScript === 'kana' ? 'kana' : script;
	const chain: string[] = [];
	const add = (family?: string) => {
		if (family && !chain.includes(family) && GlobalFonts.has(family)) chain.push(family);
	};

	// 1. THE USER'S EXPLICIT CHOICE, EVEN IF IT LACKS GLYPHS (THE SETTINGS UI WARNS INSTEAD)
	add(ctx.scriptFonts[effective] ?? ctx.scriptFonts[script]);
	// 2. THE DIALOGUE FONT WHEN IT REALLY HAS THIS SCRIPT (E.G. POPPINS FOR DEVANAGARI, ADR-003)
	if (familyCovers(ctx.dialogue, effective)) add(ctx.dialogue);
	// 3 / 4. BUNDLED AND OS FAMILIES
	const system = systemFamiliesFor(effective);
	if (SYSTEM_BEFORE_BUNDLED.has(effective)) {
		system.forEach(add);
		add(ctx.bundled[effective]);
	} else {
		add(ctx.bundled[effective]);
		system.forEach(add);
	}
	return chain;
}

/** TRUE WHEN ANY FAMILY IN `chain` HAS GLYPHS FOR `script`. */
export function chainCovers(chain: string[], script: ScriptFontSlot): boolean {
	return chain.some((family) => familyCovers(family, script));
}

/** A CSS/SKIA font-family LIST: THE CHAIN, THEN `tail`, THEN THE LATIN FALLBACK AND sans-serif. */
export function fontStackString(chain: string[], tail: string[] = [], latinFallback = 'Friendly Sans'): string {
	const seen = new Set<string>();
	const quoted: string[] = [];
	for (const family of [...chain, ...tail, latinFallback]) {
		if (!family || seen.has(family)) continue;
		seen.add(family);
		quoted.push(`"${family.replace(/"/g, '')}"`);
	}
	return [...quoted, 'sans-serif'].join(', ');
}

/**
 * THE FONT STACK FOR MEASURING A WHOLE STRING: THE DOMINANT SCRIPT'S CHAIN FIRST (OR THE DIALOGUE FONT FOR LATIN),
 * THEN THE CHAINS OF THE OTHER SCRIPTS IN IT, THEN THE DIALOGUE FONT.
 */
export function textFontStack(text: string, primaryFont: string, ctx: ScriptFontContext): string[] {
	const dominant = dominantScript(text, ctx.targetScript);
	const others = [...detectScripts(text).keys()].filter((s) => s !== 'latin' && s !== dominant) as ScriptFontSlot[];
	const order: ScriptFontSlot[] = dominant === 'latin' ? others : [dominant as ScriptFontSlot, ...others];
	const stack: string[] = dominant === 'latin' ? [primaryFont] : [];
	for (const script of order) {
		for (const family of buildScriptFontChain(script, ctx)) {
			if (!stack.includes(family)) stack.push(family);
		}
	}
	if (!stack.includes(primaryFont)) stack.push(primaryFont);
	return stack;
}
