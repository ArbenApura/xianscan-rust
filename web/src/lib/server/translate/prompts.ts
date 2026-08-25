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
		return `Korean Manhwa Rules:
- Pro-drop: Korean omits subjects. Never default to "I"/"my". Strictly distinguish intransitive states from active actions (죽다 "to die/perish" vs 죽이다 "to kill" -> "많이 죽긴 했어" = "Too many died", not "I killed many").
- Livestream & Gamer Handles: Translate bracketed spectator/player usernames into ${tgtName} (e.g. [형 궁서체다] -> [Dead Serious Bro]). Never leave raw Hangul inside brackets.
- Manhwa SFX Taxonomy & Stylized Font/OCR Recovery:
  * Dining / Oral: 냠/남 (NOM), 쩝/접 (CHOMP/SMACK), 우물/오물 (MUNCH), 꿀꺽/벌컥 (GULP/GLUG), 후루룩/후룩 (SLURP).
  * Combat / Impact: 쿵/쾅 (THUD/SLAM), 콰앙 (CRASH/BOOM), 퍽/팍 (SMACK/WHACK), 탁 (SNAP), 챙/챙그랑 (CLANG), 와장창 (SHATTER).
  * Movement / Body: 슥/스윽 (SWISH/SLIDE), 척/뚜벅 (STEP), 바스락 (RUSTLE), 힐끔 (GLANCE), 덜덜 (SHIVER), 벌떡 (SPRING UP).
  * Vocal / Emotion: 하하 (HAHA), 흑흑/엉엉 (SOB/CRY), 헉/흡 (GASP), 한숨/휴 (SIGH/PHEW), 소곤 (WHISPER).
  * Atmosphere / Mimetic: 두근 (BA-DUMP), 번쩍 (FLASH), 찌릿 (ZAP), 주룩주룩 (POUR), 침묵/… (*SILENCE*).
  * Stylized Font Shift: Calligraphic manhwa fonts frequently shift vowels (ㅑ↔ㅏ e.g. 냠냠↔남남; ㅕ↔ㅓ e.g. 쩝쩝↔접접). Infer root onomatopoeia from scene context; never map dining/quiet sounds to combat impacts (BOOM/SLAM/CRASH).
- Honorifics: Adapt address terms (Hyung, Oppa, Noona, Sunbae, Nim) matching character relationships.`;
	}

	if (primary === 'ja') {
		return `Japanese Manga Rules:
- Pro-drop: Japanese dialogue omits subjects. Never insert "I"/"me" into impersonal observations. Strictly distinguish intransitive/passive verbs from transitive/causative actions (落ちる/落とす, 消える/消す, 死ぬ/杀す).
- Manga SFX Taxonomy & Cursive OCR Recovery:
  * Dining / Oral: モグモグ/クチャクチャ (MUNCH/CHOMP), ゴクッ/ゴクゴク (GULP/GLUG), ズルズル (SLURP), パクッ (CHOMP).
  * Combat / Impact: ドン/ドカーン (BOOM/KABOOM), バッ/バキッ (BAM/CRACK), ガタッ (RATTLE), ドカッ (SMASH), ザッ (SLASH).
  * Movement / Body: サッ/スッ (SWIFT/SLIP), スタスタ (STRIDE), ギラッ (GLINT), ビクッ (STARTLE), フワッ (FLOAT).
  * Vocal / Emotion: ハァ/フゥ (PANT/SIGH), クスクス/ニコニコ (GIGGLE/SMILE), ニヤニヤ (SMIRK), ひそひそ (WHISPER).
  * Atmosphere / Mimetic: ドキドキ (BA-DUMP), シーン (*SILENCE*), ゾクッ (SHIVER), パチパチ (CLAP-CLAP), ワクワク (EXCITED).
  * Cursive Katakana Recovery: Recover stylized dakuten/stroke confusions (バ↔パ↔ハ, ク↔ワ, ツ↔シ, ソ↔ン) matching scene context.
- Honorifics: Preserve or adapt honorifics (-san, -kun, -chan, -sama, senpai, sensei) according to speaker personality and relationship.`;
	}

	if (primary === 'zh') {
		return `Chinese & Manhua Rules:
- Pro-drop: Chinese conversational dialogue frequently omits subjects. Never default to "I"/"my" unless referring to self. Distinguish passive/intransitive (died/broke) from active actions (killed/destroyed).
- Names & Listings: Separate 2-character names in multi-name sequences (e.g. "子龙童菲，张肥关鱼" -> "Zilong, Tong Fei, Zhang Fei, Guan Yu"). Recognize homophone/parody names (e.g. 张肥 for 张飞) as character names. Translate army unit titles (e.g. 龙字军, 虎字营) into ${tgtName} divisions.
- Wuxia/Cultivation: Localize idioms, exclamations, and martial address (师尊, 掌门, 本座) into punchy ${tgtName}.
- Manhua SFX Taxonomy & Stylized Brush Recovery:
  * Dining / Oral: 吧唧/吧唧吧唧 (CHOMP/SMACK), 咕噜/咕咚 (GULP/GLUG), 吸溜 (SLURP), 嚼 (CHEW/MUNCH).
  * Combat / Impact: 砰/嘭 (BANG/POW), 咚/咚咚 (THUD/THUMP), 轰/轰隆 (BOOM/RUMBLE), 咔/咔嚓 (CRACK/SNAP), 铛/哐当 (CLANG), 啪 (SLAP).
  * Movement / Body: 嗖 (SWOOSH), 唰 (SWISH), 踏 (STEP), 扑通 (PLOP), 扑棱 (FLUTTER).
  * Vocal / Emotion: 哈哈 (HAHA), 呜呜 (SOB), 哧 (SNICKER), 唏嘘 (SIGH).
  * Atmosphere / Mimetic: 嗡嗡 (BUZZ), 嘶 (HISS), 哗啦 (GUSH), 寂静/… (*SILENCE*).
- Stat Panels: Only use [brackets] if source explicitly has 【】 brackets. Translate rarity tiers (LEGENDARY, EPIC, RARE, COMMON, MYTHIC) fused with item type. Keep parenthetical qualifiers on their own line with ().`;
	}

	if (primary === 'ru' || primary === 'uk' || primary === 'be') {
		return `Cyrillic Comic Rules:
- Cyrillic Comic SFX Taxonomy & Leetspeak/OCR Recovery:
  * Dining / Oral: ням-ням/хрум (NOM-NOM/CRUNCH), чавк (CHOMP/SMACK), бульк/глот (GULP/GLUG), ссссурч (SLURP).
  * Combat / Impact: бабах/бум (KABOOM/BOOM), бах/бам (BANG/BAM), хрусть/хрясь (CRACK/SMACK), бряк/хлоп (CLATTER/SLAM).
  * Movement / Body: топ-топ (STEP), шурх (RUSTLE), вжух (SWOOSH), кап-кап (DRIP), плюх (SPLASH), скрип (CREAK).
  * Vocal / Emotion: ах/ох (AH/OH), ха-ха/хи-хи (HAHA/GIGGLE), ух/ой (UGH/OOPS), чмок (SMOOCH), тсс (SHH).
  * Font & Leetspeak Recovery: Reconstruct stylized/cursive OCR confusions ('4'/'ч' ↔ 'х', '6' ↔ 'б', '0' ↔ 'о', '3' ↔ 'з', 'P' ↔ 'р', 'C' ↔ 'с', 'T' ↔ 'т', 'b' ↔ 'ь', e.g. "(4PyCTb" -> "хрусть" -> CRACK!).
- Conversational Flow: Translate Russian diminutives and conversational particles (давай, ну-ка, же) naturally into ${tgtName}.`;
	}

	if (primary === 'fr' || primary === 'es' || primary === 'de' || primary === 'it' || primary === 'pt') {
		return `Western Comic (BD) Rules:
- Western Comic SFX Taxonomy:
  * Dining / Oral: Miam/Ñam-ñam (YUM/NOM-NOM), Slurp/Gulp (SLURP/GULP), Mastic (CHOMP).
  * Combat / Impact: Vlan/Pum/Boum (WHAM/BOOM), Crac/Zas (CRACK/WHACK), Pif/Paf (POW/SLAP), Pan/Bang (BANG).
  * Movement / Body: Froufrou (RUSTLE), Toc-toc (KNOCK), Plaf/Chof (SPLASH/SQUISH), Boing (BOING).
  * Vocal / Emotion: Ouf/Uff (PHEW), Heu/Euh (UM), Chut (SHH), Smak (SMOOCH).
- Accents: Recover dropped or substituted OCR accents (é, è, à, ç, ñ, ü) from context.`;
	}

	if (primary === 'id' || primary === 'ms') {
		return `Indonesian & Malay Webtoon Rules:
- Slang & Particles: Translate dialogue particles (dong, kok, sih, lho, deh, kan, ya, nih) smoothly into natural spoken ${tgtName}. Translate fantasy titles (Gadis Suci, Pendekar, Raja Iblis) cleanly.
- Webtoon SFX Taxonomy:
  * Dining / Oral: Nyam-nyam (NOM-NOM), Kriuk/Krupuk (CRUNCH), Glek/Teguk (GULP), Sruput (SLURP).
  * Combat / Impact: Jedag-jedug/Buk (THUD), Duar/Darr (BOOM), Crat-crot (SPLURT), Prak/Krak (CRACK).
  * Movement / Body: Sret/Srat (SWISH), Derap/Tap-tap (STEP), Kresek-kresek (RUSTLE).
  * Vocal / Emotion: Hiks-hiks (SOB), Haha/Wkwk (HAHA), Huft/Huh (SIGH).`;
	}

	if (primary === 'th') {
		return `Thai Webtoon Rules:
- Kinship & Titles: Adapt regional forms of address and pronouns into natural spoken ${tgtName}.
- Thai SFX Taxonomy:
  * Dining / Oral: ง่ำๆ/หงับ (NOM NOM/CHOMP), อึก/กลืน (GULP), ซู้ด (SLURP).
  * Combat / Impact: ตูม/บึ้ม (BOOM), เปรี้ยง/เพล้ง (CRASH/CLANG), ผัวะ/พลั่ก (SMACK/THUD), ฉับ (SLASH).
  * Movement / Body: ฟึ่บ/ควับ (SWOOSH/SWISH), ตึกๆ (FOOTSTEPS), กริ๊ก (CLICK).
  * Vocal / Emotion: ฮ่าๆ (HAHA), ฮึก/ฮือ (SOB), เฮ้อ (SIGH), ชู่ว (SHH).`;
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
4. Sound Effects (sfx): Render sound effects as concise, punchy ALL-CAPS ${tgtName} onomatopoeia matching the scene category (e.g. Dining: NOM NOM / MUNCH / SLURP; Combat: BOOM / SLASH / THUD; Emotion: SIGH / GASP). If a source sound effect is already in standard Latin letters and self-explanatory in ${tgtName}, return "" for its id to preserve original artist artwork.
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
