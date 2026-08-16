// SSE CLIENT TRANSPORT — PORTED PATTERN FROM xianslate's src/lib/sse.ts (SIMPLIFIED FOR MODERN
// BROWSERS: FETCH READABLE STREAM ONLY — THE XHR/WKWebView FALLBACK IS UNNECESSARY FOR THIS APP).
export type SseEvent = { type: string } & Record<string, unknown>;

// PURE — UNIT-TESTED: SPLIT A RAW SSE CHUNK INTO EVENTS ("data: {...}" LINES, SEPARATED BY BLANK LINES).
export function parseSseChunk(chunk: string): SseEvent[] {
	const events: SseEvent[] = [];
	for (const block of chunk.split('\n\n')) {
		for (const line of block.split('\n')) {
			if (!line.startsWith('data: ')) continue;
			try {
				events.push(JSON.parse(line.slice(6)) as SseEvent);
			} catch {
				// IGNORE A MALFORMED FRAME — THE NEXT ONE MAY STILL BE FINE
			}
		}
	}
	return events;
}

// STREAM EVENTS FROM `path` UNTIL THE SERVER CLOSES THE STREAM OR THE CALLBACK RETURNS 'stop'.
// THROWS WHEN THE RESPONSE IS NOT OK (BEFORE ANY EVENT IS PROCESSED).
export async function streamSse(
	path: string,
	bodyOrOpts: unknown,
	onEvent: (e: SseEvent) => void | 'stop',
	signal?: AbortSignal,
): Promise<void> {
	let method = 'POST';
	let body: BodyInit | undefined = undefined;

	if (bodyOrOpts && typeof bodyOrOpts === 'object' && 'method' in bodyOrOpts) {
		const opts = bodyOrOpts as { method?: string; body?: unknown };
		method = opts.method ?? 'POST';
		if (opts.body !== undefined && method !== 'GET') {
			body = JSON.stringify(opts.body);
		}
	} else if (bodyOrOpts !== undefined && bodyOrOpts !== null) {
		body = JSON.stringify(bodyOrOpts);
	}

	const resp = await fetch(path, {
		method,
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream',
		},
		body,
		signal,
	});

	if (!resp.ok || !resp.body) {
		throw new Error(`SSE request failed (${resp.status})`);
	}
	const reader = resp.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		// A FRAME MAY SPAN TWO CHUNKS — KEEP THE TAIL (EVERYTHING AFTER THE LAST BLANK LINE) BUFFERED
		const parts = buffer.split('\n\n');
		buffer = parts.pop() ?? '';
		for (const event of parseSseChunk(parts.join('\n\n'))) {
			if (onEvent(event) === 'stop') return;
		}
	}
	// FLUSH THE REMAINING TAIL
	for (const event of parseSseChunk(buffer)) {
		if (onEvent(event) === 'stop') return;
	}
}

