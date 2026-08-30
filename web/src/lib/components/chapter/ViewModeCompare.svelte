<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ripple } from '$lib/actions/ripple';
	import { Badge, ActionMenu, type MenuAction } from '$lib/components/ui';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import Eye from 'lucide-svelte/icons/eye';
	import Languages from 'lucide-svelte/icons/languages';
	import Layers from 'lucide-svelte/icons/layers';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Square from 'lucide-svelte/icons/square';

	// IMPORTED COMPONENTS
	import PageImage from '$lib/components/chapter/PageImage.svelte';
	import VirtualPageList from '$lib/components/chapter/VirtualPageList.svelte';

	export let pages: any[] = [];
	export let running = false;
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
</script>

<div class="flex w-full flex-col gap-6">
	<VirtualPageList {pages}>
		<svelte:fragment slot="default" let:page let:i>
			{@const idx = i}
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
				class={`group relative rounded-xl border p-4 transition-all ${
					dragOverPageIndex === idx
						? 'z-10 scale-[1.01] border-[#b23a2e] bg-[#b23a2e]/5 ring-2 ring-[#b23a2e]/40'
						: 'border-black/[0.08] bg-white/40 hover:border-[#b23a2e]/40 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02]'
				} ${draggedPageIndex === idx ? 'scale-95 opacity-40' : ''}`}
				data-page-seq={page.seq}
				data-page-id={page.id}
				style="content-visibility: auto; contain-intrinsic-size: auto 700px;"
			>
				<div class="mb-3 flex min-w-0 items-center justify-between gap-1.5 text-xs font-bold">
					<div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<span
							draggable="true"
							on:dragstart={(e) => dispatch('dragStart', { event: e, index: idx })}
							on:dragend={(e) => dispatch('dragEnd', e)}
							class="flex shrink-0 cursor-grab select-none items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-black/5 active:cursor-grabbing dark:hover:bg-white/5"
						>
							<GripVertical size={14} class="opacity-40" /> Page {page.seq + 1}
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
							on:click={() =>
								dispatch('inspect', { page, initialTab: page.outputPath ? 'output' : 'original' })}
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

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<!-- ORIGINAL PAGE COLUMN -->
					<div class="flex flex-col">
						<div
							class="group/img relative overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/10"
							style={ratioStyle}
						>
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
							<PageImage
								src={`/api/pages/${page.id}/file?kind=original&rev=${page.originalRev ?? 0}`}
								alt={`Page ${page.seq + 1} Original`}
								imgClass={`w-full h-full object-contain ${page.status === 'processing' ? 'opacity-80' : ''}`}
								on:load={(e) => handleImgLoad(page.id, e)}
								on:click={(e) =>
									page.status !== 'processing' &&
									dispatch('inspect', { page, initialTab: 'original' })}
							/>
							<div class="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5">
								<span
									class="rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur"
								>
									Original
								</span>
							</div>
						</div>
					</div>

					<!-- TRANSLATED / CLEANED OUTPUT COLUMN -->
					<div class="flex flex-col">
						{#if page.outputPath}
							<div
								class="group/img relative overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/10"
								style={ratioStyle}
							>
								<!-- svelte-ignore a11y-click-events-have-key-events -->
								<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
								<PageImage
									src={`/api/pages/${page.id}/file?kind=output&rev=${page.outputRev ?? 0}`}
									alt={`Page ${page.seq + 1} Output`}
									imgClass={`w-full h-full object-contain ${page.status === 'processing' ? 'opacity-80' : ''}`}
									on:load={(e) => handleImgLoad(page.id, e)}
									on:click={(e) =>
										page.status !== 'processing' &&
										dispatch('inspect', { page, initialTab: 'output' })}
								/>
								<div class="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5">
									<span
										class="rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur"
									>
										Translated
									</span>
								</div>
							</div>
						{:else}
							<div
								class="flex items-center justify-center rounded-lg border border-dashed border-black/20 text-xs opacity-50 dark:border-white/20"
								style={ratioStyle}
							>
								Translation not completed yet
							</div>
						{/if}
					</div>
				</div>
			</div>
		</svelte:fragment>
	</VirtualPageList>
</div>
