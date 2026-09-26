import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from './db';
import { aiProviders, type AiProvider } from './db/schema';
import OpenAI from 'openai';
import { thinkingParam } from './llm';
import { getCanonicalSettings } from './settings-service';
import type { ReasoningEffortOption } from '$lib/stores/settings';

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
		isDefault: false,
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
		isDefault: true,
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

		// IF DEEPSEEK WAS SEEDED AS DEFAULT WITHOUT AN API KEY, MIGRATE DEFAULT TO OLLAMA (LOCAL)
		const deepseekRow = existingMap.get('deepseek');
		const ollamaRow = existingMap.get('ollama');
		if (
			deepseekRow &&
			Boolean(deepseekRow.isDefault) &&
			(!deepseekRow.apiKey || deepseekRow.apiKey.trim().length === 0) &&
			ollamaRow &&
			!ollamaRow.isDefault
		) {
			db.update(aiProviders).set({ isDefault: false }).where(eq(aiProviders.id, 'deepseek')).run();
			db.update(aiProviders).set({ isDefault: true }).where(eq(aiProviders.id, 'ollama')).run();
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
		id: 'ollama',
		name: 'Ollama (Local)',
		apiKey: '',
		baseUrl: 'http://localhost:11434/v1',
		activeModel: 'qwen3.5:9b',
		availableModels: JSON.stringify(['qwen3.5:9b', 'gemma4:cloud']),
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
	const stored = getProviderById(id, db);

	const updates: Record<string, unknown> = {
		updatedAt: now,
	};

	if (input.baseUrl !== undefined && input.baseUrl.trim().length > 0) {
		const normalized = normalizeBaseUrl(input.baseUrl);
		if (!normalized) throw new ProviderUpdateError('invalid_base_url');
		const hasStoredKey = Boolean(stored?.apiKey && stored.apiKey.trim().length > 0);
		const newKeyGiven = input.apiKey !== undefined && input.apiKey.trim().length > 0;
		const changed = !stored || !sameBaseUrl(normalized, stored.baseUrl);
		// NEVER LET A STORED KEY FOLLOW THE PROVIDER TO A NEW REMOTE HOST
		if (hasStoredKey && changed && !newKeyGiven && !input.clearApiKey && !isLocalProvider(normalized)) {
			throw new ProviderUpdateError('key_required_for_new_base_url');
		}
	}

	if (input.clearApiKey) {
		updates.apiKey = '';
	} else if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
		updates.apiKey = input.apiKey.trim();
	}
	if (input.baseUrl !== undefined && input.baseUrl.trim().length > 0) {
		updates.baseUrl = normalizeBaseUrl(input.baseUrl) ?? input.baseUrl.trim();
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

const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

export type ProviderCredentialError = 'key_required_for_new_base_url' | 'invalid_base_url' | 'key_required';

const CREDENTIAL_ERROR_TEXT: Record<ProviderCredentialError, string> = {
	key_required_for_new_base_url: 'Enter the API key again for the new base URL.',
	invalid_base_url: 'Base URL must be an http(s) URL without credentials.',
	key_required: 'API Key is empty. Please provide a valid API key.',
};

export class ProviderUpdateError extends Error {
	constructor(public code: ProviderCredentialError) {
		super(CREDENTIAL_ERROR_TEXT[code]);
		this.name = 'ProviderUpdateError';
	}
}

/** Canonical form for comparing base URLs: lower-case host, no default port, no trailing slash. */
export function normalizeBaseUrl(raw: string): string | null {
	if (typeof raw !== 'string' || raw.trim().length === 0) return null;
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
	if (u.username || u.password) return null;
	// URL ALREADY LOWER-CASES THE HOST AND DROPS DEFAULT PORTS
	const path = u.pathname.replace(/\/+$/, '');
	return `${u.protocol}//${u.host}${path}${u.search}`;
}

export function sameBaseUrl(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	const na = normalizeBaseUrl(a);
	return na !== null && na === normalizeBaseUrl(b);
}

export function isLocalProvider(idOrBase?: string): boolean {
	if (!idOrBase) return false;
	if (LOCAL_PROVIDER_IDS.has(idOrBase.toLowerCase())) return true;
	try {
		return LOCAL_HOSTNAMES.has(new URL(idOrBase.trim()).hostname.toLowerCase());
	} catch {
		return false;
	}
}

export type ResolvedCredentials =
	| { key: string; base: string; isLocal: boolean; usedStoredKey: boolean }
	| { error: ProviderCredentialError };

/**
 * Picks the key and base URL for an outbound provider call. The stored key is only ever
 * paired with the stored base URL, so a caller cannot redirect a saved key to another host.
 */
export function resolveProviderCredentials(
	params: { id?: string; apiKey?: string; baseUrl?: string },
	db = defaultDb,
): ResolvedCredentials {
	const stored = params.id ? getProviderById(params.id, db) : null;
	const fallbackBase =
		stored?.baseUrl || DEFAULT_PROVIDERS.find((p) => p.id === params.id)?.baseUrl || 'https://api.deepseek.com';
	const callerBase = params.baseUrl && params.baseUrl.trim().length > 0 ? params.baseUrl.trim() : undefined;
	if (callerBase && !normalizeBaseUrl(callerBase)) return { error: 'invalid_base_url' };

	const base = callerBase ?? fallbackBase;
	const isLocal = isLocalProvider(params.id) || isLocalProvider(base);
	const callerKey = params.apiKey && params.apiKey.trim().length > 0 ? params.apiKey.trim() : undefined;
	if (callerKey) return { key: callerKey, base, isLocal, usedStoredKey: false };

	const storedKey = stored?.apiKey && stored.apiKey.trim().length > 0 ? stored.apiKey.trim() : undefined;
	const baseIsStored = !callerBase || (stored !== null && sameBaseUrl(callerBase, stored.baseUrl));
	if (baseIsStored && storedKey && stored) {
		return { key: storedKey, base: stored.baseUrl || base, isLocal, usedStoredKey: true };
	}
	if (isLocal) return { key: 'local-dummy-key', base, isLocal, usedStoredKey: false };
	return { error: baseIsStored ? 'key_required' : 'key_required_for_new_base_url' };
}

/** Short, fixed error text for provider calls. The full error goes to the server log only. */
export function describeProviderError(e: unknown): { message: string; status?: number; detail?: string } {
	const err = e as any;
	const status = typeof err?.status === 'number' ? err.status : undefined;
	if (status !== undefined) {
		// THE PROVIDER ANSWERED: ITS OWN ERROR TEXT (E.G. AN UNSUPPORTED PARAMETER) IS KEPT, TRUNCATED
		const raw = String(err?.error?.message ?? err?.message ?? '').replace(/\s+/g, ' ').trim();
		return { message: `HTTP ${status}`, status, detail: raw.length > 0 ? raw.slice(0, 300) : undefined };
	}
	const text = `${err?.name ?? ''} ${err?.code ?? ''} ${err?.cause?.code ?? ''} ${err?.message ?? ''}`.toLowerCase();
	if (/timeout|timed out|etimedout|aborted/.test(text)) return { message: 'timeout' };
	if (/econnrefused|connection refused/.test(text)) return { message: 'connection refused' };
	if (/enotfound|eai_again|getaddrinfo|dns/.test(text)) return { message: 'DNS lookup failed' };
	if (/cert|tls|ssl|self.signed/.test(text)) return { message: 'TLS error' };
	return { message: 'request failed' };
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
	temperature?: number | null;
	topP?: number | null;
	reasoningEffort?: ReasoningEffortOption;
	frequencyPenalty?: number | null;
	presencePenalty?: number | null;
	db?: typeof defaultDb;
}): Promise<{
	ok: boolean;
	message: string;
	latencyMs: number;
	modelUsed: string;
	code?: ProviderCredentialError;
	detail?: string;
}> {
	const start = Date.now();
	let model = params.model;

	if (params.id && !model) {
		model = getProviderById(params.id, params.db)?.activeModel;
	}

	const creds = resolveProviderCredentials(params, params.db);
	if ('error' in creds) {
		return {
			ok: false,
			code: creds.error,
			message: CREDENTIAL_ERROR_TEXT[creds.error],
			latencyMs: 0,
			modelUsed: model || 'unknown',
		};
	}
	const { key, base, isLocal } = creds;

	if (!model || model.trim().length === 0) {
		const def = DEFAULT_PROVIDERS.find((p) => p.id === params.id);
		model = def?.activeModel || 'deepseek-v4-flash';
	}

	const canonical = getCanonicalSettings(params.db);
	const temperature = params.temperature !== undefined ? params.temperature : canonical.translationTemperature;
	const topP = params.topP !== undefined ? params.topP : canonical.translationTopP;
	const effort = params.reasoningEffort !== undefined ? params.reasoningEffort : canonical.translationReasoningEffort;
	const frequencyPenalty = params.frequencyPenalty !== undefined ? params.frequencyPenalty : canonical.translationFrequencyPenalty;
	const presencePenalty = params.presencePenalty !== undefined ? params.presencePenalty : canonical.translationPresencePenalty;

	const thinkParams = thinkingParam(params.id, model.trim(), effort);

	const payload: any = {
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
		max_tokens: 50,
		...thinkParams,
	};

	if (temperature !== null && temperature !== undefined) {
		payload.temperature = temperature;
	}
	if (topP !== null && topP !== undefined) {
		payload.top_p = topP;
	}
	if (frequencyPenalty !== null && frequencyPenalty !== undefined) {
		payload.frequency_penalty = frequencyPenalty;
	}
	if (presencePenalty !== null && presencePenalty !== undefined) {
		payload.presence_penalty = presencePenalty;
	}

	try {
		const client = new OpenAI({
			apiKey: key.trim(),
			baseURL: base.trim(),
			timeout: 15000,
		});

		const resp = await client.chat.completions.create(payload);

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
		console.warn(`[providers] connection test failed for ${params.id ?? 'unknown'}:`, e);
		const described = describeProviderError(e);
		return {
			ok: false,
			message: isLocal
				? `Connection failed: ${described.message}. Please ensure your local server is started.`
				: `Connection failed: ${described.message}`,
			detail: described.detail,
			latencyMs,
			modelUsed: model,
		};
	}
}

export async function fetchAvailableModels(params: {
	id: string;
	apiKey?: string;
	baseUrl?: string;
	db?: typeof defaultDb;
}): Promise<{ ok: boolean; models: string[]; message?: string; code?: ProviderCredentialError; detail?: string }> {
	const creds = resolveProviderCredentials(params, params.db);
	if ('error' in creds) {
		return {
			ok: false,
			models: [],
			code: creds.error,
			message:
				creds.error === 'key_required'
					? 'API key is required to query cloud models.'
					: CREDENTIAL_ERROR_TEXT[creds.error],
		};
	}
	const { key, base, isLocal } = creds;

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
		console.warn(`[providers] model listing failed for ${params.id}:`, e);
		const described = describeProviderError(e);
		return {
			ok: false,
			models: [],
			message: isLocal
				? `Cannot connect to local server: ${described.message}. Make sure your local runner is running.`
				: `Failed to query models: ${described.message}`,
			detail: described.detail,
		};
	}
}

