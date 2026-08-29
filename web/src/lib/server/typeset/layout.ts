// TEXT REFLOW, WRAPPING, AND FONT SIZE FITTING ALGORITHMS
import { CJK_REGEX, fontSpec } from './fonts';

const BOX_INSET = 0.05;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
const LONE_PUNCT = /^[.．…·!！?？,，;；:：~～)"'']{1,3}$/;

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

		for (const word of paragraph.split(/\s+/)) {
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
				const candidate = `${current} ${word}`;
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

	const words = text.split(/[\s\n]+/).filter(Boolean);
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

	const isNarrowVertical = boxH / boxW >= 1.4 && boxH >= 65;
	if (foundClean && (cleanBest >= 11 || !isNarrowVertical)) {
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

	// IF NARROW VERTICAL CONTAINER FORCED FONT DOWN BELOW LEGIBLE THRESHOLD (< 12pt) DESPITE AMPLE HEIGHT,
	// TRY REFLOWING WITHOUT HARD NEWLINES TO ALLOW BALANCED HORIZONTAL WRAPPING AT A LEGIBLE FONT SIZE
	if (best < 12 && isNarrowVertical && text.includes('\n') && !isStructuredList(text)) {
		const flattenedText = text.replace(/\n+/g, ' ').trim();
		let flatLo = Math.max(best, MIN_FONT_SIZE);
		let flatHi = Math.max(flatLo, maxSize ?? startSize);
		let flatBest = best;
		while (flatLo <= flatHi) {
			const mid = Math.floor((flatLo + flatHi) / 2);
			if (mid === 0) break;
			ctx.font = fontSpec(mid, fontFamily, flattenedText, customCjk);
			const lines = reflowText(ctx, flattenedText, maxW);
			const lineH = mid * LINE_HEIGHT;
			const allLinesFitW = lines.every((l) => ctx.measureText(l).width <= maxW + 0.5);
			if (allLinesFitW && lines.length * lineH <= maxH) {
				flatBest = mid;
				flatLo = mid + 1;
			} else {
				flatHi = mid - 1;
			}
		}
		if (flatBest > best) {
			return flatBest;
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

