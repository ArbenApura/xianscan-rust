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
	if (primary === 'ko') {
		return `Korean Manhwa & Murim Rules:
- Pro-drop & State vs Action: Korean frequently omits subjects. Never default to "I"/"my". Strictly distinguish intransitive states from causative actions (죽다 "to die/perish" vs 죽이다 "to kill" -> "많이 죽긴 했어" = "Too many died", not "I killed many").
- Conversational Invitations: Common social phrases like "밥이나 먹으러 ... 와" (come over for a meal/hang out) are casual invitations, not commercial restaurant references.
- Murim & Organization Hierarchy:
  * Clans & Families: ~세가 (~世家, e.g. 남궁세가 -> Namgung Clan/Family, 제갈세가 -> Jaegal Clan), ~가 (家, Clan), ~가장 (家莊, Clan Manor/Estate e.g. 유가장 -> Yu Clan Manor, never "Yu's Restaurant").
  * Sects & Factions: ~파 (派, Sect e.g. 화산파 -> Mount Hua Sect, 무당파 -> Wudang Sect, 소림사 -> Shaolin Temple), ~문 (門, Sect/Gate e.g. 당문 -> Tang Sect), ~방 (幇, Union/Gang e.g. 개방 -> Beggars' Sect), ~교 (敎, Cult e.g. 마교 -> Demonic Cult / Heavenly Demon Cult).
  * Halls & Pavilions: ~전 (殿, Hall/Palace), ~당 (堂, Hall), ~각 (閣, Pavilion).
  * Disciples & Ranks: 가주 (Clan Head), 장문인 (Sect Leader), 장로 (Elder), 사부 (Master/Teacher), 대사형 (Eldest Martial Brother), 사제 (Junior Martial Brother), 사매 (Junior Martial Sister).
- Martial Art Techniques & Calligraphy OCR Recovery: Stylized vertical martial arts technique names and stance callouts (e.g. ~창법 [Spear Art], ~검법 [Sword Art], ~신공 [Divine Art]) often have calligraphy strokes or Hanja watermarks misrecognized as stray ASCII brackets/letters (e.g. "o]\\n게\\n장\\n법" -> "유가창법" / Yu Clan Spear Technique). Infer the correct martial technique name from the constituent Hangul syllables and action context.
- Livestream, Hunter & Gamer Handles: Translate bracketed spectator/player usernames into ${tgtName} (e.g. [형 궁서체다] -> [Dead Serious Bro]). Never leave raw Hangul inside brackets.
- Honorifics & Kinship: Adapt address terms (Hyung, Oppa, Noona, Sunbae, Nim, Hubae) matching character relationships.
- Speech Levels: Maintain consistent conversational tone across sentence clauses (honorific/formal 존댓말 vs casual/intimate 반말).`;
	}

	if (primary === 'ja') {
		return `Japanese Manga & Light Novel Rules:
- Pro-drop & Transitivity: Japanese dialogue omits subjects. Never insert "I"/"me" into impersonal observations. Strictly distinguish intransitive/passive verbs from transitive/causative actions (落ちる/落とす, 消える/消す, 死ぬ/杀す).
- Clan, School & Organization Terminology:
  * Clans & Lineage: ~一族 (~Ichizoku, Clan/Tribe), ~家 (~Family/Clan), 本家 (Honke, Main Family/Branch), 分家 (Bunke, Branch Family).
  * Martial Schools & Sects: ~流 (~Ryū, School/Style e.g. 神道流 -> Shintō-ryū), ~宗派 (~Shūha, Sect), ~道場 (Dōjō, Training Hall/Dojo), ~組 (~Gumi, Clan/Syndicate).
  * Guilds & Conglomerates: 財閥 (Zaibatsu, Financial Conglomerate), ギルド (Guild).
- Honorifics: Preserve or adapt honorifics (-san, -kun, -chan, -sama, senpai, sensei, kouhai) according to speaker personality, hierarchy, and relationship.
- Visual Kanji/Kana Recovery: Reconstruct visually similar Kanji/Kana OCR stroke confusions (e.g. 盲↔育, 友↔反, バ↔パ↔ハ, ク↔ワ, ツ↔シ, ソ↔ン) from context.`;
	}

	if (primary === 'zh') {
		return `Chinese Manhua, Wuxia & Xianxia Rules:
- Pro-drop: Chinese conversational dialogue frequently omits subjects. Never default to "I"/"my" unless referring to self. Distinguish passive/intransitive (died/broke) from active actions (killed/destroyed).
- Hanzi OCR Recovery: Correct common visually similar character stroke confusions (e.g. 拔↔拨, 己↔已↔巳, 崇↔祟, 治↔冶, 呜↔鸣, 未↔末, 刺↔剌) by inferring intended terms from story and martial context.
- Names & Listings: Separate 2-character names in multi-name sequences (e.g. "子龙童菲，张肥关鱼" -> "Zilong, Tong Fei, Zhang Fei, Guan Yu"). Recognize homophone/parody names (e.g. 张肥 for 张飞) as character names. Translate army unit titles (e.g. 龙字军, 虎字营) into ${tgtName} divisions.
- Wuxia, Xianxia & Cultivation Hierarchy:
  * Clans & Estates: ~世家 (Great Clan/Family e.g. 南宫世家 -> Namgung Clan), ~家庄 (Clan Manor e.g. 刘家庄 -> Liu Clan Manor), ~山庄 (Mountain Villa/Estate), ~堡 (Fortress/Manor).
  * Sects & Lineages: ~门派 / ~派 (Sect e.g. 华山派 -> Mount Hua Sect, 武当派 -> Wudang Sect, 少林寺 -> Shaolin Temple), ~宗 (Sect/Clan e.g. 天宗 -> Heaven Sect), ~门 (Sect/Gate e.g. 唐门 -> Tang Sect), ~帮 (Sect/Gang e.g. 丐帮 -> Beggars' Sect), ~教 (Cult e.g. 魔教 -> Demonic Cult).
  * Divisions & Roles: ~堂 (Hall e.g. 执法堂 -> Law Enforcement Hall), ~阁 (Pavilion e.g. 藏经阁 -> Scripture Pavilion). 掌门 (Sect Leader), 家主 (Clan Head), 长老 (Elder), 师尊/师父 (Master), 师兄 (Senior Martial Brother), 师弟 (Junior Martial Brother), 师姐 (Senior Martial Sister), 师妹 (Junior Martial Sister), 徒儿 (Disciple).
  * Martial World: 江湖 (Jianghu / Martial World), 武林 (Wulin). Localize archaic martial pronouns (本座, 老夫, 晚辈) naturally into ${tgtName}.
- Stat Panels: Only use [brackets] if source explicitly has 【】 brackets. Translate rarity tiers (LEGENDARY, EPIC, RARE, COMMON, MYTHIC) fused with item type. Keep parenthetical qualifiers on their own line with ().`;
	}

	if (primary === 'ru' || primary === 'uk' || primary === 'be') {
		return `Cyrillic Comic Rules:
- Conversational Flow: Translate Russian diminutives and conversational particles (давай, ну-ка, же) naturally into ${tgtName}.
- Font & Leetspeak Recovery: Reconstruct stylized/cursive OCR confusions ('4'/'ч' ↔ 'х', '6' ↔ 'б', '0' ↔ 'о', '3' ↔ 'з', 'P' ↔ 'р', 'C' ↔ 'с', 'T' ↔ 'т', 'b' ↔ 'ь', e.g. "(4PyCTb" -> "хрусть").`;
	}

	if (primary === 'fr' || primary === 'es' || primary === 'de' || primary === 'it' || primary === 'pt') {
		return `Western Comic (BD) Rules:
- Accents & Typography: Recover dropped or substituted OCR accents (é, è, à, ç, ñ, ü) from context. Maintain natural idiomatic dialogue flow in ${tgtName}.`;
	}

	if (primary === 'id' || primary === 'ms') {
		return `Indonesian & Malay Webtoon Rules:
- Slang & Particles: Translate dialogue particles (dong, kok, sih, lho, deh, kan, ya, nih) smoothly into natural spoken ${tgtName}. Translate fantasy and martial titles (Gadis Suci -> Holy Maiden, Pendekar -> Martial Hero/Swordsman, Raja Iblis -> Demon King) cleanly.`;
	}

	if (primary === 'th') {
		return `Thai Webtoon Rules:
- Kinship & Titles: Adapt regional forms of address, pronouns, and honorific particles into natural spoken ${tgtName}.`;
	}

	return '';
}

export function systemPrompt(src: string, tgt: string, _enableSfx = false): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	const langProfile = getSourceLanguageProfile(src, tgtName);

	const rules: string[] = [
		`1. Target Language & Zero Leakage: ALL translations MUST be strictly in ${tgtName} (${tgt}). Never leave raw source characters (Hanzi/Hangul/Kanji/Cyrillic) in the output.`,
		`2. Strict 1:1 Region Mapping: Every input region ID must have exactly one corresponding translation in the output JSON. You must translate ALL input IDs: no more, no less. Never merge regions, split regions, or omit any region ID.`,
		`3. Dialogue Style & Casing: Write natural spoken ${tgtName} dialogue suitable for comic voice acting. Keep lines punchy to fit bubble space. Dialogue and thoughts MUST use natural standard sentence case (never ALL-CAPS).`,
		`4. Mandatory Glossary Adherence (Zero Deviation): The project Glossary provided in the system messages contains authoritative terminology overrides. Whenever a source term (or its alias) appears in the dialogue (including across OCR line breaks or in compound phrases), you MUST use its EXACT specified target translation verbatim. Never substitute with standard dictionary definitions, synonyms, or your own variations.`,
		`5. Contextual OCR Typo & Degradation Recovery: Source text from comic OCR may contain visually similar stroke confusions, spurious intra-word spaces, or rogue border/bracket symbols (| / \\ ~ [ ] o] c]). Never translate corrupted OCR text literally if it produces nonsensical dialogue or broken words. Infer the intended natural spoken words, terminology, and martial techniques from page and dialogue context.`,
		`6. Sentence Continuations Across Regions: Consecutive regions on a page frequently contain split clauses of a single continuous sentence. Maintain grammatical continuity, cohesive flow, and consistent phrasing across connected regions without inserting duplicate subjects.`,
		`7. OCR Artifact & Bubble-Tail Cleaning: Strip trailing bubble-tail digits, zero-clusters, or dots caused by circular thought-bubble tails (e.g. "! 20...", "oo"). Strip stray unmatched leading/trailing border parentheses (e.g. isolated "(" at line start).`,
		`8. Bilingual Title Logos & Subtitle Deduplication: When a title, logo, or cover region contains both a native title and an accompanying decorative/official ${tgtName} subtitle (e.g. "星魂将传\\nLEGEND OF STAR GENERAL" or "나 혼자만 레벨업\\nSOLO LEVELING"), do NOT output redundant duplicate titles. Unify them into a single clean title in ${tgtName} (e.g. "Legend of Star General"), adopting the official subtitle unless a glossary entry overrides it.`,
		`9. Punctuation & Handles: Translate reaction punctuation (……, ？！, !) to natural ${tgtName} (..., ?!, !). Translate all bracketed usernames [Username]: into ${tgtName}.`,
		`10. Line Breaks: Preserve all \\n line breaks from source text to maintain comic panel layout (except when deduplicating bilingual title logos as specified in rule 8).`,
		`11. Output: Reply with ONLY a valid JSON object matching the requested schema. No commentary, no markdown fences.`,
	];

	return `You are a professional comic and manga localizer translating ${srcLabel} dialogue into natural, fluent, and immersive ${tgtLabel}.

Core Rules & Invariants:
${rules.join('\n')}${langProfile ? `\n\n${langProfile}` : ''}`;
}

export function glossaryBlock(terms: TermDraft[], src: string, tgt: string): string | null {
	if (terms.length === 0) return null;
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const lines = terms.map((t) => {
		const aliases = t.aliases && t.aliases.length > 0 ? ` (also: ${t.aliases.join(', ')})` : '';
		const gender = t.gender === 'masculine' ? ' [masculine]' : t.gender === 'feminine' ? ' [feminine]' : '';
		const context = t.context ? ` - ${t.context}` : '';
		return `★${t.source}${aliases} = ${t.target}${gender}${context}`;
	});
	return `Glossary (${srcName} → ${tgtName}) - Use these EXACT target renderings for the listed terms whenever their source characters appear in dialogue. These overrides take strict precedence over default dictionary translations:
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
4. Mandatory Glossary Compliance (Zero Deviation): For every term listed in the project Glossary, you MUST use the EXACT target translation string verbatim whenever its source characters appear in any region. Do NOT re-translate, synonymize, or alter Glossary terms.
5. Mandatory Glossary Extraction in "newTerms": Extract ALL new character names, proper nouns, locations, sects/organizations, martial arts, cultivation tiers, items, and artifacts appearing on this page that are NOT already in the glossary.
   - High-Recall Directive: Be thorough and extract as many valid story terms, names, and techniques as possible. Err on the side of extracting rather than omitting; term consistency across pages is critical.
   - Strict Anti-Duplicate Rule: If a term or any of its aliases is ALREADY present in the Glossary (shown in the system messages), do NOT include it in "newTerms". Extract ONLY completely new, unlisted terms.
   - For every new term, provide its source, target translation, category, gender, aliases (e.g. ["小凡"] or []), and a 1-sentence context description.
   - If there are no new terms appearing on this page, output an empty array: "newTerms": [].
6. Output JSON Structure:
${templateJson}

No markdown fences, no commentary. Output ONLY the JSON object.`;
}

export function buildMessages(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	dialogueContext?: DialogueContextWindow | null,
	enableSfx = true,
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt(pair.sourceLang, pair.targetLang, enableSfx) },
	];
	const glossary = glossaryBlock(terms, pair.sourceLang, pair.targetLang);
	if (glossary) messages.push({ role: 'system', content: glossary });

	const contextBlock = formatDialogueContextBlock(dialogueContext);
	messages.push({ role: 'user', content: userPrompt(regions, pair.targetLang, contextBlock) });
	return messages;
}
