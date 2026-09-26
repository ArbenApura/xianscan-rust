// MINIMAL RequestEvent DOUBLE FOR HOOK AND ROUTE TESTS.

export interface FakeEventOptions {
	method?: string;
	url?: string;
	headers?: Record<string, string>;
	clientAddress?: string;
	cookies?: Record<string, string>;
	body?: unknown;
	isSubRequest?: boolean;
}

export function fakeEvent(opts: FakeEventOptions = {}) {
	const url = new URL(opts.url ?? 'http://localhost:8124/api/books');
	const headers = new Headers({ host: url.host, ...(opts.headers ?? {}) });
	const method = opts.method ?? 'GET';
	const init: RequestInit = { method, headers };
	if (opts.body !== undefined) {
		init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
		headers.set('content-type', 'application/json');
	}
	const jar = new Map(Object.entries(opts.cookies ?? {}));
	const setCookies: Array<{ name: string; value: string; opts: any }> = [];
	const deleted: string[] = [];
	return {
		request: new Request(url, init),
		url,
		params: {},
		locals: {} as App.Locals,
		isSubRequest: opts.isSubRequest ?? false,
		getClientAddress: () => opts.clientAddress ?? '127.0.0.1',
		cookies: {
			get: (name: string) => jar.get(name),
			getAll: () => [...jar].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string, o: any) => {
				jar.set(name, value);
				setCookies.push({ name, value, opts: o });
			},
			delete: (name: string) => {
				jar.delete(name);
				deleted.push(name);
			},
			serialize: () => '',
		},
		setCookies,
		deleted,
	} as any;
}
