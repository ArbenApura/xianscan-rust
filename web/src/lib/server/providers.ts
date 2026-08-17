import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from './db';
import { aiProviders, type AiProvider } from './db/schema';
import OpenAI from 'openai';
import { thinkingParam } from './deepseek';

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
		availableModels: JSON.stringify([
			'deepseek-v4-flash',
			'deepseek-v4-pro',
		]),
		enabled: true,
		isDefault: true,
	},
	{
		id: 'google',
		name: 'Google AI Studio',
		apiKey: '',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
		activeModel: 'gemini-3.7-flash',
		availableModels: JSON.stringify([
			'gemini-3.7-flash',
			'gemini-3.5-flash',
		]),
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
				// Sync available models and auto-heal invalid active models
				const available: string[] = JSON.parse(def.availableModels);
				let nextActive = current.activeModel;
				if (!available.includes(current.activeModel)) {
					nextActive = def.activeModel;
				}
				db.update(aiProviders)
					.set({
						availableModels: def.availableModels,
						activeModel: nextActive,
						baseUrl: current.baseUrl || def.baseUrl,
					})
					.where(eq(aiProviders.id, def.id))
					.run();
			}
		}
	} catch {
		// Silent fallback during in-memory migrations or pre-init
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

	if (!key || key.trim().length === 0) {
		return {
			ok: false,
			message: 'API Key is empty. Please provide a valid API key.',
			latencyMs: 0,
			modelUsed: model || 'unknown',
		};
	}

	if (!base || base.trim().length === 0) {
		base = params.id === 'google'
			? 'https://generativelanguage.googleapis.com/v1beta/openai/'
			: 'https://api.deepseek.com';
	}

	if (!model || model.trim().length === 0) {
		model = params.id === 'google' ? 'gemini-3.7-flash' : 'deepseek-v4-flash';
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
			message: `Connection failed: ${errorMsg}`,
			latencyMs,
			modelUsed: model,
		};
	}
}

export async function fetchAvailableModels(params: {
	id: string;
	apiKey?: string;
	baseUrl?: string;
}): Promise<{ models: string[] }> {
	const prov = await getProvider(params.id);
	const key = params.apiKey !== undefined && params.apiKey !== ''
		? params.apiKey
		: (prov ? await getDecryptedKey(prov) : '');

	let base = params.baseUrl || prov?.baseUrl;
	if (!base || base.trim().length === 0) {
		base = params.id === 'google'
			? 'https://generativelanguage.googleapis.com/v1beta/openai/'
			: 'https://api.deepseek.com';
	}

	if (!key || key.trim().length === 0) {
		const existing = prov?.availableModels ? JSON.parse(prov.availableModels) : [];
		return { models: existing };
	}

	try {
		const client = new OpenAI({
			apiKey: key.trim(),
			baseURL: base.trim(),
			timeout: 10000,
		});

		const list = await client.models.list();
		const models: string[] = [];
		for await (const m of list) {
			models.push(m.id);
		}
		return { models: models.length > 0 ? models : (prov?.availableModels ? JSON.parse(prov.availableModels) : []) };
	} catch {
		const existing = prov?.availableModels ? JSON.parse(prov.availableModels) : [];
		return { models: existing };
	}
}

