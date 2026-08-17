// TRANSLATION LLM CLIENT — SUPPORTS DATABASE-BACKED PROVIDERS (DEEPSEEK, GOOGLE AI STUDIO, ETC.).
// OPENAI SDK + QUEUE + RETRY + COST PRICING CALCULATION.
import type { TranslationUsage } from '$lib/types';
import OpenAI from 'openai';
import PQueue from './queue';
import { getActiveProvider } from './providers';

// -- TYPES -- //

interface ModelPricing {
	inputMiss: number;
	inputHit: number;
	output: number;
}

// -- CONSTANTS -- //

export const MODEL_FLASH = 'deepseek-v4-flash';
export const MODEL_PRO = 'deepseek-v4-pro';

export const MODEL_CHOICES: { id: string; label: string; blurb: string }[] = [
	// DeepSeek V4
	{ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', blurb: 'Ultra-fast, low-cost model for comic translation' },
	{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', blurb: 'Flagship reasoning model for highest literary accuracy' },
	// Google Gemini
	{ id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', blurb: 'Google Frontier workhorse: maximum speed and translation intelligence' },
	{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', blurb: 'Google Next-gen multimodal translation engine' },
];

// PROCESS-WIDE CONCURRENCY CAP ON OUTBOUND LLM CALLS
const CONCURRENCY = 64;
const queue = new PQueue({ concurrency: CONCURRENCY });

// MODEL PRICING TABLE (USD PER 1M TOKENS)
const PRICING: Record<string, ModelPricing> = {
	// DeepSeek V4
	'deepseek-v4-flash': {
		inputMiss: 0.14 / 1_000_000,
		inputHit: 0.014 / 1_000_000,
		output: 0.28 / 1_000_000,
	},
	'deepseek-v4-pro': {
		inputMiss: 0.435 / 1_000_000,
		inputHit: 0.003625 / 1_000_000,
		output: 0.87 / 1_000_000,
	},
	// Google Gemini
	'gemini-3.7-flash': {
		inputMiss: 0.075 / 1_000_000,
		inputHit: 0.01875 / 1_000_000,
		output: 0.30 / 1_000_000,
	},
	'gemini-3.5-flash': {
		inputMiss: 0.075 / 1_000_000,
		inputHit: 0.01875 / 1_000_000,
		output: 0.30 / 1_000_000,
	},
	'gemini-3.5-flash-lite': {
		inputMiss: 0.0375 / 1_000_000,
		inputHit: 0.009375 / 1_000_000,
		output: 0.15 / 1_000_000,
	},
	'gemini-3.1-pro-preview': {
		inputMiss: 1.25 / 1_000_000,
		inputHit: 0.3125 / 1_000_000,
		output: 5.00 / 1_000_000,
	},
	'gemini-3.1-pro': {
		inputMiss: 1.25 / 1_000_000,
		inputHit: 0.3125 / 1_000_000,
		output: 5.00 / 1_000_000,
	},
	'gemini-2.5-flash': {
		inputMiss: 0.075 / 1_000_000,
		inputHit: 0.01875 / 1_000_000,
		output: 0.30 / 1_000_000,
	},
	'gemini-2.0-flash': {
		inputMiss: 0.10 / 1_000_000,
		inputHit: 0.025 / 1_000_000,
		output: 0.40 / 1_000_000,
	},
	'gemini-1.5-pro': {
		inputMiss: 1.25 / 1_000_000,
		inputHit: 0.3125 / 1_000_000,
		output: 5.00 / 1_000_000,
	},
	'gemini-1.5-flash': {
		inputMiss: 0.075 / 1_000_000,
		inputHit: 0.01875 / 1_000_000,
		output: 0.30 / 1_000_000,
	},
};

// -- FUNCTIONS -- //

const ALLOWED_MODELS = new Set([
	'deepseek-v4-flash',
	'deepseek-v4-pro',
	'gemini-3.7-flash',
	'gemini-3.5-flash',
	'gemini-3.5-flash-lite',
	'gemini-3.1-pro-preview',
	'gemini-3.1-pro',
	'gemini-2.5-flash',
	'gemini-2.0-flash',
	'gemini-1.5-pro',
	'gemini-1.5-flash',
]);

export function resolveModel(model?: string | null): string {
	if (model && ALLOWED_MODELS.has(model.trim())) return model.trim();
	try {
		const active = getActiveProvider();
		return active.activeModel || 'deepseek-v4-flash';
	} catch {
		return 'deepseek-v4-flash';
	}
}

export function createClient(key?: string, base?: string): OpenAI {
	if (key !== undefined && base !== undefined) {
		const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
		return new OpenAI({
			apiKey: key || (isLocal ? 'local-dummy-key' : 'missing-key'),
			baseURL: base,
		});
	}

	try {
		const active = getActiveProvider();
		const isLocal =
			active.id === 'ollama' ||
			active.id === 'lmstudio' ||
			active.baseUrl.includes('localhost') ||
			active.baseUrl.includes('127.0.0.1');
		return new OpenAI({
			apiKey: active.apiKey || (isLocal ? 'local-dummy-key' : 'missing-key'),
			baseURL: active.baseUrl,
		});
	} catch {
		return new OpenAI({
			apiKey: '',
			baseURL: 'https://api.deepseek.com',
		});
	}
}

export function getClientForActiveProvider(): { client: OpenAI; model: string; providerId: string } {
	const active = getActiveProvider();
	const isLocal =
		active.id === 'ollama' ||
		active.id === 'lmstudio' ||
		active.baseUrl.includes('localhost') ||
		active.baseUrl.includes('127.0.0.1');
	const client = new OpenAI({
		apiKey: active.apiKey || (isLocal ? 'local-dummy-key' : ''),
		baseURL: active.baseUrl,
	});
	return {
		client,
		model: active.activeModel,
		providerId: active.id,
	};
}

export const deepseek = createClient();

export function hasApiKey(): boolean {
	try {
		const active = getActiveProvider();
		const isLocal =
			active.id === 'ollama' ||
			active.id === 'lmstudio' ||
			active.baseUrl.includes('localhost') ||
			active.baseUrl.includes('127.0.0.1');
		if (isLocal) return true;
		return Boolean(active.apiKey && active.apiKey.trim().length > 0);
	} catch {
		return false;
	}
}

export function thinkingParam(providerIdOrModel?: string, maybeModel?: string): Record<string, unknown> {
	let p = '';
	let m = '';

	if (maybeModel !== undefined) {
		p = (providerIdOrModel || '').toLowerCase();
		m = (maybeModel || '').toLowerCase();
	} else if (providerIdOrModel) {
		const val = providerIdOrModel.toLowerCase();
		if (
			val.startsWith('gemini') ||
			val.startsWith('deepseek') ||
			val.startsWith('gpt') ||
			val.startsWith('llama') ||
			val.startsWith('qwen') ||
			val.includes('/') ||
			val.includes(':') ||
			val.includes('-')
		) {
			m = val;
		} else {
			p = val;
		}
	}

	// 1. Ollama local reasoning suppression
	if (p === 'ollama') {
		return {
			extra_body: { think: false },
		};
	}

	// 2. Google Gemini
	if (p === 'google' || m.startsWith('gemini')) {
		return {
			reasoning_effort: 'none',
		};
	}

	// 3. OpenRouter unified reasoning suppression
	if (p === 'openrouter') {
		return {
			extra_body: {
				reasoning: {
					effort: 'none',
					exclude: true,
				},
			},
		};
	}

	// 4. Groq reasoning suppression
	if (p === 'groq') {
		return {
			reasoning_effort: 'none',
		};
	}

	// 5. OpenAI o-series
	if (p === 'openai' && (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4'))) {
		return {
			reasoning_effort: 'low',
		};
	}

	// 6. DeepSeek API default (needs extra_body for OpenAI JS SDK to transmit to api.deepseek.com)
	if (p === 'deepseek' || m.startsWith('deepseek')) {
		return {
			extra_body: {
				thinking: { type: 'disabled' },
			},
		};
	}

	return {
		extra_body: {
			thinking: { type: 'disabled' },
		},
	};
}

export function stripThinkingTags(text: string): string {
	if (!text) return '';
	return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function queued<T>(fn: () => Promise<T>): Promise<T> {
	return queue.add(fn, { throwOnTimeout: true }) as Promise<T>;
}

function isRetryable(e: unknown): boolean {
	const name = (e as { name?: string })?.name;
	if (name === 'APIUserAbortError' || name === 'AbortError') return false;
	const status = (e as { status?: number })?.status;
	if (typeof status === 'number') return status === 408 || status === 409 || status === 429 || status >= 500;
	return true;
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (e) {
			lastErr = e;
			if (attempt === retries || !isRetryable(e)) break;
			const delay = Math.min(10_000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastErr;
}

function pricingFor(model: string): ModelPricing {
	return PRICING[model] ?? PRICING['deepseek-v4-flash'];
}

export function computeUsage(
	usage: OpenAI.Completions.CompletionUsage | undefined,
	model: string = 'deepseek-v4-flash',
): TranslationUsage {
	const promptTokens = usage?.prompt_tokens ?? 0;
	const completionTokens = usage?.completion_tokens ?? 0;
	const u = usage as unknown as {
		prompt_cache_hit_tokens?: number;
		prompt_cache_miss_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number };
	};
	const cachedTokens = u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0;
	const missTokens = u?.prompt_cache_miss_tokens ?? Math.max(0, promptTokens - cachedTokens);
	const price = pricingFor(model);
	const costUsd = missTokens * price.inputMiss + cachedTokens * price.inputHit + completionTokens * price.output;
	return { model, promptTokens, cachedTokens, completionTokens, costUsd };
}
