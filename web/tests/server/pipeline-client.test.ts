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

	it('analyze forwards inpaint_padding_pct to FormData when provided', async () => {
		const fetchImpl = mockFetch(200, { width: 800, height: 1200, backend: 'comic-ctd', regions: [] });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		await client.analyze(Buffer.from('png-bytes'), undefined, { inpaintPaddingPct: 0.06 });

		const body = fetchImpl.mock.calls[0][1]?.body as FormData;
		expect(body.get('inpaint_padding_pct')).toBe('0.06');
	});

	it('analyze forwards enable_typeset_centering to FormData when provided', async () => {
		const fetchImpl = mockFetch(200, { width: 800, height: 1200, backend: 'comic-ctd', regions: [] });
		const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);

		await client.analyze(Buffer.from('png-bytes'), undefined, { enableTypesetCentering: false });

		const body = fetchImpl.mock.calls[0][1]?.body as FormData;
		expect(body.get('enable_typeset_centering')).toBe('false');
	});

	it('clean POSTs image + regions JSON and returns the PNG buffer', async () => {
		const fetchImpl = mockFetch(200, () => Buffer.from('png-bytes'));
		const client = new HttpPipelineClient('http://sidecar:8001/', fetchImpl); // TRAILING SLASH STRIPPED

		const out = await client.clean(Buffer.from('img'), REGIONS, 'patch', undefined, false);

		expect(String(fetchImpl.mock.calls[0][0])).toBe('http://sidecar:8001/pages/clean');
		const body = fetchImpl.mock.calls[0][1]?.body as FormData;
		expect(String(body.get('regions'))).toContain('"id":"r0"');
		expect(body.get('enable_white_inpaint')).toBe('false');
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

	describe('ML shared secret', () => {
		const headerOf = (fetchImpl: ReturnType<typeof mockFetch>, i = 0) =>
			new Headers(fetchImpl.mock.calls[i][1]?.headers).get('x-xianscan-ml-secret');

		it('sends the secret on multipart, GET and JSON calls', async () => {
			const fetchImpl = mockFetch(200, { width: 1, height: 1, backend: 'x', regions: [], status: 'ok' });
			const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl, 's3cret');

			await client.analyze(Buffer.from('img'));
			await client.health();
			await client.getHardware().catch(() => undefined);

			expect(headerOf(fetchImpl, 0)).toBe('s3cret');
			expect(headerOf(fetchImpl, 1)).toBe('s3cret');
			expect(headerOf(fetchImpl, 2)).toBe('s3cret');
			// MULTIPART BODIES MUST NOT GET A HAND-SET CONTENT-TYPE (THE BOUNDARY WOULD BE LOST)
			expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('content-type')).toBeNull();
		});

		it('sends no secret header when none is configured', async () => {
			const fetchImpl = mockFetch(200, { status: 'ok' });
			const client = new HttpPipelineClient('http://sidecar:8001', fetchImpl);
			await client.health();
			expect(headerOf(fetchImpl)).toBeNull();
		});
	});
});

describe('HttpPipelineClient.reslice result validation (FEAT-002)', () => {
	const webp = (n: number) => {
		const b = Buffer.alloc(16);
		b.write('RIFF', 0, 'ascii');
		b.write('WEBP', 8, 'ascii');
		b[15] = n;
		return new Uint8Array(b);
	};

	async function resliceWith(entries: Record<string, Uint8Array>, count: string | null) {
		const { zipSync } = await import('fflate');
		const zip = zipSync(entries);
		const fetchImpl = vi.fn(async () => {
			const headers: Record<string, string> = { 'content-type': 'application/zip' };
			if (count !== null) headers['x-slice-count'] = count;
			return new Response(zip, { status: 200, headers });
		});
		return new HttpPipelineClient('http://sidecar:8001', fetchImpl).reslice([Buffer.from('x')]);
	}

	it('returns the slices when the count and keys match', async () => {
		const out = await resliceWith({ '0.webp': webp(0), '1.webp': webp(1) }, '2');
		expect(out).toHaveLength(2);
		expect(out[1][15]).toBe(1);
	});

	it('throws when x-slice-count is missing', async () => {
		await expect(resliceWith({ '0.webp': webp(0) }, null)).rejects.toBeInstanceOf(PipelineError);
	});

	it('throws when the count does not match the archive', async () => {
		await expect(resliceWith({ '0.webp': webp(0), '1.webp': webp(1) }, '3')).rejects.toThrow(/2 of 3/);
	});

	it('throws when the keys skip a number', async () => {
		await expect(resliceWith({ '0.webp': webp(0), '2.webp': webp(2) }, '2')).rejects.toThrow(/slice 1 is missing/);
	});

	it('throws when a slice is empty', async () => {
		await expect(resliceWith({ '0.webp': webp(0), '1.webp': new Uint8Array(0) }, '2')).rejects.toThrow(/slice 1 is empty/);
	});
});
