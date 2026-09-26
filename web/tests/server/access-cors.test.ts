import { describe, it, expect } from 'vitest';
import { corsHeadersFor } from '$lib/server/access/cors';

describe('corsHeadersFor', () => {
	it('returns null for web origins and missing origins', () => {
		expect(corsHeadersFor('https://evil.example')).toBeNull();
		expect(corsHeadersFor('http://localhost:5173')).toBeNull();
		expect(corsHeadersFor(null)).toBeNull();
		expect(corsHeadersFor('not a url')).toBeNull();
	});

	it.each(['chrome-extension://abc', 'moz-extension://abc-def', 'safari-web-extension://x'])(
		'reflects the extension origin %s with Vary: Origin',
		(origin) => {
			const h = corsHeadersFor(origin);
			expect(h).not.toBeNull();
			expect(h!['Access-Control-Allow-Origin']).toBe(origin);
			expect(h!['Vary']).toBe('Origin');
			expect(h!['Access-Control-Allow-Headers']).toContain('X-XianScan-Token');
		},
	);

	it('never returns a wildcard or allows credentials', () => {
		const h = corsHeadersFor('chrome-extension://abc')!;
		expect(Object.values(h)).not.toContain('*');
		expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
	});
});
