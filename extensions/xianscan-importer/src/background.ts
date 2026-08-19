// BACKGROUND SERVICE WORKER: CONTEXT MENUS, SESSION FETCHER & STREAMING PIPELINE

import { XianScanClient } from './api';
import type { ImportJobPayload } from './types';
import { sanitizeFileName } from './utils/sanitize';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8124';

// Safe fetch wrapper guaranteeing valid WorkerGlobalScope / Window this context
function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const scope = typeof self !== 'undefined' ? self : globalThis;
	const fn = scope.fetch || globalThis.fetch;
	return fn.call(scope, input, init);
}

// Safe runtime broadcaster that swallows 'Receiving end does not exist' when popup is closed
function safeBroadcast(msg: any) {
	try {
		chrome.runtime.sendMessage(msg, () => {
			void chrome.runtime.lastError;
		});
	} catch {
		// Ignore broadcast errors
	}
}

async function getServerUrl(): Promise<string> {
	const stored = await chrome.storage.local.get(['serverUrl']);
	return stored.serverUrl || DEFAULT_SERVER_URL;
}

// 1. Initialize Context Menus
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'xianscan-root',
		title: 'XianScan — Import Image',
		contexts: ['image']
	});

	chrome.contextMenus.create({
		parentId: 'xianscan-root',
		id: 'xianscan-recent-chapter',
		title: 'Send to Recent Chapter',
		contexts: ['image']
	});

	chrome.contextMenus.create({
		parentId: 'xianscan-root',
		id: 'xianscan-quick-inbox',
		title: 'Send to Quick Inbox',
		contexts: ['image']
	});
});

// Download image as Blob with robust timeout & referrer fallback
async function fetchImageBlob(url: string, referer?: string): Promise<{ blob: Blob; ext: string }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000);

	try {
		const fetchOptions: RequestInit = {
			signal: controller.signal
		};

		if (referer) {
			fetchOptions.referrer = referer;
		}

		let res: Response;
		try {
			res = await safeFetch(url, fetchOptions);
		} catch {
			// Fallback: retry without referrer
			res = await safeFetch(url, { signal: controller.signal });
		}

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		const contentType = res.headers.get('content-type') || 'image/jpeg';
		let ext = 'jpg';
		if (contentType.includes('png')) ext = 'png';
		else if (contentType.includes('webp')) ext = 'webp';
		else if (contentType.includes('avif')) ext = 'avif';

		const blob = await res.blob();
		return { blob, ext };
	} finally {
		clearTimeout(timeoutId);
	}
}

// Upload a single image from right-click context menu
async function handleSingleImageUpload(srcUrl: string, targetType: 'recent' | 'inbox', pageUrl?: string) {
	try {
		const serverUrl = await getServerUrl();
		const client = new XianScanClient(serverUrl, safeFetch);

		const { blob, ext } = await fetchImageBlob(srcUrl, pageUrl);
		const filename = sanitizeFileName(`quick_import_${Date.now()}.${ext}`);

		let targetChapterId: number | null = null;
		let chapterName = '';

		if (targetType === 'recent') {
			const stored = await chrome.storage.local.get(['lastChapterId']);
			if (stored.lastChapterId) {
				targetChapterId = stored.lastChapterId;
			}
		}

		// If no recent chapter or if inbox requested, get inbox chapter
		if (!targetChapterId) {
			targetChapterId = await getOrCreateQuickInboxChapter(client);
			chapterName = 'Quick Inbox';
		}

		// Try uploading
		try {
			await client.uploadPages(targetChapterId, [{ blob, filename }]);
		} catch (uploadErr: any) {
			// If recent chapter was deleted or not found on server, fallback to Quick Inbox
			if (uploadErr?.message?.includes('Chapter not found') || uploadErr?.message?.includes('404')) {
				console.warn(`Recent chapter #${targetChapterId} not found, falling back to Quick Inbox.`);
				targetChapterId = await getOrCreateQuickInboxChapter(client);
				await client.uploadPages(targetChapterId, [{ blob, filename }]);
				chapterName = 'Quick Inbox';
			} else {
				throw uploadErr;
			}
		}

		// Update lastChapterId in storage
		await chrome.storage.local.set({ lastChapterId: targetChapterId });

		// Notify user
		const destLabel = chapterName ? `Quick Inbox (Chapter #${targetChapterId})` : `Chapter #${targetChapterId}`;
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Importer',
			message: `Added image to ${destLabel} successfully!`
		});
	} catch (e: any) {
		console.error('Failed single image import:', e);
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Import Failed',
			message: e.message || 'Could not connect to XianScan server.'
		});
	}
}

// Find or create "Quick Imports" Book & Chapter
async function getOrCreateQuickInboxChapter(client: XianScanClient): Promise<number> {
	const books = await client.getBooks();
	let inboxBook = books.find(b => b.title === 'Web Quick Imports');

	if (!inboxBook) {
		inboxBook = await client.createBook({
			title: 'Web Quick Imports',
			sourceLang: 'zh-Hans',
			targetLang: 'en'
		});
	}

	const chapters = await client.getChapters(inboxBook.id);
	let todayChapter = chapters.find(c => c.title.startsWith('Inbox'));

	if (!todayChapter) {
		const dateStr = new Date().toISOString().split('T')[0];
		todayChapter = await client.createChapter(inboxBook.id, {
			title: `Inbox ${dateStr}`,
			chapterNumber: chapters.length + 1
		});
	}

	return todayChapter.id;
}

// 2. Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (!info.srcUrl) return;

	if (info.menuItemId === 'xianscan-recent-chapter') {
		handleSingleImageUpload(info.srcUrl, 'recent', tab?.url);
	} else if (info.menuItemId === 'xianscan-quick-inbox') {
		handleSingleImageUpload(info.srcUrl, 'inbox', tab?.url);
	}
});

let activeJobCancelled = false;

// 3. Process Batch Upload Queue (Continues in background even if popup is closed)
async function runBatchImportJob(payload: ImportJobPayload, refererUrl?: string) {
	activeJobCancelled = false;
	const serverUrl = await getServerUrl();
	const client = new XianScanClient(serverUrl, safeFetch);
	const total = payload.imageUrls.length;
	let processedCount = 0;
	let uploadedSuccessCount = 0;

	// Save as last used chapter & set active background job state
	await chrome.storage.local.set({
		lastBookId: payload.bookId,
		lastChapterId: payload.chapterId,
		activeImportJob: {
			running: true,
			current: 0,
			total,
			chapterId: payload.chapterId,
			bookId: payload.bookId
		}
	});

	// Concurrency limit = 4
	const concurrency = 4;
	const chunks: string[][] = [];
	for (let i = 0; i < payload.imageUrls.length; i += concurrency) {
		chunks.push(payload.imageUrls.slice(i, i + concurrency));
	}

	for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
		if (activeJobCancelled) {
			console.log('Import job cancelled by user.');
			await chrome.storage.local.set({
				activeImportJob: {
					running: false,
					current: processedCount,
					total,
					chapterId: payload.chapterId,
					bookId: payload.bookId
				}
			});
			safeBroadcast({
				type: 'IMPORT_CANCELLED',
				current: uploadedSuccessCount,
				total
			});
			return;
		}

		const chunk = chunks[chunkIdx];
		const downloadPromises = chunk.map(async (url, idxInChunk) => {
			const globalIndex = chunkIdx * concurrency + idxInChunk + 1;
			try {
				const { blob, ext } = await fetchImageBlob(url, refererUrl);
				const paddedNum = String(globalIndex).padStart(3, '0');
				const filename = sanitizeFileName(`page_${paddedNum}.${ext}`);
				return { blob, filename };
			} catch (err) {
				console.warn(`Failed to fetch image ${url}:`, err);
				return null;
			}
		});

		const results = await Promise.all(downloadPromises);
		if (activeJobCancelled) return;

		const downloaded = results.filter(Boolean) as Array<{ blob: Blob; filename: string }>;

		if (downloaded.length > 0) {
			try {
				await client.uploadPages(payload.chapterId, downloaded);
				uploadedSuccessCount += downloaded.length;
			} catch (uploadErr) {
				console.error('Failed uploading chunk:', uploadErr);
			}
		}

		processedCount += chunk.length;

		// Persist progress to storage so reopening the popup displays live progress
		await chrome.storage.local.set({
			activeImportJob: {
				running: true,
				current: processedCount,
				total,
				chapterId: payload.chapterId,
				bookId: payload.bookId
			}
		});

		// Broadcast progress to open popup
		safeBroadcast({
			type: 'IMPORT_PROGRESS',
			current: processedCount,
			total,
			chapterId: payload.chapterId,
			bookId: payload.bookId
		});
	}

	// Optional: Auto-trigger translation
	if (payload.autoTranslate && uploadedSuccessCount > 0 && !activeJobCancelled) {
		try {
			await client.triggerTranslate(payload.chapterId);
		} catch (e) {
			console.warn('Auto-translate trigger failed:', e);
		}
	}

	// Mark job complete in storage
	await chrome.storage.local.set({
		activeImportJob: {
			running: false,
			current: total,
			total,
			chapterId: payload.chapterId,
			bookId: payload.bookId
		}
	});

	// Emit complete message to popup if open
	safeBroadcast({
		type: 'IMPORT_COMPLETE',
		current: uploadedSuccessCount,
		total,
		chapterId: payload.chapterId,
		bookId: payload.bookId
	});

	// Show notification (always visible even if popup is closed)
	chrome.notifications?.create({
		type: 'basic',
		iconUrl: 'icons/icon-128.png',
		title: 'XianScan Batch Import Finished',
		message: `Successfully uploaded ${uploadedSuccessCount} pages into Chapter #${payload.chapterId}!`
	});
}

// 4. Runtime Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'START_IMPORT_JOB') {
		runBatchImportJob(message.payload, sender.tab?.url || message.refererUrl)
			.then(() => sendResponse({ success: true }))
			.catch(e => sendResponse({ success: false, error: e.message }));
		return true;
	}

	if (message.type === 'CANCEL_IMPORT_JOB') {
		activeJobCancelled = true;
		chrome.storage.local.set({ activeImportJob: null });
		sendResponse({ success: true });
		return true;
	}

	if (message.type === 'PROXY_REQUEST') {
		const { url, options } = message;
		safeFetch(url, options)
			.then(async res => {
				const data = await res.json().catch(() => ({}));
				sendResponse({ ok: res.ok, status: res.status, data });
			})
			.catch(err => {
				sendResponse({ ok: false, status: 0, error: err.message });
			});
		return true;
	}

	return false;
});
