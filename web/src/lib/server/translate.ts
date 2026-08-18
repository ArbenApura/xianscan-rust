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
import { computeUsage, createClient, queued, resolveModel, stripThinkingTags, thinkingParam, withRetry } from './deepseek';

export interface RegionSource {
	id: string;
	text: string;
	kind?: string;
	vertical?: boolean;
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
export const PROMPT_VERSION = 'v13';

// A TRANSLATION LONGER THAN 6× THE SOURCE IS ALMOST CERTAINLY THE MODEL REWRITING THE PROMPT / ADDING
// EXPLANATIONS — FLAGGED FOR A REFILL (SAME HEURISTIC AS xianslate's looksOverExpanded).
const MAX_EXPANSION = 6;

// -- PROMPTS -- //

function getSourceLanguageProfile(src: string, tgtName: string): string {
	const primary = src.split('-')[0].toLowerCase();
	if (primary === 'zh') {
		return `Manhua & Chinese Culture Localization Rules:
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
- Character Names, Multi-Name Listings & Military Units:
  * Chinese Name Segmentation: Chinese personal names (courtesy names, given names, full names) are typically 2 or 3 characters each (e.g. 子龙, 童菲, 张飞/张肥, 关羽/关鱼, 赵云, 诸葛亮).
  * Consecutive Name Listings & Sparse Punctuation: In military orders, roster listings, and dialogue, multiple names are frequently written back-to-back with sparse or missing punctuation (e.g. "子龙童菲，张肥关鱼" or "刘关张").
    - NEVER combine adjacent 2-character names into a single 4-character compound name (e.g. "子龙童菲" represents TWO separate persons "Zilong" and "Tong Fei", NOT "Zilong Tongfei"; "张肥关鱼" represents TWO separate persons "Zhang Fei" and "Guan Yu", NOT "Zhang Fei Guan Yu").
    - When translating name series, render all individuals clearly separated with proper punctuation and conjunctions (e.g. "子龙童菲，张肥关鱼" → "Zilong, Tong Fei, Zhang Fei, and Guan Yu").
  * Parody, Homophone & OCR Typo Names: In comedic, parody, or OCR'd manhua, character names may appear as homophones or humorous variants (e.g. 张肥 for 张飞 / Zhang Fei, 关鱼 for 关羽 / Guan Yu). Recognize these as individual character names rather than literal common nouns ("fat", "fish") and translate them cleanly as names.
  * Military Unit & Army Division Titles: In war, military, or historical manhua, army divisions, brigades, or squads named after characters/monikers (e.g. 龙字军, 肥字军, 鱼字军, 虎字营, 豹字部) represent legitimate in-universe armed forces (e.g. "The Long Army / Dragon Division", "The Fei Army / Fat Division", "The Yu Army / Fish Division"). ALWAYS translate them.
- Chinese Calligraphy & Title OCR Resilience:
  * For comic title and chapter banner regions, be resilient to common Chinese calligraphy OCR misrecognitions (e.g. 快神记 → 妖神记 / Tales of Demons and Gods). Translate the true canonical title/chapter text accurately.
- Wuxia/manhua stat-panel and item-card rules (apply when the text has 【】title brackets or a rarity grade):
  * Title lines enclosed in 【】brackets → output as [${tgtName.toUpperCase()} TITLE IN CAPS] (first line, keep the square brackets). Example: 【铁滑车】→ [IRON CHARIOT]. ONLY add [brackets] when the SOURCE text has 【】 — do NOT add brackets to items that start directly with a rarity grade word.
  * Rarity-grade items WITHOUT 【】 (e.g. 神话级火箭铁滑车): output the rarity+name as the FIRST line with no brackets. Example: 神话级火箭铁滑车 → MYTHIC ROCKET IRON CHARIOT (no brackets, first line).
  * Translate vehicle/weapon names accurately: 滑车 = chariot (war vehicle), not sledge or cart; 战刀 = battle saber; 弩 = crossbow, etc.
  * Rarity grade words (传说级, 史诗级, 稀有级, 精良级, 普通级, 神话级, etc.) → translate as LEGENDARY, EPIC, RARE, FINE, COMMON, MYTHIC etc. Keep fused with item type on same line.
  * Parenthetical qualifiers （改良版）, （强化版）, （威力加强版）etc. → translate as (IMPROVED VERSION), (ENHANCED VERSION), (POWER-ENHANCED VERSION) etc., on their OWN line immediately after the rarity+type or title line. Always keep the () parentheses in the output.`;
	}

	if (primary === 'ru' || primary === 'uk' || primary === 'be') {
		return `Russian & Cyrillic Comic Localization Rules:
- Cyrillic Sound Effects (SFX) & Action Onomatopoeia:
  * Render all comic sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia:
    - хрусть / хрусь / хрясь / щелк → CRACK! / SNAP! / CRUNCH! / CLICK!
    - бум / бабах / бах / бам → BOOM! / BANG! / KABOOM! / BAM!
    - вжух / шурх / свист → SWOOSH! / RUSTLE! / WHOOSH!
    - скрип / стук / тук / стук-стук → CREAK! / THUD! / KNOCK! / KNOCK-KNOCK!
    - кап / кап-кап → DRIP! / PLOP! / DRIP-DRIP!
    - чмок / чпок → SMOOCH! / POP!
    - бряк / дзынь / дзинь / звон → CLATTER! / CLINK! / RING!
    - топ / топ-топ → STEP! / STOMP! / PITTER-PATTER!
    - хлоп / шлеп → CLAP! / SLAP! / SMACK!
    - ах / ох / ух / эх / ай / ой → AH! / OH! / UGH! / OUCH! / OOPS!
- Cyrillic Comic OCR Font Confusions & Leetspeak Recovery:
  * Stylized cursive or brush letters frequently cause OCR to misread Cyrillic letters as visually similar digits or Latin glyphs:
    '4' or 'ч' ↔ 'х', '6' ↔ 'б', '0' ↔ 'о', '3' ↔ 'з', 'P' ↔ 'р', 'C' ↔ 'с', 'T' ↔ 'т', 'b' ↔ 'ь', 'm' ↔ 'т'.
  * Example: "(4PyCTb" represents the Russian sound effect "хрусть" (CRACK! / SNAP!). Reconstruct the intended word from context and font similarity instead of echoing raw OCR gibberish.
- Diminutives, Kinship & Natural Flow:
  * Reflect natural Russian spoken dialogue with lively phrasing.
  * Translate Russian diminutive/affectionate names (e.g. Маша / Машенька → Masha, Ваня / Ванька → Vanya, Саня → Sanya) and emotional particles (давай, ну-ка, же, ведь) naturally into conversational ${tgtName}.`;
	}

	if (primary === 'ja') {
		return `Japanese Manga Localization Rules:
- Manga Sound Effects (Gitaigo / Giseigo):
  * Render all manga sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia:
    - ドキドキ → BA-DUMP! / THUMP-THUMP!
    - ドン / ドカーン → BOOM! / KABOOM!
    - ガタッ / ガタガタ → RATTLE! / CLATTER!
    - ニコ / ニコニコ → SMILE / GRIN
    - パチパチ → CLAP-CLAP!
    - ギラッ / ピカッ → FLASH! / GLINT!
    - ピクッ / ビクッ → TWITCH! / STARTLE!
    - シーン → *SILENCE*
    - ハァ / フゥ → HUFF... / SIGH...
    - ザー / ザァァ → SHHH! / ROAR!
    - バッ / サッ → SWOOSH! / DASH!
    - ゴクッ → GULP!
- Honorifics & Relationships:
  * Naturally preserve or adapt Japanese honorific suffixes (-san, -kun, -chan, -sama, senpai, sensei) and kinship terms according to the tone and speaker's personality.`;
	}

	if (primary === 'ko') {
		return `Korean Manhwa Localization Rules:
- Manhwa Sound Effects & Action Onomatopoeia:
  * Render sound effects into punchy ALL-CAPS ${tgtName} onomatopoeia:
    - 쿵 / 쾅 → THUD! / SLAM! / BANG!
    - 두근두근 → POUND-POUND! / BA-DUMP!
    - 슥 / 척 → SWISH! / STEP!
    - 찰칵 → CLICK! / SNAP!
    - 으아아 / 꺄아 → AARGH! / EEEEEK!
    - 씨익 → SMIRK / GRIN
    - 퍽 / 탁 → SMACK! / CLACK!
    - 번쩍 → FLASH!
- Korean Honorifics & Kinship Forms:
  * Naturally adapt Korean address terms (Hyung, Oppa, Noona, Unnie, Sunbae, Hubae, Nim, Ahjussi) matching the character relationships and localization style.`;
	}

	if (primary === 'fr' || primary === 'es' || primary === 'de' || primary === 'it' || primary === 'pt') {
		return `Western & European Comic (Bande Dessinée) Rules:
- Comic Sound Effects & Onomatopoeia:
  * Localize European/Western comic sound effects into standard punchy ALL-CAPS ${tgtName}:
    - Vlan / Bim / Pif / Paf / Zas → WHAM! / POW! / SLAP! / WHACK!
    - Boum / Pum / Bang / Boom → BOOM! / BANG!
    - Crac / Crash → CRACK! / CRASH!
    - Toc / Toc-toc / Tap → KNOCK! / TAP!
    - Plaf / Plouf / Chof → SPLASH! / PLOP!
- Accented Character OCR Recovery:
  * Be resilient to OCR dropping or substituting accents (é, è, ê, à, ç, ñ, ü, ö, etc.). Infer the true intended word naturally.`;
	}

	if (primary === 'id' || primary === 'vi' || primary === 'th') {
		return `Southeast Asian Webtoon Rules:
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

Comic Conversation & Dialogue Style:
- Conversational Flow: Write natural spoken dialogue as real characters speak in comics. Use natural contractions (I'm, don't, you're, can't, he'll, what's, let's) and lively phrasing suitable for voice acting. Avoid stiff, robotic, or overly literal translations.
- Tone & Character Personality: Reflect the speaker's personality, emotion, age, and social standing (e.g. arrogant rivals, wise masters, energetic protagonists, stern villains, flustered heroines, playful sidekicks).
- Bubble Space & Brevity: Comic speech bubbles have limited space. Keep dialogue concise, punchy, and impactful without dropping meaning.
- Categories & Region Kinds:
  * dialogue_bubble: Natural spoken conversation with character voice and emotion.
  * mono / thought: Inner thoughts, reflections, or narration in a smooth, introspective tone.
  * free_text / sfx: Comic onomatopoeia, floating sound effects, or sketch captions. Render sound effects in ALL-CAPS.
  * other: UI, system prompts, stat cards, or narrator captions.

Intelligent OCR Noise & Stylized Comic Font Recovery:
- Comic lettering and hand-drawn sound effects frequently suffer from visual OCR character confusions (e.g. brush strokes or cursive glyphs read as digits like '4', '6', '0', '3', '1' or mixed Latin/ASCII characters).
- When a region contains garbled tokens or leetspeak glyphs (e.g. "(4PyCTb" visually resembling "хрусть" → CRACK! / SNAP!), reconstruct the intended word or sound effect from visual character similarity and comic context.
- NEVER output raw OCR gibberish if the intended comic word or sound effect can be reasonably identified.

Comic Sound Effects (SFX) & Action Onomatopoeia:
- Isolated Action Sounds: Single or short repeated characters without sentence punctuation represent action sound effects (SFX), footsteps, landings, impacts, swings, or movements.
- NEVER convert isolated SFX characters into ellipses ("..."), pauses, or empty strings.
- Render all SFX into concise, punchy ALL-CAPS ${tgtName} onomatopoeia.

Story Narration, Sketch Captions & Incomplete Fragments:
- Floating Comic Art Captions: Handwritten text floating on illustrations, parchment, or battle plan sketches is essential story narrative. ALWAYS translate it.
- Incomplete / Cut-off Phrases: If a story caption or dialogue is cut off or incomplete at the edge of the panel, translate the partial phrase with a natural trailing ellipsis. NEVER drop incomplete sentences or return empty strings for story text.

Punctuation & Reaction Bubbles:
- NEVER invent or use em-dashes (— or --) for pauses, thinking, or sentence breaks. Use natural commas (,), periods (.), or ellipses (...) matching the source punctuation.
- Character Speech & Reaction Bubbles: If a dialogue region contains ellipses, exclamation marks, question marks, or reaction punctuation (e.g. "……", "……！", "……？", "？！", "！", "？", "...", "!?"), ALWAYS translate it to natural ${tgtName} punctuation (e.g. "...", "...!", "...?", "?!", "!", "?"). Do NOT return an empty string for character speech or pause bubbles!
- Spoken Pauses: Preserve ellipses in spoken pauses (e.g. "You... are right,").
- Only output a dash if the original source text explicitly contains a dash/hyphen.

Watermark & Scanlation Tag Filtering:
- Piracy Watermarks & Aggregator Ads: If a text region is STRICTLY a third-party pirate watermark, scanlation group recruitment ad, website URL/domain, aggregator watermark, scanlation QQ/Discord group, or uploader logo, return an EMPTY STRING "" for its id.
- Story Text is NOT a Watermark: In-universe names, military forces, bandit fortresses, location names, or character sketch captions are NOT watermarks. NEVER filter them out.
- Official Comic Staff & Production Credits: ALWAYS TRANSLATE official manga/manhua/comic author, artist, and studio production credits (e.g. STAFF, Original Work, Main Artist, Assistants, Production, Storyboard, Line Art, Supervisor, Coloring, etc.).
- If a dialogue bubble contains legitimate character speech mixed with a trailing watermark or website URL, translate ONLY the dialogue portion and omit the watermark entirely.

General Rules:
- Never add narration, explanations, or stage directions outside the text itself.
- Never translate glossary terms differently from the glossary block.
- Preserve names exactly as the glossary says.
- Preserve all \\n line breaks from the source text in the translation so the panel layout is maintained.
- Flavour remarks starting with * → keep the * prefix, translate in the character's voice.
${langProfile ? `\n${langProfile}\n` : ''}
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

export function userPrompt(regions: RegionSource[]): string {
	const exampleEntries = regions
		.slice(0, 2)
		.map((r, i) => `"${r.id}": "Translation ${i + 1}"`)
		.join(', ');
	const exampleJson = exampleEntries ? `{${exampleEntries}}` : '{"r0": "Hello"}';
	return `Translate the following regions of a comic/manhua page. Each entry has an id and the source text.

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

export const KNOWN_MULTILINGUAL_SFX: Record<string, Record<string, string>> = {
	zh: {
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
	},
	ru: {
		'хрусть': 'CRACK!',
		'хрусь': 'SNAP!',
		'хрясь': 'SMACK!',
		'щелк': 'CLICK!',
		'щёлк': 'CLICK!',
		'бум': 'BOOM!',
		'бах': 'BANG!',
		'бабах': 'KABOOM!',
		'бам': 'BAM!',
		'вжух': 'SWOOSH!',
		'шурх': 'RUSTLE!',
		'кап': 'DRIP!',
		'кап-кап': 'DRIP-DRIP!',
		'скрип': 'CREAK!',
		'чмок': 'SMOOCH!',
		'чпок': 'POP!',
		'тук': 'KNOCK!',
		'тук-тук': 'KNOCK-KNOCK!',
		'стук': 'THUD!',
		'дзынь': 'CLINK!',
		'дзинь': 'RING!',
		'плюх': 'SPLASH!',
		'пшик': 'POOF!',
		'хлоп': 'CLAP!',
		'шлеп': 'SLAP!',
		'шлёп': 'SLAP!',
		'топ': 'STEP!',
		'топ-топ': 'PITTER-PATTER!',
		'ах': 'AH!',
		'ох': 'OH!',
		'ух': 'UGH!',
		'ай': 'OUCH!',
		'ой': 'OOPS!',
	},
	ja: {
		'ドキドキ': 'BA-DUMP!',
		'ドン': 'BOOM!',
		'ドカーン': 'KABOOM!',
		'ニコ': 'SMILE',
		'ニコニコ': 'GRIN',
		'ガタッ': 'RATTLE!',
		'ガタガタ': 'CLATTER!',
		'パチパチ': 'CLAP-CLAP!',
		'ハァ': 'HUFF',
		'フゥ': 'SIGH',
		'ピクッ': 'TWITCH!',
		'ギラッ': 'FLASH!',
		'ゴクッ': 'GULP',
		'ザッ': 'SWISH!',
		'シーン': '*SILENCE*',
		'バッ': 'BAM!',
		'ビクッ': 'STARTLE!',
		'フワッ': 'FLOAT',
		'ボカン': 'BOOM!',
	},
	ko: {
		'쿵': 'THUD!',
		'쾅': 'SLAM!',
		'두근두근': 'POUND-POUND!',
		'하하': 'HAHA!',
		'흑흑': 'SOB-SOB',
		'슥': 'SWISH!',
		'척': 'STEP!',
		'탁': 'SNAP!',
		'퍽': 'SMACK!',
		'우르尔': 'RUMBLE!',
		'번쩍': 'FLASH!',
		'찰칵': 'CLICK!',
		'씨익': 'SMIRK',
	},
	fr: {
		'vlan': 'WHAM!',
		'bim': 'POW!',
		'bam': 'BAM!',
		'boum': 'BOOM!',
		'pif': 'POW!',
		'paf': 'SLAP!',
		'clic': 'CLICK!',
		'crac': 'CRACK!',
		'toc': 'KNOCK!',
		'pan': 'BANG!',
	},
	es: {
		'pum': 'BOOM!',
		'bang': 'BANG!',
		'zas': 'WHACK!',
		'toc': 'KNOCK!',
		'ñam': 'NOM-NOM',
		'plaf': 'SPLASH!',
		'boing': 'BOING!',
		'chof': 'SQUISH!',
	},
};

export const KNOWN_CHINESE_SFX: Record<string, string> = KNOWN_MULTILINGUAL_SFX.zh;

function normalizeCyrillicOcrNoise(text: string): string {
	return text
		.toLowerCase()
		.replace(/4/g, 'х')
		.replace(/p/g, 'р')
		.replace(/y/g, 'у')
		.replace(/c/g, 'с')
		.replace(/t/g, 'т')
		.replace(/b/g, 'ь')
		.replace(/m/g, 'т')
		.replace(/6/g, 'б')
		.replace(/0/g, 'о')
		.replace(/3/g, 'з');
}

export function getKnownSfxTranslation(source: string, lang?: string): string | null {
	if (!source) return null;
	const stripped = source.replace(/[!！?？~～\s()（）[\]{}'"`«»]/g, '').trim();
	if (!stripped) return null;

	const langKey = lang ? lang.split('-')[0].toLowerCase() : null;

	// 1. Check primary language table if known
	if (langKey && KNOWN_MULTILINGUAL_SFX[langKey]) {
		const dict = KNOWN_MULTILINGUAL_SFX[langKey];
		if (dict[stripped]) return dict[stripped];
		const lower = stripped.toLowerCase();
		if (dict[lower]) return dict[lower];

		if (langKey === 'ru' || langKey === 'uk' || langKey === 'be') {
			const normalizedCyrillic = normalizeCyrillicOcrNoise(stripped);
			if (KNOWN_MULTILINGUAL_SFX.ru[normalizedCyrillic]) {
				return KNOWN_MULTILINGUAL_SFX.ru[normalizedCyrillic];
			}
		}
	}

	// 2. Fallback search across all language tables
	for (const [, dict] of Object.entries(KNOWN_MULTILINGUAL_SFX)) {
		if (dict[stripped]) return dict[stripped];
		const lower = stripped.toLowerCase();
		if (dict[lower]) return dict[lower];
	}

	// 3. Fallback search with Cyrillic OCR noise normalization
	const normCyrillic = normalizeCyrillicOcrNoise(stripped);
	if (KNOWN_MULTILINGUAL_SFX.ru[normCyrillic]) {
		return KNOWN_MULTILINGUAL_SFX.ru[normCyrillic];
	}

	return null;
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
				const sfxFallback = getKnownSfxTranslation(r.text, pair.sourceLang);
				if (sfxFallback) byRegion.set(r.id, sfxFallback);
				else byRegion.delete(r.id);
			}
		}
	}

	// CLEANUP: RESOLVE ANY REMAINING DEGENERATE OUTPUTS FROM PASS 1 (e.g. IF REFILL WAS SILENT)
	for (const r of regions) {
		const current = byRegion.get(r.id);
		if (current && looksDegenerate(current, r.text)) {
			const sfxFallback = getKnownSfxTranslation(r.text, pair.sourceLang);
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
   - Personal character names: Romanize into Pinyin / Latin script with Title Case (e.g. 叶凡 → Ye Fan; 李澈 → Li Che). Space-separate family and given names.
   - Place names: Romanize the proper name and translate the place type (e.g. 雲霄村 → Yunxiao Village; 紫山 → Purple Mountain).
   - Descriptive terms (techniques, martial arts, cultivation realms, weapons, items, artifacts): Translate by MEANING into natural ${tgtName} (e.g. 斩龙剑 → Dragon Slaying Sword; 筑基期 → Foundation Establishment).
3. "category": 'character', 'location', 'organization', 'technique', 'item', 'realm', 'creature', 'title', 'concept', 'other'.
4. "gender": 'masculine' or 'feminine' ONLY when the text explicitly indicates it (pronouns, titles like master/sister/brother/prince); otherwise 'neuter'.
5. "aliases": Array of other short forms, nicknames, or forms of address in the text (e.g. for 叶凡, aliases: ["小凡", "凡儿"]).
6. Skip generic words, common dialogue phrases, numbers, and pronouns. Focus on recurring proper nouns, character names, and unique terminology.
7. Multi-name listings: In dialogue or narration where multiple character names are listed back-to-back with minimal or no punctuation (e.g. 子龙童菲, 张肥关鱼), extract each individual 2-3 character name separately (e.g. 子龙, 童菲, 张肥, 关鱼), never combine them into a single compound entry.`;
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

