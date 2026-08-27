// TRANSLATION ENGINE FOR COMIC PAGES AND SINGLE STRINGS
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
import type OpenAI from 'openai';
import { languageName } from '$lib/languages';
import { computeUsage, createClient, queued, resolveModel, stripThinkingTags, thinkingParam, withRetry } from './llm';

// SUBMODULE RE-EXPORTS FOR BACKWARD COMPATIBILITY
export * from './translate/prompts';
export * from './translate/sfx';
export * from './translate/parser';
export * from './translate/extraction';
export * from './translate/dialogue-tracker';
export * from './translate/filter';

import { buildMessages, type RegionSource } from './translate/prompts';
import { getKnownSfxTranslation } from './translate/sfx';
import { looksDegenerate, parseTranslations } from './translate/parser';
import { parseExtractedTerms } from './translate/extraction';
import { classifyRegionForTranslation } from './translate/filter';
import type { DialogueContextWindow } from './translate/dialogue-tracker';

export interface PageTranslationOptions {
	client?: OpenAI;
	model?: string;
	signal?: AbortSignal;
	dialogueContext?: DialogueContextWindow | null;
	enableSfx?: boolean;
}

export interface PageTranslation {
	byRegion: Map<string, string>;
	usage: TranslationUsage;
	newTerms?: TermDraft[];
	rawPrompt?: string;
	rawResponse?: string;
	durationMs?: number;
}

export const PROMPT_VERSION = 'v21';

function mergeUsage(acc: TranslationUsage, u: TranslationUsage): void {
	acc.promptTokens += u.promptTokens;
	acc.cachedTokens += u.cachedTokens;
	acc.completionTokens += u.completionTokens;
}

async function callTranslate(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	opts: PageTranslationOptions,
): Promise<{ raw: string; usage: TranslationUsage; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> {
	const client = opts.client ?? createClient();
	const model = resolveModel(opts.model);
	const messages = buildMessages(regions, terms, pair, opts.dialogueContext, opts.enableSfx ?? true);

	const sourceChars = regions.reduce((n, r) => n + r.text.length, 0);
	const maxTokens = Math.max(1024, Math.ceil(sourceChars * 4 + 1024));
	const resp = await queued(() =>
		withRetry(async () => {
			const r = await client.chat.completions.create(
				{
					model,
					messages,
					temperature: 0.2,
					max_tokens: maxTokens,
					...thinkingParam(model),
				},
				{ signal: opts.signal },
			);
			return r;
		}),
	);
	const raw = resp.choices[0]?.message?.content ?? '';
	const usage = computeUsage(resp.usage, model);
	return { raw, usage, messages };
}

export async function translatePage(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	opts: PageTranslationOptions = {},
): Promise<PageTranslation> {
	const model = resolveModel(opts.model);
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } as TranslationUsage;

	if (regions.length === 0) return { byRegion: new Map(), usage, newTerms: [], rawPrompt: '', rawResponse: '', durationMs: 0 };

	// 1. PRE-TRANSLATION CLASSIFICATION: PARTITION REGIONS INTO TRANSLATABLE VS RESOLVED/SKIPPED
	const translatableRegions: RegionSource[] = [];
	const preResolved = new Map<string, string>();

	for (const r of regions) {
		const classification = classifyRegionForTranslation(r, pair.sourceLang, pair.targetLang);
		if (classification.disposition === 'translate') {
			translatableRegions.push(r);
		} else {
			preResolved.set(r.id, classification.resolvedTarget ?? '');
		}
	}

	// IF ALL REGIONS WERE PRE-RESOLVED (E.G. NOISE, PUNCTUATION, OR LATIN SFX), RETURN IMMEDIATELY
	if (translatableRegions.length === 0) {
		return {
			byRegion: preResolved,
			usage,
			newTerms: [],
			rawPrompt: '',
			rawResponse: '',
			durationMs: 0,
		};
	}

	const t0 = performance.now();
	const { raw, usage: u1, messages: m1 } = await callTranslate(translatableRegions, terms, pair, opts);
	const durationMs = Math.round(performance.now() - t0);
	mergeUsage(usage, u1);
	const byRegion = parseTranslations(raw, new Set(translatableRegions.map((r) => r.id)), translatableRegions) ?? new Map();

	// MERGE PRE-RESOLVED REGIONS INTO FINAL TRANSLATION MAP
	for (const [id, target] of preResolved) {
		byRegion.set(id, target);
	}

	const pageSourceText = translatableRegions.map((r) => r.text).join('\n');
	const knownSources = new Set<string>();
	for (const t of terms) {
		if (t.source) knownSources.add(t.source.trim().toLowerCase());
		for (const a of t.aliases ?? []) if (a) knownSources.add(a.trim().toLowerCase());
	}
	const seenDiscovered = new Set<string>();
	const discoveredTerms = parseExtractedTerms(raw, pageSourceText).filter((t) => {
		const src = t.source.trim().toLowerCase();
		if (!src || knownSources.has(src) || seenDiscovered.has(src)) return false;
		seenDiscovered.add(src);
		return true;
	});

	// SINGLE-ROUNDTRIP POLICY: NEVER FIRE A SECOND REFILL CALL.
	// APPLY LOCAL SFX DICTIONARY FALLBACK DIRECTLY TO ANY UNTRANSLATED OR DEGENERATE REGIONS.
	for (const r of translatableRegions) {
		const current = byRegion.get(r.id);
		if (!current || looksDegenerate(current, r.text)) {
			const sfxFallback = getKnownSfxTranslation(r.text, pair.sourceLang);
			if (sfxFallback) {
				byRegion.set(r.id, sfxFallback);
			} else if (current && looksDegenerate(current, r.text)) {
				byRegion.delete(r.id);
			}
		}
	}

	return {
		byRegion,
		usage,
		newTerms: discoveredTerms,
		rawPrompt: JSON.stringify(m1, null, 2),
		rawResponse: raw,
		durationMs,
	};
}

export async function translateSingleText(
	text: string,
	pair: LangPair,
	opts: {
		kind?: 'title' | 'chapter' | 'term' | 'general';
		instruction?: string;
		client?: OpenAI;
		model?: string;
		signal?: AbortSignal;
	} = {},
): Promise<{ text: string; usage: TranslationUsage }> {
	const trimmed = text.trim();
	const model = resolveModel(opts.model);
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } as TranslationUsage;

	if (!trimmed) {
		return { text: '', usage };
	}

	const client = opts.client ?? createClient();
	const srcName = languageName(pair.sourceLang);
	const tgtName = languageName(pair.targetLang);

	let systemContent = '';
	if (opts.kind === 'chapter') {
		systemContent = `You are a professional comic and novel localizer. Translate the provided chapter title from ${srcName} to ${tgtName} (${pair.targetLang}).
Rules:
- Translate concisely and naturally into ${tgtName}.
- Localize the word for "Chapter" and numbering format naturally into ${tgtName} (e.g. for English: "Chapter 1: ...", for Hindi: "अध्याय 1: ...", for Korean: "제1화: ...", for Japanese: "第1話: ...", for Russian: "Глава 1: ...", for Spanish: "Capítulo 1: ...", for French: "Chapitre 1: ...", for Indonesian: "Bab 1: ...").
- Do NOT keep the English word "Chapter" unless the target language is English.
- Do NOT output commentary, quotes, explanations, or markdown fences. Output ONLY the translated chapter title string in ${tgtName}.`;
	} else if (opts.kind === 'title') {
		systemContent = `You are a professional comic and novel localizer. Translate the provided book title from ${srcName} to ${tgtName}.
Rules:
- Translate concisely into natural title case (e.g. "妖神记" -> "Tales of Demons and Gods", "斗破苍穹" -> "Battle Through the Heavens").
- Do NOT output commentary, explanations, notes, quotes, or markdown fences. Output ONLY the translated title string.`;
	} else if (opts.kind === 'term') {
		systemContent = `You are a professional localization translator. Translate the provided term, character name, technique, or proper noun from ${srcName} to natural ${tgtName}.
Rules:
- For personal names, use capitalized romanization / Pinyin with proper spacing (e.g. 叶凡 -> Ye Fan, 陈北玄 -> Chen Beixuan). Always fuse 2-character standalone given names into a single word (e.g. 北玄 -> Beixuan, NEVER "Bei Xuan").
- For terms / items / techniques, translate the meaning into natural ${tgtName}.
- Output ONLY the translated term without quotes or explanation.`;
	} else {
		systemContent = `You are a professional comic and manhua translator translating dialogue/speech bubbles from ${srcName} to natural ${tgtName}.
Rules:
- Preserve speech nuance, comic tone, exclamations, sound effects, and character voice.
- Output ONLY the translated text without commentary, quotes, or markdown fences.`;
	}

	if (opts.instruction?.trim()) {
		systemContent += `\nSpecial user localization instruction: ${opts.instruction.trim()}`;
	}

	try {
		const res = await queued(async () =>
			withRetry(
				() =>
					client.chat.completions.create(
						{
							model,
							messages: [
								{ role: 'system', content: systemContent },
								{ role: 'user', content: trimmed },
							],
							temperature: opts.instruction?.trim() ? 0.4 : 0.2,
							...thinkingParam(model),
						},
						{ signal: opts.signal },
					),
				3,
			),
		);

		const u = computeUsage(res.usage, model);
		mergeUsage(usage, u);

		let out = stripThinkingTags(res.choices[0]?.message?.content?.trim() || '').trim();
		if (
			(out.startsWith('"') && out.endsWith('"')) ||
			(out.startsWith('“') && out.endsWith('”')) ||
			(out.startsWith('\'') && out.endsWith('\'')) ||
			(out.startsWith('「') && out.endsWith('」')) ||
			(out.startsWith('«') && out.endsWith('»'))
		) {
			out = out.slice(1, -1).trim();
		}
		return { text: out || trimmed, usage };
	} catch (err) {
		if (opts.kind === 'chapter') {
			const match = trimmed.match(/^第?\s*(\d+)\s*(?:话|章|回|集)?(?:\s*[:：\-—]\s*(.*))?$/);
			if (match) {
				const num = match[1];
				const rest = match[2]?.trim();
				return { text: rest ? `Chapter ${num}: ${rest}` : `Chapter ${num}`, usage };
			}
		}
		throw err;
	}
}
