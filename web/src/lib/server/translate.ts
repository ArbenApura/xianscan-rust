// TRANSLATION ENGINE FOR COMIC PAGES AND SINGLE STRINGS
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
import type { ReasoningEffortOption } from '$lib/stores/settings';
import type OpenAI from 'openai';
import { languageName } from '$lib/languages';
import { computeUsage, createClient, queued, resolveModel, stripThinkingTags, thinkingParam, withRetry } from './llm';
import { getCanonicalSettings } from './settings-service';

// SUBMODULE RE-EXPORTS FOR BACKWARD COMPATIBILITY
export * from './translate/prompts';
export * from './translate/sfx';
export * from './translate/parser';
export * from './translate/extraction';
export * from './translate/dialogue-tracker';
export * from './translate/filter';
export { resolveModel } from './llm';

import { buildMessages, type RegionSource } from './translate/prompts';
import { getKnownSfxTranslation } from './translate/sfx';
import { looksDegenerate, parseTranslations } from './translate/parser';
import { parseExtractedTerms } from './translate/extraction';
import { classifyRegionForTranslation, sanitizeOcrSourceText } from './translate/filter';
import type { DialogueContextWindow } from './translate/dialogue-tracker';

export interface PageTranslationOptions {
	client?: OpenAI;
	model?: string;
	providerId?: string;
	signal?: AbortSignal;
	dialogueContext?: DialogueContextWindow | null;
	enableSfx?: boolean;
	sfxMode?: 'translate' | 'ignore' | 'source';
	pageTerms?: TermDraft[];
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	reasoningEffort?: ReasoningEffortOption;
	frequencyPenalty?: number;
	presencePenalty?: number;
	customPrompt?: string;
}

export interface PageTranslation {
	byRegion: Map<string, string>;
	usage: TranslationUsage;
	newTerms?: TermDraft[];
	rawPrompt?: string;
	rawResponse?: string;
	durationMs?: number;
	error?: string;
	finishReason?: string;
}

export const PROMPT_VERSION = 'v22';

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
	messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<{ raw: string; usage: TranslationUsage; finishReason?: string }> {
	const client = opts.client ?? createClient();
	const model = resolveModel(opts.model);

	const canonical = getCanonicalSettings();
	const sourceChars = regions.reduce((n, r) => n + r.text.length, 0);
	const userConfigMaxTokens = opts.maxTokens ?? canonical.translationMaxTokens ?? 4096;
	const baseMaxTokens = Math.max(userConfigMaxTokens, Math.ceil(sourceChars * 4 + 2048));
	const temperature = opts.temperature ?? canonical.translationTemperature ?? 0.2;
	const topP = opts.topP ?? canonical.translationTopP ?? 1.0;
	const effort = opts.reasoningEffort ?? canonical.translationReasoningEffort ?? 'none';
	const frequencyPenalty = opts.frequencyPenalty ?? canonical.translationFrequencyPenalty ?? 0.0;
	const presencePenalty = opts.presencePenalty ?? canonical.translationPresencePenalty ?? 0.0;

	let attempt = 0;
	const resp = await queued(() =>
		withRetry(
			async () => {
				const currentAttempt = attempt++;
				// DYNAMIC EXPONENTIAL ESCALATION UPON RETRY TO PREVENT REASONING BUDGET CUTOFFS
				const currentMaxTokens = Math.min(65536, baseMaxTokens * 2 ** currentAttempt);
				let thinkParams = thinkingParam(opts.providerId, model, effort);
				let r;
				try {
					r = await client.chat.completions.create(
						{
							model,
							messages,
							temperature,
							max_tokens: currentMaxTokens,
							top_p: topP,
							...(frequencyPenalty > 0 ? { frequency_penalty: frequencyPenalty } : {}),
							...(presencePenalty > 0 ? { presence_penalty: presencePenalty } : {}),
							...thinkParams,
						},
						{ signal: opts.signal },
					);
				} catch (err: any) {
					if (
						err?.status === 400 &&
						typeof err?.message === 'string' &&
						err.message.includes('reasoning_effort') &&
						thinkParams.reasoning_effort === 'none'
					) {
						thinkParams = { reasoning_effort: 'low' };
						r = await client.chat.completions.create(
							{
								model,
								messages,
								temperature,
								max_tokens: currentMaxTokens,
								top_p: topP,
								...(frequencyPenalty > 0 ? { frequency_penalty: frequencyPenalty } : {}),
								...(presencePenalty > 0 ? { presence_penalty: presencePenalty } : {}),
								...thinkParams,
							},
							{ signal: opts.signal },
						);
					} else {
						throw err;
					}
				}
				const choice = r.choices[0];
				const finishReason = choice?.finish_reason;
				const rawContent = choice?.message?.content ?? '';
				const stripped = stripThinkingTags(rawContent).trim();
				if (!stripped) {
					if (finishReason === 'length') {
						throw new Error('TOKEN_BUDGET_EXHAUSTED');
					}
					throw new Error('EMPTY_LLM_RESPONSE');
				}
				const parsed = parseTranslations(stripped, new Set(regions.map((reg) => reg.id)), regions);
				if (!parsed || parsed.size === 0) {
					if (finishReason === 'length') {
						throw new Error('TOKEN_BUDGET_EXHAUSTED');
					}
					throw new Error('UNPARSEABLE_LLM_OUTPUT');
				}
				return { response: r, finishReason };
			},
			3,
		),
	);
	const raw = resp.response.choices[0]?.message?.content ?? '';
	const usage = computeUsage(resp.response.usage, model);
	return { raw, usage, finishReason: resp.finishReason };
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
			translatableRegions.push({ ...r, text: sanitizeOcrSourceText(r.text) });
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

	// CONSTRUCT PROMPT MESSAGES UPFRONT SO rawPrompt IS ALWAYS PRESERVED EVEN ON FAILURE
	const customPrompt = opts.customPrompt ?? '';
	const messages = buildMessages(
		translatableRegions,
		terms,
		pair,
		opts.dialogueContext,
		opts.pageTerms,
		undefined,
		customPrompt,
	);
	const rawPrompt = JSON.stringify(messages, null, 2);

	const t0 = performance.now();
	let raw = '';
	let u1 = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } as TranslationUsage;
	let finishReason: string | undefined;
	let translationError: string | undefined;

	try {
		const res = await callTranslate(translatableRegions, terms, pair, opts, messages);
		raw = res.raw;
		u1 = res.usage;
		finishReason = res.finishReason;
	} catch (err: any) {
		translationError = err?.message || String(err);
		if (
			err instanceof Error &&
			(err.message === 'EMPTY_LLM_RESPONSE' ||
				err.message === 'TOKEN_BUDGET_EXHAUSTED' ||
				err.message === 'UNPARSEABLE_LLM_OUTPUT')
		) {
			raw = '';
			if (err.message === 'TOKEN_BUDGET_EXHAUSTED') {
				finishReason = 'length';
			}
		} else {
			throw err;
		}
	}
	const durationMs = Math.round(performance.now() - t0);
	mergeUsage(usage, u1);
	const byRegion = (raw ? parseTranslations(raw, new Set(translatableRegions.map((r) => r.id)), translatableRegions) : null) ?? new Map();

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
	for (const t of opts.pageTerms ?? []) {
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
		const sfxFallback = getKnownSfxTranslation(r.text, pair.sourceLang);
		if (!current) {
			if (sfxFallback) {
				byRegion.set(r.id, sfxFallback);
			}
		} else if (sfxFallback && /^[.．…·\s]+$/.test(current) && !/^[.．…·\s]+$/.test(r.text)) {
			// REPLACE DEGENERATE ELLIPSIS ON KNOWN SFX WITH CANONICAL SFX FALLBACK
			byRegion.set(r.id, sfxFallback);
		} else if (looksDegenerate(current, r.text)) {
			byRegion.delete(r.id);
		}
	}

	return {
		byRegion,
		usage,
		newTerms: discoveredTerms,
		rawPrompt,
		rawResponse: raw,
		durationMs,
		error: translationError,
		finishReason,
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
		providerId?: string;
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
				async () => {
					let thinkParams = thinkingParam(opts.providerId, model);
					let r;
					try {
						r = await client.chat.completions.create(
							{
								model,
								messages: [
									{ role: 'system', content: systemContent },
									{ role: 'user', content: trimmed },
								],
								temperature: opts.instruction?.trim() ? 0.4 : 0.2,
								...thinkParams,
							},
							{ signal: opts.signal },
						);
					} catch (err: any) {
						if (
							err?.status === 400 &&
							typeof err?.message === 'string' &&
							err.message.includes('reasoning_effort') &&
							thinkParams.reasoning_effort === 'none'
						) {
							thinkParams = { reasoning_effort: 'low' };
							r = await client.chat.completions.create(
								{
									model,
									messages: [
										{ role: 'system', content: systemContent },
										{ role: 'user', content: trimmed },
									],
									temperature: opts.instruction?.trim() ? 0.4 : 0.2,
									...thinkParams,
								},
								{ signal: opts.signal },
							);
						} else {
							throw err;
						}
					}
					const rawContent = r.choices[0]?.message?.content ?? '';
					const stripped = stripThinkingTags(rawContent).trim();
					if (!stripped) {
						throw new Error('EMPTY_LLM_RESPONSE');
					}
					return r;
				},
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
		if (err instanceof Error && err.message === 'EMPTY_LLM_RESPONSE') {
			return { text: trimmed, usage };
		}
		throw err;
	}
}
