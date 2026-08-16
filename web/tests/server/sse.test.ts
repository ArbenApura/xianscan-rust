// SSE PARSER TESTS — THE PURE FRAME-PARSING CONTRACT THE UI DEPENDS ON.
import { describe, expect, it } from 'vitest';
import { parseSseChunk } from '$lib/sse';

describe('parseSseChunk', () => {
	it('parses one data frame', () => {
		const events = parseSseChunk('data: {"type":"start"}\n\n');
		expect(events).toEqual([{ type: 'start' }]);
	});

	it('parses multiple frames in one chunk', () => {
		const events = parseSseChunk('data: {"type":"page-done","page":0}\n\ndata: {"type":"done"}\n\n');
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ type: 'page-done', page: 0 });
	});

	it('ignores comment and blank lines', () => {
		const events = parseSseChunk(': ping\ndata: {"type":"done"}\n\n');
		expect(events).toEqual([{ type: 'done' }]);
	});

	it('ignores malformed JSON frames without throwing', () => {
		const events = parseSseChunk('data: {not json}\n\ndata: {"type":"done"}\n\n');
		expect(events).toEqual([{ type: 'done' }]);
	});

	it('returns nothing for an empty chunk', () => {
		expect(parseSseChunk('')).toEqual([]);
	});
});
