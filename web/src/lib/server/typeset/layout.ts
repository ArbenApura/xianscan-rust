// TEXT REFLOW, WRAPPING, AND FONT SIZE FITTING ALGORITHMS
// IMPORTED MODULES
import { CJK_REGEX, fontSpec } from './fonts';

// -- CONSTANTS -- //

const BOX_INSET = 0.05;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
const LONE_PUNCT = /^[.．…·!！?？,，;；:：~～)"'']{1,10}$/;

// COMMON ENGLISH PREFIXES AND SUFFIXES FOR SYLLABLE HYPHENATION
const HYPHEN_PREFIXES = [
	'under', 'super', 'inter', 'intra', 'trans', 'multi',
	'over', 'some', 'with', 'fore', 'back', 'down', 'post',
	'anti', 'semi', 'auto', 'para', 'self', 'dis', 'mis', 'out', 'pre', 'pro', 'sub', 'non', 'un',
	'con', 'com', 'per', 'for', 'tra', 'tri'
];

const HYPHEN_SUFFIXES = [
	'ization', 'isation', 'ational',
	'action', 'ection', 'iction', 'uction', 'ation', 'ition', 'ution', 'sion', 'tion',
	'ement', 'iment', 'nment', 'ment',
	'able', 'ible', 'ness', 'less', 'ful', 'est', 'ity', 'ive', 'ous', 'ish', 'ize', 'ise', 'ism', 'ist', 'tor', 'ter'
];

// -- FUNCTIONS -- //

export function findHyphenationPoints(rawWord: string): number[] {
	const word = rawWord.toLowerCase();
	const len = word.length;
	// COMIC TYPESETTING: ONLY HYPHENATE WORDS WITH AT LEAST 7 LETTERS
	if (len < 7) return [];

	const points = new Set<number>();

	// 1. EXPLICIT INTERNAL HYPHEN (E.G. "IKUSHIMA-KUN", "TWENTY-FIVE")
	for (let i = 1; i < len - 1; i++) {
		if (word[i] === '-') {
			points.add(i + 1);
		}
	}

	// 2. COMMON PREFIXES (ONLY FOR WORDS WITH SUFFICIENT STEM LENGTH)
	for (const p of HYPHEN_PREFIXES) {
		if (word.startsWith(p) && len - p.length >= 3 && p.length >= 2) {
			points.add(p.length);
		}
	}

	// 3. COMMON SUFFIXES (ONLY FOR WORDS WITH SUFFICIENT STEM LENGTH)
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

	// 6. VOWEL-CONSONANT-VOWEL (V-CV) FALLBACK: ONLY WHEN NO OTHER RULE FOUND A BREAK POINT.
	// HANDLES WORDS LIKE "CEREMONY" (CERE-MONY), "RECOVERY" (RECOV-ERY), "FAMILIAR" (FAMIL-IAR)
	// THAT HAVE NO MATCHING PREFIX, SUFFIX, DOUBLE-CONSONANT, OR VCCV PATTERN.
	// SKIPPED ENTIRELY IF PRIOR RULES ALREADY FOUND BREAKS (E.G. "EVERYTHING" → "EVERY-THING").
	if (points.size === 0) {
		for (let i = 2; i < len - 1; i++) {
			const prev = word[i - 1];
			const curr = word[i];
			const next = word[i + 1];
			if (vowels.includes(prev) && !vowels.includes(curr) && curr !== '-' && vowels.includes(next)) {
				points.add(i);
			}
		}
	}

	return Array.from(points)
		.filter((p) => p >= 3 && len - p >= 3)
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

		// DO NOT BREAK SHORT WORDS (< 7 LETTERS): KEEP INTACT UNLESS IT HAS TRAILING PUNCTUATION THAT CAN DETACH
		if (stem.length < 7) {
			if (trailingPunct && ctx.measureText(stem).width <= maxWidth) {
				return { head: [stem], tail: trailingPunct };
			}
			return { head: [], tail: word };
		}

		while (ctx.measureText(current).width > maxWidth && current.length > 1) {
			const curPunctMatch = current.match(/^(.*?)([.!?,:;~…"']+)?$/);
			const curStem = curPunctMatch && curPunctMatch[1] ? curPunctMatch[1] : current;
			const curPunct = curPunctMatch && curPunctMatch[2] ? curPunctMatch[2] : '';

			if (curStem.length < 7) {
				break;
			}

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

			// 2. CHARACTER FALLBACK ONLY FOR LONG WORDS (>= 7 LETTERS) WHEN OVERFLOW > 1 LETTER
			let kRaw = current.length - 1;
			while (kRaw > 0 && ctx.measureText(current.slice(0, kRaw)).width > maxWidth) {
				kRaw--;
			}
			const overflowLetters = current.length - kRaw;
			if (overflowLetters <= 1) {
				break;
			}

			let k = current.length - 2;
			while (k >= 3 && ctx.measureText(current.slice(0, k) + '-').width > maxWidth) {
				k--;
			}
			if (k < 3 || current.length - k < 3) {
				break;
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
			} else if (w.includes("'") && !w.startsWith("'") && !w.endsWith("'")) {
				const sub = w.split("'");
				// ONLY SPLIT ON APOSTROPHE IF EVERY SUFFIX SEGMENT IS LONG ENOUGH TO BE A VALID BREAK POINT
				// SHORT SUFFIXES LIKE 'T, 'S, 'D, 'LL, 'VE, 'RE MUST STAY ATTACHED TO THEIR PREFIX
				const allSufficesLongEnough = sub.slice(1).every((s) => s.length >= 3);
				if (allSufficesLongEnough) {
					for (let i = 0; i < sub.length; i++) {
						if (i < sub.length - 1) {
							expandedWords.push(`${sub[i]}'`);
						} else {
							expandedWords.push(sub[i]);
						}
					}
				} else {
					expandedWords.push(w);
				}
			} else {
				const m = w.match(/^(.*?)([.!?,:;~…"']{2,})$/);
				if (m && m[1] && m[2]) {
					expandedWords.push(m[1], m[2]);
				} else {
					expandedWords.push(w);
				}
			}
		}

		for (const word of expandedWords) {
			if (!word) continue;
			if (!current) {
				if (ctx.measureText(word).width <= maxWidth) {
					current = word;
				} else {
					const { head, tail } = breakLongWord(word);
					if (head.length > 0) {
						lines.push(...head);
						current = tail;
					} else {
						current = word;
					}
				}
			} else {
				const isPurePunct = LONE_PUNCT.test(word);
				const candidate = current.endsWith('-') || current.endsWith("'") || isPurePunct ? `${current}${word}` : `${current} ${word}`;
				if (ctx.measureText(candidate).width <= (isPurePunct ? maxWidth * 1.15 : maxWidth)) {
					current = candidate;
				} else {
					lines.push(current);
					if (ctx.measureText(word).width <= maxWidth) {
						current = word;
					} else {
						const { head, tail } = breakLongWord(word);
						if (head.length > 0) {
							lines.push(...head);
							current = tail;
						} else {
							current = word;
						}
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
		} else if (w.includes("'") && !w.startsWith("'") && !w.endsWith("'")) {
			const sub = w.split("'");
			// ONLY SPLIT ON APOSTROPHE IF EVERY SUFFIX SEGMENT IS LONG ENOUGH TO BE A VALID BREAK POINT
			// SHORT SUFFIXES LIKE 'T, 'S, 'D, 'LL, 'VE, 'RE MUST STAY ATTACHED TO THEIR PREFIX
			const allSufficesLongEnough = sub.slice(1).every((s) => s.length >= 3);
			if (allSufficesLongEnough) {
				for (let i = 0; i < sub.length; i++) {
					words.push(i < sub.length - 1 ? `${sub[i]}'` : sub[i]);
				}
			} else {
				words.push(w);
			}
		} else {
			const m = w.match(/^(.*?)([.!?,:;~…"']{2,})$/);
			if (m && m[1] && m[2]) {
				words.push(m[1], m[2]);
			} else {
				words.push(w);
			}
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

		// HYPHENATION-AWARE MAX WORD WIDTH: USE THE WIDEST SEGMENT AFTER APPLYING
		// HYPHENATION BREAKS (MATCHING WHAT wrapText WILL ACTUALLY PRODUCE).
		// WITHOUT THIS, WORDS LIKE "SOMETHING" OR "CEREMONY" BLOCK LARGER FONT SIZES
		// EVEN THOUGH THEY CAN BE BROKEN ACROSS LINES, LEAVING VERTICAL SPACE WASTED.
		// ONLY SWITCH TO THE HYPHENATED-SEGMENT WIDTH WHEN THE WHOLE WORD ALREADY
		// OVERFLOWS THE BOX — SO BREAKABLE WORDS LIKE "EVERYTHING" STAY INTACT WHEN THEY FIT.
		const maxWordWidth = Math.max(
			0,
			...words.map((w) => {
				const punctMatch = w.match(/^(.*?)([.!?,:;~…"']+)?$/);
				const stem = punctMatch && punctMatch[1] ? punctMatch[1] : w;
				const trailingPunct = punctMatch?.[2] ?? '';
				const fullW = ctx.measureText(w).width;
				const stemW = ctx.measureText(stem).width;
				// IF THE WHOLE WORD FITS STRICTLY WITHIN THE BOX, REPORT ITS ACTUAL WIDTH —
				// DON'T PRETEND IT'S SHORTER JUST BECAUSE IT COULD HYPHENATE.
				if (stemW <= maxW) {
					return stemW;
				}
				// WORD OVERFLOWS: CHECK WHETHER HYPHENATION GIVES A SHORTER SEGMENT THAT FITS.
				const points = findHyphenationPoints(stem);
				if (points.length > 0) {
					let segMax = 0;
					let prev = 0;
					for (const p of points) {
						const seg = stem[p - 1] === '-' ? stem.slice(prev, p) : `${stem.slice(prev, p)}-`;
						segMax = Math.max(segMax, ctx.measureText(seg).width);
						prev = p;
					}
					segMax = Math.max(segMax, ctx.measureText(stem.slice(prev) + trailingPunct).width);
					return segMax;
				}
				return fullW;
			}),
		);
		if (maxWordWidth <= maxW * 1.15) {
			const lines = reflowText(ctx, text, maxW);
			const lineH = mid * LINE_HEIGHT;
			const allLinesFitW = lines.every((l) => ctx.measureText(l).width <= maxW * 1.15 + 0.5);
			const hasNoHyphenBreaks = lines.every((l) => !l.endsWith('-') || text.includes(l));
			if (allLinesFitW && lines.length * lineH <= maxH && hasNoHyphenBreaks) {
				cleanBest = mid;
				foundClean = true;
				lo = mid + 1;
				continue;
			}
		}
		hi = mid - 1;
	}

	// TALL-NARROW TYPESET FLOOR: WHEN THE TYPESET BOUNDARY IS MUCH TALLER THAN
	// WIDE (ASPECT RATIO >= 2.5), THE NARROW WIDTH ALONE BOTTLENECKS THE BINARY
	// SEARCH INTO AN UNREADABLY TINY FONT. COMPUTE A GEOMETRIC MINIMUM DERIVED
	// PURELY FROM THE TYPESET BOX DIMENSIONS — NOT THE BUBBLE BOUNDARY.
	// SLIGHT VERTICAL OVERFLOW IS TOLERATED; HORIZONTAL OVERFLOW IS NOT.
	// FLOOR IS CLAMPED BY THE EFFECTIVE CAP SO IT NEVER EXCEEDS THE CALLER'S LIMIT.
	const aspectRatio = maxH / Math.max(maxW, 1);
	const effectiveCap = Math.max(MIN_FONT_SIZE, maxSize ?? startSize);
	let tallNarrowFloor = MIN_FONT_SIZE;
	if (aspectRatio >= 2.5) {
		const geometricCandidate = Math.min(
			effectiveCap,
			Math.max(
				MIN_FONT_SIZE,
				Math.round(maxW * 0.28),
				Math.round(Math.sqrt(maxW * maxH) * 0.10),
			),
		);
		// CLAMP THE GEOMETRIC CANDIDATE TO THE LARGEST SIZE WHERE:
		//   (A) ALL REFLOWED LINES FIT WITHIN maxW — NO HORIZONTAL CLIPPING.
		//   (B) TOTAL LINE STACK DOES NOT EXCEED maxH * 1.15 — NO EGREGIOUS
		//       VERTICAL BLOWOUT. UP TO 15% VERTICAL OVERFLOW IS TOLERATED
		//       TO LIFT THE FONT ABOVE THE TINY SIZE THE HEIGHT CONSTRAINT ALONE
		//       WOULD PRODUCE, BUT NOT SO MUCH THAT IT BLEEDS FAR OUTSIDE THE BOX.
		const TALL_NARROW_VERT_TOLERANCE = 1.15;
		let floorLo = MIN_FONT_SIZE;
		let floorHi = geometricCandidate;
		let safeFloor = MIN_FONT_SIZE;
		while (floorLo <= floorHi) {
			const mid = Math.floor((floorLo + floorHi) / 2);
			if (mid === 0) break;
			ctx.font = fontSpec(mid, fontFamily, text, customCjk);
			const lines = reflowText(ctx, text, maxW);
			const lineH = mid * LINE_HEIGHT;
			const allFitW = lines.every((l) => ctx.measureText(l).width <= maxW * 1.15 + 0.5);
			const totalH = lines.length * lineH;
			if (allFitW && totalH <= maxH * TALL_NARROW_VERT_TOLERANCE) {
				safeFloor = mid;
				floorLo = mid + 1;
			} else {
				floorHi = mid - 1;
			}
		}
		tallNarrowFloor = safeFloor;
	}

	const isNarrowVertical = (boxH / boxW >= 1.15 || boxH >= 120) && boxH >= 65;
	if (foundClean && (cleanBest >= 14 || !isNarrowVertical)) {
		return Math.max(cleanBest, tallNarrowFloor);
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
		const allLinesFitW = lines.every((l) => ctx.measureText(l).width <= maxW * 1.15 + 0.5);
		// SECOND PASS ALLOWS CHAR-LEVEL BREAKING (OVERFLOW > 1 LETTER) BUT STILL REJECTS
		// MORPHOLOGICAL HYPHENATION (E.G. "EVERY-THING") — THOSE WERE ALREADY HANDLED IN PASS 1.
		const hasNoHyphenBreaks = lines.every((l) => !l.endsWith('-') || text.includes(l));
		if (allLinesFitW && lines.length * lineH <= maxH && hasNoHyphenBreaks) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	return Math.max(best, tallNarrowFloor);
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

