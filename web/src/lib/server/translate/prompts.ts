// LOCALIZATION PROMPTS AND LANGUAGE PROFILE RULES
import type { LangPair, TermDraft } from '$lib/types';
import type OpenAI from 'openai';
import { languageName } from '$lib/languages';

export interface RegionSource {
	id: string;
	text: string;
	kind?: string;
	vertical?: boolean;
}

export function getSourceLanguageProfile(src: string, tgtName: string): string {
	const primary = src.split('-')[0].toLowerCase();
	if (primary === 'zh') {
		return `Manhua & Chinese Culture Localization Rules:
- Pronoun & Omitted Subject Resolution (Pro-drop):
  * In Chinese conversational dialogue, subjects (我, 你, 他, 她, 他们, 众人) are frequently omitted.
  * NEVER default to inserting "I" / "my" / "me" unless the speaker is explicitly referring to themselves.
  * Strictly distinguish intransitive/passive states from active actions (e.g. 死了/破了/不见了 vs 杀了/打破了/弄丢了).
- Wuxia / Xianxia / Cultivation Dialogue & Idioms:
  * Localize common Chinese idioms, exclamation phrases, and curses into natural, punchy, and idiomatic ${tgtName} (e.g. 找死, 好大的胆子, 手下留情, 雕虫小技, 休想, 废话少说, 多管闲事, 井底之蛙).
  * Naturally adapt or preserve martial and kinship forms of address into natural ${tgtName} honorifics/kinship terms (e.g. 师尊/师父, 师兄/师姐/师弟/师妹, 掌门/宗主, 前辈/阁下, 本座/本王/老子/本少, 臭丫头/臭小子).
- Character Names, Multi-Name Listings & Military Units:
  * Chinese Name Segmentation: Chinese personal names (courtesy names, given names, full names) are typically 2 or 3 characters each (e.g. 子龙, 童菲, 张飞/张肥, 关羽/关鱼, 赵云, 诸葛亮).
  * Consecutive Name Listings & Sparse Punctuation: In military orders, roster listings, and dialogue, multiple names are frequently written back-to-back with sparse or missing punctuation (e.g. "子龙童菲，张肥关鱼" or "刘关张").
    - NEVER combine adjacent 2-character names into a single 4-character compound name (e.g. "子龙童菲" represents TWO separate persons "Zilong" and "Tong Fei"; "张肥关鱼" represents TWO separate persons "Zhang Fei" and "Guan Yu").
    - When translating name series, render all individuals clearly separated with proper punctuation and conjunctions in ${tgtName}.
  * Parody, Homophone & OCR Typo Names: In comedic, parody, or OCR'd manhua, character names may appear as homophones or humorous variants (e.g. 张肥 for 张飞, 关鱼 for 关羽). Recognize these as individual character names rather than literal common nouns ("fat", "fish") and translate them cleanly as names.
  * Military Unit & Army Division Titles: In war, military, or historical manhua, army divisions, brigades, or squads named after characters/monikers (e.g. 龙字军, 肥字军, 鱼字军, 虎字营, 豹字部) represent legitimate in-universe armed forces. ALWAYS translate them into ${tgtName}.
- Chinese Calligraphy & Title OCR Resilience:
  * For comic title and chapter banner regions, be resilient to common Chinese calligraphy OCR misrecognitions (e.g. 快神记 → 妖神记 / Tales of Demons and Gods). Translate the true canonical title/chapter text accurately into ${tgtName}.
- Wuxia/manhua stat-panel and item-card rules (apply when the text has 【】title brackets or a rarity grade):
  * Title lines enclosed in 【】brackets → output as [${tgtName.toUpperCase()} TITLE] (first line, keep the square brackets). ONLY add [brackets] when the SOURCE text has 【】 — do NOT add brackets to items that start directly with a rarity grade word.
  * Rarity-grade items WITHOUT 【】: output the rarity+name as the FIRST line in ${tgtName} with no brackets.
  * Translate vehicle/weapon names accurately: 滑车 = chariot / war vehicle; 战刀 = battle saber; 弩 = crossbow, etc.
  * Rarity grade words (传说级, 史诗级, 稀有级, 精良级, 普通级, 神话级, etc.) → translate into equivalent ${tgtName} terms (e.g. LEGENDARY, EPIC, RARE, FINE, COMMON, MYTHIC). Keep fused with item type on same line.
  * Parenthetical qualifiers （改良版）, （强化版）, （威力加强版）etc. → translate into equivalent ${tgtName} terms on their OWN line immediately after the rarity+type or title line. Always keep the () parentheses in the output.`;
	}

	if (primary === 'ru' || primary === 'uk' || primary === 'be') {
		return `Russian & Cyrillic Comic Localization Rules:
- Cyrillic Sound Effects (SFX) & Action Onomatopoeia:
  * Render all comic sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia (e.g. хрусть/хрусь/хрясь/щелк, бум/бабах/бах/бам, вжух/шурх/свист, скрип/стук/тук, кап/кап-кап, чмок/чпок, бряк/дзынь/звон, топ/топ-топ, хлоп/шлеп, ах/ох/ух/эх/ай/ой).
- Cyrillic Comic OCR Font Confusions & Leetspeak Recovery:
  * Stylized cursive or brush letters frequently cause OCR to misread Cyrillic letters as visually similar digits or Latin glyphs:
    '4' or 'ч' ↔ 'х', '6' ↔ 'б', '0' ↔ 'о', '3' ↔ 'з', 'P' ↔ 'р', 'C' ↔ 'с', 'T' ↔ 'т', 'b' ↔ 'ь', 'm' ↔ 'т'.
  * Example: "(4PyCTb" represents the Russian sound effect "хрусть". Reconstruct the intended word from context and font similarity instead of echoing raw OCR gibberish.
- Diminutives, Kinship & Natural Flow:
  * Reflect natural Russian spoken dialogue with lively phrasing in ${tgtName}.
  * Translate Russian diminutive/affectionate names (e.g. Маша / Машенька, Ваня / Ванька, Саня) and emotional particles (давай, ну-ка, же, ведь) naturally into conversational ${tgtName}.`;
	}

	if (primary === 'ja') {
		return `Japanese Manga Localization Rules:
- Pronoun & Omitted Subject Resolution (Pro-drop):
  * Japanese dialogue routinely omits subjects and pronouns.
  * NEVER default to inserting "I" / "my" / "me" into impersonal observations or third-party descriptions.
  * Strictly distinguish intransitive/passive verbs from transitive/causative actions (e.g. 落ちる/落とす, 消える/消す, 死ぬ/殺す, 倒れる/倒す, 壊れる/壊す).
- Manga Sound Effects (Gitaigo / Giseigo):
  * Render all manga sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia (e.g. ドキドキ, ドン/ドカーン, ガタッ/ガタガタ, ニコ/ニコニコ, パチパチ, ギラッ/ピカッ, ピクッ/ビクッ, シーン, ハァ/フゥ, ザー/ザァァ, バッ/サッ, ゴクッ).
- Honorifics & Relationships:
  * Naturally preserve or adapt Japanese honorific suffixes (-san, -kun, -chan, -sama, senpai, sensei) and kinship terms according to the tone and speaker's personality in ${tgtName}.`;
	}

	if (primary === 'ko') {
		return `Korean Manhwa Localization Rules:
- Pronoun & Omitted Subject Resolution (Pro-drop):
  * Korean frequently omits grammatical subjects (I, you, he, she, they, people, we).
  * NEVER default to inserting "I" / "my" / "me" unless the speaker is explicitly referring to themselves.
  * Transitive vs Intransitive & Passive Distinction: Strictly differentiate intransitive verbs / states from transitive actions:
    - 죽다 (to die / perish) vs 죽이다 (to kill / slay) -> "많이 죽긴 했어" = "Too many (people/challengers) died", NOT "I killed many".
    - 다치다 (to get hurt) vs 다치게 하다 (to hurt someone).
    - 사라지다 (to vanish) vs 없애다 (to eliminate).
    - 떨어지다 (to fall/fail) vs 떨어뜨리다 (to drop).
    - 망하다 (to be ruined) vs 망치다 (to ruin).
  * Infer omitted subjects accurately from dialogue context, preceding bubbles, or impersonal third-person ("they", "people", "challengers", "it").
- Chat Windows, Livestream Comments & Gamer Handles:
  * Bracketed usernames (e.g. [형 궁서체다], [앞비전뒷점멸], [아모른직다], [하울의 무빙성], [라임 깨쩌는 오렌지]) represent live stream chatroom spectators, raid players, or internet commenters.
  * ALWAYS translate the gamer handles and meme usernames into natural ${tgtName} equivalents (e.g. [형 궁서체다] → [Dead Serious Bro], [앞비전뒷점멸] → [Forward Shift Back Flash], [하울의 무빙성] → [Howl's Moving Castle]). NEVER leave raw Korean Hangul inside the brackets.
  * Spectator comments discuss the situation or third parties (e.g. raid casualties, bosses, guilds), not personal actions.
- Manhwa Sound Effects & Action Onomatopoeia:
  * Render sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia (e.g. 쿵/쾅, 두근두근, 슥/척, 찰칵, 으아아/꺄아, 씨익, 퍽/탁, 번쩍).
- Korean Honorifics & Kinship Forms:
  * Naturally adapt Korean address terms (Hyung, Oppa, Noona, Unnie, Sunbae, Hubae, Nim, Ahjussi) matching character relationships and localization style in ${tgtName}.`;
	}

	if (primary === 'fr' || primary === 'es' || primary === 'de' || primary === 'it' || primary === 'pt') {
		return `Western & European Comic (Bande Dessinée) Rules:
- Comic Sound Effects & Onomatopoeia:
  * Localize European/Western comic sound effects into standard punchy ALL-CAPS ${tgtName} (e.g. Vlan/Bim/Pif/Paf/Zas, Boum/Pum/Bang/Boom, Crac/Crash, Toc/Tap, Plaf/Plouf/Chof).
- Accented Character OCR Recovery:
  * Be resilient to OCR dropping or substituting accents (é, è, ê, à, ç, ñ, ü, ö, etc.). Infer the true intended word naturally.`;
	}

	if (primary === 'id' || primary === 'ms') {
		return `Indonesian & Malay Webtoon Localization Rules:
- Dialogue Particles, Slang & Colloquialisms:
  * Reflect natural spoken Indonesian dialogue particles (dong, kok, sih, lho, deh, kan, ya, nih, tuh, masa) smoothly into idiomatic ${tgtName}.
  * Translate fantasy and comic honorific titles accurately into ${tgtName} (e.g. Gadis Suci/Wanita Suci, Kesatria/Pendekar, Raja Iblis/Iblis, Yang Mulia, Tuan Muda/Nona).
- Webtoon Sound Effects & Exclamations:
  * Render reaction sounds into punchy ALL-CAPS ${tgtName} onomatopoeia.`;
	}

	if (primary === 'th') {
		return `Thai Webtoon Rules:
- Respectful & Kinship Forms:
  * Naturally adapt regional forms of address, pronouns, and kinship terms into conversational ${tgtName}.
- Webtoon Sound Effects:
  * Convert local comic onomatopoeia and action words into punchy ALL-CAPS ${tgtName}.`;
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

Target Language & Zero Untranslated Script Invariant:
- CRITICAL: ALL output translations MUST be strictly in ${tgtName} (${tgt}).
- Do NOT output English or any other language unless the target language is explicitly English.
- ZERO Source Script Leakage: NEVER leave raw source characters (e.g. Korean Hangul, Chinese Hanzi, Japanese Kanji/Kana, Cyrillic) in the translation output.
- Every translated sentence, thought, exclamation, sound effect, and username/handle must be localized into ${tgtName}.

Contextual Continuity & Multi-Bubble Flow:
- Page-Wide Context: Treat all regions on the page as part of an interconnected scene. Read preceding and following regions to maintain consistent pronoun references, conversational flow, and speaker identity.
- Speaker Continuity: Ensure replies match the questions asked in earlier bubbles on the same page.

Pronoun, Subject Resolution & Pro-Drop Accuracy:
- Avoid First-Person Hallucinations: In languages with omitted subjects (Korean, Japanese, Chinese, etc.) or conversational speech, do NOT default to inserting "I" / "me" / "my" unless the speaker is unambiguously referring to themselves.
- Impersonal & Third-Party Context: When a sentence describes an event, disaster, casualty count, general fact, or environmental state, infer the subject naturally as impersonal ("it", "there is/are") or third-person ("they", "people", "challengers", "everyone").

Verb Transitivity & Grammatical Voice Fidelity:
- Strictly distinguish intransitive/passive states (e.g. "died", "got lost", "broke", "vanished", "collapsed") from active transitive actions (e.g. "killed", "threw away", "destroyed", "eliminated", "knocked down").
- NEVER turn an accidental event, casualty count, or natural occurrence into an active deliberate act performed by an invented subject.

UI, Livestreams, Game Chat & System Prompts:
- In-Universe Chat & Livestream Handles: Bracketed prefixes like [Username]: or 【Player】: represent chatroom spectators or commenters.
  * ALWAYS translate, localize by meaning, or romanize the username INSIDE the brackets into ${tgtName} (e.g. [형 궁서체다] → [Dead Serious Bro]; [앞비전뒷점멸] → [Forward Shift Back Flash]).
  * NEVER leave untranslated source-language characters (Hangul/Hanzi/Kanji) inside [brackets]. Render the final output as [Localized Username]: translated message.
  * Treat chat dialogue as external spectator commentary rather than physical scene action.
- System Windows & Game Notifications: Localize status cards, viewer counters (e.g. "시청자: 4,752명" → "Viewers: 4,752"), quest popups, and skill notifications into clean, immersive game UI terminology.

Comic Conversation & Dialogue Style:
- Conversational Flow: Write natural spoken dialogue as real characters speak in ${tgtName} comics. Use natural colloquial phrasing, contractions, and lively expressions suitable for voice acting. Avoid stiff, robotic, or overly literal translations.
- Tone & Character Personality: Reflect the speaker's personality, emotion, age, and social standing (e.g. arrogant rivals, wise masters, energetic protagonists, stern villains, flustered heroines, playful sidekicks).
- Bubble Space & Brevity: Comic speech bubbles have limited space. Keep dialogue concise, punchy, and impactful without dropping meaning.
- Categories & Region Kinds:
  * dialogue_bubble: Natural spoken conversation with character voice and emotion in ${tgtName}.
  * mono / thought: Inner thoughts, reflections, or narration in a smooth, introspective tone in ${tgtName}.
  * free_text / sfx: Comic onomatopoeia, floating sound effects, or sketch captions in ${tgtName}. Render sound effects in ALL-CAPS.
  * other: UI, system prompts, stat cards, or narrator captions in ${tgtName}.

Intelligent OCR Noise, Artwork Artifacts & Speech Bubble Tails:
- Comic lettering and hand-drawn sound effects frequently suffer from visual OCR character confusions (e.g. brush strokes or cursive glyphs read as digits like '4', '6', '0', '3', '1' or mixed Latin/ASCII characters).
- When a region contains garbled tokens or leetspeak glyphs, reconstruct the intended word or sound effect from visual character similarity and comic context before translating into ${tgtName}.
- Speech Bubble Tails & Artwork Artifact Filtering:
  * Trailing Tail & Nub Noise: When a complete dialogue sentence concludes with its natural terminal punctuation or complete semantic thought, but is followed by trailing isolated digits, zero clusters, or stray ellipses (caused by OCR misinterpreting circular thought-bubble tails "o o o" or pointer nubs as "20...", "00...", "oo", "8"), strip the trailing artifact characters.
  * Stray Border & Unmatched Parentheses Artifacts: Curved bubble outlines, border lines, speed lines, or sweat marks are frequently misrecognized by OCR as stray unmatched leading/trailing parentheses or brackets (e.g. an isolated "(" at the start of a sentence or ")" at the end). When standard dialogue text begins with an unmatched opening parenthesis "(" without a closing pair or ends with an unmatched ")", STRIP the stray parenthesis and output the clean dialogue text.
  * Safety Invariant: Filter extraneous characters ONLY when 100% certain they are visual OCR artifacts completely disconnected from the story dialogue. If a number or symbol represents a genuine in-universe timer, countdown, level/stat, skill rank, or valid paired parenthetical aside "(like this)", preserve it accurately.
- NEVER output raw OCR gibberish if the intended comic word or sound effect can be reasonably identified.

Comic Sound Effects (SFX) & Action Onomatopoeia:
- Isolated Action Sounds: Single or short repeated characters without sentence punctuation represent action sound effects (SFX), footsteps, landings, impacts, swings, or movements.
- NEVER convert isolated SFX characters into ellipses ("..."), pauses, or empty strings.
- Render all SFX into concise, punchy ALL-CAPS ${tgtName} onomatopoeia.

Story Narration, Sketch Captions & Incomplete Fragments:
- Floating Comic Art Captions: Handwritten text floating on illustrations, parchment, or battle plan sketches is essential story narrative. ALWAYS translate it into ${tgtName}.
- Incomplete / Cut-off Phrases: If a story caption or dialogue is cut off or incomplete at the edge of the panel, translate the partial phrase with a natural trailing ellipsis in ${tgtName}. NEVER drop incomplete sentences or return empty strings for story text.

Punctuation & Reaction Bubbles:
- NEVER invent or use em-dashes (— or --) for pauses, thinking, or sentence breaks. Use natural commas (,), periods (.), or ellipses (...) matching the source punctuation.
- Character Speech & Reaction Bubbles: If a dialogue region contains ellipses, exclamation marks, question marks, or reaction punctuation (e.g. "……", "……！", "……？", "？！", "！", "？", "...", "!?"), ALWAYS translate it to natural ${tgtName} punctuation (e.g. "...", "...!", "...?", "?!", "!", "?"). Do NOT return an empty string for character speech or pause bubbles!
- Spoken Pauses: Preserve ellipses in spoken pauses.
- Only output a dash if the original source text explicitly contains a dash/hyphen.

Watermark & Scanlation Tag Filtering:
- Piracy Watermarks & Aggregator Ads: If a text region is STRICTLY a third-party pirate watermark, scanlation group recruitment ad, website URL/domain, aggregator watermark, scanlation QQ/Discord group, or uploader logo, return an EMPTY STRING "" for its id.
- Intrusive Mid-Sentence Watermarks & Overlay Noise:
  * When a third-party watermark, website domain, scanlation logo, or aggregator stamp physically overlaps a dialogue bubble, OCR may erroneously splice foreign watermark characters, site names, or random stamp glyphs directly into the middle, beginning, or end of a sentence.
  * In such cases, intelligently excise the intrusive watermark characters and translate ONLY the clean, intended underlying story dialogue into ${tgtName}.
  * 100% Certainty Constraint: Apply this excision ONLY when you are 100% CERTAIN that the inserted characters are a watermark/overlay collision that breaks the natural grammar and has zero semantic connection to the comic story. Never alter or omit genuine in-universe proper nouns, fantasy terms, or intentional dialogue quirks.
- Story Text is NOT a Watermark: In-universe names, military forces, bandit fortresses, location names, or character sketch captions are NOT watermarks. NEVER filter them out.
- Official Comic Staff & Production Credits: ALWAYS TRANSLATE official manga/manhua/comic author, artist, and studio production credits into ${tgtName}.
- If a dialogue bubble contains legitimate character speech mixed with a trailing watermark or website URL, translate ONLY the dialogue portion into ${tgtName} and omit the watermark entirely.

Corrupted & Unrecognizable Sound Effects (SFX) / Artwork Noise Suppression:
- If a free-text or background sound effect region is severely garbled, distorted lettering, non-lexical OCR noise, or illegible handwriting where the true meaning cannot be reliably deciphered with high confidence, return an EMPTY STRING "" for its id.
- Returning "" tags the region as unrecognized and automatically preserves the original artist's background drawing, hair, and clothing without hallucinating fake translations or causing damaging inpainting over character art.
- Legitimate dialogue bubbles and clearly decipherable sound effects must ALWAYS be translated into ${tgtName}.

Latin-Script & Universal Sound Effects (SFX) Preservation:
- For comics where the source SFX is ALREADY in Latin letters (e.g. Indonesian, Spanish, French, Italian, or English loanwords):
  * If a free-text SFX is already natural, universally recognizable, or self-explanatory in ${tgtName}, return an EMPTY STRING "" for its id to preserve original artist artwork.
  * Only translate free-text sound effects if they are in a non-Latin script (e.g. CJK, Cyrillic, Thai) or consist of source-language words that ${tgtName} readers cannot understand without translation. Dialogues inside speech bubbles must always be translated into ${tgtName}.

General Rules:
- Never add narration, explanations, or stage directions outside the text itself.
- Never translate glossary terms differently from the glossary block.
- Preserve names exactly as the glossary says.
- Preserve all \\n line breaks from the source text in the translation so the panel layout is maintained.
- Flavour remarks starting with * → keep the * prefix, translate in the character's voice.
${langProfile ? `\n${langProfile}\n` : ''}
Output Language Requirement:
- You MUST write all translations in ${tgtName} (${tgt}). Do not output in English or any other language unless ${tgtName} is English.
- Reply with ONLY a JSON object; no markdown fences, no commentary.`;
}

export function glossaryBlock(terms: TermDraft[], src: string, tgt: string): string | null {
	if (terms.length === 0) return null;
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	// PRESERVE INPUT ORDER — DO NOT RE-SORT. A STABLE, MONOTONIC (APPEND-ONLY) GLOSSARY IS WHAT LETS
	// GEMINI/OPENAI PREFIX CACHING REUSE THE SYSTEM+GLOSSARY PREFIX ACROSS CONSECUTIVE PAGES: A NEW TERM
	// DISCOVERED ON PAGE N IS APPENDED (NEVER INTERLEAVED), SO PAGE N+1's GLOSSARY == PAGE N's + A SUFFIX.
	// THE CALLER OWNS ORDERING (PINNED-FIRST, DETERMINISTICALLY SORTED ONCE, THEN DISCOVERY ORDER).
	const lines = terms.map((t) => {
		const aliases = t.aliases && t.aliases.length > 0 ? ` (also: ${t.aliases.join(', ')})` : '';
		const gender = t.gender === 'masculine' ? ' [masculine]' : t.gender === 'feminine' ? ' [feminine]' : '';
		const context = t.context ? ` — ${t.context}` : '';
		return `★${t.source}${aliases} = ${t.target}${gender}${context}`;
	});
	return `Glossary (${srcName} → ${tgtName}) — use these exact renderings for the listed terms, even when the context would suggest otherwise:
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

export function userPrompt(regions: RegionSource[], tgtLang = 'en'): string {
	const tgtName = languageName(tgtLang);
	const exampleEntries = regions
		.slice(0, 2)
		.map((r, i) => `"${r.id}": "${tgtName} translation ${i + 1}"`)
		.join(', ');
	const exampleJson = exampleEntries ? `{${exampleEntries}}` : `{"r0": "${tgtName} translation"}`;
	return `Translate the following regions of a comic/manhua page from source into ${tgtName} (${tgtLang}). Each entry has an id and the source text.

${regionPayload(regions)}

Key Guidelines:
- Clean OCR visual artifacts: strip trailing bubble-tail digits/dots (e.g. trailing numbers after sentence terminal punctuation) and remove stray unmatched bubble-border parentheses (e.g. leading "(" with no closing pair).
- Pronoun & Subject Resolution: Resolve omitted subjects accurately from page context without blindly defaulting to "I".
- Translate Handles & Usernames: Translate/localize all bracketed chat usernames into ${tgtName} (e.g. [Localized Username]: message). NEVER leave raw source characters inside [brackets].

Return a JSON object with:
- "translations": { ${exampleEntries || `"r0": "${tgtName} translation"`} } mapping each id exactly to its ${tgtName} translation. Every id must appear exactly once using the exact same id string as provided above.
- "newTerms" (optional): list of any new proper nouns, character names, locations, or martial arts/techniques appearing in these regions that are NOT already in the glossary with their ${tgtName} translation, e.g. [{"source": "叶凡", "target": "...", "category": "character", "gender": "masculine"}]. If none, use [] or omit.

MANDATORY: All translations in the JSON values MUST be strictly in ${tgtName} (${tgtLang}). Do NOT output in English unless the target is English. Alternatively, a flat JSON object ${exampleJson} is also accepted. No markdown fences.`;
}

export function buildMessages(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt(pair.sourceLang, pair.targetLang) },
	];
	const glossary = glossaryBlock(terms, pair.sourceLang, pair.targetLang);
	if (glossary) messages.push({ role: 'system', content: glossary });
	messages.push({ role: 'user', content: userPrompt(regions, pair.targetLang) });
	return messages;
}
