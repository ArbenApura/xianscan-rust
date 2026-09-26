// ACCENT FONT RESOLUTION (FEAT-010): WHICH REGIONS GET THE ACCENT FONT, WHICH FAMILY, AND THE FONT CONTEXT THAT MAKES
// EVERY LAYOUT AND DRAWING HELPER PUT THAT FAMILY FIRST.
// IMPORTED TYPES
import type { Script } from '$lib/languages';
import type { ScriptFontSlot } from '$lib/typeset-scripts';
import type { ScriptFontContext } from './script-fonts';
import type { TypesetRegion } from './stat-panel';
// IMPORTED MODULES
import { dominantScript } from '$lib/typeset-scripts';
import { familyCovers, familyCoversText } from './coverage';
import { ensureFontRegistered, measureTextWithRuns } from './fonts';

// -- TYPES -- //

export type OutlineMode = 'none' | 'thin' | 'standard' | 'heavy';

export interface AccentSettings {
	accentFonts?: Partial<Record<Script, string>>;
	accentInBubbles?: boolean;
}

export interface ResolvedAccent {
	/** THE ACCENT FAMILY THE REGION IS DRAWN IN. */
	font: string;
	/** THE REGION TEXT AFTER THE ACCENT CASING, CHECKED FOR COVERAGE. */
	text: string;
	/** THE SCRIPT SLOTS THE ACCENT FAMILY TAKES OVER IN THE REGION'S FONT CONTEXT. */
	slots: ScriptFontSlot[];
}

type MeasureCtx = { font: string; measureText(t: string): { width: number } };

// -- CONSTANTS -- //

const HEAVIER_OUTLINE: Record<OutlineMode, OutlineMode> = { none: 'thin', thin: 'standard', standard: 'heavy', heavy: 'heavy' };

// -- FUNCTIONS -- //

/** THE FEATURE IS ON WHEN AT LEAST ONE CONFIGURED ACCENT FAMILY CAN BE REGISTERED. */
export function accentActive(opts: AccentSettings): boolean {
	return Object.values(opts.accentFonts ?? {}).some((family) => Boolean(family) && ensureFontRegistered(family));
}

/** AN ACCENT-LABELLED REGION, OUTSIDE SPEECH BUBBLES UNLESS accentInBubbles (ADR-004). */
export function appliesAccent(region: Pick<TypesetRegion, 'role' | 'kind'>, opts: AccentSettings): boolean {
	if (region.role !== 'accent') return false;
	return (region.kind ?? 'dialogue_bubble') !== 'dialogue_bubble' || Boolean(opts.accentInBubbles);
}

/** ONE OUTLINE STEP HEAVIER: THE EMPHASIS AN ACCENT REGION GETS WHEN NO ACCENT FONT COVERS IT (ADR-009). */
export function heavierOutline(mode: OutlineMode): OutlineMode {
	return HEAVIER_OUTLINE[mode] ?? mode;
}

/**
 * THE ACCENT FAMILY FOR A REGION, OR null (ADR-008 / ADR-010). THE CANDIDATE IS THE SLOT FOR THE TEXT'S DOMINANT
 * SCRIPT (THE kana SLOT FOR KANJI IN A JAPANESE BOOK), ELSE THE LATIN ACCENT FONT WHEN IT COVERS THAT SCRIPT. IT IS
 * USED ONLY WHEN IT HAS EVERY LETTER OF THE TEXT AFTER CASING, BECAUSE CASING CHANGES LETTERS (REVIEW L-T7).
 */
export function resolveAccentFont(
	rawText: string,
	opts: AccentSettings,
	scriptCtx: ScriptFontContext,
	applyCasing: (text: string, family: string) => string,
): ResolvedAccent | null {
	const fonts = opts.accentFonts ?? {};
	const script = dominantScript(rawText, scriptCtx.targetScript);
	const slots: ScriptFontSlot[] = [];
	let candidate: string | undefined;
	if (script === 'latin') {
		candidate = fonts.latin;
	} else {
		const slot = script as ScriptFontSlot;
		const effective: ScriptFontSlot = slot === 'han' && scriptCtx.targetScript === 'kana' ? 'kana' : slot;
		slots.push(...new Set<ScriptFontSlot>([effective, slot]));
		candidate = fonts[effective] ?? fonts[slot];
		if (!candidate && fonts.latin && familyCovers(fonts.latin, effective)) candidate = fonts.latin;
	}
	if (!candidate || !ensureFontRegistered(candidate)) return null;
	const text = applyCasing(rawText, candidate);
	return familyCoversText(candidate, text) ? { font: candidate, text, slots } : null;
}

/**
 * A COPY OF THE REGION'S FONT CONTEXT WITH THE ACCENT FAMILY FIRST (REVIEW H3): IT BECOMES THE dialogue FONT AND TAKES
 * OVER THE REGION'S SCRIPT SLOTS, BECAUSE buildScriptFontChain PUTS A USER'S DIALOGUE SLOT (OR A LEGACY fontCjk SLOT)
 * AHEAD OF dialogue. ALSO TURNS ON LETTER-LEVEL ROUTING WITH THE PAGE'S DIALOGUE FONT FOR SYMBOLS (REVIEW H4 / H5).
 */
export function accentScriptContext(base: ScriptFontContext, accent: ResolvedAccent): ScriptFontContext {
	const scriptFonts = { ...base.scriptFonts };
	for (const slot of accent.slots) scriptFonts[slot] = accent.font;
	return {
		...base,
		dialogue: accent.font,
		scriptFonts,
		codepointRouting: true,
		symbolFallback: base.dialogue,
	};
}

/**
 * A MEASURING CONTEXT FOR ACCENT REGIONS (REVIEW M-T6): THE FITTING CODE SETS ONE FONT STRING PER SIZE AND MEASURES
 * WHOLE STRINGS; THIS MEASURES EACH STRING BY THE SAME RUNS drawTextLineWithRuns DRAWS, AT THE SIZE LAST SET.
 */
export function runMeasuringContext(
	real: MeasureCtx,
	primaryFont: string,
	scriptCtx: ScriptFontContext,
	customCjk: string | undefined,
	fontWeight: 'normal' | 'bold' | string | number | undefined,
	fontStyle: 'normal' | 'italic' | boolean | undefined,
	direction: 'ltr' | 'rtl',
): MeasureCtx {
	let spec = real.font;
	// FITTING MEASURES THE SAME STRING AT THE SAME SIZE MANY TIMES; RUN MEASURING IS FAR SLOWER THAN ONE measureText
	const widths = new Map<string, number>();
	return {
		get font() {
			return spec;
		},
		set font(value: string) {
			spec = value;
			real.font = value;
		},
		measureText(text: string) {
			const key = `${spec}\u0000${text}`;
			const known = widths.get(key);
			if (known !== undefined) return { width: known };
			const size = Number(/(\d+(?:\.\d+)?)px/.exec(spec)?.[1] ?? 0);
			const width = measureTextWithRuns(real, text, size, primaryFont, '', customCjk, fontWeight, fontStyle, scriptCtx, direction);
			real.font = spec;
			widths.set(key, width);
			return { width };
		},
	};
}
