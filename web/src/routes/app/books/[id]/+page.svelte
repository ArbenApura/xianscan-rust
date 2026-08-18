<script lang="ts">
	// IMPORTED DEP-COMPONENTS
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button, TextField, Badge, Modal, ConfirmDialog, ActionMenu, LanguagePicker, Toggle, LazyImage, Checkbox } from '$lib/components/ui';
	import { ripple } from '$lib/actions/ripple';
	import { apiJson } from '$lib/api';
	import { validateForm } from '$lib/utils/form';
	import { updateBookSchema, createChapterSchema, updateChapterSchema } from '$lib/schemas';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER, CH_LAYOUT_COOKIE, setCookie } from '$lib/stores/settings';
	import { jobTracker } from '$lib/stores/job-tracker';
	import { batchTracker, batchProgress } from '$lib/stores/batch-tracker';
	import { cn } from '$lib/utils/cn';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED ICONS
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import FileX from 'lucide-svelte/icons/file-x';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Layers from 'lucide-svelte/icons/layers';
	import Pencil from 'lucide-svelte/icons/pencil';
	import ArrowUpDown from 'lucide-svelte/icons/arrow-up-down';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Check from 'lucide-svelte/icons/check';
	import X from 'lucide-svelte/icons/x';
	import Pin from 'lucide-svelte/icons/pin';
	import Play from 'lucide-svelte/icons/play';
	import Download from 'lucide-svelte/icons/download';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import List from 'lucide-svelte/icons/list';
	import AlignJustify from 'lucide-svelte/icons/align-justify';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Languages from 'lucide-svelte/icons/languages';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import CheckSquare from 'lucide-svelte/icons/check-square';
	import Square from 'lucide-svelte/icons/square';
	import RotateCw from 'lucide-svelte/icons/rotate-cw';
	import type { PageData } from './$types';

	export let data: PageData;

	// -- TYPES -- //

	interface Book {
		id: string;
		title: string;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
		pinned?: boolean;
		archived?: boolean;
	}

	interface Chapter {
		id: number;
		title: string;
		titleTarget?: string | null;
		seq: number;
		status: 'pending' | 'processing' | 'done' | 'error';
		pageCount: number;
		translatedPageCount: number;
		coverPageId?: number | null;
		coverHasOutput?: boolean;
		translatedAt?: number | null;
	}

	// -- STATES -- //

	let book: Book | null = data.book;
	let chapters: Chapter[] = data.chapters;
	let loading = false;
	let chapterTitle = '';
	let chapterTitleTarget = '';
	let creating = false;
	let searchQuery = '';
	let searchInputEl: HTMLInputElement;
	let createModalOpen = false;
	let sortAscending = true;
	let sortMenuOpen = false;
	let statusFilter: 'all' | 'done' | 'pending' | 'error' = 'all';

	$: {
		book = data.book;
		chapters = data.chapters;
	}

	// VIEW LAYOUT MODES: 'grid' (Comfortable Cards) | 'list' (Media List Rows) | 'compact' (Dense Table Rows)
	let viewLayout: 'grid' | 'list' | 'compact' = (data as any)?.preferences?.chapterLayout || 'grid';

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
			e.preventDefault();
			searchInputEl?.focus();
		}
	}

	// PERFORMANCE / WINDOWING STATES FOR THOUSANDS OF CHAPTERS
	let visibleLimit = 36;

	// EDIT BOOK STATES
	let editBookModalOpen = false;
	let editBookTitle = '';
	let editBookTitleTarget = '';
	let editBookSourceLang = '';
	let editBookTargetLang = '';
	let editBookPinned = false;
	let editBookArchived = false;
	let updatingBook = false;
	let translatingBookTitle = false;

	// EDIT CHAPTER STATES
	let editChapterModalOpen = false;
	let editingChapter: Chapter | null = null;
	let editChapterTitle = '';
	let editChapterTitleTarget = '';
	let editChapterSeq = 1;
	let updatingChapter = false;
	let translatingChapterTitle = false;
	let translatingNewChapterTitle = false;

	// DELETION STATES
	let chapterToDelete: Chapter | null = null;
	let deleteConfirmOpen = false;
	let deleting = false;

	let chapterToClearPages: Chapter | null = null;
	let clearPagesConfirmOpen = false;
	let clearingPages = false;

	// -- LIFECYCLES -- //

	onMount(() => {
		try {
			const saved = localStorage.getItem('xianscan:chapterViewLayout') || localStorage.getItem('manhua:chapterViewLayout');
			if (saved === 'grid' || saved === 'list' || saved === 'compact') {
				if (!data.preferences?.chapterLayout) {
					viewLayout = saved;
				}
				setCookie(CH_LAYOUT_COOKIE, viewLayout);
			}
		} catch {
			// ignore
		}
	});

	function setViewLayout(mode: 'grid' | 'list' | 'compact') {
		viewLayout = mode;
		setCookie(CH_LAYOUT_COOKIE, mode);
		try {
			localStorage.setItem('xianscan:chapterViewLayout', mode);
		} catch {
			// ignore
		}
	}

	// -- FUNCTIONS -- //

	async function reload() {
		try {
			await invalidateAll();
			const resp = await fetch(`/api/books/${$page.params.id}`);
			if (!resp.ok) throw new Error('not found');
			const data = await resp.json();
			book = data.book;
			chapters = data.chapters;
		} catch {
			toast.error('Could not load the book.');
		} finally {
			loading = false;
		}
	}

	function openEditBookModal() {
		if (!book) return;
		editBookTitle = book.title;
		editBookTitleTarget = book.titleTarget || '';
		editBookSourceLang = book.sourceLang;
		editBookTargetLang = book.targetLang;
		editBookPinned = !!book.pinned;
		editBookArchived = !!book.archived;
		editBookModalOpen = true;
	}

	async function updateBook() {
		if (!book) return;
		const payload = {
			title: editBookTitle.trim(),
			titleTarget: editBookTitleTarget.trim() || null,
			sourceLang: editBookSourceLang,
			targetLang: editBookTargetLang,
			pinned: editBookPinned,
			archived: editBookArchived,
		};
		const validation = validateForm(updateBookSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid book details.');
			return;
		}

		updatingBook = true;
		try {
			const resp = await fetch(`/api/books/${book.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!resp.ok) throw new Error('Update failed');
			const data = await resp.json();
			book = data.book;
			toast.success('Book details updated.');
			editBookModalOpen = false;
		} catch {
			toast.error('Could not update book details.');
		} finally {
			updatingBook = false;
		}
	}

	async function createChapter() {
		const payload = {
			title: chapterTitle.trim(),
		};
		const validation = validateForm(createChapterSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid chapter details.');
			return;
		}

		creating = true;
		try {
			const resp = await fetch(`/api/books/${$page.params.id}/chapters`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!resp.ok) throw new Error('create failed');
			const { id: chapterId } = await resp.json();
			toast.success('Chapter created.');
			chapterTitle = '';
			chapterTitleTarget = '';
			createModalOpen = false;
			goto(`/app/books/${$page.params.id}/chapters/${chapterId}/`);
		} catch {
			toast.error('Could not create the chapter.');
		} finally {
			creating = false;
		}
	}

	function openEditChapterModal(chapter: Chapter) {
		editingChapter = chapter;
		editChapterTitle = chapter.title;
		editChapterTitleTarget = chapter.titleTarget || '';
		editChapterSeq = chapter.seq + 1;
		editChapterModalOpen = true;
	}

	async function updateChapter() {
		if (!editingChapter) return;
		const payload = {
			title: editChapterTitle.trim(),
			titleTarget: editChapterTitleTarget.trim() || null,
			seq: Math.max(0, editChapterSeq - 1),
		};
		const validation = validateForm(updateChapterSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid chapter details.');
			return;
		}

		updatingChapter = true;
		try {
			const resp = await fetch(`/api/chapters/${editingChapter.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!resp.ok) throw new Error('Update failed');
			const data = await resp.json();
			const updated = data.chapter;
			chapters = chapters.map((c) =>
				c.id === updated.id ? { ...c, ...updated } : c,
			);
			toast.success('Chapter updated.');
			editChapterModalOpen = false;
			editingChapter = null;
		} catch {
			toast.error('Could not update chapter.');
		} finally {
			updatingChapter = false;
		}
	}

	async function translateBookTitle() {
		const src = editBookTitle.trim();
		if (!src) {
			toast.error('Enter a book title to translate.');
			return;
		}
		translatingBookTitle = true;
		try {
			const res = await apiJson<{ text: string }>('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: src,
					kind: 'title',
					sourceLang: editBookSourceLang,
					targetLang: editBookTargetLang,
					bookId: book?.id,
				}),
			});
			if (res.text) {
				editBookTitleTarget = res.text;
				toast.success('Title translated!');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Could not translate title.');
		} finally {
			translatingBookTitle = false;
		}
	}

	async function translateEditChapterTitle() {
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
					sourceLang: book?.sourceLang,
					targetLang: book?.targetLang,
					bookId: book?.id,
					chapterId: editingChapter?.id,
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

	async function translateNewChapterTitle() {
		const src = chapterTitle.trim();
		if (!src) {
			toast.error('Enter a chapter title to translate.');
			return;
		}
		translatingNewChapterTitle = true;
		try {
			const res = await apiJson<{ text: string }>('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: src,
					kind: 'chapter',
					sourceLang: book?.sourceLang,
					targetLang: book?.targetLang,
					bookId: book?.id,
				}),
			});
			if (res.text) {
				chapterTitleTarget = res.text;
				toast.success('Chapter title translated!');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Could not translate chapter title.');
		} finally {
			translatingNewChapterTitle = false;
		}
	}

	function promptDeleteChapter(chap: Chapter) {
		chapterToDelete = chap;
		deleteConfirmOpen = true;
	}

	async function confirmDeleteChapter() {
		if (!chapterToDelete) return;
		deleting = true;
		try {
			const resp = await fetch(`/api/chapters/${chapterToDelete.id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error('Delete failed');
			toast.success('Chapter deleted.');
			chapters = chapters.filter((c) => c.id !== chapterToDelete?.id);
		} catch {
			toast.error('Could not delete chapter.');
		} finally {
			deleting = false;
			deleteConfirmOpen = false;
			chapterToDelete = null;
		}
	}

	function promptClearPages(ch: Chapter) {
		chapterToClearPages = ch;
		clearPagesConfirmOpen = true;
	}

	async function confirmClearPages() {
		if (!chapterToClearPages) return;
		clearingPages = true;
		try {
			const resp = await fetch(`/api/chapters/${chapterToClearPages.id}/pages`, { method: 'DELETE' });
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to clear pages');
			}
			const data = await resp.json().catch(() => ({ deletedCount: 0 }));
			toast.success(`Cleared ${data.deletedCount} page${data.deletedCount === 1 ? '' : 's'} from chapter.`);
			clearPagesConfirmOpen = false;
			chapterToClearPages = null;
			await reload();
		} catch (e: any) {
			toast.error(e.message || 'Could not clear pages.');
		} finally {
			clearingPages = false;
		}
	}

	// CLEAR PROGRESS STATES
	let clearProgressConfirmOpen = false;
	let clearingProgress = false;

	async function confirmClearProgress() {
		if (!book) return;
		clearingProgress = true;
		const toastId = toast.loading('Clearing all translation progress...');
		try {
			const resp = await fetch(`/api/books/${book.id}/clear-progress`, {
				method: 'POST',
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to clear progress');
			}
			const res = await resp.json();
			toast.success(
				`Cleared translation progress for ${res.chaptersReset} chapter${res.chaptersReset === 1 ? '' : 's'} (${res.pagesReset} page${res.pagesReset === 1 ? '' : 's'}). All pages preserved.`,
				{ id: toastId },
			);
			clearProgressConfirmOpen = false;
			await reload();
		} catch (e: any) {
			toast.error(e.message || 'Could not clear progress.', { id: toastId });
		} finally {
			clearingProgress = false;
		}
	}

	// MULTI-SELECTION & BATCH TRANSLATION STATES
	let selectedChapterIds = new Set<number>();

	$: selectedChaptersList = chapters.filter((c) => selectedChapterIds.has(c.id));
	$: selectedPagesCount = selectedChaptersList.reduce((sum, c) => sum + (c.pageCount || 0), 0);
	$: pendingFilteredChapters = filteredChapters.filter(
		(c) => (c.pageCount || 0) > 0 && (c.status !== 'done' || (c.translatedPageCount || 0) < (c.pageCount || 0)),
	);
	$: allFilteredSelected =
		filteredChapters.length > 0 && filteredChapters.every((c) => selectedChapterIds.has(c.id));
	$: someFilteredSelected =
		filteredChapters.some((c) => selectedChapterIds.has(c.id)) && !allFilteredSelected;

	function toggleSelectChapter(id: number, e?: MouseEvent | KeyboardEvent) {
		if (e) e.stopPropagation();
		const next = new Set(selectedChapterIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedChapterIds = next;
	}

	function selectAllFiltered() {
		const next = new Set(selectedChapterIds);
		for (const ch of filteredChapters) {
			if (ch.pageCount > 0) next.add(ch.id);
		}
		selectedChapterIds = next;
	}

	function selectUntranslatedFiltered() {
		const next = new Set(selectedChapterIds);
		for (const ch of pendingFilteredChapters) {
			next.add(ch.id);
		}
		selectedChapterIds = next;
	}

	function clearSelection() {
		selectedChapterIds = new Set();
	}

	function toggleSelectAll() {
		if (allFilteredSelected) {
			const next = new Set(selectedChapterIds);
			for (const ch of filteredChapters) next.delete(ch.id);
			selectedChapterIds = next;
		} else {
			selectAllFiltered();
		}
	}

	$: isBatchActiveForOtherBook = Boolean(
		$batchTracker.active &&
		($batchTracker.status === 'running' || $batchTracker.status === 'paused') &&
		$batchTracker.bookId &&
		book?.id &&
		$batchTracker.bookId !== book.id
	);

	function startBatchFromSelected(force = false) {
		if (!book) return;
		if (isBatchActiveForOtherBook) {
			toast.warning(`Batch translation is currently active for "${$batchTracker.bookTitle || 'another book'}". Please finish or stop it before starting another.`);
			return;
		}
		const targetList = selectedChaptersList.length > 0 ? selectedChaptersList : pendingFilteredChapters;
		if (targetList.length === 0) {
			toast.info('No chapters with pages to translate.');
			return;
		}
		// Sort by sequence so batch executes chapters sequentially from first to last
		const sorted = [...targetList].sort((a, b) => a.seq - b.seq);
		batchTracker.startBatch(book.id, book.titleTarget || book.title, sorted, { force });
		clearSelection();
	}

	function startBatchAllPending() {
		if (!book) return;
		if (isBatchActiveForOtherBook) {
			toast.warning(`Batch translation is currently active for "${$batchTracker.bookTitle || 'another book'}". Please finish or stop it before starting another.`);
			return;
		}
		const pending = chapters
			.filter((c) => (c.pageCount || 0) > 0 && (c.status !== 'done' || (c.translatedPageCount || 0) < (c.pageCount || 0)))
			.sort((a, b) => a.seq - b.seq);

		if (pending.length === 0) {
			toast.info('All chapters with pages are already translated!');
			return;
		}
		batchTracker.startBatch(book.id, book.titleTarget || book.title, pending, { force: false });
	}

	function getChapterLiveProgress(ch: Chapter) {
		const currentBatchItem = $batchTracker.active
			? $batchTracker.queue.find((q) => q.id === ch.id)
			: null;

		if (currentBatchItem && currentBatchItem.status === 'reslicing') {
			return {
				isLive: true,
				running: true,
				phaseLabel: 'Smart Re-slicing...',
				currentPhase: 'reslicing',
				completedPages: 0,
				totalPages: ch.pageCount,
				percent: 0,
				isComplete: false,
			};
		}

		const jobState = $jobTracker.jobs[ch.id];
		const isJobRunning = Boolean(jobState?.running);
		const snap = jobState?.snapshot;

		if (isJobRunning && snap) {
			const total = snap.totalPages || snap.pages.length || ch.pageCount || 0;
			const done = snap.completedPages || 0;
			const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
			const phaseLabel =
				snap.currentPhase === 'phase1_analyze'
					? 'Detect & OCR...'
					: snap.currentPhase === 'phase2_extract'
						? 'Discovering Terms...'
						: snap.currentPhase === 'phase3_typeset'
							? 'Translating & Rendering...'
							: 'Translating...';

			return {
				isLive: true,
				running: true,
				phaseLabel,
				currentPhase: snap.currentPhase,
				completedPages: done,
				totalPages: total,
				percent,
				isComplete: false,
			};
		}

		const total = ch.pageCount || 0;
		const done = ch.translatedPageCount || 0;
		const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
		const isComplete = total > 0 && (ch.status === 'done' || done === total);

		return {
			isLive: false,
			running: ch.status === 'processing',
			phaseLabel: ch.status === 'processing' ? 'Processing...' : '',
			currentPhase: undefined,
			completedPages: done,
			totalPages: total,
			percent,
			isComplete,
		};
	}

	// Auto-reload chapter list when batch completed chapters change for this book
	let lastBatchCompleted = 0;
	$: if ($batchProgress.completedChapters !== lastBatchCompleted) {
		lastBatchCompleted = $batchProgress.completedChapters;
		if (typeof window !== 'undefined' && !loading && book && $batchTracker.bookId === book.id) {
			void reload();
		}
	}

	function loadMore() {
		visibleLimit += 36;
	}

	const statusVariant: Record<Chapter['status'], 'neutral' | 'amber' | 'jade' | 'cinnabar'> = {
		pending: 'neutral',
		processing: 'amber',
		done: 'jade',
		error: 'cinnabar',
	};

	$: filteredChapters = chapters
		.filter((c) => {
			if (statusFilter === 'done' && (c.status !== 'done' || (c.pageCount || 0) === 0)) return false;
			if (statusFilter === 'pending' && (c.status === 'done' && (c.pageCount || 0) > 0)) return false;
			if (statusFilter === 'error' && c.status !== 'error') return false;

			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return (
				(c.title || `Chapter ${c.seq + 1}`).toLowerCase().includes(q) ||
				(c.titleTarget && c.titleTarget.toLowerCase().includes(q)) ||
				c.status.toLowerCase().includes(q)
			);
		})
		.sort((a, b) => (sortAscending ? a.seq - b.seq : b.seq - a.seq));

	$: displayedChapters = filteredChapters.slice(0, visibleLimit);
	$: hasMore = visibleLimit < filteredChapters.length;

	$: totalPages = chapters.reduce((sum, c) => sum + (c.pageCount || 0), 0);
	$: translatedPages = chapters.reduce((sum, c) => sum + (c.translatedPageCount || 0), 0);
	$: translatedChapters = chapters.filter((c) => (c.pageCount || 0) > 0 && (c.status === 'done' || (c.translatedPageCount ?? 0) === c.pageCount)).length;
	$: overallProgress = totalPages > 0 ? Math.round((translatedPages / totalPages) * 100) : (chapters.length > 0 ? Math.round((translatedChapters / chapters.length) * 100) : 0);
	$: bookCoverPageId = chapters.find((c) => c.coverPageId)?.coverPageId ?? null;
	$: errorChapters = chapters.filter((c) => c.status === 'error').length;
	$: pendingChapters = chapters.filter((c) => (c.pageCount || 0) > 0 && (c.status !== 'done' || (c.translatedPageCount || 0) < (c.pageCount || 0))).length;
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];

</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<svelte:head>
	<title>{book ? `${book.titleTarget || book.title} — Xianscan` : 'Book Details'}</title>
</svelte:head>

<!-- BOOK DETAIL & CHAPTER MANAGEMENT -->
<div class="flex flex-col gap-6">
	<!-- BREADCRUMB NAVIGATION -->
	<nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-xs sm:text-sm">
		<a
			href="/app/"
			class="inline-flex items-center gap-1.5 rounded-lg py-1 px-2 font-medium opacity-65 transition hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
		>
			<ArrowLeft size={14} /> Library
		</a>
		<ChevronRight size={12} class="opacity-40" />
		<span class="font-medium truncate max-w-[200px] sm:max-w-xs">{book?.titleTarget || book?.title || 'Book Details'}</span>
	</nav>

	<!-- MAIN CONTENT CONTAINER -->
	{#if loading}
		<div class="space-y-4">
			<div class="h-44 animate-pulse rounded-2xl border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"></div>
			<div class="h-10 animate-pulse rounded-xl border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"></div>
		</div>
	{:else if !book}
		<div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 py-16 text-center dark:border-white/15">
			<FileX size={32} class="opacity-40" />
			<h2 class="mt-4 text-base font-semibold">Book not found</h2>
			<p class="mt-1 text-xs opacity-60">This book might have been deleted or does not exist.</p>
			<Button variant="secondary" size="sm" class="mt-4" on:click={() => goto('/app/')}>
				<ArrowLeft size={14} /> Back to Library
			</Button>
		</div>
	{:else}
		<!-- HERO CARD: METADATA, COVER ART, & ACTIONS -->
		<div class="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white/70 p-3.5 sm:p-6 backdrop-blur-md dark:border-white/[0.08] dark:bg-white/[0.02]">
			<div class="grid grid-cols-[auto_1fr] gap-x-3.5 sm:gap-x-6 gap-y-3 sm:gap-y-4 items-start">
				<!-- COVER THUMBNAIL (ROW 1 ON MOBILE; FULL-HEIGHT SIDEBAR ON WIDE) -->
				<div class="w-20 xs:w-24 sm:w-32 md:w-36 shrink-0 sm:row-span-3">
					<LazyImage
						src={bookCoverPageId ? `/api/pages/${bookCoverPageId}/file?kind=thumb&w=320` : ''}
						alt={book.titleTarget || book.title}
						aspectRatio="aspect-[2/3]"
						class="shadow-md rounded-xl"
					/>
				</div>

				<!-- METADATA & STATS (ROW 1, COL 2) -->
				<div class="min-w-0 flex flex-col justify-start">
					<div class="space-y-1.5 sm:space-y-2">
						<div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
							<Badge variant="neutral" class="font-mono text-[10px] sm:text-xs">
								{book.sourceLang} → {book.targetLang}
							</Badge>
							{#if book.pinned}
								<Badge variant="cinnabar" class="gap-1 text-[10px] sm:text-xs">
									<Pin size={10} class="rotate-45" /> Pinned
								</Badge>
							{/if}
							{#if book.archived}
								<Badge variant="neutral" class="text-[10px] sm:text-xs">Archived</Badge>
							{/if}
						</div>

						<h1 class="text-base sm:text-2xl font-bold tracking-tight leading-snug sm:leading-normal line-clamp-2">
							{book.titleTarget || book.title}
						</h1>
						{#if book.titleTarget && book.titleTarget !== book.title}
							<p class="text-[11px] sm:text-sm opacity-60 font-mono truncate">
								Original: {book.title}
							</p>
						{/if}

						<div class="flex items-center gap-2 sm:gap-4 text-[11px] sm:text-xs opacity-70 flex-wrap pt-0.5">
							<span><strong>{chapters.length}</strong> chs</span>
							<span>•</span>
							<span><strong>{totalPages}</strong> pgs</span>
							<span>•</span>
							<span><strong>{translatedChapters}</strong> done</span>
						</div>
					</div>
				</div>

				<!-- PROGRESS BAR (FULL-WIDTH ON MOBILE; ROW 2 COL 2 ON WIDE) -->
				{#if totalPages > 0 || chapters.length > 0}
					<div class="col-span-2 sm:col-span-1 sm:col-start-2 space-y-1 sm:space-y-1.5 max-w-md">
						<div class="flex items-center justify-between text-[11px] sm:text-xs font-medium">
							<span class="opacity-70">Translation Progress</span>
							<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">{overallProgress}%</span>
						</div>
						<div class="h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
							<div
								class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] transition-all duration-500"
								style={`width: ${overallProgress}%`}
							></div>
						</div>
					</div>
				{/if}

				<!-- ACTION BUTTONS ROW (FULL-WIDTH ON MOBILE; ROW 3 COL 2 ON WIDE) -->
				<div class="col-span-2 sm:col-span-1 sm:col-start-2 flex items-center gap-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04] sm:border-t-0 sm:pt-0 flex-wrap">
					<Button
						variant="primary"
						size="md"
						class="flex-1 sm:flex-initial h-9 sm:h-10 px-3.5 sm:px-4 text-xs sm:text-sm font-semibold shadow-sm"
						on:click={() => (createModalOpen = true)}
					>
						<Plus size={15} /> <span>New Chapter</span>
					</Button>

					{#if pendingChapters > 0}
						<Button
							variant="secondary"
							size="md"
							class={`h-9 sm:h-10 px-3 sm:px-3.5 text-xs sm:text-sm font-semibold border-[#b23a2e]/30 bg-[#b23a2e]/10 text-[#b23a2e] hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black transition-all shadow-xs ${
								isBatchActiveForOtherBook ? 'opacity-80' : ''
							}`}
							on:click={startBatchAllPending}
							title={isBatchActiveForOtherBook
								? `Batch translation is currently running for "${$batchTracker.bookTitle || 'another book'}"`
								: `Translate all ${pendingChapters} pending chapters sequentially`}
						>
							<Sparkles size={14} class="text-amber-500" />
							<span>Translate Pending ({pendingChapters})</span>
						</Button>
					{/if}

					<Button
						variant="secondary"
						size="md"
						class="h-9 sm:h-10 px-3 sm:px-3.5 text-xs sm:text-sm font-medium"
						on:click={openEditBookModal}
					>
						<Pencil size={14} /> <span>Edit</span>
					</Button>
					<Button
						variant="secondary"
						size="md"
						class="h-9 sm:h-10 px-3 sm:px-3.5 text-xs sm:text-sm font-medium"
						on:click={() => goto(`/app/glossary/?scope=book&bookId=${book?.id}`)}
					>
						<BookOpen size={14} /> <span>Glossary</span>
					</Button>

					{#if chapters.length > 0}
						<Button
							variant="secondary"
							size="md"
							loading={clearingProgress}
							disabled={clearingProgress}
							class="h-9 sm:h-10 px-3 sm:px-3.5 text-xs sm:text-sm font-medium border-red-500/30 bg-red-500/5 text-red-600 hover:bg-red-500 hover:text-white dark:text-red-400 dark:border-red-400/30 dark:bg-red-400/5 dark:hover:bg-red-500 dark:hover:text-white transition-all shadow-xs"
							on:click={() => (clearProgressConfirmOpen = true)}
							title="Clear all translations and OCR progress while keeping all pages intact"
						>
							{#if !clearingProgress}
								<RotateCw size={14} />
							{/if}
							<span>{clearingProgress ? 'Clearing...' : 'Clear Progress'}</span>
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- UNIFIED ADAPTIVE COMMAND BAR -->
		<div class="flex flex-col gap-2.5">
			<!-- COMMAND BAR CONTAINER -->
			<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
				<!-- CONTROLS ROW (ON MOBILE: PLACED TOP FOR QUICK REACH; ON DESKTOP: SITS ON THE RIGHT) -->
				<div class="order-1 md:order-2 flex items-center gap-2 flex-wrap">
					<!-- SEARCH INPUT -->
					<div class="relative flex-1 sm:w-56 md:w-60 lg:w-72">
						<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
						<input
							bind:this={searchInputEl}
							bind:value={searchQuery}
							type="text"
							placeholder="Search chapters..."
							class="h-10 w-full rounded-xl border border-black/10 bg-white/50 py-2 pl-9 pr-8 text-xs sm:text-sm outline-none transition placeholder:text-black/40 dark:placeholder:text-white/40 focus:border-[#b23a2e] focus:bg-white focus:ring-2 focus:ring-[#b23a2e]/10 dark:border-white/10 dark:bg-white/[0.03] dark:focus:bg-[#1a1714] dark:focus:border-[#e08a63] dark:focus:ring-[#e08a63]/15"
						/>
						{#if searchQuery}
							<button
								type="button"
								on:click={() => {
									searchQuery = '';
									searchInputEl?.focus();
								}}
								class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white transition"
								title="Clear search"
								aria-label="Clear search"
							>
								<X size={14} />
							</button>
						{:else}
							<kbd class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:inline-flex h-4.5 select-none items-center rounded border border-black/10 bg-black/[0.04] px-1 font-mono text-[9px] font-medium opacity-40 dark:border-white/15 dark:bg-white/[0.06]">
								/
							</kbd>
						{/if}
					</div>

					<!-- SORT DROPDOWN -->
					<div class="relative shrink-0">
						<button
							type="button"
							on:click={() => (sortMenuOpen = !sortMenuOpen)}
							class="inline-flex h-10 items-center gap-1.5 rounded-xl border border-black/10 bg-white/50 px-3 sm:px-3.5 text-xs sm:text-sm font-medium backdrop-blur transition hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/5"
							title="Sort chapters"
							aria-label="Sort chapters"
							aria-expanded={sortMenuOpen}
							use:ripple
						>
							<ArrowUpDown size={14} class="opacity-60" />
							<span class="hidden xs:inline sm:inline">{sortAscending ? 'Oldest (1 → N)' : 'Newest First'}</span>
							<ChevronDown size={12} class={`opacity-40 transition-transform duration-200 ${sortMenuOpen ? 'rotate-180' : ''}`} />
						</button>

						{#if sortMenuOpen}
							<!-- BACKDROP -->
							<button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0" on:click={() => (sortMenuOpen = false)} aria-label="Close sort menu" tabindex="-1"></button>
							<div
								transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
								class={cn('absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border p-1.5 shadow-xl', popover, popoverBorder)}
							>
								<div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-40">Sort Chapters By</div>
								<button
									type="button"
									class={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
										sortAscending
											? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-semibold'
											: 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
									}`}
									on:click={() => {
										sortAscending = true;
										sortMenuOpen = false;
									}}
								>
									<span>Oldest First (1 → N)</span>
									{#if sortAscending}
										<Check size={13} />
									{/if}
								</button>
								<button
									type="button"
									class={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
										!sortAscending
											? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-semibold'
											: 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
									}`}
									on:click={() => {
										sortAscending = false;
										sortMenuOpen = false;
									}}
								>
									<span>Newest First (N → 1)</span>
									{#if !sortAscending}
										<Check size={13} />
									{/if}
								</button>
							</div>
						{/if}
					</div>

					<!-- VIEW SWITCHER SEGMENTED TABS -->
					<div class="flex items-center gap-0.5 rounded-xl border border-black/10 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.03] shrink-0 h-10">
						<button
							type="button"
							on:click={() => setViewLayout('grid')}
							class={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs transition-all ${
								viewLayout === 'grid'
									? 'bg-white text-black font-bold shadow-xs dark:bg-[#221e1a] dark:text-white'
									: 'opacity-50 hover:opacity-100'
							}`}
							title="Comfortable Cards Grid"
							aria-label="Grid View"
							use:ripple
						>
							<LayoutGrid size={14} />
							<span class="hidden lg:inline text-xs">Grid</span>
						</button>

						<button
							type="button"
							on:click={() => setViewLayout('list')}
							class={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs transition-all ${
								viewLayout === 'list'
									? 'bg-white text-black font-bold shadow-xs dark:bg-[#221e1a] dark:text-white'
									: 'opacity-50 hover:opacity-100'
							}`}
							title="Media List Rows"
							aria-label="List View"
							use:ripple
						>
							<List size={14} />
							<span class="hidden lg:inline text-xs">List</span>
						</button>

						<button
							type="button"
							on:click={() => setViewLayout('compact')}
							class={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs transition-all ${
								viewLayout === 'compact'
									? 'bg-white text-black font-bold shadow-xs dark:bg-[#221e1a] dark:text-white'
									: 'opacity-50 hover:opacity-100'
							}`}
							title="Compact Rows"
							aria-label="Compact View"
							use:ripple
						>
							<AlignJustify size={14} />
							<span class="hidden lg:inline text-xs">Compact</span>
						</button>
					</div>
				</div>

				<!-- FILTER TABS (DESKTOP: SITS ON LEFT; MOBILE: SMOOTH SCROLLABLE RAIL) -->
				<div class="order-2 md:order-1 flex items-center gap-1.5 flex-wrap">
					<div class="flex items-center gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.04] overflow-x-auto no-scrollbar max-w-full">
						<button
							type="button"
							on:click={() => (statusFilter = 'all')}
							class={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 sm:px-3.5 py-2 text-xs font-medium transition-all ${
								statusFilter === 'all'
									? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
									: 'opacity-60 hover:opacity-100'
							}`}
							use:ripple
						>
							<span>All</span>
							<span class="rounded-full bg-black/5 px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{chapters.length}</span>
						</button>

						<button
							type="button"
							on:click={() => (statusFilter = 'done')}
							class={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 sm:px-3.5 py-2 text-xs font-medium transition-all ${
								statusFilter === 'done'
									? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
									: 'opacity-60 hover:opacity-100'
							}`}
							use:ripple
						>
							<span>Translated</span>
							<span class="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-mono">{translatedChapters}</span>
						</button>

						<button
							type="button"
							on:click={() => (statusFilter = 'pending')}
							class={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 sm:px-3.5 py-2 text-xs font-medium transition-all ${
								statusFilter === 'pending'
									? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
									: 'opacity-60 hover:opacity-100'
							}`}
							use:ripple
						>
							<span>Pending</span>
							<span class="rounded-full bg-black/5 px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{pendingChapters}</span>
						</button>

						{#if errorChapters > 0}
							<button
								type="button"
								on:click={() => (statusFilter = 'error')}
								class={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 sm:px-3.5 py-2 text-xs font-medium transition-all ${
									statusFilter === 'error'
										? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
										: 'opacity-60 hover:opacity-100'
								}`}
								use:ripple
							>
								<span>Error</span>
								<span class="rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-1.5 py-0.2 text-[10px] font-mono">{errorChapters}</span>
							</button>
						{/if}
					</div>

					<!-- QUICK SELECTION CONTROLS -->
					{#if filteredChapters.length > 0}
						<div class="flex items-center gap-1">
							<button
								type="button"
								on:click={toggleSelectAll}
								class="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white/50 px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/5"
								title={allFilteredSelected ? 'Deselect all visible chapters' : 'Select all visible chapters'}
								use:ripple
							>
								{#if allFilteredSelected}
									<CheckSquare size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
								{:else}
									<Square size={13} class="opacity-60" />
								{/if}
								<span>{allFilteredSelected ? 'Deselect All' : 'Select All'}</span>
							</button>

							{#if pendingFilteredChapters.length > 0 && pendingFilteredChapters.length !== filteredChapters.length}
								<button
									type="button"
									on:click={selectUntranslatedFiltered}
									class="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white/50 px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/5"
									title="Select only chapters that are not fully translated"
									use:ripple
								>
									<Sparkles size={12} class="opacity-60" />
									<span>Untranslated ({pendingFilteredChapters.length})</span>
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- CHAPTER LISTINGS -->
		{#if chapters.length === 0}
			<div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 py-16 text-center dark:border-white/15">
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]">
					<Layers size={24} />
				</div>
				<h2 class="mt-4 text-base font-semibold">No chapters yet</h2>
				<p class="mt-1 max-w-sm text-xs opacity-60">Create your first chapter to start uploading page images for text detection & translation.</p>
				<Button variant="primary" size="sm" class="mt-4" on:click={() => (createModalOpen = true)}>
					<Plus size={14} /> Create Chapter
				</Button>
			</div>
		{:else if filteredChapters.length === 0}
			<p class="py-8 text-center text-sm opacity-60">No chapters found matching "{searchQuery}".</p>
		{:else if viewLayout === 'grid'}
			<!-- MODE 1: COMFORTABLE 2-COLUMN CARDS GRID -->
			<ul class="grid w-full gap-3.5 sm:gap-5 grid-cols-1 sm:grid-cols-2">
				{#each displayedChapters as chapter (chapter.id)}
					{@const liveProg = getChapterLiveProgress(chapter)}
					{@const isSelected = selectedChapterIds.has(chapter.id)}
					<li
						id={`chapter-card-${chapter.id}`}
						data-chapter-seq={chapter.seq + 1}
						class={`group relative flex flex-col justify-between rounded-2xl border bg-white/60 p-3.5 sm:p-4 transition-all duration-300 dark:bg-white/[0.02] ${
							isSelected
								? 'border-[#b23a2e] ring-2 ring-[#b23a2e]/30 shadow-md'
								: 'border-black/[0.08] hover:border-[#b23a2e]/40 hover:shadow-xl dark:border-white/[0.06]'
						}`}
					>
						<!-- UPPER SECTION: MINI PAGE THUMBNAIL + CHAPTER INFO -->
						<div class="flex gap-3 sm:gap-3.5 items-start">
							<!-- 2:3 VERTICAL CHAPTER COVER THUMBNAIL WITH CHECKBOX OVERLAY -->
							<div class="relative w-20 sm:w-24 shrink-0">
								<a
									href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
									class="group/cover block transition-transform duration-300 hover:scale-102"
									title={`Open ${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}`}
								>
									<LazyImage
										src={chapter.coverPageId ? `/api/pages/${chapter.coverPageId}/file?kind=thumb&w=260` : ''}
										alt={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
										fallbackText={`Ch.${chapter.seq + 1}`}
										aspectRatio="aspect-[2/3]"
										showSpineShadow={true}
									/>
								</a>

								<!-- CARD CHECKBOX TOGGLE -->
								<button
									type="button"
									on:click={(e) => toggleSelectChapter(chapter.id, e)}
									class={`absolute top-1 left-1 z-10 flex h-6 w-6 items-center justify-center rounded-md backdrop-blur shadow-sm transition-all ${
										isSelected
											? 'bg-[#b23a2e] text-white ring-1 ring-white/30'
											: 'bg-black/40 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-black/60'
									}`}
									title={isSelected ? 'Deselect chapter' : 'Select chapter for batch actions'}
									aria-label="Select chapter"
								>
									{#if isSelected}
										<Check size={13} />
									{:else}
										<Square size={13} />
									{/if}
								</button>
							</div>

							<!-- CHAPTER DETAILS -->
							<div class="min-w-0 flex-1 flex flex-col justify-between self-stretch">
								<div>
									<div class="flex items-start justify-between gap-1.5">
										<div class="min-w-0 flex-1">
											<a
												href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
												class="font-bold text-sm sm:text-base tracking-tight hover:text-[#b23a2e] dark:hover:text-[#e08a63] block truncate px-0.5"
												title={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
											>
												{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
											</a>
											{#if chapter.titleTarget && chapter.title && chapter.titleTarget !== chapter.title}
												<p class="text-[11px] sm:text-xs opacity-60 font-medium truncate mt-0.5 px-0.5" title={chapter.title}>
													{chapter.title}
												</p>
											{/if}
										</div>

										<div class="shrink-0">
											<ActionMenu
												items={[
													{ value: 'open', label: 'Open Reader', icon: ExternalLink },
													{ value: 'translate', label: 'Translate Chapter', icon: Play },
													{ value: 'edit', label: 'Edit Chapter Details', icon: Pencil },
													...(chapter.pageCount > 0 ? [{ value: 'clearPages', label: 'Clear Pages', icon: FileX, danger: true }] : []),
													{ value: 'delete', label: 'Delete Chapter', icon: Trash2, danger: true },
												]}
												on:select={(e) => {
													if (e.detail === 'open') goto(`/app/books/${$page.params.id}/chapters/${chapter.id}/`);
													else if (e.detail === 'translate') batchTracker.startBatch(book?.id || '', book?.titleTarget || book?.title || '', [chapter]);
													else if (e.detail === 'edit') openEditChapterModal(chapter);
													else if (e.detail === 'clearPages') promptClearPages(chapter);
													else if (e.detail === 'delete') promptDeleteChapter(chapter);
												}}
											/>
										</div>
									</div>

									<!-- STATUS & PAGE BADGES -->
									<div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
										{#if liveProg.running}
											<span class="inline-flex items-center gap-1 rounded-md bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] px-2 py-0.5 font-bold animate-pulse">
												<Sparkles size={11} class="animate-spin" />
												<span>{liveProg.phaseLabel}</span>
											</span>
										{:else}
											<Badge variant={statusVariant[chapter.status]}>
												{chapter.status.toUpperCase()}
											</Badge>
										{/if}
										<span class="rounded-md bg-black/5 dark:bg-white/5 px-2 py-0.5 font-medium opacity-70">
											{chapter.pageCount} {chapter.pageCount === 1 ? 'page' : 'pages'}
										</span>
									</div>
								</div>

								<!-- CHAPTER PAGE PROGRESS BAR -->
								<div class="mt-2 sm:mt-2.5">
									<div class="flex items-center justify-between text-[10px] sm:text-[11px] mb-1">
										<span class="opacity-70 text-[10px] font-medium truncate">
											{#if liveProg.running}
												<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">
													Translating: {liveProg.completedPages}/{liveProg.totalPages} pgs ({liveProg.percent}%)
												</span>
											{:else if liveProg.isComplete}
												<span class="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Translated</span>
											{:else}
												{chapter.translatedPageCount || 0}/{chapter.pageCount} pgs ({liveProg.percent}%)
											{/if}
										</span>
										<span class="opacity-40 text-[9px] sm:text-[10px] font-mono shrink-0 ml-1">#{chapter.seq + 1}</span>
									</div>
									<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
										<div
											class={`h-full rounded-full transition-all duration-300 ${
												liveProg.isComplete
													? 'bg-emerald-600 dark:bg-emerald-400'
													: 'bg-[#b23a2e] dark:bg-[#e08a63]'
											}`}
											style={`width: ${liveProg.percent}%`}
										></div>
									</div>
								</div>
							</div>
						</div>

						<!-- LOWER SECTION: ACTION FOOTER BAR -->
						<div class="mt-3 sm:mt-3.5 flex items-center justify-between border-t border-black/[0.05] pt-2.5 sm:pt-3 text-xs dark:border-white/[0.05]">
							<a
								href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
								class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#b23a2e]/10 px-3.5 py-1.5 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black"
								use:ripple
							>
								<Play size={12} class="fill-current" />
								<span>Open Reader</span>
							</a>

							<div class="flex items-center gap-2">
								{#if chapter.pageCount > 0 && !liveProg.isComplete && !liveProg.running}
									<button
										type="button"
										on:click={() => batchTracker.startBatch(book?.id || '', book?.titleTarget || book?.title || '', [chapter])}
										class="inline-flex items-center gap-1 text-[11px] font-medium opacity-70 hover:opacity-100 hover:text-[#b23a2e] transition"
										title="Translate this chapter"
									>
										<Sparkles size={12} />
										<span>Translate</span>
									</button>
								{/if}

								{#if chapter.pageCount > 0}
									<a
										href={`/api/chapters/${chapter.id}/download`}
										class="inline-flex items-center gap-1 opacity-60 hover:opacity-100 transition hover:text-[#b23a2e]"
										download
										title="Export Chapter ZIP"
									>
										<Download size={13} />
										<span class="text-[11px]">ZIP</span>
									</a>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else if viewLayout === 'list'}
			<!-- MODE 2: MEDIA LIST STRIP (RESPONSIVE ROWS) -->
			<ul class="flex flex-col gap-2.5 w-full">
				{#each displayedChapters as chapter (chapter.id)}
					{@const liveProg = getChapterLiveProgress(chapter)}
					{@const isSelected = selectedChapterIds.has(chapter.id)}
					<li
						id={`chapter-card-${chapter.id}`}
						data-chapter-seq={chapter.seq + 1}
						class={`group relative flex items-center justify-between gap-3 sm:gap-4 rounded-xl border bg-white/60 p-2.5 sm:p-3 transition-all dark:bg-white/[0.02] ${
							isSelected
								? 'border-[#b23a2e] ring-2 ring-[#b23a2e]/30 shadow-md'
								: 'border-black/[0.07] hover:border-[#b23a2e]/40 hover:bg-white hover:shadow-md dark:border-white/[0.06] dark:hover:bg-white/[0.04]'
						}`}
					>
						<div class="flex items-center gap-3 min-w-0 flex-1">
							<!-- ROW CHECKBOX -->
							<button
								type="button"
								on:click={(e) => toggleSelectChapter(chapter.id, e)}
								class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all ${
									isSelected
										? 'bg-[#b23a2e] border-[#b23a2e] text-white'
										: 'border-black/20 bg-transparent text-transparent hover:border-black/40 dark:border-white/20'
								}`}
								title={isSelected ? 'Deselect chapter' : 'Select chapter'}
								aria-label="Select chapter"
							>
								<Check size={13} />
							</button>

							<!-- MINI THUMBNAIL -->
							<a
								href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
								class="w-10 sm:w-12 shrink-0 transition-transform duration-200 group-hover:scale-105"
								title={`Open ${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}`}
							>
								<LazyImage
									src={chapter.coverPageId ? `/api/pages/${chapter.coverPageId}/file?kind=thumb&w=140` : ''}
									alt={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
									fallbackText={`#${chapter.seq + 1}`}
									aspectRatio="aspect-[2/3]"
									showSpineShadow={false}
									class="rounded-lg shadow-2xs"
								/>
							</a>

							<!-- TITLE & METADATA -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5 min-w-0">
									<span class="rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.2 font-mono text-[9px] sm:text-[10px] font-bold opacity-60 shrink-0">
										#{chapter.seq + 1}
									</span>
									<a
										href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
										class="font-bold text-xs sm:text-sm hover:text-[#b23a2e] dark:hover:text-[#e08a63] truncate block px-0.5"
										title={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
									>
										{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
									</a>
									{#if chapter.titleTarget && chapter.title && chapter.titleTarget !== chapter.title}
										<span class="text-xs opacity-50 font-medium truncate hidden md:inline px-0.5" title={chapter.title}>
											({chapter.title})
										</span>
									{/if}
								</div>

								<div class="mt-1 flex items-center gap-2 text-[10px] sm:text-xs opacity-65 flex-wrap">
									<span>{chapter.pageCount} pgs</span>
									<span>•</span>
									{#if liveProg.running}
										<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold flex items-center gap-1 animate-pulse">
											<Sparkles size={11} class="animate-spin" />
											<span>{liveProg.phaseLabel} ({liveProg.completedPages}/{liveProg.totalPages})</span>
										</span>
									{:else}
										<span class={liveProg.isComplete ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
											{liveProg.isComplete ? '100% Translated' : `${chapter.translatedPageCount || 0}/${chapter.pageCount} translated`}
										</span>
									{/if}
								</div>
							</div>
						</div>

						<div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
							<Badge variant={statusVariant[chapter.status]} class="hidden sm:inline-flex">
								{chapter.status.toUpperCase()}
							</Badge>

							<a
								href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
								class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#b23a2e]/10 px-3 py-1.5 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black"
								use:ripple
							>
								<Play size={11} class="fill-current" />
								<span>Read</span>
							</a>

							{#if chapter.pageCount > 0}
								<a
									href={`/api/chapters/${chapter.id}/download`}
									class="hidden sm:inline-flex items-center justify-center p-1.5 opacity-60 hover:opacity-100 hover:text-[#b23a2e]"
									download
									title="Download ZIP"
								>
									<Download size={14} />
								</a>
							{/if}

							<ActionMenu
								items={[
									{ value: 'open', label: 'Open Reader', icon: ExternalLink },
									{ value: 'translate', label: 'Translate Chapter', icon: Play },
									{ value: 'edit', label: 'Edit Chapter Details', icon: Pencil },
									...(chapter.pageCount > 0 ? [{ value: 'clearPages', label: 'Clear Pages', icon: FileX, danger: true }] : []),
									{ value: 'delete', label: 'Delete Chapter', icon: Trash2, danger: true },
								]}
								on:select={(e) => {
									if (e.detail === 'open') goto(`/app/books/${$page.params.id}/chapters/${chapter.id}/`);
									else if (e.detail === 'translate') batchTracker.startBatch(book?.id || '', book?.titleTarget || book?.title || '', [chapter]);
									else if (e.detail === 'edit') openEditChapterModal(chapter);
									else if (e.detail === 'clearPages') promptClearPages(chapter);
									else if (e.detail === 'delete') promptDeleteChapter(chapter);
								}}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<!-- MODE 3: COMPACT ROWS (MOBILE NATIVE STREAM + DESKTOP TABLE) -->
			<!-- MOBILE-NATIVE COMPACT STREAM (< 640px) -->
			<div class="sm:hidden flex flex-col divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/60 dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-white/[0.02]">
				{#each displayedChapters as chapter (chapter.id)}
					{@const liveProg = getChapterLiveProgress(chapter)}
					{@const isSelected = selectedChapterIds.has(chapter.id)}
					<div class={`flex items-center justify-between gap-2.5 p-2.5 transition ${isSelected ? 'bg-[#b23a2e]/5' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}`}>
						<div class="flex items-center gap-2 min-w-0 flex-1">
							<button
								type="button"
								on:click={(e) => toggleSelectChapter(chapter.id, e)}
								class={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
									isSelected
										? 'bg-[#b23a2e] border-[#b23a2e] text-white'
										: 'border-black/20 bg-transparent text-transparent dark:border-white/20'
								}`}
								aria-label="Select chapter"
							>
								<Check size={11} />
							</button>

							<span class="font-mono text-[11px] font-bold opacity-60 shrink-0">
								#{chapter.seq + 1}
							</span>
							<div class="min-w-0 flex-1">
								<a
									href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
									class="font-semibold text-xs hover:text-[#b23a2e] dark:hover:text-[#e08a63] truncate block px-0.5"
									title={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
								>
									{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
								</a>
								<div class="flex items-center gap-1.5 text-[10px] opacity-60 mt-0.5">
									{#if liveProg.running}
										<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold animate-pulse">
											{liveProg.phaseLabel} ({liveProg.completedPages}/{liveProg.totalPages})
										</span>
									{:else}
										<span>{chapter.translatedPageCount || 0}/{chapter.pageCount} pgs</span>
										<span>•</span>
										<span class={chapter.status === 'done' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
											{chapter.status.toUpperCase()}
										</span>
									{/if}
								</div>
							</div>
						</div>

						<div class="flex items-center gap-1 shrink-0">
							<a
								href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
								class="inline-flex h-7.5 items-center gap-1 rounded-lg bg-[#b23a2e]/10 px-2.5 py-1 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63]"
							>
								<Play size={10} class="fill-current" />
								<span>Read</span>
							</a>
							<ActionMenu
								items={[
									{ value: 'open', label: 'Open Reader', icon: ExternalLink },
									{ value: 'translate', label: 'Translate Chapter', icon: Play },
									{ value: 'edit', label: 'Edit Chapter Details', icon: Pencil },
									...(chapter.pageCount > 0 ? [{ value: 'clearPages', label: 'Clear Pages', icon: FileX, danger: true }] : []),
									{ value: 'delete', label: 'Delete Chapter', icon: Trash2, danger: true },
								]}
								on:select={(e) => {
									if (e.detail === 'open') goto(`/app/books/${$page.params.id}/chapters/${chapter.id}/`);
									else if (e.detail === 'translate') batchTracker.startBatch(book?.id || '', book?.titleTarget || book?.title || '', [chapter]);
									else if (e.detail === 'edit') openEditChapterModal(chapter);
									else if (e.detail === 'clearPages') promptClearPages(chapter);
									else if (e.detail === 'delete') promptDeleteChapter(chapter);
								}}
							/>
						</div>
					</div>
				{/each}
			</div>

			<!-- DESKTOP MULTI-COLUMN TABLE (>= 640px) -->
			<div class="hidden sm:block overflow-x-auto no-scrollbar rounded-xl border border-black/[0.08] bg-white/60 shadow-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
				<table class="w-full text-left text-xs border-collapse">
					<thead>
						<tr class="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold opacity-60 dark:border-white/[0.06] dark:bg-white/[0.02]">
							<th class="py-2.5 pl-3 pr-2 w-10 text-center">
								<button
									type="button"
									on:click={toggleSelectAll}
									class={`flex h-4.5 w-4.5 mx-auto items-center justify-center rounded border transition-all ${
										allFilteredSelected
											? 'bg-[#b23a2e] border-[#b23a2e] text-white'
											: 'border-black/20 bg-transparent text-transparent dark:border-white/20'
									}`}
									title={allFilteredSelected ? 'Deselect all' : 'Select all'}
									aria-label="Select all"
								>
									<Check size={11} />
								</button>
							</th>
							<th class="py-2.5 px-2 w-12">#</th>
							<th class="py-2.5 px-3">Chapter Title</th>
							<th class="py-2.5 px-3 hidden md:table-cell">Original Title</th>
							<th class="py-2.5 px-3 w-28">Pages</th>
							<th class="py-2.5 px-3 w-28">Status</th>
							<th class="py-2.5 pr-4 pl-3 w-24 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
						{#each displayedChapters as chapter (chapter.id)}
							{@const liveProg = getChapterLiveProgress(chapter)}
							{@const isSelected = selectedChapterIds.has(chapter.id)}
							<tr
								id={`chapter-card-${chapter.id}`}
								data-chapter-seq={chapter.seq + 1}
								class={`group transition ${
									isSelected
										? 'bg-[#b23a2e]/5'
										: 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
								}`}
							>
								<td class="py-2 pl-3 pr-2 text-center">
									<button
										type="button"
										on:click={(e) => toggleSelectChapter(chapter.id, e)}
										class={`flex h-4.5 w-4.5 mx-auto items-center justify-center rounded border transition-all ${
											isSelected
												? 'bg-[#b23a2e] border-[#b23a2e] text-white'
												: 'border-black/20 bg-transparent text-transparent dark:border-white/20'
										}`}
										aria-label="Select chapter"
									>
										<Check size={11} />
									</button>
								</td>
								<td class="py-2 px-2 font-mono font-bold opacity-60">
									#{chapter.seq + 1}
								</td>
								<td class="py-2 px-3 font-semibold">
									<a
										href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
										class="hover:text-[#b23a2e] dark:hover:text-[#e08a63] block truncate max-w-xs px-0.5"
									>
										{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
									</a>
								</td>
								<td class="py-2 px-3 opacity-60 hidden md:table-cell truncate max-w-xs px-0.5">
									{chapter.titleTarget && chapter.title ? chapter.title : '—'}
								</td>
								<td class="py-2 px-3 font-mono opacity-70">
									{#if liveProg.running}
										<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">
											{liveProg.completedPages}/{liveProg.totalPages}
										</span>
									{:else}
										{chapter.translatedPageCount || 0}/{chapter.pageCount}
									{/if}
								</td>
								<td class="py-2 px-3">
									{#if liveProg.running}
										<span class="inline-flex items-center gap-1 text-[10px] font-bold text-[#b23a2e] dark:text-[#e08a63] animate-pulse">
											<Sparkles size={10} class="animate-spin" />
											<span>{liveProg.phaseLabel}</span>
										</span>
									{:else}
										<Badge variant={statusVariant[chapter.status]}>
											{chapter.status.toUpperCase()}
										</Badge>
									{/if}
								</td>
								<td class="py-2 pr-4 pl-3 text-right">
									<div class="flex items-center justify-end gap-1.5">
										<a
											href={`/app/books/${$page.params.id}/chapters/${chapter.id}/`}
											class="p-1 rounded opacity-70 hover:opacity-100 hover:text-[#b23a2e]"
											title="Open Reader"
										>
											<Play size={13} class="fill-current" />
										</a>
										<ActionMenu
											items={[
												{ value: 'open', label: 'Open Reader', icon: ExternalLink },
												{ value: 'translate', label: 'Translate Chapter', icon: Play },
												{ value: 'edit', label: 'Edit Chapter Details', icon: Pencil },
												...(chapter.pageCount > 0 ? [{ value: 'clearPages', label: 'Clear Pages', icon: FileX, danger: true }] : []),
												{ value: 'delete', label: 'Delete Chapter', icon: Trash2, danger: true },
											]}
											on:select={(e) => {
												if (e.detail === 'open') goto(`/app/books/${$page.params.id}/chapters/${chapter.id}/`);
												else if (e.detail === 'translate') batchTracker.startBatch(book?.id || '', book?.titleTarget || book?.title || '', [chapter]);
												else if (e.detail === 'edit') openEditChapterModal(chapter);
												else if (e.detail === 'clearPages') promptClearPages(chapter);
												else if (e.detail === 'delete') promptDeleteChapter(chapter);
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<!-- PROGRESSIVE LOAD MORE -->
		{#if hasMore}
			<div class="flex flex-col items-center justify-center gap-2 py-8">
				<Button variant="secondary" on:click={loadMore}>
					Load More Chapters ({filteredChapters.length - visibleLimit} remaining)
				</Button>
				<span class="text-xs opacity-40">
					Showing {displayedChapters.length} of {filteredChapters.length} chapters
				</span>
			</div>
		{/if}
	{/if}
</div>

<!-- STICKY BATCH FLOATING ACTION TOOLBAR -->
{#if selectedChapterIds.size > 0}
	<div
		transition:fly={{ y: 40, duration: 250, easing: cubicOut }}
		class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 sm:gap-4 rounded-2xl border border-black/15 bg-white/95 px-3 sm:px-4 py-2 sm:py-2.5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#1a1714]/95 max-w-[95vw]"
	>
		<div class="flex items-center gap-2 text-xs font-semibold">
			<span class="flex h-6 w-6 items-center justify-center rounded-lg bg-[#b23a2e] text-white font-mono text-[11px] font-bold shadow-xs">
				{selectedChapterIds.size}
			</span>
			<span class="hidden sm:inline">Chapters</span>
			<span class="opacity-60 text-[11px] font-mono">({selectedPagesCount} pgs)</span>
		</div>

		<div class="h-4 w-px bg-black/10 dark:bg-white/10"></div>

		<div class="flex items-center gap-1.5 sm:gap-2">
			<Button
				variant="primary"
				size="sm"
				class="gap-1.5 font-bold shadow-sm text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-3.5"
				on:click={() => startBatchFromSelected(false)}
				title={isBatchActiveForOtherBook
					? `Batch translation is currently running for "${$batchTracker.bookTitle || 'another book'}"`
					: `Translate selected ${selectedChapterIds.size} chapters`}
			>
				<Play size={13} class="fill-current" />
				<span>Translate ({selectedChapterIds.size})</span>
			</Button>

			<Button
				variant="secondary"
				size="sm"
				class="gap-1 text-xs h-8 sm:h-9 px-2.5"
				on:click={() => startBatchFromSelected(true)}
				title={isBatchActiveForOtherBook
					? `Batch translation is currently running for "${$batchTracker.bookTitle || 'another book'}"`
					: "Force re-translate all pages in selected chapters"}
			>
				<RotateCw size={12} />
				<span class="hidden md:inline">Force All</span>
			</Button>

			<button
				type="button"
				on:click={clearSelection}
				class="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-black/5 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 transition opacity-70 hover:opacity-100"
				title="Clear selection"
				aria-label="Clear selection"
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}


<!-- CREATE CHAPTER MODAL -->
<Modal open={createModalOpen} title="Create New Chapter" size="md" on:close={() => (createModalOpen = false)}>
	<form class="flex flex-col gap-4" on:submit|preventDefault={createChapter}>
		<TextField
			bind:value={chapterTitle}
			label="Chapter Title (Source Language)"
			placeholder="e.g. 第1话"
		/>

		<div class="block">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs font-semibold opacity-60">Target Title (Optional translation)</span>
				<button
					type="button"
					class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline disabled:opacity-40 dark:text-[#e08a63]"
					disabled={translatingNewChapterTitle || !chapterTitle.trim()}
					on:click={translateNewChapterTitle}
				>
					<Languages size={12} />
					<span>{translatingNewChapterTitle ? 'Translating...' : 'Auto-Translate'}</span>
				</button>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={chapterTitleTarget}
					placeholder="e.g. Chapter 1: The Awakening"
					class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
				/>
				<Button
					variant="secondary"
					class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
					loading={translatingNewChapterTitle}
					disabled={translatingNewChapterTitle || !chapterTitle.trim()}
					on:click={translateNewChapterTitle}
					title="Auto-translate chapter title"
				>
					{#if !translatingNewChapterTitle}
						<Languages size={15} />
					{/if}
				</Button>
			</div>
		</div>
	</form>

	<svelte:fragment slot="footer">
		<Button on:click={() => (createModalOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={creating} loading={creating} on:click={createChapter}>
			Create & Open
		</Button>
	</svelte:fragment>
</Modal>

<!-- EDIT BOOK MODAL -->
<Modal open={editBookModalOpen} title="Edit Series Details" size="md" on:close={() => (editBookModalOpen = false)}>
	{#if book}
		<form class="flex flex-col gap-4" on:submit|preventDefault={updateBook}>
			<TextField
				bind:value={editBookTitle}
				label="Book Title (Source Language)"
				placeholder="e.g. 妖神记"
				required
			/>

			<div class="block">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs font-semibold opacity-60">Target Title (Translated title)</span>
					<button
						type="button"
						class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline disabled:opacity-40 dark:text-[#e08a63]"
						disabled={translatingBookTitle || !editBookTitle.trim()}
						on:click={translateBookTitle}
					>
						<Languages size={12} />
						<span>{translatingBookTitle ? 'Translating...' : 'Auto-Translate'}</span>
					</button>
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={editBookTitleTarget}
						placeholder="e.g. Tales of Demons and Gods"
						class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
					/>
					<Button
						variant="secondary"
						class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
						loading={translatingBookTitle}
						disabled={translatingBookTitle || !editBookTitle.trim()}
						on:click={translateBookTitle}
						title="Auto-translate book title"
					>
						{#if !translatingBookTitle}
							<Languages size={15} />
						{/if}
					</Button>
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Source Language</span>
					<LanguagePicker mode="source" bind:value={editBookSourceLang} />
				</div>

				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Target Language</span>
					<LanguagePicker bind:value={editBookTargetLang} excludeCode={editBookSourceLang} />
				</div>
			</div>

			<div class="flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
				<Toggle bind:checked={editBookPinned} label="Pin series to top" />
				<Toggle bind:checked={editBookArchived} label="Archive series" />
			</div>
		</form>
	{/if}

	<svelte:fragment slot="footer">
		<Button on:click={() => (editBookModalOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={updatingBook || !editBookTitle.trim()} loading={updatingBook} on:click={updateBook}>
			Save Changes
		</Button>
	</svelte:fragment>
</Modal>

<!-- EDIT CHAPTER MODAL -->
<Modal open={editChapterModalOpen} title="Edit Chapter Details" size="md" on:close={() => (editChapterModalOpen = false)}>
	{#if editingChapter}
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
						on:click={translateEditChapterTitle}
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
						on:click={translateEditChapterTitle}
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

<!-- DELETE CONFIRMATION DIALOG -->
<ConfirmDialog
	open={deleteConfirmOpen}
	title="Delete Chapter?"
	message={`Are you sure you want to delete "${chapterToDelete?.titleTarget || chapterToDelete?.title || 'Chapter'}"? All uploaded page images and translation output for this chapter will be permanently removed.`}
	confirmLabel="Delete Chapter"
	variant="danger"
	on:confirm={confirmDeleteChapter}
	on:cancel={() => (deleteConfirmOpen = false)}
/>

<!-- CLEAR PAGES CONFIRMATION DIALOG -->
<ConfirmDialog
	open={clearPagesConfirmOpen}
	title={`Clear Pages from "${chapterToClearPages?.titleTarget || chapterToClearPages?.title || `Chapter ${(chapterToClearPages?.seq ?? 0) + 1}`}"?`}
	message={`Are you sure you want to clear all ${chapterToClearPages?.pageCount ?? 0} pages in "${chapterToClearPages?.titleTarget || chapterToClearPages?.title || `Chapter ${(chapterToClearPages?.seq ?? 0) + 1}`}"? All uploaded page images, OCR data, and translations will be permanently removed.`}
	confirmLabel="Clear Pages"
	requireVerificationCode={true}
	variant="danger"
	on:confirm={confirmClearPages}
	on:cancel={() => (clearPagesConfirmOpen = false)}
/>

<!-- CLEAR PROGRESS CONFIRMATION DIALOG -->
<ConfirmDialog
	open={clearProgressConfirmOpen}
	title={`Clear Progress from "${book?.titleTarget || book?.title || 'Book'}"?`}
	message={`Are you sure you want to clear translation and OCR progress from all ${chapters.length} chapter(s)? All translations, detected regions, and output images will be reset back to pending, but all original page images will be preserved.`}
	confirmLabel="Clear Progress"
	requireVerificationCode={true}
	variant="danger"
	on:confirm={confirmClearProgress}
	on:cancel={() => (clearProgressConfirmOpen = false)}
/>
