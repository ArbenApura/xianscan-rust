import type { BookSummary, ChapterSummary, ChapterReaderResult, ServerCanonicalSettings } from './types';

export interface CreateBookPayload {
	title: string;
	titleTarget?: string;
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
		const isWebPageContext = typeof window !== 'undefined' && !isServiceWorker;
		const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:';

		// 1. Try background proxy from popup or content script context for JSON requests (FormData cannot cross IPC)
		if (!isFormData && isWebPageContext && typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
			if (!chrome.runtime?.id) {
				throw new Error('Extension context invalidated.');
			}

			let proxyResult: { ok: boolean; status: number; data?: any; error?: string } | null = null;
			let attempts = 0;
			const maxAttempts = 3;

			while (attempts < maxAttempts) {
				attempts++;
				try {
					if (!chrome.runtime?.id) {
						throw new Error('Extension context invalidated.');
					}

					proxyResult = await new Promise<{ ok: boolean; status: number; data?: any; error?: string }>(resolve => {
						try {
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
						} catch (sendErr: any) {
							resolve({ ok: false, status: 0, error: sendErr?.message || 'Extension context invalidated.' });
						}
					});

					if (proxyResult.ok) {
						return proxyResult.data as T;
					}

					if (proxyResult.error && (proxyResult.error.includes('context invalidated') || proxyResult.error.includes('Context invalidated'))) {
						throw new Error('Extension context invalidated.');
					}

					if (proxyResult.status > 0) {
						const msg = (proxyResult.data as { message?: string })?.message || `Request failed with status ${proxyResult.status}`;
						throw new Error(msg);
					}

					// If status === 0 (service worker waking up / IPC blip), retry with short backoff
					if (attempts < maxAttempts) {
						await new Promise(r => setTimeout(r, attempts * 250));
					}
				} catch (err) {
					if (err instanceof Error) {
						if (err.message.includes('Extension context invalidated') || err.message.includes('context invalidated')) {
							throw err;
						}
						if (!err.message.includes('Proxy unavailable') && !err.message.includes('status 0')) {
							throw err;
						}
					}
				}
			}

			// If proxy succeeded or failed with explicit HTTP status, we already returned or threw.
			// If on HTTPS page and target is HTTP, DO NOT attempt direct fetch as it is guaranteed to fail due to Mixed Content / PNA.
			if (isHttpsPage && targetUrl.startsWith('http://')) {
				throw new Error(proxyResult?.error || 'Could not connect to XianScan backend via extension background proxy.');
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
				titleTarget: payload.titleTarget?.trim() || undefined,
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

	// TRANSLATE A SINGLE TITLE STRING VIA THE SERVER (kind: 'title') — MIRRORS THE WEB UI'S
	// "AUTO-TRANSLATE BOOK TITLE" BUTTON NEXT TO THE TARGET TITLE FIELD.
	async translateText(payload: {
		text: string;
		kind?: 'title' | 'chapter' | 'term' | 'general';
		sourceLang?: string;
		targetLang?: string;
	}): Promise<{ text: string }> {
		return this.request<{ text: string }>('/api/translate-text', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: payload.text,
				kind: payload.kind || 'title',
				sourceLang: payload.sourceLang,
				targetLang: payload.targetLang,
			}),
		});
	}

	async getChapters(bookId: string | number): Promise<ChapterSummary[]> {
		const res = await this.request<{ chapters?: ChapterSummary[] } | ChapterSummary[]>(`/api/books/${bookId}`);
		if (Array.isArray(res)) return res;
		if (res && Array.isArray(res.chapters)) return res.chapters;
		return [];
	}

	async createChapter(bookId: string | number, payload: CreateChapterPayload): Promise<ChapterSummary> {
		const chapterTitle = payload.title || `Chapter ${payload.chapterNumber}`;
		const res = await this.request<{ id: number; seq: number; title?: string }>(`/api/books/${bookId}/chapters`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: chapterTitle
			})
		});
		return {
			id: res.id,
			title: res.title || chapterTitle,
			chapterNumber: payload.chapterNumber || (res.seq + 1),
			bookId
		};
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

	async triggerReslice(chapterId: number): Promise<{ success: boolean; message?: string }> {
		const targetUrl = `${this.baseUrl}/api/chapters/${chapterId}/reslice`;
		try {
			const fn = this.fetchImpl || safeFetch;
			const scope = typeof self !== 'undefined' ? self : globalThis;
			const res = await fn.call(scope, targetUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				const msg = (errorData as { message?: string }).message || `Reslice failed with status ${res.status}`;
				throw new Error(msg);
			}

			// CONSUME SSE STREAM UNTIL COMPLETION (OR ERROR)
			const reader = res.body?.getReader();
			if (!reader) return { success: true };

			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value);
				if (text.includes('"type":"error"')) {
					throw new Error('Reslice encountered an error');
				}
			}

			return { success: true };
		} catch (err: any) {
			console.warn('RESLICE REQUEST FAILED:', err);
			throw err;
		}
	}

	async triggerTranslate(chapterId: number): Promise<{ success: boolean; message?: string }> {
		const targetUrl = `${this.baseUrl}/api/chapters/${chapterId}/translate`;
		try {
			const controller = new AbortController();
			// THE SERVER STARTS THE DETACHED TRANSLATION JOB IMMEDIATELY UPON RECEIVING POST
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
			// DETACHED SERVER JOB PROCEEDS EVEN IF SSE STREAM IS CLOSED ON CLIENT
			return { success: true };
		}
	}

	async getChapterDetails(chapterId: number): Promise<ChapterReaderResult> {
		return this.request<ChapterReaderResult>(`/api/chapters/${chapterId}`);
	}

	// FETCH THE SERVER'S CANONICAL app_settings (SQLITE) — THE SOURCE OF TRUTH FOR THE
	// USER'S TRANSLATION PREFERENCES THAT THE WEB UI RELIES ON FOR ITS REQUEST BODY.
	async getSettings(): Promise<ServerCanonicalSettings> {
		return this.request<ServerCanonicalSettings>('/api/settings');
	}

	// START A CHAPTER TRANSLATION THROUGH THE SERVER-SIDE BATCH QUEUE SO THE JOB IS
	// BROADCAST VIA /api/batch/events (THE QUEUE MODAL ON READER, LIBRARY & CHAPTER LIST
	// STAYS LIVE), AND RELAY THE USER'S STORED SQLITE PREFERENCES IN THE BODY SO THE JOB
	// HONORS PARALLELISM, SFX, INPAINT & TYPESET EXACTLY LIKE A WEB-UI-TRIGGERED BATCH.
	// RESLICING IS LEFT TO THE EXTENSION'S OWN autoReslice STEP (resliceBeforeBatch: false).
	async startBatchTranslation(opts: {
		bookId: string | number;
		bookTitle?: string;
		chapterId: number;
		settings?: ServerCanonicalSettings;
		force?: boolean;
		pageIds?: number[];
	}): Promise<{ success: boolean; message?: string }> {
		const s = opts.settings || {};
		const body = {
			bookId: String(opts.bookId),
			bookTitle: opts.bookTitle || '',
			chapterIds: [opts.chapterId],
			pageIds: opts.pageIds && opts.pageIds.length > 0 ? opts.pageIds : undefined,
			force: opts.force ?? false,
			parallelWorkers: s.parallelChapters,
			pageConcurrency: s.parallelProcesses,
			resliceBeforeBatch: false,
			inpaintMode: s.inpaintMode,
			inpaintExpansionPct: s.inpaintExpansionPct,
			typesetExpansionPct: s.typesetExpansionPct,
			enableWatermarkInpaint: s.enableWatermarkInpaint,
			enableSfx: s.enableSfx,
			sfxMaxAreaPct: s.sfxMaxAreaPct,
			typesetOptions: {
				fontDialogue: s.typesetFont,
				fontCjk: s.typesetCjkFont,
				boxInset: s.typesetPadding,
				outlineMode: s.typesetOutline,
				colorMode: s.typesetContrast,
				casing: s.typesetCasing,
				enableRotation: s.enableTextRotation,
			},
		};

		try {
			await this.request(`/api/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			return { success: true };
		} catch (err: any) {
			console.warn('BATCH TRANSLATE REQUEST FAILED:', err);
			return { success: false, message: err?.message };
		}
	}

	getPageFileUrl(pageId: number, kind: 'output' | 'original' | 'cleaned' | 'thumb' = 'output', rev?: number): string {
		const revQuery = rev !== undefined && rev !== null ? `&rev=${rev}` : '';
		return `${this.baseUrl}/api/pages/${pageId}/file?kind=${kind}${revQuery}`;
	}

	async cancelTranslation(chapterId: number): Promise<void> {
		try {
			await this.request(`/api/chapters/${chapterId}/translate`, {
				method: 'DELETE'
			});
		} catch {
			// IGNORE IF ALREADY STOPPED
		}
	}

	// REMOVE THE CHAPTER FROM THE ACTIVE BATCH QUEUE. THIS ABORTS THE CHAPTER JOB AND STOPS THE
	// BATCH WATCHDOG FROM AUTO-RETRYING AN EXTERNALLY-CANCELLED JOB. RETURNS false WHEN THERE IS
	// NO ACTIVE BATCH (SO THE CALLER CAN FALL BACK TO THE CHAPTER-LEVEL ABORT).
	async cancelBatchTranslation(chapterId: number): Promise<{ success: boolean; removed: boolean }> {
		try {
			const res = await this.request<{ success?: boolean; removed?: boolean }>('/api/batch', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chapterId }),
			});
			return { success: res?.success !== false, removed: Boolean(res?.removed) };
		} catch (err: any) {
			console.warn('BATCH CANCEL REQUEST FAILED:', err);
			return { success: false, removed: false };
		}
	}
}
