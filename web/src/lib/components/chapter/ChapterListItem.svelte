<!--
	CHAPTER LIST ITEM COMPONENT (web/src/lib/components/chapter/ChapterListItem.svelte)
	Encapsulates rendering for Grid, List, and Compact view modes with direct reactive
	bindings to batchTracker and jobTracker stores for instant live progress telemetry.
-->
<script lang="ts">
	// -- IMPORTS -- //
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	// IMPORTED ICONS
	import Check from 'lucide-svelte/icons/check';
	import Square from 'lucide-svelte/icons/square';
	import Play from 'lucide-svelte/icons/play';
	import Download from 'lucide-svelte/icons/download';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Languages from 'lucide-svelte/icons/languages';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Pencil from 'lucide-svelte/icons/pencil';
	import FileX from 'lucide-svelte/icons/file-x';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import LazyImage from '$lib/components/ui/LazyImage.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import { ripple } from '$lib/actions/ripple';
	import { batchTracker } from '$lib/stores/batch-tracker';
	import { jobTracker } from '$lib/stores/job-tracker';
	import type { Chapter } from '$lib/types';

	// -- PROPS -- //
	export let chapter: Chapter;
	export let bookId: string;
	export let bookTitle: string = '';
	export let bookTitleTarget: string = '';
	export let viewLayout: 'grid' | 'list' | 'compact' = 'grid';
	export let isSelected: boolean = false;

	const dispatch = createEventDispatcher<{
		toggleSelect: { id: number; event?: MouseEvent | KeyboardEvent };
		editChapter: { chapter: Chapter };
		clearPages: { chapter: Chapter };
		deleteChapter: { chapter: Chapter };
	}>();

	const statusVariant: Record<Chapter['status'], 'neutral' | 'amber' | 'jade' | 'cinnabar'> = {
		pending: 'neutral',
		processing: 'amber',
		done: 'jade',
		error: 'cinnabar',
	};

	// -- REACTIVE LIVE TELEMETRY CALCULATOR -- //
	$: currentBatchItem = $batchTracker.active
		? $batchTracker.queue.find((q) => q.id === chapter.id)
		: null;

	$: jobState = $jobTracker.jobs[chapter.id];
	$: isJobRunning = Boolean(jobState?.running);
	$: snap = jobState?.snapshot;

	$: isBatchActive =
		$batchTracker.active &&
		($batchTracker.status === 'running' || $batchTracker.status === 'paused');

	$: isAlreadyQueued = Boolean(
		currentBatchItem &&
		(currentBatchItem.status === 'queued' || currentBatchItem.status === 'processing' || currentBatchItem.status === 'reslicing')
	) || isJobRunning;

	$: liveProg = (() => {
		if (currentBatchItem) {
			if (currentBatchItem.status === 'reslicing') {
				return {
					isLive: true,
					running: true,
					phaseLabel: 'Smart Re-slicing...',
					currentPhase: 'reslicing',
					completedPages: 0,
					totalPages: chapter.pageCount,
					percent: 0,
					isComplete: false,
					effectiveStatus: 'processing' as const,
				};
			}
			if (currentBatchItem.status === 'queued') {
				const done = currentBatchItem.translatedPages || chapter.translatedPageCount || 0;
				const total = chapter.pageCount || 0;
				return {
					isLive: true,
					running: false,
					phaseLabel: 'Queued',
					currentPhase: 'queued',
					completedPages: done,
					totalPages: total,
					percent: total > 0 ? Math.round((done / total) * 100) : 0,
					isComplete: false,
					effectiveStatus: 'pending' as const,
				};
			}
			if (currentBatchItem.status === 'processing') {
				const done = currentBatchItem.translatedPages || 0;
				const total = currentBatchItem.totalPages || chapter.pageCount || 0;
				const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
				return {
					isLive: true,
					running: true,
					phaseLabel: 'Translating...',
					currentPhase: 'phase3_typeset',
					completedPages: done,
					totalPages: total,
					percent,
					isComplete: false,
					effectiveStatus: 'processing' as const,
				};
			}
			if (currentBatchItem.status === 'done') {
				const total = currentBatchItem.totalPages || chapter.pageCount || 0;
				const done = chapter.translatedPageCount !== undefined ? chapter.translatedPageCount : (currentBatchItem.translatedPages || total);
				const isReallyDone = total > 0 && done === total;
				return {
					isLive: true,
					running: false,
					phaseLabel: isReallyDone ? 'Done' : '',
					currentPhase: undefined,
					completedPages: done,
					totalPages: total,
					percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
					isComplete: isReallyDone,
					effectiveStatus: isReallyDone ? ('done' as const) : ('pending' as const),
				};
			}
			if (currentBatchItem.status === 'error') {
				const done = currentBatchItem.translatedPages || chapter.translatedPageCount || 0;
				const total = chapter.pageCount || 0;
				return {
					isLive: true,
					running: false,
					phaseLabel: 'Error',
					currentPhase: undefined,
					completedPages: done,
					totalPages: total,
					percent: total > 0 ? Math.round((done / total) * 100) : 0,
					isComplete: false,
					effectiveStatus: 'error' as const,
				};
			}
			if (currentBatchItem.status === 'cancelled' || currentBatchItem.status === 'skipped') {
				const done = chapter.translatedPageCount !== undefined ? chapter.translatedPageCount : (currentBatchItem.translatedPages || 0);
				const total = chapter.pageCount || 0;
				const isComplete = total > 0 && done === total;
				return {
					isLive: true,
					running: false,
					phaseLabel: isComplete ? 'Done' : currentBatchItem.status === 'cancelled' ? 'Cancelled' : 'Skipped',
					currentPhase: undefined,
					completedPages: done,
					totalPages: total,
					percent: total > 0 ? Math.round((done / total) * 100) : 0,
					isComplete,
					effectiveStatus: isComplete ? ('done' as const) : ('pending' as const),
				};
			}
		}

		if (isJobRunning && snap) {
			const total = snap.totalPages || snap.pages.length || chapter.pageCount || 0;
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
				effectiveStatus: 'processing' as const,
			};
		}

		const total = chapter.pageCount || 0;
		const done = chapter.translatedPageCount || 0;
		const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
		const isComplete = total > 0 && done === total;
		const isProcessing = chapter.status === 'processing' && (isJobRunning || isBatchActive);
		const effectiveStatus: Chapter['status'] = isComplete
			? 'done'
			: isProcessing
				? 'processing'
				: chapter.status === 'error'
					? 'error'
					: 'pending';

		return {
			isLive: false,
			running: isProcessing,
			phaseLabel: isProcessing ? 'Processing...' : '',
			currentPhase: undefined,
			completedPages: done,
			totalPages: total,
			percent,
			isComplete,
			effectiveStatus,
		};
	})();

	$: actionMenuItems = [
		{ value: 'open', label: 'Open Reader', icon: ExternalLink },
		...(liveProg.isComplete || isAlreadyQueued
			? []
			: [{ value: 'translate', label: 'Translate Chapter', icon: Play }]),
		{ value: 'edit', label: 'Edit Chapter Details', icon: Pencil },
		...(chapter.pageCount > 0
			? [{ value: 'clearPages', label: 'Clear Pages', icon: FileX, danger: true }]
			: []),
		{ value: 'delete', label: 'Delete Chapter', icon: Trash2, danger: true },
	];

	function startSingleBatch() {
		batchTracker.startBatch(bookId, bookTitleTarget || bookTitle, [chapter]);
	}
</script>

{#if viewLayout === 'grid'}
	<!-- MODE 1: COMFORTABLE 2-COLUMN CARDS GRID -->
	<li
		id={`chapter-card-${chapter.id}`}
		data-chapter-seq={chapter.seq + 1}
		class={`group relative flex flex-col justify-between rounded-2xl border bg-white/60 p-3.5 transition-all duration-300 dark:bg-white/[0.02] sm:p-4 ${
			isSelected
				? 'border-[#b23a2e] shadow-md ring-2 ring-[#b23a2e]/30'
				: 'border-black/[0.08] hover:border-[#b23a2e]/40 hover:shadow-xl dark:border-white/[0.06]'
		}`}
	>
		<!-- UPPER SECTION: MINI PAGE THUMBNAIL + CHAPTER INFO -->
		<div class="flex items-start gap-3 sm:gap-3.5">
			<!-- 2:3 VERTICAL CHAPTER COVER THUMBNAIL WITH CHECKBOX OVERLAY -->
			<div class="relative w-20 shrink-0 sm:w-24">
				<a
					href={`/app/books/${bookId}/chapters/${chapter.id}/`}
					class="group/cover hover:scale-102 block transition-transform duration-300"
					title={`Open ${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}`}
				>
					<LazyImage
						src={chapter.coverPageId
							? `/api/pages/${chapter.coverPageId}/file?kind=thumb&w=260`
							: ''}
						alt={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
						fallbackText={`Ch.${chapter.seq + 1}`}
						aspectRatio="aspect-[2/3]"
						showSpineShadow={true}
					/>
				</a>

				<!-- CARD CHECKBOX TOGGLE -->
				<button
					type="button"
					on:click={(e) => dispatch('toggleSelect', { id: chapter.id, event: e })}
					class={`absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-md shadow-sm backdrop-blur transition-all ${
						isSelected
							? 'bg-[#b23a2e] text-white ring-1 ring-white/30'
							: 'bg-black/40 text-white/80 opacity-0 hover:bg-black/60 group-hover:opacity-100'
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
			<div class="flex min-w-0 flex-1 flex-col justify-between self-stretch">
				<div>
					<div class="flex items-start justify-between gap-1.5">
						<div class="min-w-0 flex-1">
							<a
								href={`/app/books/${bookId}/chapters/${chapter.id}/`}
								class="block truncate px-0.5 text-sm font-bold tracking-tight hover:text-[#b23a2e] dark:hover:text-[#e08a63] sm:text-base"
								title={chapter.titleTarget ||
									chapter.title ||
									`Chapter ${chapter.seq + 1}`}
							>
								{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
							</a>
							{#if chapter.titleTarget && chapter.title && chapter.titleTarget !== chapter.title}
								<p
									class="mt-0.5 truncate px-0.5 text-[11px] font-medium opacity-60 sm:text-xs"
									title={chapter.title}
								>
									{chapter.title}
								</p>
							{/if}
						</div>

						<div class="shrink-0">
							<ActionMenu
								items={actionMenuItems}
								on:select={(e) => {
									if (e.detail === 'open')
										goto(`/app/books/${bookId}/chapters/${chapter.id}/`);
									else if (e.detail === 'translate') startSingleBatch();
									else if (e.detail === 'edit') dispatch('editChapter', { chapter });
									else if (e.detail === 'clearPages') dispatch('clearPages', { chapter });
									else if (e.detail === 'delete') dispatch('deleteChapter', { chapter });
								}}
							/>
						</div>
					</div>

					<!-- STATUS & PAGE BADGES -->
					<div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
						{#if liveProg.running}
							<span
								class="inline-flex items-center gap-1 rounded-md bg-[#b23a2e]/10 px-2 py-0.5 font-bold text-[#b23a2e] dark:text-[#e08a63]"
							>
								<Loader2 size={11} class="animate-spin" />
								<span>{liveProg.phaseLabel}</span>
							</span>
						{:else}
							<Badge variant={statusVariant[liveProg.effectiveStatus]}>
								{liveProg.effectiveStatus.toUpperCase()}
							</Badge>
						{/if}
						<span
							class="rounded-md bg-black/5 px-2 py-0.5 font-medium opacity-70 dark:bg-white/5"
						>
							{chapter.pageCount}
							{chapter.pageCount === 1 ? 'page' : 'pages'}
						</span>
					</div>
				</div>

				<!-- CHAPTER PAGE PROGRESS BAR -->
				<div class="mt-2 sm:mt-2.5">
					<div class="mb-1 flex items-center justify-between text-[10px] sm:text-[11px]">
						<span class="truncate text-[10px] font-medium opacity-70">
							{#if liveProg.running}
								<span class="font-bold text-[#b23a2e] dark:text-[#e08a63]">
									Translating: {liveProg.completedPages}/{liveProg.totalPages} pgs ({liveProg.percent}%)
								</span>
							{:else if liveProg.isComplete}
								<span class="font-semibold text-emerald-600 dark:text-emerald-400"
									>✓ Translated</span
								>
							{:else}
								{liveProg.completedPages}/{chapter.pageCount} pgs ({liveProg.percent}%)
							{/if}
						</span>
						<span class="ml-1 shrink-0 font-mono text-[9px] opacity-40 sm:text-[10px]"
							>#{chapter.seq + 1}</span
						>
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
		<div
			class="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-2.5 text-xs dark:border-white/[0.05] sm:mt-3.5 sm:pt-3"
		>
			<a
				href={`/app/books/${bookId}/chapters/${chapter.id}/`}
				class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#b23a2e]/10 px-3.5 py-1.5 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black"
				use:ripple
			>
				<Play size={12} class="fill-current" />
				<span>Open Reader</span>
			</a>

			<div class="flex items-center gap-2">
				{#if chapter.pageCount > 0 && !liveProg.isComplete && !liveProg.running && !isAlreadyQueued}
					<button
						type="button"
						on:click={startSingleBatch}
						class="inline-flex items-center gap-1 text-[11px] font-medium opacity-70 transition hover:text-[#b23a2e] hover:opacity-100 cursor-pointer"
						title="Translate this chapter"
					>
						<Languages size={12} />
						<span>Translate</span>
					</button>
				{/if}

				{#if chapter.pageCount > 0}
					<a
						href={`/api/chapters/${chapter.id}/download`}
						class="inline-flex items-center gap-1 opacity-60 transition hover:text-[#b23a2e] hover:opacity-100"
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
{:else if viewLayout === 'list'}
	<!-- MODE 2: MEDIA LIST STRIP (RESPONSIVE ROWS) -->
	<li
		id={`chapter-card-${chapter.id}`}
		data-chapter-seq={chapter.seq + 1}
		class={`group relative flex items-center justify-between gap-3 rounded-xl border bg-white/60 p-2.5 transition-all dark:bg-white/[0.02] sm:gap-4 sm:p-3 ${
			isSelected
				? 'border-[#b23a2e] shadow-md ring-2 ring-[#b23a2e]/30'
				: 'border-black/[0.07] hover:border-[#b23a2e]/40 hover:bg-white hover:shadow-md dark:border-white/[0.06] dark:hover:bg-white/[0.04]'
		}`}
	>
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<!-- ROW CHECKBOX -->
			<button
				type="button"
				on:click={(e) => dispatch('toggleSelect', { id: chapter.id, event: e })}
				class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all ${
					isSelected
						? 'border-[#b23a2e] bg-[#b23a2e] text-white'
						: 'border-black/20 bg-transparent text-transparent hover:border-black/40 dark:border-white/20'
				}`}
				title={isSelected ? 'Deselect chapter' : 'Select chapter'}
				aria-label="Select chapter"
			>
				<Check size={13} />
			</button>

			<!-- MINI THUMBNAIL -->
			<a
				href={`/app/books/${bookId}/chapters/${chapter.id}/`}
				class="w-10 shrink-0 transition-transform duration-200 group-hover:scale-105 sm:w-12"
				title={`Open ${chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}`}
			>
				<LazyImage
					src={chapter.coverPageId
						? `/api/pages/${chapter.coverPageId}/file?kind=thumb&w=140`
						: ''}
					alt={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
					fallbackText={`#${chapter.seq + 1}`}
					aspectRatio="aspect-[2/3]"
					showSpineShadow={false}
					class="shadow-2xs rounded-lg"
				/>
			</a>

			<!-- TITLE & METADATA -->
			<div class="min-w-0 flex-1">
				<div class="flex min-w-0 items-center gap-1.5">
					<span
						class="py-0.2 shrink-0 rounded bg-black/5 px-1.5 font-mono text-[9px] font-bold opacity-60 dark:bg-white/5 sm:text-[10px]"
					>
						#{chapter.seq + 1}
					</span>
					<a
						href={`/app/books/${bookId}/chapters/${chapter.id}/`}
						class="block truncate px-0.5 text-xs font-bold hover:text-[#b23a2e] dark:hover:text-[#e08a63] sm:text-sm"
						title={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
					>
						{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
					</a>
					{#if chapter.titleTarget && chapter.title && chapter.titleTarget !== chapter.title}
						<span
							class="hidden truncate px-0.5 text-xs font-medium opacity-50 md:inline"
							title={chapter.title}
						>
							({chapter.title})
						</span>
					{/if}
				</div>

				<div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] opacity-65 sm:text-xs">
					<span>{chapter.pageCount} pgs</span>
					<span>•</span>
					{#if liveProg.running}
						<span
							class="flex items-center gap-1 font-bold text-[#b23a2e] dark:text-[#e08a63]"
						>
							<Loader2 size={11} class="animate-spin" />
							<span
								>{liveProg.phaseLabel} ({liveProg.completedPages}/{liveProg.totalPages})</span
							>
						</span>
					{:else}
						<span
							class={liveProg.isComplete
								? 'font-semibold text-emerald-600 dark:text-emerald-400'
								: ''}
						>
							{liveProg.isComplete
								? '100% Translated'
								: `${liveProg.completedPages}/${chapter.pageCount} translated`}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
			<Badge variant={statusVariant[liveProg.effectiveStatus]} class="hidden sm:inline-flex">
				{liveProg.effectiveStatus.toUpperCase()}
			</Badge>

			<a
				href={`/app/books/${bookId}/chapters/${chapter.id}/`}
				class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#b23a2e]/10 px-3 py-1.5 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63] dark:hover:bg-[#e08a63] dark:hover:text-black"
				use:ripple
			>
				<Play size={11} class="fill-current" />
				<span>Read</span>
			</a>

			{#if chapter.pageCount > 0}
				<a
					href={`/api/chapters/${chapter.id}/download`}
					class="hidden items-center justify-center p-1.5 opacity-60 hover:text-[#b23a2e] hover:opacity-100 sm:inline-flex"
					download
					title="Download ZIP"
				>
					<Download size={14} />
				</a>
			{/if}

			<ActionMenu
				items={actionMenuItems}
				on:select={(e) => {
					if (e.detail === 'open')
						goto(`/app/books/${bookId}/chapters/${chapter.id}/`);
					else if (e.detail === 'translate') startSingleBatch();
					else if (e.detail === 'edit') dispatch('editChapter', { chapter });
					else if (e.detail === 'clearPages') dispatch('clearPages', { chapter });
					else if (e.detail === 'delete') dispatch('deleteChapter', { chapter });
				}}
			/>
		</div>
	</li>
{:else}
	<!-- MODE 3: COMPACT ROWS (MOBILE NATIVE STREAM + DESKTOP TABLE) -->
	<div
		class={`flex items-center justify-between gap-2.5 p-2.5 transition ${isSelected ? 'bg-[#b23a2e]/5' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}`}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<button
				type="button"
				on:click={(e) => dispatch('toggleSelect', { id: chapter.id, event: e })}
				class={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
					isSelected
						? 'border-[#b23a2e] bg-[#b23a2e] text-white'
						: 'border-black/20 bg-transparent text-transparent dark:border-white/20'
				}`}
				aria-label="Select chapter"
			>
				<Check size={11} />
			</button>

			<span class="shrink-0 font-mono text-[11px] font-bold opacity-60">
				#{chapter.seq + 1}
			</span>
			<div class="min-w-0 flex-1">
				<a
					href={`/app/books/${bookId}/chapters/${chapter.id}/`}
					class="block truncate px-0.5 text-xs font-semibold hover:text-[#b23a2e] dark:hover:text-[#e08a63]"
					title={chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
				>
					{chapter.titleTarget || chapter.title || `Chapter ${chapter.seq + 1}`}
				</a>
				<div class="mt-0.5 flex items-center gap-1.5 text-[10px] opacity-60">
					{#if liveProg.running}
						<span class="font-bold text-[#b23a2e] dark:text-[#e08a63]">
							{liveProg.phaseLabel} ({liveProg.completedPages}/{liveProg.totalPages})
						</span>
					{:else}
						<span>{liveProg.completedPages}/{chapter.pageCount} pgs</span>
						<span>•</span>
						<span
							class={liveProg.effectiveStatus === 'done'
								? 'font-semibold text-emerald-600 dark:text-emerald-400'
								: ''}
						>
							{liveProg.effectiveStatus.toUpperCase()}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1">
			<a
				href={`/app/books/${bookId}/chapters/${chapter.id}/`}
				class="h-7.5 inline-flex items-center gap-1 rounded-lg bg-[#b23a2e]/10 px-2.5 py-1 text-xs font-semibold text-[#b23a2e] transition hover:bg-[#b23a2e] hover:text-white dark:text-[#e08a63]"
			>
				<Play size={10} class="fill-current" />
				<span>Read</span>
			</a>
			<ActionMenu
				items={actionMenuItems}
				on:select={(e) => {
					if (e.detail === 'open')
						goto(`/app/books/${bookId}/chapters/${chapter.id}/`);
					else if (e.detail === 'translate') startSingleBatch();
					else if (e.detail === 'edit') dispatch('editChapter', { chapter });
					else if (e.detail === 'clearPages') dispatch('clearPages', { chapter });
					else if (e.detail === 'delete') dispatch('deleteChapter', { chapter });
				}}
			/>
		</div>
	</div>
{/if}