// A RESLICE REFUSED BY THE LIMITS (413 HttpError) STREAMS ITS PLAIN MESSAGE, NOT {"message":"..."} (AUDIT: BROKEN #1)
import { describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';

const LIMIT_MESSAGE = 'This chapter has 450 pages, over the reslice limit of 400. Split it into smaller chapters first.';

vi.mock('$lib/server/chapters', () => ({
	assertChapterExists: vi.fn(async () => {}),
	resliceChapterPages: vi.fn(async () => {
		error(413, LIMIT_MESSAGE);
	}),
}));
vi.mock('$lib/server/pipeline-client', () => ({ createPipelineClient: vi.fn(() => ({})) }));
vi.mock('$lib/server/sync-bus', () => ({ syncBus: { broadcast: vi.fn() } }));
vi.mock('$lib/server/paths', () => ({ DATA_ROOT: '/tmp/xianscan-test' }));

import { POST } from '../../src/routes/api/chapters/[id]/reslice/+server';

function events(text: string): Array<Record<string, unknown>> {
	return text
		.split('\n\n')
		.map((chunk) => chunk.trim())
		.filter((chunk) => chunk.startsWith('data: '))
		.map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

describe('reslice route errors', () => {
	it('streams the limit message as plain text', async () => {
		const request = new Request('http://localhost/api/chapters/1/reslice', { method: 'POST', body: '{}' });
		const res = await POST({ params: { id: '1' }, request } as never);
		const error = events(await res.text()).find((e) => e.type === 'error');
		expect(error?.message).toBe(LIMIT_MESSAGE);
	});
});
