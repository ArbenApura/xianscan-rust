// -- BACKGROUND SERVICE WORKER: CONTEXT MENUS, SESSION FETCHER, STREAMING & LIVE SYNC -- //

// IMPORTED MODULES
import { getServerUrl, getAccessToken, saveSiteMapping, findMappingForUrl, deleteSiteMapping, updateSiteMappingEnabled } from './core/storage';
import { isServerUrl } from './core/origin';
import { initKeepAliveService } from './background/keep-alive';
import { initContextMenus } from './background/context-menus';
import { arrayBufferToBase64 } from './background/downloader';
import { attachLiveTranslationListener, abortSseStream } from './background/sse-streamer';
import { runBatchImportJob } from './background/batch-runner';
import { setJobCancelled } from './background/job-state';
import { createServerClient, proxyServerRequest, serverFetch } from './background/server-proxy';

// -- INITIALIZATION -- //

initContextMenus();
initKeepAliveService();

// -- FUNCTIONS -- //

// SERVER IMAGE AS A DATA URL FOR CONTENT SCRIPTS AND THE POPUP (MIXED CONTENT, OR A LAN SERVER THAT
// NEEDS THE TOKEN). ONLY THE CONFIGURED SERVER IS REACHABLE THIS WAY.
async function fetchServerImageData(url: string): Promise<{ dataUrl: string; mime: string }> {
	if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) image URLs are supported');
	const serverUrl = await getServerUrl();
	if (!isServerUrl(url, serverUrl)) throw new Error('Image URL is not on the configured XianScan server');

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000);
	try {
		const res = await serverFetch(url, { signal: controller.signal, headers: { Accept: 'image/*' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const blob = await res.blob();
		const mime = blob.type || 'image/jpeg';
		return { dataUrl: arrayBufferToBase64(await blob.arrayBuffer(), mime), mime };
	} finally {
		clearTimeout(timeoutId);
	}
}

// -- RUNTIME MESSAGE DISPATCHER -- //

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// ONLY THIS EXTENSION'S OWN PAGES AND CONTENT SCRIPTS MAY TALK TO THE WORKER
	if (sender.id !== chrome.runtime.id) return false;

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
			createServerClient().then(client => {
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

	if (message.type === 'UPDATE_SITE_MAPPING_ENABLED') {
		const targetUrl = message.url || sender.tab?.url || '';
		updateSiteMappingEnabled(targetUrl, !!message.enabled).then(mapping => {
			sendResponse({ success: true, mapping });
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
		Promise.all([getServerUrl(), getAccessToken()])
			.then(([serverUrl, token]) => proxyServerRequest(url, options, { serverUrl, token }))
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
		fetchServerImageData(message.url)
			.then(({ dataUrl, mime }) => sendResponse({ ok: true, dataUrl, mime }))
			.catch(err => sendResponse({ ok: false, error: err.message }));
		return true;
	}

	return false;
});
