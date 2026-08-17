// PIPELINE-CLIENT TESTS — URL/CONTENT CONTRACT AND ERROR MAPPING VIA AN INJECTED FAKE fetch.
import { describe, expect, it, vi } from 'vitest';
import { HttpPipelineClient, PipelineError } from '$lib/server/pipeline-client';

const REGIONS = [
	{
		id: 'r0',
		box: { x: 10, y: 10, w: 100, h: 40 },
		polygon: [
			[10, 10],
			[110, 10],
			[110, 50],
			[10, 50],
		],
	},
];

function mockFetch(status: number, body: unknown | (() => BodyInit)) {
	return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
		return new Response(typeof body === 'function' ? (body as () => BodyInit)() : JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' },
		});
	});
}

describe('HttpPipelineClient', () => {
	it('preprocess POSTs the image to /pages/preprocess and returns PNG buffer', async () => {
		const fetchImpl = mockFetch(200, () => Buffer.from('preprocessed-png'));
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		const out = await client.preprocess(Buffer.from('raw-png'));

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(String(fetchImpl.mock.calls[0][0])).toBe('http://sidecar:8001/pages/preprocess');
		expect(out.toString()).toBe('preprocessed-png');
	});

	it('analyze POSTs the image to /pages/analyze and parses the JSON', async () => {
		const fetchImpl = mockFetch(200, { width: 800, height: 1200, backend: 'comic-ctd', regions: [] });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		const result = await client.analyze(Buffer.from('png-bytes'));

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(String(url)).toBe('http://sidecar:8001/pages/analyze');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBeInstanceOf(FormData);
		expect(result.width).toBe(800);
	});

	it('analyze passes source_lang and target_lang form fields', async () => {
		const fetchImpl = mockFetch(200, { width: 800, height: 1200, backend: 'comic-ctd', regions: [] });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		await client.analyze(Buffer.from('png-bytes'), undefined, { sourceLang: 'zh-Hans', targetLang: 'en' });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(String(url)).toBe('http://sidecar:8001/pages/analyze');
		const body = init?.body as FormData;
		expect(body.get('source_lang')).toBe('zh-Hans');
		expect(body.get('target_lang')).toBe('en');
	});

	it('clean POSTs image + regions JSON and returns the PNG buffer', async () => {
		const fetchImpl = mockFetch(200, () => Buffer.from('png-bytes'));
		const client = new HttpPipelineClient('http://sidecar:8001/', fetchImpl); // TRAILING SLASH STRIPPED

		const out = await client.clean(Buffer.from('img'), REGIONS);

		expect(String(fetchImpl.mock.calls[0][0])).toBe('http://sidecar:8001/pages/clean');
		const body = fetchImpl.mock.calls[0][1]?.body as FormData;
		expect(String(body.get('regions'))).toContain('"id":"r0"');
		expect(out.toString()).toBe('png-bytes');
	});

	it('maps non-2xx responses to PipelineError with the status', async () => {
		const fetchImpl = mockFetch(413, { detail: 'image too large' });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		await expect(client.analyze(Buffer.from('x'))).rejects.toMatchObject({
			name: 'PipelineError',
			status: 413,
		});
	});

	it('maps network failures to PipelineError with status 0 (sidecar down)', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		await expect(client.analyze(Buffer.from('x'))).rejects.toMatchObject({
			name: 'PipelineError',
			status: 0,
		});
	});

	it('re-throws aborts untouched (never retried by the caller)', async () => {
		const fetchImpl = vi.fn(async () => {
			const err = new DOMException('aborted', 'AbortError');
			throw err;
		});
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);
		await expect(client.analyze(Buffer.from('x'), new AbortController().signal)).rejects.toMatchObject({
			name: 'AbortError',
		});
	});

	it('health GETs /health', async () => {
		const fetchImpl = mockFetch(200, { status: 'ok', detector: 'comic-ctd', inpainter: 'lama' });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);
		const h = await client.health();
		expect(h.inpainter).toBe('lama');
		expect(String(fetchImpl.mock.calls[0][0])).toBe('http://sidecar:8001/health');
	});

	it('PipelineError is an instanceof Error', () => {
		expect(new PipelineError('x', 500)).toBeInstanceOf(Error);
	});
});
