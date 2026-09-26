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
	/** THE MODEL'S ACCENT LABELS (FEAT-010 ADR-006); EMPTY FOR ROWS WRITTEN BEFORE v2. */
	styles: Map<string, 'accent'>;
	usage: TranslationUsage | null;
}

/** READS BOTH SHAPES: v2 {"v":2,"translations":{...},"styles":{...}} AND THE OLDER FLAT {id: text} MAP. */
export function parseContent(contentTarget: string): { byRegion: Map<string, string>; styles: Map<string, 'accent'> } {
	const byRegion = new Map<string, string>();
	const styles = new Map<string, 'accent'>();
	try {
		const obj = JSON.parse(contentTarget) as Record<string, unknown>;
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { byRegion, styles };
		const isV2 = obj.v === 2 && obj.translations && typeof obj.translations === 'object';
		const translations = (isV2 ? obj.translations : obj) as Record<string, unknown>;
		for (const [id, text] of Object.entries(translations)) {
			if (typeof text === 'string') byRegion.set(id, text);
		}
		if (isV2 && obj.styles && typeof obj.styles === 'object' && !Array.isArray(obj.styles)) {
			for (const [id, value] of Object.entries(obj.styles as Record<string, unknown>)) {
				if (value === 'accent' && byRegion.has(id)) styles.set(id, 'accent');
			}
		}
	} catch {
		// UNREADABLE ROW: TREATED AS A CACHE MISS BY THE CALLER
	}
	return { byRegion, styles };
}

export function getCachedPageTranslation(pageId: number, cacheKey: string): CachedPageTranslation | null {
	try {
		const row = db
			.select()
			.from(translations)
			.where(and(eq(translations.pageId, pageId), eq(translations.cacheKey, cacheKey)))
			.get();
		if (!row) return null;
		const { byRegion, styles } = parseContent(row.contentTarget);
		if (byRegion.size === 0) return null;
		return {
			byRegion,
			styles,
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
	styles: Map<string, 'accent'> = new Map(),
): void {
	if (!byRegion || byRegion.size === 0) return;
	try {
		const contentTarget = JSON.stringify({ v: 2, translations: Object.fromEntries(byRegion), styles: Object.fromEntries(styles) });
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
