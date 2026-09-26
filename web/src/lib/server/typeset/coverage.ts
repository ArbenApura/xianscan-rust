// DOES FONT FAMILY X HAVE GLYPHS FOR SCRIPT Y? (FEAT-006 ADR-004)
// TWO METHODS: THE cmap OF A FONT FILE WE HOLD (font-parser.ts), AND FOR FAMILIES SKIA ONLY KNOWS BY NAME (SYSTEM
// FONTS FOUND BY THE OS FONT MANAGER) A RENDER PROBE: TWO DIFFERENT WORDS DRAWN IN ONLY THAT FAMILY COME OUT
// IDENTICAL WHEN BOTH ARE .notdef BOXES, AND DIFFERENT WHEN THE FAMILY HAS REAL GLYPHS.
// IMPORTED DEP-MODULES
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
// IMPORTED MODULES
import type { Script } from '$lib/languages';
import type { ScriptFontSlot } from '$lib/typeset-scripts';

// -- CONSTANTS -- //

/**
 * PAIRS OF DIFFERENT SHORT WORDS PER SCRIPT; THEY ONLY RENDER DIFFERENTLY WHEN THE FONT HAS THE GLYPHS. AVOID
 * LETTERS LATIN FONTS CARRY AS MATH SYMBOLS (GREEK Δ Ω μ π): ONE SUCH GLYPH WOULD MAKE A LATIN FONT LOOK COVERED.
 */
export const PROBE_PAIRS: Record<Script, [string, string]> = {
	latin: ['Abc', 'Xyz'],
	han: ['的人国', '中文字'],
	kana: ['あいう', 'カキク'],
	hangul: ['가나다', '한국어'],
	devanagari: ['कमल', 'नयन'],
	thai: ['กขค', 'งจฉ'],
	arabic: ['بتث', 'جحخ'],
	cyrillic: ['АБВ', 'ЖЗИ'],
	greek: ['αβγ', 'ζηθ'],
	hebrew: ['אבג', 'דהו'],
	bengali: ['কখগ', 'ঘঙচ'],
	tamil: ['கஙச', 'ஞடண'],
};

// -- STATES -- //

const cache = new Map<string, boolean>();

/** OPTIONAL SOURCES CONSULTED BEFORE THE PROBE (BUNDLED FONT TABLE, CUSTOM FONT METADATA). */
type CoverageSource = (family: string, script: Script) => boolean | undefined;
const sources: CoverageSource[] = [];

// -- FUNCTIONS -- //

/** RUNTIME CHECK AGAINST SKIA. NEVER THROWS; AN UNKNOWN FAMILY OR ANY FAILURE COUNTS AS NOT COVERED. */
export function probeFamilyScript(family: string, script: Script): boolean {
	try {
		if (!GlobalFonts.has(family)) return false;
		const [a, b] = PROBE_PAIRS[script];
		const render = (word: string) => {
			const canvas = createCanvas(96, 48);
			const ctx = canvas.getContext('2d');
			// ONLY THIS FAMILY, NO FALLBACK STACK: A MISSING GLYPH MUST STAY A MISSING GLYPH
			ctx.font = `32px "${family.replace(/"/g, '')}"`;
			ctx.fillStyle = '#000';
			ctx.fillText(word, 4, 36);
			return canvas.data();
		};
		return !render(a).equals(render(b));
	} catch {
		return false;
	}
}

/** CACHED ANSWER: REGISTERED SOURCES FIRST (IN ORDER), THEN THE RENDER PROBE. */
export function familyCovers(family: string, script: Script): boolean {
	const key = `${family.toLowerCase()}|${script}`;
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	let result: boolean | undefined;
	for (const source of sources) {
		result = source(family, script);
		if (result !== undefined) break;
	}
	const covered = result ?? probeFamilyScript(family, script);
	cache.set(key, covered);
	return covered;
}

/** ADDS A LOOKUP CONSULTED BEFORE THE PROBE (RETURN undefined FOR "DO NOT KNOW"). */
export function registerCoverageSource(source: CoverageSource): void {
	sources.push(source);
	cache.clear();
}

/** FORGET CACHED ANSWERS (A FONT WAS UPLOADED, REMOVED OR RE-REGISTERED). */
export function invalidateCoverageCache(): void {
	cache.clear();
}
