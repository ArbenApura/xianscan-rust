// TRANSLATE TESTS — PROMPT SHAPE, GLOSSARY ENFORCEMENT (THE BLOCK IS A SEPARATE SYSTEM MESSAGE),
// JSON SALVAGE PARSING, DEGENERATE-DETECTION REFILL, USAGE ACCRUAL. THE LLM IS A FAKE CLIENT —
// TRANSLATE IS THE FIRST MODULE IN THIS APP WHOSE LLM PATHS ARE UNIT-TESTED (xianslate COULDN'T).
import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import type { TermDraft } from '$lib/types';
import {
	buildMessages,
	getKnownSfxTranslation,
	glossaryBlock,
	looksDegenerate,
	parseTranslations,
	sanitizeTranslationArtifacts,
	systemPrompt,
	translatePage,
	userPrompt,
} from '$lib/server/translate';

const PAIR = { sourceLang: 'zh-Hans', targetLang: 'en' };

function fakeClient(
	responses: Array<string | Error>,
	usage: unknown = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
) {
	let call = 0;
	const client = {
		chat: {
			completions: {
				create: async () => {
					const r = responses[Math.min(call, responses.length - 1)];
					call++;
					if (r instanceof Error) throw r;
					return { choices: [{ message: { content: r } }], usage };
				},
			},
		},
	} as unknown as OpenAI;
	return { client, callCount: () => call };
}

// -- PROMPT CONSTRUCTION -- //

describe('systemPrompt', () => {
	it('covers the manhua localization rules, SFX rules, and story captions for Chinese', () => {
		const p = systemPrompt('zh-Hans', 'en');
		expect(p).toMatch(/comic/i);
		expect(p).toMatch(/JSON object/);
		expect(p).toContain('zh-Hans');
		expect(p).toContain('Character Names, Multi-Name Listings & Military Units');
		expect(p).toContain('Military Unit & Army Division Titles');
		expect(p).toContain('Floating Comic Art Captions');
		expect(p).toContain('Comic Sound Effects (SFX) & Action Onomatopoeia');
		expect(p).toContain('Wuxia / Xianxia / Cultivation Dialogue & Idioms');
		expect(p).toContain('Intelligent OCR Noise, Artwork Artifacts & Speech Bubble Tails');
		expect(p).toContain('Pronoun, Subject Resolution & Pro-Drop Accuracy');
		expect(p).toContain('Verb Transitivity & Grammatical Voice Fidelity');
		expect(p).toContain('Speech Bubble Tails & Artwork Artifact Filtering');
	});

	it('produces specialized Russian/Cyrillic prompt without Chinese Wuxia rules', () => {
		const p = systemPrompt('ru', 'en');
		expect(p).toContain('Russian & Cyrillic Comic Localization Rules');
		expect(p).toContain('Cyrillic Sound Effects (SFX) & Action Onomatopoeia');
		expect(p).toContain('Cyrillic Comic OCR Font Confusions & Leetspeak Recovery');
		expect(p).toContain('(4PyCTb');
		// Token efficiency: Chinese Wuxia rules MUST NOT leak into Russian prompt
		expect(p).not.toContain('Wuxia / Xianxia / Cultivation Dialogue & Idioms');
		expect(p).not.toContain('【铁滑车】');
		expect(p).not.toContain('师尊');
	});

	it('produces specialized Japanese Manga prompt', () => {
		const p = systemPrompt('ja', 'en');
		expect(p).toContain('Japanese Manga Localization Rules');
		expect(p).toContain('ドキドキ');
		expect(p).not.toContain('Wuxia / Xianxia');
	});

	it('enforces strict target language rules when translating zh-Hans to Korean', () => {
		const p = systemPrompt('zh-Hans', 'ko');
		expect(p).toContain('Target Language & Zero Untranslated Script Invariant');
		expect(p).toContain('Korean (ko)');
		expect(p).toContain(
			'Do NOT output English or any other language unless the target language is explicitly English',
		);
		expect(p).toContain('Wuxia / Xianxia / Cultivation Dialogue & Idioms');
	});
});

describe('glossaryBlock', () => {
	const term = (t: Partial<TermDraft> & { source: string; target: string }): TermDraft => ({
		gender: 'neuter',
		status: 'user',
		aliases: [],
		pinned: false,
		...t,
	});

	it('returns null for an empty glossary', () => {
		expect(glossaryBlock([], 'zh-Hans', 'en')).toBeNull();
	});

	it('preserves input order (append-only) with aliases, gender and context', () => {
		const block = glossaryBlock(
			[
				term({ source: '主角', target: 'MC', gender: 'masculine', context: 'the protagonist' }),
				term({ source: '系统', target: 'System', pinned: true, aliases: ['系统君'] }),
			],
			'zh-Hans',
			'en',
		);
		expect(block).toContain('★系统 (also: 系统君) = System');
		expect(block).toContain('★主角 = MC [masculine] — the protagonist');
		// ORDER IS PRESERVED AS GIVEN (NO RE-SORT) — THE CALLER OWNS PINNED-FIRST ORDERING SO THAT THE
		// GLOSSARY CAN GROW MONOTONICALLY (APPEND-ONLY) FOR A STABLE CACHE PREFIX ACROSS PAGES.
		expect(block!.indexOf('★主角')).toBeLessThan(block!.indexOf('★系统'));
	});

	it('preserves the exact given order (monotonic append prefix for KV caching)', () => {
		const block = glossaryBlock(
			[
				term({ source: '宗门', target: 'Sect', pinned: true }),
				term({ source: '掌门', target: 'Sect Leader', pinned: true }),
				term({ source: '李元', target: 'Li Yuan', pinned: false }),
				term({ source: '阿青', target: 'A Qing', pinned: false }),
			],
			'zh-Hans',
			'en',
		);
		// ORDER IS EXACTLY AS GIVEN (CALLER PRE-SORTS PINNED FIRST, DETERMINISTICALLY). glossaryBlock MUST
		// NOT RE-SORT, OR ELSE APPENDED TERMS WOULD INVALIDATE THE CACHED PREFIX ON EVERY PAGE.
		const idx = (s: string) => block!.indexOf(s);
		expect(idx('★宗门')).toBeGreaterThanOrEqual(0);
		expect(idx('★宗门')).toBeLessThan(idx('★掌门'));
		expect(idx('★掌门')).toBeLessThan(idx('★李元'));
		expect(idx('★李元')).toBeLessThan(idx('★阿青'));
	});

	it('is injected as a separate system message between prompt and user content', () => {
		const regions = [{ id: 'r0', text: '你好' }];
		const messages = buildMessages(regions, [term({ source: '系统', target: 'System' })], PAIR);
		expect(messages).toHaveLength(3);
		expect(messages[0].role).toBe('system');
		expect(messages[1]).toMatchObject({ role: 'system', content: expect.stringContaining('★系统 = System') });
		expect(messages[2].role).toBe('user');
		expect(String(messages[2].content)).toContain('r0');
	});
});

describe('userPrompt', () => {
	it('carries ids, text, kind, and vertical flags for regions', () => {
		const p = userPrompt([
			{ id: 'r0', text: 'хрусть', kind: 'free_text' },
			{ id: 'r1', text: '你好', kind: 'dialogue_bubble', vertical: true },
		]);
		expect(p).toContain('"id": "r0"');
		expect(p).toContain('"text": "хрусть"');
		expect(p).toContain('"kind": "free_text"');
		expect(p).toContain('"vertical": true');
		// Default 'dialogue_bubble' is omitted to save prompt tokens
		expect(p).not.toContain('"kind": "dialogue_bubble"');
	});
});

// -- PARSING -- //

describe('parseTranslations', () => {
	const ids = new Set(['r0', 'r1', 'r2']);

	it('parses a clean JSON object', () => {
		const out = parseTranslations('{"r0": "Hi", "r1": "BOOM!", "r2": "System"}', ids);
		expect([...out!.entries()]).toEqual([
			['r0', 'Hi'],
			['r1', 'BOOM!'],
			['r2', 'System'],
		]);
	});

	it('parses a nested { translations, newTerms } envelope', () => {
		const out = parseTranslations(
			JSON.stringify({
				translations: { r0: 'Hi', r1: 'BOOM!' },
				newTerms: [{ source: '叶凡', target: 'Ye Fan', category: 'character' }],
			}),
			ids,
		);
		expect(out!.get('r0')).toBe('Hi');
		expect(out!.get('r1')).toBe('BOOM!');
		expect(out!.has('newTerms')).toBe(false);
	});

	it('strips markdown fences', () => {
		const out = parseTranslations('```json\n{"r0": "Hi"}\n```', ids);
		expect(out!.get('r0')).toBe('Hi');
	});

	it('salvages partial objects when the model adds commentary', () => {
		const out = parseTranslations('Here you go: {"r0": "Hi", "r1": "BOOM!"} hope that helps', ids);
		expect(out!.get('r0')).toBe('Hi');
		expect(out!.get('r1')).toBe('BOOM!');
	});

	it('ignores unknown ids and empty texts', () => {
		const out = parseTranslations('{"r0": "Hi", "rX": "sneaky", "r1": ""}', ids);
		expect([...out!.keys()]).toEqual(['r0']);
	});

	it('returns null when nothing parses', () => {
		expect(parseTranslations('I am sorry, I cannot do that', ids)).toBeNull();
		expect(parseTranslations('', ids)).toBeNull();
	});

	it('un-escapes embedded quotes', () => {
		const out = parseTranslations('{"r0": "He said \\"hi\\""}', ids);
		expect(out!.get('r0')).toBe('He said "hi"');
	});

	it('preserves \\n line breaks (multi-line bubble paragraphs)', () => {
		const out = parseTranslations('{"r0": "Hello there.\\nSecond line."}', ids);
		expect(out!.get('r0')).toBe('Hello there.\nSecond line.');
	});

	it('maps positional index aliases (r0, r1, r2 or 0, 1, 2) to actual numeric region IDs', () => {
		const numericRegions = [
			{ id: '22356', text: '龙字军夜袭“黑风寨”' },
			{ id: '22357', text: '肥字军剿灭水贼' },
			{ id: '22358', text: '鱼字军剿灭' },
		];
		const numIds = new Set(numericRegions.map((r) => r.id));

		// Model returned r0, 22357, r2
		const mixed = parseTranslations(
			'{"r0": "The Long Army night raids Black Wind Fortress", "22357": "The Fat Army wipes out water bandits", "r2": "The Fish Army wipes out..."}',
			numIds,
			numericRegions,
		);
		expect(mixed!.get('22356')).toBe('The Long Army night raids Black Wind Fortress');
		expect(mixed!.get('22357')).toBe('The Fat Army wipes out water bandits');
		expect(mixed!.get('22358')).toBe('The Fish Army wipes out...');

		// Model returned 0, 1, 2
		const zeroBased = parseTranslations('{"0": "A", "1": "B", "2": "C"}', numIds, numericRegions);
		expect(zeroBased!.get('22356')).toBe('A');
		expect(zeroBased!.get('22357')).toBe('B');
		expect(zeroBased!.get('22358')).toBe('C');
	});
});

describe('getKnownSfxTranslation', () => {
	it('maps known Chinese onomatopoeia to canonical ALL-CAPS translations', () => {
		expect(getKnownSfxTranslation('哒')).toBe('TAP!');
		expect(getKnownSfxTranslation('哒！')).toBe('TAP!');
		expect(getKnownSfxTranslation('嗒')).toBe('STEP!');
		expect(getKnownSfxTranslation('啪')).toBe('SNAP!');
		expect(getKnownSfxTranslation('咚')).toBe('THUD!');
		expect(getKnownSfxTranslation('嗖')).toBe('SWOOSH!');
		expect(getKnownSfxTranslation('唰')).toBe('SWISH!');
		expect(getKnownSfxTranslation('轰')).toBe('BOOM!');
		expect(getKnownSfxTranslation('咔嚓')).toBe('CRACK!');
	});

	it('maps known Russian onomatopoeia and recovers Cyrillic OCR noise', () => {
		expect(getKnownSfxTranslation('хрусть', 'ru')).toBe('CRACK!');
		expect(getKnownSfxTranslation('хрусь', 'ru')).toBe('SNAP!');
		expect(getKnownSfxTranslation('бум', 'ru')).toBe('BOOM!');
		expect(getKnownSfxTranslation('вжух', 'ru')).toBe('SWOOSH!');
		expect(getKnownSfxTranslation('бабах', 'ru')).toBe('KABOOM!');
		// OCR leetspeak recovery for (4PyCTb
		expect(getKnownSfxTranslation('(4PyCTb', 'ru')).toBe('CRACK!');
		expect(getKnownSfxTranslation('4PyCTb')).toBe('CRACK!');
	});

	it('maps Japanese, Korean, French, and Spanish onomatopoeia', () => {
		expect(getKnownSfxTranslation('ドキドキ', 'ja')).toBe('BA-DUMP!');
		expect(getKnownSfxTranslation('ドン', 'ja')).toBe('BOOM!');
		expect(getKnownSfxTranslation('쿵', 'ko')).toBe('THUD!');
		expect(getKnownSfxTranslation('vlan', 'fr')).toBe('WHAM!');
		expect(getKnownSfxTranslation('pum', 'es')).toBe('BOOM!');
	});

	it('returns null for non-SFX text', () => {
		expect(getKnownSfxTranslation('正在建造伐木场')).toBeNull();
		expect(getKnownSfxTranslation('Привет, как дела?')).toBeNull();
		expect(getKnownSfxTranslation('你好')).toBeNull();
		expect(getKnownSfxTranslation('')).toBeNull();
	});
});

describe('looksDegenerate', () => {
	it('flags empty and over-expanded translations', () => {
		expect(looksDegenerate('', '你好')).toBe(true);
		expect(
			looksDegenerate(
				'This is an extremely long multi-paragraph explanation that far exceeds any reasonable translation ratio for a two-character phrase',
				'你好',
			),
		).toBe(true);
	});

	it('flags pure ellipsis output when the source was not an ellipsis', () => {
		expect(looksDegenerate('...', '哒')).toBe(true);
		expect(looksDegenerate('……', '哒')).toBe(true);
		expect(looksDegenerate('.', '嗒')).toBe(true);
	});

	it('accepts legitimate ellipsis translations when source was an ellipsis', () => {
		expect(looksDegenerate('...', '……')).toBe(false);
		expect(looksDegenerate('...', '...')).toBe(false);
	});

	it('accepts sane translations', () => {
		expect(looksDegenerate('Hello', '你好')).toBe(false);
		expect(looksDegenerate('BOOM!', '轰')).toBe(false);
		expect(looksDegenerate('TAP!', '哒')).toBe(false);
		expect(looksDegenerate('The Dragon Army night raids Black Wind Stronghold', '龙字军夜袭“黑风寨”')).toBe(false);
		expect(looksDegenerate('The Fish Army wipes out...', '鱼字军剿灭')).toBe(false);
	});
});

// -- END-TO-END (FAKE LLM) -- //

describe('translatePage', () => {
	const regions = [
		{ id: 'r0', text: '你好' },
		{ id: 'r1', text: '轰' },
	];

	it('returns a translation per region with accrued usage', async () => {
		const { client } = fakeClient(['{"r0": "Hello", "r1": "BOOM!"}']);
		const result = await translatePage(regions, [], PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Hello');
		expect(result.byRegion.get('r1')).toBe('BOOM!');
		expect(result.usage.promptTokens).toBe(100);
		expect(result.usage.completionTokens).toBe(20);
	});

	it('extracts newTerms from combined single-call LLM response and filters known terms', async () => {
		const pageRegions = [
			{ id: 'r0', text: '叶凡来到了紫山！' },
			{ id: 'r1', text: '你好' },
		];
		const responseJson = JSON.stringify({
			translations: { r0: 'Ye Fan arrived at Purple Mountain!', r1: 'Hello' },
			newTerms: [
				{ source: '叶凡', target: 'Ye Fan', category: 'character', gender: 'masculine' },
				{ source: '紫山', target: 'Purple Mountain', category: 'location' },
			],
		});
		// If 叶凡 is already in known terms, it should be filtered out from newTerms
		const existingTerms: TermDraft[] = [
			{ source: '叶凡', target: 'Ye Fan', category: 'character', gender: 'masculine', status: 'user' },
		];
		const { client } = fakeClient([responseJson]);
		const result = await translatePage(pageRegions, existingTerms, PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Ye Fan arrived at Purple Mountain!');
		expect(result.byRegion.get('r1')).toBe('Hello');
		expect(result.newTerms).toHaveLength(1);
		expect(result.newTerms![0].source).toBe('紫山');
		expect(result.newTerms![0].target).toBe('Purple Mountain');
	});

	it('replaces degenerate ellipsis on an SFX with canonical fallback', async () => {
		const sfxRegions = [
			{ id: 'r0', text: '正在建造伐木场' },
			{ id: 'r1', text: '哒' },
		];
		// Pass 1: r1 returns degenerate '...'
		// Refill: r1 still returns degenerate '...'
		// Expected: r1 gets replaced by KNOWN_CHINESE_SFX canonical 'TAP!'
		const { client } = fakeClient(['{"r0": "Building the lumber camp", "r1": "..."}', '{"r1": "..."}']);
		const result = await translatePage(sfxRegions, [], PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Building the lumber camp');
		expect(result.byRegion.get('r1')).toBe('TAP!');
	});

	it('refills regions the first pass missed or mangled', async () => {
		const { client, callCount } = fakeClient([
			'{"r0": "Hello"}', // r1 MISSING
			'{"r1": "BOOM!"}',
		]);
		const result = await translatePage(regions, [], PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Hello');
		expect(result.byRegion.get('r1')).toBe('BOOM!');
		expect(callCount()).toBe(2);
	});

	it('leaves a region empty when the refill also fails', async () => {
		const { client, callCount } = fakeClient([
			'{"r0": "Hello"}', // r1 MISSING
			'{"r0": "ignored"}', // r1 STILL MISSING
		]);
		const result = await translatePage(regions, [], PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Hello');
		expect(result.byRegion.get('r1')).toBeUndefined();
		expect(callCount()).toBe(2);
	});

	it('drops degenerate (over-expanded) translations and refills them', async () => {
		const { client, callCount } = fakeClient([
			'{"r0": "This is an extremely long multi-paragraph explanation that far exceeds any reasonable translation ratio for a two-character phrase in Chinese", "r1": "BOOM!"}', // r0 DEGENERATE
			'{"r0": "Hi"}',
		]);
		const result = await translatePage(regions, [], PAIR, { client });
		expect(result.byRegion.get('r0')).toBe('Hi');
		expect(callCount()).toBe(2);
	});

	it('empty region list short-circuits without calling the LLM', async () => {
		const { client, callCount } = fakeClient(['nope']);
		const result = await translatePage([], [], PAIR, { client });
		expect(result.byRegion.size).toBe(0);
		expect(callCount()).toBe(0);
	});

	it('the fake client receives the model allowlisted', async () => {
		let seenModel = '';
		const client = {
			chat: {
				completions: {
					create: async (params: { model: string }) => {
						seenModel = params.model;
						return { choices: [{ message: { content: '{"r0": "Hi"}' } }], usage: undefined };
					},
				},
			},
		} as unknown as OpenAI;
		await translatePage(regions, [], PAIR, { client, model: 'gpt-4' }); // NOT ALLOWLISTED
		expect(seenModel).not.toBe('gpt-4'); // resolveModel FALLS BACK TO THE DEFAULT
	});
});

describe('parseExtractedTerms & extractTerms', () => {
	it('parses valid AI extracted terms JSON array or wrapped object', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		const json = `{"terms": [
			{ "source": "叶凡", "target": "Ye Fan", "category": "character", "gender": "masculine", "context": "Protagonist", "aliases": ["小凡"] },
			{ "source": "紫山", "target": "Purple Mountain", "category": "location", "gender": "neuter" }
		]}`;
		const terms = parseExtractedTerms(json);
		expect(terms).toHaveLength(2);
		expect(terms[0].source).toBe('叶凡');
		expect(terms[0].target).toBe('Ye Fan');
		expect(terms[0].category).toBe('character');
		expect(terms[0].gender).toBe('masculine');
		expect(terms[0].aliases).toEqual(['小凡']);
		expect(terms[0].status).toBe('ai');
		expect(terms[1].category).toBe('location');
	});

	it('salvages complete term objects from a truncated JSON response', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		// Truncated mid-stream before closing array / object
		const truncated = `{"terms": [
			{ "source": "林动", "target": "Lin Dong", "category": "character", "gender": "masculine" },
			{ "source": "青檀", "target": "Qing Tan", "category": "character", "gender": "feminine" },
			{ "source": "大荒宗", "target": "Great Desolate`;
		const terms = parseExtractedTerms(truncated);
		expect(terms).toHaveLength(2);
		expect(terms[0].source).toBe('林动');
		expect(terms[0].target).toBe('Lin Dong');
		expect(terms[1].source).toBe('青檀');
		expect(terms[1].target).toBe('Qing Tan');
	});

	it('filters out hallucinated terms when contentSource is provided', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		const json = `[
			{ "source": "萧炎", "target": "Xiao Yan", "category": "character" },
			{ "source": "药老", "target": "Yao Lao", "category": "character" }
		]`;
		// "药老" is NOT in the chapter text
		const terms = parseExtractedTerms(json, '萧炎大喝一声，冲上前去！');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('萧炎');
	});

	it('auto-pins recurring multi-char terms even when the model omits pinned:true', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		// 妖灵师 appears 3× across the chapter — a recurring class noun MUST be locked (pinned) so it
		// renders identically on every page ("demon spiritualist" everywhere, never "Spirit Master").
		const json = `[
			{ "source": "妖灵师", "target": "demon spiritualist", "category": "concept" },
			{ "source": "神圣世家", "target": "Sacred Family", "category": "organization" }
		]`;
		const chapterText = '妖灵师和武者都有等级。妖灵师可以吸收妖灵。成为黄金妖灵师！这里属于神圣世家。';
		const terms = parseExtractedTerms(json, chapterText);
		const yao = terms.find((t) => t.source === '妖灵师');
		const sheng = terms.find((t) => t.source === '神圣世家');
		// 妖灵师 recurs → auto-pinned; 神圣世家 appears once → NOT auto-pinned.
		expect(yao?.pinned).toBe(true);
		expect(sheng?.pinned).toBe(false);
	});

	it('does not auto-pin single-character or single-occurrence terms', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		const json = `[
			{ "source": "剑", "target": "Blade", "category": "item" },
			{ "source": "紫山", "target": "Purple Mountain", "category": "location" }
		]`;
		// "剑" is 1 char (never auto-pinned); "紫山" appears once (never auto-pinned).
		const terms = parseExtractedTerms(json, '他拔剑。紫山在远方。');
		expect(terms.find((t) => t.source === '剑')?.pinned).toBe(false);
		expect(terms.find((t) => t.source === '紫山')?.pinned).toBe(false);
	});

	it('extractTerms passes ESTABLISHED GLOSSARY when knownTerms are supplied', async () => {
		const { extractTerms } = await import('$lib/server/translate');
		let sentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
		const client = {
			chat: {
				completions: {
					create: async (params: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
						sentMessages = params.messages;
						return {
							choices: [
								{
									message: {
										content:
											'{"terms": [{"source": "姬紫月", "target": "Ji Ziyue", "category": "character", "gender": "feminine"}]}',
									},
								},
							],
							usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		const known = [
			{ source: '叶凡', target: 'Ye Fan', gender: 'masculine' as const, status: 'user' as const, pinned: true },
		];
		const { terms, usage } = await extractTerms('姬紫月来到了紫山', PAIR, { client, knownTerms: known });
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('姬紫月');
		expect(terms[0].target).toBe('Ji Ziyue');
		expect(terms[0].gender).toBe('feminine');
		expect(usage.promptTokens).toBeGreaterThan(0);

		// Verify established glossary message was sent
		const establishedMsg = sentMessages.find(
			(m) => typeof m.content === 'string' && m.content.includes('ESTABLISHED GLOSSARY'),
		);
		expect(establishedMsg).toBeDefined();
		expect(String(establishedMsg?.content)).toContain('叶凡 = Ye Fan');
	});

	it('supports Japanese target language in systemPrompt and translation flow', async () => {
		const jaPair = { sourceLang: 'zh-Hans', targetLang: 'ja' };
		const p = systemPrompt(jaPair.sourceLang, jaPair.targetLang);
		expect(p).toContain('Japanese');
		expect(p).toContain('zh-Hans');

		const fakeClient = {
			chat: {
				completions: {
					create: async (params: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
						const sysMsg = params.messages.find((m) => m.role === 'system')?.content as string;
						expect(sysMsg).toContain('Japanese');
						return {
							choices: [{ message: { content: '{"r1": "こんにちは！"}' } }],
							usage: { prompt_tokens: 10, completion_tokens: 5 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		const res = await translatePage([{ id: 'r1', text: '你好！' }], [], jaPair, { client: fakeClient });
		expect(res.byRegion.get('r1')).toBe('こんにちは！');
	});

	it('supports Russian source language translation and resolves Cyrillic OCR noise on SFX', async () => {
		const ruPair = { sourceLang: 'ru', targetLang: 'en' };
		const ruRegions = [
			{ id: '34671', text: 'ДОНОВАН В ПОСЛЕДНЕЕ ВРЕМЯ И ПРАВДА КАКОЙ-ТО ДЁРГАНЫЙ...' },
			{ id: '34673', text: '(4PyCTb', kind: 'free_text' },
		];

		// Case 1: LLM recognizes and translates (4PyCTb -> CRACK!
		const fakeClient1 = {
			chat: {
				completions: {
					create: async (params: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
						const sysMsg = params.messages.find((m) => m.role === 'system')?.content as string;
						expect(sysMsg).toContain('Russian & Cyrillic Comic Localization Rules');
						return {
							choices: [
								{
									message: {
										content:
											'{"34671": "Donovan has been really jumpy lately...", "34673": "CRACK!"}',
									},
								},
							],
							usage: { prompt_tokens: 15, completion_tokens: 8 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		const res1 = await translatePage(ruRegions, [], ruPair, { client: fakeClient1 });
		expect(res1.byRegion.get('34671')).toBe('Donovan has been really jumpy lately...');
		expect(res1.byRegion.get('34673')).toBe('CRACK!');

		// Case 2: LLM fails / returns degenerate on (4PyCTb, fallback resolves via getKnownSfxTranslation
		const fakeClient2 = {
			chat: {
				completions: {
					create: async () => ({
						choices: [
							{
								message: {
									content: '{"34671": "Donovan has been really jumpy lately...", "34673": "..."}',
								},
							},
						],
						usage: { prompt_tokens: 15, completion_tokens: 8 },
					}),
				},
			},
		} as unknown as OpenAI;

		const res2 = await translatePage(ruRegions, [], ruPair, { client: fakeClient2 });
		expect(res2.byRegion.get('34671')).toBe('Donovan has been really jumpy lately...');
		expect(res2.byRegion.get('34673')).toBe('CRACK!');
	});

	it('supports Korean target language translation for Chinese dialogue', async () => {
		const koPair = { sourceLang: 'zh-Hans', targetLang: 'ko' };
		const p = systemPrompt(koPair.sourceLang, koPair.targetLang);
		expect(p).toContain('Korean (ko)');
		expect(p).toContain('Output Language Requirement');

		const koRegions = [
			{ id: '35477', text: '老师老师，你没\n受伤吧？' },
			{ id: '35478', text: '当然没有，他们\n这些三脚猫的功夫\n哪儿能跟我比！' },
			{ id: '35479', text: '老师，你真的会\n功夫啊？' },
		];

		const uPrompt = userPrompt(koRegions, koPair.targetLang);
		expect(uPrompt).toContain('into Korean');

		const { client } = fakeClient([
			JSON.stringify({
				'35477': '선생님, 선생님, 다치지 않으셨어요?',
				'35478': '당연히 안 다쳤지, 저런 어설픈 실력들이 감히 나랑 상대가 되겠냐!',
				'35479': '선생님, 진짜 무공 할 줄 아세요?',
			}),
		]);

		const res = await translatePage(koRegions, [], koPair, { client });
		expect(res.byRegion.size).toBe(3);
		expect(res.byRegion.get('35477')).toBe('선생님, 선생님, 다치지 않으셨어요?');
		expect(res.byRegion.get('35478')).toBe('당연히 안 다쳤지, 저런 어설픈 실력들이 감히 나랑 상대가 되겠냐!');
		expect(res.byRegion.get('35479')).toBe('선생님, 진짜 무공 할 줄 아세요?');
	});

	it('sanitizes bubble tail OCR digits and stray border parentheses', () => {
		// Case 1: Trailing bubble tail digits / dots after terminal punctuation
		const cleanTail1 = sanitizeTranslationArtifacts(
			"Let's see how long you can keep up that attitude! 20...",
			'我看你能嚣张\n到什么时候！20……',
		);
		expect(cleanTail1).toBe("Let's see how long you can keep up that attitude!");

		// Case 2: Unmatched leading parenthesis from circular speech bubble outline
		const cleanParen1 = sanitizeTranslationArtifacts(
			"(You're still traumatized by that pond!)",
			'(你对池塘都\n有阴影了！',
		);
		expect(cleanParen1).toBe("You're still traumatized by that pond!");

		const cleanParen2 = sanitizeTranslationArtifacts(
			"(You're still traumatized by that pond!",
			'(你对池塘都\n有阴影了！',
		);
		expect(cleanParen2).toBe("You're still traumatized by that pond!");

		// Case 3: Legitimate paired parenthetical remarks should NOT be stripped
		const cleanLegit = sanitizeTranslationArtifacts('(whispering) Be quiet!', '（小声）安静点！');
		expect(cleanLegit).toBe('(whispering) Be quiet!');
	});
});
