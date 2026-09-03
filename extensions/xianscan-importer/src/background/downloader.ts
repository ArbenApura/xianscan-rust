// -- BACKGROUND IMAGE DOWNLOADER AND TAB CONTEXT FALLBACK -- //

// -- FUNCTIONS -- //

// SAFE FETCH WRAPPER GUARANTEEING VALID WORKERGLOBALSCOPE OR WINDOW CONTEXT
export function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const scope = typeof self !== 'undefined' ? self : globalThis;
	const fn = scope.fetch || globalThis.fetch;
	return fn.call(scope, input, init);
}

// CONVERT ARRAYBUFFER TO BASE64 DATA URL FOR BYPASSING MIXED CONTENT ON HTTPS PAGES
export function arrayBufferToBase64(buffer: ArrayBuffer, mimeType = 'image/jpeg'): string {
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

// DOWNLOAD IMAGE AS BLOB WITH ROBUST TIMEOUT & FORMAT DETECTION
export async function fetchImageBlob(url: string, _referer?: string): Promise<{ blob: Blob; ext: string }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000);

	try {
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
export async function fetchImageBlobWithTabFallback(url: string, refererUrl?: string): Promise<{ blob: Blob; ext: string }> {
	try {
		return await fetchImageBlob(url, refererUrl);
	} catch (err) {
		// FALLBACK: REQUEST HOST TAB TO FETCH IN-PAGE CONTEXT (GUARANTEES 100% CORRECT REFERER & COOKIES)
		if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
			let tabId: number | undefined;

			// 1. PRIORITIZE TAB MATCHING REFERER URL (PRESERVES EXACT HOST CREDENTIALS/COOKIES)
			if (refererUrl) {
				try {
					const refHost = new URL(refererUrl).hostname;
					const allTabs = await chrome.tabs.query({});
					tabId = allTabs.find(t => t.url && t.url.includes(refHost))?.id;
				} catch {
					// IGNORE PARSE FAILURE
				}
			}

			// 2. FALLBACK TO CURRENT ACTIVE TAB
			if (!tabId) {
				const activeTabs = await chrome.tabs.query({ active: true });
				tabId = activeTabs[0]?.id;
			}

			// 3. FALLBACK TO FIRST AVAILABLE TAB
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
