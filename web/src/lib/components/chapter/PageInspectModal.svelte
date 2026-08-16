<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Modal, Button } from '$lib/components/ui';
	import Copy from 'lucide-svelte/icons/copy';

	export let open = false;
	export let page: any | null = null;
	export let reloadKey = Date.now();

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	let inspectTab: 'output' | 'cleaned' | 'original' = 'output';
	let showRegions = true;
	let hoveredRegionId: number | null = null;
	let imageScrollContainer: HTMLDivElement | null = null;

	$: if (page) {
		if (page.outputPath) inspectTab = 'output';
		else if (page.cleanedPath) inspectTab = 'cleaned';
		else inspectTab = 'original';
	}

	function getBox(rawBox: any): { x: number; y: number; w: number; h: number } | null {
		if (!rawBox) return null;
		if (typeof rawBox === 'string') {
			try {
				return JSON.parse(rawBox);
			} catch {
				return null;
			}
		}
		if (typeof rawBox === 'object') return rawBox;
		return null;
	}

	function scrollToRegion(region: any) {
		const b = getBox(region.box);
		if (!b || !imageScrollContainer || !page?.height) return;
		const ratio = b.y / page.height;
		const scrollTarget = ratio * imageScrollContainer.scrollHeight - 60;
		imageScrollContainer.scrollTo({
			top: Math.max(0, scrollTarget),
			behavior: 'smooth',
		});
	}

	function copyInspectDebugInfo() {
		if (!page) return;
		const debug = {
			pageId: page.id,
			seq: page.seq,
			dimensions: { width: page.width, height: page.height },
			status: page.status,
			error: page.error,
			regionsCount: page.regions?.length ?? 0,
			regions: (page.regions || []).map((r: any) => ({
				id: r.id,
				seq: r.seq,
				confidence: r.conf,
				box: getBox(r.box),
				sourceOcr: r.textSource,
				translation: r.textTarget,
			})),
		};
		navigator.clipboard?.writeText(JSON.stringify(debug, null, 2));
		toast.success('Page debug JSON copied to clipboard.');
	}
</script>

<Modal
	{open}
	title={`Inspect Page ${page ? page.seq + 1 : ''} (ID: ${page?.id ?? ''})`}
	size="3xl"
	bodyClass="p-4 sm:p-5 overflow-hidden flex flex-col h-[82vh] max-h-[82vh]"
	on:close={() => dispatch('close')}
>
	{#if page}
		{@const pw = page.width}
		{@const ph = page.height}
		<div class="grid grid-cols-1 gap-5 lg:grid-cols-12 flex-1 min-h-0 h-full">
			<!-- IMAGE / OVERLAY COLUMN -->
			<div class="flex flex-col gap-2.5 lg:col-span-7 h-full min-h-0">
				<!-- TAB STRIP -->
				<div class="flex flex-wrap items-center gap-1.5 text-xs shrink-0">
					{#if page.outputPath}
						<button
							type="button"
							class={`rounded-lg px-3 py-1.5 font-medium transition ${
								inspectTab === 'output'
									? 'bg-[#b23a2e] text-white'
									: 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
							}`}
							on:click={() => (inspectTab = 'output')}
						>
							Typeset Output
						</button>
					{/if}

					{#if page.cleanedPath}
						<button
							type="button"
							class={`rounded-lg px-3 py-1.5 font-medium transition ${
								inspectTab === 'cleaned'
									? 'bg-[#b23a2e] text-white'
									: 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
							}`}
							on:click={() => (inspectTab = 'cleaned')}
						>
							LaMa Cleaned
						</button>
					{/if}

					<button
						type="button"
						class={`rounded-lg px-3 py-1.5 font-medium transition ${
							inspectTab === 'original'
								? 'bg-[#b23a2e] text-white'
								: 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
						}`}
						on:click={() => (inspectTab = 'original')}
					>
						Original Image
					</button>

					<div class="mx-1 h-4 w-px bg-black/10 dark:bg-white/10"></div>

					<!-- REGION MAP TOGGLE -->
					<button
						type="button"
						class={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
							showRegions
								? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
								: 'bg-black/5 text-black/60 hover:bg-black/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'
						}`}
						on:click={() => (showRegions = !showRegions)}
					>
						<span>🎯 Region Map</span>
						<span
							class={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
								showRegions
									? 'bg-black/20 text-white'
									: 'bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60'
							}`}
						>
							{showRegions ? 'On' : 'Off'}
						</span>
					</button>
				</div>

				<!-- SCROLLABLE IMAGE CONTAINER -->
				<div
					bind:this={imageScrollContainer}
					class="relative flex-1 min-h-0 overflow-y-auto rounded-xl border border-black/10 bg-neutral-950/[0.03] dark:border-white/10 dark:bg-neutral-950/40"
				>
					<div class="relative w-full">
						<img
							src={`/api/pages/${page.id}/file?kind=${inspectTab}&v=${reloadKey}`}
							alt={`Page ${page.seq + 1} ${inspectTab}`}
							class="block w-full h-auto select-none"
							loading="eager"
							decoding="async"
						/>
						{#if pw && ph}
							<svg
								class="pointer-events-none absolute inset-0 h-full w-full"
								viewBox="0 0 {pw} {ph}"
								preserveAspectRatio="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								{#each page.regions || [] as region (region.id)}
									{@const active = hoveredRegionId === region.id}
									{#if showRegions || active}
										{@const b = getBox(region.box)}
										{@const bx = b?.x ?? 0}
										{@const by = b?.y ?? 0}
										{@const bw = b?.w ?? 0}
										{@const bh = b?.h ?? 0}
										{@const stroke = '#b23a2e'}
										<rect
											x={bx}
											y={by}
											width={bw}
											height={bh}
											fill={active ? `${stroke}30` : 'none'}
											stroke={stroke}
											stroke-width={active ? 5 : 2.5}
											rx="4"
											opacity={active ? 1 : 0.75}
										/>
										<text
											x={bx + 6}
											y={by + 20}
											font-size="18"
											font-weight="bold"
											fill={stroke}
											stroke="#000"
											stroke-width="4"
											paint-order="stroke"
										>#{region.seq + 1}</text>
									{/if}
								{/each}
							</svg>
						{:else if showRegions}
							<div class="absolute inset-x-0 bottom-3 flex justify-center">
								<span class="rounded-lg bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
									Run the pipeline first to see bounding boxes
								</span>
							</div>
						{/if}
					</div>
				</div>

				{#if pw && ph}
					<p class="shrink-0 text-[10px] opacity-40 font-mono">{pw} × {ph} px · {page.regions?.length ?? 0} regions</p>
				{/if}
			</div>

			<!-- REGIONS LIST COLUMN -->
			<div class="flex flex-col gap-2.5 lg:col-span-5 h-full min-h-0">
				<div class="flex items-center justify-between gap-2 shrink-0">
					<h3 class="text-sm font-bold">
						Detected Regions ({page.regions?.length ?? 0})
					</h3>
				</div>

				{#if !page.regions || page.regions.length === 0}
					<p class="text-xs opacity-60">No text regions detected on this page yet.</p>
				{:else}
					<div class="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
						{#each page.regions as region (region.id)}
							{@const b = getBox(region.box)}
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<div
								class={`rounded-lg border p-3 text-xs transition-all cursor-pointer ${
									hoveredRegionId === region.id
										? 'border-[#b23a2e]/50 bg-[#b23a2e]/5 dark:border-[#e08a63]/40 dark:bg-[#e08a63]/5 shadow-sm'
										: 'border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] hover:border-black/20 dark:hover:border-white/20'
								}`}
								on:mouseenter={() => (hoveredRegionId = region.id)}
								on:mouseleave={() => (hoveredRegionId = null)}
								on:click={() => {
									hoveredRegionId = hoveredRegionId === region.id ? null : region.id;
									scrollToRegion(region);
								}}
							>
								<!-- HEADER ROW: sequence badge + confidence + box size -->
								<div class="flex items-center justify-between">
									<span class="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#b23a2e] bg-[#b23a2e]/10 dark:text-[#e08a63]">
										#{region.seq + 1}
									</span>
									<div class="flex items-center gap-2 font-mono text-[10px] opacity-50">
										{#if region.conf !== null}
											<span>{(region.conf * 100).toFixed(0)}% conf</span>
										{/if}
										{#if b}
											<span>{b.w}×{b.h}</span>
										{/if}
									</div>
								</div>

								{#if b}
									<div class="mt-1 font-mono text-[9px] opacity-30">
										({b.x}, {b.y}) {b.w}×{b.h} px
									</div>
								{/if}

								<!-- SOURCE OCR -->
								<div class="mt-2">
									<div class="mb-0.5 text-[10px] opacity-50">Source OCR</div>
									<div class="flex items-start gap-1">
										<span class="flex-1 break-words font-mono leading-snug">
											{region.textSource || '—'}
										</span>
										{#if region.textSource}
											<button
												type="button"
												title="Copy source text"
												class="mt-0.5 flex-shrink-0 rounded p-0.5 opacity-30 transition hover:bg-black/10 hover:opacity-80 dark:hover:bg-white/10"
												on:click={() => navigator.clipboard?.writeText(region.textSource)}
											>📋</button>
										{/if}
									</div>
								</div>

								<!-- AI TARGET -->
								{#if region.textTarget}
									<div class="mt-2 border-t border-black/[0.05] pt-1.5 dark:border-white/[0.05]">
										<div class="mb-0.5 text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63]">
											AI Translation
										</div>
										<div class="flex items-start gap-1">
											<span class="flex-1 break-words leading-snug">{region.textTarget}</span>
											<button
												type="button"
												title="Copy translation"
												class="mt-0.5 flex-shrink-0 rounded p-0.5 opacity-30 transition hover:bg-black/10 hover:opacity-80 dark:hover:bg-white/10"
												on:click={() => navigator.clipboard?.writeText(region.textTarget ?? '')}
											>📋</button>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		{#if page}
			<Button variant="secondary" on:click={copyInspectDebugInfo}>
				<Copy size={14} class="mr-1.5" />
				Copy Debug Data
			</Button>
		{/if}
		<Button on:click={() => dispatch('close')}>Close</Button>
	</svelte:fragment>
</Modal>
