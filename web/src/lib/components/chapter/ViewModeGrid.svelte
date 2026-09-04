<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	import { Badge, ActionMenu, Button, Checkbox, type MenuAction } from '$lib/components/ui';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Eye from 'lucide-svelte/icons/eye';
	import Languages from 'lucide-svelte/icons/languages';
	import Layers from 'lucide-svelte/icons/layers';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Square from 'lucide-svelte/icons/square';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import X from 'lucide-svelte/icons/x';

	// IMPORTED COMPONENTS
	import PageImage from '$lib/components/chapter/PageImage.svelte';
	import VirtualPageList from '$lib/components/chapter/VirtualPageList.svelte';

	export let pages: any[] = [];
	export let running = false;
	export let webtoonKind: 'output' | 'original' = 'output';
	export let draggedPageIndex: number | null = null;
	export let dragOverPageIndex: number | null = null;

	const dispatch = createEventDispatcher<{
		inspect: any;
		menuAction: { action: string; page: any };
		dragStart: { event: DragEvent; index: number };
		dragOver: { event: DragEvent; index: number };
		drop: { event: DragEvent; index: number };
		dragEnd: DragEvent;
		batchTranslate: { pageIds: number[] };
	}>();

	const statusVariant: Record<string, any> = {
		pending: 'neutral',
		queued: 'neutral',
		processing: 'warning',
		done: 'success',
		error: 'danger',
	};

	const statusLabel: Record<string, string> = {
		pending: 'Pending',
		queued: 'Queued',
		processing: 'Processing',
		done: 'Translated',
		error: 'Error',
	};

	const stepBadgeLabels: Record<string, string> = {
		preprocess: 'Cleaning...',
		analyze: 'Detect & OCR...',
		persist_regions: 'Saving...',
		term_extract: 'Extracting...',
		match_glossary: 'Glossary...',
		translate: 'Translating...',
		persist_translations: 'Saving...',
		clean: 'Inpainting...',
		typeset: 'Typesetting...',
		save_output: 'Saving...',
	};

	function getMenuItems(pg: any, idx: number, isJobRunning: boolean): MenuAction[] {
		const items: MenuAction[] = [];
		const isPageProcessing = pg.status === 'processing';
		const isPageQueued = pg.status === 'queued';
		const isBusy = isPageProcessing || isPageQueued;

		if (isPageProcessing) {
			items.push({
				value: 'cancel',
				label: 'Cancel Translation',
				icon: Square,
				danger: true,
			});
		} else if (isPageQueued) {
			items.push({
				value: 'cancel',
				label: 'Remove from Queue',
				icon: Square,
				danger: true,
			});
		} else {
			items.push({
				value: 'translate',
				label: pg.status === 'done' ? 'Re-translate Page' : 'Translate Page',
				icon: Languages,
				disabled: isBusy,
			});
		}

		items.push({
			value: 'inspect',
			label: 'Inspect Page',
			icon: Eye,
			disabled: isPageProcessing,
		});

		if (idx < pages.length - 1) {
			items.push({
				value: 'stitch',
				label: `Merge with Page ${pg.seq + 2}`,
				icon: Layers,
				disabled: isJobRunning || isBusy,
			});
		}

		items.push({
			value: 'reset',
			label: 'Clear Progress',
			icon: RotateCcw,
			disabled: isJobRunning || isBusy || (pg.status === 'pending' && !pg.outputPath),
		});

		items.push({
			value: 'delete',
			label: 'Delete Page',
			icon: Trash2,
			danger: true,
			disabled: isJobRunning || isBusy,
		});

		return items;
	}

	let clientRatios: Record<number, number> = {};

	function handleImgLoad(pageId: number, e: CustomEvent<{ naturalWidth?: number; naturalHeight?: number }>): void {
		const nw = e.detail?.naturalWidth;
		const nh = e.detail?.naturalHeight;
		if (nw && nh && nh > 0) {
			clientRatios[pageId] = nw / nh;
		}
	}

	// -- MULTI-PAGE SELECTION & BATCH TRANSLATION -- //
	let selectedPageIds = new Set<number>();

	$: erroredPagesCount = pages.filter((p) => p.status === 'error' || Boolean(p.error)).length;

	function toggleSelect(id: number, forced?: boolean) {
		const next = forced !== undefined ? forced : !selectedPageIds.has(id);
		if (next) {
			selectedPageIds.add(id);
		} else {
			selectedPageIds.delete(id);
		}
		selectedPageIds = new Set(selectedPageIds);
	}

	function selectAll() {
		selectedPageIds = new Set(pages.map((p) => p.id));
	}

	function selectAllErrored() {
		const errored = pages.filter((p) => p.status === 'error' || Boolean(p.error));
		selectedPageIds = new Set(errored.map((p) => p.id));
	}

	function clearSelection() {
		selectedPageIds = new Set();
	}

	function handleBatchTranslate() {
		if (selectedPageIds.size === 0) return;
		const pageIds = Array.from(selectedPageIds);
		selectedPageIds = new Set();
		dispatch('batchTranslate', { pageIds });
	}
</script>

<!-- GRID LAYOUT WRAPS VIRTUAL LIST - NATIVE CONTENT VISIBILITY PRESERVES MULTI-COLUMN SIZING -->
<div class="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
	<VirtualPageList {pages}>
		<svelte:fragment slot="default" let:page let:i>
			{@const idx = i}
			{@const isOutput = webtoonKind === 'output' && Boolean(page.outputPath)}
			{@const ratio = (page.width && page.height && page.height > 0)
				? (page.width / page.height)
				: (clientRatios[page.id] || null)}
			{@const ratioStyle = ratio
				? `aspect-ratio: ${ratio};`
				: 'aspect-ratio: 2 / 3;'}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				on:dragover={(e) => dispatch('dragOver', { event: e, index: idx })}
				on:drop={(e) => dispatch('drop', { event: e, index: idx })}
				on:dragend={(e) => dispatch('dragEnd', e)}
				class={cn(
					'group relative flex flex-col justify-between rounded-xl border p-3 transition-all sm:p-3.5',
					dragOverPageIndex === idx
						? 'z-10 scale-[1.02] border-[#b23a2e] bg-[#b23a2e]/5 ring-2 ring-[#b23a2e]/40'
						: selectedPageIds.has(page.id)
							? 'border-[#b23a2e] bg-[#b23a2e]/[0.03] ring-1 ring-[#b23a2e]/50'
							: 'border-black/[0.08] bg-white/40 hover:border-[#b23a2e]/40 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02]',
					draggedPageIndex === idx && 'scale-95 opacity-40',
				)}
				data-page-seq={page.seq}
				data-page-id={page.id}
			>
				<div class="min-w-0">
					<div class="mb-2 flex min-w-0 items-center justify-between gap-1.5">
						<div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
							<Checkbox
								checked={selectedPageIds.has(page.id)}
								on:change={(e) => toggleSelect(page.id, e.detail)}
							/>
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<span
								draggable="true"
								on:dragstart={(e) => dispatch('dragStart', { event: e, index: idx })}
								on:dragend={(e) => dispatch('dragEnd', e)}
								class="flex shrink-0 cursor-grab select-none items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold transition hover:bg-black/5 active:cursor-grabbing dark:hover:bg-white/5"
							>
								<GripVertical size={13} class="opacity-40" /> Page {page.seq + 1}
							</span>
							<Badge variant={statusVariant[page.status]} class="truncate text-[10px] sm:text-xs">
								{#if page.status === 'processing'}
									{page.currentStep
										? stepBadgeLabels[page.currentStep] || page.currentStep
										: 'Processing...'}
								{:else}
									{statusLabel[page.status]}
								{/if}
							</Badge>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								disabled={page.status === 'processing'}
								on:click={() => dispatch('inspect', page)}
								use:ripple
								title="Inspect Page"
								class="flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-xs font-semibold transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/5 dark:bg-white/5 dark:hover:bg-white/10 dark:disabled:hover:bg-white/5"
							>
								<Eye size={12} />
								<span class="hidden min-[400px]:inline">Inspect</span>
							</button>
							<ActionMenu
								items={getMenuItems(page, idx, running)}
								on:select={(e) => dispatch('menuAction', { action: e.detail, page })}
							/>
						</div>
					</div>

					<!-- IMAGE CONTAINER (FULL RESOLUTION WITH NATIVE LAZY LOADING) -->
					<div
						class="relative overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/10"
						style={ratioStyle}
					>
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
						<PageImage
							src={`/api/pages/${page.id}/file?kind=${isOutput ? 'output' : 'original'}&rev=${isOutput ? (page.outputRev ?? 0) : (page.originalRev ?? 0)}`}
							alt={`Page ${page.seq + 1}`}
							imgClass={`w-full h-full object-contain ${page.status === 'processing' ? 'opacity-80' : ''}`}
							on:load={(e) => handleImgLoad(page.id, e)}
							on:click={(e) => page.status !== 'processing' && dispatch('inspect', page)}
						/>
					</div>

					{#if page.error}
						<div class="mt-2 flex items-center justify-between gap-2 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-400">
							<span class="truncate">{page.error}</span>
							<button
								type="button"
								use:ripple
								on:click|stopPropagation={() => dispatch('menuAction', { action: 'translate', page })}
								class="shrink-0 font-semibold underline hover:text-red-700 dark:hover:text-red-300"
							>
								Retry
							</button>
						</div>
					{/if}
				</div>
			</div>
		</svelte:fragment>
	</VirtualPageList>
</div>

<!-- MULTI-PAGE BATCH SELECTION TOOLBAR -->
{#if selectedPageIds.size > 0}
	<div
		transition:fly={{ y: 40, duration: 250, easing: cubicOut }}
		class="fixed bottom-6 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-black/15 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#1a1714]/95 sm:gap-4 sm:px-4 sm:py-2.5"
	>
		<div class="flex items-center gap-2 text-xs font-semibold">
			<span
				class="shadow-xs flex h-6 w-6 items-center justify-center rounded-lg bg-[#b23a2e] font-mono text-[11px] font-bold text-white"
			>
				{selectedPageIds.size}
			</span>
			<span class="hidden sm:inline">Selected</span>
			<span class="font-mono text-[11px] opacity-60">({selectedPageIds.size}/{pages.length})</span>
		</div>

		<div class="h-4 w-px bg-black/10 dark:bg-white/10"></div>

		<div class="flex items-center gap-1.5 sm:gap-2">
			<Button
				variant="primary"
				size="sm"
				disabled={running}
				class="h-8 gap-1.5 px-3 text-xs font-bold shadow-sm sm:h-9 sm:px-3.5 sm:text-sm"
				on:click={handleBatchTranslate}
				title={`Translate selected ${selectedPageIds.size} pages`}
			>
				<Languages size={13} />
				<span>Translate ({selectedPageIds.size})</span>
			</Button>

			{#if erroredPagesCount > 0}
				<Button
					variant="secondary"
					size="sm"
					class="h-8 gap-1 border-amber-600/30 px-2.5 text-xs font-semibold text-amber-700 hover:border-amber-600/60 sm:h-9 dark:border-amber-400/30 dark:text-amber-400"
					on:click={selectAllErrored}
					title={`Select all ${erroredPagesCount} errored pages`}
				>
					<AlertCircle size={12} />
					<span class="hidden sm:inline">Select Errored ({erroredPagesCount})</span>
					<span class="sm:hidden">Errored ({erroredPagesCount})</span>
				</Button>
			{/if}

			<Button
				variant="secondary"
				size="sm"
				class="h-8 px-2.5 text-xs font-semibold sm:h-9"
				on:click={selectedPageIds.size === pages.length ? clearSelection : selectAll}
			>
				{selectedPageIds.size === pages.length ? 'Deselect All' : 'Select All'}
			</Button>

			<button
				type="button"
				use:ripple
				on:click={clearSelection}
				class="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-black/5 opacity-70 transition hover:bg-black/10 hover:opacity-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
				title="Clear selection"
				aria-label="Clear selection"
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}
