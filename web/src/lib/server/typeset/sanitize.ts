// SANITIZATION AND CASING FOR TYPESETTING
import { CJK_REGEX } from './fonts';
import { type TypesetRegion } from './stat-panel';

export function sanitizeForFont(text: string): string {
	if (!text) return '';
	let trimmed = text.trim().replace(/[〜～]/g, '~');
	if (CJK_REGEX.test(trimmed)) {
		return trimmed
			.replace(/[ \t]{2,}/g, ' ')
			.trim();
	}

	trimmed = trimmed
		.replace(/[【〔]/g, '[')
		.replace(/[】〕]/g, ']')
		.replace(/[《「『]/g, '"')
		.replace(/[》」』]/g, '"')
		.replace(/[“”„‟]/g, '"')
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[〜～]/g, '~');

	// COLLAPSE ISOLATED SPACED OCR LETTERS (E.G. "H E L L O" -> "HELLO", "Y\ne\na\nh" -> "Yeah")
	// NEGATIVE LOOKBEHIND/LOOKAHEAD PREVENTS MERGING CONTRACTIONS (E.G. "I'M A", "IT'S A", "DON'T I")
	trimmed = trimmed.replace(/(?<!['’\w])([a-zA-Z](?:[\s]+[a-zA-Z])+)(?!['’\w])/g, (match) => {
		const tokens = match.split(/\s+/);
		if (tokens.length >= 2 && tokens.every((t) => t.length === 1)) {
			if (tokens.length === 2 && (/^[aAiI]$/.test(tokens[0]) || /^[aAiI]$/.test(tokens[1]))) {
				return match;
			}
			return tokens.join('');
		}
		return match;
	});

	return trimmed
		.replace(/,\s*,/g, ', ')
		.replace(/\.\s*,/g, '. ')
		.replace(/!\s*,/g, '! ')
		.replace(/\?\s*,/g, '? ')
		.replace(/…\s*,/g, '… ')
		.replace(/,\s*([.!?…])/g, '$1')
		.replace(/,\s*$/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

export function renderText(r: TypesetRegion): string {
	const sanitized = sanitizeForFont(r.text.trim());
	if (CJK_REGEX.test(sanitized)) {
		return sanitized;
	}
	return sanitized.toUpperCase();
}
