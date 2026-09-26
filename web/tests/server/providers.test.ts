import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb, resetDb } from '../helpers/db';
import OpenAI from 'openai';
import {
	getProviders,
	getActiveProvider,
	getProviderById,
	updateProvider,
	seedDefaultProviders,
	maskApiKey,
	testProviderConnection,
	fetchAvailableModels,
	isLocalProvider,
	normalizeBaseUrl,
	ProviderUpdateError,
} from '$lib/server/providers';

// RECORDS THE KEY AND BASE URL EACH OUTBOUND CHAT CALL WAS MADE WITH
function spyOnChatCalls() {
	const calls: Array<{ apiKey: string; baseURL: string }> = [];
	const spy = vi.spyOn(OpenAI.Chat.Completions.prototype, 'create');
	spy.mockImplementation(async function (this: any) {
		calls.push({ apiKey: this._client.apiKey, baseURL: this._client.baseURL });
		return { choices: [{ message: { content: 'ok' } }] } as any;
	});
	return { calls, spy };
}

describe('provider key and base URL hardening', () => {
	beforeEach(async () => {
		await resetDb();
	});

	it('does not send the stored key to a caller-supplied baseUrl', async () => {
		const db = getTestDb();
		updateProvider('deepseek', { apiKey: 'sk-stored-secret-123456' }, db);
		const { calls, spy } = spyOnChatCalls();

		const res = await testProviderConnection({ id: 'deepseek', baseUrl: 'https://evil.example/v1', db });
		const models = await fetchAvailableModels({ id: 'deepseek', baseUrl: 'https://evil.example/v1', db });

		expect(res.ok).toBe(false);
		expect(res.code).toBe('key_required_for_new_base_url');
		expect(models.code).toBe('key_required_for_new_base_url');
		expect(calls.every((c) => c.apiKey !== 'sk-stored-secret-123456')).toBe(true);
		expect(calls.length).toBe(0);
		spy.mockRestore();
	});

	it('uses the stored key when baseUrl equals the stored one after normalisation', async () => {
		const db = getTestDb();
		updateProvider('deepseek', { apiKey: 'sk-stored-secret-123456' }, db);
		const { calls, spy } = spyOnChatCalls();

		const res = await testProviderConnection({ id: 'deepseek', baseUrl: 'https://API.DeepSeek.com:443/', model: 'm', db });

		expect(res.ok).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].apiKey).toBe('sk-stored-secret-123456');
		expect(calls[0].baseURL).toContain('api.deepseek.com');
		spy.mockRestore();
	});

	it('updateProvider rejects a new remote baseUrl without a key (409 code)', () => {
		const db = getTestDb();
		updateProvider('custom', { apiKey: 'sk-stored-secret-123456', baseUrl: 'https://a.example/v1' }, db);
		expect(() => updateProvider('custom', { baseUrl: 'https://b.example/v1' }, db)).toThrow(ProviderUpdateError);
		try {
			updateProvider('custom', { baseUrl: 'https://b.example/v1' }, db);
		} catch (e: any) {
			expect(e.code).toBe('key_required_for_new_base_url');
		}
		expect(getProviderById('custom', db)?.baseUrl).toBe('https://a.example/v1');
	});

	it('updateProvider accepts a new baseUrl together with a new key, and with clearApiKey', () => {
		const db = getTestDb();
		updateProvider('custom', { apiKey: 'sk-stored-secret-123456', baseUrl: 'https://a.example/v1' }, db);
		updateProvider('custom', { baseUrl: 'https://b.example/v1/', apiKey: 'sk-new-key-abcdef' }, db);
		expect(getProviderById('custom', db)?.baseUrl).toBe('https://b.example/v1');
		expect(getProviderById('custom', db)?.apiKey).toBe('sk-new-key-abcdef');

		updateProvider('custom', { baseUrl: 'https://c.example/v1', clearApiKey: true }, db);
		expect(getProviderById('custom', db)?.baseUrl).toBe('https://c.example/v1');
		expect(getProviderById('custom', db)?.apiKey).toBe('');
	});

	it('isLocalProvider parses the hostname', () => {
		expect(isLocalProvider('https://evil.example/localhost')).toBe(false);
		expect(isLocalProvider('https://localhost.evil.example/v1')).toBe(false);
		expect(isLocalProvider('http://[::1]:11434/v1')).toBe(true);
		expect(isLocalProvider('http://127.0.0.1:1234/v1')).toBe(true);
		expect(isLocalProvider('ollama')).toBe(true);
		expect(isLocalProvider('deepseek')).toBe(false);
	});

	it('normalizeBaseUrl drops trailing slashes, default ports and host case', () => {
		expect(normalizeBaseUrl('HTTPS://Api.Example.com:443/v1///')).toBe('https://api.example.com/v1');
		expect(normalizeBaseUrl('ftp://example.com')).toBeNull();
		expect(normalizeBaseUrl('http://user:pass@example.com')).toBeNull();
	});

	it('error messages do not include the base URL or upstream body for network failures', async () => {
		const spy = vi.spyOn(OpenAI.Chat.Completions.prototype, 'create');
		spy.mockImplementation(async () => {
			const err: any = new Error('connect ECONNREFUSED 10.0.0.5:8080 <html>internal admin</html>');
			err.code = 'ECONNREFUSED';
			throw err;
		});

		const res = await testProviderConnection({
			id: 'custom',
			apiKey: 'test-key',
			baseUrl: 'http://10.0.0.5:8080/v1',
			model: 'm',
		});

		expect(res.ok).toBe(false);
		expect(res.message).toBe('Connection failed: connection refused');
		expect(res.message).not.toContain('10.0.0.5');
		expect(res.detail).toBeUndefined();
		spy.mockRestore();
	});
});

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
		expect(deepseek?.isDefault).toBe(false);
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
		expect(ollama?.isDefault).toBe(true);
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
		expect(active.id).toBe('ollama');
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

	it('testProviderConnection surfaces error transparently when a model rejects unsupported parameters', async () => {
		const createSpy = vi.spyOn(OpenAI.Chat.Completions.prototype, 'create');
		createSpy.mockImplementation(async (payload: any) => {
			if (payload.top_p !== undefined) {
				const err: any = new Error("Parameter 'top_p'=0.9 is not supported for kimi-k3 model.");
				err.status = 400;
				throw err;
			}
			return {
				choices: [{ message: { content: '{"status":"ok","greeting":"hello"}' } }],
			} as any;
		});

		const res = await testProviderConnection({
			id: 'custom',
			apiKey: 'test-key',
			baseUrl: 'https://api.moonshot.cn/v1',
			model: 'kimi-k3',
			temperature: 0.2,
			topP: 0.9,
		});

		expect(res.ok).toBe(false);
		// THE FIXED MESSAGE CARRIES THE STATUS; THE PROVIDER'S OWN TEXT MOVES TO `detail`
		expect(res.message).toContain('HTTP 400');
		expect(res.detail).toContain("Parameter 'top_p'=0.9 is not supported for kimi-k3 model");
		createSpy.mockRestore();
	});

	it('testProviderConnection succeeds when unsupported parameter is omitted', async () => {
		const createSpy = vi.spyOn(OpenAI.Chat.Completions.prototype, 'create');
		createSpy.mockImplementation(async (payload: any) => {
			if (payload.top_p !== undefined) {
				const err: any = new Error("Parameter 'top_p'=0.9 is not supported for kimi-k3 model.");
				err.status = 400;
				throw err;
			}
			return {
				choices: [{ message: { content: '{"status":"ok","greeting":"hello"}' } }],
			} as any;
		});

		const res = await testProviderConnection({
			id: 'custom',
			apiKey: 'test-key',
			baseUrl: 'https://api.moonshot.cn/v1',
			model: 'kimi-k3',
			temperature: 0.2,
			topP: null,
		});

		expect(res.ok).toBe(true);
		createSpy.mockRestore();
	});
});
