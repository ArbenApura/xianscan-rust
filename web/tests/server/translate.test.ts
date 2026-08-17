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
	systemPrompt,
	translatePage,
	translateSingleText,
	userPrompt,
} from '$lib/server/translate';

const PAIR = { sourceLang: 'zh-Hans', targetLang: 'en' };

function fakeClient(responses: Array<string | Error>, usage: unknown = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) {
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
	it('covers the manhua localization rules, SFX rules, and story captions', () => {
		const p = systemPrompt('zh-Hans', 'en');
		expect(p).toMatch(/manhua/);
		expect(p).toMatch(/JSON object/);
		expect(p).toContain('zh-Hans');
		expect(p).toContain('Pronouns, Omitted Subjects & Spoken Dialogue Perspective');
		expect(p).toContain('Omitted Subject (Pro-Drop) Resolution');
		expect(p).toContain('Japanese (JA)');
		expect(p).toContain('Korean (KO)');
		expect(p).toContain('Character Names, Roster Listings & Pinyin Segmentation');
		expect(p).toContain('Single & Multi-Character Given Name Fusion');
		expect(p).toContain('Chen Beixuan');
		expect(p).toContain('Beixuan');
		expect(p).toContain('NEVER "Bei Xuan"');
		expect(p).toContain('Military Unit & Army Division Titles');
		expect(p).toContain('Floating Comic Art Captions');
		expect(p).toContain('Comic Sound Effects (SFX) & Action Onomatopoeia');
		expect(p).toContain('TAP! / STEP! / CLACK!');
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

	it('formats pinned-first with aliases, gender and context', () => {
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
		// PINNED TERM COMES FIRST
		expect(block!.indexOf('★系统')).toBeLessThan(block!.indexOf('★主角'));
	});

	it('sorts pinned terms first, then deterministically by source alphabetically for KV prompt caching', () => {
		const block = glossaryBlock(
			[
				term({ source: '李元', target: 'Li Yuan', pinned: false }),
				term({ source: '宗门', target: 'Sect', pinned: true }),
				term({ source: '阿青', target: 'A Qing', pinned: false }),
				term({ source: '掌门', target: 'Sect Leader', pinned: true }),
			],
			'zh-Hans',
			'en',
		);
		// Pinned terms come first
		expect(block!.indexOf('★宗门')).toBeLessThan(block!.indexOf('★李元'));
		expect(block!.indexOf('★掌门')).toBeLessThan(block!.indexOf('★李元'));
		// Unpinned terms are sorted deterministically (李 precedes 阿 in code point order)
		expect(block!.indexOf('★李元')).toBeLessThan(block!.indexOf('★阿青'));
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
	it('carries ids and text for every region', () => {
		const p = userPrompt([
			{ id: 'r0', text: '轰' },
			{ id: 'r1', text: '你好' },
		]);
		expect(p).toContain('"id": "r0"');
		expect(p).toContain('"text": "轰"');
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
		const zeroBased = parseTranslations(
			'{"0": "A", "1": "B", "2": "C"}',
			numIds,
			numericRegions,
		);
		expect(zeroBased!.get('22356')).toBe('A');
		expect(zeroBased!.get('22357')).toBe('B');
		expect(zeroBased!.get('22358')).toBe('C');
	});
});

describe('getKnownSfxTranslation', () => {
	it('maps known onomatopoeia to canonical ALL-CAPS translations', () => {
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

	it('returns null for non-SFX text', () => {
		expect(getKnownSfxTranslation('正在建造伐木场')).toBeNull();
		expect(getKnownSfxTranslation('你好')).toBeNull();
		expect(getKnownSfxTranslation('')).toBeNull();
	});
});

describe('looksDegenerate', () => {
	it('flags empty and over-expanded translations', () => {
		expect(looksDegenerate('', '你好')).toBe(true);
		expect(looksDegenerate('This is an extremely long multi-paragraph explanation that far exceeds any reasonable translation ratio for a two-character phrase', '你好')).toBe(true);
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
		const { client } = fakeClient([
			'{"r0": "Building the lumber camp", "r1": "..."}',
			'{"r1": "..."}',
		]);
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

	it('auto-derives standalone given name as alias for 3-character names', async () => {
		const { parseExtractedTerms } = await import('$lib/server/translate');
		const json = `{"terms": [
			{ "source": "陈北玄", "target": "Chen Beixuan", "category": "character", "gender": "masculine" }
		]}`;
		const terms = parseExtractedTerms(json, '陈北玄在此，北玄定不辱命！');
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('陈北玄');
		expect(terms[0].target).toBe('Chen Beixuan');
		expect(terms[0].aliases).toContain('北玄');
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

	it('extractTerms passes ESTABLISHED GLOSSARY when knownTerms are supplied', async () => {
		const { extractTerms } = await import('$lib/server/translate');
		let sentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
		const client = {
			chat: {
				completions: {
					create: async (params: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
						sentMessages = params.messages;
						return {
							choices: [{ message: { content: '{"terms": [{"source": "姬紫月", "target": "Ji Ziyue", "category": "character", "gender": "feminine"}]}' } }],
							usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
						};
					},
				},
			},
		} as unknown as OpenAI;

		const known = [{ source: '叶凡', target: 'Ye Fan', gender: 'masculine' as const, status: 'user' as const, pinned: true }];
		const { terms, usage } = await extractTerms('姬紫月来到了紫山', PAIR, { client, knownTerms: known });
		expect(terms).toHaveLength(1);
		expect(terms[0].source).toBe('姬紫月');
		expect(terms[0].target).toBe('Ji Ziyue');
		expect(terms[0].gender).toBe('feminine');
		expect(usage.promptTokens).toBeGreaterThan(0);

		// Verify established glossary message was sent
		const establishedMsg = sentMessages.find((m) => typeof m.content === 'string' && m.content.includes('ESTABLISHED GLOSSARY'));
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

		const res = await translatePage(
			[{ id: 'r1', text: '你好！' }],
			[],
			jaPair,
			{ client: fakeClient },
		);
		expect(res.byRegion.get('r1')).toBe('こんにちは！');
	});

	describe('translateSingleText with custom instructions', () => {
		it('injects custom instruction into system prompt', async () => {
			let passedSystemContent = '';
			const fakeClient = {
				chat: {
					completions: {
						create: async (params: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
							passedSystemContent = (params.messages.find((m) => m.role === 'system')?.content as string) || '';
							return {
								choices: [{ message: { content: '"By the heavens! Begone!"' } }],
								usage: { prompt_tokens: 15, completion_tokens: 8 },
							};
						},
					},
				},
			} as unknown as OpenAI;

			const result = await translateSingleText(
				'给我滚！',
				{ sourceLang: 'zh-Hans', targetLang: 'en' },
				{
					client: fakeClient,
					instruction: 'Make it sound dramatic and archaic',
				},
			);

			expect(passedSystemContent).toContain('Special user localization instruction: Make it sound dramatic and archaic');
			expect(result.text).toBe('By the heavens! Begone!');
		});
	});
});

