// -- BACKGROUND SERVICE WORKER: CONTEXT MENUS, SESSION FETCHER, STREAMING & LIVE SYNC -- //

import { XianScanClient } from './api';
import type { ChapterMappingEntry, ImportJobPayload, PageTranslatedMessage, ChapterSyncMessage } from './types';
import { sanitizeFileName } from './utils/sanitize';
import { normalizePageUrl } from './utils/dom-replacer';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8124';

// SAFE FETCH WRAPPER GUARANTEEING VALID WORKERGLOBALSCOPE / WINDOW CONTEXT
function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const scope = typeof self !== 'undefined' ? self : globalThis;
	const fn = scope.fetch || globalThis.fetch;
	return fn.call(scope, input, init);
}

// SAFE RUNTIME BROADCASTER THAT SWALLOWS 'RECEIVING END DOES NOT EXIST' WHEN POPUP IS CLOSED
function safeBroadcast(msg: any) {
	try {
		chrome.runtime.sendMessage(msg, () => {
			void chrome.runtime.lastError;
		});
	} catch {
		// IGNORE BROADCAST ERRORS
	}
}

// BROADCAST TO ALL TABS THAT ARE VIEWING A MAPPED CHAPTER
async function broadcastToChapterTabs(chapterId: number, msg: any) {
	try {
		const tabs = await chrome.tabs.query({});
		for (const tab of tabs) {
			if (tab.id) {
				chrome.tabs.sendMessage(tab.id, msg, () => {
					void chrome.runtime.lastError;
				});
			}
		}
	} catch {
		// IGNORE TAB DISPATCH ERRORS
	}
}

async function getServerUrl(): Promise<string> {
	const stored = await chrome.storage.local.get(['serverUrl']);
	return stored.serverUrl || DEFAULT_SERVER_URL;
}

// -- SITE MAPPING STORAGE HELPERS -- //
async function getSiteMappings(): Promise<Record<string, ChapterMappingEntry>> {
	const stored = await chrome.storage.local.get(['siteMappings']);
	return stored.siteMappings || {};
}

async function saveSiteMapping(entry: ChapterMappingEntry): Promise<void> {
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(entry.url);
	mappings[normalized] = {
		...entry,
		url: normalized,
		lastSyncedAt: Date.now()
	};
	await chrome.storage.local.set({ siteMappings: mappings });
}

async function findMappingForUrl(rawUrl: string): Promise<ChapterMappingEntry | null> {
	if (!rawUrl) return null;
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(rawUrl);

	if (mappings[normalized]) {
		return mappings[normalized];
	}

	for (const [key, mapping] of Object.entries(mappings)) {
		if (normalized.startsWith(key) || key.startsWith(normalized)) {
			return mapping;
		}
	}

	return null;
}

async function deleteSiteMapping(rawUrl: string): Promise<void> {
	const mappings = await getSiteMappings();
	const normalized = normalizePageUrl(rawUrl);
	delete mappings[normalized];
	for (const key of Object.keys(mappings)) {
		if (normalized.startsWith(key) || key.startsWith(normalized)) {
			delete mappings[key];
		}
	}
	await chrome.storage.local.set({ siteMappings: mappings });
}

// 1. INITIALIZE CONTEXT MENUS
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'xianscan-root',
		title: 'XianScan - Import Image',
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

// DOWNLOAD IMAGE AS BLOB WITH ROBUST TIMEOUT & FORMAT DETECTION
async function fetchImageBlob(url: string, _referer?: string): Promise<{ blob: Blob; ext: string }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 20000);

	try {

		// NORMALIZE UNINTENTIONAL DOUBLE SLASHES IN PATHNAME (e.g. host//manga)
		let cleanUrl = url;
		try {
			const u = new URL(url);
			u.pathname = u.pathname.replace(/\/+/g, '/');
			cleanUrl = u.href;
		} catch {
			cleanUrl = url;
		}

		const fetchOptions: RequestInit = {
			signal: controller.signal,
			headers: {
				'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
			}
		};

		let res: Response;
		try {
			res = await safeFetch(cleanUrl, fetchOptions);
		} catch {
			// FALLBACK: RETRY WITHOUT HEADERS
			res = await safeFetch(cleanUrl, { signal: controller.signal });
		}

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		const contentType = (res.headers.get('content-type') || '').toLowerCase();
		if (contentType.includes('text/html') || contentType.includes('text/plain')) {
			throw new Error(`Server returned non-image content-type: ${contentType}`);
		}

		let ext = 'jpg';
		if (contentType.includes('png') || cleanUrl.includes('.png')) ext = 'png';
		else if (contentType.includes('webp') || cleanUrl.includes('.webp')) ext = 'webp';
		else if (contentType.includes('avif') || cleanUrl.includes('.avif')) ext = 'avif';

		const blob = await res.blob();
		if (blob.size < 100) {
			throw new Error(`Downloaded blob is too small (${blob.size} bytes)`);
		}

		return { blob, ext };
	} finally {
		clearTimeout(timeoutId);
	}
}

// FETCH IMAGE BLOB WITH HOST-TAB FALLBACK FOR HOTLINK PROTECTED CDNS
async function fetchImageBlobWithTabFallback(url: string, refererUrl?: string): Promise<{ blob: Blob; ext: string }> {
	try {
		return await fetchImageBlob(url, refererUrl);
	} catch (err) {
		// FALLBACK: REQUEST ACTIVE TAB TO FETCH IN-PAGE CONTEXT (GUARANTEES 100% CORRECT REFERER & COOKIES)
		if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
			const activeTabs = await chrome.tabs.query({ active: true });
			let tabId = activeTabs[0]?.id;
			if (!tabId && refererUrl) {
				try {
					const refHost = new URL(refererUrl).hostname;
					const allTabs = await chrome.tabs.query({});
					tabId = allTabs.find(t => t.url && t.url.includes(refHost))?.id;
				} catch {}
			}
			if (!tabId) {
				const allTabs = await chrome.tabs.query({});
				tabId = allTabs[0]?.id;
			}

			if (tabId) {
				const tabData = await new Promise<{ ok: boolean; dataUrl?: string; error?: string }>(resolve => {
					chrome.tabs.sendMessage(tabId, { type: 'FETCH_IMAGE_DATA_IN_TAB', url }, res => {
						if (chrome.runtime.lastError || !res) resolve({ ok: false, error: chrome.runtime.lastError?.message });
						else resolve(res);
					});
				});

				if (tabData.ok && tabData.dataUrl && tabData.dataUrl.includes(',')) {
					const [header, base64] = tabData.dataUrl.split(',');
					const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
					if (mime.includes('text/html') || mime.includes('text/plain')) {
						throw new Error(`Tab returned non-image mime: ${mime}`);
					}
					if (!base64 || base64.trim().length === 0) {
						throw new Error('Tab returned empty base64 string');
					}
					const binary = atob(base64);
					const array = new Uint8Array(binary.length);
					for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
					const blob = new Blob([array], { type: mime });
					if (blob.size < 100) {
						throw new Error(`Blob from tab is too small (${blob.size} bytes)`);
					}

					let ext = 'jpg';
					if (mime.includes('png') || url.includes('.png')) ext = 'png';
					else if (mime.includes('webp') || url.includes('.webp')) ext = 'webp';
					else if (mime.includes('avif') || url.includes('.avif')) ext = 'avif';
					return { blob, ext };
				}
			}
		}
		throw err;
	}
}

// CONVERT ARRAYBUFFER TO BASE64 DATA URL FOR BYPASSING MIXED CONTENT ON HTTPS PAGES
function arrayBufferToBase64(buffer: ArrayBuffer, mimeType = 'image/jpeg'): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const len = bytes.byteLength;
	const chunkSize = 8192;
	for (let i = 0; i < len; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
		binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
	}
	return `data:${mimeType};base64,${btoa(binary)}`;
}

// UPLOAD A SINGLE IMAGE FROM RIGHT-CLICK CONTEXT MENU
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

		// IF NO RECENT CHAPTER OR IF INBOX REQUESTED, GET INBOX CHAPTER
		if (!targetChapterId) {
			targetChapterId = await getOrCreateQuickInboxChapter(client);
			chapterName = 'Quick Inbox';
		}

		// TRY UPLOADING
		try {
			await client.uploadPages(targetChapterId, [{ blob, filename }]);
		} catch (uploadErr: any) {
			// IF RECENT CHAPTER WAS DELETED OR NOT FOUND ON SERVER, FALLBACK TO QUICK INBOX
			if (uploadErr?.message?.includes('Chapter not found') || uploadErr?.message?.includes('404')) {
				console.warn(`Recent chapter #${targetChapterId} not found, falling back to Quick Inbox.`);
				targetChapterId = await getOrCreateQuickInboxChapter(client);
				await client.uploadPages(targetChapterId, [{ blob, filename }]);
				chapterName = 'Quick Inbox';
			} else {
				throw uploadErr;
			}
		}

		// UPDATE LASTCHAPTERID IN STORAGE
		await chrome.storage.local.set({ lastChapterId: targetChapterId });

		// NOTIFY USER
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

// FIND OR CREATE "QUICK IMPORTS" BOOK & CHAPTER
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

// 2. HANDLE CONTEXT MENU CLICKS
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (!info.srcUrl) return;

	if (info.menuItemId === 'xianscan-recent-chapter') {
		handleSingleImageUpload(info.srcUrl, 'recent', tab?.url);
	} else if (info.menuItemId === 'xianscan-quick-inbox') {
		handleSingleImageUpload(info.srcUrl, 'inbox', tab?.url);
	}
});

let activeJobCancelled = false;
const activeSseStreams = new Map<number, AbortController>();

// 3. LISTEN TO SERVER-SENT EVENTS DURING TRANSLATION & BROADCAST LIVE PAGE EVENTS
async function attachLiveTranslationListener(chapterId: number, serverUrl: string, retryCount = 0) {
	if (!chapterId) return;
	if (activeSseStreams.has(chapterId) && retryCount === 0) {
		return;
	}

	const controller = new AbortController();
	activeSseStreams.set(chapterId, controller);
	let streamCompletedCleanly = false;

	try {
		const targetUrl = `${serverUrl}/api/chapters/${chapterId}/translate`;
		const res = await safeFetch(targetUrl, {
			method: 'GET',
			headers: { 'Accept': 'text/event-stream' },
			signal: controller.signal
		});

		if (!res.ok || !res.body) {
			activeSseStreams.delete(chapterId);
			return;
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split('\n\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('data:')) continue;
				try {
					const data = JSON.parse(trimmed.slice(5).trim());
					if ((data.type === 'page-done' || data.type === 'page_done') && (data.page !== undefined || data.seq !== undefined)) {
						const pageSeq = data.page !== undefined ? data.page : (data.seq !== undefined ? data.seq : 0);
						const pageMsg: PageTranslatedMessage = {
							type: 'PAGE_TRANSLATED',
							chapterId,
							pageSeq,
							pageId: data.pageId,
							outputRev: data.outputRev || 1,
							outputPath: data.outputPath || '',
							total: data.pageCount || data.totalPages || data.total || 0
						};
						broadcastToChapterTabs(chapterId, pageMsg);
						safeBroadcast(pageMsg);
					} else if (data.type === 'phase-change') {
						safeBroadcast({
							type: 'PIPELINE_PHASE',
							chapterId,
							phase: data.phase,
							total: data.pageCount || data.totalPages || 0
						});
					} else if (data.type === 'done') {
						streamCompletedCleanly = true;
						const syncMsg: ChapterSyncMessage = {
							type: 'CHAPTER_SYNC_UPDATE',
							chapterId,
							status: 'done',
							pages: []
						};
						broadcastToChapterTabs(chapterId, syncMsg);
						safeBroadcast(syncMsg);
					}
				} catch {
					// IGNORE JSON PARSE ERRORS ON PARTIAL CHUNKS
				}
			}
		}
	} catch (e: any) {
		if (e?.name !== 'AbortError') {
			console.warn(`[XianScan] SSE stream disconnected for chapter #${chapterId}:`, e);
		}
	} finally {
		activeSseStreams.delete(chapterId);

		// AUTO-RECONNECT IF STREAM TERMINATED UNEXPECTEDLY BEFORE COMPLETION
		if (!streamCompletedCleanly && !controller.signal.aborted && retryCount < 5) {
			const delay = Math.min(1000 * Math.pow(1.5, retryCount), 6000);
			console.info(`[XianScan] Scheduling SSE auto-reconnect for chapter #${chapterId} in ${delay}ms (attempt ${retryCount + 1})...`);
			setTimeout(() => {
				if (!activeJobCancelled) {
					void attachLiveTranslationListener(chapterId, serverUrl, retryCount + 1);
				}
			}, delay);
		}
	}
}

// 4. PROCESS BATCH UPLOAD QUEUE (CONTINUES IN BACKGROUND EVEN IF POPUP IS CLOSED)
async function runBatchImportJob(payload: ImportJobPayload, refererUrl?: string) {
	activeJobCancelled = false;
	const serverUrl = await getServerUrl();
	const client = new XianScanClient(serverUrl, safeFetch);
	const total = payload.imageUrls.length;
	let processedCount = 0;
	let uploadedSuccessCount = 0;
	let lastUploadError = '';

	// SAVE AS LAST USED CHAPTER & SET ACTIVE BACKGROUND JOB STATE
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

	// AUTOMATICALLY SAVE SITE MAPPING IF REFERER URL IS PRESENT
	if (refererUrl && !refererUrl.startsWith('chrome://') && !refererUrl.startsWith('about:')) {
		const mappingEntry = {
			url: refererUrl,
			bookId: payload.bookId,
			chapterId: payload.chapterId,
			isResliced: !!payload.autoReslice,
			pageCount: total,
			excludedImageUrls: payload.excludedImageUrls,
			includedImageUrls: payload.includedImageUrls,
			enabled: true,
			lastSyncedAt: Date.now()
		};
		await saveSiteMapping(mappingEntry);
		broadcastToChapterTabs(payload.chapterId, {
			type: 'SET_ACTIVE_MAPPING',
			entry: mappingEntry
		});
	}

	// CONCURRENCY LIMIT = 4
	const concurrency = 4;
	const chunks: string[][] = [];
	for (let i = 0; i < payload.imageUrls.length; i += concurrency) {
		chunks.push(payload.imageUrls.slice(i, i + concurrency));
	}

	for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
		// CHECK BOTH MEMORY FLAG AND EXTENSION STORAGE IN CASE SERVICE WORKER CYCLED
		const storageState = await chrome.storage.local.get(['activeImportJob']);
		const isStorageCancelled = !storageState.activeImportJob || storageState.activeImportJob.running === false;

		if (activeJobCancelled || isStorageCancelled) {
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
				const { blob, ext } = await fetchImageBlobWithTabFallback(url, refererUrl);
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
			} catch (uploadErr: any) {
				lastUploadError = uploadErr?.message || 'Failed uploading chunk to server';
				console.error('Failed uploading chunk:', uploadErr);
			}
		}

		processedCount += chunk.length;

		// PERSIST PROGRESS TO STORAGE SO REOPENING THE POPUP DISPLAYS LIVE PROGRESS
		await chrome.storage.local.set({
			activeImportJob: {
				running: true,
				current: processedCount,
				total,
				chapterId: payload.chapterId,
				bookId: payload.bookId
			}
		});

		// BROADCAST PROGRESS TO OPEN POPUP
		safeBroadcast({
			type: 'IMPORT_PROGRESS',
			current: processedCount,
			total,
			chapterId: payload.chapterId,
			bookId: payload.bookId
		});
	}

	// 1. OPTIONAL: AUTO-TRIGGER SMART RESLICE FIRST
	if (payload.autoReslice && uploadedSuccessCount > 0 && !activeJobCancelled) {
		try {
			console.log(`Triggering auto-reslice for chapter #${payload.chapterId}...`);
			safeBroadcast({
				type: 'PIPELINE_PHASE',
				phase: 'reslicing',
				chapterId: payload.chapterId,
				bookId: payload.bookId
			});
			await client.triggerReslice(payload.chapterId);

			// FETCH RESLICED CHAPTER DETAILS & SYNC WITH TABS AND POPUP
			const reslicedDetails = await client.getChapterDetails(payload.chapterId);
			if (reslicedDetails && reslicedDetails.pages) {
				const syncMsg: ChapterSyncMessage = {
					type: 'CHAPTER_SYNC_UPDATE',
					chapterId: payload.chapterId,
					status: 'resliced',
					pages: reslicedDetails.pages
				};
				broadcastToChapterTabs(payload.chapterId, syncMsg);
				safeBroadcast(syncMsg);
			}
		} catch (e) {
			console.warn('Auto-reslice trigger failed:', e);
		}
	}

	// 2. OPTIONAL: AUTO-TRIGGER TRANSLATION & SSE LIVE STREAM
	if (payload.autoTranslate && uploadedSuccessCount > 0 && !activeJobCancelled) {
		try {
			console.log(`Triggering auto-translate for chapter #${payload.chapterId}...`);
			const currentChapter = await client.getChapterDetails(payload.chapterId);
			const totalPagesToTranslate = currentChapter?.pages?.length || uploadedSuccessCount;

			safeBroadcast({
				type: 'PIPELINE_PHASE',
				phase: 'translating',
				chapterId: payload.chapterId,
				bookId: payload.bookId,
				current: 0,
				total: totalPagesToTranslate
			});
			await client.triggerTranslate(payload.chapterId);
			// ATTACH BACKGROUND SSE BROADCASTER
			attachLiveTranslationListener(payload.chapterId, serverUrl);
		} catch (e) {
			console.warn('Auto-translate trigger failed:', e);
		}
	}

	// MARK JOB COMPLETE IN STORAGE
	await chrome.storage.local.set({
		activeImportJob: {
			running: false,
			current: total,
			total,
			chapterId: payload.chapterId,
			bookId: payload.bookId
		}
	});

	// EMIT COMPLETE MESSAGE TO POPUP IF OPEN
	safeBroadcast({
		type: 'IMPORT_COMPLETE',
		current: uploadedSuccessCount,
		total,
		chapterId: payload.chapterId,
		bookId: payload.bookId,
		error: uploadedSuccessCount === 0 && total > 0 ? (lastUploadError || 'Host CDN hotlink protection blocked image downloads') : undefined
	});

	// SHOW NOTIFICATION (ALWAYS VISIBLE EVEN IF POPUP IS CLOSED)
	if (uploadedSuccessCount > 0) {
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Batch Import Finished',
			message: `Successfully uploaded ${uploadedSuccessCount} of ${total} pages into Chapter #${payload.chapterId}!`
		});
	} else {
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Batch Import Failed',
			message: `Failed to upload pages: ${lastUploadError || 'Host CDN hotlink protection blocked image downloads'}`
		});
	}
}

// 5. RUNTIME MESSAGE DISPATCHER
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
		if (message.chapterId) {
			const activeStream = activeSseStreams.get(Number(message.chapterId));
			if (activeStream) {
				activeStream.abort();
				activeSseStreams.delete(Number(message.chapterId));
			}
			getServerUrl().then(url => {
				const client = new XianScanClient(url, safeFetch);
				void client.cancelTranslation(message.chapterId);
			});
		}
		sendResponse({ success: true });
		return true;
	}

	if (message.type === 'GET_SITE_MAPPING') {
		const targetUrl = message.url || sender.tab?.url || '';
		findMappingForUrl(targetUrl).then(mapping => {
			sendResponse({ mapping });
		});
		return true;
	}

	if (message.type === 'SAVE_SITE_MAPPING') {
		saveSiteMapping(message.entry).then(() => {
			sendResponse({ success: true });
		});
		return true;
	}

	if (message.type === 'DELETE_SITE_MAPPING') {
		const targetUrl = message.url || sender.tab?.url || '';
		deleteSiteMapping(targetUrl).then(() => {
			sendResponse({ success: true });
		});
		return true;
	}

	if (message.type === 'ATTACH_LIVE_SSE') {
		getServerUrl().then(serverUrl => {
			attachLiveTranslationListener(message.chapterId, serverUrl);
			sendResponse({ success: true });
		});
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

	if (message.type === 'FETCH_IMAGE_DATA') {
		fetchImageBlob(message.url, message.referer)
			.then(async ({ blob, ext }) => {
				const buffer = await blob.arrayBuffer();
				const mime = blob.type || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
				const dataUrl = arrayBufferToBase64(buffer, mime);
				sendResponse({ ok: true, dataUrl });
			})
			.catch(err => {
				sendResponse({ ok: false, error: err.message });
			});
		return true;
	}

	return false;
});

// 6. KEEP-ALIVE PORT LISTENER (PREVENTS MANIFEST V3 SERVICE WORKER TERMINATION DURING ACTIVE JOBS)
const activeKeepAlivePorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener(port => {
	if (port.name === 'xianscan-keepalive') {
		activeKeepAlivePorts.add(port);
		port.onMessage.addListener(msg => {
			if (msg && msg.type === 'KEEPALIVE_PING') {
				try {
					port.postMessage({ type: 'KEEPALIVE_PONG', timestamp: Date.now() });
				} catch {
					// IGNORE DISCONNECTED PORT
				}
			}
		});
		port.onDisconnect.addListener(() => {
			activeKeepAlivePorts.delete(port);
		});
	}
});
