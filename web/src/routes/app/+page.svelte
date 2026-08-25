<script lang="ts">
	// IMPORTED DEP-COMPONENTS
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button, TextField, Modal, ConfirmDialog, ActionMenu, LanguagePicker, Toggle, LazyImage, Badge } from '$lib/components/ui';
	import { ripple } from '$lib/actions/ripple';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER, LIB_LAYOUT_COOKIE, setCookie } from '$lib/stores/settings';
	import { readingHistory } from '$lib/stores/reading-history';
	import { cn } from '$lib/utils/cn';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED ICONS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import BookX from 'lucide-svelte/icons/book-x';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Layers from 'lucide-svelte/icons/layers';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Pin from 'lucide-svelte/icons/pin';
	import Archive from 'lucide-svelte/icons/archive';
	import Play from 'lucide-svelte/icons/play';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import List from 'lucide-svelte/icons/list';
	import AlignJustify from 'lucide-svelte/icons/align-justify';
	import ArrowUpDown from 'lucide-svelte/icons/arrow-up-down';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Check from 'lucide-svelte/icons/check';
	import X from 'lucide-svelte/icons/x';
	import Languages from 'lucide-svelte/icons/languages';
	// IMPORTED COMPONENTS
	import BookMetadataFields from '$lib/components/book/BookMetadataFields.svelte';
	import BookCoverPicker from '$lib/components/book/BookCoverPicker.svelte';
	import { apiJson } from '$lib/api';
	import { validateForm } from '$lib/utils/form';
	import { BOOK_STATUSES, createBookSchema, updateBookSchema } from '$lib/schemas';
	import type { PageData } from './$types';

	export let data: PageData;

	// -- TYPES -- //

	interface LatestChapter {
		id: number;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		status: string;
	}

	interface Book {
		id: string;
		title: string;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
		pinned?: boolean;
		archived?: boolean;
		chapterCount?: number;
		translatedChapterCount?: number;
		pageCount?: number;
		translatedPageCount?: number;
		coverPageId?: number | null;
		coverHasOutput?: boolean;
		coverPath?: string | null;
		coverRev?: number;
		coverHasDedicated?: boolean;
		coverCleared?: boolean;
		description?: string | null;
		author?: string | null;
		artist?: string | null;
		tags?: string[];
		status?: string;
		lastReadChapter?: LatestChapter | null;
		firstChapter?: LatestChapter | null;
		latestChapter?: LatestChapter | null;
		updatedAt?: number;
		createdAt?: number;
	}

	type BookStatus = (typeof BOOK_STATUSES)[number];

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
			e.preventDefault();
			searchInputEl?.focus();
		}
	}

	type SortOption = 'recent' | 'title_asc' | 'title_desc' | 'chapters_desc' | 'chapters_asc';

	const sortOptions: { value: SortOption; label: string; shortLabel: string }[] = [
		{ value: 'recent', label: 'Recently Updated', shortLabel: 'Recent' },
		{ value: 'title_asc', label: 'Title (A → Z)', shortLabel: 'Title A–Z' },
		{ value: 'title_desc', label: 'Title (Z → A)', shortLabel: 'Title Z–A' },
		{ value: 'chapters_desc', label: 'Most Chapters', shortLabel: 'Most Ch.' },
		{ value: 'chapters_asc', label: 'Fewest Chapters', shortLabel: 'Fewest Ch.' }
	];

	// -- STATES -- //

	let books: Book[] = data.books;
	let loading = false;
	let title = '';
	let titleTarget = '';
	let sourceLang = $settings.sourceLang;
	let targetLang = $settings.targetLang;
	let creating = false;
	let searchQuery = '';
	let searchInputEl: HTMLInputElement;
	let createModalOpen = false;
	let activeTab: 'all' | 'active' | 'pinned' | 'archived' = 'active';
	let sortBy: SortOption = 'recent';
	let sortMenuOpen = false;

	$: books = data.books;

	// VIEW LAYOUT MODES: 'grid' (Comfortable Cards) | 'list' (Media List Rows) | 'compact' (Dense Table Rows)
	let viewLayout: 'grid' | 'list' | 'compact' = (data as any)?.preferences?.libraryLayout || 'grid';

	// EDIT BOOK STATES
	let editModalOpen = false;
	let editingBook: Book | null = null;
	let editTitle = '';
	let editTitleTarget = '';
	let editSourceLang = '';
	let editTargetLang = '';
	let editPinned = false;
	let editArchived = false;
	let editDescription = '';
	let editAuthor = '';
	let editArtist = '';
	let editTags: string[] = [];
	let editStatus: BookStatus = 'unknown';
	let createDescription = '';
	let createAuthor = '';
	let createArtist = '';
	let createTags: string[] = [];
	let createStatus: BookStatus = 'unknown';
	let updating = false;
	let translatingTitle = false;
	let translatingEditTitle = false;

	// DELETION CONFIRMATION
	let bookToDelete: Book | null = null;
	let deleteConfirmOpen = false;
	let deleting = false;

	// CLEAR CHAPTERS CONFIRMATION
	let bookToClearChapters: Book | null = null;
	let clearChaptersConfirmOpen = false;
	let clearingChapters = false;

	// -- LIFECYCLES -- //

	onMount(() => {
		try {
			const saved = localStorage.getItem('xianscan:libraryViewLayout') || localStorage.getItem('manhua:libraryViewLayout');
			if (saved === 'grid' || saved === 'list' || saved === 'compact') {
				if (!data.preferences?.libraryLayout) {
					viewLayout = saved;
				}
				setCookie(LIB_LAYOUT_COOKIE, viewLayout);
			}
		} catch {
			// ignore
		}
	});

	function setViewLayout(mode: 'grid' | 'list' | 'compact') {
		viewLayout = mode;
		setCookie(LIB_LAYOUT_COOKIE, mode);
		try {
			localStorage.setItem('xianscan:libraryViewLayout', mode);
		} catch {
			// ignore
		}
	}

	// -- FUNCTIONS -- //

	async function loadBooks() {
		try {
			const resp = await fetch('/api/books');
			books = (await resp.json()).books;
		} catch {
			toast.error('Could not load books.');
		} finally {
			loading = false;
		}
	}

	async function createBook() {
		const payload = {
			title: title.trim(),
			titleTarget: titleTarget.trim() || undefined,
			sourceLang,
			targetLang,
			description: createDescription.trim() || undefined,
			author: createAuthor.trim() || undefined,
			artist: createArtist.trim() || undefined,
			tags: createTags,
			status: createStatus,
		};
		const validation = validateForm(createBookSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid book details.');
			return;
		}

		creating = true;
		try {
			const resp = await fetch('/api/books', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!resp.ok) {
				const errData = await resp.json().catch(() => ({}));
				throw new Error(errData.message || 'Could not create the book.');
			}
			const { id } = await resp.json();
			toast.success('Book created.');
			createModalOpen = false;
			title = '';
			titleTarget = '';
			goto(`/app/books/${id}/`);
		} catch (err: any) {
			toast.error(err?.message || 'Could not create the book.');
		} finally {
			creating = false;
		}
	}

	function openEditBook(book: Book) {
		editingBook = book;
		editTitle = book.title;
		editTitleTarget = book.titleTarget || '';
		editSourceLang = book.sourceLang;
		editTargetLang = book.targetLang;
		editPinned = !!book.pinned;
		editArchived = !!book.archived;
		editDescription = book.description || '';
		editAuthor = book.author || '';
		editArtist = book.artist || '';
		editTags = book.tags || [];
		editStatus = (book.status as BookStatus) || 'unknown';
		editModalOpen = true;
	}

	async function updateBook() {
		if (!editingBook) return;
		const payload = {
			title: editTitle.trim(),
			titleTarget: editTitleTarget.trim() || null,
			sourceLang: editSourceLang,
			targetLang: editTargetLang,
			pinned: editPinned,
			archived: editArchived,
			description: editDescription.trim() || null,
			author: editAuthor.trim() || null,
			artist: editArtist.trim() || null,
			tags: editTags,
			status: editStatus,
		};
		const validation = validateForm(updateBookSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid book details.');
			return;
		}

		updating = true;
		try {
			const resp = await fetch(`/api/books/${editingBook.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!resp.ok) {
				const errData = await resp.json().catch(() => ({}));
				throw new Error(errData.message || 'Could not update the book.');
			}
			const data = await resp.json();
			const updated = data.book;
			books = books.map((b) =>
				b.id === updated.id
					? { ...b, ...updated, coverHasDedicated: !!updated.coverPath, coverCleared: !!updated.coverCleared }
					: b,
			);
			toast.success('Book updated.');
			editModalOpen = false;
			editingBook = null;
		} catch (err: any) {
			toast.error(err?.message || 'Could not update the book.');
		} finally {
			updating = false;
		}
	}

	async function translateNewTitle() {
		const src = title.trim();
		if (!src) {
			toast.error('Enter a book title to translate.');
			return;
		}
		translatingTitle = true;
		try {
			const res = await apiJson<{ text: string }>('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: src,
					kind: 'title',
					sourceLang,
					targetLang,
				}),
			});
			if (res.text) {
				titleTarget = res.text;
				toast.success('Title translated!');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Could not translate title.');
		} finally {
			translatingTitle = false;
		}
	}

	async function translateEditTitle() {
		const src = editTitle.trim();
		if (!src) {
			toast.error('Enter a book title to translate.');
			return;
		}
		translatingEditTitle = true;
		try {
			const res = await apiJson<{ text: string }>('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: src,
					kind: 'title',
					sourceLang: editSourceLang,
					targetLang: editTargetLang,
					bookId: editingBook?.id,
				}),
			});
			if (res.text) {
				editTitleTarget = res.text;
				toast.success('Title translated!');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Could not translate title.');
		} finally {
			translatingEditTitle = false;
		}
	}

	async function togglePin(book: Book) {
		try {
			const newPinned = !book.pinned;
			const resp = await fetch(`/api/books/${book.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned: newPinned }),
			});
			if (!resp.ok) throw new Error('Pin failed');
			const data = await resp.json();
			books = books.map((b) => (b.id === book.id ? { ...b, ...data.book } : b));
			toast.success(newPinned ? `Pinned "${book.title}".` : `Unpinned "${book.title}".`);
		} catch {
			toast.error('Could not change pin status.');
		}
	}

	async function toggleArchive(book: Book) {
		try {
			const newArchived = !book.archived;
			const resp = await fetch(`/api/books/${book.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ archived: newArchived }),
			});
			if (!resp.ok) throw new Error('Archive failed');
			const data = await resp.json();
			books = books.map((b) => (b.id === book.id ? { ...b, ...data.book } : b));
			toast.success(newArchived ? `Archived "${book.title}".` : `Unarchived "${book.title}".`);
		} catch {
			toast.error('Could not change archive status.');
		}
	}

	function promptDeleteBook(book: Book) {
		bookToDelete = book;
		deleteConfirmOpen = true;
	}

	async function confirmDeleteBook() {
		if (!bookToDelete) return;
		deleting = true;
		try {
			const resp = await fetch(`/api/books/${bookToDelete.id}`, {
				method: 'DELETE',
			});
			if (!resp.ok) throw new Error('Delete failed');
			toast.success(`Deleted "${bookToDelete.title}".`);
			books = books.filter((b) => b.id !== bookToDelete?.id);
		} catch {
			toast.error('Could not delete the book.');
		} finally {
			deleting = false;
			deleteConfirmOpen = false;
			bookToDelete = null;
		}
	}

	function promptClearChapters(book: Book) {
		bookToClearChapters = book;
		clearChaptersConfirmOpen = true;
	}

	async function confirmClearChapters() {
		if (!bookToClearChapters) return;
		clearingChapters = true;
		try {
			const resp = await fetch(`/api/books/${bookToClearChapters.id}/clear-chapters`, {
				method: 'DELETE',
			});
			if (!resp.ok) throw new Error('Clear chapters failed');
			const { deleted } = await resp.json();
			toast.success(`Cleared ${deleted} chapter${deleted === 1 ? '' : 's'} from "${bookToClearChapters.title}".`);
			loadBooks();
		} catch {
			toast.error('Could not clear chapters.');
		} finally {
			clearingChapters = false;
			clearChaptersConfirmOpen = false;
			bookToClearChapters = null;
		}
	}

	function timeAgo(epoch?: number): string {
		if (!epoch) return 'Recently';
		const diff = Date.now() - epoch;
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'Just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return new Date(epoch).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function getProgress(book: Book): { percent: number; label: string; isComplete: boolean } {
		const totalCh = book.chapterCount || 0;
		const doneCh = book.translatedChapterCount || 0;
		const totalPages = book.pageCount || 0;
		const donePages = book.translatedPageCount || 0;

		if (totalCh === 0) return { percent: 0, label: '0 chapters', isComplete: false };

		const percent =
			totalPages > 0
				? Math.min(100, Math.round((donePages / totalPages) * 100))
				: Math.min(100, Math.round((doneCh / totalCh) * 100));

		const isComplete = (totalCh > 0 && doneCh === totalCh) || (totalPages > 0 && donePages === totalPages);

		let label = '';
		if (isComplete) {
			label = '100% Complete';
		} else if (totalPages > 0) {
			label = `${doneCh}/${totalCh} chs (${donePages}/${totalPages} pgs · ${percent}%)`;
		} else {
			label = `${doneCh}/${totalCh} chs (${percent}%)`;
		}

		return {
			percent,
			label,
			isComplete,
		};
	}

	function cycleSort() {
		if (sortBy === 'recent') sortBy = 'title_asc';
		else if (sortBy === 'title_asc') sortBy = 'title_desc';
		else if (sortBy === 'title_desc') sortBy = 'chapters_desc';
		else if (sortBy === 'chapters_desc') sortBy = 'chapters_asc';
		else sortBy = 'recent';
	}

	// REACTIVE FILTERED & SORTED BOOKS (PINNED FLOATS TO TOP)
	$: filteredBooks = books
		.filter((b) => {
			// TAB FILTER
			if (activeTab === 'active' && b.archived) return false;
			if (activeTab === 'pinned' && (!b.pinned || b.archived)) return false;
			if (activeTab === 'archived' && !b.archived) return false;

			// SEARCH FILTER
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return (
				b.title.toLowerCase().includes(q) ||
				(b.titleTarget && b.titleTarget.toLowerCase().includes(q)) ||
				b.sourceLang.toLowerCase().includes(q) ||
				b.targetLang.toLowerCase().includes(q)
			);
		})
		.sort((a, b) => {
			const isQuickA = a.title === 'Web Quick Imports' && a.pinned ? 1 : 0;
			const isQuickB = b.title === 'Web Quick Imports' && b.pinned ? 1 : 0;
			if (isQuickA !== isQuickB) return isQuickB - isQuickA;

			const pinA = a.pinned ? 1 : 0;
			const pinB = b.pinned ? 1 : 0;
			if (pinA !== pinB) return pinB - pinA;

			if (sortBy === 'title_asc') {
				const titleA = (a.titleTarget || a.title).toLowerCase();
				const titleB = (b.titleTarget || b.title).toLowerCase();
				return titleA.localeCompare(titleB);
			}
			if (sortBy === 'title_desc') {
				const titleA = (a.titleTarget || a.title).toLowerCase();
				const titleB = (b.titleTarget || b.title).toLowerCase();
				return titleB.localeCompare(titleA);
			}
			if (sortBy === 'chapters_desc') {
				return (b.chapterCount || 0) - (a.chapterCount || 0);
			}
			if (sortBy === 'chapters_asc') {
				return (a.chapterCount || 0) - (b.chapterCount || 0);
			}
			// default 'recent'
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		});

	function getBookReadTarget(b: Book): { url: string; label: string; isContinue: boolean } | null {
		// 1. Local live store override (if updated in this tab)
		const lastRead = $readingHistory[b.id];
		if (lastRead) {
			const label = lastRead.titleTarget || lastRead.title || `Ch. ${lastRead.seq + 1}`;
			return {
				url: `/app/books/${b.id}/chapters/${lastRead.chapterId}/`,
				label,
				isContinue: true,
			};
		}
		// 2. SSR-loaded last read chapter from database
		if (b.lastReadChapter) {
			const label = b.lastReadChapter.titleTarget || b.lastReadChapter.title || `Ch. ${b.lastReadChapter.seq + 1}`;
			return {
				url: `/app/books/${b.id}/chapters/${b.lastReadChapter.id}/`,
				label,
				isContinue: true,
			};
		}
		// 3. First chapter for brand new reads, or latestChapter fallback
		const startChapter = b.firstChapter || b.latestChapter;
		if (startChapter) {
			const label = startChapter.titleTarget || startChapter.title || `Ch. ${startChapter.seq + 1}`;
			return {
				url: `/app/books/${b.id}/chapters/${startChapter.id}/`,
				label,
				isContinue: false,
			};
		}
		return null;
	}

	$: pinnedCount = books.filter((b) => b.pinned && !b.archived).length;
	$: archivedCount = books.filter((b) => b.archived).length;
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];

	// COVER PREVIEW IN THE EDIT MODAL — THE DEDICATED COVER, A PAGE-PROXY THUMB ONLY FOR BOOKS THAT
	// NEVER HAD A COVER (coverCleared) AND ARE NOT EXPLICITLY COVERLESS.
	$: editCoverSrc = editingBook?.coverPath
		? `/api/covers/${editingBook.id}/file?w=320&rev=${editingBook.coverRev ?? 0}`
		: editingBook?.coverCleared
			? null
			: editingBook?.coverPageId
				? `/api/pages/${editingBook.coverPageId}/file?kind=thumb&w=320`
				: null;

	function onCoverUploaded(e: CustomEvent<{ coverPath: string; coverRev: number }>) {
		if (!editingBook) return;
		editingBook = { ...editingBook, coverPath: e.detail.coverPath, coverRev: e.detail.coverRev, coverCleared: false };
	}

	function onCoverRemoved() {
		if (!editingBook) return;
		editingBook = { ...editingBook, coverPath: null, coverCleared: true };
	}
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<svelte:head>
	<title>Library — Xianscan</title>
	<meta name="description" content="Browse and manage translated comics, manhua, and manga series." />
</svelte:head>

<!-- LIBRARY DASHBOARD -->
<div class="flex flex-col gap-6 pb-8 sm:pb-0">
	<!-- HEADER SECTION -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Library</h1>
			<p class="mt-1 text-sm opacity-60">Manage series, track translation progress, and read translated chapters.</p>
		</div>

		<div class="hidden sm:flex items-center gap-3">
			<Button variant="primary" on:click={() => (createModalOpen = true)}>
				<Plus size={16} /> New Book
			</Button>
		</div>
	</div>

	<!-- UNIFIED ADAPTIVE COMMAND BAR -->
	<div class="flex flex-col gap-2.5">
		<!-- COMMAND BAR CONTAINER -->
		<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 min-w-0">
			<!-- CONTROLS ROW (ON MOBILE: PLACED TOP FOR QUICK REACH; ON DESKTOP: SITS ON THE RIGHT) -->
			<div class="order-1 md:order-2 flex flex-1 items-center justify-end gap-2 min-w-0">
				<!-- SEARCH INPUT -->
				<div class="relative min-w-[120px] flex-1 sm:w-44 md:w-48 lg:w-60">
					<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
					<input
						bind:this={searchInputEl}
						bind:value={searchQuery}
						type="text"
						placeholder="Search books..."
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
						title="Sort books"
						aria-label="Sort books"
						aria-expanded={sortMenuOpen}
						use:ripple
					>
						<ArrowUpDown size={14} class="opacity-60" />
						<span class="hidden sm:inline md:hidden xl:inline">{sortOptions.find((o) => o.value === sortBy)?.shortLabel || 'Sort'}</span>
						<ChevronDown size={12} class={`opacity-40 transition-transform duration-200 ${sortMenuOpen ? 'rotate-180' : ''}`} />
					</button>

					{#if sortMenuOpen}
						<!-- BACKDROP -->
						<button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0" on:click={() => (sortMenuOpen = false)} aria-label="Close sort menu" tabindex="-1"></button>
						<div
							transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
							class={cn('absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border p-1.5 shadow-xl', popover, popoverBorder)}
						>
							<div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-40">Sort Books By</div>
							{#each sortOptions as opt}
								<button
									type="button"
									class={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
										sortBy === opt.value
											? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-semibold'
											: 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
									}`}
									on:click={() => {
										sortBy = opt.value;
										sortMenuOpen = false;
									}}
								>
									<span>{opt.label}</span>
									{#if sortBy === opt.value}
										<Check size={13} />
									{/if}
								</button>
							{/each}
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
						<span class="hidden xl:inline text-xs">Grid</span>
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
						<span class="hidden xl:inline text-xs">List</span>
					</button>

					<button
						type="button"
						on:click={() => setViewLayout('compact')}
						class={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs transition-all ${
							viewLayout === 'compact'
								? 'bg-white text-black font-bold shadow-xs dark:bg-[#221e1a] dark:text-white'
								: 'opacity-50 hover:opacity-100'
						}`}
						title="Compact Table Rows"
						aria-label="Compact View"
						use:ripple
					>
						<AlignJustify size={14} />
						<span class="hidden xl:inline text-xs">Compact</span>
					</button>
				</div>
			</div>

			<!-- FILTER TABS (MOBILE: FULL-WIDTH 4-COLUMN SEGMENTED GRID; DESKTOP: CLEAN FLEX ROW) -->
			<div class="order-2 md:order-1 grid grid-cols-4 w-full md:flex md:w-auto items-center gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.04]">
				<button
					type="button"
					on:click={() => (activeTab = 'active')}
					class={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1.5 sm:px-3.5 py-2 text-xs font-medium transition-all ${
						activeTab === 'active'
							? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<BookOpen size={12} class="hidden min-[420px]:inline shrink-0" />
					<span class="truncate">Active</span>
					<span class="rounded-full bg-black/5 px-1 sm:px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{books.filter((b) => !b.archived).length}</span>
				</button>

				<button
					type="button"
					on:click={() => (activeTab = 'pinned')}
					class={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1.5 sm:px-3.5 py-2 text-xs font-medium transition-all ${
						activeTab === 'pinned'
							? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<Pin size={12} class="hidden min-[420px]:inline rotate-45 shrink-0" />
					<span class="truncate">Pinned</span>
					<span class="rounded-full bg-black/5 px-1 sm:px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{pinnedCount}</span>
				</button>

				<button
					type="button"
					on:click={() => (activeTab = 'archived')}
					class={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1.5 sm:px-3.5 py-2 text-xs font-medium transition-all ${
						activeTab === 'archived'
							? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<Archive size={12} class="hidden min-[420px]:inline shrink-0" />
					<span class="truncate">Archived</span>
					<span class="rounded-full bg-black/5 px-1 sm:px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{archivedCount}</span>
				</button>

				<button
					type="button"
					on:click={() => (activeTab = 'all')}
					class={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1.5 sm:px-3.5 py-2 text-xs font-medium transition-all ${
						activeTab === 'all'
							? 'bg-white text-black shadow-xs dark:bg-[#201c18] dark:text-white font-semibold'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<Layers size={12} class="hidden min-[420px]:inline shrink-0" />
					<span class="truncate">All</span>
					<span class="rounded-full bg-black/5 px-1 sm:px-1.5 py-0.2 text-[10px] font-mono dark:bg-white/10">{books.length}</span>
				</button>
			</div>
		</div>
	</div>

	<!-- BOOK LISTINGS -->
	{#if loading}
		<div class="grid w-full gap-4 sm:grid-cols-2">
			{#each [1, 2, 3, 4] as _}
				<div class="h-44 rounded-2xl border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.03]"></div>
			{/each}
		</div>
	{:else if books.length === 0}
		<div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 py-16 text-center dark:border-white/15">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]">
				<BookOpen size={24} />
			</div>
			<h2 class="mt-4 text-base font-semibold">No books in your library</h2>
			<p class="mt-1 max-w-sm text-xs opacity-60">Create your first book series to start uploading chapter images for translation.</p>
			<Button variant="primary" size="sm" class="mt-4" on:click={() => (createModalOpen = true)}>
				<Plus size={14} /> Create First Book
			</Button>
		</div>
	{:else if filteredBooks.length === 0}
		<p class="py-8 text-center text-sm opacity-60">No books found matching "{searchQuery}".</p>
	{:else if viewLayout === 'grid'}
		<!-- MODE 1: COMFORTABLE RESPONSIVE CARDS GRID -->
		<ul class="grid w-full gap-3.5 sm:gap-5 grid-cols-1 sm:grid-cols-2">
			{#each filteredBooks as book (book.id)}
				{@const progress = getProgress(book)}
				{@const readTarget = getBookReadTarget(book)}
				<li class="group relative flex flex-col justify-between rounded-2xl border border-black/[0.08] bg-white/60 p-3.5 sm:p-4 transition-all duration-300 hover:border-[#b23a2e]/40 hover:shadow-xl dark:border-white/[0.06] dark:bg-white/[0.02]">
					<!-- UPPER SECTION: COVER ARTWORK + METADATA -->
					<div class="flex gap-3 sm:gap-4 items-start">
						<!-- 2:3 VERTICAL COVER THUMBNAIL -->
						<a
							href={`/app/books/${book.id}/`}
							class="group/cover w-20 sm:w-28 shrink-0 transition-transform duration-300 hover:scale-102"
							title={`Open ${book.titleTarget || book.title}`}
						>
							<LazyImage
								src={book.coverHasDedicated
									? `/api/covers/${book.id}/file?w=320&rev=${book.coverRev ?? 0}`
									: book.coverCleared
										? ''
										: book.coverPageId
											? `/api/pages/${book.coverPageId}/file?kind=thumb&w=320`
											: ''}
								alt={`${book.titleTarget || book.title} Cover`}
								fallbackText={(book.titleTarget || book.title).slice(0, 1) || '书'}
								aspectRatio="aspect-[2/3]"
								showSpineShadow={true}
							/>
						</a>

						<!-- METADATA DETAILS -->
						<div class="min-w-0 flex-1 flex flex-col justify-between self-stretch">
							<div>
								<div class="flex items-start justify-between gap-1.5">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5 min-w-0">
											{#if book.pinned}
												<span title="Pinned Series" class="flex items-center text-amber-600 dark:text-amber-400 shrink-0">
													<Pin size={12} class="rotate-45 fill-current" />
												</span>
											{/if}
											<a
												href={`/app/books/${book.id}/`}
												class="font-bold text-sm sm:text-base tracking-tight hover:text-[#b23a2e] dark:hover:text-[#e08a63] block truncate px-0.5"
												title={book.titleTarget || book.title}
											>
												{book.titleTarget || book.title}
											</a>
										</div>
										{#if book.titleTarget && book.titleTarget !== book.title}
											<p class="text-[11px] sm:text-xs opacity-60 font-medium truncate mt-0.5 px-0.5" title={book.title}>
												{book.title}
											</p>
										{/if}
									</div>

									<div class="shrink-0">
										<ActionMenu
											items={[
												{ value: 'open', label: 'Open Series', icon: ExternalLink },
												{ value: 'edit', label: 'Edit Book Details', icon: Pencil },
												{ value: 'pin', label: book.pinned ? 'Unpin from Top' : 'Pin to Top', icon: Pin },
												{ value: 'archive', label: book.archived ? 'Unarchive Series' : 'Archive Series', icon: Archive },
												{ value: 'clearChapters', label: 'Clear Chapters', icon: BookX, danger: true },
												{ value: 'delete', label: 'Delete Book', icon: Trash2, danger: true },
											]}
											on:select={(e) => {
												if (e.detail === 'open') goto(`/app/books/${book.id}/`);
												else if (e.detail === 'edit') openEditBook(book);
												else if (e.detail === 'pin') togglePin(book);
												else if (e.detail === 'archive') toggleArchive(book);
												else if (e.detail === 'clearChapters') promptClearChapters(book);
												else if (e.detail === 'delete') promptDeleteBook(book);
											}}
										/>
									</div>
								</div>

								<!-- LANGUAGE & VOLUME PILLS -->
								<div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
									<span class="rounded-md bg-[#b23a2e]/10 px-2 py-0.5 font-semibold text-[#b23a2e] dark:text-[#e08a63]">
										{book.sourceLang} → {book.targetLang}
									</span>
									<span class="rounded-md bg-black/5 dark:bg-white/5 px-2 py-0.5 font-medium opacity-70">
										{book.chapterCount} {book.chapterCount === 1 ? 'ch' : 'chs'}
									</span>
								</div>
							</div>

							<!-- LIVE TRANSLATION PROGRESS BAR -->
							<div class="mt-2 sm:mt-3">
								<div class="flex items-center justify-between text-[10px] sm:text-[11px] mb-1">
									<span class="opacity-70 flex items-center gap-1 font-medium truncate">
										{#if progress.isComplete}
											<CheckCircle2 size={11} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
										{/if}
										<span class="truncate">{progress.label}</span>
									</span>
									<span class="opacity-40 text-[9px] sm:text-[10px] font-mono shrink-0 ml-1">{timeAgo(book.updatedAt)}</span>
								</div>
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<div
										class={`h-full rounded-full transition-all duration-500 ${
											progress.isComplete
												? 'bg-emerald-600 dark:bg-emerald-400'
												: 'bg-[#b23a2e] dark:bg-[#e08a63]'
										}`}
										style={`width: ${progress.percent}%`}
									></div>
								</div>
							</div>
						</div>
					</div>

					<!-- LOWER SECTION: ACTION FOOTER BAR -->
					<div class="mt-3 sm:mt-4 flex items-center justify-between border-t border-black/[0.05] pt-2.5 sm:pt-3 text-xs dark:border-white/[0.05]">
						{#if readTarget}
							<a
								href={readTarget.url}
								class="inline-flex items-center gap-1.5 rounded-lg bg-[#b23a2e]/10 px-2.5 py-1 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black truncate max-w-[65%]"
								title={readTarget.isContinue ? `Continue reading ${readTarget.label}` : `Read ${readTarget.label}`}
								use:ripple
							>
								<Play size={11} class="fill-current shrink-0" />
								<span class="truncate">{readTarget.label}</span>
							</a>
						{:else}
							<span class="text-[11px] opacity-40">No chapters yet</span>
						{/if}

						<a
							href={`/app/books/${book.id}/`}
							class="font-medium text-xs opacity-70 transition hover:opacity-100 hover:text-[#b23a2e] dark:hover:text-[#e08a63] shrink-0 ml-2"
						>
							Manage →
						</a>
					</div>
				</li>
			{/each}
		</ul>
	{:else if viewLayout === 'list'}
		<!-- MODE 2: MEDIA LIST STRIP (RESPONSIVE ROW) -->
		<ul class="flex flex-col gap-2.5 w-full">
			{#each filteredBooks as book (book.id)}
				{@const progress = getProgress(book)}
				{@const readTarget = getBookReadTarget(book)}
				<li
					id={`book-card-${book.id}`}
					class="group relative flex items-center justify-between gap-3 sm:gap-4 rounded-xl border border-black/[0.07] bg-white/60 p-2.5 sm:p-3 transition-all hover:border-[#b23a2e]/40 hover:bg-white hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
				>
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<!-- MINI THUMBNAIL -->
						<a
							href={`/app/books/${book.id}/`}
							class="w-10 sm:w-12 shrink-0 transition-transform duration-200 group-hover:scale-105"
							title={`Open ${book.titleTarget || book.title}`}
						>
							<LazyImage
								src={book.coverHasDedicated
									? `/api/covers/${book.id}/file?w=140&rev=${book.coverRev ?? 0}`
									: book.coverCleared
										? ''
										: book.coverPageId
											? `/api/pages/${book.coverPageId}/file?kind=thumb&w=140`
											: ''}
								alt={book.titleTarget || book.title}
								fallbackText={(book.titleTarget || book.title).slice(0, 1) || '书'}
								aspectRatio="aspect-[2/3]"
								showSpineShadow={false}
								class="rounded-lg shadow-2xs"
							/>
						</a>

						<!-- TITLE & METADATA -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5 min-w-0">
								{#if book.pinned}
									<span title="Pinned Series" class="text-amber-600 dark:text-amber-400 shrink-0">
										<Pin size={12} class="rotate-45 fill-current" />
									</span>
								{/if}
								<a
									href={`/app/books/${book.id}/`}
									class="font-bold text-xs sm:text-sm hover:text-[#b23a2e] dark:hover:text-[#e08a63] truncate block px-0.5"
									title={book.titleTarget || book.title}
								>
									{book.titleTarget || book.title}
								</a>
								{#if book.titleTarget && book.titleTarget !== book.title}
									<span class="text-xs opacity-50 font-medium truncate hidden md:inline px-0.5" title={book.title}>
										({book.title})
									</span>
								{/if}
								<span class="rounded bg-[#b23a2e]/10 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63] shrink-0 hidden sm:inline">
									{book.sourceLang} → {book.targetLang}
								</span>
							</div>

							<div class="mt-1 flex items-center gap-2 text-[10px] sm:text-xs opacity-65 flex-wrap">
								<span>{book.chapterCount} chs ({book.pageCount || 0} pgs)</span>
								<span>•</span>
								<span class={progress.isComplete ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
									{progress.percent}%
								</span>
								<span class="hidden sm:inline opacity-40">• {timeAgo(book.updatedAt)}</span>
							</div>
						</div>
					</div>

					<!-- ACTION BUTTONS -->
					<div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
						{#if readTarget}
							<a
								href={readTarget.url}
								class="hidden sm:inline-flex items-center gap-1 rounded-lg bg-[#b23a2e]/10 px-2.5 py-1 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black"
								title={readTarget.isContinue ? `Continue reading ${readTarget.label}` : `Read ${readTarget.label}`}
								use:ripple
							>
								<Play size={11} class="fill-current" />
								<span>{readTarget.isContinue ? 'Continue' : 'Read'}</span>
							</a>
						{/if}

						<a
							href={`/app/books/${book.id}/`}
							class="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium opacity-80 transition hover:opacity-100 hover:border-black/25 dark:border-white/10 dark:hover:border-white/25"
						>
							Manage →
						</a>

						<ActionMenu
							items={[
								{ value: 'open', label: 'Open Series', icon: ExternalLink },
								{ value: 'edit', label: 'Edit Book Details', icon: Pencil },
								{ value: 'pin', label: book.pinned ? 'Unpin from Top' : 'Pin to Top', icon: Pin },
								{ value: 'archive', label: book.archived ? 'Unarchive Series' : 'Archive Series', icon: Archive },
								{ value: 'clearChapters', label: 'Clear Chapters', icon: BookX, danger: true },
								{ value: 'delete', label: 'Delete Book', icon: Trash2, danger: true },
							]}
							on:select={(e) => {
								if (e.detail === 'open') goto(`/app/books/${book.id}/`);
								else if (e.detail === 'edit') openEditBook(book);
								else if (e.detail === 'pin') togglePin(book);
								else if (e.detail === 'archive') toggleArchive(book);
								else if (e.detail === 'clearChapters') promptClearChapters(book);
								else if (e.detail === 'delete') promptDeleteBook(book);
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
			{#each filteredBooks as book (book.id)}
				{@const progress = getProgress(book)}
				{@const readTarget = getBookReadTarget(book)}
				<div class="flex items-center justify-between gap-2.5 p-2.5 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
					<div class="flex items-center gap-2 min-w-0 flex-1">
						{#if book.pinned}
							<span title="Pinned Series" class="text-amber-600 dark:text-amber-400 shrink-0">
								<Pin size={11} class="rotate-45 fill-current" />
							</span>
						{/if}
						<div class="min-w-0 flex-1">
							<a
								href={`/app/books/${book.id}/`}
								class="font-semibold text-xs hover:text-[#b23a2e] dark:hover:text-[#e08a63] truncate block px-0.5"
								title={book.titleTarget || book.title}
							>
								{book.titleTarget || book.title}
							</a>
							<div class="flex items-center gap-2 text-[10px] opacity-60 mt-0.5">
								<span>{book.chapterCount} chs</span>
								<span>•</span>
								<span class={progress.isComplete ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
									{progress.percent}% done
								</span>
							</div>
						</div>
					</div>

					<div class="flex items-center gap-1 shrink-0">
						{#if readTarget}
							<a
								href={readTarget.url}
								class="rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] hover:bg-[#b23a2e] hover:text-white dark:hover:bg-[#e08a63] dark:hover:text-black px-2 py-1 text-[11px] font-semibold transition"
								title={readTarget.isContinue ? `Continue reading ${readTarget.label}` : `Read ${readTarget.label}`}
							>
								{readTarget.isContinue ? 'Continue' : 'Read'}
							</a>
						{/if}
						<a
							href={`/app/books/${book.id}/`}
							class="rounded-lg bg-black/5 dark:bg-white/5 px-2 py-1 text-[11px] font-medium opacity-80 transition hover:opacity-100"
						>
							Manage
						</a>
						<ActionMenu
							items={[
								{ value: 'open', label: 'Open Series', icon: ExternalLink },
								{ value: 'edit', label: 'Edit Book Details', icon: Pencil },
								{ value: 'pin', label: book.pinned ? 'Unpin from Top' : 'Pin to Top', icon: Pin },
								{ value: 'archive', label: book.archived ? 'Unarchive Series' : 'Archive Series', icon: Archive },
								{ value: 'clearChapters', label: 'Clear Chapters', icon: BookX, danger: true },
								{ value: 'delete', label: 'Delete Book', icon: Trash2, danger: true },
							]}
							on:select={(e) => {
								if (e.detail === 'open') goto(`/app/books/${book.id}/`);
								else if (e.detail === 'edit') openEditBook(book);
								else if (e.detail === 'pin') togglePin(book);
								else if (e.detail === 'archive') toggleArchive(book);
								else if (e.detail === 'clearChapters') promptClearChapters(book);
								else if (e.detail === 'delete') promptDeleteBook(book);
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
						<th class="py-2.5 pl-4 pr-2 w-10">★</th>
						<th class="py-2.5 px-3">Title</th>
						<th class="py-2.5 px-3 hidden md:table-cell">Original Title</th>
						<th class="py-2.5 px-3 w-28">Languages</th>
						<th class="py-2.5 px-3 w-28">Chapters</th>
						<th class="py-2.5 px-3 w-36">Progress</th>
						<th class="py-2.5 pr-4 pl-3 w-24 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
					{#each filteredBooks as book (book.id)}
						{@const progress = getProgress(book)}
						{@const readTarget = getBookReadTarget(book)}
						<tr class="group transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
							<td class="py-2.5 pl-4 pr-2">
								{#if book.pinned}
									<span title="Pinned Series" class="text-amber-600 dark:text-amber-400">
										<Pin size={12} class="rotate-45 fill-current" />
									</span>
								{:else}
									<span class="opacity-20">•</span>
								{/if}
							</td>
							<td class="py-2.5 px-3 font-semibold">
								<a
									href={`/app/books/${book.id}/`}
									class="hover:text-[#b23a2e] dark:hover:text-[#e08a63] block truncate max-w-xs px-0.5"
								>
									{book.titleTarget || book.title}
								</a>
							</td>
							<td class="py-2.5 px-3 opacity-60 hidden md:table-cell truncate max-w-xs px-0.5" title={book.title}>
								{book.title}
							</td>
							<td class="py-2.5 px-3">
								<span class="rounded bg-[#b23a2e]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63]">
									{book.sourceLang} → {book.targetLang}
								</span>
							</td>
							<td class="py-2.5 px-3 font-mono opacity-70">
								{book.chapterCount} chs
							</td>
							<td class="py-2.5 px-3">
								<div class="flex items-center gap-2">
									<div class="h-1.5 w-16 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
										<div
											class={`h-full rounded-full ${
												progress.isComplete ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[#b23a2e] dark:bg-[#e08a63]'
											}`}
											style={`width: ${progress.percent}%`}
										></div>
									</div>
									<span class="font-mono text-[10px] opacity-60">{progress.percent}%</span>
								</div>
							</td>
							<td class="py-2.5 pr-4 pl-3 text-right">
								<div class="flex items-center justify-end gap-1.5">
									{#if readTarget}
										<a
											href={readTarget.url}
											class="p-1 rounded opacity-70 hover:opacity-100 hover:text-[#b23a2e] dark:hover:text-[#e08a63]"
											title={readTarget.isContinue ? `Continue reading ${readTarget.label}` : `Read ${readTarget.label}`}
										>
											<Play size={13} class="fill-current" />
										</a>
									{/if}
									<a
										href={`/app/books/${book.id}/`}
										class="p-1 rounded opacity-70 hover:opacity-100 hover:text-[#b23a2e]"
										title="Open Series"
									>
										<ExternalLink size={13} />
									</a>
									<ActionMenu
										items={[
											{ value: 'open', label: 'Open Series', icon: ExternalLink },
											{ value: 'edit', label: 'Edit Book Details', icon: Pencil },
											{ value: 'pin', label: book.pinned ? 'Unpin from Top' : 'Pin to Top', icon: Pin },
											{ value: 'archive', label: book.archived ? 'Unarchive Series' : 'Archive Series', icon: Archive },
											{ value: 'clearChapters', label: 'Clear Chapters', icon: BookX, danger: true },
											{ value: 'delete', label: 'Delete Book', icon: Trash2, danger: true },
										]}
										on:select={(e) => {
											if (e.detail === 'open') goto(`/app/books/${book.id}/`);
											else if (e.detail === 'edit') openEditBook(book);
											else if (e.detail === 'pin') togglePin(book);
											else if (e.detail === 'archive') toggleArchive(book);
											else if (e.detail === 'clearChapters') promptClearChapters(book);
											else if (e.detail === 'delete') promptDeleteBook(book);
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
</div>

<!-- MOBILE FLOATING ACTION BUTTON (FAB): HUGE '+' BUTTON -->
<button
	type="button"
	on:click={() => (createModalOpen = true)}
	class="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-transparent bg-[#b23a2e] text-white shadow-xl shadow-black/20 transition-all duration-200 hover:bg-[#c0392b] hover:shadow-2xl hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/40 sm:hidden"
	use:ripple
	title="Create New Book Series"
	aria-label="Create New Book Series"
>
	<Plus size={28} class="shrink-0" />
</button>

<!-- CREATE BOOK MODAL -->
<Modal open={createModalOpen} title="Create New Book Series" size="md" on:close={() => (createModalOpen = false)}>
	<form class="flex flex-col gap-4" on:submit|preventDefault={createBook}>
		<TextField
			bind:value={title}
			label="Book Title (Source Language)"
			placeholder="e.g. 星尘"
		/>

		<div class="block">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs font-semibold opacity-60">Target Title (Optional translation)</span>
				<button
					type="button"
					class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline disabled:opacity-40 dark:text-[#e08a63]"
					disabled={translatingTitle || !title.trim()}
					on:click={translateNewTitle}
				>
					<Languages size={12} />
					<span>{translatingTitle ? 'Translating...' : 'Auto-Translate'}</span>
				</button>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={titleTarget}
					placeholder="e.g. Stardust"
					class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
				/>
				<Button
					variant="secondary"
					class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
					loading={translatingTitle}
					disabled={translatingTitle || !title.trim()}
					on:click={translateNewTitle}
					title="Auto-translate book title"
				>
					{#if !translatingTitle}
						<Languages size={15} />
					{/if}
				</Button>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<span class="mb-1 block text-xs font-semibold opacity-60">Source Language</span>
				<LanguagePicker mode="source" bind:value={sourceLang} />
			</div>

			<div>
				<span class="mb-1 block text-xs font-semibold opacity-60">Target Language</span>
				<LanguagePicker bind:value={targetLang} excludeCode={sourceLang} />
			</div>
		</div>

		<BookMetadataFields
			bind:description={createDescription}
			bind:author={createAuthor}
			bind:artist={createArtist}
			bind:tags={createTags}
			bind:status={createStatus}
		/>
	</form>

	<svelte:fragment slot="footer">
		<Button on:click={() => (createModalOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={creating || !title.trim()} loading={creating} on:click={createBook}>
			Create Book
		</Button>
	</svelte:fragment>
</Modal>

<!-- EDIT BOOK MODAL -->
<Modal open={editModalOpen} title="Edit Book Series" size="md" on:close={() => (editModalOpen = false)}>
	{#if editingBook}
		<form class="flex flex-col gap-4" on:submit|preventDefault={updateBook}>
			<TextField
				bind:value={editTitle}
				label="Book Title (Source Language)"
				placeholder="e.g. 星尘"
			/>

			<div class="block">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs font-semibold opacity-60">Target Title (Translated title)</span>
					<button
						type="button"
						class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline disabled:opacity-40 dark:text-[#e08a63]"
						disabled={translatingEditTitle || !editTitle.trim()}
						on:click={translateEditTitle}
					>
						<Languages size={12} />
						<span>{translatingEditTitle ? 'Translating...' : 'Auto-Translate'}</span>
					</button>
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={editTitleTarget}
						placeholder="e.g. Stardust"
						class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
					/>
					<Button
						variant="secondary"
						class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
						loading={translatingEditTitle}
						disabled={translatingEditTitle || !editTitle.trim()}
						on:click={translateEditTitle}
						title="Auto-translate book title"
					>
						{#if !translatingEditTitle}
							<Languages size={15} />
						{/if}
					</Button>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Source Language</span>
					<LanguagePicker mode="source" bind:value={editSourceLang} />
				</div>

				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Target Language</span>
					<LanguagePicker bind:value={editTargetLang} excludeCode={editSourceLang} />
				</div>
			</div>

			<div class="flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
				<Toggle bind:checked={editPinned} label="Pin series to top of library" />
				<Toggle bind:checked={editArchived} label="Archive series (hide from active view)" />
			</div>

			<BookCoverPicker bookId={editingBook.id} coverSrc={editCoverSrc} on:uploaded={onCoverUploaded} on:removed={onCoverRemoved} />

			<BookMetadataFields
				bind:description={editDescription}
				bind:author={editAuthor}
				bind:artist={editArtist}
				bind:tags={editTags}
				bind:status={editStatus}
			/>
		</form>
	{/if}

	<svelte:fragment slot="footer">
		<Button on:click={() => (editModalOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={updating || !editTitle.trim()} loading={updating} on:click={updateBook}>
			Save Changes
		</Button>
	</svelte:fragment>
</Modal>

<!-- DELETE CONFIRMATION DIALOG -->
<ConfirmDialog
	open={deleteConfirmOpen}
	title="Delete Book Series?"
	message={`Are you sure you want to delete "${bookToDelete?.titleTarget || bookToDelete?.title || 'Book'}"? All chapters, pages, and cached translations for this book will be permanently deleted.`}
	confirmLabel="Delete Book"
	requireVerificationCode={true}
	variant="danger"
	on:confirm={confirmDeleteBook}
	on:cancel={() => (deleteConfirmOpen = false)}
/>

<!-- CLEAR CHAPTERS CONFIRMATION DIALOG -->
<ConfirmDialog
	open={clearChaptersConfirmOpen}
	title={`Clear Chapters from "${bookToClearChapters?.titleTarget || bookToClearChapters?.title || 'Book'}"?`}
	message={`Are you sure you want to clear all chapters from "${bookToClearChapters?.titleTarget || bookToClearChapters?.title || 'this series'}"? All chapters, pages, OCR data, and translations will be permanently removed.`}
	confirmLabel="Clear Chapters"
	requireVerificationCode={true}
	variant="danger"
	on:confirm={confirmClearChapters}
	on:cancel={() => (clearChaptersConfirmOpen = false)}
/>
