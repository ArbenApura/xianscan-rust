// -- CONSTANTS -- //
export const RING_RADIUS = 8;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// -- TYPES -- //
export type UploadFileStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadFileInfo {
	name: string;
	size: number;
	loaded: number;
	total: number;
	status: UploadFileStatus;
}

// -- FUNCTIONS -- //

// UPLOAD A SINGLE FILE TO AN ENDPOINT WITH INDIVIDUAL PROGRESS CALLBACKS.
// ONE FILE PER REQUEST KEEPS BODIES SMALL (BELOW SERVER LIMITS) AND ENABLES PER-FILE PROGRESS.
export function uploadSingleFile(
	file: File,
	url: string,
	onProgress: (loaded: number, total: number) => void,
	signal?: AbortSignal,
): Promise<{ added?: number }> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			return reject(new Error('Upload cancelled'));
		}
		const form = new FormData();
		form.append('files', file);
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress(e.loaded, e.total);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText));
				} catch {
					resolve({ added: 1 });
				}
			} else {
				try {
					const data = JSON.parse(xhr.responseText);
					reject(new Error(data.message || `Upload failed with status ${xhr.status}`));
				} catch {
					reject(new Error(`Upload failed with status ${xhr.status}`));
				}
			}
		};
		xhr.onerror = () => reject(new Error('Network error during upload'));
		xhr.onabort = () => reject(new Error('Upload cancelled'));
		if (signal) {
			signal.addEventListener('abort', () => xhr.abort(), { once: true });
		}
		xhr.send(form);
	});
}

// THE ERROR TEXT FOR A FAILED CHAPTER PAGE UPLOAD, KEEPING THE SERVER'S REASON (E.G. A 422 "x.png is
// 20000 x 8000 (160 MP); the limit is 100 MP.") INSTEAD OF A GENERIC FAILURE
export async function chapterUploadErrorMessage(chapterTitle: string, res: Response): Promise<string> {
	const data = (await res.json().catch(() => null)) as { message?: unknown } | null;
	const reason = typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : '';
	return reason
		? `Failed to upload images for "${chapterTitle}": ${reason}`
		: `Failed to upload images for "${chapterTitle}" (HTTP ${res.status}).`;
}

// TOTAL PROGRESS PERCENT ACROSS A COLLECTION OF FILES (0-100)
export function computeGlobalPercent(files: UploadFileInfo[]): number {
	const total = files.reduce((sum, f) => sum + f.total, 0);
	const loaded = files.reduce((sum, f) => sum + f.loaded, 0);
	return total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
}

// FORMAT BYTE COUNT INTO A HUMAN READABLE STRING
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
