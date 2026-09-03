// -- BACKGROUND BATCH IMPORT QUEUE RUNNER -- //

// IMPORTED TYPES
import type { ImportJobPayload, ChapterSyncMessage } from '../types';

// IMPORTED MODULES
import { XianScanClient } from '../api';
import { sanitizeFileName } from '../utils/sanitize';
import { getServerUrl, saveSiteMapping } from '../core/storage';
import { safeBroadcast, broadcastToChapterTabs } from '../core/messaging';
import { safeFetch, fetchImageBlobWithTabFallback } from './downloader';
import { isJobCancelled, setJobCancelled } from './job-state';
import { attachLiveTranslationListener } from './sse-streamer';

// -- FUNCTIONS -- //

// PROCESS BATCH UPLOAD QUEUE (CONTINUES IN BACKGROUND EVEN IF POPUP IS CLOSED)
export async function runBatchImportJob(payload: ImportJobPayload, refererUrl?: string): Promise<void> {
	setJobCancelled(false);
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

	// CONCURRENCY LIMIT = 8 FOR HIGH-SPEED PIPELINE
	const concurrency = 8;
	const chunks: string[][] = [];
	for (let i = 0; i < payload.imageUrls.length; i += concurrency) {
		chunks.push(payload.imageUrls.slice(i, i + concurrency));
	}

	for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
		const storageState = await chrome.storage.local.get(['activeImportJob']);
		const isStorageCancelled = !storageState.activeImportJob || storageState.activeImportJob.running === false;

		if (isJobCancelled() || isStorageCancelled) {
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
		if (isJobCancelled()) return;

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

		// PERSIST PROGRESS TO STORAGE
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

	// BROADCAST INITIAL PAGES MOUNT TO TABS IMMEDIATELY SO PENDING BADGES SHOW IN-PLACE
	if (uploadedSuccessCount > 0 && !isJobCancelled()) {
		try {
			const initialDetails = await client.getChapterDetails(payload.chapterId);
			if (initialDetails?.pages && initialDetails.pages.length > 0) {
				const syncMsg: ChapterSyncMessage = {
					type: 'CHAPTER_SYNC_UPDATE',
					chapterId: payload.chapterId,
					status: 'uploaded',
					pages: initialDetails.pages
				};
				broadcastToChapterTabs(payload.chapterId, syncMsg);
				safeBroadcast(syncMsg);
			}
		} catch (e) {
			console.warn('Initial post-upload sync failed:', e);
		}
	}

	// 1. OPTIONAL: AUTO-TRIGGER SMART RESLICE FIRST
	if (payload.autoReslice && uploadedSuccessCount > 0 && !isJobCancelled()) {
		try {
			console.log(`Triggering auto-reslice for chapter #${payload.chapterId}...`);
			safeBroadcast({
				type: 'PIPELINE_PHASE',
				phase: 'reslicing',
				chapterId: payload.chapterId,
				bookId: payload.bookId,
				current: uploadedSuccessCount,
				total: uploadedSuccessCount || total
			});
			await client.triggerReslice(payload.chapterId);

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
	if (payload.autoTranslate && uploadedSuccessCount > 0 && !isJobCancelled()) {
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
			const canonicalSettings = await client.getSettings().catch(() => ({}));
			await client.startBatchTranslation({
				bookId: payload.bookId,
				bookTitle: currentChapter?.chapter?.bookTitle || '',
				chapterId: payload.chapterId,
				settings: canonicalSettings
			});
			void attachLiveTranslationListener(payload.chapterId, serverUrl);
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

	safeBroadcast({
		type: 'IMPORT_COMPLETE',
		current: uploadedSuccessCount,
		total,
		chapterId: payload.chapterId,
		bookId: payload.bookId,
		error: uploadedSuccessCount === 0 && total > 0 ? (lastUploadError || 'Host CDN hotlink protection blocked image downloads') : undefined
	});

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
