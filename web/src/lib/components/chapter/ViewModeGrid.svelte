<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ripple } from '$lib/actions/ripple';
	import { Badge, ActionMenu, type MenuAction } from '$lib/components/ui';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Eye from 'lucide-svelte/icons/eye';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Layers from 'lucide-svelte/icons/layers';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Square from 'lucide-svelte/icons/square';

	// IMPORTED COMPONENTS
	import PageImage from '$lib/components/chapter/PageImage.svelte';

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
	}>();

	const statusVariant: Record<string, any> = {
		pending: 'neutral',
		processing: 'warning',
		done: 'success',
		error: 'danger',
	};

	const statusLabel: Record<string, string> = {
		pending: 'Pending',
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

		if (isPageProcessing) {
			items.push({
				value: 'cancel',
				label: 'Cancel Translation',
				icon: Square,
				danger: true,
			});
		} else {
			items.push({
				value: 'translate',
				label: pg.status === 'done' ? 'Re-translate Page' : 'Translate Page',
				icon: Sparkles,
				disabled: isPageProcessing,
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
				disabled: isJobRunning || isPageProcessing,
			});
		}

		items.push({
			value: 'reset',
			label: 'Clear Progress',
			icon: RotateCcw,
			disabled: isJobRunning || isPageProcessing || (pg.status === 'pending' && !pg.outputPath),
		});

		items.push({
			value: 'delete',
			label: 'Delete Page',
			icon: Trash2,
			danger: true,
			disabled: isJobRunning || isPageProcessing,
		});

		return items;
	}
</script>

<div class="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each pages as page, idx (page.id)}
		{@const isOutput = webtoonKind === 'output' && Boolean(page.outputPath)}
		{@const hasRatio = Boolean(page.width && page.height)}
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			on:dragover={(e) => dispatch('dragOver', { event: e, index: idx })}
			on:drop={(e) => dispatch('drop', { event: e, index: idx })}
			on:dragend={(e) => dispatch('dragEnd', e)}
			class={`group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
				dragOverPageIndex === idx
					? 'z-10 scale-[1.02] border-[#b23a2e] bg-[#b23a2e]/5 ring-2 ring-[#b23a2e]/40'
					: 'border-black/[0.08] bg-white/40 hover:border-[#b23a2e]/40 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02]'
			} ${draggedPageIndex === idx ? 'scale-95 opacity-40' : ''}`}
			data-page-seq={page.seq}
			data-page-id={page.id}
			style="content-visibility: auto; contain-intrinsic-size: auto 380px;"
		>
			<div>
				<div class="mb-2 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<span
							draggable="true"
							on:dragstart={(e) => dispatch('dragStart', { event: e, index: idx })}
							on:dragend={(e) => dispatch('dragEnd', e)}
							class="flex cursor-grab select-none items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold transition hover:bg-black/5 active:cursor-grabbing dark:hover:bg-white/5"
						>
							<GripVertical size={13} class="opacity-40" /> Page {page.seq + 1}
						</span>
						<Badge
							variant={statusVariant[page.status]}
							class={page.status === 'processing' ? 'animate-pulse' : ''}
						>
							{#if page.status === 'processing'}
								{page.currentStep
									? stepBadgeLabels[page.currentStep] || page.currentStep
									: 'Processing...'}
							{:else}
								{statusLabel[page.status]}
							{/if}
						</Badge>
					</div>
					<div class="flex items-center gap-1.5">
						<button
							type="button"
							disabled={page.status === 'processing'}
							on:click={() => dispatch('inspect', page)}
							class="flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-xs font-semibold transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/5 dark:bg-white/5 dark:hover:bg-white/10 dark:disabled:hover:bg-white/5"
						>
							<Eye size={12} /> Inspect
						</button>
						<ActionMenu
							items={getMenuItems(page, idx, running)}
							on:select={(e) => dispatch('menuAction', { action: e.detail, page })}
						/>
					</div>
				</div>

				<!-- IMAGE CONTAINER (USES FAST 480PX MEMOIZED THUMBNAIL CACHE) -->
				<div
					class="relative overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/10"
					style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : 'aspect-ratio: 2 / 3;'}
				>
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<PageImage
						src={`/api/pages/${page.id}/file?kind=thumb&w=480&target=${isOutput ? 'output' : 'original'}&rev=${isOutput ? (page.outputRev ?? 0) : (page.originalRev ?? 0)}`}
						alt={`Page ${page.seq + 1}`}
						imgClass={`object-cover ${page.status === 'processing' ? 'opacity-80' : ''}`}
						on:click={(e) => page.status !== 'processing' && dispatch('inspect', page)}
					/>
				</div>

				{#if page.error}
					<p class="mt-2 text-xs text-red-600 dark:text-red-400">{page.error}</p>
				{/if}
			</div>
		</div>
	{/each}
</div>
