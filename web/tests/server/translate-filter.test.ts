// PRE-TRANSLATION CLASSIFICATION & UNTRANSLATABLE FILTER TESTS
import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import {
	classifyRegionForTranslation,
	resolveDialoguePunctuation,
	translatePage,
	type RegionSource,
} from '$lib/server/translate';

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

describe('resolveDialoguePunctuation', () => {
	it('converts CJK and fullwidth punctuation to canonical Latin punctuation', () => {
		expect(resolveDialoguePunctuation('……')).toBe('...');
		expect(resolveDialoguePunctuation('！？')).toBe('!?');
		expect(resolveDialoguePunctuation('？？')).toBe('??');
		expect(resolveDialoguePunctuation('！！！')).toBe('!!!');
		expect(resolveDialoguePunctuation('......')).toBe('...');
		expect(resolveDialoguePunctuation('～')).toBe('~');
	});

	it('returns null for text containing alphanumeric or CJK characters', () => {
		expect(resolveDialoguePunctuation('你好...')).toBeNull();
		expect(resolveDialoguePunctuation('E2...')).toBeNull();
		expect(resolveDialoguePunctuation('Hello!')).toBeNull();
	});
});

describe('classifyRegionForTranslation', () => {
	it('classifies stray isolated alphanumeric noise in CJK source as skip_empty', () => {
		const strayCases = ['E2', '2', 'E', 'o0', 'A1', '100', '00', 'B', '3', 'x', '7B'];
		for (const text of strayCases) {
			const res = classifyRegionForTranslation(
				{ id: 'r1', text, kind: 'dialogue' },
				'zh-Hans',
				'en',
			);
			expect(res.disposition).toBe('skip_empty');
			expect(res.resolvedTarget).toBe('');
		}
	});

	it('preserves existing English sound effects as skip_empty to retain raw artist artwork', () => {
		const sfxCases = ['MEOW', 'BOOM!', 'BANG', 'AHHH', 'SWOOSH', 'ZAP', 'HAHAHA', 'KYAA!'];
		for (const text of sfxCases) {
			const res = classifyRegionForTranslation(
				{ id: 'r1', text, kind: 'sound_effect' },
				'zh-Hans',
				'en',
			);
			expect(res.disposition).toBe('skip_empty');
			expect(res.resolvedTarget).toBe('');
		}
	});

	it('resolves pure punctuation directly without LLM', () => {
		const punctCases = ['...', '！？', '???', '……', '!'];
		for (const text of punctCases) {
			const res = classifyRegionForTranslation(
				{ id: 'r1', text, kind: 'dialogue' },
				'zh-Hans',
				'en',
			);
			expect(res.disposition).toBe('direct_punctuation');
			expect(res.resolvedTarget).toBeTruthy();
		}
	});

	it('dispatches Korean and CJK sound effects to the LLM for contextual neural translation', () => {
		const sfxCases = ['냠냠', '남남', '쩝쩝', '접접', '우물우물', '오물오물', '후루룩', '꿀꺽', '바스락'];
		for (const text of sfxCases) {
			const res = classifyRegionForTranslation(
				{ id: 'r1', text, kind: 'sound_effect' },
				'ko',
				'en',
			);
			expect(res.disposition).toBe('translate');
		}
	});

	it('marks genuine CJK dialogue and story text for LLM translation', () => {
		const translatableCases = [
			'你好，主角！',
			'第2话 开始',
			'Level 99 勇者',
			'这是什么东西？',
			'快看那个人！',
		];
		for (const text of translatableCases) {
			const res = classifyRegionForTranslation(
				{ id: 'r1', text, kind: 'dialogue' },
				'zh-Hans',
				'en',
			);
			expect(res.disposition).toBe('translate');
		}
	});
});

describe('translatePage with Pre-Filtering', () => {
	it('completely bypasses the LLM API when all page regions are noise, punctuation, or Latin SFX', async () => {
		const { client, callCount } = fakeClient(['{"r0": "should not be called"}']);
		const regions: RegionSource[] = [
			{ id: 'r0', text: 'E2', kind: 'dialogue' },
			{ id: 'r1', text: 'MEOW', kind: 'sound_effect' },
			{ id: 'r2', text: '……', kind: 'dialogue' },
		];

		const res = await translatePage(regions, [], { sourceLang: 'zh-Hans', targetLang: 'en' }, {
			client,
		});

		expect(callCount()).toBe(0);
		expect(res.byRegion.get('r0')).toBe('');
		expect(res.byRegion.get('r1')).toBe('');
		expect(res.byRegion.get('r2')).toBe('...');
		expect(res.usage.promptTokens).toBe(0);
		expect(res.usage.completionTokens).toBe(0);
	});

	it('only sends translatable dialogue to the LLM, saving tokens for filtered noise and SFX', async () => {
		const { client, callCount } = fakeClient([
			JSON.stringify({ r0: 'Hello, Master!' }),
		]);
		const regions: RegionSource[] = [
			{ id: 'r0', text: '师尊，你好！', kind: 'dialogue' },
			{ id: 'r1', text: 'E2', kind: 'dialogue' },
			{ id: 'r2', text: 'BOOM', kind: 'sound_effect' },
			{ id: 'r3', text: '！？', kind: 'dialogue' },
		];

		const res = await translatePage(regions, [], { sourceLang: 'zh-Hans', targetLang: 'en' }, {
			client,
		});

		expect(callCount()).toBe(1);
		expect(res.byRegion.get('r0')).toBe('Hello, Master!');
		expect(res.byRegion.get('r1')).toBe('');
		expect(res.byRegion.get('r2')).toBe('');
		expect(res.byRegion.get('r3')).toBe('!?');
	});
});
