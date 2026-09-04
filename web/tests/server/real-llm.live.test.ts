// LIVE INTEGRATION TEST FOR ALIBABA MODEL STUDIO CUSTOM LLM ENDPOINT (QWEN 3.8 FLASH)
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { type RegionSource } from '$lib/server/translate/prompts';
import { translatePage } from '$lib/server/translate';
import { pageCacheKey, getCachedPageTranslation, savePageTranslation } from '$lib/server/cache';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage } from '../helpers/db';
import type { LangPair, TermDraft } from '$lib/types';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

const runLive = process.env.TEST_REAL_LLM === '1';

describe.runIf(runLive)('Alibaba Model Studio Live Pipeline (qwen3.8-flash)', () => {
	const DB_PATH = 'C:/Users/Admin/AppData/Roaming/XianScan/data/xianscan.db';
	const sqlite = new Database(DB_PATH, { readonly: true });
	const custom = sqlite
		.prepare('SELECT id, name, base_url, active_model, api_key FROM ai_providers WHERE id = ?')
		.get('custom') as { id: string; name: string; base_url: string; active_model: string; api_key: string } | undefined;

	if (!custom || !custom.api_key) return;

	const client = new OpenAI({
		apiKey: custom.api_key,
		baseURL: custom.base_url,
	});

	const pair: LangPair = { sourceLang: 'zh-Hans', targetLang: 'en' };
	let page1ExtractedTerms: TermDraft[] = [];

	it('1. translates page 1 and extracts terms using translatePage()', async () => {
		const page1Regions: RegionSource[] = [
			{ id: 'r0', text: '叶凡！你竟敢擅闯太玄门禁地！', kind: 'dialogue_bubble', pos: 'top-right' },
			{ id: 'r1', text: '今日便让你见识我姬家的大虚空术！', kind: 'dialogue_bubble', pos: 'center' },
			{ id: 'r2', text: '轰！！', kind: 'onomatopoeia', pos: 'bottom-left' },
		];

		const t0 = Date.now();
		const result = await translatePage(page1Regions, [], pair, {
			client,
			model: 'qwen3.8-flash',
			providerId: 'custom',
			enableSfx: true,
		});
		const duration = Date.now() - t0;

		console.log('\n========================================');
		console.log('[PAGE 1 LIVE TRANSLATION - QWEN 3.8 FLASH]');
		console.log('Model:', result.usage.model);
		console.log('Duration:', duration, 'ms');
		console.log('Translations:');
		for (const [id, text] of result.byRegion) {
			console.log(`  ${id}: ${text}`);
		}
		console.log('Extracted Terms Count:', result.newTerms?.length ?? 0);
		console.log('Extracted Terms:', result.newTerms);
		console.log('Usage:', result.usage);
		console.log('========================================\n');

		expect(result.byRegion.has('r0')).toBe(true);
		expect(result.byRegion.has('r1')).toBe(true);
		expect(result.byRegion.has('r2')).toBe(true);
		expect(result.byRegion.get('r0')?.toLowerCase()).toContain('ye fan');
		expect(result.newTerms && result.newTerms.length > 0).toBe(true);

		page1ExtractedTerms = result.newTerms ?? [];
	}, 30000);

	it('2. translates page 2 with accumulated terms and measures live prompt cache hit', async () => {
		const accumulatedTerms: TermDraft[] = [
			...page1ExtractedTerms.map((t) => ({ ...t, status: 'ai' as const })),
		];

		const page2Regions: RegionSource[] = [
			{ id: 'r0', text: '姬皓月，你以为大虚空术就能困住我吗？', kind: 'dialogue_bubble', pos: 'top-left' },
			{ id: 'r1', text: '给我破！', kind: 'dialogue_bubble', pos: 'center' },
		];

		const t0 = Date.now();
		const result = await translatePage(page2Regions, accumulatedTerms, pair, {
			client,
			model: 'qwen3.8-flash',
			providerId: 'custom',
			enableSfx: true,
		});
		const duration = Date.now() - t0;

		console.log('\n========================================');
		console.log('[PAGE 2 LIVE TRANSLATION - QWEN 3.8 FLASH]');
		console.log('Model:', result.usage.model);
		console.log('Duration:', duration, 'ms');
		console.log('Translations:');
		for (const [id, text] of result.byRegion) {
			console.log(`  ${id}: ${text}`);
		}
		console.log('Usage:', result.usage);
		console.log('Prompt Tokens:', result.usage.promptTokens);
		console.log('Cached Tokens Hit:', result.usage.cachedTokens);
		console.log('========================================\n');

		expect(result.byRegion.has('r0')).toBe(true);
		expect(result.byRegion.has('r1')).toBe(true);
		// VERIFY TERMINOLOGY CONSISTENCY
		expect(result.byRegion.get('r0')).toMatch(/Great Void/i);
	}, 30000);

	it('3. verifies local SQLite translation memoization roundtrip', () => {
		const testDb = getTestDb();
		resetDb();
		seedBook(testDb, { id: 'live-test-book' });
		const chapter = seedChapter(testDb, { bookId: 'live-test-book', seq: 0 });
		const page = seedPage(testDb, { chapterId: chapter.id, seq: 0 });

		const regions: RegionSource[] = [
			{ id: 'r0', text: '叶凡！你竟敢擅闯太玄门禁地！' },
		];
		const key = pageCacheKey(regions, [], 'qwen3.8-flash', pair);
		expect(key).toBeTruthy();

		const testTranslations = new Map([
			['r0', 'Ye Fan! How dare you trespass into the forbidden ground of the Tai Xuan Sect!'],
		]);

		savePageTranslation(page.id, key, testTranslations, 'qwen3.8-flash', {
			model: 'qwen3.8-flash',
			promptTokens: 2900,
			cachedTokens: 2048,
			completionTokens: 100,
		});

		const cached = getCachedPageTranslation(page.id, key);
		expect(cached).toBeTruthy();
		expect(cached?.byRegion.get('r0')).toBe(testTranslations.get('r0'));
		expect(cached?.usage?.cachedTokens).toBe(2048);
	});
});
