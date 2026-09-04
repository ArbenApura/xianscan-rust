// PAGE TRANSLATION CACHE (ADAPTED FROM xianslate's cache.ts)
// CACHE KEY BINDS REGION IDS AND TEXT, GLOSSARY FINGERPRINT, MODEL, PROMPT VERSION, AND PROVIDER SALT.
// ANY MODIFICATION TO CONTENT OR GLOSSARY INVALIDATES THE CACHED ENTRY.
//
// glossaryFingerprint EXCLUDES category, status, AND firstChapterId.
// PROMPT-RELEVANT FIELDS ARE source, target, gender, context, pinned, AND aliases ONLY.

// IMPORTED TYPES
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
// IMPORTED DEP-MODULES
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
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
	customPrompt = '',
): string {
	const content = JSON.stringify(regions.map((r) => `${r.id}:${r.text}`).join('\u0001'));
	const fp = glossaryFingerprint(terms);
	const raw = [content, fp, model, PROMPT_VERSION, pair.sourceLang, pair.targetLang, providerSalt, customPrompt].join('|');
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

export function getCachedPageTranslation(pageId: number, cacheKey: string): CachedPageTranslation | null {
	try {
		const row = db
			.select()
			.from(translations)
			.where(and(eq(translations.pageId, pageId), eq(translations.cacheKey, cacheKey)))
			.get();
		if (!row) return null;
		const byRegion = parseContent(row.contentTarget);
		if (byRegion.size === 0) return null;
		return {
			byRegion,
			usage: {
				model: row.model,
				promptTokens: row.promptTokens ?? 0,
				cachedTokens: row.cachedTokens ?? 0,
				completionTokens: row.completionTokens ?? 0,
			},
		};
	} catch {
		return null;
	}
}

export function savePageTranslation(
	pageId: number,
	cacheKey: string,
	byRegion: Map<string, string>,
	model: string,
	usage: TranslationUsage,
): void {
	if (!byRegion || byRegion.size === 0) return;
	try {
		const contentTarget = JSON.stringify(Object.fromEntries(byRegion));
		db.insert(translations)
			.values({
				pageId,
				cacheKey,
				contentTarget,
				model,
				promptTokens: usage.promptTokens ?? 0,
				cachedTokens: usage.cachedTokens ?? 0,
				completionTokens: usage.completionTokens ?? 0,
				createdAt: Date.now(),
			})
			.onConflictDoUpdate({
				target: [translations.pageId, translations.cacheKey],
				set: {
					contentTarget,
					model,
					promptTokens: usage.promptTokens ?? 0,
					cachedTokens: usage.cachedTokens ?? 0,
					completionTokens: usage.completionTokens ?? 0,
				},
			})
			.run();
	} catch {
		// SILENT FALLBACK IF SQLITE WRITE FAILS
	}
}
