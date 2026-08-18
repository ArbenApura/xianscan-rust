// SANITIZATION AND CASING FOR TYPESETTING
import { CJK_REGEX } from './fonts';
import { parseStatPanel, type TypesetRegion } from './stat-panel';

export function sanitizeForFont(text: string): string {
	if (!text) return '';
	let trimmed = text.trim();
	if (CJK_REGEX.test(trimmed)) {
		return trimmed
			.replace(/[ \t]{2,}/g, ' ')
			.trim();
	}

	trimmed = trimmed.replace(/\b([a-zA-Z](?:\s+[a-zA-Z])+)\b/g, (match) => {
		const tokens = match.split(/\s+/);
		if (tokens.length >= 2 && tokens.every((t) => t.length === 1)) {
			return tokens.join('');
		}
		return match;
	});

	return trimmed
		.replace(/[【〔]/g, '[')
		.replace(/[】〕]/g, ']')
		.replace(/[《「『]/g, '"')
		.replace(/[》」』]/g, '"')
		.replace(/[“”„‟]/g, '"')
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[〜～]/g, '~')
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
	const segs = parseStatPanel(sanitized);
	if (segs) {
		return segs.map((s) => s.text).join('\n');
	}
	return sanitized.toUpperCase();
}
