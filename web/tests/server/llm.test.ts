// LLM CLIENT & TRANSLATION RUNTIME TESTS
// COVERS TOKEN USAGE EXTRACTION, MODEL ALLOWLISTING, REASONING SUPPRESSION, AND RETRY WITH BACKOFF.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeUsage, resolveModel, thinkingParam, withRetry } from '$lib/server/llm';

// -- LIFECYCLES -- //

afterEach(() => {
	vi.useRealTimers();
});

describe('computeUsage', () => {
	it('defaults everything to zero for an undefined usage payload', () => {
		const u = computeUsage(undefined, 'm');
		expect(u).toMatchObject({ promptTokens: 0, cachedTokens: 0, completionTokens: 0, model: 'm' });
	});

	it('counts plain prompt/completion tokens', () => {
		const u = computeUsage(
			{ prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300 } as never,
			'm',
		);
		expect(u.promptTokens).toBe(1000);
		expect(u.cachedTokens).toBe(0);
		expect(u.completionTokens).toBe(300);
	});

	it('reads prompt_cache_hit_tokens as the cached portion', () => {
		const u = computeUsage(
			{
				prompt_tokens: 1000,
				completion_tokens: 100,
				total_tokens: 1100,
				prompt_cache_hit_tokens: 600,
				prompt_cache_miss_tokens: 400,
			} as never,
			'm',
		);
		expect(u.promptTokens).toBe(1000);
		expect(u.cachedTokens).toBe(600);
		expect(u.completionTokens).toBe(100);
	});

	it('falls back to prompt_tokens_details.cached_tokens and derives cached tokens', () => {
		const u = computeUsage(
			{
				prompt_tokens: 500,
				completion_tokens: 50,
				total_tokens: 550,
				prompt_tokens_details: { cached_tokens: 200 },
			} as never,
			'm',
		);
		expect(u.cachedTokens).toBe(200);
	});
});

describe('resolveModel', () => {
	it('passes through requested models', () => {
		expect(resolveModel('deepseek-v4-flash')).toBe('deepseek-v4-flash');
		expect(resolveModel('gemini-3.7-flash')).toBe('gemini-3.7-flash');
	});

	it('falls back to the default for unknown/empty/null models — never lets arbitrary strings through', () => {
		const d = resolveModel(undefined);
		expect(resolveModel('gpt-4')).toBe(d);
		expect(resolveModel('')).toBe(d);
		expect(resolveModel(null)).toBe(d);
	});
});

describe('thinkingParam', () => {
	it('disables reasoning/thinking mode for DeepSeek', () => {
		expect(thinkingParam('deepseek-v4-flash')).toEqual({ reasoning_effort: 'none' });
		expect(thinkingParam('deepseek-v4-pro')).toEqual({});
		expect(thinkingParam()).toEqual({ reasoning_effort: 'none' });
	});

	it('disables reasoning/thinking mode for Google Gemini', () => {
		expect(thinkingParam('gemini-3.7-flash')).toEqual({ reasoning_effort: 'none' });
		expect(thinkingParam('gemini-3.5-flash')).toEqual({ reasoning_effort: 'none' });
	});
});

describe('withRetry', () => {
	it('succeeds on the first attempt', async () => {
		const fn = vi.fn().mockResolvedValue('ok');
		await expect(withRetry(fn)).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries transient failures (429) with backoff and eventually succeeds', async () => {
		vi.useFakeTimers();
		const fn = vi
			.fn()
			.mockRejectedValueOnce({ status: 429 })
			.mockRejectedValueOnce({ status: 429 })
			.mockResolvedValue('recovered');
		const p = withRetry(fn, 4);
		const assertion = expect(p).resolves.toBe('recovered');
		// ADVANCE PAST BOTH BACKOFF SLEEPS PLUS THE 0-400ms JITTER ON EACH (600ms, 1200ms)
		await vi.advanceTimersByTimeAsync(600 + 1200 + 800 + 10);
		await assertion;
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it('does not retry non-retryable errors (400/401)', async () => {
		const fn = vi.fn().mockRejectedValue({ status: 401 });
		await expect(withRetry(fn)).rejects.toMatchObject({ status: 401 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('does not retry deliberate aborts', async () => {
		const fn = vi.fn().mockRejectedValue({ name: 'AbortError' });
		await expect(withRetry(fn)).rejects.toMatchObject({ name: 'AbortError' });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('gives up after the retry budget is exhausted', async () => {
		vi.useFakeTimers();
		const fn = vi.fn().mockRejectedValue({ status: 503 });
		const p = withRetry(fn, 2);
		// ATTACH THE ASSERTION BEFORE ADVANCING TIMERS SO THE REJECTION IS ALWAYS HANDLED
		const assertion = expect(p).rejects.toMatchObject({ status: 503 });
		await vi.advanceTimersByTimeAsync(600 + 1200 + 2400 + 800 + 100);
		await assertion;
		expect(fn).toHaveBeenCalledTimes(3); // INITIAL + 2 RETRIES
	});
});
