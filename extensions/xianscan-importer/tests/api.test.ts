import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XianScanClient } from '../src/api';

describe('XianScanClient', () => {
	let client: XianScanClient;
	let mockFetch: any;

	beforeEach(() => {
		mockFetch = vi.fn();
		client = new XianScanClient('http://localhost:8124', mockFetch);
	});

	it('checks server health via /api/system/hardware', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ device_label: 'DirectML (GPU)', active_provider: 'DmlExecutionProvider' })
		});

		const health = await client.checkHealth();
		expect(health.status).toBe('ok');
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/system/hardware', expect.any(Object));
	});

	it('fetches books list supporting both { books: [] } and direct array', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ books: [{ id: 'uuid-1', title: 'Tales of Demons', sourceLang: 'zh', targetLang: 'en' }] })
		});

		const books = await client.getBooks();
		expect(books).toHaveLength(1);
		expect(books[0].title).toBe('Tales of Demons');
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/books', expect.any(Object));
	});

	it('creates a new book', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: 'uuid-5' })
		});

		const book = await client.createBook({ title: 'Solo Leveling', sourceLang: 'ko', targetLang: 'en' });
		expect(book.id).toBe('uuid-5');
		expect(book.title).toBe('Solo Leveling');
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/books', expect.objectContaining({
			method: 'POST'
		}));
	});

	it('sends titleTarget when creating a book', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: 'uuid-6' })
		});

		await client.createBook({ title: '나 혼자만 레벨업', titleTarget: 'Solo Leveling', sourceLang: 'ko', targetLang: 'en' });
		const [, init] = mockFetch.mock.calls[0];
		expect(JSON.parse(init.body).titleTarget).toBe('Solo Leveling');
	});

	it('translates a title via /api/translate-text', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ text: 'Solo Leveling' })
		});

		const res = await client.translateText({ text: '나 혼자만 레벨업', kind: 'title', sourceLang: 'ko', targetLang: 'en' });
		expect(res.text).toBe('Solo Leveling');
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/translate-text', expect.objectContaining({
			method: 'POST',
			body: JSON.stringify({ text: '나 혼자만 레벨업', kind: 'title', sourceLang: 'ko', targetLang: 'en' })
		}));
	});

	it('creates a new chapter', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: 42, bookId: 'uuid-5', title: 'Chapter 1', chapterNumber: 1 })
		});

		const chapter = await client.createChapter('uuid-5', { title: 'Chapter 1', chapterNumber: 1 });
		expect(chapter.id).toBe(42);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/books/uuid-5/chapters', expect.objectContaining({
			method: 'POST'
		}));
	});

	it('uploads pages via multipart form', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ added: 2 })
		});

		const dummyBlob = new Blob(['image-data'], { type: 'image/jpeg' });
		const result = await client.uploadPages(42, [
			{ blob: dummyBlob, filename: 'page_01.jpg' }
		]);

		expect(result.added).toBe(2);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/chapters/42/pages', expect.objectContaining({
			method: 'POST'
		}));
	});

	it('triggers chapter reslice and consumes sse stream', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
				controller.enqueue(encoder.encode('data: {"type":"done","originalCount":5,"newCount":3}\n\n'));
				controller.close();
			}
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			body: stream
		});

		const result = await client.triggerReslice(42);
		expect(result.success).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/chapters/42/reslice', expect.objectContaining({
			method: 'POST'
		}));
	});

	it('triggers chapter translation', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200
		});

		const result = await client.triggerTranslate(42);
		expect(result.success).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/chapters/42/translate', expect.objectContaining({
			method: 'POST'
		}));
	});

	it('handles triggerTranslate failure when server returns error status', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => ({ message: 'CUDA out of memory' })
		});

		const result = await client.triggerTranslate(42);
		expect(result.success).toBe(false);
		expect(result.message).toBe('CUDA out of memory');
	});

	it('fetches canonical settings from /api/settings', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ parallelProcesses: 1, parallelChapters: 1, enableSfx: false })
		});

		const settings = await client.getSettings();
		expect(settings.parallelProcesses).toBe(1);
		expect(settings.enableSfx).toBe(false);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/settings', expect.any(Object));
	});

	it('starts a batch translation relaying canonical settings', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ active: true, queue: [] })
		});

		const result = await client.startBatchTranslation({
			bookId: 'uuid-5',
			bookTitle: 'My Book',
			chapterId: 42,
			settings: {
				parallelProcesses: 1,
				parallelChapters: 1,
				inpaintMode: 'patch',
				inpaintExpansionPct: 0.03,
				typesetExpansionPct: 0.03,
				enableWatermarkInpaint: false,
				enableSfx: false,
				sfxMaxAreaPct: 0.1,
				typesetFont: 'CC Wild Words',
				typesetCjkFont: 'WenQuanYi Micro Hei',
				typesetPadding: 0.05,
				typesetOutline: 'standard',
				typesetContrast: 'auto',
				typesetCasing: 'uppercase',
				enableTextRotation: true
			}
		});

		expect(result.success).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/batch', expect.objectContaining({
			method: 'POST',
			body: JSON.stringify({
				bookId: 'uuid-5',
				bookTitle: 'My Book',
				chapterIds: [42],
				force: false,
				parallelWorkers: 1,
				pageConcurrency: 1,
				resliceBeforeBatch: false,
				inpaintMode: 'patch',
				inpaintExpansionPct: 0.03,
				typesetExpansionPct: 0.03,
				enableWatermarkInpaint: false,
				enableSfx: false,
				sfxMaxAreaPct: 0.1,
				typesetOptions: {
					fontDialogue: 'CC Wild Words',
					fontCjk: 'WenQuanYi Micro Hei',
					boxInset: 0.05,
					outlineMode: 'standard',
					colorMode: 'auto',
					casing: 'uppercase',
					enableRotation: true
				}
			})
		}));
	});

	it('startBatchTranslation falls back to empty settings and stringifies bookId', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ active: true, queue: [] })
		});

		const result = await client.startBatchTranslation({ bookId: 7, chapterId: 42 });
		expect(result.success).toBe(true);
		const [, init] = mockFetch.mock.calls[0];
		const body = JSON.parse(init.body);
		expect(body.bookId).toBe('7');
		expect(body.resliceBeforeBatch).toBe(false);
		expect(body.parallelWorkers).toBeUndefined();
		expect(body.enableSfx).toBeUndefined();
	});

	it('removes a chapter from the active batch on cancel', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ success: true, removed: true })
		});

		const result = await client.cancelBatchTranslation(42);
		expect(result.success).toBe(true);
		expect(result.removed).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith('http://localhost:8124/api/batch', expect.objectContaining({
			method: 'DELETE',
			body: JSON.stringify({ chapterId: 42 })
		}));
	});

	it('reports when batch cancel had nothing to remove', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ success: true, removed: false })
		});

		const result = await client.cancelBatchTranslation(42);
		expect(result.success).toBe(true);
		expect(result.removed).toBe(false);
	});
});
