<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import { ConfirmDialog, Modal, TextField, Button } from '$lib/components/ui';
	import { settings } from '$lib/stores/settings';
	import { jobTracker } from '$lib/stores/job-tracker';
	import { readingHistory } from '$lib/stores/reading-history';
	import ChapterToolbar from '$lib/components/chapter/ChapterToolbar.svelte';
	import PipelineProgressTracker from '$lib/components/chapter/PipelineProgressTracker.svelte';
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
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Sparkles from 'lucide-svelte/icons/sparkles';
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
		status: 'pending' | 'processing' | 'done' | 'error';
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
	}

	let chapter: ChapterData | null = data.chapter;
	let prevChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = data.prevChapter;
	let nextChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = data.nextChapter;
	let pages: ChapterPageItem[] = data.pages;
	let loading = false;
	let uploading = false;
	let isDraggingOver = false;
	let reloadKey = Date.now();
	let pageVersions: Record<number, number> = {};

	$: {
		chapter = data.chapter;
		prevChapter = data.prevChapter;
		nextChapter = data.nextChapter;
		pages = data.pages;
		loading = false;
	}

	// MODALS & INSPECTOR
	let inspectPage: ChapterPageItem | null = null;
	let inspectModalOpen = false;
	let deletePageConfirmOpen = false;
	let pageToDelete: ChapterPageItem | null = null;
	let clearChapterConfirmOpen = false;
	let clearChapterPagesConfirmOpen = false;
	let resliceModalOpen = false;

	// DETAILED UPLOAD MODAL STATES
	interface UploadFileInfo {
		name: string;
		size: number;
	}
	let uploadModalOpen = false;
	let uploadStage: 'uploading' | 'processing' | 'done' | 'error' = 'uploading';
	let uploadProgressPercent = 0;
	let uploadLoadedBytes = 0;
	let uploadTotalBytes = 0;
	let uploadFilesList: UploadFileInfo[] = [];
	let uploadErrorMessage = '';
	let uploadAddedCount = 0;

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
		updatingChapter = true;
		try {
			const resp = await fetch(`/api/chapters/${chapterId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editChapterTitle.trim(),
					titleTarget: editChapterTitleTarget.trim() || null,
					seq: Math.max(0, editChapterSeq - 1),
				}),
			});
			if (!resp.ok) throw new Error('Update failed');
			const data = await resp.json();
			chapter = {
				...chapter,
				...data.chapter,
			};
			toast.success('Chapter updated.');
			editChapterModalOpen = false;
		} catch {
			toast.error('Could not update chapter.');
		} finally {
			updatingChapter = false;
		}
	}

	// DRAG & DROP REORDERING STATE
	let draggedPageIndex: number | null = null;
	let dragOverPageIndex: number | null = null;

	$: chapterId = Number($page.params.chapterId);
	$: bookId = $page.params.id;

	// ACTIVE TRANSLATION JOB STATE (SELF-HEALING & REACTIVE)
	$: currentJobState = $jobTracker.jobs[chapterId] || {
		chapterId,
		running: false,
		connectionState: 'idle',
		snapshot: null,
		lastError: null,
		reconnectAttempts: 0,
	};

	// REAL-TIME SYNCHRONIZED PAGES MERGED WITH SNAPSHOT
	$: displayPages = ((): ChapterPageItem[] => {
		if (!currentJobState.snapshot?.pages?.length) return pages;
		const snapshotPageMap = new Map<number, (typeof currentJobState.snapshot.pages)[0]>();
		for (const sp of currentJobState.snapshot.pages) {
			snapshotPageMap.set(sp.pageId, sp);
		}

		return pages.map((p) => {
			const sp = snapshotPageMap.get(p.id);
			if (!sp) return p;
			const isDone = sp.status === 'done';
			const isError = sp.status === 'error';
			const isProcessing = sp.status === 'processing' && currentJobState.running;
			const status: 'pending' | 'processing' | 'done' | 'error' = isDone ? 'done' : isError ? 'error' : isProcessing ? 'processing' : 'pending';

			return {
				...p,
				status,
				currentStep: isProcessing ? sp.currentStep : undefined,
				outputPath: sp.outputPath || p.outputPath,
				error: isError ? sp.errorMessage || p.error : null,
			};
		});
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
	$: if (browser && chapter && bookId) {
		readingHistory.recordReading(bookId, {
			id: chapter.id,
			seq: chapter.seq,
			title: chapter.title,
			titleTarget: chapter.titleTarget,
		});
	}

	onMount(() => {
		lastLoadedChapterId = chapterId;
		if (chapterId) {
			void jobTracker.syncChapter(chapterId);
		}
		if (chapter && bookId) {
			readingHistory.recordReading(bookId, {
				id: chapter.id,
				seq: chapter.seq,
				title: chapter.title,
				titleTarget: chapter.titleTarget,
			});
		}

		window.addEventListener('dragend', handleDragEnd);
		window.addEventListener('pointerup', handleDragEnd);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('dragend', handleDragEnd);
			window.removeEventListener('pointerup', handleDragEnd);
		}
	});

	// RELOAD CHAPTER DATA WHEN PROGRESS COMPLETES
	let lastRunning = false;
	$: {
		if (browser && lastRunning && !currentJobState.running) {
			void reload();
		}
		lastRunning = currentJobState.running;
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
			const shouldForce = force || !currentJobState.running;
			await jobTracker.startTranslation(chapterId, { force: shouldForce });
		} catch (e: any) {
			toast.error(e?.message || 'Translation failed to start.');
		}
	}

	async function cancelTranslation() {
		try {
			await jobTracker.cancelTranslation(chapterId);
			toast.info('Translation stopped.');
			await reload();
		} catch {
			toast.error('Failed to cancel translation.');
		}
	}

	async function cancelSinglePage(pg: ChapterPageItem) {
		try {
			await jobTracker.cancelPage(chapterId, pg.id);
			pg.status = 'pending';
			pg.error = null;
			pages = [...pages];
			toast.info(`Cancelled translation for Page ${pg.seq + 1}.`);
		} catch {
			toast.error(`Could not cancel translation for Page ${pg.seq + 1}.`);
		}
	}

	async function translateSinglePage(pg: ChapterPageItem) {
		try {
			if (pg.status === 'done') {
				const resetResp = await fetch(`/api/pages/${pg.id}/reset`, { method: 'POST' });
				if (!resetResp.ok) throw new Error('Reset failed');
				pg.status = 'pending';
				pg.outputPath = null;
			}
			pg.error = null;
			pages = [...pages];
			// If a job is already running, don't supersede it — pass force:false so
			// the backend attaches the new page(s) to the existing pipeline instead of
			// aborting it. Only force a fresh start when nothing is currently running.
			const shouldForce = !currentJobState.running;
			await jobTracker.startTranslation(chapterId, { force: shouldForce, pageIds: [pg.id] });
		} catch (e: any) {
			toast.error(e?.message || 'Failed to start single page translation.');
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
			pageVersions[pg.id] = Date.now();
			pageVersions = { ...pageVersions };
			jobTracker.clearJob(chapterId);
			toast.success(`Cleared progress on Page ${pg.seq + 1}.`);
			await reload();
		} catch {
			toast.error('Could not clear page progress.');
		}
	}

	async function confirmClearChapterProgress() {
		clearChapterConfirmOpen = false;
		try {
			const resp = await fetch(`/api/chapters/${chapterId}/reset`, { method: 'POST' });
			if (!resp.ok) throw new Error('Reset failed');
			const { reset } = await resp.json();
			jobTracker.clearJob(chapterId);
			toast.success(`Cleared progress on ${reset} page${reset === 1 ? '' : 's'}.`);
			await reload();
		} catch {
			toast.error('Could not clear chapter progress.');
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
			toast.success(`Cleared ${data.deletedCount} page${data.deletedCount === 1 ? '' : 's'} from chapter.`);
			await reload();
		} catch (e: any) {
			toast.error(e.message || 'Could not clear pages.');
		}
	}

	async function uploadFiles(files: FileList | File[]) {
		const fileArr = Array.from(files || []);
		if (fileArr.length === 0) return;

		uploadFilesList = fileArr.map((f) => ({ name: f.name, size: f.size }));
		uploadTotalBytes = fileArr.reduce((sum, f) => sum + f.size, 0);
		uploadLoadedBytes = 0;
		uploadProgressPercent = 0;
		uploadStage = 'uploading';
		uploadErrorMessage = '';
		uploadAddedCount = 0;
		uploadModalOpen = true;
		uploading = true;

		try {
			const form = new FormData();
			for (const file of fileArr) form.append('files', file);

			const result: { added?: number } = await new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open('POST', `/api/chapters/${chapterId}/pages`);
				xhr.upload.onprogress = (e) => {
					if (e.lengthComputable) {
						uploadLoadedBytes = e.loaded;
						uploadTotalBytes = e.total;
						uploadProgressPercent = Math.min(99, Math.round((e.loaded / e.total) * 100));
						if (e.loaded >= e.total) {
							uploadStage = 'processing';
						}
					}
				};
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						try {
							resolve(JSON.parse(xhr.responseText));
						} catch {
							resolve({ added: fileArr.length });
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

			uploadProgressPercent = 100;
			uploadLoadedBytes = uploadTotalBytes;
			uploadStage = 'done';
			uploadAddedCount = result.added ?? fileArr.length;
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
			pageVersions[pg.id] = Date.now();
			if (nextPg) pageVersions[nextPg.id] = Date.now();
			pageVersions = { ...pageVersions };
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

	function openInspector(pg: ChapterPageItem) {
		if (pg.status === 'processing') return;
		inspectPage = pg;
		inspectModalOpen = true;
	}

	// DRAG & DROP EVENT HANDLERS
	function handleDragStart(e: DragEvent, idx: number) {
		draggedPageIndex = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(idx));
			e.dataTransfer.setData('application/x-manua-page-id', String(pages[idx].id));
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

		const toastId = toast.loading(`Importing ${chaptersToImport.length} chapters... (0/${chaptersToImport.length})`);
		let completed = 0;

		try {
			for (let i = 0; i < chaptersToImport.length; i++) {
				const ch = chaptersToImport[i];
				toast.loading(`Importing ${ch.title || `Chapter ${i + 1}`} (${i + 1}/${chaptersToImport.length})...`, { id: toastId });

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
	<title>{chapter ? `${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`} — Xianscan` : 'Chapter Reader'}</title>
	<meta name="description" content={`Read and translate Chapter ${chapter ? chapter.seq + 1 : ''} with live typesetting and OCR.`} />
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
		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#b23a2e]/20 backdrop-blur-sm">
			<div class="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#b23a2e] bg-white/90 p-8 shadow-2xl dark:bg-[#1a1713]/90">
				<Upload size={36} class="text-[#b23a2e] dark:text-[#e08a63] animate-bounce" />
				<p class="text-sm font-bold">Drop page images or chapter folders</p>
			</div>
		</div>
	{/if}

	<!-- TOOLBAR -->
	<ChapterToolbar
		bookId={bookId ?? ''}
		{chapterId}
		chapterSeq={chapter?.seq ?? 0}
		chapterTitle={chapter?.title ?? null}
		chapterTitleTarget={chapter?.titleTarget ?? null}
		totalPages={pages.length}
		{prevChapter}
		{nextChapter}
		running={currentJobState.running}
		{uploading}
		{activeViewMode}
		{webtoonKind}
		{webtoonWidth}
		on:translate={() => startTranslation(false)}
		on:cancel={cancelTranslation}
		on:clearProgress={() => (clearChapterConfirmOpen = true)}
		on:clearAllPages={() => (clearChapterPagesConfirmOpen = true)}
		on:openReslice={() => (resliceModalOpen = true)}
		on:editChapter={openEditChapterModal}
		on:upload={(e) => uploadFiles(e.detail)}
		on:changeViewMode={(e) => settings.update((s) => ({ ...s, readerViewMode: e.detail }))}
		on:changeWebtoonKind={(e) => settings.update((s) => ({ ...s, webtoonKind: e.detail }))}
		on:changeWebtoonWidth={(e) => settings.update((s) => ({ ...s, webtoonWidth: e.detail }))}
	/>

	<!-- REAL-TIME TELEMETRY PROGRESS TRACKER -->
	<PipelineProgressTracker
		jobState={currentJobState}
		onCancel={cancelTranslation}
		onRetryPage={(pageId) => {
			const pg = pages.find((p) => p.id === pageId);
			if (pg) translateSinglePage(pg);
		}}
	/>

	<!-- MAIN CONTENT VIEWS -->
	{#if loading}
		<div class="flex flex-col items-center gap-2">
			{#each [1, 2] as _}
				<div class="h-96 w-full max-w-2xl animate-pulse rounded-xl border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"></div>
			{/each}
		</div>
	{:else if pages.length === 0}
		<div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 py-16 text-center dark:border-white/15">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]">
				<Upload size={24} />
			</div>
			<h2 class="mt-4 text-base font-semibold">No chapter pages uploaded yet</h2>
			<p class="mt-1 max-w-sm text-xs opacity-60">Drag and drop images or chapter folders here, or click 'Add Images' above.</p>
		</div>
	{:else if activeViewMode === 'reader'}
		<ViewModeWebtoon
			pages={displayPages}
			{webtoonKind}
			{webtoonWidth}
			{reloadKey}
			{pageVersions}
		/>
	{:else if activeViewMode === 'grid'}
		<ViewModeGrid
			pages={displayPages}
			running={currentJobState.running}
			{reloadKey}
			{pageVersions}
			{webtoonKind}
			{draggedPageIndex}
			{dragOverPageIndex}
			on:inspect={(e) => openInspector(e.detail)}
			on:menuAction={(e) => handleMenuAction(e.detail.action, e.detail.page)}
			on:dragStart={(e) => handleDragStart(e.detail.event, e.detail.index)}
			on:dragOver={(e) => handleDragOver(e.detail.event, e.detail.index)}
			on:drop={(e) => handleDrop(e.detail.event, e.detail.index)}
			on:dragEnd={handleDragEnd}
		/>
	{:else if activeViewMode === 'compare'}
		<ViewModeCompare
			pages={displayPages}
			running={currentJobState.running}
			{reloadKey}
			{pageVersions}
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
	{reloadKey}
	on:close={() => (inspectModalOpen = false)}
	on:update={(e) => {
		const updatedPg = e.detail.page;
		if (updatedPg) {
			const idx = pages.findIndex((p) => p.id === updatedPg.id);
			if (idx !== -1) {
				pages[idx] = { ...pages[idx], ...updatedPg };
				pages = [...pages];
			}
			pageVersions[updatedPg.id] = e.detail.reloadKey || Date.now();
			pageVersions = { ...pageVersions };
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
	variant="danger"
	on:confirm={confirmClearChapterProgress}
	on:cancel={() => (clearChapterConfirmOpen = false)}
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
<Modal open={editChapterModalOpen} title="Edit Chapter Details" size="md" on:close={() => (editChapterModalOpen = false)}>
	{#if chapter}
		<form class="flex flex-col gap-4" on:submit|preventDefault={updateChapter}>
			<TextField
				bind:value={editChapterTitle}
				label="Chapter Title (Source Language)"
				placeholder="e.g. 第1话"
			/>

			<div class="block">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs font-semibold opacity-60">Target Title (Translated title)</span>
					<button
						type="button"
						class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline disabled:opacity-40 dark:text-[#e08a63]"
						disabled={translatingChapterTitle || !editChapterTitle.trim()}
						on:click={translateChapterTitle}
					>
						<Languages size={12} />
						<span>{translatingChapterTitle ? 'Translating...' : 'Auto-Translate'}</span>
					</button>
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={editChapterTitleTarget}
						placeholder="e.g. Chapter 1: The Awakening"
						class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
					/>
					<Button
						variant="secondary"
						class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
						loading={translatingChapterTitle}
						disabled={translatingChapterTitle || !editChapterTitle.trim()}
						on:click={translateChapterTitle}
						title="Auto-translate chapter title"
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
	title={uploadStage === 'done' ? 'Upload Complete' : uploadStage === 'error' ? 'Upload Error' : 'Uploading Chapter Pages'}
	size="md"
	closable={uploadStage === 'done' || uploadStage === 'error'}
	on:close={() => (uploadModalOpen = false)}
>
	<div class="flex flex-col gap-4">
		<!-- HERO STATUS CARD -->
		<div class="flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
			<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs dark:bg-white/10">
				{#if uploadStage === 'uploading'}
					<Loader2 size={24} class="animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
				{:else if uploadStage === 'processing'}
					<Sparkles size={24} class="animate-pulse text-amber-500" />
				{:else if uploadStage === 'done'}
					<CheckCircle2 size={24} class="text-emerald-500" />
				{:else}
					<AlertCircle size={24} class="text-red-500" />
				{/if}
			</div>

			<div class="min-w-0 flex-1">
				<h3 class="font-bold text-sm sm:text-base tracking-tight truncate">
					{#if uploadStage === 'uploading'}
						Uploading {uploadFilesList.length} image{uploadFilesList.length === 1 ? '' : 's'}...
					{:else if uploadStage === 'processing'}
						Processing & ingesting into chapter...
					{:else if uploadStage === 'done'}
						{uploadAddedCount} page{uploadAddedCount === 1 ? '' : 's'} successfully uploaded!
					{:else}
						Upload Failed
					{/if}
				</h3>

				<p class="text-xs opacity-65 mt-0.5 truncate">
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
		<div class="flex items-center gap-2 text-xs flex-wrap">
			<span class="rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1 font-medium">
				📁 <strong>{uploadFilesList.length}</strong> {uploadFilesList.length === 1 ? 'file' : 'files'}
			</span>
			<span class="rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1 font-medium">
				💾 <strong>{formatBytes(uploadTotalBytes)}</strong> total
			</span>
			{#if chapter}
				<span class="rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1 font-medium truncate max-w-xs">
					📖 <strong>Chapter {chapter.seq + 1}</strong>
				</span>
			{/if}
		</div>

		<!-- SCROLLABLE FILE LIST PREVIEW -->
		{#if uploadFilesList.length > 0}
			<div class="mt-1">
				<div class="text-[11px] font-semibold uppercase tracking-wider opacity-50 mb-1.5">Queued Files ({uploadFilesList.length})</div>
				<div class="max-h-40 overflow-y-auto rounded-xl border border-black/[0.06] bg-black/[0.01] p-1.5 divide-y divide-black/[0.04] dark:border-white/[0.06] dark:bg-white/[0.01] dark:divide-white/[0.04]">
					{#each uploadFilesList as item}
						<div class="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
							<div class="flex items-center gap-2 min-w-0 flex-1">
								<FileImage size={14} class="opacity-50 shrink-0" />
								<span class="truncate font-medium">{item.name}</span>
							</div>
							<span class="font-mono text-[11px] opacity-60 shrink-0">{formatBytes(item.size)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		{#if uploadStage === 'done'}
			<Button variant="primary" on:click={() => (uploadModalOpen = false)}>
				Done
			</Button>
		{:else if uploadStage === 'error'}
			<Button variant="secondary" on:click={() => (uploadModalOpen = false)}>
				Close
			</Button>
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

