// AI TERM EXTRACTION AND PARSING
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
import type OpenAI from 'openai';
import { languageName } from '$lib/languages';
import { computeUsage, createClient, queued, resolveModel, stripThinkingTags, thinkingParam, withRetry } from '../llm';
import { chunkForExtraction } from '../glossary';

export const MAX_CONTEXT_TERMS = 100;

export interface ExtractionOptions {
	client?: OpenAI;
	model?: string;
	signal?: AbortSignal;
	knownTerms?: TermDraft[];
}

export function extractionSystemPrompt(src: string, tgt: string): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	return `You build a translation glossary from a ${srcLabel} comic/manga/manhua chapter so that names, titles, and techniques stay 100% consistent across all pages in ${tgtLabel}.

Target Language Requirement:
- All "target" fields and "context" descriptions MUST be strictly in ${tgtName} (${tgt}). Do NOT output in English unless ${tgtName} is explicitly English.

Output Schema:
Return ONLY a valid JSON object matching this structure (no markdown fences, no commentary):
{
  "terms": [
    {
      "source": "<exact ${srcName} characters verbatim from text>",
      "target": "<natural ${tgtName} translation>",
      "category": "character" | "location" | "organization" | "technique" | "item" | "realm" | "creature" | "title" | "concept" | "other",
      "gender": "masculine" | "feminine" | "neuter",
      "aliases": ["<nickname or short form>"],
      "pinned": false,
      "context": "<brief 1-sentence description in ${tgtName}>"
    }
  ]
}

Rules:
1. "source": MUST be copied EXACTLY as it appears in the text (identical characters, no added or removed spaces) so exact string match will find it on every page.
2. "target":
   - Personal character names: Transliterate/localize into ${tgtName} standard conventions (e.g. for English: Pinyin with Title Case like "Ye Fan"; for Korean: Hangul transliteration like "엽범/예판" or "구비"; for Russian: Cyrillic like "Е Фань").
   - Place names: Localize into natural ${tgtName} (e.g. 雲霄村 -> Yunxiao Village in English, 운소촌 in Korean).
   - Descriptive terms (classes, professions, skills, techniques, martial arts, cultivation realms, weapons, items, artifacts): Translate by MEANING into natural ${tgtName} (e.g. 法师 -> Mage in English, 마법사 in Korean; 格斗家 -> Fighter in English, 격투가 in Korean; 属性 -> Attributes in English, 속성/스탯 in Korean; 功夫 -> Kung Fu in English, 무공/쿵푸 in Korean).
3. "category": 'character', 'location', 'organization', 'technique', 'item', 'realm', 'creature', 'title', 'concept', 'other'.
4. "gender": 'masculine' or 'feminine' ONLY when the text explicitly indicates it (pronouns, titles like master/sister/brother/prince); otherwise 'neuter'.
5. "aliases": List any nicknames, short forms, or alternative address forms in the text (e.g. for 叶凡: ["小凡"]). If none, use [].
6. "context": Brief description in ${tgtName} stating who or what the entity is (e.g. "Protagonist of the series", "Sect-protecting grand array").
7. Term selection - High-Recall Directive: Be thorough and extract as many valid story terms, character names, and techniques as possible. Err on the side of extracting rather than omitting; consistency of recurring terminology is critical.
   - Strict Anti-Duplicate Rule: If a term or any of its aliases is already listed in the established terms / glossary, do NOT extract it again. Extract ONLY unlisted, new terms.
   - SKIP ONLY truly generic function words (pronouns, numbers, everyday verbs). Extract all story-significant terminology:
     * CLASS / PROFESSION / FACTION NOUNS (e.g. 妖灵师, 武者, 法师, 格斗家, 剑修) - extract with "pinned": true.
     * CULTIVATION RANK TIERS (e.g. 青铜/白银/黄金/黑金/传奇, 炼气/筑基/金丹) and realm names - extract each tier with "pinned": true.
     * ORGANIZATIONS / SECTS / SCHOOLS / FAMILIES (e.g. 神圣世家, 圣兰学院, 青云宗, 天机阁) - extract with "pinned": true.
     * RECURRING ITEMS / TECHNIQUES / CREATURES that drive the plot or appear on multiple pages - extract with "pinned": true.
     * A term that appears MORE THAN ONCE in the passage is by definition NOT generic - extract it and set "pinned": true.
8. Multi-name listings: In dialogue or narration where multiple character names are listed back-to-back (e.g. 子龙童菲, 张肥关鱼), extract each individual 2-3 character name separately (e.g. 子龙, 童菲, 张肥, 关鱼).`;
}

export function parseTermObjects(text: string): unknown[] {
	const sanitized = stripThinkingTags(text);
	const tryParse = (s: string): unknown => {
		try {
			return JSON.parse(s);
		} catch {
			return undefined;
		}
	};
	const cleaned = sanitized.replace(/```(?:json)?/gi, '').trim();
	const whole = tryParse(cleaned);
	if (Array.isArray(whole)) return whole;
	const terms = (whole as { terms?: unknown })?.terms ?? (whole as { newTerms?: unknown })?.newTerms;
	if (Array.isArray(terms)) return terms;

	const objs: unknown[] = [];
	const re = /\{[^{}]*\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(cleaned))) {
		const o = tryParse(m[0]);
		if (o) objs.push(o);
	}
	return objs;
}

export function parseExtractedTerms(raw: string, contentSource?: string): TermDraft[] {
	const validCategories = new Set([
		'character',
		'location',
		'organization',
		'technique',
		'item',
		'realm',
		'creature',
		'title',
		'concept',
		'other',
	]);
	const validGenders = new Set(['neuter', 'masculine', 'feminine']);
	const rawObjects = parseTermObjects(raw);
	const results: TermDraft[] = [];
	const seen = new Set<string>();

	for (const item of rawObjects) {
		const t = item as {
			source?: unknown;
			target?: unknown;
			gender?: unknown;
			context?: unknown;
			category?: unknown;
			aliases?: unknown;
			pinned?: unknown;
		};
		const sourceTerm = String(t?.source ?? '').trim();
		const target = String(t?.target ?? '').trim();
		if (!sourceTerm || !target) continue;

		if (contentSource && !contentSource.includes(sourceTerm)) continue;

		if (seen.has(sourceTerm)) continue;
		seen.add(sourceTerm);

		// NORMALIZE CATEGORY AND GENDER (CASE-INSENSITIVE)
		const catLower = String(t?.category ?? '').trim().toLowerCase();
		const category = validCategories.has(catLower)
			? (catLower as TermDraft['category'])
			: 'other';

		const genLower = String(t?.gender ?? '').trim().toLowerCase();
		const gender =
			category && category !== 'character'
				? 'neuter'
				: validGenders.has(genLower)
					? (genLower as TermDraft['gender'])
					: 'neuter';

		// EXTRACT CONTEXT / DESCRIPTION WITH MULTI-KEY SYNONYM SALVAGE
		const rawContext =
			t?.context ??
			(t as Record<string, unknown>)?.description ??
			(t as Record<string, unknown>)?.desc ??
			(t as Record<string, unknown>)?.definition ??
			(t as Record<string, unknown>)?.summary ??
			(t as Record<string, unknown>)?.info ??
			(t as Record<string, unknown>)?.explanation;
		const context = typeof rawContext === 'string' && rawContext.trim() ? rawContext.trim() : null;

		// DETERMINISTIC RECURRENCE PIN: A MULTI-CHARACTER TERM THAT APPEARS >=2x IN THE CHAPTER TEXT IS
		// STORY-LEVEL TERMINOLOGY AND MUST BE LOCKED ACROSS PAGES EVEN IF THE MODEL FORGOT "pinned": true.
		const occurrences = contentSource && sourceTerm.length >= 2 ? contentSource.split(sourceTerm).length - 1 : 0;
		const pinned = t?.pinned === true || occurrences >= 2;

		// EXTRACT ALIASES (SUPPORTING ARRAYS, COMMA-SEPARATED STRINGS, AND SYNONYM KEYS)
		const rawAliases =
			t?.aliases ??
			(t as Record<string, unknown>)?.alias ??
			(t as Record<string, unknown>)?.aka ??
			(t as Record<string, unknown>)?.nicknames ??
			(t as Record<string, unknown>)?.nickname;

		let aliasList: string[] = [];
		if (Array.isArray(rawAliases)) {
			aliasList = rawAliases.map((a) => String(a ?? '').trim()).filter(Boolean);
		} else if (typeof rawAliases === 'string' && rawAliases.trim()) {
			aliasList = rawAliases
				.split(/[,，/|、]/)
				.map((a) => a.trim())
				.filter(Boolean);
		}

		const aliases = [
			...new Set(aliasList.filter((a) => a && a !== sourceTerm && a.length <= 64)),
		].slice(0, 8);

		if (category === 'character' && sourceTerm.length === 3) {
			const givenName = sourceTerm.slice(1);
			if (!aliases.includes(givenName)) {
				aliases.push(givenName);
			}
		}

		results.push({
			source: sourceTerm,
			target,
			category,
			gender,
			context,
			pinned,
			aliases: aliases.length ? aliases : null,
			status: 'ai' as const,
		});
	}

	return results;
}

export async function extractTerms(
	content: string,
	pair: LangPair,
	opts: ExtractionOptions = {},
): Promise<{ terms: TermDraft[]; usage: TranslationUsage }> {
	const client = opts.client ?? createClient();
	const model = resolveModel(opts.model);
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } as TranslationUsage;

	if (!content.trim()) return { terms: [], usage };

	const chunks = chunkForExtraction(content);
	const bySource = new Map<string, TermDraft>();

	for (let i = 0; i < chunks.length; i++) {
		if (opts.signal?.aborted) throw Object.assign(new Error('Extraction aborted'), { name: 'AbortError' });
		const chunk = chunks[i];

		const established = new Map<string, TermDraft>();
		for (const t of bySource.values()) established.set(t.source, t);
		for (const t of opts.knownTerms ?? []) established.set(t.source, t);

		const all = [...established.values()].filter((t) => t.source);
		const inChunk = (t: TermDraft) => chunk.includes(t.source);
		const cmpSource = (a: TermDraft, b: TermDraft) => a.source.localeCompare(b.source);
		const ctx =
			all.length <= MAX_CONTEXT_TERMS
				? [...all.filter((t) => t.pinned).sort(cmpSource), ...all.filter((t) => !t.pinned).sort(cmpSource)]
				: [
						...all.filter((t) => t.pinned),
						...all.filter((t) => !t.pinned && inChunk(t)),
						...all.filter((t) => !t.pinned && !inChunk(t)),
					].slice(0, MAX_CONTEXT_TERMS);

		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: 'system', content: extractionSystemPrompt(pair.sourceLang, pair.targetLang) },
		];

		if (ctx.length > 0) {
			messages.push({
				role: 'system',
				content:
					`ESTABLISHED GLOSSARY (already known - do NOT extract these again, reuse each EXACT ${pair.targetLang} rendering everywhere and never contradict one):\n` +
					ctx.map((t) => `${t.source} = ${t.target}`).join('\n'),
			});
		}

		messages.push({ role: 'user', content: `Extract terms from the following chapter text passage:\n\n${chunk}` });

		try {
			const resp = await queued(() =>
				withRetry(async () => {
					return await client.chat.completions.create(
						{
							model,
							messages,
							temperature: 0,
							max_tokens: 4096,
							...thinkingParam(model),
						},
						{ signal: opts.signal },
					);
				}),
			);

			const raw = resp.choices[0]?.message?.content ?? '';
			const u = computeUsage(resp.usage, model);
			usage.promptTokens += u.promptTokens;
			usage.cachedTokens += u.cachedTokens;
			usage.completionTokens += u.completionTokens;

			const extracted = parseExtractedTerms(raw, content);
			for (const term of extracted) {
				if (!bySource.has(term.source)) {
					bySource.set(term.source, term);
				}
			}
		} catch (err) {
			if (opts.signal?.aborted) throw err;
		}
	}

	return { terms: [...bySource.values()], usage };
}
