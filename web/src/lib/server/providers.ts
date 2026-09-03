import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from './db';
import { aiProviders, type AiProvider } from './db/schema';
import OpenAI from 'openai';
import { thinkingParam } from './llm';

export interface ProviderPublicInfo {
	id: string;
	name: string;
	baseUrl: string;
	activeModel: string;
	availableModels: string[];
	hasKey: boolean;
	maskedKey: string;
	enabled: boolean;
	isDefault: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface UpdateProviderInput {
	apiKey?: string;
	clearApiKey?: boolean;
	baseUrl?: string;
	activeModel?: string;
	availableModels?: string[];
	enabled?: boolean;
	isDefault?: boolean;
}

export const DEFAULT_PROVIDERS: Array<Omit<AiProvider, 'createdAt' | 'updatedAt'>> = [
	{
		id: 'deepseek',
		name: 'DeepSeek',
		apiKey: '',
		baseUrl: 'https://api.deepseek.com',
		activeModel: 'deepseek-v4-flash',
		availableModels: JSON.stringify(['deepseek-v4-flash']),
		enabled: true,
		isDefault: true,
	},
	{
		id: 'google',
		name: 'Google AI Studio',
		apiKey: '',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
		activeModel: 'gemini-3.7-flash',
		availableModels: JSON.stringify(['gemini-3.7-flash']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'groq',
		name: 'Groq (Ultra-Fast)',
		apiKey: '',
		baseUrl: 'https://api.groq.com/openai/v1',
		activeModel: 'llama-3.3-70b-versatile',
		availableModels: JSON.stringify(['llama-3.3-70b-versatile']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'openrouter',
		name: 'OpenRouter',
		apiKey: '',
		baseUrl: 'https://openrouter.ai/api/v1',
		activeModel: 'google/gemini-2.5-flash',
		availableModels: JSON.stringify(['google/gemini-2.5-flash']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'openai',
		name: 'OpenAI',
		apiKey: '',
		baseUrl: 'https://api.openai.com/v1',
		activeModel: 'gpt-4o-mini',
		availableModels: JSON.stringify(['gpt-4o-mini']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'ollama',
		name: 'Ollama (Local)',
		apiKey: '',
		baseUrl: 'http://localhost:11434/v1',
		activeModel: 'qwen3.5:9b',
		availableModels: JSON.stringify(['qwen3.5:9b', 'gemma4:cloud']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'lmstudio',
		name: 'LM Studio (Local)',
		apiKey: '',
		baseUrl: 'http://localhost:1234/v1',
		activeModel: 'local-model',
		availableModels: JSON.stringify(['local-model']),
		enabled: true,
		isDefault: false,
	},
	{
		id: 'custom',
		name: 'Custom (OpenAI-Compatible)',
		apiKey: '',
		baseUrl: 'http://localhost:8000/v1',
		activeModel: 'default',
		availableModels: JSON.stringify(['default']),
		enabled: true,
		isDefault: false,
	},
];

export function maskApiKey(key?: string | null): string {
	if (!key || key.trim().length === 0) return '';
	const clean = key.trim();
	if (clean.length <= 8) return '••••••••';
	return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function seedDefaultProviders(db = defaultDb): void {
	try {
		const existing = db.select().from(aiProviders).all();
		const existingMap = new Map(existing.map((e) => [e.id, e]));

		for (const def of DEFAULT_PROVIDERS) {
			const current = existingMap.get(def.id);
			if (!current) {
				const initialKey =
					def.id === 'deepseek' && typeof process !== 'undefined' && process.env.DEEPSEEK_API_KEY
						? process.env.DEEPSEEK_API_KEY.trim()
						: def.apiKey;
				db.insert(aiProviders)
					.values({
						...def,
						apiKey: initialKey,
						createdAt: Date.now(),
						updatedAt: Date.now(),
					})
					.run();
			} else {
				// PRESERVE USER-SCANNED, CUSTOM, AND SELECTED MODELS IN DB
				// ONLY AUTO-HEAL IF availableModels IN DB CANNOT BE PARSED
				let isValidArray = false;
				try {
					const parsed = JSON.parse(current.availableModels);
					if (Array.isArray(parsed)) isValidArray = true;
				} catch {
					isValidArray = false;
				}
				if (!isValidArray) {
					db.update(aiProviders)
						.set({
							availableModels: def.availableModels,
							activeModel: def.activeModel,
						})
						.where(eq(aiProviders.id, def.id))
						.run();
				}
			}
		}
	} catch {
		// SILENT FALLBACK DURING IN-MEMORY MIGRATIONS OR PRE-INIT
	}
}

export function getProviders(db = defaultDb): ProviderPublicInfo[] {
	seedDefaultProviders(db);
	try {
		const rows = db.select().from(aiProviders).all();

		return rows.map((row) => {
			let models: string[] = [];
			try {
				models = JSON.parse(row.availableModels);
			} catch {
				models = [row.activeModel];
			}

			return {
				id: row.id,
				name: row.name,
				baseUrl: row.baseUrl,
				activeModel: row.activeModel,
				availableModels: Array.isArray(models) ? models : [row.activeModel],
				hasKey: Boolean(row.apiKey && row.apiKey.trim().length > 0),
				maskedKey: maskApiKey(row.apiKey),
				enabled: Boolean(row.enabled),
				isDefault: Boolean(row.isDefault),
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			};
		});
	} catch {
		return DEFAULT_PROVIDERS.map((def) => ({
			id: def.id,
			name: def.name,
			baseUrl: def.baseUrl,
			activeModel: def.activeModel,
			availableModels: JSON.parse(def.availableModels),
			hasKey: false,
			maskedKey: '',
			enabled: def.enabled,
			isDefault: def.isDefault,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}));
	}
}

export function getProviderById(id: string, db = defaultDb): AiProvider | null {
	seedDefaultProviders(db);
	try {
		const row = db.select().from(aiProviders).where(eq(aiProviders.id, id)).get();
		return row ?? null;
	} catch {
		const def = DEFAULT_PROVIDERS.find((p) => p.id === id);
		return def ? { ...def, createdAt: Date.now(), updatedAt: Date.now() } : null;
	}
}

export function getActiveProvider(db = defaultDb): AiProvider {
	seedDefaultProviders(db);
	try {
		// 1. First look for default enabled provider
		const defaultProvider = db
			.select()
			.from(aiProviders)
			.where(eq(aiProviders.isDefault, true))
			.get();

		if (defaultProvider) return defaultProvider;

		// 2. Fallback to any enabled provider
		const anyEnabled = db
			.select()
			.from(aiProviders)
			.where(eq(aiProviders.enabled, true))
			.get();

		if (anyEnabled) return anyEnabled;

		// 3. Fallback to first provider in DB
		const first = db.select().from(aiProviders).get();
		if (first) return first;
	} catch {
		// Ignore pre-migration reads
	}

	return {
		id: 'deepseek',
		name: 'DeepSeek',
		apiKey: '',
		baseUrl: 'https://api.deepseek.com',
		activeModel: 'deepseek-v4-flash',
		availableModels: JSON.stringify(['deepseek-v4-flash', 'deepseek-v4-pro']),
		enabled: true,
		isDefault: true,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

export function updateProvider(
	id: string,
	input: UpdateProviderInput,
	db = defaultDb,
): ProviderPublicInfo {
	seedDefaultProviders(db);
	const now = Date.now();

	const updates: Record<string, unknown> = {
		updatedAt: now,
	};

	if (input.clearApiKey) {
		updates.apiKey = '';
	} else if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
		updates.apiKey = input.apiKey.trim();
	}
	if (input.baseUrl !== undefined && input.baseUrl.trim().length > 0) {
		updates.baseUrl = input.baseUrl.trim();
	}
	if (input.activeModel !== undefined && input.activeModel.trim().length > 0) {
		updates.activeModel = input.activeModel.trim();
	}
	if (input.availableModels !== undefined) {
		updates.availableModels = JSON.stringify(input.availableModels);
	}
	if (input.enabled !== undefined) {
		updates.enabled = input.enabled;
	}
	if (input.isDefault !== undefined) {
		updates.isDefault = input.isDefault;
		if (input.isDefault) {
			// Unset all other providers' isDefault flag
			db.update(aiProviders)
				.set({ isDefault: false, updatedAt: now })
				.where(sql`${aiProviders.id} != ${id}`)
				.run();
		}
	}

	db.update(aiProviders).set(updates).where(eq(aiProviders.id, id)).run();

	const updated = getProviderById(id, db);
	if (!updated) throw new Error(`Provider ${id} not found after update`);

	let models: string[] = [];
	try {
		models = JSON.parse(updated.availableModels);
	} catch {
		models = [updated.activeModel];
	}

	return {
		id: updated.id,
		name: updated.name,
		baseUrl: updated.baseUrl,
		activeModel: updated.activeModel,
		availableModels: Array.isArray(models) ? models : [updated.activeModel],
		hasKey: Boolean(updated.apiKey && updated.apiKey.trim().length > 0),
		maskedKey: maskApiKey(updated.apiKey),
		enabled: Boolean(updated.enabled),
		isDefault: Boolean(updated.isDefault),
		createdAt: updated.createdAt,
		updatedAt: updated.updatedAt,
	};
}

export function isLocalProvider(idOrBase?: string): boolean {
	if (!idOrBase) return false;
	const lower = idOrBase.toLowerCase();
	return (
		lower === 'ollama' ||
		lower === 'lmstudio' ||
		lower.includes('localhost') ||
		lower.includes('127.0.0.1') ||
		lower.includes('0.0.0.0')
	);
}

export function isLlmProviderConfigured(db = defaultDb): {
	configured: boolean;
	activeProvider: { id: string; name: string; isLocal: boolean; hasKey: boolean };
} {
	const active = getActiveProvider(db);
	const isLocal = isLocalProvider(active.id) || isLocalProvider(active.baseUrl);
	const hasKey = Boolean(active.apiKey && active.apiKey.trim().length > 0);
	const configured = isLocal || hasKey;

	return {
		configured,
		activeProvider: {
			id: active.id,
			name: active.name,
			isLocal,
			hasKey,
		},
	};
}

const NON_CHAT_MODEL_PATTERN =
	/(?:embed|embedding|bge|nomic|text-similarity|text-search|instructor|whisper|tts|speech|audio|dall-e|imagen|flux|sdxl|stable-diffusion|moderation|guard|rerank|davinci-002|babbage-002|realtime-preview)/i;

export function filterUsableChatModels(rawModels: string[]): string[] {
	const filtered = rawModels.filter((m) => !NON_CHAT_MODEL_PATTERN.test(m));
	return filtered.length > 0 ? filtered : rawModels;
}

export async function testProviderConnection(params: {
	id?: string;
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	db?: typeof defaultDb;
}): Promise<{ ok: boolean; message: string; latencyMs: number; modelUsed: string }> {
	const start = Date.now();
	let key = params.apiKey;
	let base = params.baseUrl;
	let model = params.model;

	if (params.id && (!key || !base || !model)) {
		const existing = getProviderById(params.id, params.db);
		if (existing) {
			if (!key) key = existing.apiKey;
			if (!base) base = existing.baseUrl;
			if (!model) model = existing.activeModel;
		}
	}

	const isLocal = isLocalProvider(params.id) || isLocalProvider(base);

	if (!key || key.trim().length === 0) {
		if (isLocal) {
			key = 'local-dummy-key';
		} else {
			return {
				ok: false,
				message: 'API Key is empty. Please provide a valid API key.',
				latencyMs: 0,
				modelUsed: model || 'unknown',
			};
		}
	}

	if (!base || base.trim().length === 0) {
		const def = DEFAULT_PROVIDERS.find((p) => p.id === params.id);
		base = def?.baseUrl || 'https://api.deepseek.com';
	}

	if (!model || model.trim().length === 0) {
		const def = DEFAULT_PROVIDERS.find((p) => p.id === params.id);
		model = def?.activeModel || 'deepseek-v4-flash';
	}

	try {
		const client = new OpenAI({
			apiKey: key.trim(),
			baseURL: base.trim(),
			timeout: 15000,
		});

		const resp = await client.chat.completions.create({
			model: model.trim(),
			messages: [
				{
					role: 'system',
					content: 'You are a test connection validator. Reply with JSON ONLY: {"status":"ok","greeting":"hello"}',
				},
				{
					role: 'user',
					content: 'ping',
				},
			],
			temperature: 0.1,
			max_tokens: 50,
			...thinkingParam(model.trim()),
		});

		const latencyMs = Date.now() - start;
		const content = resp.choices[0]?.message?.content ?? '';

		if (content.length > 0) {
			return {
				ok: true,
				message: `Successfully connected to ${model} in ${latencyMs}ms.`,
				latencyMs,
				modelUsed: model,
			};
		}

		return {
			ok: true,
			message: `Received response from ${model} in ${latencyMs}ms.`,
			latencyMs,
			modelUsed: model,
		};
	} catch (e: any) {
		const latencyMs = Date.now() - start;
		const errorMsg = e?.message || e?.toString() || 'Unknown error';
		return {
			ok: false,
			message: isLocal
				? `Connection failed to ${base}: ${errorMsg}. Please ensure your local server is started.`
				: `Connection failed: ${errorMsg}`,
			latencyMs,
			modelUsed: model,
		};
	}
}

export async function fetchAvailableModels(params: {
	id: string;
	apiKey?: string;
	baseUrl?: string;
}): Promise<{ ok: boolean; models: string[]; message?: string }> {
	const prov = getProviderById(params.id);
	let key = params.apiKey !== undefined && params.apiKey !== ''
		? params.apiKey
		: (prov ? prov.apiKey || '' : '');

	let base = params.baseUrl || prov?.baseUrl;
	if (!base || base.trim().length === 0) {
		const def = DEFAULT_PROVIDERS.find((p) => p.id === params.id);
		base = def?.baseUrl || 'https://api.deepseek.com';
	}

	const isLocal = isLocalProvider(params.id) || isLocalProvider(base);
	if (!key || key.trim().length === 0) {
		if (isLocal) {
			key = 'local-dummy-key';
		} else {
			return { ok: false, models: [], message: 'API key is required to query cloud models.' };
		}
	}

	try {
		const client = new OpenAI({
			apiKey: key.trim(),
			baseURL: base.trim(),
			timeout: 10000,
		});

		const list = await client.models.list();
		const rawModels: string[] = [];
		for await (const m of list) {
			if (m && m.id && typeof m.id === 'string') {
				rawModels.push(m.id);
			}
		}
		const models = filterUsableChatModels(rawModels);
		if (models.length === 0) {
			return { ok: false, models: [], message: 'No chat models returned by the provider.' };
		}
		return { ok: true, models: models.sort((a, b) => a.localeCompare(b)) };
	} catch (e: any) {
		const err = e?.message || e?.toString() || 'Failed to list models';
		return {
			ok: false,
			models: [],
			message: isLocal
				? `Cannot connect to local server (${base}): ${err}. Make sure your local runner is running.`
				: `Failed to query models: ${err}`,
		};
	}
}

