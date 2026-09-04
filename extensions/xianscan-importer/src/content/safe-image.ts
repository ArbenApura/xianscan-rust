// -- SAFE IMAGE URL RESOLVER AND BOUNDED FETCH QUEUE -- //

// -- CONSTANTS -- //

const MAX_SAFE_DATA_URL_CACHE_SIZE = 500;
const MAX_CONCURRENT_IMAGE_FETCHES = 6;

// -- STATES -- //

const safeDataUrlCache = new Map<string, string>();
const activeObjectUrls = new Set<string>();

type QueueTask = () => Promise<void>;
const fetchQueue: QueueTask[] = [];
let activeFetches = 0;

// -- FUNCTIONS -- //

function setCachedSafeUrl(key: string, url: string): void {
	if (safeDataUrlCache.size >= MAX_SAFE_DATA_URL_CACHE_SIZE) {
		const oldestKey = safeDataUrlCache.keys().next().value;
		if (oldestKey) {
			const oldUrl = safeDataUrlCache.get(oldestKey);
			if (oldUrl && oldUrl.startsWith('blob:')) {
				try {
					const revokeFn = (typeof URL !== 'undefined' && URL.revokeObjectURL) ||
						(typeof window !== 'undefined' && window.URL && window.URL.revokeObjectURL);
					if (revokeFn) {
						revokeFn(oldUrl);
					}
					activeObjectUrls.delete(oldUrl);
				} catch {
					// IGNORE REVOCATION FAILURE
				}
			}
			safeDataUrlCache.delete(oldestKey);
		}
	}
	safeDataUrlCache.set(key, url);
}

// REVOKE ALL CREATED BLOB OBJECT URLS AND CLEAR CACHE
export function clearSafeImageUrlCache(): void {
	const revokeFn = (typeof URL !== 'undefined' && URL.revokeObjectURL) ||
		(typeof window !== 'undefined' && window.URL && window.URL.revokeObjectURL);
	for (const url of activeObjectUrls) {
		try {
			if (revokeFn) {
				revokeFn(url);
			}
		} catch {
			// IGNORE REVOCATION FAILURE
		}
	}
	activeObjectUrls.clear();
	safeDataUrlCache.clear();
	fetchQueue.length = 0;
	activeFetches = 0;
}

// INVALIDATE A SINGLE CACHED URL AND REVOKE BLOB OBJECT URL
export function invalidateCachedSafeUrl(rawUrl: string): void {
	if (safeDataUrlCache.has(rawUrl)) {
		const oldUrl = safeDataUrlCache.get(rawUrl);
		if (oldUrl && oldUrl.startsWith('blob:')) {
			try {
				const revokeFn = (typeof URL !== 'undefined' && URL.revokeObjectURL) ||
					(typeof window !== 'undefined' && window.URL && window.URL.revokeObjectURL);
				if (revokeFn) {
					revokeFn(oldUrl);
				}
				activeObjectUrls.delete(oldUrl);
			} catch {
				// IGNORE REVOCATION FAILURE
			}
		}
		safeDataUrlCache.delete(rawUrl);
	}
}

function processFetchQueue(): void {
	while (activeFetches < MAX_CONCURRENT_IMAGE_FETCHES && fetchQueue.length > 0) {
		const nextTask = fetchQueue.shift();
		if (nextTask) {
			activeFetches++;
			nextTask().finally(() => {
				activeFetches--;
				processFetchQueue();
			});
		}
	}
}

function enqueueFetch<T>(fn: () => Promise<T>, priority = false): Promise<T> {
	return new Promise((resolve, reject) => {
		const task = async () => {
			try {
				const result = await fn();
				resolve(result);
			} catch (err) {
				reject(err);
			}
		};
		if (priority) {
			fetchQueue.unshift(task);
		} else {
			fetchQueue.push(task);
		}
		processFetchQueue();
	});
}

// CONVERT BASE64 DATA URL TO BLOB OBJECT URL FOR SMOOTH RENDERING
export function createSafeBlobUrlFromData(dataUrl: string): string {
	try {
		const createFn = (typeof URL !== 'undefined' && URL.createObjectURL) ||
			(typeof window !== 'undefined' && window.URL && window.URL.createObjectURL);
		if (!createFn) {
			return dataUrl;
		}
		const parts = dataUrl.split(',');
		const mimeMatch = parts[0].match(/:(.*?);/);
		const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
		const bstr = atob(parts[1]);
		let n = bstr.length;
		const u8arr = new Uint8Array(n);
		while (n--) {
			u8arr[n] = bstr.charCodeAt(n);
		}
		const blob = new Blob([u8arr], { type: mime });
		const objUrl = createFn(blob);
		activeObjectUrls.add(objUrl);
		return objUrl;
	} catch {
		return dataUrl;
	}
}

// RESOLVE AN IMAGE URL: IF HOST PAGE IS HTTPS AND SERVER IS HTTP, PROXY THROUGH BACKGROUND TO PREVENT MIXED CONTENT
export async function resolveSafeImageUrl(rawUrl: string, priority = false): Promise<string> {
	if (!rawUrl) return rawUrl;
	if (safeDataUrlCache.has(rawUrl)) {
		return safeDataUrlCache.get(rawUrl)!;
	}

	const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
	const isHttpServer = rawUrl.startsWith('http://');

	// IF WE ARE ON AN HTTPS PAGE AND THE IMAGE SERVER IS HTTP, REQUEST DATA URL OR BUFFER FROM BACKGROUND VIA QUEUE
	if (isHttpsPage && isHttpServer && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
		return enqueueFetch(async () => {
			if (safeDataUrlCache.has(rawUrl)) {
				return safeDataUrlCache.get(rawUrl)!;
			}
			return new Promise<string>(resolve => {
				let attempts = 0;
				const maxAttempts = 3;

				const doFetch = () => {
					attempts++;
					try {
						chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_DATA', url: rawUrl }, (res) => {
							const hasValidBuffer = res?.buffer && (res.buffer instanceof ArrayBuffer || ArrayBuffer.isView(res.buffer));
							if (chrome.runtime.lastError || !res || !res.ok || (!hasValidBuffer && !res.dataUrl)) {
								if (attempts < maxAttempts) {
									setTimeout(doFetch, attempts * 250);
								} else {
									// NEVER RETURN AN INSECURE HTTP URL ON AN HTTPS PAGE AS IT TRIGGERS MIXED CONTENT BLOCKS
									resolve('');
								}
							} else {
								let safeBlobUrl = '';
								if (hasValidBuffer) {
									try {
										const createFn = (typeof URL !== 'undefined' && URL.createObjectURL) ||
											(typeof window !== 'undefined' && window.URL && window.URL.createObjectURL);
										if (createFn) {
											const blob = new Blob([res.buffer], { type: res.mime || 'image/jpeg' });
											safeBlobUrl = createFn(blob);
											activeObjectUrls.add(safeBlobUrl);
										}
									} catch {
										// FALL THROUGH TO DATA URL DECODING
									}
								}
								if (!safeBlobUrl && res.dataUrl) {
									safeBlobUrl = createSafeBlobUrlFromData(res.dataUrl);
								}
								if (safeBlobUrl) {
									setCachedSafeUrl(rawUrl, safeBlobUrl);
									resolve(safeBlobUrl);
								} else {
									resolve('');
								}
							}
						});
					} catch {
						if (attempts < maxAttempts) {
							setTimeout(doFetch, attempts * 250);
						} else {
							resolve('');
						}
					}
				};

				doFetch();
			});
		}, priority);
	}

	return rawUrl;
}
