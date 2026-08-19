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
});
