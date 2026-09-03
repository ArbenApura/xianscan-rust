// -- BACKGROUND SERVICE WORKER: CONTEXT MENUS, SESSION FETCHER, STREAMING & LIVE SYNC -- //

// IMPORTED MODULES
import { XianScanClient } from './api';
import { getServerUrl, saveSiteMapping, findMappingForUrl, deleteSiteMapping } from './core/storage';
import { initKeepAliveService } from './background/keep-alive';
import { initContextMenus } from './background/context-menus';
import { safeFetch, fetchImageBlob, arrayBufferToBase64 } from './background/downloader';
import { attachLiveTranslationListener, abortSseStream } from './background/sse-streamer';
import { runBatchImportJob } from './background/batch-runner';
import { setJobCancelled } from './background/job-state';

// -- INITIALIZATION -- //

initContextMenus();
initKeepAliveService();

// -- RUNTIME MESSAGE DISPATCHER -- //

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'START_IMPORT_JOB') {
		runBatchImportJob(message.payload, sender.tab?.url || message.refererUrl)
			.then(() => sendResponse({ success: true }))
			.catch(e => sendResponse({ success: false, error: e.message }));
		return true;
	}

	if (message.type === 'CANCEL_IMPORT_JOB') {
		setJobCancelled(true);
		chrome.storage.local.set({ activeImportJob: null });
		if (message.chapterId) {
			abortSseStream(Number(message.chapterId));
			getServerUrl().then(url => {
				const client = new XianScanClient(url, safeFetch);
				void client.cancelBatchTranslation(Number(message.chapterId)).then(res => {
					if (!res.success || !res.removed) {
						void client.cancelTranslation(message.chapterId);
					}
				});
			});
		}
		sendResponse({ success: true });
		return true;
	}

	if (message.type === 'CLEAR_ACTIVE_JOB_CANCELLED') {
		setJobCancelled(false);
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
				sendResponse({ ok: true, buffer, mime });
			})
			.catch(err => {
				sendResponse({ ok: false, error: err.message });
			});
		return true;
	}

	return false;
});
