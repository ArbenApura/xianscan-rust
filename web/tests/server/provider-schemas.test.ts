import { describe, it, expect } from 'vitest';
import { fetchModelsSchema, providerBaseUrlSchema, testProviderSchema, updateProviderSchema } from '$lib/schemas';

describe('provider base URL schema', () => {
	it.each([
		'file:///etc/passwd',
		'ftp://example.com/v1',
		'javascript:alert(1)',
		'http://user:pass@host.example/v1',
		'https://h.example/#x',
		'not a url',
	])('rejects %s', (url) => {
		expect(providerBaseUrlSchema.safeParse(url).success).toBe(false);
	});

	it.each(['http://192.168.1.5:1234/v1', 'https://api.deepseek.com', 'http://[::1]:11434/v1'])('accepts %s', (url) => {
		expect(providerBaseUrlSchema.safeParse(url).success).toBe(true);
	});

	it('keeps the empty string as "unchanged" on update, test and model discovery', () => {
		expect(updateProviderSchema.safeParse({ id: 'custom', baseUrl: '' }).success).toBe(true);
		expect(testProviderSchema.safeParse({ id: 'custom', baseUrl: '' }).success).toBe(true);
		expect(fetchModelsSchema.safeParse({ id: 'custom', baseUrl: '' }).success).toBe(true);
	});

	it('fetchModelsSchema requires an id and a safe base URL', () => {
		expect(fetchModelsSchema.safeParse({}).success).toBe(false);
		expect(fetchModelsSchema.safeParse({ id: 'custom', baseUrl: 'file:///x' }).success).toBe(false);
		expect(fetchModelsSchema.safeParse({ id: 'custom', apiKey: 'k', baseUrl: 'https://a.example/v1' }).success).toBe(
			true,
		);
	});
});
