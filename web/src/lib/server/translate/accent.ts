// ACCENT LABELS FROM THE GLOSSARY (FEAT-010 ADR-007): A FREE-FLOATING REGION WHOSE WHOLE TEXT IS A technique TERM
// IS ACCENT TEXT EVEN WHEN THE MODEL DID NOT SAY SO. THE CROSS-CHECK ONLY ADDS LABELS, NEVER REMOVES THEM.
// IMPORTED TYPES
import type { RegionRole, RegionRoleSource, TermDraft } from '$lib/types';
import type { RegionSource } from './prompts';

// -- CONSTANTS -- //

// SPACES, PUNCTUATION AND SYMBOLS (BRACKETS, 【】, 「」, DOTS) DO NOT DECIDE WHETHER TWO TEXTS NAME THE SAME TECHNIQUE
const IGNORED_CHARS = /[\s\p{P}\p{S}]/gu;

// -- FUNCTIONS -- //

/** TEXT REDUCED TO ITS LETTERS AND DIGITS, LOWERCASED, FOR TERM MATCHING. */
export function normalizeAccentText(text: string): string {
	return text.normalize('NFKC').replace(IGNORED_CHARS, '').toLowerCase();
}

/**
 * RETURNS THE LABELS TO STORE: EVERY MODEL LABEL (SOURCE 'llm') PLUS EVERY NON-BUBBLE REGION WHOSE NORMALISED TEXT
 * EQUALS A technique TERM'S SOURCE OR ALIAS (SOURCE 'glossary'). `modelStyles` IS NOT MODIFIED, SO THE CACHE KEEPS
 * ONLY WHAT THE MODEL SAID (REVIEW M-L4).
 */
export function applyGlossaryAccentLabels(
	sources: RegionSource[],
	terms: TermDraft[],
	modelStyles: Map<string, RegionRole>,
): Map<string, { role: RegionRole; source: RegionRoleSource }> {
	const out = new Map<string, { role: RegionRole; source: RegionRoleSource }>();
	for (const [id, role] of modelStyles) {
		if (role === 'accent') out.set(id, { role: 'accent', source: 'llm' });
	}

	const techniqueKeys = new Set<string>();
	for (const term of terms) {
		if (term.category !== 'technique') continue;
		for (const text of [term.source, ...(term.aliases ?? [])]) {
			const key = text ? normalizeAccentText(text) : '';
			if (key) techniqueKeys.add(key);
		}
	}
	if (techniqueKeys.size === 0) return out;

	for (const region of sources) {
		if (out.has(region.id) || region.kind === 'dialogue_bubble' || !region.kind) continue;
		const key = normalizeAccentText(region.text);
		if (key && techniqueKeys.has(key)) out.set(region.id, { role: 'accent', source: 'glossary' });
	}
	return out;
}
