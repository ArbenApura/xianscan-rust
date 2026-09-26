// DOES FONT FAMILY X HAVE GLYPHS FOR SCRIPT Y? (FEAT-006 ADR-004)
// TWO METHODS: THE cmap OF A FONT FILE WE HOLD (font-parser.ts), AND FOR FAMILIES SKIA ONLY KNOWS BY NAME (SYSTEM
// FONTS FOUND BY THE OS FONT MANAGER) A RENDER PROBE: TWO DIFFERENT WORDS DRAWN IN ONLY THAT FAMILY COME OUT
// IDENTICAL WHEN BOTH ARE .notdef BOXES, AND DIFFERENT WHEN THE FAMILY HAS REAL GLYPHS.
// IMPORTED DEP-MODULES
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
// IMPORTED MODULES
import type { Script } from '$lib/languages';
import { scriptOfChar, type ScriptFontSlot } from '$lib/typeset-scripts';
import type { CodepointSet } from './font-parser';

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

/**
 * CODE POINT SOURCES (FEAT-010 ADR-008): THE cmap OF A FAMILY'S FILE. undefined = "NOT MINE, ASK THE NEXT SOURCE",
 * null = "MINE, BUT THE SET IS UNKNOWN" (UNREADABLE FILE, NAME MISMATCH).
 */
type CodepointSource = (family: string) => CodepointSet | null | undefined;
const codepointSources: CodepointSource[] = [];
const codepointCache = new Map<string, CodepointSet | null>();

// LETTERS, COMBINING MARKS AND DIGITS: THE CHARACTERS A FONT MUST HAVE TO LETTER A WORD WITHOUT MIXING FAMILIES
const LETTER_LIKE = /[\p{L}\p{M}\p{N}]/u;

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
	codepointCache.clear();
}

/** ADDS A CODE POINT LOOKUP (BUNDLED, CUSTOM, SYSTEM FILES), CONSULTED IN REGISTRATION ORDER. */
export function registerCodepointSource(source: CodepointSource): void {
	codepointSources.push(source);
	codepointCache.clear();
}

/** THE FAMILY'S CODE POINTS FROM ITS FONT FILE, OR null WHEN UNKNOWN. AN EMPTY SET COUNTS AS UNKNOWN. */
export function familyCodepoints(family: string): CodepointSet | null {
	const key = family.toLowerCase();
	if (codepointCache.has(key)) return codepointCache.get(key) ?? null;
	let result: CodepointSet | null = null;
	for (const source of codepointSources) {
		try {
			const found = source(family);
			if (found === undefined) continue;
			result = found && found.ranges.length > 0 ? found : null;
		} catch {
			result = null;
		}
		break;
	}
	codepointCache.set(key, result);
	return result;
}

/** THE LETTERS, MARKS AND DIGITS OF `text` (PUNCTUATION, SYMBOLS, SPACES AND JOINERS DROPPED). */
export function lettersOf(text: string): string[] {
	return [...text].filter((ch) => LETTER_LIKE.test(ch));
}

/**
 * TRUE WHEN THE FAMILY HAS A GLYPH FOR EVERY LETTER, MARK AND DIGIT OF `text` (FEAT-010 ADR-008). WITH AN UNKNOWN
 * CODE POINT SET THIS FALLS BACK TO SCRIPT-LEVEL COVERAGE FOR EACH SCRIPT IN THE TEXT (THE LETTER GUARANTEE THEN
 * DOES NOT HOLD; THE SETTINGS UI SAYS SO).
 */
export function familyCoversText(family: string, text: string): boolean {
	const letters = lettersOf(text);
	const set = familyCodepoints(family);
	if (set) return letters.every((ch) => set.has(ch.codePointAt(0) as number));
	const scripts = new Set<Script>();
	for (const ch of letters) {
		const script = scriptOfChar(ch);
		if (script !== 'common') scripts.add(script);
	}
	if (scripts.size === 0) return familyRegistered(family);
	return [...scripts].every((script) => familyCovers(family, script));
}

/** THE DISTINCT CHARACTERS OF `text` THE FAMILY LACKS (ANY CHARACTER, NOT ONLY LETTERS); EMPTY WHEN UNKNOWN. */
export function familyMissing(family: string, text: string): string[] {
	const set = familyCodepoints(family);
	if (!set) return [];
	const missing: string[] = [];
	for (const ch of text) {
		if (/\s/u.test(ch) || missing.includes(ch)) continue;
		if (!set.has(ch.codePointAt(0) as number)) missing.push(ch);
	}
	return missing;
}

function familyRegistered(family: string): boolean {
	try {
		return GlobalFonts.has(family);
	} catch {
		return false;
	}
}
