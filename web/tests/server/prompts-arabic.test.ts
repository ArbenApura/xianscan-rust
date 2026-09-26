// ARABIC PROMPT PROFILE AND SCRIPT-AWARE PROMPTS (FEAT-007 PHASE 7)
import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { PROMPT_VERSION, systemPrompt, translatePage, translateSingleText } from '$lib/server/translate';
import { getTargetLanguageProfile } from '$lib/server/translate/prompts';

function recordingClient(content: string) {
	const calls: { messages: { role: string; content: string }[] }[] = [];
	const client = {
		chat: {
			completions: {
				create: async (args: { messages: { role: string; content: string }[] }) => {
					calls.push(args);
					return { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
				},
			},
		},
	} as unknown as OpenAI;
	return { client, calls };
}

describe('Arabic target profile', () => {
	it('covers Arabic punctuation, the dual and has no whitespace-only lines', () => {
		const profile = getTargetLanguageProfile('ar');
		expect(profile).toContain('،');
		expect(profile).toContain('؟');
		expect(profile).toMatch(/Dual/);
		expect(profile).not.toMatch(/\n[ \t]+\n/);
	});
});

describe('systemPrompt casing rules follow the target script', () => {
	it('Arabic has no sentence case or lowercase continuation', () => {
		const ar = systemPrompt('zh-Hans', 'ar');
		expect(ar).not.toContain('lowercase continuation');
		expect(ar).not.toContain('sentence case');
		expect(ar).toContain('؟');
	});

	it('English keeps them', () => {
		const en = systemPrompt('zh-Hans', 'en');
		expect(en).toContain('lowercase continuation');
		expect(en).toContain('sentence case');
		expect(en).toContain('follow the TARGET SPECIFICS section instead');
	});
});

describe('single-text prompts', () => {
	it('the term prompt transliterates into Arabic script instead of Pinyin', async () => {
		const ar = recordingClient('يي فان');
		await translateSingleText('叶凡', { sourceLang: 'zh-Hans', targetLang: 'ar' }, { kind: 'term', client: ar.client });
		const arSystem = ar.calls[0].messages.find((m) => m.role === 'system')?.content ?? '';
		expect(arSystem).not.toContain('Pinyin');
		expect(arSystem).toContain('transliterate');

		const en = recordingClient('Ye Fan');
		await translateSingleText('叶凡', { sourceLang: 'zh-Hans', targetLang: 'en' }, { kind: 'term', client: en.client });
		expect(en.calls[0].messages.find((m) => m.role === 'system')?.content).toContain('Pinyin');
	});

	it('the prompt version was bumped', () => {
		expect(PROMPT_VERSION).toBe('v24');
	});
});

describe('SFX dictionary fallback', () => {
	const regions = [{ id: 'r1', text: '啪', kind: 'dialogue_bubble' }] as never;
	const empty = JSON.stringify({ translations: {}, newTerms: [] });

	// AN EMPTY RESPONSE GOES THROUGH THE REAL withRetry BACKOFF (ABOUT 5 S), SO BOTH TESTS NEED A LONGER TIMEOUT
	it('fills an untranslated English region', { timeout: 30_000 }, async () => {
		const { client } = recordingClient(empty);
		const out = await translatePage(regions, [], { sourceLang: 'zh-Hans', targetLang: 'en' }, { client });
		expect(out.byRegion.get('r1')).toBe('SNAP!');
	});

	it('never puts English on an Arabic page', { timeout: 30_000 }, async () => {
		const { client } = recordingClient(empty);
		const out = await translatePage(regions, [], { sourceLang: 'zh-Hans', targetLang: 'ar' }, { client });
		expect(out.byRegion.get('r1')).toBeUndefined();
	});
});
