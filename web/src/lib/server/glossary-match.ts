// IMPORTED DEP-MODULES
import AhoCorasick from 'ahocorasick';
// IMPORTED MODULES
import { getLanguage } from '$lib/languages';
import { bookPair, getEffectiveGlossary } from './glossary';
// IMPORTED TYPES
import type { TermDraft } from '$lib/types';

// -- TYPES -- //

interface Built {
	ac: AhoCorasick;
	// EVERY MATCHABLE KEY (A TERM'S source OR ONE OF ITS aliases) → THE TERM IT BELONGS TO. A source ALWAYS
	// WINS ITS KEY OVER AN alias, AND THE FIRST TERM CLAIMS A SHARED alias (DETERMINISTIC, source-ORDERED).
	byKey: Map<string, TermDraft>;
	// WHEN TRUE (SPACE-DELIMITED SOURCE LANGUAGE), A MATCH ONLY COUNTS AT A WORD BOUNDARY SO "art" ISN'T
	// MATCHED INSIDE "start". FALSE FOR CJK (SCRIPTURA CONTINUA — SUBSTRING MATCHING IS CORRECT THERE).
	wordDelimited: boolean;
}

// -- CONSTANTS -- //

// PER-BOOK AUTOMATON CACHE (L1), LRU-BOUNDED. REBUILT WHEN THE BOOK OR GLOBAL GLOSSARY CHANGES.
const MAX_CACHED_BOOKS = 32;
const cache = new Map<string, Built>();

// A "WORD" CHARACTER FOR BOUNDARY DETECTION — LATIN/CYRILLIC LETTERS, DIGITS, AND THE COMBINING MARKS
// THAT RIDE ON THEM. A MATCH IS WORD-BOUNDED WHEN NEITHER NEIGHBOUR IS ONE OF THESE.
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

// -- FUNCTIONS -- //

// DROP A BOOK'S CACHED AUTOMATON ON A GLOSSARY EDIT — REBUILT FROM THE DB ON THE NEXT MATCH.
export function invalidateBook(bookId: string): void {
	cache.delete(bookId);
}

// A GLOBAL-GLOSSARY WRITE AFFECTS EVERY BOOK'S EFFECTIVE SET → DROP ALL.
export function invalidateAll(): void {
	cache.clear();
}

async function build(bookId: string): Promise<Built> {
	const cached = cache.get(bookId);
	if (cached) {
		// MARK AS MOST-RECENTLY-USED (RE-INSERT MOVES IT TO THE END OF THE Map'S ITERATION ORDER).
		cache.delete(bookId);
		cache.set(bookId, cached);
		return cached;
	}
	const [terms, pair] = await Promise.all([getEffectiveGlossary(bookId), bookPair(bookId)]);
	// KEY EVERY TERM BY ITS source AND EACH alias. SOURCES FIRST SO A REAL TERM ALWAYS OWNS ITS KEY; AN alias
	// IS ADDED ONLY IF UNCLAIMED, SO A SHARED FORM RESOLVES DETERMINISTICALLY TO A SINGLE TERM.
	const byKey = new Map<string, TermDraft>();
	for (const t of terms) byKey.set(t.source, t);
	for (const t of terms) for (const a of t.aliases ?? []) if (a && !byKey.has(a)) byKey.set(a, t);
	const ac = new AhoCorasick([...byKey.keys()]);
	const built: Built = { ac, byKey, wordDelimited: getLanguage(pair.sourceLang).wordDelimited };
	cache.set(bookId, built);
	// EVICT THE OLDEST ENTRY (FIRST IN ITERATION ORDER) ONCE OVER CAPACITY.
	if (cache.size > MAX_CACHED_BOOKS) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return built;
}

// TRUE IF THE MATCH SPANNING [start, end] IN `content` SITS AT A WORD BOUNDARY ON BOTH SIDES.
function wordBounded(content: string, start: number, end: number): boolean {
	const before = start > 0 ? content[start - 1] : '';
	const after = end + 1 < content.length ? content[end + 1] : '';
	return !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
}

// RETURN ONLY THE EFFECTIVE-GLOSSARY TERMS PRESENT IN THIS CHAPTER.
// LONGEST MATCH WINS: A TERM THAT IS A STRICT SUBSTRING OF ANOTHER MATCHED TERM IS DROPPED.
export async function matchTerms(bookId: string, content: string): Promise<TermDraft[]> {
	const { ac, byKey, wordDelimited } = await build(bookId);
	if (byKey.size === 0) return [];

	// ahocorasick.search() RETURNS [endIndex, [keywords]] PER MATCH POSITION. RECORD EVERY COUNTING
	// OCCURRENCE'S [start, end] SPAN PER TERM — THE LONGEST-MATCH-WINS STEP BELOW NEEDS POSITIONS, NOT JUST
	// PRESENCE. FOR WORD-DELIMITED SOURCE LANGUAGES A HIT ONLY COUNTS AT A WORD BOUNDARY (SO "art" ISN'T
	// MATCHED INSIDE "start"); FOR CJK (SCRIPTURA CONTINUA) ANY HIT COUNTS.
	const occ = new Map<string, [number, number][]>();
	for (const [endIndex, keywords] of ac.search(content) as [number, string[]][]) {
		for (const k of keywords) {
			const start = endIndex - k.length + 1;
			if (wordDelimited && !wordBounded(content, start, endIndex)) continue;
			const span: [number, number] = [start, endIndex];
			const spans = occ.get(k);
			if (spans) spans.push(span);
			else occ.set(k, [span]);
		}
	}
	if (occ.size === 0) return [];

	// LONGEST MATCH WINS — BUT COVERAGE-AWARE, NOT A BLIND SUBSTRING TEST. DROP A SHORT TERM ONLY WHEN *EVERY*
	// ONE OF ITS OCCURRENCES SITS INSIDE A LONGER MATCHED TERM. THE OLD `other.includes(term)` TEST DROPPED A
	// TERM THE MOMENT IT WAS A SUBSTRING OF ANY LONGER MATCH ANYWHERE, WHICH WRONGLY ERASED A PROPER NOUN THAT
	// ALSO STANDS ALONE: 齊天 ("Qi Tian") APPEARED ON ITS OWN 40× IN A CHAPTER YET WAS SWALLOWED BY 齊天神丹 /
	// 齊天廟神 / 通臂齊天甲, SO IT VANISHED FROM BOTH THE TERM LIST AND THE TRANSLATION PROMPT'S GLOSSARY. A TERM
	// WHOSE EVERY HIT IS COVERED BY A LONGER MATCH (A TRUE FRAGMENT) IS STILL DROPPED.
	const matched = [...occ.keys()];
	const keptKeys = matched.filter((term) => {
		const covers = matched
			.filter((other) => other.length > term.length && other.includes(term))
			.flatMap((other) => occ.get(other)!);
		if (covers.length === 0) return true;
		return occ.get(term)!.some(([s, e]) => !covers.some(([cs, ce]) => cs <= s && e <= ce));
	});
	if (keptKeys.length === 0) return [];

	// MAP SURVIVING KEYS BACK TO THEIR TERM AND DEDUP — A TERM IS KEPT IF ANY OF ITS FORMS (source OR alias)
	// SURVIVED. SORT BY THE TERM'S EARLIEST KEPT OCCURRENCE FOR A STABLE, READABLE ORDER (occ IS BUILT
	// LEFT-TO-RIGHT, SO EACH KEY'S INDEX-0 SPAN IS ITS EARLIEST OCCURRENCE).
	const earliest = new Map<TermDraft, number>();
	for (const key of keptKeys) {
		const term = byKey.get(key)!;
		const at = occ.get(key)![0][0];
		const prev = earliest.get(term);
		if (prev === undefined || at < prev) earliest.set(term, at);
	}
	return [...earliest.keys()].sort((a, b) => earliest.get(a)! - earliest.get(b)!);
}

// RETURN THE SUBSET OF `sources` THAT APPEAR IN `content`, USING THE BOOK'S WORD-BOUNDARY RULE — THE SAME
// MATCHING SEMANTICS AS matchTerms. POWERS THE "NEW TO THIS CHAPTER" BADGE: A TERM IS NEW WHEN IT IS ABSENT
// FROM THE EARLIER-CHAPTERS TEXT (i.e. NOT IN THE SET THIS RETURNS FOR THAT TEXT), SO IT FIRST APPEARS HERE.
export async function sourcesPresentIn(bookId: string, content: string, sources: string[]): Promise<Set<string>> {
	const present = new Set<string>();
	if (sources.length === 0 || !content) return present;
	// REUSE THE BOOK'S wordDelimited RULE; THE AUTOMATON IS BUILT FROM JUST `sources` (A SMALL CANDIDATE SET).
	const { wordDelimited } = await build(bookId);
	const ac = new AhoCorasick(sources);
	for (const [endIndex, keywords] of ac.search(content) as [number, string[]][]) {
		for (const k of keywords) {
			if (!wordDelimited) {
				present.add(k);
				continue;
			}
			const start = endIndex - k.length + 1;
			if (wordBounded(content, start, endIndex)) present.add(k);
		}
	}
	return present;
}
