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
	pos?: string;
}

// -- FUNCTIONS -- //

export function getSourceLanguageProfile(src: string, tgtName: string): string {
	const primary = src.split('-')[0].toLowerCase();
	if (primary === 'ko') {
		return `Korean Manhwa & Murim Rules:
- Pro-Drop, Passive & Transitivity: Strictly distinguish intransitive/passive states from causative actions (죽다 "to die/perish" vs 죽이다 "to kill" -> "많이 죽긴 했어" = "Too many died", not "I killed many"; 인정받다 "to be recognized/acknowledged", 기대받다 "to have high hopes placed on one").
- Direct Address & Addressee Continuity: When addressing someone with kinship/honorific titles (형/오빠/누나/언니/도련님/아가씨/당신/너), maintain consistent 2nd-person address ("you") across linked dialogue clauses.
- Gender Clues & Lexical Anchors:
  * Masculine: 형 (hyung), 오빠 (oppa), 도련님, 사형 (senior martial brother), 사제 (junior martial brother), 아저씨 -> male (he/him).
  * Feminine: 누나 (noona), 언니 (unnie), 아가씨, 사저 (senior martial sister), 사매 (junior martial sister), 성녀 (Holy Maiden), 그녀 -> female (she/her).
  * Suffixes 놈 / 자식 / 새끼: Anchor to male (he/him) ONLY when referring to human characters. When paired with or referring to beasts, monsters, or animals (e.g. 괴물놈, 늑대 놈, 저 놈 / 이 놈 in monster combat), resolve strictly to "it / the beast / the creature", never human "he/him".
- Beasts, Monsters & Demonic Entities: Opponents described with creature terms (괴물, 마수, 요수, 영수, 짐승, 늑대, 마물) are non-human entities and must resolve to "it / its" or descriptive nouns (e.g. "It didn't feel a thing", "That monster"), not "he / him".
- Conversational Invitations: Common social phrases like "밥이나 먹으러 ... 와" (come over for a meal/hang out) are casual invitations, not commercial restaurant references.
- Murim & Organization Hierarchy:
  * Clans & Families: ~세가 (~世家, e.g. 남궁세가 -> Namgung Clan), ~가 (家, Clan), ~가장 (家莊, Clan Manor/Estate e.g. 유가장 -> Yu Clan Manor).
  * Sects & Factions: ~파 (派, Sect e.g. 화산파 -> Mount Hua Sect, 무당파 -> Wudang Sect, 소림사 -> Shaolin Temple), ~문 (門, Sect/Gate e.g. 당문 -> Tang Sect), ~방 (幇, Union/Gang e.g. 개방 -> Beggars' Sect), ~교 (敎, Cult e.g. 마교 -> Demonic Cult).
  * Halls & Pavilions: ~전 (殿, Hall/Palace), ~당 (堂, Hall), ~각 (閣, Pavilion).
  * Disciples & Ranks: 가주 (Clan Head), 장문인 (Sect Leader), 장로 (Elder), 사부 (Master/Teacher), 대사형 (Eldest Martial Brother), 사제 (Junior Martial Brother), 사매 (Junior Martial Sister).
- Martial Art Techniques & Calligraphy OCR: Stylized vertical martial arts technique names and stance callouts (e.g. ~창법 [Spear Art], ~검법 [Sword Art], ~신공 [Divine Art]) often have calligraphy strokes misrecognized as stray ASCII brackets/letters. Infer the correct martial technique name from constituent Hangul syllables and action context.
- Hangul OCR Confusion Recovery: Action and manhwa brush fonts frequently cause stroke confusions between visually similar jamo and syllables. For instance, initial 'ㅁ' vs 'ㅇ'/'ㅂ' (e.g. 뭣들 하고 있어 misread as 윗들 하고 있어 or 못들 하고 있어 -> reconstruct as 뭣들 하고 있어 "What are you doing / What are you all doing?!"), and similar vowel/coda stroke fusions. Always infer the intended idiomatic Korean dialogue from context rather than translating nonsensical OCR literal misreads.
- Combat & Action Command Target Resolution: In combat orders with omitted transitive objects (e.g. 떨어뜨려! "Shoot it down / Knock him down!", 잡아라! "Seize it / him!", 죽여라! "Kill it / him!", 쏴라! "Shoot!"), resolve the target object to the opposing combatant or beast tracked in preceding Dialogue Context (use "it" for beasts/monsters, "him/her" for human combatants, not "them"). Commanders order subordinates to attack the enemy intruder, never their own allied forces.
- Speech Levels: Maintain consistent conversational tone across sentence clauses (honorific/formal 존댓말 vs casual/intimate 반말).`;
	}

	if (primary === 'ja') {
		return `Japanese Manga & Light Novel Rules:
- Pro-Drop, Passive & Transitivity: Strictly distinguish intransitive/passive verbs from transitive/causative actions (落ちる/落とす, 消える/消す, 死ぬ/殺す). Do not mistranslate passive observations (期待される/期待されてる "having expectations placed upon one / how could anyone not expect great things", 頼りにされる "being relied upon") into active speaker desires ("I hope...").
- Direct Address & Addressee Continuity: When addressing someone directly (あなたなら..., 君なら..., [Name]なら..., あなたは違います), maintain 2nd-person ("you/your") across ALL subsequent evaluation, praise, and prediction bubbles in the speech turn ("if you continue to grow...", "summoning such an entity at age seven...", not "he").
- Self-Referential Character Titles: When a character refers to themselves poetically in the 3rd person (e.g. このメルアリアを抱ける -> "wield/embrace me, Melaria"), recognize it as 1st-person self-reference ("me, Melaria" or "this Melaria of mine").
- Stutters & Trailing Accusative Particles: When an emotional stammer ends with an accusative/case particle (e.g. "ア…アリアを…" -> "P-possess... Aria...?" / "A-Aria...?"), localize it as a flustered reaction rather than a cold isolated noun.
- Gender Clues & Lexical Anchors:
  * Masculine: 彼 (kare), 兄貴 (aniki), 坊主, ガキ, 爺さん, 旦那, おじさん, 野郎 -> male (he/him).
  * Feminine: 彼女 (kanojo), 姉貴 (aneki), お嬢様, 娘, 婆さん, おばさん, 小娘 -> female (she/her).
  * Demonstratives & Slang (やつ / あいつ / こいつ / 奴): Anchor to male (he/him) ONLY when referring to human characters. When referring to monsters, magical beasts, summons, or animals (e.g. 化け物, 魔獣, 怪物, 獣, 魔物), resolve strictly to "it / the beast / the monster", never human "he/him".
- Beasts, Monsters & Summons: Opponents described as non-human creatures (化け物, 魔獣, 妖獣, 怪物, 魔物, 獣) must resolve to "it / its" or descriptive nouns ("the beast", "the creature"), not "he / him", unless explicitly anthropomorphized.
- Clan, School & Organization Terminology:
  * Clans & Lineage: ~一族 (~Ichizoku, Clan/Tribe), ~家 (~Family/Clan), 本家 (Honke, Main Family/Branch), 分家 (Bunke, Branch Family).
  * Martial Schools & Sects: ~流 (~Ryū, School/Style e.g. 神道流 -> Shintō-ryū), ~宗派 (~Shūha, Sect), ~道場 (Dōjō, Training Hall/Dojo), ~組 (~Gumi, Clan/Syndicate).
  * Guilds & Conglomerates: 財閥 (Zaibatsu, Financial Conglomerate), ギルド (Guild).
- Honorifics: Preserve or adapt honorifics (-san, -kun, -chan, -sama, senpai, sensei, kouhai) according to speaker personality, hierarchy, and relationship.
- Visual Kanji/Kana Recovery: Reconstruct visually similar Kanji/Kana OCR stroke confusions (e.g. 盲↔育, 友↔反, バ↔パ↔ハ, ク↔ワ, ツ↔シ, ソ↔ン) from context.`;
	}

	if (primary === 'zh') {
		return `Chinese Manhua, Wuxia & Xianxia Rules:
- Pro-Drop & Transitivity: Distinguish passive/intransitive states (died/broke, 被/受) from active actions (killed/destroyed). Never convert an impersonal observation into a causative first-person action.
- Direct Address & Addressee Continuity: When addressing someone directly (你, 阁下, 兄台, 姑娘, 道友), maintain 2nd-person ("you") throughout consecutive linked dialogue bubbles.
- Gender Clues & Lexical Anchors:
  * Masculine: 他 (ta), 师兄, 师弟, 少爷, 臭小子, 老夫, 壮士, 兄弟, 岳父, 伯父, 殿下 (prince/lord) -> male (he/him).
  * Feminine: 她 (ta), 师姐, 师妹, 小姐, 丫头, 姑娘, 圣女, 仙子, 娘亲, 夫人, 嫂子 -> female (she/her).
  * Creature & Derogatory Pronouns (这家伙 / 那家伙 / 畜生 / 孽畜): Resolve to "it / the beast / the creature" when referring to beasts, monsters, or demonic creatures (妖兽, 魔兽, 凶兽, 灵兽, 异兽), never human "he/him".
- Beasts, Monsters & Demonic Creatures: Non-human cultivators, demonic beasts, and monsters (妖兽, 魔兽, 凶兽, 异兽, 孽畜) resolve to "it / its" (e.g. "It didn't flinch", "Kill the beast!"), not human "he / him", unless transformed into human form or speaking with human personality.
- Hanzi OCR Stroke Recovery: Correct common visually similar character stroke confusions (e.g. 拔↔拨, 己↔已↔巳, 崇↔祟, 治↔冶, 呜↔鸣, 未↔末, 刺↔剌) by inferring intended terms from story and martial context.
- Names & Listings:
  * Separate 2-character names in multi-name sequences (e.g. "子龙童菲，张肥关鱼" -> "Zilong, Tong Fei, Zhang Fei, Guan Yu").
  * Recognize homophone/parody names (e.g. 张肥 for 张飞) as character names.
  * Translate military division titles (e.g. 龙字军, 虎字营) into ${tgtName} divisions.
- Wuxia, Xianxia & Cultivation Hierarchy:
  * Clans & Estates: ~世家 (Great Clan/Family e.g. 南宫世家 -> Namgung Clan), ~家庄 (Clan Manor e.g. 刘家庄 -> Liu Clan Manor), ~山庄 (Mountain Villa/Estate), ~堡 (Fortress/Manor).
  * Sects & Lineages: ~门派 / ~派 (Sect e.g. 华山派 -> Mount Hua Sect, 武当派 -> Wudang Sect, 少林寺 -> Shaolin Temple), ~宗 (Sect/Clan e.g. 天宗 -> Heaven Sect), ~门 (Sect/Gate e.g. 唐门 -> Tang Sect), ~帮 (Sect/Gang e.g. 丐帮 -> Beggars' Sect), ~教 (Cult e.g. 魔教 -> Demonic Cult).
  * Divisions & Roles: ~堂 (Hall e.g. 执法堂 -> Law Enforcement Hall), ~阁 (Pavilion e.g. 藏经阁 -> Scripture Pavilion). 掌门 (Sect Leader), 家主 (Clan Head), 长老 (Elder), 师尊/师父 (Master), 师兄 (Senior Martial Brother), 师弟 (Junior Martial Brother), 师姐 (Senior Martial Sister), 师妹 (Junior Martial Sister), 徒儿 (Disciple).
  * Martial World: 江湖 (Jianghu / Martial World), 武林 (Wulin). Localize archaic martial pronouns (本座, 老夫, 晚辈, 在下, 贫道, 本王, 本宫, 妾身) naturally into ${tgtName}.
- Stat Panels & RPG UI:
  * Only use [brackets] if source explicitly has 【】 brackets.
  * Translate rarity tiers (LEGENDARY, EPIC, RARE, COMMON, MYTHIC) fused with item type.
  * Keep parenthetical qualifiers on their own line with ().`;
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

export function getTargetLanguageProfile(tgt: string): string {
	const primary = tgt.split('-')[0].toLowerCase();

	if (primary === 'en') {
		return `English Target Rules:
- Reaction Punctuation: Convert reaction punctuation (……, ？！, !) to natural English (..., ?!, !).
- Bracketed Usernames: Translate all bracketed livestream/game usernames [Username]: into English.
- Bilingual Title Logos: When a title or cover contains both a native title and an accompanying decorative/official English subtitle (e.g. "星魂将传\\nLEGEND OF STAR GENERAL"), deduplicate them into a single clean English title ("Legend of Star General").
- Punctuation Restraint: Minimize em dashes (—), semicolons (;), and colons (:). Spoken dialogue should avoid semicolons and colons; use commas, periods, or separate sentences instead. Reserve colons strictly for RPG stat screens, UI labels, or timestamps. Use ellipses (...) for trailing thoughts, and reserve em dashes strictly for hard cutoffs or sudden interruptions.`;
	}

	if (['es', 'fr', 'it', 'pt'].includes(primary)) {
		return `Romance Target Rules (${primary.toUpperCase()}):
- Grammatical Gender Agreement: Ensure adjectives, past participles, and pronouns agree strictly with the speaker/addressee gender established in the Glossary or Dialogue Context. For beasts and monsters, grammatical agreement follows the creature noun (e.g. Spanish el monstruo / la bestia, French le monstre / la bête).
- T-V Register: Map formal/honorific source speech to polite address (usted / vous / Lei / o senhor) and casual speech to informal (tú / tu / tu / você). Maintain consistent address within each dialogue scene.
- Elisions & Contractions: Apply natural grammatical contractions (French: l', d', qu'; Spanish: al, del).`;
	}

	if (['ru', 'uk', 'pl'].includes(primary)) {
		return `Slavic Target Rules (${primary.toUpperCase()}):
- Past Tense Verb & Participle Gender: Past tense verbs inflect for gender (e.g. -л vs -ла in Russian). Match the gender of the speaker/subject strictly. For beasts and monsters, verbs and participles agree with the grammatical gender of the creature noun (e.g. чудовище -> neuter -ло, зверь/волк -> masculine -л).
- T-V Register: Map formal/honorific source speech to Вы / Pan/Pani, and informal to ты / ty.`;
	}

	if (primary === 'de') {
		return `German Target Rules (DE):
- Noun Capitalization: All nouns and nominalized verbs MUST be capitalized.
- Politeness: Map formal source speech to "Sie" (capitalized) and informal to "du/ihr".`;
	}

	return '';
}

export function systemPrompt(
	src: string,
	tgt: string,
	sfxMode: 'translate' | 'ignore' | 'source' | boolean = 'ignore',
	customPrompt?: string | null,
): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	const srcProfile = getSourceLanguageProfile(src, tgtName);
	const tgtProfile = getTargetLanguageProfile(tgt);

	const sfxDirective = `Focus translations strictly on speech dialogue bubbles, thought clouds, narration boxes, and UI panels. Omit or ignore ambient background sound effect regions.`;

	const coreInvariants: string[] = [
		`1. Target Language & Zero Leakage: ALL translations and context descriptions MUST be strictly in ${tgtName} (${tgt}). Never leave raw source characters (Hanzi/Hangul/Kanji/Cyrillic) in the output.`,
		`2. Strict 1:1 Region Mapping: Every input region ID must have exactly one corresponding translation in the "translations" map. You must translate ALL input IDs: no more, no less. Never merge regions, split regions, or omit any region ID.`,
		`3. Positive Identity & Pronoun Disambiguation:`,
		`   - Ban on Ambiguous Singular "They/Them": NEVER use singular "they/them/their" as a hedge for an individual character. Reserve "they/them" strictly for plural groups, mobs, or multiple individuals.`,
		`   - Gender & Pronoun Locking: Once a character or speaker's gender is established (via Glossary [masculine]/[feminine], honorifics, or preceding dialogue context), strictly maintain matching pronouns (he/him/his vs. she/her/hers) across all subsequent bubbles and pages. Never switch gender mid-scene.`,
		`   - Beasts, Monsters, Animals & Non-Human Entities: When referring to non-human adversaries, beasts, magical/spirit beasts, summons, monsters, or wild animals (e.g. wolves, dragons, 괴물, 魔物, 妖兽, 化け物), resolve pronouns strictly to "it / its" or descriptive nouns ("the beast", "the creature", "the monster"), NEVER human "he / him" or "she / her", unless the creature is explicitly anthropomorphized, speaks human dialogue, or possesses a confirmed human gender in the Glossary.`,
		`   - Scene Monologue & Direct Address Scope: When a character (Speaker A) addresses or marvels at another character (Speaker B) in a 1-on-1 scene (e.g. "あなた/君", "あなたは違います", "あなたなら..."), ALL subsequent praises, assessments, and predictions in that speech turn MUST remain in the second person ("you / your"), NOT third person ("he / she"). Never flip to "he/she" simply because downstream bubbles lack an explicit "you" or are separated by other visual panels.`,
		`   - Interleaved Speech vs. Inner Monologue Streams: When a scene alternates between an external speaker's monologue (formal/narrative speech evaluating abilities or status) and a listener's inner thoughts (informal reactions, panic, or realizations):`,
		`     * The external speaker's stream MUST remain strictly in 2nd person ("you / your"), praising or evaluating the listener directly ("Summoning such an entity at age seven...", "If you continue to grow..."). Do NOT let the listener's interspersed 1st-person thoughts cause the speaker's surrounding dialogue to flip into 3rd person ("he / she").`,
		`     * Spoken praise/evaluation text without speech balloon borders (e.g. "天から授かった才能… 期待されるしかない…") belongs to the external speaker ("A heavenly talent... high expectations are only natural / how could anyone not expect great things from you?"), NOT the listener's internal voice.`,
		`   - Floating Dialogue vs. Reaction Attribution: In close-up reaction panels, floating text without bubble borders continues the ongoing speaker's spoken monologue, whereas internal panic/SFX text belongs to the listener's internal thought (e.g. "This is bad...!!"). Never merge or attribute the speaker's dialogue to the listener, and never invert passive statements into active first-person wishes.`,
		`   - Pro-Drop & Subject/Object Resolution: In dialogue where the subject or transitive object is omitted:`,
		`     * Internal Thoughts ([Thought] regions) -> resolve zero-subject as first-person ("I / me / my") or direct self-talk ("you"), never generic third-person.`,
		`     * Direct Face-to-Face Dialogue -> resolve zero-subject imperative, questions, or address to the listener as second-person ("you"), and declarative self-actions/states as first-person ("I / me").`,
		`     * Combat Orders & Target Directives -> resolve omitted target objects in attack orders (e.g. "Take him down!", "Shoot it down!", "Kill it!") to the opposing adversary or beast tracked in Dialogue Context (use "it" for monsters/beasts/creatures, "him/her" for human combatants), rather than defaulting to generic "them" or confusing the speaker's own group.`,
		`     * 1-on-1 Passive Observations (e.g. "期待されてる", "見られてる") -> resolve the active party directly to their established gender ("She expects so much of me!", "He's watching me!"), not generic "They".`,
		`     * If describing an ongoing scene -> resolve the subject from the active scene context rather than defaulting to generic pronouns.`,
		`   - Baby & Child References: When characters refer to or scold an infant/child, use natural direct address ("you little rascal", "look at you") or familial phrasing ("the baby", "the little one", "she/he"). Never use stilted singular "they/them" for affectionate family interactions.`,
		`4. Spoken Comic Register & Bubble Geometry:`,
		`   - Write punchy, natural spoken ${tgtName} dialogue suitable for comic voice acting in standard sentence case (never ALL-CAPS).`,
		`   - Line Breaks: Do NOT blindly copy source OCR line breaks. Re-flow target text into visually balanced, centered lines (inverted pyramid / diamond layout) suited for comic speech bubbles. Preserve \\n only between distinct stanzas, separate thoughts, or UI lists.`,
		`   - Punctuation Restraint (Dashes, Semicolons & Colons): Avoid overusing em dashes (—), semicolons (;), or colons (:). Spoken dialogue rarely uses semicolons or colons; use commas, periods, or natural sentence splits instead. Reserve colons strictly for RPG stat screens, UI labels, or timestamps. For trailing thoughts, pauses, or hesitations, use ellipses (...). For clauses and parentheticals, use commas or natural sentence splits. Reserve em dashes (or double hyphens) strictly for abrupt mid-word or mid-sentence cutoffs when a character is suddenly interrupted or cut off by action.`,
		`5. Sound Effects (SFX) Policy:`,
		`   - ${sfxDirective}`,
		`6. Split-Bubble Continuity:`,
		`   - When a continuous sentence spans multiple consecutive speech bubbles:`,
		`     * Place trailing ellipses (...) on the preceding bubble.`,
		`     * Begin the succeeding bubble in lowercase continuation without repeating subjects or conjunctions.`,
		`     * Subject & Person Lock: Succeeding continuation bubbles MUST maintain the exact same grammatical person, subject, and tone established in the preceding bubble.`,
		`7. Mandatory Glossary Adherence (Zero Deviation):`,
		`   - The project Glossary provided in the system messages contains authoritative terminology overrides. Whenever a source term (or its alias) appears in dialogue, you MUST use its EXACT specified target translation verbatim. Never substitute with dictionary synonyms, alternate spellings, or grammatical variations.`,
		`8. Semantic Noise Rejection (OCR Typo & Scream Recovery):`,
		`   - When comic action screams, groans, or shouts have strokes degraded by OCR into artifact numbers, punctuation, or stray letters (e.g. "아\\n11\\n!"), reconstruct the natural vocalization (e.g. "Aaaargh!!", "Gwaaaah!!", "Uwaaaah!!").`,
		`   - Strip rogue border artifacts, spurious intra-word spaces, stray border symbols (| / \\ ~ [ ] o] c]), and circular thought-bubble tails ("oo", "...").`,
		`   - Do NOT turn legitimate alphanumeric UI elements, dates, or stat levels into screams.`,
		`9. Output Schema: Reply with ONLY a valid JSON object matching the requested schema. No commentary, no markdown fences.`,
	];

	const outputSchemaSection = `### IV. OUTPUT SCHEMA AND FORMAT REQUIREMENTS
1. Return a valid JSON object containing two top-level keys: "translations" and "newTerms".
2. Strict 1:1 Region Mapping in "translations": You MUST provide a translation for EVERY provided input region ID. Exactly one translation per ID: no more, no less. Do not skip or omit any region.
3. Target Language: ALL translation values and context descriptions MUST be strictly in ${tgtName} (${tgt}). Never leave raw source characters.
4. Mandatory Glossary Compliance (Zero Deviation): For every term listed in the project Glossary, you MUST use the EXACT target translation string verbatim whenever its source characters appear in any region. Do NOT re-translate, synonymize, or alter Glossary terms.
5. Mandatory Glossary Extraction in "newTerms": Extract ALL new character names, proper nouns, locations, sects/organizations, martial arts, cultivation tiers, items, artifacts, and disciple/official ranks appearing on this page that are NOT already in the glossary.
   - High-Recall & Exhaustive Hierarchy Directive: Be thorough and extract as many valid story terms, names, and techniques as possible. When a page introduces a hierarchy, ladder, or diagram of disciple ranks, cultivation stages/realms, or sect titles, extract EVERY individual rank/tier as a separate entry in "newTerms".
   - Headword-Only Anti-Duplicate Rule: Only skip a term if its exact source characters or aliases are ALREADY an explicit headword (prefixed with ★) in the project Glossary. Mentioning a word in another term's description context does NOT count as an existing entry. If a term does not have its own ★ headword entry, it MUST be extracted.
   - For every new term, provide its source, target translation, category, gender, aliases (e.g. ["小凡"] or []), and a 1-sentence context description.
   - If there are no new terms appearing on this page, output an empty array: "newTerms": [].
6. Output JSON Structure:
{
  "translations": {
    "<id>": "<${tgtName} translation of <id>>"
  },
  "newTerms": [
    {
      "source": "<exact source characters from page>",
      "target": "<natural ${tgtName} translation>",
      "category": "character | location | organization | technique | item | realm | title | concept | other",
      "gender": "masculine | feminine | neuter",
      "aliases": ["<nickname or short form>"],
      "context": "<brief 1-sentence description in ${tgtName}>"
    }
  ]
}

No markdown fences, no commentary. Output ONLY the JSON object.`;

	const sections = [
		`You are an expert comic, manga, and webtoon localizer translating ${srcLabel} dialogue, narration, and UI into natural, punchy, and immersive ${tgtLabel} tailored for comic voice acting and speech balloon typesetting.`,
		`### I. UNIVERSAL CORE INVARIANTS\n${coreInvariants.join('\n')}`,
	];

	if (srcProfile) sections.push(`### II. ${srcName.toUpperCase()} SOURCE SPECIFICS\n${srcProfile}`);
	if (tgtProfile) sections.push(`### III. ${tgtName.toUpperCase()} TARGET SPECIFICS\n${tgtProfile}`);
	if (customPrompt && customPrompt.trim().length > 0) {
		sections.push(`### SPECIAL USER LOCALIZATION DIRECTIVES\n${customPrompt.trim()}`);
	}
	sections.push(outputSchemaSection);

	return sections.join('\n\n');
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
			if (r.pos) {
				item.pos = r.pos;
			}
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
	pageTermsBlock?: string | null,
): string {
	const tgtName = languageName(tgtLang);
	const count = regions.length;
	const idList = regions.map((r) => `"${r.id}"`).join(', ');
	const contextHeader = dialogueContextBlock ? `${dialogueContextBlock.trim()}\n\n` : '';
	const vocabHeader = pageTermsBlock ? `${pageTermsBlock.trim()}\n\n` : '';

	return `${contextHeader}${vocabHeader}Translate the following comic page regions into ${tgtName} (${tgtLang}) and extract all new glossary terms:

=== REGIONS TO TRANSLATE (Count: ${count}) ===
Region IDs: [${idList}]
${regionPayload(regions)}

Translate all ${count} region IDs into ${tgtName} and extract any new terms into "newTerms" following the system schema. Output ONLY the JSON object.`;
}

export function buildMessages(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	dialogueContext?: DialogueContextWindow | null,
	pageTermsOrSfxMode?: TermDraft[] | 'translate' | 'ignore' | 'source' | boolean,
	pageTermsParam?: TermDraft[],
	customPrompt?: string | null,
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const pageTerms = Array.isArray(pageTermsOrSfxMode) ? pageTermsOrSfxMode : pageTermsParam;
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt(pair.sourceLang, pair.targetLang, 'ignore', customPrompt) },
	];
	const glossary = glossaryBlock(terms, pair.sourceLang, pair.targetLang);
	if (glossary) messages.push({ role: 'system', content: glossary });

	const contextBlock = formatDialogueContextBlock(dialogueContext);
	const pageTermsBlock = pageTerms && pageTerms.length > 0 ? glossaryBlock(pageTerms, pair.sourceLang, pair.targetLang) : null;
	messages.push({ role: 'user', content: userPrompt(regions, pair.targetLang, contextBlock, pageTermsBlock) });
	return messages;
}
