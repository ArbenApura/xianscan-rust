<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ripple } from '$lib/actions/ripple';
	import { Button, ActionMenu, type MenuAction } from '$lib/components/ui';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Upload from 'lucide-svelte/icons/upload';
	import Download from 'lucide-svelte/icons/download';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Play from 'lucide-svelte/icons/play';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Columns from 'lucide-svelte/icons/columns';
	import Scissors from 'lucide-svelte/icons/scissors';
	import Square from 'lucide-svelte/icons/square';
	import Pencil from 'lucide-svelte/icons/pencil';
	import FileX from 'lucide-svelte/icons/file-x';

	export let bookId: string;
	export let chapterSeq: number;
	export let chapterTitle: string | null = null;
	export let chapterTitleTarget: string | null = null;
	export let totalPages: number = 0;
	export let running: boolean = false;
	export let uploading: boolean = false;
	export let exporting: boolean = false;
	export let exportProgress: number = 0;
	export let activeViewMode: 'reader' | 'grid' | 'compare' = 'reader';
	export let webtoonKind: 'output' | 'original' = 'output';
	export let webtoonWidth: 'sm' | 'md' | 'lg' = 'md';
	export let prevChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = null;
	export let nextChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = null;

	const dispatch = createEventDispatcher<{
		translate: void;
		cancel: void;
		clearProgress: void;
		clearAllPages: void;
		openReslice: void;
		editChapter: void;
		exportZip: void;
		upload: FileList;
		changeViewMode: 'reader' | 'grid' | 'compare';
		changeWebtoonKind: 'output' | 'original';
		changeWebtoonWidth: 'sm' | 'md' | 'lg';
	}>();

	const WIDTH_OPTIONS = ['sm', 'md', 'lg'] as const;

	let fileInput: HTMLInputElement;

	$: chapterMenuItems = [
		{ value: 'upload', label: uploading ? 'Uploading...' : 'Add Images', icon: Upload, disabled: uploading || running },
		...(totalPages > 0
			? [
					running
						? { value: 'cancel', label: 'Cancel Translation', icon: Square, danger: true }
						: { value: 'translate', label: 'Translate All', icon: Play },
					{ value: 'reslice', label: 'Smart Re-slice', icon: Scissors, disabled: running },
					{ value: 'clearProgress', label: 'Clear Progress', icon: RotateCcw, disabled: running },
					{
						value: 'exportZip',
						label: exporting ? `Exporting ${exportProgress}%` : 'Export ZIP',
						icon: exporting ? Loader2 : Download,
						disabled: exporting || running,
					},
					{ value: 'clearAllPages', label: 'Clear Pages', icon: FileX, danger: true, disabled: running },
				]
			: []),
		{ value: 'editChapter', label: 'Edit Chapter Details', icon: Pencil },
	] as MenuAction[];

	function handleMenuAction(action: string) {
		if (action === 'upload') fileInput?.click();
		else if (action === 'translate') dispatch('translate');
		else if (action === 'cancel') dispatch('cancel');
		else if (action === 'reslice') dispatch('openReslice');
		else if (action === 'clearProgress') dispatch('clearProgress');
		else if (action === 'clearAllPages') dispatch('clearAllPages');
		else if (action === 'editChapter') dispatch('editChapter');
		else if (action === 'exportZip') dispatch('exportZip');
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			dispatch('upload', target.files);
			target.value = '';
		}
	}
</script>

<div class="flex flex-col gap-3">
	<!-- ROW 1: LEFT: CHAPTERS, CENTER: TITLE & PAGES, RIGHT: PREV/NEXT -->
	<div class="flex items-center justify-between gap-3 w-full">
		<!-- LEFT EDGE: EXIT TO CHAPTER LIST BUTTON -->
		<div class="shrink-0">
			<a
				href={`/app/books/${bookId}/`}
				class="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 px-2.5 sm:px-3 text-xs font-semibold text-current opacity-75 transition hover:bg-black/5 hover:opacity-100 dark:border-white/10 dark:hover:bg-white/5"
				use:ripple
				title="Exit to Chapter List"
				aria-label="Exit to Chapter List"
			>
				<ArrowLeft size={14} />
				<span class="hidden sm:inline">Chapter List</span>
			</a>
		</div>

		<!-- CENTER: CHAPTER TITLE & PAGE COUNT -->
		<div class="flex-1 flex items-center justify-center gap-2 flex-wrap min-w-0 text-center px-1">
			<h1 class="text-base sm:text-lg font-bold tracking-tight truncate max-w-xs sm:max-w-md md:max-w-lg">
				{#if chapterTitleTarget}
					{#if /^(chapter|ch\.?|ep\.?|第|\d+)/i.test(chapterTitleTarget.trim())}
						{chapterTitleTarget}
					{:else}
						Chapter {chapterSeq + 1}: {chapterTitleTarget}
					{/if}
					{#if chapterTitle && chapterTitle !== chapterTitleTarget}
						<span class="hidden sm:inline text-xs sm:text-sm font-normal opacity-70 ml-1.5">({chapterTitle})</span>
					{/if}
				{:else if chapterTitle}
					{#if /^(chapter|ch\.?|ep\.?|第|\d+)/i.test(chapterTitle.trim())}
						{chapterTitle}
					{:else}
						Chapter {chapterSeq + 1}: {chapterTitle}
					{/if}
				{:else}
					Chapter {chapterSeq + 1}
				{/if}
			</h1>
			<button
				type="button"
				on:click={() => dispatch('editChapter')}
				class="hidden sm:inline-flex rounded-md p-1 opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5 shrink-0"
				title="Edit chapter title & sequence"
				use:ripple
			>
				<Pencil size={13} />
			</button>
			<span class="hidden sm:inline-block rounded-md bg-black/5 px-2 py-0.5 text-xs font-semibold opacity-60 dark:bg-white/5 shrink-0">
				{totalPages} page{totalPages === 1 ? '' : 's'}
			</span>
		</div>

		<!-- RIGHT EDGE: DYNAMIC PREV & NEXT CHAPTER NAVIGATION -->
		<div class="flex items-center rounded-xl border border-black/10 bg-black/[0.03] p-0.5 dark:border-white/10 dark:bg-white/[0.03] shrink-0">
			<a
				href={prevChapter ? `/app/books/${bookId}/chapters/${prevChapter.id}` : undefined}
				class={`flex h-8 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all ${
					prevChapter
						? 'hover:bg-white hover:shadow-xs hover:text-black dark:hover:bg-[#221e1a] dark:hover:text-white'
						: 'opacity-30 cursor-not-allowed pointer-events-none'
				}`}
				use:ripple={{ disabled: !prevChapter }}
				title={prevChapter ? `Previous Chapter (Ch. ${prevChapter.seq + 1})` : 'No previous chapter'}
				aria-disabled={!prevChapter}
			>
				<ChevronLeft size={14} />
				<span class="hidden sm:inline">Prev</span>
			</a>

			<div class="h-3.5 w-px bg-black/10 dark:bg-white/10 mx-0.5"></div>

			<a
				href={nextChapter ? `/app/books/${bookId}/chapters/${nextChapter.id}` : undefined}
				class={`flex h-8 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all ${
					nextChapter
						? 'hover:bg-white hover:shadow-xs hover:text-black dark:hover:bg-[#221e1a] dark:hover:text-white'
						: 'opacity-30 cursor-not-allowed pointer-events-none'
				}`}
				use:ripple={{ disabled: !nextChapter }}
				title={nextChapter ? `Next Chapter (Ch. ${nextChapter.seq + 1})` : 'No next chapter'}
				aria-disabled={!nextChapter}
			>
				<span class="hidden sm:inline">Next</span>
				<ChevronRight size={14} />
			</a>
		</div>
	</div>

	<!-- ROW 2: PRIMARY ACTIONS (DESKTOP: FULL CENTERED, NARROW: COMPACT ROW WITH VERTICAL ELLIPSIS POPOVER) -->
	<input
		type="file"
		accept="image/*"
		multiple
		class="hidden"
		bind:this={fileInput}
		on:change={handleFileChange}
	/>

	<!-- DESKTOP / WIDE SCREEN -->
	<div class="hidden sm:flex flex-wrap items-center justify-center gap-2 pt-0.5 w-full text-center">
		<Button
			variant="secondary"
			size="sm"
			disabled={uploading || running}
			title="Add images or drop folders"
			on:click={() => fileInput?.click()}
		>
			<Upload size={14} />
			<span>{uploading ? 'Uploading...' : 'Add Images'}</span>
		</Button>

		{#if totalPages > 0}
			<Button
				variant="secondary"
				size="sm"
				disabled={running}
				on:click={() => dispatch('openReslice')}
			>
				<Scissors size={14} />
				<span>Reslice</span>
			</Button>

			<Button
				variant="secondary"
				size="sm"
				disabled={running}
				on:click={() => dispatch('clearProgress')}
			>
				<RotateCcw size={14} />
				<span>Clear Progress</span>
			</Button>

			<Button
				variant="secondary"
				size="sm"
				disabled={running}
				class="text-red-600 hover:bg-red-500/10 dark:text-red-400"
				on:click={() => dispatch('clearAllPages')}
			>
				<FileX size={14} />
				<span>Clear Pages</span>
			</Button>

			{#if running}
				<Button
					variant="danger"
					size="sm"
					on:click={() => dispatch('cancel')}
				>
					<Square size={12} class="fill-current" />
					<span>Cancel</span>
				</Button>
			{:else}
				<Button
					variant="primary"
					size="sm"
					on:click={() => dispatch('translate')}
				>
					<Play size={14} />
					<span>Translate All</span>
				</Button>
			{/if}

			<Button
				variant="secondary"
				size="sm"
				disabled={exporting || running}
				title="Download this chapter as a ZIP (folder-based)"
				on:click={() => dispatch('exportZip')}
			>
				{#if exporting}
					<Loader2 size={14} class="animate-spin" />
				{:else}
					<Download size={14} />
				{/if}
				<span>{exporting ? `Exporting ${exportProgress}%` : 'Export ZIP'}</span>
			</Button>
		{/if}
	</div>

	<!-- EXPORT PROGRESS BAR — VISIBLE WHILE THE ZIP IS BEING ASSEMBLED AND DOWNLOADED -->
	{#if exporting}
		<div class="mx-auto w-full max-w-md px-4 pt-0.5">
			<div class="mb-1 flex items-center justify-between text-[10px] font-mono opacity-60">
				<span>Preparing ZIP…</span>
				<span>{exportProgress}%</span>
			</div>
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
				<!-- EXPORT PROGRESS WIDTH IS A RUNTIME PERCENTAGE -->
				<div
					class="h-full rounded-full bg-[#b23a2e] transition-all duration-200 dark:bg-[#e08a63]"
					style={`width: ${exportProgress}%`}
				></div>
			</div>
		</div>
	{/if}

	<!-- NARROW SCREEN: PRIMARY BUTTON + VERTICAL ELLIPSIS POPOVER MENU -->
	<div class="flex sm:hidden items-center justify-center gap-2 pt-0.5 w-full">
		<Button
			variant="secondary"
			size="sm"
			disabled={uploading || running}
			on:click={() => fileInput?.click()}
		>
			<Upload size={14} />
			<span>{uploading ? 'Uploading...' : 'Add Images'}</span>
		</Button>

		{#if totalPages > 0}
			{#if running}
				<Button
					variant="danger"
					size="sm"
					on:click={() => dispatch('cancel')}
				>
					<Square size={12} class="fill-current" />
					<span>Cancel</span>
				</Button>
			{:else}
				<Button
					variant="primary"
					size="sm"
					on:click={() => dispatch('translate')}
				>
					<Play size={14} />
					<span>Translate</span>
				</Button>
			{/if}
		{/if}

		<!-- VERTICAL ELLIPSIS POPOVER -->
		<ActionMenu
			items={chapterMenuItems}
			on:select={(e) => handleMenuAction(e.detail)}
			class="h-8 w-8 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5"
		/>
	</div>

	<!-- SECONDARY TOOLBAR: VIEW MODE TABS + WEBTOON CONFIG (CENTERED) -->
	{#if totalPages > 0}
		<div class="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 border-y border-black/[0.06] py-2 dark:border-white/[0.06] w-full">
			<!-- VIEW MODES (CENTERED) -->
			<div class="flex items-center gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.04] overflow-x-auto no-scrollbar">
				<button
					type="button"
					on:click={() => dispatch('changeViewMode', 'reader')}
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
						activeViewMode === 'reader'
							? 'bg-white text-black shadow-sm dark:bg-[#201c18] dark:text-white'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<BookOpen size={13} />
					<span>Webtoon</span>
				</button>

				<button
					type="button"
					on:click={() => dispatch('changeViewMode', 'grid')}
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
						activeViewMode === 'grid'
							? 'bg-white text-black shadow-sm dark:bg-[#201c18] dark:text-white'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<LayoutGrid size={13} />
					<span>Grid</span>
				</button>

				<button
					type="button"
					on:click={() => dispatch('changeViewMode', 'compare')}
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
						activeViewMode === 'compare'
							? 'bg-white text-black shadow-sm dark:bg-[#201c18] dark:text-white'
							: 'opacity-60 hover:opacity-100'
					}`}
					use:ripple
				>
					<Columns size={13} />
					<span>Compare</span>
				</button>
			</div>

			<!-- WEBTOON & GRID CONTROLS -->
			{#if activeViewMode === 'reader' || activeViewMode === 'grid'}
				<div class="flex items-center gap-2">
					<!-- OUTPUT / ORIGINAL TOGGLE -->
					<div class="flex items-center rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10">
						<button
							type="button"
							on:click={() => dispatch('changeWebtoonKind', 'output')}
							class={`rounded-md px-2 py-0.5 font-medium transition ${
								webtoonKind === 'output'
									? 'bg-[#b23a2e] text-white shadow-xs'
									: 'opacity-60 hover:opacity-100'
							}`}
						>
							Translated
						</button>
						<button
							type="button"
							on:click={() => dispatch('changeWebtoonKind', 'original')}
							class={`rounded-md px-2 py-0.5 font-medium transition ${
								webtoonKind === 'original'
									? 'bg-[#b23a2e] text-white shadow-xs'
									: 'opacity-60 hover:opacity-100'
							}`}
						>
							Original
						</button>
					</div>

					<!-- WIDTH SELECTOR (WEBTOON ONLY) -->
					{#if activeViewMode === 'reader'}
						<div class="hidden sm:flex items-center gap-1 rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10">
							{#each WIDTH_OPTIONS as w}
								<button
									type="button"
									on:click={() => dispatch('changeWebtoonWidth', w)}
									class={`rounded-md px-2 py-0.5 uppercase font-medium transition ${
										webtoonWidth === w
											? 'bg-black/10 font-bold dark:bg-white/10'
											: 'opacity-50 hover:opacity-100'
									}`}
								>
									{w}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
