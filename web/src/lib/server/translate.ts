// MANHUA PAGE TRANSLATION — ADAPTED FROM xianslate's translate.ts (SAME GLOSSARY-BLOCK + SYSTEM-MESSAGE
// PATTERN), BUT THE UNIT OF WORK IS A *PAGE OF REGIONS* INSTEAD OF A CHAPTER OF PARAGRAPHS: THE MODEL
// RECEIVES THE REGION LIST AS JSON AND RETURNS A {regionId: translation} OBJECT.
//
// PROMPT STRUCTURE (PINS THE FORMAT THE TESTS VERIFY):
//   [system]   manhua-localization system prompt (tone, SFX rules, no annotations)
//   [system]   glossary block (★source (also: a, b) = target [gender] — context) — ONLY WHEN TERMS EXIST
//   [user]     JSON region list {id, text} + output contract (raw JSON object, no fences)
//
// ROBUSTNESS: SALVAGE JSON PARSING, MISSING/EMPTY/DEGENERATE REGIONS GET ONE REFILL CALL, USAGE FROM
// THE API RESPONSE (computeUsage), ALL LLM CALLS GO THROUGH queued() + withRetry().
import type { LangPair, TermDraft, TranslationUsage } from '$lib/types';
import type OpenAI from 'openai';
import { languageName } from '$lib/languages';
// IMPORTED MODULES
import { computeUsage, createClient, queued, resolveModel, stripThinkingTags, thinkingParam, withRetry } from './llm';

export interface RegionSource {
	id: string;
	text: string;
}

export interface PageTranslationOptions {
	/** INJECTABLE CLIENT — TESTS PASS A FAKE; DEFAULT IS THE PRODUCTION SINGLETON. */
	client?: OpenAI;
	model?: string;
	signal?: AbortSignal;
}

export interface PageTranslation {
	byRegion: Map<string, string>;
	usage: TranslationUsage;
	newTerms?: TermDraft[];
}

// -- CONSTANTS -- //

// PART OF THE CACHE KEY — BUMP WHEN THE PROMPTS CHANGE SO STALE CACHED TRANSLATIONS NEVER RESURFACE.
export const PROMPT_VERSION = 'v15';

// A TRANSLATION LONGER THAN 6× THE SOURCE IS ALMOST CERTAINLY THE MODEL REWRITING THE PROMPT / ADDING
// EXPLANATIONS — FLAGGED FOR A REFILL (SAME HEURISTIC AS xianslate's looksOverExpanded).
const MAX_EXPANSION = 6;

// -- PROMPTS -- //

export function systemPrompt(src: string, tgt: string): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	return `You are a professional comic (manhua/manga/manhwa/bande dessinée/historietas) localizer translating ${srcLabel} dialogue into natural, fluent, and immersive ${tgtLabel}.

Conversation & Dialogue Style:
- Conversational Flow: Write natural spoken dialogue as real characters speak in comics. Use natural contractions (I'm, don't, you're, can't, he'll, what's, let's) and lively phrasing suitable for voice acting. Avoid stiff, robotic, or overly literal translations.
- Tone & Character Personality: Reflect the speaker's personality, emotion, age, and social standing (e.g. arrogant young masters, wise masters, energetic protagonists, stern villains, flustered heroines, playful sidekicks).
- Wuxia / Xianxia / Cultivation Dialogue & Idioms:
  * Localize common Chinese idioms into punchy, idiomatic ${tgtName}:
    - 找死！ → "You're asking for death!" / "You have a death wish!"
    - 好大的胆子！ → "How dare you!" / "What insolence!"
    - 手下留情！ → "Show mercy!" / "Spare him!"
    - 雕虫小技！ → "Trifling tricks!" / "Child's play!"
    - 休想！ → "In your dreams!" / "Don't even think about it!"
    - 废话少说！ → "Cut the crap!" / "Save the talk!"
    - 多管闲事！ → "Mind your own business!" / "Meddlesome pest!"
    - 井底之蛙！ → "A frog in a well!"
  * Naturally preserve martial and kinship forms of address:
    - 师尊 / 师父 → Master / Shifu
    - 师兄 / 师姐 / 师弟 / 师妹 → Senior Brother / Senior Sister / Junior Brother / Junior Sister
    - 掌门 / 宗主 → Sect Leader / Patriarch
    - 前辈 / 阁下 → Senior / Your Excellency
    - 本座 / 本王 / 老子 / 本少 → This Seat / This King / I / Yours truly / This Young Master
    - 臭丫头 / 臭小子 → Brat / Little rascal
- Culture-Specific Comic Translation Guidelines:
  * 🇫🇷 French (Bande Dessinée - BD):
    - Respect *tu* (informal/peers/friends) vs *vous* (formal/respect/nobles) social distance.
    - Translate comic slang and exclamations naturally (e.g. *Mince!*, *Zut!*, *Dis donc!*).
    - BD Sound effects in ALL-CAPS: *BOUM!*, *PAN!*, *CLAC!*, *VROUM!*, *SPLATCH!*, *TCHAC!*, *CRAC!*.
  * 🇪🇸 Spanish (Historietas / LATAM / Tebeos):
    - Distinguish *tú* (casual/friends) vs *usted* (elders/formal) vs *vos* (LATAM regional when fitting).
    - Use natural inverted exclamation and question marks where standard: *¡...!*, *¿...?*.
    - Comic Sound effects: *¡PUM!*, *¡CRAC!*, *¡ZAS!*, *¡PLAF!*, *¡BOOM!*, *¡CLIC!*, *¡TOC-TOC!*.
  * 🇮🇩 Indonesian (Komik Webtoon):
    - Adapt speech registers: *Gue/Lu* (casual Jakarta/webtoon urban), *Aku/Kamu* (intimate/warm), *Saya/Anda* (formal/court).
    - Seamlessly integrate natural conversational particles: *-kan*, *-lah*, *-deh*, *dong*, *sih*, *kok*.
    - Indonesian SFX in ALL-CAPS: *DOR!*, *BUM!*, *DUK!*, *KRAK!*, *WUSH!*, *SYUT!*, *JEGERR!*.
  * 🇻🇳 Vietnamese (Truyện Tranh):
    - Rigorously map hierarchical pronouns based on age/status: *Anh/Em*, *Chị/Em*, *Huynh/Đệ*, *Sư phụ/Sư huynh*, *Mày/Tao* (hostile/casual), *Ta/Ngươi* (historical/martial).
    - Natural Sino-Vietnamese cultivation terms and martial arts idioms.
    - Vietnamese SFX in ALL-CAPS: *RẦM!*, *BỐP!*, *BÙM!*, *XOẢNG!*, *CHOẢNG!*, *VÚT!*, *PHẬP!*.
  * 🇷🇺 Russian (Комиксы / Bubble):
    - Distinguish *ты* (informal/peers) vs *Вы* (formal/seniors).
    - Russian comic onomatopoeia in Cyrillic ALL-CAPS: *БАМ!*, *БУМ!*, *ХРЯСЬ!*, *ВЖУХ!*, *ДЗЫНЬ!*, *ЩЁЛК!*, *ТЫК!*, *ГРОХОТ!*.
  * 🇹🇭 Thai (Webtoons TH):
    - Preserve polite particles (*ครับ/ค่ะ*) and relational pronouns (*พี่/น้อง*, *เจ้า/ข้า* in historical).
    - Thai SFX: *ตู้ม!*, *ฟึ่บ!*, *เปรี้ยง!*, *ผัวะ!*, *แกร๊ก!*, *ควับ!*.
- Bubble Space & Brevity: Comic speech bubbles have limited space. Keep dialogue concise, punchy, and impactful without dropping meaning.
- Categories:
  * dialogue: Natural spoken conversation with character voice and emotion.
  * mono: Inner thoughts, reflections, or narration in a smooth, introspective tone.
  * sfx: Comic onomatopoeia in ALL-CAPS (e.g. 轰 → BOOM!, 呼 → WHOOSH!, 唰 → SWOOSH!, 砰 → THUD!, 咔嚓 → CRACK!, 哐当 → CLANG!).
  * other: UI, system prompts, stat cards, or narrator captions.

Pronouns, Omitted Subjects & Spoken Dialogue Perspective:
- Omitted Subject (Pro-Drop) Resolution: In comic dialogue where the source language drops the subject/pronoun, default to direct conversational address ("You" / "I" / "We") or active imperatives rather than inventing an arbitrary 3rd-person pronoun ("he" / "she"):
  * Questions & Commands: "去哪了？" / "どこ行ってた？" / "어디 갔었어?" → "Where did you go?" (NOT "Where did he go?")
  * Urgency & Warnings: "快跑！" / "逃げろ！" / "도망쳐!" → "Run!" / "Get out of here!"
  * Self-defense / Distress: "别管我！" / "構うな！" / "날 내버려 둬!" → "Don't worry about me!" / "Leave me alone!"
- Passive & Reflexive Team Expressions:
  * Expressions like "中计了！" (ZH) / "やられた！" (JA) / "당했다！" (KO) represent reflexive reaction to an ambush or attack. Translate as active team distress: "We've been hit!" / "It's a trap!" / "Damn it!" (NEVER literal passive forms like "I was suffered").
- Gender & Relationship Anchoring:
  * Chinese (ZH): Feminine anchors (师姐/师妹, 圣女, 仙子, 姑娘, 丫头 → she/her); Masculine anchors (师兄/师弟, 圣子, 少爷, 兄弟, 臭小子 → he/him).
  * Japanese (JA):
    - First-person pronouns reveal speaker persona: 俺 (Ore / rough male), 僕 (Boku / polite male), 私 (Watashi / neutral-polite), あたし (Atashi / casual female), 拙者 (Sessha / samurai).
    - Particles & Honorifics: 〜わ/〜かしら (feminine tone), 〜ぜ/〜ぞ (masculine tone), 〜じゃ/〜のう (elder tone); -san, -kun, -chan, -sama, -senpai, -sensei.
  * Korean (KO):
    - Relational address reveals speaker & listener gender: 형 (Hyung: male to older male), 오빠 (Oppa: female to older male), 누나 (Noona: male to older female), 언니 (Unnie: female to older female), 선배님 (Sunbae-nim: Senior), 아가씨 (Agassi: Young Lady), 도련님 (Doryeon-nim: Young Master), 헌터님 (Hunter-nim).
    - Speech levels: 존댓말 (polite/formal) vs 반말 (casual/blunt) should be mirrored in target phrasing.
- Ambiguous 3rd-Person Referents: When a referent's gender is completely unknown and unmentioned in the panel context, use gender-neutral phrasing ("that person", "that guy", "they", or the character's title/name) rather than blindly guessing.

Comic Sound Effects (SFX) & Action Onomatopoeia:
- Isolated Action Sounds: Single or short repeated characters without sentence punctuation (e.g. 哒, 嗒, 啪, 咚, 咚咚, 哐, 哐当, 嗖, 唰, 砰, 嘭, 咔, 咔嚓, 轰, 轰隆, 嘶, 呼, 哧, 嗡, 踏, 铛) represent action sound effects (SFX), footsteps, landings, impacts, swings, or movements.
- NEVER convert isolated SFX characters into ellipses ("..."), pauses, or empty strings.
- Render all SFX into concise, punchy ALL-CAPS ${tgtName} onomatopoeia:
  * 哒 / 嗒 → TAP! / STEP! / CLACK! (footsteps, landing on branch/ground, light tap)
  * 啪 → SNAP! / SLAP! / CLAP!
  * 咚 / 哐 → THUD! / BOOM! / CLANG!
  * 嗖 / 唰 → SWOOSH! / SWISH! / DASH!
  * 砰 / 嘭 → BANG! / THUD! / POW!
  * 咔 / 咔嚓 → CLICK! / CRACK! / SNAP!
  * 轰 / 轰隆 → BOOM! / RUMBLE!
  * 呼 / 哧 → WHOOSH! / HUFF! / GASP!
  * 嘶 → HISS! / GASP!
  * 嗡 → HUM! / BUZZ!
  * 踏 → STEP! / STOMP!

Character Names, Roster Listings & Pinyin Segmentation:
- Single & Multi-Character Given Name Fusion:
  * In Chinese personal names, 2-character given names (名) and courtesy names (字) must ALWAYS be fused into a single capitalized word without spaces, whether the surname is present or omitted:
    - Full name: 陈北玄 → "Chen Beixuan" | Standalone given name: 北玄 → "Beixuan" (NEVER "Bei Xuan")
    - Full name: 诸葛孔明 → "Zhuge Kongming" | Standalone courtesy name: 孔明 → "Kongming" (NEVER "Kong Ming")
    - Full name: 萧炎 → "Xiao Yan" | Standalone / Diminutive: 炎儿 → "Yan'er"
    - With prefixes, suffixes & titles: 尘哥 → "Brother Chen", 小北玄 → "Xiao Beixuan" / "Little Beixuan", 北玄师弟 → "Junior Brother Beixuan" (NEVER "Bei Xuan")
  * Consistency: Always use the exact same fused romanized spelling for a character when addressed by their given name, nickname, or full name.
- Dense / Unpunctuated Multi-Name Series (Rosters, Battle Orders, Roll Calls):
  * In military orders, roster listings, and dialogue, multiple character names are frequently written back-to-back with minimal or no punctuation.
  * Segment each individual person before translating:
    - 2+2 name series: "子龙童菲" represents TWO separate persons "Zilong" and "Tong Fei" (NOT "Zilong Tongfei").
    - 3+2+2 name series: "陈北玄林动萧炎" represents THREE separate persons "Chen Beixuan, Lin Dong, and Xiao Yan".
    - 4-character compound surnames: "诸葛孔明司马懿" represents TWO persons with compound surnames "Zhuge Kongming and Sima Yi" (NOT "Zhuge, Kongming, Sima, Yi").
    - 1+1+1 abbreviations: "刘关张" represents THREE leaders "Liu, Guan, and Zhang" (NOT one compound person "Liu Guanzhang").
  * Action verbs vs. names: Separate command verbs (命, 召, 带, 率, 派, 战, 破) from the names themselves (e.g. "命子龙童菲出战！" → "Order Zilong and Tong Fei to march out!").
  * When translating name series, render all individuals clearly separated with proper punctuation and conjunctions (e.g. "子龙童菲，张肥关鱼" → "Zilong, Tong Fei, Zhang Fei, and Guan Yu").
- Parody, Homophone & OCR Typo Names: In comedic, parody, or OCR'd manhua, character names may appear as homophones or humorous variants (e.g. 张肥 for 张飞 / Zhang Fei, 关鱼 for 关羽 / Guan Yu). Recognize these as individual character names rather than literal common nouns ("fat", "fish") and translate them cleanly as names.
- Military Unit & Army Division Titles: In war, military, or historical manhua, army divisions, brigades, or squads named after characters/monikers (e.g. 龙字军, 肥字军, 鱼字军, 虎字营, 豹字部) represent legitimate in-universe armed forces (e.g. "The Long Army / Dragon Division", "The Fei Army / Fat Division", "The Yu Army / Fish Division"). ALWAYS translate them.

Story Narration, Sketch Captions & Incomplete Fragments:
- Floating Comic Art Captions: Handwritten text floating on illustrations, parchment, or battle plan sketches (e.g. "龙字军夜袭“黑风寨”", "肥字军剿灭水贼“混江龙”", "鱼字军剿灭……") is essential story narrative. ALWAYS translate it.
- Incomplete / Cut-off Phrases: If a story caption or dialogue is cut off or incomplete at the edge of the panel (e.g. "鱼字军剿灭"), translate the partial phrase with a natural trailing ellipsis (e.g. "The Yu Army wipes out..."). NEVER drop incomplete sentences or return empty strings for story text.

Punctuation & Reaction Bubbles:
- NEVER invent or use em-dashes (— or --) for pauses, thinking, or sentence breaks. Use natural commas (,), periods (.), or ellipses (...) matching the source punctuation.
- Character Speech & Reaction Bubbles: If a dialogue region contains ellipses, exclamation marks, question marks, or reaction punctuation (e.g. "……", "……！", "……？", "？！", "！", "？"), ALWAYS translate it to natural ${tgtName} punctuation (e.g. "...", "...!", "...?", "?!", "!", "?"). Do NOT return an empty string for character speech or pause bubbles!
- Spoken Pauses: Preserve ellipses in spoken pauses (e.g. "你……是李婉儿，" → "You... are Li Wan'er,").
- Only output a dash if the original source text explicitly contains a dash/hyphen.

Watermark & Scanlation Tag Filtering:
- Piracy Watermarks & Aggregator Ads: If a text region is STRICTLY a third-party pirate watermark, scanlation group recruitment ad, website URL/domain, aggregator watermark, scanlation QQ/Discord group, or uploader logo (e.g. BaoziManhua, Colamanga, Qumanku, 速漫库, 包子漫画, "扫图", "汉化组招募", "严禁转载", "独家", "修图", "首发", etc.), return an EMPTY STRING "" for its id.
- Story Text is NOT a Watermark: In-universe military forces (龙字军, 肥字军, 鱼字军), bandit fortresses (黑风寨), location names, or character sketch captions are NOT watermarks. NEVER filter them out.
- Official Comic Staff & Production Credits: ALWAYS TRANSLATE official manga/manhua author, artist, and studio production credits (e.g. STAFF, 原作 [Original Work], 主笔 [Main Artist], 助手 [Assistants], 承制 [Production], 分镜 [Storyboard], 线稿 [Line Art], 总监制 [Executive Producer], 监制 [Supervisor], 上色 [Coloring], 出品 [Presented by], 制作 [Production], etc.).
- If a dialogue bubble contains legitimate character speech mixed with a trailing watermark or website URL, translate ONLY the dialogue portion and omit the watermark entirely.

Comic Titles & Chapter Headers:
- For comic title and chapter banner regions, be resilient to common Chinese calligraphy OCR misrecognitions (e.g. 快神记 → 妖神记 / Tales of Demons and Gods). Translate the true canonical title/chapter text accurately.

General Rules:
- Never add narration, explanations, or stage directions outside the text itself.
- Never translate glossary terms differently from the glossary block.
- Preserve names exactly as the glossary says.

Wuxia/manhua stat-panel and item-card rules (apply when the text has 【】title brackets or a rarity grade):
- Title lines enclosed in 【】brackets → output as [${tgtName.toUpperCase()} TITLE IN CAPS] (first line, keep the square brackets). Example: 【铁滑车】→ [IRON CHARIOT]. ONLY add [brackets] when the SOURCE text has 【】 — do NOT add brackets to items that start directly with a rarity grade word.
- Rarity-grade items WITHOUT 【】 (e.g. 神话级火箭铁滑车): output the rarity+name as the FIRST line with no brackets. Example: 神话级火箭铁滑车 → MYTHIC ROCKET IRON CHARIOT (no brackets, first line).
- Translate vehicle/weapon names accurately: 滑车 = chariot (war vehicle), not sledge or cart; 战刀 = battle saber; 弩 = crossbow, etc.
- Rarity grade words (传说级, 史诗级, 稀有级, 精良级, 普通级, 神话级, etc.) → translate as LEGENDARY, EPIC, RARE, FINE, COMMON, MYTHIC etc. Keep fused with item type on same line.
- Parenthetical qualifiers （改良版）, （强化版）, （威力加强版）etc. → translate as (IMPROVED VERSION), (ENHANCED VERSION), (POWER-ENHANCED VERSION) etc., on their OWN line immediately after the rarity+type or title line. Always keep the () parentheses in the output.
- Body/description paragraphs: use natural sentence case (not all-caps). Punctuate naturally.
- Preserve all \n line breaks from the source text in the translation so the panel layout is maintained.
- Flavour remarks starting with * (e.g. *食我压路机哒！) → keep the * prefix, translate in the character's voice.

Reply with ONLY a JSON object; no markdown fences, no commentary.`;
}

// PORTED FROM xianslate — PINNED TERMS FIRST, ALIASES, GENDER, CONTEXT NOTE. INJECTED AS A SEPARATE
// SYSTEM MESSAGE BETWEEN THE SYSTEM PROMPT AND THE USER MESSAGE (NOT INSIDE THE PROMPT STRING).
export function glossaryBlock(terms: TermDraft[], src: string, tgt: string): string | null {
	if (terms.length === 0) return null;
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const lines = [...terms]
		// PINNED FIRST, THEN DETERMINISTIC ALPHABETICAL ORDER BY SOURCE FOR DEEPSEEK KV PROMPT CACHE OPTIMIZATION
		.sort((a, b) => {
			const pinDiff = Number(b.pinned ?? false) - Number(a.pinned ?? false);
			if (pinDiff !== 0) return pinDiff;
			return (a.source || '').localeCompare(b.source || '');
		})
		.map((t) => {
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
		regions.map((r) => ({ id: r.id, text: r.text })),
		null,
		1,
	);
}

export function userPrompt(regions: RegionSource[]): string {
	const exampleEntries = regions
		.slice(0, 2)
		.map((r, i) => `"${r.id}": "Translation ${i + 1}"`)
		.join(', ');
	const exampleJson = exampleEntries ? `{${exampleEntries}}` : '{"r0": "Hello"}';
	return `Translate the following regions of a manhua page. Each entry has an id and the source text.

${regionPayload(regions)}

Return a JSON object with:
- "translations": { ${exampleEntries || '"r0": "Hello"'} } mapping each id exactly to its translation. Every id must appear exactly once using the exact same id string as provided above.
- "newTerms" (optional): list of any new proper nouns, character names, locations, or martial arts/techniques appearing in these regions that are NOT already in the glossary, e.g. [{"source": "叶凡", "target": "Ye Fan", "category": "character", "gender": "masculine"}]. If none, use [] or omit.

Alternatively, a flat JSON object ${exampleJson} is also accepted. No markdown fences.`;
}

export function buildMessages(regions: RegionSource[], terms: TermDraft[], pair: LangPair): OpenAI.Chat.ChatCompletionMessageParam[] {
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt(pair.sourceLang, pair.targetLang) },
	];
	const glossary = glossaryBlock(terms, pair.sourceLang, pair.targetLang);
	if (glossary) messages.push({ role: 'system', content: glossary });
	messages.push({ role: 'user', content: userPrompt(regions) });
	return messages;
}

// -- PARSING -- //

// SALVAGE-PARSE THE MODEL'S JSON OBJECT (PORTED PATTERN FROM xianslate's parseTermObjects): STRIP CODE
// FENCES, THEN EITHER PARSE THE WHOLE OBJECT OR SALVAGE `{"id": "text"}` FRAGMENTS. SUPPORTS EXACT ID MATCHING
// AND POSITIONAL ALIASES (r0, 0, region_0) IN CASE THE MODEL NORMALIZED IDS. PURE — UNIT-TESTED.
export function parseTranslations(
	raw: string,
	knownIds: Set<string>,
	regions?: RegionSource[],
): Map<string, string> | null {
	const sanitized = stripThinkingTags(raw);
	const cleaned = sanitized.replace(/```(?:json)?/gi, '').trim();
	const out = new Map<string, string>();
	const rawMap = new Map<string, string>();

	// 1. TRY PARSING AS FULL JSON FIRST
	try {
		const firstBrace = cleaned.indexOf('{');
		const lastBrace = cleaned.lastIndexOf('}');
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
			const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				const transObj =
					parsed.translations &&
					typeof parsed.translations === 'object' &&
					!Array.isArray(parsed.translations)
						? (parsed.translations as Record<string, unknown>)
						: parsed;

				for (const [k, val] of Object.entries(transObj)) {
					if (k === 'newTerms' || k === 'terms' || k === 'translations') continue;
					if (typeof val === 'string') {
						const trimmed = val.trim();
						if (trimmed) rawMap.set(k, trimmed);
					} else if (
						val &&
						typeof val === 'object' &&
						'text' in val &&
						typeof (val as { text: unknown }).text === 'string'
					) {
						const trimmed = (val as { text: string }).text.trim();
						if (trimmed) rawMap.set(k, trimmed);
					}
				}
			}
		}
	} catch {
		// FALL THROUGH TO REGEX SALVAGE
	}

	// 2. REGEX SALVAGE (CAPTURES ENTRIES EVEN IF JSON HAS BROKEN TRAILING COMMAS OR UNESCAPED FRAGMENTS)
	if (rawMap.size === 0) {
		const unbraced = cleaned.replace(/^\{/, '').replace(/\}$/, '');
		for (const m of unbraced.matchAll(/"([A-Za-z0-9_-]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
			const k = m[1];
			if (
				k === 'newTerms' ||
				k === 'terms' ||
				k === 'translations' ||
				k === 'source' ||
				k === 'target' ||
				k === 'category' ||
				k === 'gender' ||
				k === 'context' ||
				k === 'aliases'
			) {
				continue;
			}
			const text = m[2]
				.replace(/\\n/g, '\n')
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, '\\')
				.trim();
			if (text) rawMap.set(k, text);
		}
	}

	if (rawMap.size === 0) return null;

	// 3. RESOLVE KEYS: EXACT ID MATCH FIRST
	for (const [k, text] of rawMap) {
		if (knownIds.has(k)) {
			out.set(k, text);
		}
	}

	// 4. RESOLVE REMAINING MISSING REGIONS BY POSITIONAL ALIASES (r0, 0, region_0, item_0, 1-based, or text match)
	if (regions && regions.length > 0) {
		for (const [k, text] of rawMap) {
			if (knownIds.has(k)) continue;

			// Match by source text match
			const matchedRegion = regions.find((r) => r.text.trim() === k.trim() && !out.has(r.id));
			if (matchedRegion) {
				out.set(matchedRegion.id, text);
				continue;
			}

			// Match index pattern e.g. "r0", "0", "region0", "item0"
			const idxMatch = k.match(/^(?:r|region|seq|item)?_?(\d+)$/i);
			if (idxMatch) {
				const num = parseInt(idxMatch[1], 10);
				// 0-indexed match (e.g. "r0" -> regions[0])
				if (num >= 0 && num < regions.length) {
					const targetReg = regions[num];
					if (!out.has(targetReg.id) && !/^r\d+$/i.test(targetReg.id)) {
						out.set(targetReg.id, text);
						continue;
					}
				}
				// 1-indexed match (e.g. "1" -> regions[0])
				if (num >= 1 && num <= regions.length) {
					const targetReg = regions[num - 1];
					if (!out.has(targetReg.id) && !/^r\d+$/i.test(targetReg.id)) {
						out.set(targetReg.id, text);
						continue;
					}
				}
			}
		}
	}

	return out.size > 0 ? out : null;
}

export const KNOWN_CHINESE_SFX: Record<string, string> = {
	'哒': 'TAP!',
	'嗒': 'STEP!',
	'哒哒': 'TAP-TAP!',
	'嗒嗒': 'PITTER-PATTER!',
	'啪': 'SNAP!',
	'啪啪': 'CLAP-CLAP!',
	'咚': 'THUD!',
	'咚咚': 'THUMP-THUMP!',
	'哐': 'CLANG!',
	'哐当': 'CLANG!',
	'嗖': 'SWOOSH!',
	'唰': 'SWISH!',
	'砰': 'BANG!',
	'嘭': 'POW!',
	'咔': 'CLICK!',
	'咔嚓': 'CRACK!',
	'轰': 'BOOM!',
	'轰隆': 'RUMBLE!',
	'呼': 'WHOOSH!',
	'哧': 'CHIRP!',
	'嘶': 'HISS!',
	'嗡': 'BUZZ!',
	'踏': 'STEP!',
	'铛': 'CLANG!',
};

export function getKnownSfxTranslation(source: string): string | null {
	if (!source) return null;
	const stripped = source.replace(/[!！?？~～\s]/g, '').trim();
	return KNOWN_CHINESE_SFX[stripped] ?? null;
}

// DEGENERATE = EMPTY, OR EXPANDED BEYOND REASONABLE RATIO (THE MODEL EXPLAINED INSTEAD OF TRANSLATING),
// OR A NON-PUNCTUATION SOURCE ERRONEOUSLY TRANSLATED AS PURE ELLIPSIS/DOTS.
// SHORT STRINGS (1-10 CHARS) NATURALLY EXPAND 5-10× INTO ENGLISH SENTENCES (e.g. 鱼字军剿灭 -> "The Fish Army wipes out...").
export function looksDegenerate(translated: string, source: string): boolean {
	if (!translated || !source) return true;
	const cleanSource = source.trim();
	const cleanTarget = translated.trim();
	if (!cleanTarget) return true;

	// Over-expansion check: Only flag when target exceeds a generous floor + ratio
	const maxAllowedLength = Math.max(120, cleanSource.length * 10);
	if (cleanTarget.length > maxAllowedLength) return true;

	// If source is not dots/ellipses but translation is purely dots/ellipses
	if (!/^[.．…·\s]+$/.test(cleanSource) && /^[.．…·\s]+$/.test(cleanTarget)) {
		return true;
	}
	return false;
}

// -- CORE -- //

async function callTranslate(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	opts: PageTranslationOptions,
): Promise<{ raw: string; usage: TranslationUsage }> {
	const client = opts.client ?? createClient();
	const model = resolveModel(opts.model);
	const messages = buildMessages(regions, terms, pair);
	// ~3 TOKENS PER SOURCE CHAR + ROOM FOR JSON TRANSLATIONS & OPTIONAL NEW TERMS ENVELOPE
	const sourceChars = regions.reduce((n, r) => n + r.text.length, 0);
	const maxTokens = Math.max(512, Math.ceil(sourceChars * 3 + 512));
	const resp = await queued(() =>
		withRetry(async () => {
			const r = await client.chat.completions.create(
				{
					model,
					messages,
					temperature: 0.3,
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
	return { raw, usage };
}

// TRANSLATE ONE PAGE'S REGIONS. MISSING/DEGENERATE REGIONS GET ONE REFILL CALL WITH JUST THOSE.
export async function translatePage(
	regions: RegionSource[],
	terms: TermDraft[],
	pair: LangPair,
	opts: PageTranslationOptions = {},
): Promise<PageTranslation> {
	const model = resolveModel(opts.model);
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 } as TranslationUsage;

	if (regions.length === 0) return { byRegion: new Map(), usage, newTerms: [] };

	// FIRST PASS — THE FULL REGION LIST
	const { raw, usage: u1 } = await callTranslate(regions, terms, pair, opts);
	mergeUsage(usage, u1);
	const byRegion = parseTranslations(raw, new Set(regions.map((r) => r.id)), regions) ?? new Map();

	// EXTRACT ANY NEW TERMS DISCOVERED IN THIS PAGE
	const pageSourceText = regions.map((r) => r.text).join('\n');
	const knownSources = new Set(terms.map((t) => t.source.trim()));
	const discoveredTerms = parseExtractedTerms(raw, pageSourceText).filter((t) => !knownSources.has(t.source.trim()));

	// REFILL — REGIONS THAT CAME BACK EMPTY / MISSING / DEGENERATE GET ONE TARGETED CALL
	const missing = regions.filter((r) => {
		const t = byRegion.get(r.id);
		return !t || looksDegenerate(t, r.text);
	});
	if (missing.length > 0) {
		const { raw: raw2, usage: u2 } = await callTranslate(missing, terms, pair, opts);
		mergeUsage(usage, u2);
		const refill = parseTranslations(raw2, new Set(missing.map((r) => r.id)), missing) ?? new Map();
		for (const r of missing) {
			const t = refill.get(r.id);
			if (t && !looksDegenerate(t, r.text)) {
				byRegion.set(r.id, t);
			} else if (t && looksDegenerate(t, r.text)) {
				const sfxFallback = getKnownSfxTranslation(r.text);
				if (sfxFallback) byRegion.set(r.id, sfxFallback);
				else byRegion.delete(r.id);
			}
		}
	}

	// CLEANUP: RESOLVE ANY REMAINING DEGENERATE OUTPUTS FROM PASS 1 (e.g. IF REFILL WAS SILENT)
	for (const r of regions) {
		const current = byRegion.get(r.id);
		if (current && looksDegenerate(current, r.text)) {
			const sfxFallback = getKnownSfxTranslation(r.text);
			if (sfxFallback) {
				byRegion.set(r.id, sfxFallback);
			} else {
				byRegion.delete(r.id);
			}
		}
	}

	return { byRegion, usage, newTerms: discoveredTerms };
}

function mergeUsage(acc: TranslationUsage, u: TranslationUsage): void {
	acc.promptTokens += u.promptTokens;
	acc.cachedTokens += u.cachedTokens;
	acc.completionTokens += u.completionTokens;
	acc.costUsd += u.costUsd;
}

// -- AI TERM EXTRACTION -- //

import { chunkForExtraction } from './glossary';

export const MAX_CONTEXT_TERMS = 100;

export function extractionSystemPrompt(src: string, tgt: string): string {
	const srcName = languageName(src);
	const tgtName = languageName(tgt);
	const srcLabel = srcName === src ? src : `${srcName} (${src})`;
	const tgtLabel = tgtName === tgt ? tgt : `${tgtName} (${tgt})`;
	return `You build a translation glossary from a ${srcLabel} manhua (comic) chapter so that names, titles, and techniques stay 100% consistent across all pages.

Return ONLY a JSON object of exactly this shape — no markdown fences, no comments, no extra text:
{"terms":[{"source":"<exact ${srcName} characters verbatim from text>","target":"<natural ${tgtName} translation>","category":"character|location|organization|technique|item|realm|creature|title|concept|other","gender":"neuter|masculine|feminine","aliases":["<other ${srcName} forms/nicknames>"],"pinned":false,"context":"<brief description>"}]}

Rules:
1. "source": MUST be copied EXACTLY as it appears in the text (identical characters, no added or removed spaces) so exact string match will find it on every page.
2. "target":
   - Personal character names: Romanize into Pinyin / Latin script with Title Case (e.g. 叶凡 → Ye Fan; 李澈 → Li Che; 陈北玄 → Chen Beixuan; 北玄 → Beixuan). Space-separate family and given names. ALWAYS fuse 2-character given names into a single word (e.g. 北玄 → Beixuan, NEVER "Bei Xuan").
   - Place names: Romanize the proper name and translate the place type (e.g. 雲霄村 → Yunxiao Village; 紫山 → Purple Mountain).
   - Descriptive terms (techniques, martial arts, cultivation realms, weapons, items, artifacts): Translate by MEANING into natural ${tgtName} (e.g. 斩龙剑 → Dragon Slaying Sword; 筑基期 → Foundation Establishment).
3. "category": 'character', 'location', 'organization', 'technique', 'item', 'realm', 'creature', 'title', 'concept', 'other'.
4. "gender": 'masculine' or 'feminine' ONLY when the text explicitly indicates it (pronouns, titles like master/sister/brother/prince); otherwise 'neuter'.
5. "aliases": Array of other short forms, standalone given names, nicknames, or forms of address in the text (e.g. for 陈北玄, aliases: ["北玄", "小北玄"]; for 叶凡, aliases: ["小凡", "凡儿"]). For 3-character full names, ALWAYS include the 2-character standalone given name in "aliases".
6. Skip generic words, common dialogue phrases, numbers, and pronouns. Focus on recurring proper nouns, character names, and unique terminology.
7. Multi-name listings: In dialogue or narration where multiple character names are listed back-to-back with minimal or no punctuation (e.g. 子龙童菲, 陈北玄林动, 张肥关鱼), extract each individual 2-3 character name separately (e.g. 子龙, 童菲, 陈北玄, 林动, 张肥, 关鱼), never combine them into a single compound entry.`;
}

// ROBUST PARSE: ACCEPT CLEAN JSON, A BARE ARRAY, OR A TRUNCATED RESPONSE (SALVAGE COMPLETE {…} OBJECTS)
// SO A SLIGHTLY MALFORMED / CUT-OFF REPLY STILL YIELDS THE TERMS IT DID CONTAIN INSTEAD OF ZERO.
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
	// SALVAGE EVERY COMPLETE {…} OBJECT (HANDLES A TRUNCATED ARRAY THAT NEVER GOT ITS CLOSING `]`)
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

		// VERBATIM VERIFICATION: If contentSource is supplied, only keep terms whose source
		// actually appears in the OCR text (prevents hallucinations).
		if (contentSource && !contentSource.includes(sourceTerm)) continue;

		if (seen.has(sourceTerm)) continue;
		seen.add(sourceTerm);

		const category = validCategories.has(String(t?.category))
			? (String(t?.category) as TermDraft['category'])
			: 'other';

		const gender =
			category && category !== 'character'
				? 'neuter'
				: validGenders.has(String(t?.gender))
					? (String(t?.gender) as TermDraft['gender'])
					: 'neuter';

		const context = typeof t?.context === 'string' && t.context.trim() ? t.context.trim() : null;
		const pinned = t?.pinned === true;

		// ALIASES: Other source forms that appear in contentSource
		const aliases = Array.isArray(t?.aliases)
			? [
					...new Set(
						(t.aliases as unknown[])
							.map((a) => String(a ?? '').trim())
							.filter((a) => a && a !== sourceTerm && (!contentSource || contentSource.includes(a))),
					),
				].slice(0, 8)
			: [];

		// Auto-derive standalone given name alias for 3-character personal names (e.g. 陈北玄 -> 北玄)
		if (category === 'character' && sourceTerm.length === 3) {
			const givenName = sourceTerm.slice(1);
			if (!aliases.includes(givenName) && (!contentSource || contentSource.includes(givenName))) {
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
	opts: PageTranslationOptions & { knownTerms?: TermDraft[] } = {},
): Promise<{ terms: TermDraft[]; usage: TranslationUsage }> {
	const client = opts.client ?? createClient();
	const model = resolveModel(opts.model);
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 } as TranslationUsage;

	if (!content.trim()) return { terms: [], usage };

	// Chunk content if text is long (split by lines/bubbles)
	const chunks = chunkForExtraction(content);
	const bySource = new Map<string, TermDraft>();

	for (let i = 0; i < chunks.length; i++) {
		if (opts.signal?.aborted) throw Object.assign(new Error('Extraction aborted'), { name: 'AbortError' });
		const chunk = chunks[i];

		// Cumulative context: DB existing terms + terms extracted from earlier chunks of this chapter
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
					`ESTABLISHED GLOSSARY (already known — reuse each EXACT ${pair.targetLang} rendering everywhere you name these entities and never contradict one):\n` +
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
			mergeUsage(usage, u);

			const extracted = parseExtractedTerms(raw, content);
			for (const term of extracted) {
				if (!bySource.has(term.source)) {
					bySource.set(term.source, term);
				}
			}
		} catch (err) {
			if (opts.signal?.aborted) throw err;
			// Chunk-local failure: continue with already extracted terms
		}
	}

	return { terms: [...bySource.values()], usage };
}

// TRANSLATE A SINGLE STRING (BOOK TITLE, CHAPTER TITLE, TERM, ETC.)
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
	const usage = { model, promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 } as TranslationUsage;

	if (!trimmed) {
		return { text: '', usage };
	}

	const client = opts.client ?? createClient();
	const srcName = languageName(pair.sourceLang);
	const tgtName = languageName(pair.targetLang);

	let systemContent = '';
	if (opts.kind === 'chapter') {
		systemContent = `You are a professional comic and novel localizer. Translate the provided chapter title from ${srcName} to ${tgtName}.
Rules:
- Translate concisely and naturally (e.g. "第1话 重生" -> "Chapter 1: Rebirth", "第12话" -> "Chapter 12", "第30章 突破" -> "Chapter 30: Breakthrough").
- Maintain chapter numbering in English/Target language (Chapter X or Ch. X: Subtitle).
- Do NOT output commentary, quotes, explanations, or markdown fences. Output ONLY the translated chapter title string.`;
	} else if (opts.kind === 'title') {
		systemContent = `You are a professional comic and novel localizer. Translate the provided book/series title from ${srcName} to ${tgtName}.
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

		let out = res.choices[0]?.message?.content?.trim() || '';
		// Strip outer quotes if returned
		if (
			(out.startsWith('"') && out.endsWith('"')) ||
			(out.startsWith('“') && out.endsWith('”')) ||
			(out.startsWith('\'') && out.endsWith('\'')) ||
			(out.startsWith('「') && out.endsWith('」'))
		) {
			out = out.slice(1, -1).trim();
		}
		return { text: out || trimmed, usage };
	} catch (err) {
		// Fallback regex for chapter patterns if LLM fails or is unconfigured
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

