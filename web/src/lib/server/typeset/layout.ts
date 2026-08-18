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
			if (stemWidth <= maxWidth) {
				return { head: [], tail: current };
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
				lines[lines.length - 1] += current;
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
	const paragraph = text.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
	return balancedWrapText(ctx, paragraph, maxWidth);
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
		ctx.font = fontSpec(mid, fontFamily);

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
		ctx.font = fontSpec(mid, fontFamily);
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
): number {
	let lo = MIN_FONT_SIZE;
	let hi = Math.max(lo, startSize);
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		ctx.font = fontSpec(mid, fontFamily);
		const textWidth = ctx.measureText(text).width;
		const lineH = mid * LINE_HEIGHT;
		if (textWidth <= maxW && lineH <= maxH) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}
