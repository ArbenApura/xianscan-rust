// -- BACKGROUND SSE STREAMING AND LIVE PAGE BROADCASTING -- //

// IMPORTED TYPES
import type { PageTranslatedMessage, ChapterSyncMessage } from '../types';

// IMPORTED MODULES
import { safeFetch } from './downloader';
import { safeBroadcast, broadcastToChapterTabs } from '../core/messaging';
import { isJobCancelled } from './job-state';

// -- STATES -- //

const activeSseStreams = new Map<number, AbortController>();
let globalSyncController: AbortController | null = null;

// -- FUNCTIONS -- //

// LISTEN TO SERVER-WIDE SYNC BUS FOR REAL-TIME PAGE TRANSLATION EVENTS
export async function attachGlobalSyncListener(serverUrl: string): Promise<void> {
	if (globalSyncController) return;
	const controller = new AbortController();
	globalSyncController = controller;

	try {
		const targetUrl = `${serverUrl}/api/sync/events`;
		const res = await safeFetch(targetUrl, {
			method: 'GET',
			headers: { 'Accept': 'text/event-stream' },
			signal: controller.signal
		});

		if (!res.ok || !res.body) return;

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
				if (!trimmed.includes('data:')) continue;
				const dataIdx = trimmed.indexOf('data:');
				const jsonStr = trimmed.slice(dataIdx + 5).trim();
				try {
					const data = JSON.parse(jsonStr);
					if (data.type === 'page-translated' && data.chapterId) {
						const pageMsg: PageTranslatedMessage = {
							type: 'PAGE_TRANSLATED',
							chapterId: Number(data.chapterId),
							pageSeq: data.pageSeq !== undefined ? data.pageSeq : 0,
							pageId: data.pageId,
							outputRev: data.outputRev || 1,
							outputPath: data.outputPath || '',
							total: data.count || data.total || 0
						};
						broadcastToChapterTabs(Number(data.chapterId), pageMsg);
						safeBroadcast(pageMsg);
					} else if (data.type === 'chapter-translated' && data.chapterId) {
						const syncMsg: ChapterSyncMessage = {
							type: 'CHAPTER_SYNC_UPDATE',
							chapterId: Number(data.chapterId),
							status: 'done',
							pages: []
						};
						broadcastToChapterTabs(Number(data.chapterId), syncMsg);
						safeBroadcast(syncMsg);
					}
				} catch {
					// IGNORE JSON PARSE ERRORS
				}
			}
		}
	} catch {
		// IGNORE DISCONNECT
	} finally {
		if (globalSyncController === controller) {
			globalSyncController = null;
		}
	}
}

// ABORT AN ACTIVE SSE STREAM FOR A SPECIFIED CHAPTER
export function abortSseStream(chapterId: number): void {
	const controller = activeSseStreams.get(chapterId);
	if (controller) {
		controller.abort();
		activeSseStreams.delete(chapterId);
	}
}

// LISTEN TO SERVER-SENT EVENTS DURING TRANSLATION AND BROADCAST LIVE PAGE EVENTS
export async function attachLiveTranslationListener(chapterId: number, serverUrl: string, retryCount = 0): Promise<void> {
	if (!chapterId) return;
	void attachGlobalSyncListener(serverUrl);
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
			console.info(`[XianScan] SSE stream returned HTTP ${res.status} for chapter #${chapterId} (attempt ${retryCount + 1})`);
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
		if (!streamCompletedCleanly && !controller.signal.aborted && retryCount < 10) {
			const delay = retryCount < 3 ? 300 : Math.min(1000 * Math.pow(1.5, retryCount - 3), 5000);
			console.info(`[XianScan] Scheduling SSE auto-reconnect for chapter #${chapterId} in ${delay}ms (attempt ${retryCount + 1})...`);
			setTimeout(() => {
				if (!isJobCancelled()) {
					void attachLiveTranslationListener(chapterId, serverUrl, retryCount + 1);
				}
			}, delay);
		}
	}
}
