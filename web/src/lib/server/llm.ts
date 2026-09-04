// UNIVERSAL TRANSLATION LLM RUNTIME CLIENT
// OPENAI-COMPATIBLE SDK + QUEUE + AUTO-RETRY + REASONING SUPPRESSION.
// SUPPORTS ALL CONFIGURED PROVIDERS: DEEPSEEK, GOOGLE AI STUDIO, GROQ, OPENROUTER, OPENAI, OLLAMA, LM STUDIO, CUSTOM.
import type { TranslationUsage } from '$lib/types';
import type { ReasoningEffortOption } from '$lib/stores/settings';
import OpenAI from 'openai';
import PQueue from './queue';
import { getActiveProvider } from './providers';

// PROCESS-WIDE CONCURRENCY CAP ON OUTBOUND LLM CALLS
const CONCURRENCY = 64;
const queue = new PQueue({ concurrency: CONCURRENCY });

// -- FUNCTIONS -- //

export function resolveModel(model?: string | null): string {
	if (model && model.trim().length > 0) {
		return model.trim();
	}
	try {
		const active = getActiveProvider();
		if (active.activeModel && active.activeModel.trim().length > 0) {
			return active.activeModel.trim();
		}
	} catch {
		// FALLBACK IF PROVIDER IS NOT YET CONFIGURED OR IN TEST HARNESS
	}
	return 'default';
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

export const llmClient = createClient();
/** @deprecated Alias for backward compatibility */
export const deepseek = llmClient;

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

export function thinkingParam(
	providerIdOrModel?: string,
	maybeModel?: string,
	effort?: ReasoningEffortOption,
): Record<string, unknown> {
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
			if (val.startsWith('deepseek')) p = 'deepseek';
			else if (val.startsWith('gemini')) p = 'google';
			else if (val.startsWith('gpt')) p = 'openai';
			else if (val.startsWith('llama')) p = 'groq';
			else if (val.startsWith('qwen')) p = 'ollama';
		} else {
			p = val;
		}
	}

	if (!p && maybeModel !== undefined) {
		try {
			p = getActiveProvider().id.toLowerCase();
		} catch {
			// FALLBACK TO EMPTY IF PROVIDER NOT YET INITIALIZED
		}
	}

	const normalizedEffort = effort?.startsWith('custom:') ? effort.slice(7).trim() : effort;

	// 1. OLLAMA LOCAL REASONING
	if (p === 'ollama') {
		if (normalizedEffort === 'auto') return {};
		if (normalizedEffort && normalizedEffort !== 'none') {
			return { extra_body: { think: true } };
		}
		return {
			extra_body: { think: false },
		};
	}

	// 2. OPENROUTER UNIFIED REASONING
	if (p === 'openrouter') {
		if (normalizedEffort === 'auto') return {};
		if (normalizedEffort && normalizedEffort !== 'none') {
			return {
				extra_body: {
					reasoning: { effort: normalizedEffort },
				},
			};
		}
		return {
			extra_body: {
				reasoning: {
					effort: 'none',
					exclude: true,
				},
			},
		};
	}

	// 3. EXPLICIT USER CONFIGURED EFFORT
	if (normalizedEffort && normalizedEffort !== 'auto') {
		return { reasoning_effort: normalizedEffort };
	}

	// 4. DEFAULT ZERO REASONING FOR COMIC TRANSLATION
	// ZERO REASONING (NONE) IS THE HARD INVARIANT DEFAULT ACROSS ALL PROVIDERS & MODELS
	return {
		reasoning_effort: 'none',
	};
}

export function stripThinkingTags(text: string): string {
	if (!text) return '';
	return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function queued<T>(fn: () => Promise<T>): Promise<T> {
	return queue.add(fn, { throwOnTimeout: true }) as Promise<T>;
}

export function isRetryable(e: unknown): boolean {
	const name = (e as { name?: string })?.name;
	if (name === 'APIUserAbortError' || name === 'AbortError') return false;
	const status = (e as { status?: number })?.status;
	if (typeof status === 'number') {
		// 401 UNAUTHORIZED / 403 FORBIDDEN / 400 BAD REQUEST ARE FATAL
		return status === 408 || status === 409 || status === 429 || status >= 500;
	}
	const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
	if (
		msg.includes('api key') ||
		msg.includes('apikey') ||
		msg.includes('unauthorized') ||
		msg.includes('authentication') ||
		msg.includes('forbidden') ||
		msg.includes('401') ||
		msg.includes('403')
	) {
		return false;
	}
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
	return { model, promptTokens, cachedTokens, completionTokens };
}
