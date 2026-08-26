<!-- MULTI-CHAPTER IMPORT CONFIRMATION MODAL -->
<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { DiscoveredChapter } from '$lib/utils/folder-drop';

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// IMPORTED DEP-COMPONENTS
	import FolderTree from 'lucide-svelte/icons/folder-tree';
	import Layers from 'lucide-svelte/icons/layers';
	import FileStack from 'lucide-svelte/icons/file-stack';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Circle from 'lucide-svelte/icons/circle';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';

	// -- REQUIRED PROPS -- //
	export let open = false;
	export let chapters: DiscoveredChapter[] = [];
	export let totalImages = 0;
	export let showFlattenOption = true;
	export let currentChapterSeq = 0;
	export let loading = false;

	// -- OPTIONAL PROPS -- //
	export let onImportChapters: () => void = () => {};
	export let onFlattenCurrent: () => void = () => {};
	export let onClose: () => void = () => {};

	// -- TYPES -- //
	type ImportMode = 'multi' | 'flatten';

	// -- STATES -- //
	let selectedMode: ImportMode = 'multi';

	// -- FUNCTIONS -- //
	function handleConfirm() {
		if (selectedMode === 'multi') {
			onImportChapters();
		} else {
			onFlattenCurrent();
		}
	}
</script>

<Modal
	{open}
	title="Multi-Chapter Folders Detected"
	size="md"
	on:close={onClose}
>
	<div class="space-y-3.5 text-xs">
		<!-- HEADER CALLOUT BANNER -->
		<div
			class="flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] p-3 text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
		>
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63]"
			>
				<FolderTree size={18} />
			</div>
			<div class="min-w-0 space-y-0.5">
				<p class="text-xs font-bold leading-tight">
					Discovered {chapters.length} chapter folder{chapters.length === 1 ? '' : 's'} ({totalImages} total pages)
				</p>
				<p class="text-[11px] leading-tight opacity-75">
					Select how you would like to import these pages into the book.
				</p>
			</div>
		</div>

		<!-- IMPORT STRATEGY CHOICE CARDS (SHOWN WHEN FLATTEN IS AVAILABLE) -->
		{#if showFlattenOption}
			<div class="space-y-1.5">
				<span class="block px-0.5 text-[11px] font-semibold uppercase tracking-wider opacity-60">
					Choose Import Mode
				</span>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<!-- OPTION 1: CREATE MULTIPLE CHAPTERS -->
					<button
						type="button"
						use:ripple
						on:click={() => (selectedMode = 'multi')}
						class={cn(
							'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
							selectedMode === 'multi'
								? 'border-[#b23a2e] bg-[#b23a2e]/5 shadow-xs ring-1 ring-[#b23a2e]/30 dark:border-[#e08a63] dark:bg-[#e08a63]/10 dark:ring-[#e08a63]/30'
								: 'border-black/10 bg-black/[0.02] hover:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20'
						)}
					>
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
								<Layers size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Create Chapters</span>
							</div>
							{#if selectedMode === 'multi'}
								<CheckCircle2 size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
							{:else}
								<Circle size={15} class="opacity-30" />
							{/if}
						</div>
						<p class="text-[11px] leading-snug opacity-75">
							Create {chapters.length} separate chapters in this book.
						</p>
					</button>

					<!-- OPTION 2: FLATTEN ALL INTO CURRENT CHAPTER -->
					<button
						type="button"
						use:ripple
						on:click={() => (selectedMode = 'flatten')}
						class={cn(
							'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
							selectedMode === 'flatten'
								? 'border-[#b23a2e] bg-[#b23a2e]/5 shadow-xs ring-1 ring-[#b23a2e]/30 dark:border-[#e08a63] dark:bg-[#e08a63]/10 dark:ring-[#e08a63]/30'
								: 'border-black/10 bg-black/[0.02] hover:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20'
						)}
					>
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
								<FileStack size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Merge into Current</span>
							</div>
							{#if selectedMode === 'flatten'}
								<CheckCircle2 size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
							{:else}
								<Circle size={15} class="opacity-30" />
							{/if}
						</div>
						<p class="text-[11px] leading-snug opacity-75">
							Append all {totalImages} pages into Chapter {currentChapterSeq + 1}.
						</p>
					</button>
				</div>
			</div>
		{/if}

		<!-- PREVIEW LIST OF DISCOVERED CHAPTERS -->
		<div class="space-y-1.5">
			<div class="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider opacity-60">
				<span>Discovered Folders</span>
				<span>Page Count</span>
			</div>

			<div class="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
				{#each chapters as ch, idx}
					<div class="flex items-center justify-between rounded-lg border border-black/[0.04] bg-white/70 px-2.5 py-1.5 text-xs dark:border-white/[0.04] dark:bg-white/[0.04]">
						<div class="flex min-w-0 items-center gap-2">
							<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-black/5 font-mono text-[10px] font-bold opacity-60 dark:bg-white/10">
								{idx + 1}
							</span>
							<span class="truncate font-medium">{ch.title || ch.folderName}</span>
						</div>
						<span class="shrink-0 font-mono text-[11px] font-medium opacity-70">
							{ch.files.length} pgs
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- RESPONSIVE UNCLUTTERED FOOTER -->
	<svelte:fragment slot="footer">
		<div class="flex w-full items-center justify-between gap-2.5">
			<Button
				variant="secondary"
				disabled={loading}
				on:click={onClose}
			>
				<span>Cancel</span>
			</Button>

			<Button
				variant="primary"
				class="gap-1.5"
				{loading}
				disabled={loading}
				on:click={handleConfirm}
			>
				{#if selectedMode === 'multi'}
					<Layers size={15} />
					<span>Import as {chapters.length} Chapters</span>
				{:else}
					<FileStack size={15} />
					<span>Merge into Ch. {currentChapterSeq + 1}</span>
				{/if}
			</Button>
		</div>
	</svelte:fragment>
</Modal>

