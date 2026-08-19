<!-- MULTI-CHAPTER IMPORT CONFIRMATION MODAL -->
<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { DiscoveredChapter } from '$lib/utils/folder-drop';

	// IMPORTED DEP-COMPONENTS
	import FolderTree from 'lucide-svelte/icons/folder-tree';
	import Layers from 'lucide-svelte/icons/layers';
	import FileStack from 'lucide-svelte/icons/file-stack';
	import FileImage from 'lucide-svelte/icons/file-image';

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
</script>

<Modal
	{open}
	title="Multi-Chapter Folders Detected"
	size="md"
	on:close={onClose}
>
	<div class="space-y-3.5 text-xs">
		<div class="flex items-center gap-2.5 rounded-xl border border-[#b23a2e]/20 bg-[#b23a2e]/5 p-3 text-[#b23a2e] dark:text-[#e08a63]">
			<FolderTree size={18} class="shrink-0" />
			<div class="space-y-0.5 min-w-0">
				<p class="font-bold text-xs">Found {chapters.length} chapters ({totalImages} total images)</p>
				<p class="text-[11px] opacity-80 leading-tight">
					Choose whether to create new chapters or merge all images into the current chapter.
				</p>
			</div>
		</div>

		<!-- PREVIEW LIST OF DISCOVERED CHAPTERS -->
		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-60 px-1">
				<span>Discovered Chapters</span>
				<span>Page Count</span>
			</div>

			<div class="max-h-56 overflow-y-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-1.5 space-y-1">
				{#each chapters as ch, idx}
					<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs bg-white/70 dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.04]">
						<div class="flex items-center gap-2 min-w-0">
							<span class="font-mono text-[10px] font-bold opacity-40">#{idx + 1}</span>
							<span class="font-medium truncate">{ch.title || ch.folderName}</span>
						</div>
						<span class="font-mono text-[11px] opacity-70 shrink-0 font-medium">
							{ch.files.length} pgs
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<Button
			variant="secondary"
			disabled={loading}
			on:click={onClose}
		>
			<span>Cancel</span>
		</Button>

		{#if showFlattenOption}
			<Button
				variant="secondary"
				class="gap-1.5"
				disabled={loading}
				on:click={onFlattenCurrent}
			>
				<FileStack size={15} />
				<span>Flatten to Ch. {currentChapterSeq + 1}</span>
			</Button>
		{/if}

		<Button
			variant="primary"
			class="gap-1.5"
			{loading}
			disabled={loading}
			on:click={onImportChapters}
		>
			<Layers size={15} />
			<span>Import as {chapters.length} Chapters</span>
		</Button>
	</svelte:fragment>
</Modal>

