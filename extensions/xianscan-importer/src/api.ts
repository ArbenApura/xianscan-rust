import type { BookSummary, ChapterSummary } from './types';

export interface CreateBookPayload {
	title: string;
	sourceLang?: string;
	targetLang?: string;
}

export interface CreateChapterPayload {
	title?: string;
	chapterNumber: number;
}

export interface UploadPageFile {
	blob: Blob;
	filename: string;
}

function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const scope = typeof self !== 'undefined' ? self : globalThis;
	const fn = scope.fetch || globalThis.fetch;
	return fn.call(scope, input, init);
}

export class XianScanClient {
	private baseUrl: string;
	private fetchImpl: typeof fetch;

	constructor(baseUrl = 'http://127.0.0.1:8124', fetchImpl?: typeof fetch) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.fetchImpl = fetchImpl || safeFetch;
	}

	setBaseUrl(url: string) {
		this.baseUrl = url.replace(/\/+$/, '');
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const targetUrl = `${this.baseUrl}${path}`;
		const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
		const isServiceWorker = typeof window === 'undefined';

		// 1. Try background proxy ONLY from popup/window context for JSON requests (FormData cannot cross IPC)
		if (!isFormData && !isServiceWorker && typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
			try {
				const proxyResult = await new Promise<{ ok: boolean; status: number; data?: any; error?: string }>(resolve => {
					chrome.runtime.sendMessage(
						{
							type: 'PROXY_REQUEST',
							url: targetUrl,
							options
						},
						res => {
							if (chrome.runtime.lastError || !res) {
								resolve({ ok: false, status: 0, error: chrome.runtime.lastError?.message || 'Proxy unavailable' });
							} else {
								resolve(res);
							}
						}
					);
				});

				if (proxyResult.ok) {
					return proxyResult.data as T;
				}
			} catch {
				// Fallback to direct fetch
			}
		}

		// 2. Direct fetch with IPv4 / localhost fallback
		const tryDirectFetch = async (urlToTry: string): Promise<Response> => {
			const controller = new AbortController();
			const timeoutMs = isFormData ? 45000 : 8000;
			const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const fn = this.fetchImpl || safeFetch;
				const scope = typeof self !== 'undefined' ? self : globalThis;
				return await fn.call(scope, urlToTry, { ...options, signal: controller.signal });
			} finally {
				clearTimeout(timeoutId);
			}
		};

		let res: Response;
		try {
			res = await tryDirectFetch(targetUrl);
		} catch (primaryErr) {
			// If localhost failed, try 127.0.0.1 (or vice-versa)
			const altBase = this.baseUrl.includes('localhost')
				? this.baseUrl.replace('localhost', '127.0.0.1')
				: this.baseUrl.replace('127.0.0.1', 'localhost');

			try {
				res = await tryDirectFetch(`${altBase}${path}`);
				this.baseUrl = altBase;
			} catch {
				throw primaryErr;
			}
		}

		if (!res.ok) {
			const errorData = await res.json().catch(() => ({}));
			const msg = (errorData as { message?: string }).message || `Request failed with status ${res.status}`;
			throw new Error(msg);
		}
		return res.json() as Promise<T>;
	}

	async checkHealth(): Promise<{ status: string; detector?: string; accelerator?: string }> {
		try {
			const hw = await this.request<{ device_label?: string; status?: string }>('/api/system/hardware');
			return {
				status: 'ok',
				accelerator: hw.device_label || 'DirectML / CPU'
			};
		} catch {
			const booksRes = await this.request<{ books?: BookSummary[] } | BookSummary[]>('/api/books');
			if (booksRes) {
				return { status: 'ok' };
			}
			throw new Error('Server unreachable');
		}
	}

	async getBooks(): Promise<BookSummary[]> {
		const res = await this.request<{ books?: BookSummary[] } | BookSummary[]>('/api/books');
		if (Array.isArray(res)) return res;
		if (res && Array.isArray(res.books)) return res.books;
		return [];
	}

	async createBook(payload: CreateBookPayload): Promise<BookSummary> {
		const res = await this.request<{ id: string | number }>('/api/books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: payload.title,
				sourceLang: payload.sourceLang || 'zh-Hans',
				targetLang: payload.targetLang || 'en'
			})
		});
		return {
			id: res.id,
			title: payload.title,
			sourceLang: payload.sourceLang || 'zh-Hans',
			targetLang: payload.targetLang || 'en'
		};
	}

	async getChapters(bookId: string | number): Promise<ChapterSummary[]> {
		const res = await this.request<{ chapters?: ChapterSummary[] } | ChapterSummary[]>(`/api/books/${bookId}`);
		if (Array.isArray(res)) return res;
		if (res && Array.isArray(res.chapters)) return res.chapters;
		return [];
	}

	async createChapter(bookId: string | number, payload: CreateChapterPayload): Promise<ChapterSummary> {
		const chapterTitle = payload.title || `Chapter ${payload.chapterNumber}`;
		const res = await this.request<ChapterSummary>(`/api/books/${bookId}/chapters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: chapterTitle
			})
		});
		return res;
	}

	async uploadPages(chapterId: number, pages: UploadPageFile[]): Promise<{ added: number }> {
		const formData = new FormData();
		for (const page of pages) {
			formData.append('files', page.blob, page.filename);
		}

		return this.request<{ added: number }>(`/api/chapters/${chapterId}/pages`, {
			method: 'POST',
			body: formData
		});
	}

	async triggerTranslate(chapterId: number): Promise<{ success: boolean; message?: string }> {
		const targetUrl = `${this.baseUrl}/api/chapters/${chapterId}/translate`;
		try {
			const controller = new AbortController();
			// The server starts the detached translation job immediately upon receiving POST
			const timeoutId = setTimeout(() => controller.abort(), 2000);
			try {
				const fn = this.fetchImpl || safeFetch;
				const scope = typeof self !== 'undefined' ? self : globalThis;
				const res = await fn.call(scope, targetUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ force: false }),
					signal: controller.signal
				});
				return { success: res.ok || res.status === 200 };
			} finally {
				clearTimeout(timeoutId);
			}
		} catch {
			// Detached server job proceeds even if SSE stream is closed on client
			return { success: true };
		}
	}
}
