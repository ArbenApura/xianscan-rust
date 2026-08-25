// LOCALIZATION PROMPTS AND LANGUAGE PROFILE RULES
// IMPORTED DEP-TYPES
import type OpenAI from 'openai';
// IMPORTED TYPES
import type { LangPair, TermDraft } from '$lib/types';
// IMPORTED MODULES
import { languageName } from '$lib/languages';
import { formatDialogueContextBlock, type DialogueContextWindow } from './dialogue-tracker';

// -- TYPES -- //

export interface RegionSource {
	id: string;
	text: string;
	kind?: string;
	vertical?: boolean;
}

// -- FUNCTIONS -- //

export function getSourceLanguageProfile(src: string, tgtName: string): string {
	const primary = src.split('-')[0].toLowerCase();
	if (primary === 'zh') {
		return `Chinese & Manhua Rules:
- Pro-drop: Chinese conversational dialogue frequently omits subjects. Never default to "I"/"my" unless referring to self. Distinguish passive/intransitive (died/broke) from active actions (killed/destroyed).
- Names & Listings: Separate 2-character names in multi-name sequences (e.g. "子龙童菲，张肥关鱼" -> "Zilong, Tong Fei, Zhang Fei, Guan Yu"). Recognize homophone/parody names (e.g. 张肥 for 张飞) as character names. Translate army unit titles (e.g. 龙字军, 虎字营) into ${tgtName} divisions.
- Wuxia/Cultivation: Localize idioms, exclamations, and martial address (师尊, 掌门, 本座) into punchy ${tgtName}.
- Stat Panels: Only use [brackets] if source explicitly has 【】 brackets. Translate rarity tiers (LEGENDARY, EPIC, RARE, COMMON, MYTHIC) fused with item type. Keep parenthetical qualifiers on their own line with ().`;
	}

	if (primary === 'ru' || primary === 'uk' || primary === 'be') {
		return `Cyrillic Comic Rules:
- Cyrillic Sound Effects: Render action sounds into punchy ALL-CAPS ${tgtName} onomatopoeia (хрусть -> CRUNCH, бабах -> BOOM).
- Font & Leetspeak Recovery: Reconstruct stylized/cursive OCR confusions ('4'/'ч' ↔ 'х', '6' ↔ 'б', '0' ↔ 'о', '3' ↔ 'з', 'P' ↔ 'р', 'C' ↔ 'с', 'T' ↔ 'т', 'b' ↔ 'ь', e.g. "(4PyCTb" -> "хрусть").
- Conversational Flow: Translate Russian diminutives and conversational particles (давай, ну-ка, же) naturally into ${tgtName}.`;
	}

	if (primary === 'ja') {
		return `Japanese Manga Rules:
- Pro-drop: Japanese dialogue omits subjects. Never insert "I"/"me" into impersonal observations. Strictly distinguish intransitive/passive verbs from transitive/causative actions (落ちる/落とす, 消える/消す, 死ぬ/杀す).
- Manga SFX: Render sound effects (Gitaigo/Giseigo like ドキドキ, ドン, パチパチ) into punchy ALL-CAPS ${tgtName}.
- Honorifics: Preserve or adapt honorifics (-san, -kun, -chan, -sama, senpai, sensei) according to speaker personality and relationship.`;
	}

	if (primary === 'ko') {
		return `Korean Manhwa Rules:
- Pro-drop: Korean omits subjects. Never default to "I"/"my". Strictly distinguish intransitive states from active actions (죽다 "to die/perish" vs 죽이다 "to kill" -> "많이 죽긴 했어" = "Too many died", not "I killed many").
- Livestream & Gamer Handles: Translate bracketed spectator/player usernames into ${tgtName} (e.g. [형 궁서체다] -> [Dead Serious Bro]). Never leave raw Hangul inside brackets.
- Manhwa SFX: Render action onomatopoeia (쿵/쾅, 슥, 씨익) into punchy ALL-CAPS ${tgtName}.
- Honorifics: Adapt address terms (Hyung, Oppa, Noona, Sunbae, Nim) matching character relationships.`;
	}

	if (primary === 'fr' || primary === 'es' || primary === 'de' || primary === 'it' || primary === 'pt') {
		return `Western Comic (BD) Rules:
- Comic SFX: Localize sound effects (Vlan, Bim, Boum, Crac, Toc) into standard punchy ALL-CAPS ${tgtName}.
- Accents: Recover dropped or substituted OCR accents (é, è, à, ç, ñ, ü) from context.`;
	}

	if (primary === 'id' || primary === 'ms') {
		return `Indonesian & Malay Webtoon Rules:
- Slang & Particles: Translate dialogue particles (dong, kok, sih, lho, deh, kan, ya, nih) smoothly into natural spoken ${tgtName}. Translate fantasy titles (Gadis Suci, Pendekar, Raja Iblis) cleanly.
- Webtoon SFX: Render action words into punchy ALL-CAPS ${tgtName}.`;
	}

	if (primary === 'th') {
		return `Thai Webtoon Rules:
- Kinship & Titles: Adapt regional forms of address and pronouns into natural spoken ${tgtName}.
- Thai SFX: Convert onomatopoeia and action words into punchy ALL-CAPS ${tgtName}.`;
	}

	return '';
}

export function systemPrompt(src: string, tgt: string): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	const langProfile = getSourceLanguageProfile(src, tgtName);

	return `You are a professional comic and manga localizer translating ${srcLabel} dialogue into natural, fluent, and immersive ${tgtLabel}.

Core Rules & Invariants:
1. Target Language & Zero Leakage: ALL translations MUST be strictly in ${tgtName} (${tgt}). Never leave raw source characters (Hanzi/Hangul/Kanji/Cyrillic) in the output.
2. Strict 1:1 Region Mapping: Every input region ID must have exactly one corresponding translation in the output JSON. You must translate ALL input IDs: no more, no less. Never merge regions, split regions, or omit any region ID.
3. Dialogue Style & Casing: Write natural spoken ${tgtName} dialogue suitable for comic voice acting. Keep lines punchy to fit bubble space. Dialogue and thoughts MUST use natural standard sentence case (never ALL-CAPS).
4. Sound Effects (sfx): Render comic sound effects as concise, punchy ALL-CAPS ${tgtName} onomatopoeia (e.g. BOOM, SLASH). If a source sound effect is already in standard Latin letters and self-explanatory in ${tgtName}, return "" for its id to preserve original artist artwork.
5. Pro-Drop & Subject Resolution: In pro-drop languages, infer omitted subjects naturally from page/scene context—NEVER default to inserting "I"/"my" unless explicitly referring to self. Distinguish passive/intransitive states from active transitive actions.
6. OCR Artifact & Bubble-Tail Cleaning: Strip trailing bubble-tail digits, zero-clusters, or dots caused by circular thought-bubble tails (e.g. "! 20...", "oo"). Strip stray unmatched leading/trailing border parentheses (e.g. isolated "(" at line start).
7. Watermark Excision: Return "" for regions that are strictly third-party aggregator watermarks, scanlation recruitment ads, or pirate URLs. If watermarks overlap dialogue, excise the watermark characters and translate only the underlying dialogue.
8. Punctuation & Handles: Translate reaction punctuation (……, ？！, !) to natural ${tgtName} (..., ?!, !). Translate all bracketed usernames [Username]: into ${tgtName}.
9. Line Breaks: Preserve all \\n line breaks from source text to maintain comic panel layout.
10. Output: Reply with ONLY a valid JSON object matching the requested schema. No commentary, no markdown fences.${langProfile ? `\n\n${langProfile}` : ''}`;
}

export function glossaryBlock(terms: TermDraft[], src: string, tgt: string): string | null {
	if (terms.length === 0) return null;
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const lines = terms.map((t) => {
		const aliases = t.aliases && t.aliases.length > 0 ? ` (also: ${t.aliases.join(', ')})` : '';
		const gender = t.gender === 'masculine' ? ' [masculine]' : t.gender === 'feminine' ? ' [feminine]' : '';
		const context = t.context ? ` — ${t.context}` : '';
		return `★${t.source}${aliases} = ${t.target}${gender}${context}`;
	});
	return `Glossary (${srcName} → ${tgtName}) — use these exact renderings for the listed terms:
${lines.join('\n')}`;
}

export function regionPayload(regions: RegionSource[]): string {
	return JSON.stringify(
		regions.map((r) => {
			const item: Record<string, unknown> = { id: r.id, text: r.text };
			if (r.kind && r.kind !== 'dialogue_bubble') {
				item.kind = r.kind;
			}
			if (r.vertical) {
				item.vertical = true;
			}
			return item;
		}),
		null,
		1,
	);
}

export function userPrompt(
	regions: RegionSource[],
	tgtLang = 'en',
	dialogueContextBlock?: string,
): string {
	const tgtName = languageName(tgtLang);
	const count = regions.length;
	const idList = regions.map((r) => `"${r.id}"`).join(', ');
	const skeletonTranslations: Record<string, string> = {};
	for (const r of regions) {
		skeletonTranslations[r.id] = `[${tgtName} translation of ${r.id}]`;
	}

	const templateObj = {
		translations: skeletonTranslations,
		newTerms: [
			{
				source: '<exact source characters from page>',
				target: `<natural ${tgtName} translation>`,
				category: 'character | location | organization | technique | item | realm | title | concept | other',
				gender: 'masculine | feminine | neuter',
				aliases: ['<nickname or short form>'],
				context: `<brief 1-sentence description in ${tgtName}>`,
			},
		],
	};
	const templateJson = JSON.stringify(templateObj, null, 2);
	const contextHeader = dialogueContextBlock ? `${dialogueContextBlock.trim()}\n\n` : '';

	return `${contextHeader}Translate the following comic page regions into ${tgtName} (${tgtLang}) and extract all new glossary terms:

=== REGIONS TO TRANSLATE (Count: ${count}) ===
${regionPayload(regions)}

=== STRICT OUTPUT REQUIREMENTS ===
1. Return a valid JSON object containing two top-level keys: "translations" and "newTerms".
2. Strict 1:1 Region Mapping in "translations": You MUST provide a translation for ALL ${count} region IDs (${idList || 'none'}). Exactly one translation per ID: no more, no less. Do not skip or omit any region.
3. Target Language: All translation values and context descriptions MUST be strictly in ${tgtName} (${tgtLang}).
4. Mandatory Glossary Extraction in "newTerms": Extract ALL new character names, proper nouns, locations, sects/organizations, martial arts, cultivation tiers, items, and artifacts appearing on this page that are NOT already in the glossary.
   - High-Recall Directive: Be thorough and extract as many valid story terms, names, and techniques as possible. Err on the side of extracting rather than omitting; term consistency across pages is critical.
   - Strict Anti-Duplicate Rule: If a term or any of its aliases is ALREADY present in the Glossary (shown in the system messages), do NOT include it in "newTerms". Extract ONLY completely new, unlisted terms.
   - For every new term, provide its source, target translation, category, gender, aliases (e.g. ["小凡"] or []), and a 1-sentence context description.
   - If there are no new terms appearing on this page, output an empty array: "newTerms": [].
5. Output JSON Structure:
${templateJson}

No markdown fences, no commentary. Output ONLY the JSON object.`;
}

export function buildMessages(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	dialogueContext?: DialogueContextWindow | null,
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt(pair.sourceLang, pair.targetLang) },
	];
	const glossary = glossaryBlock(terms, pair.sourceLang, pair.targetLang);
	if (glossary) messages.push({ role: 'system', content: glossary });

	const contextBlock = formatDialogueContextBlock(dialogueContext);
	messages.push({ role: 'user', content: userPrompt(regions, pair.targetLang, contextBlock) });
	return messages;
}
