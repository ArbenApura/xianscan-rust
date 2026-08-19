// TRANSLATION SALVAGE PARSER AND HEURISTICS
import { stripThinkingTags } from '../llm';
import type { RegionSource } from './prompts';

export function sanitizeTranslationArtifacts(translated: string, source: string): string {
	let t = translated.trim();
	const s = source.trim();
	if (!t || !s) return t;

	// 1. UNMATCHED LEADING PARENTHESIS FROM BUBBLE BORDER OCR NOISE:
	// IF SOURCE STARTS WITH "(" OR "（" BUT HAS NO CLOSING ")" OR "）", IT IS A BORDER ARTIFACT.
	const sourceHasOpenParen = /^[（(]/.test(s);
	const sourceHasCloseParen = /[）)]/.test(s);
	if (sourceHasOpenParen && !sourceHasCloseParen) {
		// STRIP UNMATCHED LEADING "(" OR WRAPPING "(...)" IN TRANSLATION
		if (t.startsWith('(') && t.endsWith(')')) {
			t = t.slice(1, -1).trim();
		} else if (t.startsWith('(')) {
			t = t.slice(1).trim();
		} else if (t.startsWith('（') && t.endsWith('）')) {
			t = t.slice(1, -1).trim();
		} else if (t.startsWith('（')) {
			t = t.slice(1).trim();
		}
	}

	// 2. TRAILING BUBBLE TAIL OCR DIGITS (e.g. "! 20..." OR "! 20……" AFTER TERMINAL PUNCTUATION)
	// IF SOURCE HAD TERMINAL PUNCTUATION FOLLOWED BY STRAY NUMBERS / TAIL ELLIPSES, STRIP IT FROM TRANSLATION.
	const sourceTailMatch = s.match(/([!！？?。~～])\s*(?:\d{1,3}|oo|o\s*o\s*o)\s*(?:[.．…·]+)?$/i);
	if (sourceTailMatch) {
		// STRIP TRAILING MATCHING DIGITS / ELLIPSES FROM TRANSLATION
		t = t.replace(/([!?.~])\s*(?:\d{1,3}|oo|o\s*o\s*o)\s*(?:[.．…·]+)?$/i, '$1').trim();
		t = t.replace(/\s+(?:\d{1,3}|oo|o\s*o\s*o)\s*(?:[.．…·]+)?$/i, '').trim();
	}

	return t;
}

export function parseTranslations(
	raw: string,
	knownIds: Set<string>,
	regions?: RegionSource[],
): Map<string, string> | null {
	const sanitized = stripThinkingTags(raw);
	const cleaned = sanitized.replace(/```(?:json)?/gi, '').trim();
	const out = new Map<string, string>();
	const rawMap = new Map<string, string>();

	try {
		const firstBrace = cleaned.indexOf('{');
		const lastBrace = cleaned.lastIndexOf('}');
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
			const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				const transObj =
					parsed.translations &&
					typeof parsed.translations === 'object' &&
					!Array.isArray(parsed.translations)
						? (parsed.translations as Record<string, unknown>)
						: parsed;

				for (const [k, val] of Object.entries(transObj)) {
					if (k === 'newTerms' || k === 'terms' || k === 'translations') continue;
					if (typeof val === 'string') {
						const trimmed = val.trim();
						if (trimmed) rawMap.set(k, trimmed);
					} else if (
						val &&
						typeof val === 'object' &&
						'text' in val &&
						typeof (val as { text: unknown }).text === 'string'
					) {
						const trimmed = (val as { text: string }).text.trim();
						if (trimmed) rawMap.set(k, trimmed);
					}
				}
			}
		}
	} catch {
		// FALL THROUGH TO REGEX SALVAGE
	}

	if (rawMap.size === 0) {
		const unbraced = cleaned.replace(/^\{/, '').replace(/\}$/, '');
		for (const m of unbraced.matchAll(/"([A-Za-z0-9_-]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
			const k = m[1];
			if (
				k === 'newTerms' ||
				k === 'terms' ||
				k === 'translations' ||
				k === 'source' ||
				k === 'target' ||
				k === 'category' ||
				k === 'gender' ||
				k === 'context' ||
				k === 'aliases'
			) {
				continue;
			}
			const text = m[2]
				.replace(/\\n/g, '\n')
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, '\\')
				.trim();
			if (text) rawMap.set(k, text);
		}
	}

	if (rawMap.size === 0) return null;

	for (const [k, text] of rawMap) {
		if (knownIds.has(k)) {
			out.set(k, text);
		}
	}

	if (regions && regions.length > 0) {
		for (const [k, text] of rawMap) {
			if (knownIds.has(k)) continue;

			const matchedRegion = regions.find((r) => r.text.trim() === k.trim() && !out.has(r.id));
			if (matchedRegion) {
				out.set(matchedRegion.id, text);
				continue;
			}

			const idxMatch = k.match(/^(?:r|region|seq|item)?_?(\d+)$/i);
			if (idxMatch) {
				const num = parseInt(idxMatch[1], 10);
				if (num >= 0 && num < regions.length) {
					const targetReg = regions[num];
					if (!out.has(targetReg.id) && !/^r\d+$/i.test(targetReg.id)) {
						out.set(targetReg.id, text);
						continue;
					}
				}
				if (num >= 1 && num <= regions.length) {
					const targetReg = regions[num - 1];
					if (!out.has(targetReg.id) && !/^r\d+$/i.test(targetReg.id)) {
						out.set(targetReg.id, text);
						continue;
					}
				}
			}
		}

		// SANITIZE ARTIFACTS USING SOURCE REGION METADATA
		const regMap = new Map(regions.map((r) => [r.id, r.text]));
		for (const [id, text] of out) {
			const srcText = regMap.get(id);
			if (srcText) {
				out.set(id, sanitizeTranslationArtifacts(text, srcText));
			}
		}
	}

	return out.size > 0 ? out : null;
}

export function looksDegenerate(translated: string, source: string): boolean {
	if (!translated || !source) return true;
	const cleanSource = source.trim();
	const cleanTarget = translated.trim();
	if (!cleanTarget) return true;

	const maxAllowedLength = Math.max(120, cleanSource.length * 10);
	if (cleanTarget.length > maxAllowedLength) return true;

	if (!/^[.．…·\s]+$/.test(cleanSource) && /^[.．…·\s]+$/.test(cleanTarget)) {
		return true;
	}
	return false;
}
