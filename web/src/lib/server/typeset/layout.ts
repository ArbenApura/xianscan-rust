// TEXT REFLOW, WRAPPING, AND FONT SIZE FITTING ALGORITHMS
// IMPORTED MODULES
import { CJK_REGEX, fontSpec } from './fonts';

// -- CONSTANTS -- //

const BOX_INSET = 0.05;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
const LONE_PUNCT = /^[.．…·!！?？,，;；:：~～)"'']{1,3}$/;

// COMMON ENGLISH PREFIXES AND SUFFIXES FOR SYLLABLE HYPHENATION
const HYPHEN_PREFIXES = [
	'under', 'super', 'inter', 'intra', 'trans', 'every', 'multi',
	'over', 'some', 'with', 'fore', 'back', 'down', 'post',
	'anti', 'semi', 'auto', 'para', 'self', 'dis', 'mis', 'out', 'pre', 'pro', 'sub', 'non', 'un',
	'con', 'com', 'per', 'for', 'tra', 'tri', 'be', 'de', 're', 'in', 'im', 'ex', 'en'
];

const HYPHEN_SUFFIXES = [
	'ization', 'isation', 'ational',
	'action', 'ection', 'iction', 'uction', 'ation', 'ition', 'ution', 'sion', 'tion',
	'ement', 'iment', 'nment', 'ment',
	'able', 'ible', 'ness', 'less', 'ful', 'ing', 'est', 'ity', 'ive', 'ous', 'ish', 'ize', 'ise', 'ism', 'ist', 'tor', 'ter'
];

// -- FUNCTIONS -- //

export function findHyphenationPoints(rawWord: string): number[] {
	const word = rawWord.toLowerCase();
	const len = word.length;
	if (len < 6) return [];

	const points = new Set<number>();

	// 1. EXPLICIT INTERNAL HYPHEN (E.G. "IKUSHIMA-KUN", "TWENTY-FIVE")
	for (let i = 1; i < len - 1; i++) {
		if (word[i] === '-') {
			points.add(i + 1);
		}
	}

	// 2. COMMON PREFIXES
	for (const p of HYPHEN_PREFIXES) {
		if (word.startsWith(p) && len - p.length >= 3) {
			points.add(p.length);
		}
	}

	// 3. COMMON SUFFIXES
	for (const s of HYPHEN_SUFFIXES) {
		if (word.endsWith(s) && len - s.length >= 3) {
			points.add(len - s.length);
		}
	}

	// 4. DOUBLE CONSONANTS: TT, LL, PP, NN, SS, RR, DD, BB, GG, FF, MM, CC, CK
	for (let i = 2; i < len - 2; i++) {
		const c1 = word[i - 1];
		const c2 = word[i];
		if (c1 === c2 && 'bcdfghjklmnpqrstvwxz'.includes(c1)) {
			points.add(i);
		} else if (c1 === 'c' && c2 === 'k') {
			points.add(i);
		}
	}

	// 5. VOWEL-CONSONANT-CONSONANT-VOWEL (VC-CV)
	const vowels = 'aeiouy';
	for (let i = 2; i < len - 2; i++) {
		const v1 = vowels.includes(word[i - 2]);
		const c1 = !vowels.includes(word[i - 1]) && word[i - 1] !== '-';
		const c2 = !vowels.includes(word[i]) && word[i] !== '-';
		const v2 = vowels.includes(word[i + 1]);
		if (v1 && c1 && c2 && v2) {
			const pair = word.slice(i - 1, i + 1);
			if (!['th', 'sh', 'ch', 'ph', 'wh', 'qu', 'gh', 'ng'].includes(pair)) {
				points.add(i);
			}
		}
	}

	// 6. VOWEL-CONSONANT-VOWEL (V-CV)
	for (let i = 2; i < len - 2; i++) {
		const v1 = vowels.includes(word[i - 1]);
		const c1 = !vowels.includes(word[i]) && word[i] !== '-';
		const v2 = vowels.includes(word[i + 1]);
		if (v1 && c1 && v2) {
			points.add(i);
		}
	}

	return Array.from(points)
		.filter((p) => p >= 2 && len - p >= 2)
		.sort((a, b) => a - b);
}

export function getEffectiveMaxWordWidth(
	ctx: { measureText(t: string): { width: number } },
	wordList: string[],
): number {
	let maxW = 0;
	for (const w of wordList) {
		const punctMatch = w.match(/^(.*?)([.!?,:;~…"']+)?$/);
		const stem = punctMatch && punctMatch[1] ? punctMatch[1] : w;
		const points = findHyphenationPoints(stem);
		if (points.length > 0) {
			let prev = 0;
			for (const p of points) {
				const segment = stem[p - 1] === '-' ? stem.slice(prev, p) : `${stem.slice(prev, p)}-`;
				maxW = Math.max(maxW, ctx.measureText(segment).width);
				prev = p;
			}
			const lastSegment = stem.slice(prev) + (punctMatch?.[2] || '');
			maxW = Math.max(maxW, ctx.measureText(lastSegment).width);
		} else {
			maxW = Math.max(maxW, ctx.measureText(w).width);
		}
	}
	return maxW;
}

export function wrapText(ctx: { measureText(t: string): { width: number } }, text: string, maxWidth: number): string[] {
	const lines: string[] = [];

	function breakLongWord(word: string): { head: string[]; tail: string } {
		let current = word;
		const heads: string[] = [];

		const punctMatch = current.match(/^(.*?)([.!?,:;~…"']+)?$/);
		const stem = punctMatch && punctMatch[1] ? punctMatch[1] : current;
		const trailingPunct = punctMatch && punctMatch[2] ? punctMatch[2] : '';

		if (ctx.measureText(current).width > maxWidth && trailingPunct) {
			const stemWidth = ctx.measureText(stem).width;
			if (stemWidth <= maxWidth && ctx.measureText(current).width <= maxWidth * 1.15) {
				return { head: [], tail: current };
			}
			if (stemWidth <= maxWidth) {
				return { head: [stem], tail: trailingPunct };
			}
		}

		while (ctx.measureText(current).width > maxWidth && current.length > 1) {
			const curPunctMatch = current.match(/^(.*?)([.!?,:;~…"']+)?$/);
			const curStem = curPunctMatch && curPunctMatch[1] ? curPunctMatch[1] : current;
			const curPunct = curPunctMatch && curPunctMatch[2] ? curPunctMatch[2] : '';

			// 1. TRY NATURAL SYLLABLE / HYPHEN POINTS FIRST
			const points = findHyphenationPoints(curStem);
			let chosenSplit = -1;
			for (let i = points.length - 1; i >= 0; i--) {
				const p = points[i];
				const candHead = curStem[p - 1] === '-' ? curStem.slice(0, p) : `${curStem.slice(0, p)}-`;
				if (ctx.measureText(candHead).width <= maxWidth) {
					chosenSplit = p;
					break;
				}
			}

			if (chosenSplit > 0) {
				const candHead = curStem[chosenSplit - 1] === '-' ? curStem.slice(0, chosenSplit) : `${curStem.slice(0, chosenSplit)}-`;
				heads.push(candHead);
				current = curStem.slice(chosenSplit) + curPunct;
				continue;
			}

			// 2. CHARACTER FALLBACK FOR UNBREAKABLE TOKENS
			let kRaw = current.length - 1;
			while (kRaw > 0 && ctx.measureText(current.slice(0, kRaw)).width > maxWidth) {
				kRaw--;
			}
			const overflowLetters = current.length - kRaw;
			if (overflowLetters <= 1) {
				break;
			}

			let k = current.length - 2;
			while (k > 0 && ctx.measureText(current.slice(0, k) + '-').width > maxWidth) {
				k--;
			}
			if (k <= 0) {
				k = 1;
			}
			const prefix = current.slice(0, k);
			heads.push(prefix.endsWith('-') ? prefix : `${prefix}-`);
			current = current.slice(k);
		}
		return { head: heads, tail: current };
	}

	for (const paragraph of text.split('\n')) {
		let current = '';
		if (CJK_REGEX.test(paragraph)) {
			for (let i = 0; i < paragraph.length; i++) {
				const char = paragraph[i];
				const candidate = `${current}${char}`;
				if (ctx.measureText(candidate).width <= maxWidth) {
					current = candidate;
				} else {
					if (current) lines.push(current);
					current = char;
				}
			}
			if (current) lines.push(current);
			continue;
		}

		// SPLIT WORDS ON WHITESPACE, ALSO RECOGNIZING HYPHENATED COMPOUNDS
		const rawWords = paragraph.split(/\s+/).filter(Boolean);
		const expandedWords: string[] = [];
		for (const w of rawWords) {
			if (w.includes('-') && !w.startsWith('-') && !w.endsWith('-') && w.length >= 5) {
				const sub = w.split('-');
				for (let i = 0; i < sub.length; i++) {
					if (i < sub.length - 1) {
						expandedWords.push(`${sub[i]}-`);
					} else {
						expandedWords.push(sub[i]);
					}
				}
			} else {
				expandedWords.push(w);
			}
		}

		for (const word of expandedWords) {
			if (!word) continue;
			if (!current) {
				if (ctx.measureText(word).width <= maxWidth) {
					current = word;
				} else {
					const { head, tail } = breakLongWord(word);
					lines.push(...head);
					current = tail;
				}
			} else {
				const candidate = current.endsWith('-') ? `${current}${word}` : `${current} ${word}`;
				if (ctx.measureText(candidate).width <= maxWidth) {
					current = candidate;
				} else {
					lines.push(current);
					if (ctx.measureText(word).width <= maxWidth) {
						current = word;
					} else {
						const { head, tail } = breakLongWord(word);
						lines.push(...head);
						current = tail;
					}
				}
			}
		}
		if (current) {
			if (LONE_PUNCT.test(current) && lines.length > 0) {
				const candidate = `${lines[lines.length - 1]}${current}`;
				if (ctx.measureText(candidate).width <= maxWidth * 1.15) {
					lines[lines.length - 1] = candidate;
				} else {
					lines.push(current);
				}
			} else {
				lines.push(current);
			}
		}
	}
	return lines;
}

export function balancedWrapText(
	ctx: { measureText(t: string): { width: number } },
	text: string,
	maxWidth: number,
): string[] {
	const greedy = wrapText(ctx, text, maxWidth);
	const N = greedy.length;
	if (N <= 1) return greedy;

	let lo = Math.max(10, Math.floor(maxWidth / N));
	let hi = maxWidth;
	while (lo < hi - 1) {
		const mid = Math.floor((lo + hi) / 2);
		if (wrapText(ctx, text, mid).length <= N) hi = mid;
		else lo = mid + 1;
	}
	return wrapText(ctx, text, hi);
}

export function isStructuredList(text: string): boolean {
	const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	if (rawLines.length < 3) return false;
	const colonCount = rawLines.filter((l) => /^[a-zA-Z\u4e00-\u9fa5\s]+[:：]/.test(l) || l.endsWith(':') || l.endsWith('：')).length;
	if (colonCount >= 2) return true;
	const bulletCount = rawLines.filter((l) => /^[-*•\d+.]\s+/.test(l)).length;
	if (bulletCount >= 2 && bulletCount >= rawLines.length / 2) return true;
	return false;
}

export function isHardLineBreak(prevLine: string, nextLine: string): boolean {
	const prev = prevLine.trim();
	const next = nextLine.trim();
	if (!prev || !next) return true;

	// 1. PREVIOUS LINE ENDS WITH DEFINITIVE BREAK PUNCTUATION (COLON, BRACKET, EXCLAMATION, QUESTION, QUOTE)
	if (/[:：)）\]】>》!！?？"”'’]$/.test(prev)) {
		return true;
	}

	// 2. PREVIOUS LINE ENDS WITH PERIOD AND NEXT LINE STARTS WITH CAPITAL / SYMBOL / DIGIT
	if (/[.．]$/.test(prev) && /^([A-Z\u4e00-\u9fa5\uac00-\ud7af\u3040-\u30ff\[<("'\d#-]|\b)/.test(next)) {
		return true;
	}

	// 3. PREVIOUS LINE IS A SHORT STANDALONE HEADER / LABEL (E.G. "FLOOR 48", "QUEST ALERT", "WARNING")
	const prevWords = prev.split(/\s+/);
	if (prevWords.length <= 4 && prev.length <= 30 && !/[,，;；\-\/]$/.test(prev)) {
		return true;
	}

	// 4. NEXT LINE STARTS WITH STRUCTURAL PREFIX (BRACKETS, BULLETS, LIST DIGITS, SPEAKER TAG)
	if (/^(\[|<|\(|【|《|[-*•]\s+|\d+[.)]\s+|[a-zA-Z\u4e00-\u9fa5\uac00-\ud7af\s]{1,20}[:：])/.test(next)) {
		return true;
	}

	return false;
}

export function splitIntoLogicalParagraphs(text: string): string[] {
	const rawLines = text.split('\n');
	if (rawLines.length <= 1) return [text.trim()];

	const paragraphs: string[] = [];
	let current = '';

	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i].trim();
		if (!line) {
			if (current) {
				paragraphs.push(current);
				current = '';
			}
			continue;
		}

		if (!current) {
			current = line;
		} else {
			const prevLine = rawLines[i - 1]?.trim() || '';
			if (isHardLineBreak(prevLine, line)) {
				paragraphs.push(current);
				current = line;
			} else {
				current = `${current} ${line}`;
			}
		}
	}

	if (current) {
		paragraphs.push(current);
	}

	return paragraphs;
}

export function reflowText(
	ctx: { measureText(t: string): { width: number } },
	text: string,
	maxWidth: number,
): string[] {
	if (isStructuredList(text)) {
		const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
		const out: string[] = [];
		for (const line of rawLines) {
			const wrapped = wrapText(ctx, line, maxWidth);
			out.push(...wrapped);
		}
		return out;
	}

	const paragraphs = splitIntoLogicalParagraphs(text);
	const out: string[] = [];
	for (const p of paragraphs) {
		const cleanedParagraph = p.replace(/\s+/g, ' ').trim();
		if (!cleanedParagraph) continue;
		const wrapped = balancedWrapText(ctx, cleanedParagraph, maxWidth);
		out.push(...wrapped);
	}
	return out;
}

export function fitFontSize(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	fontFamily: string,
	boxW: number,
	boxH: number,
	startSize: number,
	maxSize?: number,
	boxInset?: number,
	customCjk?: string,
): number {
	const inset = boxInset ?? BOX_INSET;
	const maxW = Math.max(10, boxW * (1 - 2 * inset));
	const maxH = Math.max(10, boxH * (1 - 2 * inset));

	const rawWords = text.split(/[\s\n]+/).filter(Boolean);
	const words: string[] = [];
	for (const w of rawWords) {
		if (w.includes('-') && !w.startsWith('-') && !w.endsWith('-') && w.length >= 5) {
			const sub = w.split('-');
			for (let i = 0; i < sub.length; i++) {
				words.push(i < sub.length - 1 ? `${sub[i]}-` : sub[i]);
			}
		} else {
			words.push(w);
		}
	}

	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, maxSize ?? startSize);
	let cleanBest = MIN_FONT_SIZE;
	let foundClean = false;

	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (mid === 0) break;
		ctx.font = fontSpec(mid, fontFamily, text, customCjk);

		const maxWordWidth = Math.max(0, ...words.map((w) => ctx.measureText(w).width));
		if (maxWordWidth <= maxW) {
			const lines = reflowText(ctx, text, maxW);
			const lineH = mid * LINE_HEIGHT;
			const allLinesFitW = lines.every((l) => ctx.measureText(l).width <= maxW + 0.5);
			if (allLinesFitW && lines.length * lineH <= maxH) {
				cleanBest = mid;
				foundClean = true;
				lo = mid + 1;
				continue;
			}
		}
		hi = mid - 1;
	}

	const isNarrowVertical = (boxH / boxW >= 1.15 || boxH >= 120) && boxH >= 65;
	if (foundClean && (cleanBest >= 15 || !isNarrowVertical)) {
		return cleanBest;
	}

	lo = Math.max(cleanBest, MIN_FONT_SIZE);
	hi = Math.max(lo, maxSize ?? startSize);
	let best = cleanBest;

	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (mid === 0) break;
		ctx.font = fontSpec(mid, fontFamily, text, customCjk);
		const lines = reflowText(ctx, text, maxW);
		const lineH = mid * LINE_HEIGHT;
		const allLinesFitW = lines.every((l) => ctx.measureText(l).width <= maxW + 0.5);
		if (allLinesFitW && lines.length * lineH <= maxH) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	return best;
}

export function fitSingleLineSize(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	fontFamily: string,
	maxW: number,
	maxH: number,
	startSize: number,
	customCjk?: string,
): number {
	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, startSize);
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		ctx.font = fontSpec(mid, fontFamily, text, customCjk);
		const textWidth = ctx.measureText(text).width;
		const lineH = mid * LINE_HEIGHT;
		if (textWidth <= maxW && lineH <= maxH) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

export function tryVerticalSingleWordLayout(
	ctx: { font: string; measureText(t: string): { width: number } },
	text: string,
	fontFamily: string,
	boxW: number,
	boxH: number,
	maxCap: number,
	isVertical?: boolean,
	boxInset?: number,
	customCjk?: string,
): { lines: string[]; size: number } | null {
	// ONLY APPLY IF THE OCR / PIPELINE DETECTED REGION IS MARKED AS VERTICAL
	if (!isVertical) return null;

	const trimmed = text.trim();
	if (!trimmed || /\s/.test(trimmed)) return null;
	if (CJK_REGEX.test(trimmed)) return null;

	const inset = boxInset ?? BOX_INSET;
	const maxW = Math.max(10, boxW * (1 - 2 * inset));
	const maxH = Math.max(10, boxH * (1 - 2 * inset));

	if (boxH / boxW < 1.2 || boxH < 50) return null;

	const match = trimmed.match(/^([^!！?？.．…~～]+)([.!！?？…~～]*)$/);
	if (!match) return null;

	const letters = match[1];
	const punct = match[2] || '';
	// ONLY APPLY ON SHORT SINGLE WORDS (3 TO 8 LETTERS) TO AVOID OVERLY LONG/TINY VERTICAL STRINGS
	if (letters.length < 3 || letters.length > 8) return null;

	const chars = letters.split('');
	if (punct) {
		chars.push(...punct.split(''));
	}

	const horizSize = fitSingleLineSize(ctx, trimmed, fontFamily, maxW, maxH, maxCap, customCjk);

	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, maxCap);
	let vertBest = MIN_FONT_SIZE;
	let vertFound = false;

	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (mid === 0) break;
		ctx.font = fontSpec(mid, fontFamily, trimmed, customCjk);
		const allCharsFitW = chars.every((c) => ctx.measureText(c).width <= maxW);
		const totalH = chars.length * mid * 1.15;
		if (allCharsFitW && totalH <= maxH) {
			vertBest = mid;
			vertFound = true;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	// ENSURE LETTERS STAY LARGE AND BOLD (>= 11px)
	if (vertFound && vertBest >= 11 && (vertBest >= horizSize * 1.25 || (horizSize <= 9 && vertBest >= 11))) {
		return { lines: chars, size: vertBest };
	}

	return null;
}

