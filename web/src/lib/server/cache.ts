// PAGE TRANSLATION CACHE — ADAPTED FROM xianslate's cache.ts: THE CACHE KEY BINDS content + glossary
// + model + prompt version, SO ANY OF THOSE CHANGING INVALIDATES THE CACHED TRANSLATION.
//
// glossaryFingerprint EXCLUDES category/status/firstChapterId — THE PROMPT-RELEVANT FIELDS ARE
// source/target/gender/context/pinned/aliases ONLY (SAME EXCLUSION RULE AS xianslate).
import { createHash } from 'node:crypto';
// IMPORTED DEP-MODULES
import { and, eq } from 'drizzle-orm';
// IMPORTED TYPES
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
// IMPORTED MODULES
import { PROMPT_VERSION } from './translate';
import { db } from './db';
import { translations } from './db/schema';

// -- FUNCTIONS -- //

export function glossaryFingerprint(terms: TermDraft[]): string {
	const lines = terms
		.map(
			(t) =>
				`${t.source}=${t.target}#${t.gender}@${t.context ?? ''}!${t.pinned ? 1 : 0}~${(t.aliases ?? []).join('|')}`,
		)
		.sort();
	return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

export function pageCacheKey(
	regions: { id: string; text: string }[],
	terms: TermDraft[],
	model: string,
	pair: LangPair,
	providerSalt = '',
): string {
	const content = JSON.stringify(regions.map((r) => r.text).join('\u0001'));
	const fp = glossaryFingerprint(terms);
	const raw = [content, fp, model, PROMPT_VERSION, pair.sourceLang, pair.targetLang, providerSalt].join('|');
	return createHash('sha256').update(raw).digest('hex');
}

// -- DB ROUND-TRIP (THE translations TABLE) -- //

export interface CachedPageTranslation {
	byRegion: Map<string, string>;
	usage: TranslationUsage | null;
}

function parseContent(contentTarget: string): Map<string, string> {
	try {
		const obj = JSON.parse(contentTarget) as Record<string, string>;
		return new Map(Object.entries(obj));
	} catch {
		return new Map();
	}
}

export function getCachedPageTranslation(_pageId: number, _cacheKey: string): CachedPageTranslation | null {
	return null;
}

export function savePageTranslation(
	_pageId: number,
	_cacheKey: string,
	_byRegion: Map<string, string>,
	_model: string,
	_usage: TranslationUsage,
): void {
	// TRANSLATION CACHING REMOVED AS REQUESTED — ALWAYS CALL TRANSLATION DIRECTLY
}
