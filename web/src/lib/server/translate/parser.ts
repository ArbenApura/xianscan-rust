// TRANSLATION SALVAGE PARSER AND HEURISTICS
import { stripThinkingTags } from '../llm';
import type { RegionSource } from './prompts';

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
