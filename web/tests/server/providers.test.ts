import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../helpers/db';
import {
	getProviders,
	getActiveProvider,
	getProviderById,
	updateProvider,
	seedDefaultProviders,
	maskApiKey,
} from '$lib/server/providers';

describe('providers.ts', () => {
	beforeEach(async () => {
		await resetDb();
	});

	it('seeds default providers (DeepSeek, Google, Groq, OpenRouter, OpenAI, Ollama, LM Studio, Custom) on empty DB', () => {
		const db = getTestDb();
		const providers = getProviders(db);

		expect(providers.length).toBe(8);
		const ids = providers.map((p) => p.id);
		expect(ids).toEqual([
			'deepseek',
			'google',
			'groq',
			'openrouter',
			'openai',
			'ollama',
			'lmstudio',
			'custom',
		]);

		const deepseek = providers.find((p) => p.id === 'deepseek');
		expect(deepseek).toBeDefined();
		expect(deepseek?.name).toBe('DeepSeek');
		expect(deepseek?.isDefault).toBe(true);
		expect(deepseek?.activeModel).toBe('deepseek-v4-flash');

		const google = providers.find((p) => p.id === 'google');
		expect(google).toBeDefined();
		expect(google?.name).toBe('Google AI Studio');
		expect(google?.isDefault).toBe(false);
		expect(google?.activeModel).toBe('gemini-3.7-flash');

		const groq = providers.find((p) => p.id === 'groq');
		expect(groq).toBeDefined();
		expect(groq?.name).toContain('Groq');

		const ollama = providers.find((p) => p.id === 'ollama');
		expect(ollama).toBeDefined();
		expect(ollama?.name).toContain('Ollama');
	});

	it('maskApiKey correctly masks long and short keys', () => {
		expect(maskApiKey('')).toBe('');
		expect(maskApiKey('   ')).toBe('');
		expect(maskApiKey(null)).toBe('');
		expect(maskApiKey('12345678')).toBe('••••••••');
		expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-1••••cdef');
		expect(maskApiKey('AIzaSyAbcdef123456')).toBe('AIza••••3456');
	});

	it('getActiveProvider returns the default provider', () => {
		const db = getTestDb();
		const active = getActiveProvider(db);
		expect(active.id).toBe('deepseek');
		expect(active.isDefault).toBe(true);
	});

	it('updateProvider updates apiKey and changes active model', () => {
		const db = getTestDb();
		updateProvider(
			'deepseek',
			{
				apiKey: 'sk-test-key-123456789',
				activeModel: 'deepseek-v4-pro',
			},
			db,
		);

		const updated = getProviderById('deepseek', db);
		expect(updated?.apiKey).toBe('sk-test-key-123456789');
		expect(updated?.activeModel).toBe('deepseek-v4-pro');

		const publicInfo = getProviders(db).find((p) => p.id === 'deepseek');
		expect(publicInfo?.hasKey).toBe(true);
		expect(publicInfo?.maskedKey).toBe('sk-t••••6789');
	});

	it('setting a provider as default unsets default on other providers', () => {
		const db = getTestDb();
		// Set Google as default
		updateProvider(
			'google',
			{
				isDefault: true,
				apiKey: 'AIzaSyTestKey123456',
			},
			db,
		);

		const active = getActiveProvider(db);
		expect(active.id).toBe('google');
		expect(active.isDefault).toBe(true);

		const deepseek = getProviderById('deepseek', db);
		expect(deepseek?.isDefault).toBe(false);
	});

	it('preserves scanned custom models and active model on LM Studio across getProviders calls', () => {
		const db = getTestDb();
		// Update LM Studio with scanned models and select one
		updateProvider(
			'lmstudio',
			{
				availableModels: ['qwen2.5-coder-7b-instruct', 'mistral-7b-instruct-v0.3'],
				activeModel: 'qwen2.5-coder-7b-instruct',
				isDefault: true,
			},
			db,
		);

		// Trigger getProviders (which runs seedDefaultProviders)
		const list = getProviders(db);
		const lmstudio = list.find((p) => p.id === 'lmstudio');
		expect(lmstudio).toBeDefined();
		expect(lmstudio?.isDefault).toBe(true);
		expect(lmstudio?.activeModel).toBe('qwen2.5-coder-7b-instruct');
		expect(lmstudio?.availableModels).toEqual([
			'qwen2.5-coder-7b-instruct',
			'mistral-7b-instruct-v0.3',
		]);

		const active = getActiveProvider(db);
		expect(active.id).toBe('lmstudio');
		expect(active.activeModel).toBe('qwen2.5-coder-7b-instruct');
	});

	it('allows updating custom endpoint baseUrl and persists across getProviders calls', () => {
		const db = getTestDb();
		updateProvider(
			'custom',
			{
				baseUrl: 'https://api.fireworks.ai/inference/v1',
				activeModel: 'accounts/fireworks/models/qwen2p5-72b-instruct',
				availableModels: ['accounts/fireworks/models/qwen2p5-72b-instruct'],
			},
			db,
		);

		const updated = getProviderById('custom', db);
		expect(updated?.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
		expect(updated?.activeModel).toBe('accounts/fireworks/models/qwen2p5-72b-instruct');

		const list = getProviders(db);
		const custom = list.find((p) => p.id === 'custom');
		expect(custom?.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
		expect(custom?.activeModel).toBe('accounts/fireworks/models/qwen2p5-72b-instruct');
		expect(custom?.availableModels).toEqual(['accounts/fireworks/models/qwen2p5-72b-instruct']);
	});

	it('allows deleting models from availableModels without seedDefaultProviders restoring deleted models', () => {
		const db = getTestDb();
		// Initial models on groq
		const groqInit = getProviderById('groq', db);
		expect(groqInit?.availableModels).toBe(JSON.stringify(['llama-3.3-70b-versatile']));

		// Add scanned models
		updateProvider(
			'groq',
			{
				availableModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
				activeModel: 'llama-3.3-70b-versatile',
			},
			db,
		);

		// Delete 'mixtral-8x7b-32768'
		updateProvider(
			'groq',
			{
				availableModels: ['llama-3.3-70b-versatile', 'gemma2-9b-it'],
			},
			db,
		);

		// Run getProviders (which executes seedDefaultProviders)
		const list = getProviders(db);
		const groq = list.find((p) => p.id === 'groq');
		expect(groq?.availableModels).toEqual(['llama-3.3-70b-versatile', 'gemma2-9b-it']);
	});
});
