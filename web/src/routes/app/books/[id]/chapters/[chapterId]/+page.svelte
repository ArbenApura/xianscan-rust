<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { scale } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { ConfirmDialog, Modal, TextField, Button } from '$lib/components/ui';
	import { settings } from '$lib/stores/settings';
	import { jobTracker } from '$lib/stores/job-tracker';
	import { batchTracker } from '$lib/stores/batch-tracker';
	import { syncClient } from '$lib/stores/sync-client';
	import { readingHistory } from '$lib/stores/reading-history';
	import ChapterToolbar from '$lib/components/chapter/ChapterToolbar.svelte';
	import ViewModeWebtoon from '$lib/components/chapter/ViewModeWebtoon.svelte';
	import ViewModeGrid from '$lib/components/chapter/ViewModeGrid.svelte';
	import ViewModeCompare from '$lib/components/chapter/ViewModeCompare.svelte';
	import PageInspectModal from '$lib/components/chapter/PageInspectModal.svelte';
	import EndOfChapterCard from '$lib/components/chapter/EndOfChapterCard.svelte';
	import ResliceModal from '$lib/components/ResliceModal.svelte';
	import Upload from 'lucide-svelte/icons/upload';
	import Languages from 'lucide-svelte/icons/languages';
	import FileImage from 'lucide-svelte/icons/file-image';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Check from 'lucide-svelte/icons/check';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import { apiJson } from '$lib/api';
	import { parseDataTransferItems, type DiscoveredChapter } from '$lib/utils/folder-drop';
	import MultiChapterImportModal from '$lib/components/chapter/MultiChapterImportModal.svelte';
	import type { PageData as ServerPageData } from './$types';

	export let data: ServerPageData;

	interface Region {
		id: number;
		seq: number;
		box: unknown;
		textSource: string;
		textTarget: string | null;
		conf: number | null;
	}

	interface ChapterPageItem {
		id: number;
		seq: number;
		filePath: string;
		cleanedPath: string | null;
		outputPath: string | null;
		cleanedRev: number;
		outputRev: number;
		originalRev: number;
		status: 'pending' | 'queued' | 'processing' | 'done' | 'error';
		currentStep?: string;
		error: string | null;
		width?: number | null;
		height?: number | null;
		regions: Region[];
	}

	interface ChapterData {
		id: number;
		bookId: string;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		status?: 'pending' | 'processing' | 'done' | 'error';
		translatedAt?: number | null;
	}

	let chapter: ChapterData | null = data.chapter;
	let prevChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null =
		data.prevChapter;
	let nextChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null =
		data.nextChapter;
	let pages: ChapterPageItem[] = data.pages;
	let loading = false;
	let uploading = false;
	let exporting = false;
	let exportProgress = 0;
	let isDraggingOver = false;
	let reloadKey = Date.now();
	let lastPageshowHandler: ((e: PageTransitionEvent) => void) | null = null;

	$: {
		chapter = data.chapter;
		prevChapter = data.prevChapter;
		nextChapter = data.nextChapter;
		pages = data.pages;
		loading = false;
	}

	$: hasProgress =
		pages.some(
			(p) =>
				(p.status !== 'pending' && p.status !== 'queued') ||
				Boolean(p.cleanedPath) ||
				Boolean(p.outputPath) ||
				(p.regions && p.regions.length > 0) ||
				Boolean(p.error),
		) ||
		(chapter?.status != null && chapter.status !== 'pending') ||
		Boolean(chapter?.translatedAt);

	// MODALS & INSPECTOR
	let inspectPage: ChapterPageItem | null = null;
	let inspectModalOpen = false;
	let inspectInitialTab: 'output' | 'cleaned' | 'original' | null = null;
	let deletePageConfirmOpen = false;
	let pageToDelete: ChapterPageItem | null = null;
	let clearChapterConfirmOpen = false;
	let clearingChapterProgress = false;
	let clearChapterPagesConfirmOpen = false;
	let resliceModalOpen = false;

	// DETAILED UPLOAD MODAL STATES
	type UploadFileStatus = 'pending' | 'uploading' | 'done' | 'error';
	interface UploadFileInfo {
		name: string;
		size: number;
		loaded: number;
		total: number;
		status: UploadFileStatus;
	}
	let uploadModalOpen = false;
	let uploadStage: 'uploading' | 'processing' | 'done' | 'error' = 'uploading';
	let uploadProgressPercent = 0;
	let uploadLoadedBytes = 0;
	let uploadTotalBytes = 0;
	let uploadFilesList: UploadFileInfo[] = [];
	let uploadErrorMessage = '';
	let uploadAddedCount = 0;

	// REACTIVE GLOBAL PROGRESS ACROSS ALL QUEUED FILES
	let uploadGlobalPercent = 0;
	$: {
		const total = uploadFilesList.reduce((sum, f) => sum + f.total, 0);
		const loaded = uploadFilesList.reduce((sum, f) => sum + f.loaded, 0);
		uploadGlobalPercent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
	}

	// -- CIRCULAR PROGRESS RING CONSTANTS -- //
	const RING_RADIUS = 8;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	// PER-FILE XHR UPLOAD HELPER: RETURNS 200-299 RESULT BODY
	function uploadSingleFile(
		file: File,
		onProgress: (loaded: number, total: number) => void,
	): Promise<{ added?: number }> {
		return new Promise((resolve, reject) => {
			const form = new FormData();
			form.append('files', file);
			const xhr = new XMLHttpRequest();
			xhr.open('POST', `/api/chapters/${chapterId}/pages`);
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
			xhr.send(form);
		});
	}

	// MULTI-CHAPTER DETECTED DROP STATES
	let multiChapterModalOpen = false;
	let detectedChapters: DiscoveredChapter[] = [];
	let detectedTotalImages = 0;
	let detectedFlatFiles: File[] = [];
	let importingMultiChapters = false;

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	// EDIT CHAPTER STATES
	let editChapterModalOpen = false;
	let editChapterTitle = '';
	let editChapterTitleTarget = '';
	let editChapterSeq = 1;
	let updatingChapter = false;
	let translatingChapterTitle = false;

	function openEditChapterModal() {
		if (!chapter) return;
		editChapterTitle = chapter.title || '';
		editChapterTitleTarget = chapter.titleTarget || '';
		editChapterSeq = (chapter.seq ?? 0) + 1;
		editChapterModalOpen = true;
	}

	async function translateChapterTitle() {
		const src = editChapterTitle.trim();
		if (!src) {
			toast.error('Enter a chapter title to translate.');
			return;
		}
		translatingChapterTitle = true;
		try {
			const res = await apiJson<{ text: string }>('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: src,
					kind: 'chapter',
					chapterId,
					bookId,
				}),
			});
			if (res.text) {
				editChapterTitleTarget = res.text;
				toast.success('Chapter title translated!');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Could not translate chapter title.');
		} finally {
			translatingChapterTitle = false;
		}
	}

	async function updateChapter() {
		if (!chapter) return;
		const parsedSeq = parseInt(String(editChapterSeq), 10);
		const seq = Number.isInteger(parsedSeq) && parsedSeq > 0 ? parsedSeq - 1 : 0;
		updatingChapter = true;
		try {
			const resp = await fetch(`/api/chapters/${chapterId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editChapterTitle.trim(),
					titleTarget: editChapterTitleTarget.trim() || null,
					seq,
				}),
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => null);
				throw new Error(err?.message || 'Update failed');
			}
			const data = await resp.json();
			chapter = {
				...chapter,
				...data.chapter,
			};
			toast.success('Chapter updated.');
			editChapterModalOpen = false;
		} catch (err: any) {
			toast.error(err?.message || 'Could not update chapter.');
		} finally {
			updatingChapter = false;
		}
	}

	// DRAG & DROP REORDERING STATE
	let draggedPageIndex: number | null = null;
	let dragOverPageIndex: number | null = null;

	$: chapterId = Number($page.params.chapterId);
	$: bookId = $page.params.id;
	$: bookTitle = (data.chapter as any)?.bookTitle || (chapter as any)?.bookTitle || 'Book Translation';

	// ACTIVE TRANSLATION JOB STATE (SELF-HEALING & REACTIVE)
	$: currentJobState = $jobTracker.jobs[chapterId] || {
		chapterId,
		running: false,
		connectionState: 'idle',
		snapshot: null,
		lastError: null,
		reconnectAttempts: 0,
	};

	// ACTIVE BATCH ITEM FOR THIS CHAPTER — USED TO DERIVE THE 'queued' PAGE STATUS (A PAGE THAT HAS BEEN
	// ADDED TO THE TRANSLATION QUEUE BUT HAS NOT STARTED PROCESSING YET, DISTINCT FROM A PLAIN 'pending'
	// PAGE THAT HAS NOT BEEN QUEUED AT ALL).
	$: activeQueuedBatch = (() => {
		if (!$batchTracker.active) return null;
		const item = $batchTracker.queue.find((q) => q.id === chapterId);
		if (!item) return null;
		if (item.status === 'queued' || item.status === 'processing') return item;
		return null;
	})();
	$: queuedPageIdSet = activeQueuedBatch?.pageIds?.length ? new Set(activeQueuedBatch.pageIds) : null;
	$: isWholeChapterQueued = Boolean(
		activeQueuedBatch && (!activeQueuedBatch.pageIds || activeQueuedBatch.pageIds.length === 0),
	);

	// AUTO-ATTACH JOB TRACKER WHEN BATCH STARTS RUNNING FOR THIS CHAPTER
	$: if (browser && chapterId && activeQueuedBatch?.status === 'processing' && !currentJobState.running) {
		void jobTracker.syncChapter(chapterId);
	}

	// WATCH GLOBAL SYNC BUS FOR EXTERNAL RUNS ON THIS CHAPTER
	let lastHandledSyncTimestamp = 0;
	$: if (browser && chapterId && $syncClient.lastEvent?.chapterId === chapterId) {
		const ev = $syncClient.lastEvent;
		const ts = ev.timestamp ?? 0;
		if (ev.type === 'page-translated' && !currentJobState.running && ts > lastHandledSyncTimestamp) {
			lastHandledSyncTimestamp = ts;
			void jobTracker.syncChapter(chapterId);
		}
	}

	// REAL-TIME SYNCHRONIZED PAGES MERGED WITH SNAPSHOT (MEMOIZED REFERENCES)
	let lastDisplayPagesMap = new Map<number, ChapterPageItem>();
	$: displayPages = ((): ChapterPageItem[] => {
		const snapshotPageMap = new Map<number, NonNullable<NonNullable<typeof currentJobState.snapshot>['pages']>[0]>();
		if (currentJobState.snapshot?.pages?.length) {
			for (const sp of currentJobState.snapshot.pages) {
				snapshotPageMap.set(sp.pageId, sp);
			}
		}

		const nextMap = new Map<number, ChapterPageItem>();
		const batchItem = $batchTracker.queue.find((q) => q.id === chapterId);
		const result = pages.map((p) => {
			const sp = snapshotPageMap.get(p.id);
			const isBatchTarget = batchItem
				? (!batchItem.pageIds?.length || batchItem.pageIds.includes(p.id))
				: false;
			const isBatchError = Boolean(
				batchItem &&
				batchItem.status === 'error' &&
				isBatchTarget &&
				p.status !== 'done'
			);
			const isBatchProcessing = Boolean(
				batchItem &&
				(batchItem.status === 'processing' || batchItem.status === 'reslicing') &&
				isBatchTarget &&
				p.status !== 'done'
			);
			const isBatchQueued = Boolean(
				batchItem &&
				batchItem.status === 'queued' &&
				isBatchTarget &&
				p.status !== 'done'
			);

			const isProcessing =
				!isBatchError &&
				((sp?.status === 'processing' || (!sp && currentJobState.running && p.status === 'processing') || isBatchProcessing) &&
				(currentJobState.running || isBatchProcessing));
			const isError =
				!isProcessing &&
				(isBatchError ||
					sp?.status === 'error' ||
					p.status === 'error' ||
					Boolean(sp?.errorMessage) ||
					Boolean(p.error));
			const isDone = !isProcessing && !isError && (sp?.status === 'done' || (!sp && p.status === 'done'));
			const isQueued =
				!isProcessing &&
				!isError &&
				!isDone &&
				(isBatchQueued ||
					isWholeChapterQueued ||
					(queuedPageIdSet ? queuedPageIdSet.has(p.id) : false));
			const rawStatus = p.status || 'pending';
			const status: 'pending' | 'queued' | 'processing' | 'done' | 'error' = isProcessing
				? 'processing'
				: isError
					? 'error'
					: isDone
						? 'done'
						: isQueued
							? 'queued'
							: rawStatus === 'processing'
								? 'pending'
								: rawStatus;

			const currentStep = isProcessing ? sp?.currentStep : isError ? sp?.failedStep || 'error' : undefined;
			const outputPath = sp
				? sp.status === 'done'
					? sp.outputPath || p.outputPath
					: null
				: isProcessing || isQueued
					? null
					: p.outputPath;
			const cleanedRev = Math.max(sp?.cleanedRev ?? 0, p.cleanedRev ?? 0);
			const outputRev = Math.max(sp?.outputRev ?? 0, p.outputRev ?? 0);
			const originalRev = p.originalRev;
			const error = isError
				? sp?.errorMessage || p.error || (isBatchError ? batchItem?.error : null) || 'Translation failed on this page'
				: null;

			const prev = lastDisplayPagesMap.get(p.id);
			if (
				prev &&
				prev.seq === p.seq &&
				prev.status === status &&
				(prev as any).currentStep === currentStep &&
				prev.outputPath === outputPath &&
				prev.cleanedPath === p.cleanedPath &&
				prev.cleanedRev === cleanedRev &&
				prev.outputRev === outputRev &&
				prev.originalRev === originalRev &&
				prev.error === error &&
				prev.width === p.width &&
				prev.height === p.height
			) {
				nextMap.set(p.id, prev);
				return prev;
			}

			const nextItem: ChapterPageItem = {
				...p,
				status,
				currentStep,
				outputPath,
				cleanedRev,
				outputRev,
				originalRev,
				error,
			};
			nextMap.set(p.id, nextItem);
			return nextItem;
		});

		lastDisplayPagesMap = nextMap;
		return result;
	})();

	// PERSISTENT USER SETTINGS
	$: activeViewMode = $settings.readerViewMode;
	$: webtoonKind = $settings.webtoonKind;
	$: webtoonWidth = $settings.webtoonWidth;

	// AUTO-CLOSE INSPECTOR OR SYNC WITH DISPLAY PAGES
	$: if (inspectModalOpen && inspectPage) {
		const current = displayPages.find((p) => p.id === inspectPage?.id);
		if (current) {
			if (current.status === 'processing') {
				inspectModalOpen = false;
				inspectPage = null;
			} else if (
				current.status !== inspectPage.status ||
				current.outputPath !== inspectPage.outputPath ||
				current.cleanedPath !== inspectPage.cleanedPath ||
				current.error !== inspectPage.error
			) {
				inspectPage = current;
			}
		}
	}

	// ROUTE SWITCHING REACTIVITY FOR NEXT / PREV CHAPTER NAVIGATION
	let lastLoadedChapterId: number | null = null;
	$: if (browser && chapterId && chapterId !== lastLoadedChapterId) {
		lastLoadedChapterId = chapterId;
		if (chapterId) {
			void jobTracker.syncChapter(chapterId);
		}
	}

	// PERSIST LAST READ CHAPTER PER BOOK (COOKIE + LOCAL CACHE)
	$: if (browser && chapter && bookId && chapter.bookId === bookId) {
		readingHistory.recordReading(bookId, {
			id: chapter.id,
			seq: chapter.seq,
			title: chapter.title,
			titleTarget: chapter.titleTarget,
		});
	}

	function scrollToTargetPageFromUrl() {
		if (!browser || typeof window === 'undefined') return;
		const hash = window.location.hash;
		const params = new URLSearchParams(window.location.search);
		const targetPageId = params.get('pageId') || (hash.startsWith('#page-') ? hash.replace('#page-', '') : null);
		const targetSeq = params.get('seq');

		if (targetPageId || targetSeq !== null) {
			let attempts = 0;
			const tryScroll = () => {
				attempts++;
				const el =
					(targetPageId ? document.querySelector(`[data-page-id="${targetPageId}"]`) : null) ||
					(targetSeq !== null ? document.querySelector(`[data-page-seq="${targetSeq}"]`) : null);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					el.classList.add('ring-2', 'ring-[#b23a2e]', 'dark:ring-[#e08a63]');
					setTimeout(() => {
						el.classList.remove('ring-2', 'ring-[#b23a2e]', 'dark:ring-[#e08a63]');
					}, 2000);
					return;
				}
				if (attempts < 5) {
					setTimeout(tryScroll, attempts * 150);
				}
			};
			setTimeout(tryScroll, 100);
		}
	}

	$: if (browser && $page.url) {
		scrollToTargetPageFromUrl();
	}

	onMount(() => {
		lastLoadedChapterId = chapterId;
		if (chapterId) {
			void jobTracker.syncChapter(chapterId);
		}
		if (chapter && bookId && chapter.bookId === bookId) {
			readingHistory.recordReading(bookId, {
				id: chapter.id,
				seq: chapter.seq,
				title: chapter.title,
				titleTarget: chapter.titleTarget,
			});
		}

		scrollToTargetPageFromUrl();

		window.addEventListener('dragend', handleDragEnd);
		window.addEventListener('pointerup', handleDragEnd);

		// BFCACHE RESTORE CAN SHOW STALE REVS FROM A FROZEN DOM — REVALIDATE THE DATA AND
		// LET THE REACTIVE RENDER SWAP IN FRESH URLS.
		const onPageshow = (e: PageTransitionEvent) => {
			if (e.persisted) {
				void invalidateAll();
			}
		};
		window.addEventListener('pageshow', onPageshow);
		lastPageshowHandler = onPageshow;
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('dragend', handleDragEnd);
			window.removeEventListener('pointerup', handleDragEnd);
			if (lastPageshowHandler) window.removeEventListener('pageshow', lastPageshowHandler);
		}
	});

	// RELOAD CHAPTER DATA WHEN PROGRESS COMPLETES OR BATCH STATUS CHANGES
	let lastRunning = false;
	let lastBatchChapterStatus: string | null = null;
	$: {
		if (browser && lastRunning && !currentJobState.running) {
			void reload();
		}
		lastRunning = currentJobState.running;

		if (browser) {
			const batchItem = $batchTracker.queue.find((q) => q.id === chapterId);
			const currentBatchStatus = batchItem?.status || null;
			if (currentBatchStatus !== lastBatchChapterStatus) {
				if (currentBatchStatus === 'error' || currentBatchStatus === 'done') {
					void reload();
				}
				lastBatchChapterStatus = currentBatchStatus;
			}
		}
	}

	async function reload() {
		if (!browser) return;
		try {
			const resp = await fetch(`/api/chapters/${chapterId}`);
			if (!resp.ok) throw new Error('Load failed');
			const data = await resp.json();
			chapter = data.chapter;
			prevChapter = data.prevChapter;
			nextChapter = data.nextChapter;
			pages = data.pages;
			reloadKey = Date.now();
		} catch {
			toast.error('Could not load chapter pages.');
		} finally {
			loading = false;
		}
	}

	async function handleResliceComplete() {
		resliceModalOpen = false;
		await reload();
		if (chapterId) {
			await jobTracker.syncChapter(chapterId);
		}
	}

	async function startTranslation(force = false) {
		const pendingPages = pages.filter((p) => p.status !== 'done');
		if (pendingPages.length === 0 && pages.length > 0 && !force) {
			toast.info('All pages are already translated! Use Clear Progress to reset or translate individual pages.');
			return;
		}

		try {
			if (chapter && bookId) {
				await batchTracker.startBatch(
					bookId,
					bookTitle || 'Book Translation',
					[
						{
							id: chapter.id,
							seq: chapter.seq,
							title: chapter.title || '',
							titleTarget: chapter.titleTarget,
							pageCount: pages.length,
						},
					],
					{ force },
				);
			} else {
				const shouldForce = force || !currentJobState.running;
				await jobTracker.startTranslation(chapterId, { force: shouldForce });
			}
		} catch (e: any) {
			toast.error(e?.message || 'Translation failed to start.');
		}
	}

	async function cancelTranslation() {
		try {
			if ($batchTracker.active && $batchTracker.queue.some((q) => q.id === chapterId)) {
				await batchTracker.cancelBatch();
			} else {
				await jobTracker.cancelTranslation(chapterId);
			}
			toast.info('Translation stopped.');
			await reload();
		} catch {
			toast.error('Failed to cancel translation.');
		}
	}

	// EXPORT THE CHAPTER AS A FOLDER-BASED ZIP WITH LIVE PROGRESS FEEDBACK.
	async function exportChapterZip() {
		if (exporting || !chapter) return;
		exporting = true;
		exportProgress = 0;
		const toastId = toast.loading('Preparing ZIP...');
		try {
			const resp = await fetch(`/api/chapters/${chapter.id}/download`);
			if (!resp.ok) {
				const body = await resp.json().catch(() => null);
				throw new Error((body as { message?: string } | null)?.message || 'Export failed.');
			}
			const total = Number(resp.headers.get('content-length') || 0);
			const reader = resp.body?.getReader();
			if (!reader) throw new Error('Download stream unavailable.');
			const chunks: BlobPart[] = [];
			let received = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				received += value.byteLength;
				exportProgress =
					total > 0 ? Math.min(99, Math.round((received / total) * 100)) : ((exportProgress + 4) % 80) + 10;
			}
			const blob = new Blob(chunks, { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			const rawName = (chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`).trim();
			anchor.href = url;
			anchor.download = `${rawName.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || `chapter_${chapter.id}`}.zip`;
			anchor.click();
			URL.revokeObjectURL(url);
			exportProgress = 100;
			toast.success('ZIP exported.', { id: toastId });
		} catch (e: any) {
			toast.error(e?.message || 'Could not export the ZIP.', { id: toastId });
		} finally {
			// LET THE COMPLETE STATE SHOW BRIEFLY BEFORE RESETTING
			setTimeout(() => {
				exporting = false;
				exportProgress = 0;
			}, 600);
		}
	}

	async function cancelSinglePage(pg: ChapterPageItem) {
		try {
			await jobTracker.cancelPage(chapterId, pg.id);
			batchTracker.cancelPage(chapterId, pg.id, pages.map((p) => p.id));
			pg.status = 'pending';
			pg.error = null;
			pages = [...pages];
			toast.info(`Removed Page ${pg.seq + 1} from translation.`);
		} catch {
			toast.error(`Could not cancel translation for Page ${pg.seq + 1}.`);
		}
	}

	async function translateSinglePage(pg: ChapterPageItem) {
		try {
			const resetResp = await fetch(`/api/pages/${pg.id}/reset`, { method: 'POST' });
			if (!resetResp.ok) throw new Error('Reset failed');
			pg.status = 'pending';
			pg.cleanedPath = null;
			pg.outputPath = null;
			pg.error = null;
			pages = [...pages];

			if (chapter && bookId) {
				await batchTracker.startBatch(
					bookId,
					bookTitle || 'Book Translation',
					[
						{
							id: chapter.id,
							seq: chapter.seq,
							title: chapter.title || '',
							titleTarget: chapter.titleTarget,
							pageCount: pages.length,
						},
					],
					{ force: true, pageIds: [pg.id] },
				);
			} else {
				const shouldForce = !currentJobState.running;
				await jobTracker.startTranslation(chapterId, { force: shouldForce, pageIds: [pg.id] });
			}
		} catch (e: any) {
			toast.error(e?.message || 'Failed to start single page translation.');
		}
	}

	async function translateSelectedPages(pageIds: number[]) {
		if (!pageIds.length) return;
		try {
			// RESET TARGET PAGES IN DB AND LOCAL REACTIVE STATE
			await Promise.all(
				pageIds.map(async (id) => {
					try {
						await fetch(`/api/pages/${id}/reset`, { method: 'POST' });
					} catch {}
					const pg = pages.find((p) => p.id === id);
					if (pg) {
						pg.status = 'pending';
						pg.cleanedPath = null;
						pg.outputPath = null;
						pg.error = null;
					}
				}),
			);
			pages = [...pages];

			if (chapter && bookId) {
				await batchTracker.startBatch(
					bookId,
					bookTitle || 'Book Translation',
					[
						{
							id: chapter.id,
							seq: chapter.seq,
							title: chapter.title || '',
							titleTarget: chapter.titleTarget,
							pageCount: pages.length,
						},
					],
					{ force: true, pageIds },
				);
			} else {
				const shouldForce = !currentJobState.running;
				await jobTracker.startTranslation(chapterId, { force: shouldForce, pageIds });
			}
			toast.success(`Queued ${pageIds.length} page${pageIds.length === 1 ? '' : 's'} for translation.`);
		} catch (e: any) {
			toast.error(e?.message || 'Failed to start batch translation.');
		}
	}

	async function clearPageProgress(pg: ChapterPageItem) {
		try {
			const resp = await fetch(`/api/pages/${pg.id}/reset`, { method: 'POST' });
			if (!resp.ok) throw new Error('Reset failed');
			pg.status = 'pending';
			pg.cleanedPath = null;
			pg.outputPath = null;
			pg.error = null;
			pages = [...pages];
			jobTracker.clearJob(chapterId);
			batchTracker.clearChapter(chapterId);
			toast.success(`Cleared progress on Page ${pg.seq + 1}.`);
			await reload();
		} catch {
			toast.error('Could not clear page progress.');
		}
	}

	async function confirmClearChapterProgress() {
		clearingChapterProgress = true;
		const toastId = toast.loading('Clearing chapter progress...');
		try {
			const resp = await fetch(`/api/chapters/${chapterId}/reset`, { method: 'POST' });
			if (!resp.ok) throw new Error('Reset failed');
			const { reset } = await resp.json();
			jobTracker.clearJob(chapterId);
			batchTracker.clearChapter(chapterId);
			toast.success(`Cleared progress on ${reset} page${reset === 1 ? '' : 's'}.`, { id: toastId });
			clearChapterConfirmOpen = false;
			await reload();
		} catch (err: any) {
			toast.error(err?.message || 'Could not clear chapter progress.', { id: toastId });
		} finally {
			clearingChapterProgress = false;
		}
	}

	async function confirmClearChapterPages() {
		clearChapterPagesConfirmOpen = false;
		try {
			const resp = await fetch(`/api/chapters/${chapterId}/pages`, { method: 'DELETE' });
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to clear pages');
			}
			const data = await resp.json().catch(() => ({ deletedCount: 0 }));
			jobTracker.clearJob(chapterId);
			batchTracker.clearChapter(chapterId);
			toast.success(`Cleared ${data.deletedCount} page${data.deletedCount === 1 ? '' : 's'} from chapter.`);
			await reload();
		} catch (e: any) {
			toast.error(e.message || 'Could not clear pages.');
		}
	}

	async function uploadFiles(files: FileList | File[]) {
		const fileArr = Array.from(files || []);
		if (fileArr.length === 0) return;

		uploadFilesList = fileArr.map((f) => ({
			name: f.name,
			size: f.size,
			loaded: 0,
			total: f.size,
			status: 'pending',
		}));
		uploadTotalBytes = fileArr.reduce((sum, f) => sum + f.size, 0);
		uploadLoadedBytes = 0;
		uploadProgressPercent = 0;
		uploadStage = 'uploading';
		uploadErrorMessage = '';
		uploadAddedCount = 0;
		uploadModalOpen = true;
		uploading = true;

		try {
			// UPLOAD ONE FILE PER REQUEST SO EACH IMAGE HAS INDIVIDUAL PROGRESS
			// AND EACH BODY STAYS BELOW THE SERVER 64MB LIMIT.
			let addedTotal = 0;
			for (let i = 0; i < fileArr.length; i++) {
				// RESET STAGE EACH ITERATION SO HERO STAYS IN UPLOADING STATE ACROSS FILES
				uploadStage = 'uploading';
				uploadFilesList[i] = { ...uploadFilesList[i], loaded: 0, status: 'uploading' };
				const result = await uploadSingleFile(fileArr[i], (loaded, total) => {
					uploadFilesList[i] = {
						...uploadFilesList[i],
						loaded,
						total,
						status: 'uploading',
					};
					uploadLoadedBytes = uploadFilesList.reduce((sum, f) => sum + f.loaded, 0);
					uploadTotalBytes = fileArr.reduce((sum, f) => sum + f.size, 0);
					uploadProgressPercent = Math.min(99, Math.round((uploadLoadedBytes / uploadTotalBytes) * 100));
				});
				addedTotal += result.added ?? 1;
				uploadFilesList[i] = {
					...uploadFilesList[i],
					loaded: uploadFilesList[i].total,
					status: 'done',
				};
			}

			uploadProgressPercent = 100;
			uploadLoadedBytes = uploadTotalBytes;
			uploadStage = 'done';
			uploadAddedCount = addedTotal;
			toast.success(`${uploadAddedCount} page${uploadAddedCount === 1 ? '' : 's'} uploaded.`);

			if (!currentJobState.running) {
				jobTracker.clearJob(chapterId);
			}
			await reload();

			// Auto close modal after brief confirmation if user hasn't closed it
			setTimeout(() => {
				if (uploadModalOpen && uploadStage === 'done') {
					uploadModalOpen = false;
				}
			}, 2000);
		} catch (err: any) {
			uploadStage = 'error';
			uploadErrorMessage = err.message || 'Upload failed.';
			toast.error(uploadErrorMessage);
		} finally {
			uploading = false;
		}
	}

	async function confirmDeletePage() {
		if (!pageToDelete) return;
		deletePageConfirmOpen = false;
		try {
			const resp = await fetch(`/api/pages/${pageToDelete.id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error('Delete failed');
			toast.success(`Page ${pageToDelete.seq + 1} deleted.`);
			pageToDelete = null;
			if (!currentJobState.running) {
				jobTracker.clearJob(chapterId);
			}
			await reload();
		} catch {
			toast.error('Could not delete page.');
		}
	}

	async function stitchPages(pg: ChapterPageItem) {
		const idx = pages.findIndex((p) => p.id === pg.id);
		if (idx === -1 || idx >= pages.length - 1) return;
		const nextPg = pages[idx + 1];

		try {
			const resp = await fetch(`/api/pages/${pg.id}/stitch`, {
				method: 'POST',
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.message || 'Stitch failed');
			}
			toast.success(`Merged Page ${pg.seq + 1} and Page ${nextPg.seq + 1}.`);
			await reload();
		} catch (e) {
			toast.error((e as Error).message || 'Could not merge pages.');
		}
	}

	function handleMenuAction(action: string, pg: ChapterPageItem) {
		if (action === 'translate') translateSinglePage(pg);
		else if (action === 'cancel') cancelSinglePage(pg);
		else if (action === 'inspect') openInspector(pg);
		else if (action === 'stitch') stitchPages(pg);
		else if (action === 'reset') clearPageProgress(pg);
		else if (action === 'delete') {
			pageToDelete = pg;
			deletePageConfirmOpen = true;
		}
	}

	function openInspector(detail: any, tab?: 'output' | 'cleaned' | 'original') {
		const pg = detail?.page || detail;
		if (!pg || pg.status === 'processing') return;
		inspectPage = pg;
		inspectInitialTab = tab || detail?.initialTab || null;
		inspectModalOpen = true;
	}

	// DRAG & DROP EVENT HANDLERS
	function handleDragStart(e: DragEvent, idx: number) {
		draggedPageIndex = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(idx));
			e.dataTransfer.setData('application/x-xianscan-page-id', String(pages[idx].id));
		}
	}

	function handleDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		if (draggedPageIndex === null || draggedPageIndex === idx) return;
		dragOverPageIndex = idx;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	async function handleDrop(e: DragEvent, targetIdx: number) {
		e.preventDefault();
		if (draggedPageIndex === null || draggedPageIndex === targetIdx) {
			handleDragEnd();
			return;
		}

		const fromIdx = draggedPageIndex;
		const reordered = [...pages];
		const [moved] = reordered.splice(fromIdx, 1);
		reordered.splice(targetIdx, 0, moved);
		pages = reordered.map((p, i) => ({ ...p, seq: i }));
		handleDragEnd();

		try {
			const pageIds = pages.map((p) => p.id);
			await apiJson(`/api/chapters/${chapterId}/pages`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pageIds }),
			});
			toast.success('Page order saved.');
		} catch {
			toast.error('Could not save page order.');
			await reload();
		}
	}

	function handleDragEnd() {
		draggedPageIndex = null;
		dragOverPageIndex = null;
	}

	// FILE DROP ON PAGE ROOT
	async function handleRootDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = false;
		if (draggedPageIndex !== null) return;

		if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
			const scanToastId = toast.loading('Scanning dropped files and folders...');
			try {
				const scanResult = await parseDataTransferItems(e.dataTransfer.items, (count) => {
					toast.loading(`Scanning folder... (${count} images found)`, { id: scanToastId });
				});
				toast.dismiss(scanToastId);

				if (scanResult.isMultiChapter && scanResult.chapters.length >= 2) {
					detectedChapters = scanResult.chapters;
					detectedTotalImages = scanResult.totalImages;
					detectedFlatFiles = scanResult.flatFiles;
					multiChapterModalOpen = true;
					return;
				}

				if (scanResult.flatFiles.length > 0) {
					uploadFiles(scanResult.flatFiles);
					return;
				}
			} catch {
				toast.dismiss(scanToastId);
				// FALLBACK TO STANDARD FILE DROP
			}
		}

		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			uploadFiles(e.dataTransfer.files);
		}
	}

	// EXECUTE MULTI-CHAPTER BATCH IMPORT INTO THE CURRENT BOOK
	async function executeMultiChapterImport(bookTargetId: string, chaptersToImport: DiscoveredChapter[]) {
		if (chaptersToImport.length === 0) return;
		multiChapterModalOpen = false;
		importingMultiChapters = true;

		const toastId = toast.loading(
			`Importing ${chaptersToImport.length} chapters... (0/${chaptersToImport.length})`,
		);
		let completed = 0;

		try {
			for (let i = 0; i < chaptersToImport.length; i++) {
				const ch = chaptersToImport[i];
				toast.loading(`Importing ${ch.title || `Chapter ${i + 1}`} (${i + 1}/${chaptersToImport.length})...`, {
					id: toastId,
				});

				// 1. CREATE CHAPTER RECORD IN BOOK
				const createRes = await fetch(`/api/books/${bookTargetId}/chapters`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						title: ch.title || ch.folderName,
						seq: ch.seqHint !== null ? ch.seqHint - 1 : undefined,
					}),
				});

				if (!createRes.ok) {
					throw new Error(`Failed to create chapter "${ch.title}"`);
				}

				const { id: newChapterId } = await createRes.json();

				// 2. UPLOAD CHAPTER PAGES CHUNKED TO AVOID HTTP BODY OVERFLOW
				const CHUNK_SIZE = 40;
				for (let p = 0; p < ch.files.length; p += CHUNK_SIZE) {
					const chunk = ch.files.slice(p, p + CHUNK_SIZE);
					const form = new FormData();
					for (const file of chunk) {
						form.append('files', file);
					}
					const uploadRes = await fetch(`/api/chapters/${newChapterId}/pages`, {
						method: 'POST',
						body: form,
					});
					if (!uploadRes.ok) {
						throw new Error(`Failed to upload images for "${ch.title}"`);
					}
				}

				completed++;
			}

			toast.success(`Successfully imported ${completed} chapters!`, { id: toastId });
		} catch (err: any) {
			toast.error(err?.message || 'Multi-chapter import encountered an error.', { id: toastId });
		} finally {
			importingMultiChapters = false;
		}
	}

	function handleRootDragOver(e: DragEvent) {
		if (draggedPageIndex !== null) return;
		if (!e.dataTransfer?.types?.includes('Files')) return;
		e.preventDefault();
		isDraggingOver = true;
	}
</script>

<svelte:head>
	<title
		>{chapter
			? `${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`} - XianScan`
			: 'Chapter Reader'}</title
	>
	<meta
		name="description"
		content={`Read and translate Chapter ${chapter ? chapter.seq + 1 : ''} with live typesetting and OCR.`}
	/>
</svelte:head>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="flex flex-col gap-6"
	on:dragover={handleRootDragOver}
	on:dragleave={() => (isDraggingOver = false)}
	on:drop={handleRootDrop}
>
	<!-- DRAG OVERLAY -->
	{#if isDraggingOver}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#b23a2e]/20 backdrop-blur-sm"
		>
			<div
				class="mx-4 flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#b23a2e] bg-white/90 p-8 text-center shadow-2xl dark:border-[#e08a63] dark:bg-[#1a1713]/90"
			>
				<Upload size={36} class="animate-bounce text-[#b23a2e] dark:text-[#e08a63]" />
				<div class="space-y-1">
					<p class="text-sm font-bold sm:text-base">Drop chapter folders or pages to import</p>
					<p class="text-xs opacity-75">
						Append pages to Chapter {chapter ? chapter.seq + 1 : ''} or create new chapters
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- TOOLBAR -->
	<ChapterToolbar
		bookId={bookId ?? ''}
		chapterSeq={chapter?.seq ?? 0}
		chapterTitle={chapter?.title ?? null}
		chapterTitleTarget={chapter?.titleTarget ?? null}
		totalPages={pages.length}
		{prevChapter}
		{nextChapter}
		{hasProgress}
		running={currentJobState.running ||
			Boolean(
				$batchTracker.active &&
					$batchTracker.queue.some(
						(q) => q.id === chapterId && (q.status === 'processing' || q.status === 'reslicing'),
					),
			)}
		isReslicing={Boolean(
			$batchTracker.active && $batchTracker.queue.find((q) => q.id === chapterId && q.status === 'reslicing'),
		)}
		{uploading}
		{exporting}
		{exportProgress}
		{activeViewMode}
		{webtoonKind}
		{webtoonWidth}
		on:translate={() => startTranslation(false)}
		on:cancel={cancelTranslation}
		on:clearProgress={() => (clearChapterConfirmOpen = true)}
		on:clearAllPages={() => (clearChapterPagesConfirmOpen = true)}
		on:openReslice={() => (resliceModalOpen = true)}
		on:editChapter={openEditChapterModal}
		on:exportZip={exportChapterZip}
		on:upload={(e) => uploadFiles(e.detail)}
		on:changeViewMode={(e) => settings.update((s) => ({ ...s, readerViewMode: e.detail }))}
		on:changeWebtoonKind={(e) => settings.update((s) => ({ ...s, webtoonKind: e.detail }))}
		on:changeWebtoonWidth={(e) => settings.update((s) => ({ ...s, webtoonWidth: e.detail }))}
	/>

	<!-- MAIN CONTENT VIEWS -->
	{#if loading}
		<div class="flex flex-col items-center gap-2">
			{#each [1, 2] as _}
				<div
					class="h-96 w-full max-w-2xl rounded-xl border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"
				></div>
			{/each}
		</div>
	{:else if pages.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 py-16 text-center dark:border-white/15"
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]"
			>
				<Upload size={24} />
			</div>
			<h2 class="mt-4 text-base font-semibold">No chapter pages uploaded yet</h2>
			<p class="mt-1 max-w-sm text-xs opacity-60">
				Drag and drop images or chapter folders here, or click 'Add Images' above.
			</p>
		</div>
	{:else if activeViewMode === 'reader'}
		<ViewModeWebtoon
			pages={displayPages}
			{webtoonKind}
			{webtoonWidth}
			on:inspect={(e) => openInspector(e.detail)}
			on:translate={(e) => translateSinglePage(e.detail)}
		/>
	{:else if activeViewMode === 'grid'}
		<ViewModeGrid
			pages={displayPages}
			running={currentJobState.running}
			{webtoonKind}
			{draggedPageIndex}
			{dragOverPageIndex}
			on:inspect={(e) => openInspector(e.detail)}
			on:menuAction={(e) => handleMenuAction(e.detail.action, e.detail.page)}
			on:dragStart={(e) => handleDragStart(e.detail.event, e.detail.index)}
			on:dragOver={(e) => handleDragOver(e.detail.event, e.detail.index)}
			on:drop={(e) => handleDrop(e.detail.event, e.detail.index)}
			on:dragEnd={handleDragEnd}
			on:batchTranslate={(e) => translateSelectedPages(e.detail.pageIds)}
		/>
	{:else if activeViewMode === 'compare'}
		<ViewModeCompare
			pages={displayPages}
			running={currentJobState.running}
			{draggedPageIndex}
			{dragOverPageIndex}
			on:inspect={(e) => openInspector(e.detail)}
			on:menuAction={(e) => handleMenuAction(e.detail.action, e.detail.page)}
			on:dragStart={(e) => handleDragStart(e.detail.event, e.detail.index)}
			on:dragOver={(e) => handleDragOver(e.detail.event, e.detail.index)}
			on:drop={(e) => handleDrop(e.detail.event, e.detail.index)}
		/>
	{/if}

	<!-- END OF CHAPTER CARD (RENDERED FOR ALL VIEW MODES AT BOTTOM WITH GAP) -->
	{#if pages.length > 0}
		<EndOfChapterCard
			bookId={bookId ?? ''}
			chapterSeq={chapter?.seq ?? 0}
			totalPages={pages.length}
			{prevChapter}
			{nextChapter}
		/>
	{/if}
</div>

<!-- PAGE REGION INSPECTOR MODAL -->
<PageInspectModal
	open={inspectModalOpen}
	page={inspectPage}
	initialTab={inspectInitialTab}
	{reloadKey}
	on:close={() => (inspectModalOpen = false)}
	on:retranslate={(e) => {
		const targetPg = e.detail.page;
		if (targetPg) {
			const found = pages.find((p) => p.id === targetPg.id) || targetPg;
			translateSinglePage(found);
		}
	}}
	on:update={(e) => {
		const updatedPg = e.detail.page;
		if (updatedPg) {
			const idx = pages.findIndex((p) => p.id === updatedPg.id);
			if (idx !== -1) {
				pages[idx] = { ...pages[idx], ...updatedPg };
				pages = [...pages];
			}
			reloadKey = e.detail.reloadKey || Date.now();
			inspectPage = pages[idx] || updatedPg;
		}
	}}
/>

<!-- RESLICE MODAL -->
<ResliceModal
	open={resliceModalOpen}
	{chapterId}
	pageCount={pages.length}
	on:close={() => (resliceModalOpen = false)}
	on:complete={handleResliceComplete}
	on:success={handleResliceComplete}
/>

<!-- CLEAR CHAPTER CONFIRMATION -->
<ConfirmDialog
	open={clearChapterConfirmOpen}
	title="Clear Chapter Progress?"
	message="This will reset all pages in this chapter back to 'pending', allowing a clean re-run."
	confirmLabel="Clear Progress"
	requireVerificationCode={true}
	loading={clearingChapterProgress}
	variant="danger"
	on:confirm={confirmClearChapterProgress}
	on:cancel={() => {
		if (!clearingChapterProgress) clearChapterConfirmOpen = false;
	}}
/>

<!-- CLEAR PAGES CONFIRMATION -->
<ConfirmDialog
	open={clearChapterPagesConfirmOpen}
	title={`Clear Pages from "${chapter?.titleTarget || chapter?.title || `Chapter ${(chapter?.seq ?? 0) + 1}`}"?`}
	message={`Are you sure you want to clear all ${pages.length} page${pages.length === 1 ? '' : 's'} in this chapter? All uploaded page images, OCR data, and translations will be permanently removed.`}
	confirmLabel="Clear Pages"
	requireVerificationCode={true}
	variant="danger"
	on:confirm={confirmClearChapterPages}
	on:cancel={() => (clearChapterPagesConfirmOpen = false)}
/>

<!-- DELETE PAGE CONFIRMATION -->
<ConfirmDialog
	open={deletePageConfirmOpen}
	title="Delete Page?"
	message={`Are you sure you want to delete Page ${pageToDelete ? pageToDelete.seq + 1 : ''}? This cannot be undone.`}
	confirmLabel="Delete Page"
	variant="danger"
	on:confirm={confirmDeletePage}
	on:cancel={() => (deletePageConfirmOpen = false)}
/>

<!-- EDIT CHAPTER MODAL -->
<Modal
	open={editChapterModalOpen}
	title="Edit Chapter Details"
	size="md"
	on:close={() => (editChapterModalOpen = false)}
>
	{#if chapter}
		<form class="flex flex-col gap-4" on:submit|preventDefault={updateChapter}>
			<TextField bind:value={editChapterTitle} label="Chapter Title (Source Language)" placeholder="e.g. 第1话" />

			<div class="block">
				<span class="mb-1 block text-xs font-semibold opacity-60">Target Title (Translated title) - Optional</span>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={editChapterTitleTarget}
						placeholder="e.g. Chapter 1: The Awakening (optional)"
						class="h-[38px] min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
					/>
					<Button
						variant="secondary"
						class="inline-flex h-[38px] max-h-[38px] min-h-[38px] w-[38px] min-w-[38px] max-w-[38px] shrink-0 items-center justify-center p-0"
						loading={translatingChapterTitle}
						disabled={translatingChapterTitle || !editChapterTitle.trim()}
						on:click={translateChapterTitle}
						title="Auto-translate chapter title"
						aria-label="Auto-translate chapter title"
					>
						{#if !translatingChapterTitle}
							<Languages size={15} />
						{/if}
					</Button>
				</div>
			</div>

			<div>
				<span class="mb-1 block text-xs font-semibold opacity-60">Chapter Sequence # (1-indexed)</span>
				<input
					type="number"
					min="1"
					bind:value={editChapterSeq}
					class="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition placeholder:opacity-40 focus:border-[#b23a2e] dark:border-white/10"
				/>
			</div>
		</form>
	{/if}

	<svelte:fragment slot="footer">
		<Button on:click={() => (editChapterModalOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={updatingChapter} loading={updatingChapter} on:click={updateChapter}>
			Save Changes
		</Button>
	</svelte:fragment>
</Modal>

<!-- DETAILED IMAGE UPLOAD PROGRESS MODAL -->
<Modal
	open={uploadModalOpen}
	title={uploadStage === 'done'
		? 'Upload Complete'
		: uploadStage === 'error'
			? 'Upload Error'
			: 'Uploading Chapter Pages'}
	size="md"
	closable={uploadStage === 'done' || uploadStage === 'error'}
	on:close={() => (uploadModalOpen = false)}
>
	<div class="flex flex-col gap-4">
		<!-- HERO STATUS CARD -->
		<div
			class="flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
		>
			<div
				class="shadow-xs flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white/10"
			>
				{#if uploadStage === 'uploading'}
					<Loader2 size={24} class="animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
				{:else if uploadStage === 'processing'}
					<Loader2 size={24} class="animate-spin text-amber-500" />
				{:else if uploadStage === 'done'}
					<CheckCircle2 size={24} class="text-emerald-500" />
				{:else}
					<AlertCircle size={24} class="text-red-500" />
				{/if}
			</div>

			<div class="min-w-0 flex-1">
				<h3 class="truncate text-sm font-bold tracking-tight sm:text-base">
					{#if uploadStage === 'uploading'}
						Uploading {uploadFilesList.length} image{uploadFilesList.length === 1 ? '' : 's'}...
					{:else if uploadStage === 'processing'}
						Processing & ingesting into chapter...
					{:else if uploadStage === 'done'}
						{@const doneCount =
							uploadAddedCount || uploadFilesList.filter((f) => f.status === 'done').length}
						{doneCount} page{doneCount === 1 ? '' : 's'} successfully uploaded!
					{:else}
						Upload Failed
					{/if}
				</h3>

				<p class="mt-0.5 truncate text-xs opacity-65">
					{#if uploadStage === 'uploading'}
						Transferring {formatBytes(uploadTotalBytes)} to chapter storage...
					{:else if uploadStage === 'processing'}
						Generating thumbnails and updating chapter sequence...
					{:else if uploadStage === 'done'}
						All pages are now ready for translation or reading.
					{:else}
						{uploadErrorMessage || 'An error occurred during file upload.'}
					{/if}
				</p>
			</div>
		</div>

		<!-- STATS BADGES -->
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<span class="rounded-lg bg-black/5 px-2.5 py-1 font-medium dark:bg-white/5">
				📁 <strong>{uploadFilesList.length}</strong>
				{uploadFilesList.length === 1 ? 'file' : 'files'}
			</span>
			<span class="rounded-lg bg-black/5 px-2.5 py-1 font-medium dark:bg-white/5">
				💾 <strong>{formatBytes(uploadTotalBytes)}</strong> total
			</span>
			{#if chapter}
				<span class="max-w-xs truncate rounded-lg bg-black/5 px-2.5 py-1 font-medium dark:bg-white/5">
					📖 <strong>Chapter {chapter.seq + 1}</strong>
				</span>
			{/if}
		</div>

		<!-- GLOBAL LINEAR PROGRESS BAR -->
		{#if uploadFilesList.length > 0}
			<div class="space-y-1.5">
				<div class="flex items-center justify-between text-[11px] font-medium">
					<span class="uppercase tracking-wider opacity-60">Overall Upload Progress</span>
					<span class="font-mono">{uploadGlobalPercent}%</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
					<!-- GLOBAL LINEAR PROGRESS WIDTH — DYNAMIC RUNTIME -->
					<div
						class="h-full rounded-full bg-[#b23a2e] transition-[width] duration-200 ease-out dark:bg-[#e08a63]"
						style="width: {uploadGlobalPercent}%"
					></div>
				</div>
			</div>
		{/if}

		<!-- SCROLLABLE FILE LIST PREVIEW -->
		{#if uploadFilesList.length > 0}
			<div class="mt-1">
				<div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-50">
					Queued Files ({uploadFilesList.length})
				</div>
				<div
					class="max-h-40 divide-y divide-black/[0.04] overflow-y-auto rounded-xl border border-black/[0.06] bg-black/[0.01] p-1.5 dark:divide-white/[0.04] dark:border-white/[0.06] dark:bg-white/[0.01]"
				>
					{#each uploadFilesList as item}
						{@const pct = item.total > 0 ? item.loaded / item.total : 0}
						{@const ringOffset = RING_CIRCUMFERENCE * (1 - pct)}
						{@const ringColor =
							item.status === 'done' ? '#4f7a64' : item.status === 'error' ? '#dc2626' : '#b23a2e'}
						<div class="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
							<div class="flex min-w-0 flex-1 items-center gap-2">
								<!-- PER-IMAGE CIRCULAR PROGRESS BADGE -->
								<div class="relative h-[22px] w-[22px] shrink-0">
									<svg viewBox="0 0 24 24" class="h-full w-full -rotate-90" aria-hidden="true">
										<circle
											cx="12"
											cy="12"
											r={RING_RADIUS}
											fill="none"
											stroke-width="2.5"
											class="opacity-20"
											stroke={item.status === 'done'
												? '#4f7a64'
												: item.status === 'error'
													? '#dc2626'
													: 'currentColor'}
										/>
										{#if item.status === 'uploading' || item.status === 'done'}
											<circle
												cx="12"
												cy="12"
												r={RING_RADIUS}
												fill="none"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke={ringColor}
												stroke-dasharray={RING_CIRCUMFERENCE}
												stroke-dashoffset={ringOffset}
											/>
										{/if}
									</svg>
									{#if item.status === 'done'}
										<!-- SUCCESS CHECK ICON — POP-IN SCALE TRANSITION -->
										<div
											class="absolute inset-0 flex items-center justify-center"
											in:scale={{ duration: 200, start: 0.2 }}
										>
											<Check
												size={12}
												stroke-width={3.2}
												class="text-[#4f7a64] dark:text-[#83b39a]"
											/>
										</div>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<span class="block truncate font-medium">{item.name}</span>
									<span class="block font-mono text-[10px] opacity-50">
										{item.status === 'done'
											? 'Uploaded'
											: item.status === 'error'
												? 'Failed'
												: item.status === 'uploading'
													? `${Math.round(pct * 100)}%`
													: 'Queued'}
									</span>
								</div>
							</div>
							<span class="shrink-0 font-mono text-[11px] opacity-60">{formatBytes(item.size)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		{#if uploadStage === 'done'}
			<Button variant="primary" on:click={() => (uploadModalOpen = false)}>Done</Button>
		{:else if uploadStage === 'error'}
			<Button variant="secondary" on:click={() => (uploadModalOpen = false)}>Close</Button>
		{:else}
			<div class="flex items-center gap-2 text-xs opacity-60">
				<Loader2 size={13} class="animate-spin" />
				<span>Please keep this window open while files upload...</span>
			</div>
		{/if}
	</svelte:fragment>
</Modal>

<!-- MULTI-CHAPTER DETECTED CONFIRMATION MODAL -->
<MultiChapterImportModal
	open={multiChapterModalOpen}
	chapters={detectedChapters}
	totalImages={detectedTotalImages}
	showFlattenOption={true}
	currentChapterSeq={chapter?.seq ?? 0}
	onImportChapters={() => executeMultiChapterImport(bookId ?? '', detectedChapters)}
	onFlattenCurrent={() => {
		multiChapterModalOpen = false;
		if (detectedFlatFiles.length > 0) {
			uploadFiles(detectedFlatFiles);
		}
	}}
	onClose={() => (multiChapterModalOpen = false)}
/>
