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
});
