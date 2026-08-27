// IMPORTED DEP-MODULES
import AhoCorasick from 'ahocorasick';
// IMPORTED MODULES
import { getLanguage } from '$lib/languages';
import { bookPair, getEffectiveGlossary } from './glossary';
// IMPORTED TYPES
import type { TermDraft } from '$lib/types';

// -- TYPES -- //

interface FuzzyCandidate {
	key: string;
	term: TermDraft;
	bigrams: string[];
}

interface Built {
	ac: AhoCorasick;
	// EVERY MATCHABLE KEY (A TERM'S source OR ONE OF ITS aliases) -> THE TERM IT BELONGS TO. A source ALWAYS
	// WINS ITS KEY OVER AN alias, AND THE FIRST TERM CLAIMS A SHARED alias (DETERMINISTIC, source-ORDERED).
	byKey: Map<string, TermDraft>;
	// WHEN TRUE (SPACE-DELIMITED SOURCE LANGUAGE), A MATCH ONLY COUNTS AT A WORD BOUNDARY SO "art" ISN'T
	// MATCHED INSIDE "start". FALSE FOR CJK (SCRIPTURA CONTINUA — SUBSTRING MATCHING IS CORRECT THERE).
	wordDelimited: boolean;
	// FUZZY CANDIDATES WITH LENGTH >= 3 AND INVERTED 2-GRAM INDEX FOR FAST TYPO/OCR RECOVERY
	fuzzyCandidates: FuzzyCandidate[];
	bigramIndex: Map<string, FuzzyCandidate[]>;
}

// -- CONSTANTS -- //

// PER-BOOK AUTOMATON CACHE (L1), LRU-BOUNDED. REBUILT WHEN THE BOOK OR GLOBAL GLOSSARY CHANGES.
const MAX_CACHED_BOOKS = 32;
const cache = new Map<string, Built>();

// A "WORD" CHARACTER FOR BOUNDARY DETECTION — LATIN/CYRILLIC LETTERS, DIGITS, AND THE COMBINING MARKS
// THAT RIDE ON THEM. A MATCH IS WORD-BOUNDED WHEN NEITHER NEIGHBOUR IS ONE OF THESE.
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

// ZERO-WIDTH UNICODE CHARACTERS THAT FREQUENTLY OCCUR AS OCR ARTIFACTS
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;

// -- FUNCTIONS -- //

// NORMALIZE TEXT FOR COMPARISON AND SEARCHING BASED ON LANGUAGE SCRIPT CHARACTERISTICS
export function normalizeContent(text: string, wordDelimited: boolean): string {
	if (!text) return '';
	const nfkc = text.normalize('NFKC').replace(ZERO_WIDTH_CHARS, '');
	if (!wordDelimited) {
		// FOR CJK / SCRIPTURA CONTINUA: STRIP ALL INTRA-BUBBLE LINE BREAKS AND WHITESPACES
		return nfkc.replace(/[\s\r\n\t\u3000]+/g, '');
	}
	// FOR WORD-DELIMITED LANGUAGES: DE-HYPHENATE BROKEN WORDS ACROSS LINE BREAKS AND COLLAPSE WHITESPACE
	return nfkc
		.replace(/(\p{L})-\s*[\r\n]+\s*(\p{L})/gu, '$1$2')
		.replace(/[\s\r\n\t]+/g, ' ')
		.trim();
}

function normalizeKey(key: string, wordDelimited: boolean): string {
	if (!key) return '';
	const nfkc = key.normalize('NFKC').replace(ZERO_WIDTH_CHARS, '');
	if (!wordDelimited) {
		return nfkc.replace(/[\s\r\n\t\u3000]+/g, '');
	}
	return nfkc.replace(/[\s\r\n\t]+/g, ' ').trim();
}

function extractBigrams(str: string): string[] {
	if (str.length < 2) return [];
	const bigrams: string[] = [];
	for (let i = 0; i < str.length - 1; i++) {
		bigrams.push(str.slice(i, i + 2));
	}
	return bigrams;
}

// DAMERAU-LEVENSHTEIN DISTANCE (INSERTION, DELETION, SUBSTITUTION, TRANSPOSITION)
function damerauLevenshtein(a: string, b: string): number {
	const la = a.length;
	const lb = b.length;
	if (Math.abs(la - lb) > 2) return Math.max(la, lb);
	const d: number[][] = [];
	for (let i = 0; i <= la; i++) d[i] = [i];
	for (let j = 0; j <= lb; j++) d[0][j] = j;
	for (let i = 1; i <= la; i++) {
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(
				d[i - 1][j] + 1, // DELETION
				d[i][j - 1] + 1, // INSERTION
				d[i - 1][j - 1] + cost, // SUBSTITUTION
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // TRANSPOSITION
			}
		}
	}
	return d[la][lb];
}

// DROP A BOOK'S CACHED AUTOMATON ON A GLOSSARY EDIT — REBUILT FROM THE DB ON THE NEXT MATCH.
export function invalidateBook(bookId: string): void {
	cache.delete(bookId);
}

// A GLOBAL-GLOSSARY WRITE AFFECTS EVERY BOOK'S EFFECTIVE SET -> DROP ALL.
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
	const wordDelimited = getLanguage(pair.sourceLang).wordDelimited;

	// KEY EVERY TERM BY ITS NORMALIZED source AND EACH NORMALIZED alias. SOURCES FIRST SO A REAL TERM ALWAYS OWNS ITS KEY;
	// AN alias IS ADDED ONLY IF UNCLAIMED, SO A SHARED FORM RESOLVES DETERMINISTICALLY TO A SINGLE TERM.
	const byKey = new Map<string, TermDraft>();
	for (const t of terms) {
		const normSrc = normalizeKey(t.source, wordDelimited);
		if (normSrc) byKey.set(normSrc, t);
	}
	for (const t of terms) {
		for (const a of t.aliases ?? []) {
			if (!a) continue;
			const normAlias = normalizeKey(a, wordDelimited);
			if (normAlias && !byKey.has(normAlias)) byKey.set(normAlias, t);
		}
	}

	// BUILD 2-GRAM INVERTED INDEX FOR FUZZY RECOVERY OF TERMS WITH LENGTH >= 3
	const fuzzyCandidates: FuzzyCandidate[] = [];
	const bigramIndex = new Map<string, FuzzyCandidate[]>();
	for (const [key, term] of byKey.entries()) {
		if (key.length >= 3) {
			const bigrams = extractBigrams(key);
			const cand: FuzzyCandidate = { key, term, bigrams };
			fuzzyCandidates.push(cand);
			for (const bg of bigrams) {
				const list = bigramIndex.get(bg) ?? [];
				list.push(cand);
				bigramIndex.set(bg, list);
			}
		}
	}

	const ac = new AhoCorasick([...byKey.keys()]);
	const built: Built = { ac, byKey, wordDelimited, fuzzyCandidates, bigramIndex };
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
	const { ac, byKey, wordDelimited, bigramIndex } = await build(bookId);
	if (byKey.size === 0) return [];

	const normContent = normalizeContent(content, wordDelimited);
	if (!normContent) return [];

	// STAGE 1: EXACT AHO-CORASICK SEARCH ON NORMALIZED CONTENT
	const occ = new Map<string, [number, number][]>();
	const exactMatchedTerms = new Set<TermDraft>();

	for (const [endIndex, keywords] of ac.search(normContent) as [number, string[]][]) {
		for (const k of keywords) {
			const start = endIndex - k.length + 1;
			if (wordDelimited && !wordBounded(normContent, start, endIndex)) continue;
			const span: [number, number] = [start, endIndex];
			const spans = occ.get(k);
			if (spans) spans.push(span);
			else occ.set(k, [span]);
			const t = byKey.get(k);
			if (t) exactMatchedTerms.add(t);
		}
	}

	// STAGE 2: BOUNDED FUZZY OCR RECOVERY FOR UNMATCHED CANDIDATES (LENGTH >= 3)
	if (normContent.length >= 3 && bigramIndex.size > 0) {
		const contentBigrams = extractBigrams(normContent);
		const candidateMatches = new Map<FuzzyCandidate, number[]>();

		for (let i = 0; i < contentBigrams.length; i++) {
			const bg = contentBigrams[i];
			const cands = bigramIndex.get(bg);
			if (!cands) continue;
			for (const cand of cands) {
				if (exactMatchedTerms.has(cand.term)) continue; // SKIP TERMS ALREADY EXACTLY MATCHED
				const hits = candidateMatches.get(cand) ?? [];
				hits.push(i);
				candidateMatches.set(cand, hits);
			}
		}

		for (const [cand, hitIndices] of candidateMatches.entries()) {
			const targetLen = cand.key.length;
			const minBigrams = Math.max(1, Math.floor((targetLen - 1) / 2));
			if (hitIndices.length < minBigrams) continue;

			// CHECK WINDOWS SURROUNDING THE MATCHED BIGRAMS
			let matched = false;
			const testedSpans = new Set<string>();

			for (const hitIdx of hitIndices) {
				if (matched) break;
				// PROBE WINDOW SIZES AROUND HIT POSITION
				const minStart = Math.max(0, hitIdx - targetLen);
				const maxStart = Math.min(normContent.length - targetLen + 1, hitIdx + 2);

				for (let s = minStart; s <= maxStart && !matched; s++) {
					for (const l of [targetLen, targetLen - 1, targetLen + 1]) {
						if (l < 3 || s + l > normContent.length) continue;
						const e = s + l - 1;
						const spanKey = `${s}-${e}`;
						if (testedSpans.has(spanKey)) continue;
						testedSpans.add(spanKey);

						if (wordDelimited && !wordBounded(normContent, s, e)) continue;

						const slice = normContent.slice(s, s + l);
						const dist = damerauLevenshtein(cand.key, slice);
						const maxAllowedDist = targetLen <= 5 ? 1 : 2;

						if (dist <= maxAllowedDist) {
							const span: [number, number] = [s, e];
							const spans = occ.get(cand.key);
							if (spans) spans.push(span);
							else occ.set(cand.key, [span]);
							matched = true;
							break;
						}
					}
				}
			}
		}
	}

	if (occ.size === 0) return [];

	// LONGEST MATCH WINS — BUT COVERAGE-AWARE, NOT A BLIND SUBSTRING TEST. DROP A SHORT TERM ONLY WHEN *EVERY*
	// ONE OF ITS OCCURRENCES SITS INSIDE A LONGER MATCHED TERM.
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
	// SURVIVED. SORT BY THE TERM'S EARLIEST KEPT OCCURRENCE FOR A STABLE, READABLE ORDER.
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
	const { wordDelimited } = await build(bookId);
	const normContent = normalizeContent(content, wordDelimited);
	if (!normContent) return present;

	const normSources = sources.map((s) => ({ orig: s, norm: normalizeKey(s, wordDelimited) })).filter((x) => x.norm);
	const ac = new AhoCorasick(normSources.map((x) => x.norm));
	const normToOrig = new Map<string, string>();
	for (const x of normSources) {
		if (!normToOrig.has(x.norm)) normToOrig.set(x.norm, x.orig);
	}

	for (const [endIndex, keywords] of ac.search(normContent) as [number, string[]][]) {
		for (const k of keywords) {
			if (!wordDelimited) {
				const orig = normToOrig.get(k);
				if (orig) present.add(orig);
				continue;
			}
			const start = endIndex - k.length + 1;
			if (wordBounded(normContent, start, endIndex)) {
				const orig = normToOrig.get(k);
				if (orig) present.add(orig);
			}
		}
	}
	return present;
}
