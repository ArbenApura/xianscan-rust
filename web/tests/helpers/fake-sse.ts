// FAKE SSE + FETCH FOR STORE TESTS (FEAT-009 PHASE 1). A TEST DRIVES EACH STREAM BY HAND: emit() AN EVENT,
// end() IT NORMALLY OR fail() IT, AND HOLDS HTTP RESPONSES WITH deferred() TO REPRODUCE RACES.
import type { SseEvent } from '$lib/sse';

export interface FakeStream {
	path: string;
	method: string;
	body: unknown;
	signal?: AbortSignal;
	emit(event: SseEvent): void;
	end(): void;
	fail(err?: Error): void;
	/** SETTLES WHEN THE STREAM ENDS, FAILS OR IS ABORTED (NEVER REJECTS). */
	done: Promise<void>;
	/** TRUE AFTER THE CALLBACK RETURNED 'stop' OR THE STREAM FINISHED. */
	closed: boolean;
}

export function createFakeSse() {
	const streams: FakeStream[] = [];

	function streamSse(
		path: string,
		bodyOrOpts: unknown,
		onEvent: (e: SseEvent) => void | 'stop',
		signal?: AbortSignal,
	): Promise<void> {
		let method = 'POST';
		let body: unknown = bodyOrOpts;
		if (bodyOrOpts && typeof bodyOrOpts === 'object' && 'method' in (bodyOrOpts as object)) {
			const opts = bodyOrOpts as { method?: string; body?: unknown };
			method = opts.method ?? 'POST';
			body = opts.body;
		}
		let resolve!: () => void;
		let reject!: (e: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		let settle!: () => void;
		const done = new Promise<void>((res) => (settle = res));
		const stream: FakeStream = {
			path,
			method,
			body,
			signal,
			closed: false,
			done,
			emit(event) {
				if (stream.closed) return;
				if (onEvent(event) === 'stop') {
					stream.closed = true;
					resolve();
					settle();
				}
			},
			end() {
				if (stream.closed) return;
				stream.closed = true;
				resolve();
				settle();
			},
			fail(err = new Error('connection lost')) {
				if (stream.closed) return;
				stream.closed = true;
				reject(err);
				settle();
			},
		};
		signal?.addEventListener('abort', () => {
			if (stream.closed) return;
			stream.closed = true;
			const abortErr = new Error('aborted');
			abortErr.name = 'AbortError';
			reject(abortErr);
			settle();
		});
		streams.push(stream);
		return promise;
	}

	return {
		streamSse,
		streams,
		lastStream(path?: string): FakeStream | undefined {
			const list = path ? streams.filter((s) => s.path === path) : streams;
			return list[list.length - 1];
		},
	};
}

export interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

export interface FakeRequest {
	url: string;
	method: string;
	body?: string;
}

/** A fetch DOUBLE ROUTED BY "METHOD PATH" OR "PATH" KEYS; RECORDS CALLS AND WHICH RESPONSE BODIES WERE CANCELLED. */
export function createFakeFetch(routes: Record<string, (req: FakeRequest) => Response | Promise<Response>>) {
	const calls: FakeRequest[] = [];
	const bodyCancelled: string[] = [];
	async function fetchImpl(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		const method = (init?.method ?? 'GET').toUpperCase();
		const req: FakeRequest = { url, method, body: typeof init?.body === 'string' ? init.body : undefined };
		calls.push(req);
		const handler = routes[`${method} ${url}`] ?? routes[url];
		if (!handler) return new Response('not found', { status: 404 });
		const res = await handler(req);
		// WRAP THE BODY SO A TEST CAN SEE WHETHER THE CLIENT CANCELLED IT
		const text = await res.text();
		let sent = false;
		const stream = new ReadableStream<Uint8Array>({
			// PULL-BASED: THE BODY CAN BE READ IN FULL, AND A cancel() BEFORE THE END IS STILL OBSERVED
			pull(controller) {
				if (!sent) {
					sent = true;
					controller.enqueue(new TextEncoder().encode(text));
				} else {
					controller.close();
				}
			},
			cancel() {
				bodyCancelled.push(`${method} ${url}`);
			},
		});
		return new Response(stream, { status: res.status, headers: res.headers });
	}
	return { fetch: fetchImpl, calls, bodyCancelled };
}

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
