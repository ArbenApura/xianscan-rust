<!-- VIRTUAL PAGE LIST (RENDERS ONLY PAGES NEAR THE VIEWPORT) -->
<!-- USES HIGH-PERFORMANCE INTERSECTION OBSERVER TO SLIDE THE RENDER WINDOW -->
<!-- ELIMINATES SCROLL EVENT LISTENERS AND FORCED SYNCHRONOUS LAYOUT REFLOWS -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy } from 'svelte';

	// -- REQUIRED PROPS -- //
	export let pages: any[] = [];

	// -- OPTIONAL PROPS -- //
	// NUMBER OF PAGE SLOTS RENDERED AT ONCE (CENTERED ON VIEWPORT)
	export let windowSize: number = 9;
	// EXTRA SLOTS RENDERED BEYOND windowSize ON EACH SIDE AS A SCROLL BUFFER
	export let overscan: number = 2;
	// FALLBACK HEIGHT IN PX WHEN page.width/height ARE NOT YET AVAILABLE
	export let placeholderHeightPx: number = 600;
	// CSS CLASS APPLIED TO PLACEHOLDER OUTER DIV
	export let placeholderClass: string = 'w-full';
	// SKELETON VARIANT CONTROLS INNER CHROME: 'image' | 'card'
	export let skeletonVariant: 'image' | 'card' = 'image';

	// -- STATES -- //
	let visibleCenter = 0;
	let observer: IntersectionObserver | null = null;
	const visibleIndices = new Set<number>();

	// -- COMPUTED -- //
	$: half = Math.floor(windowSize / 2);
	$: start = Math.max(0, visibleCenter - half - overscan);
	$: end = Math.min(Math.max(0, pages.length - 1), visibleCenter + half + overscan);

	// -- FUNCTIONS -- //
	function updateCenterFromVisible(): void {
		if (visibleIndices.size === 0) return;
		let sum = 0;
		for (const idx of visibleIndices) {
			sum += idx;
		}
		const avg = Math.round(sum / visibleIndices.size);
		visibleCenter = Math.max(0, Math.min(pages.length - 1, avg));
	}

	function observeSlot(node: HTMLElement, index: number) {
		node.dataset.slotIndex = String(index);
		if (observer) {
			observer.observe(node);
		}
		return {
			update(newIndex: number) {
				node.dataset.slotIndex = String(newIndex);
			},
			destroy() {
				if (observer) {
					observer.unobserve(node);
				}
				visibleIndices.delete(index);
			},
		};
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		if (typeof IntersectionObserver !== 'undefined') {
			observer = new IntersectionObserver(
				(entries) => {
					let changed = false;
					for (const entry of entries) {
						const el = entry.target as HTMLElement;
						const idx = Number(el.dataset.slotIndex);
						if (Number.isInteger(idx)) {
							if (entry.isIntersecting) {
								if (!visibleIndices.has(idx)) {
									visibleIndices.add(idx);
									changed = true;
								}
							} else {
								if (visibleIndices.has(idx)) {
									visibleIndices.delete(idx);
									changed = true;
								}
							}
						}
					}
					if (changed) {
						updateCenterFromVisible();
					}
				},
				{
					root: null,
					// 300PX VIRTUAL BUFFER ABOVE AND BELOW FOR PREDICTIVE SLIDING
					rootMargin: '300px 0px',
					threshold: [0, 0.25, 0.5, 0.75, 1],
				},
			);
		}
	});

	onDestroy(() => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		visibleIndices.clear();
	});
</script>

{#each pages as page, i (page.id)}
	{#if i >= start && i <= end}
		<!-- REAL SLOT (RENDERED VIEW COMPONENT) -->
		<div use:observeSlot={i} class="contents">
			<slot {page} {i} />
		</div>
	{:else}
		<!-- SKELETON PLACEHOLDER DIV (KEEPS SCROLL POSITION STABLE) -->
		<div
			use:observeSlot={i}
			data-page-id={page.id}
			data-page-seq={page.seq}
			class={placeholderClass}
			style={page.width && page.height
				? `aspect-ratio: ${page.width} / ${page.height};`
				: `height: ${placeholderHeightPx}px;`}
			aria-hidden="true"
		>
			{#if skeletonVariant === 'card'}
				<!-- CARD SKELETON (HEADER + SHIMMER) -->
				<div
					class="flex h-full w-full flex-col gap-2 rounded-xl border border-black/[0.08] bg-white/40 p-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:p-3.5"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<div class="h-5 w-16 animate-pulse rounded bg-black/8 dark:bg-white/8" />
							<div class="h-5 w-14 animate-pulse rounded bg-black/8 dark:bg-white/8" />
						</div>
						<div class="h-6 w-16 animate-pulse rounded-md bg-black/8 dark:bg-white/8" />
					</div>
					<div
						class="relative min-h-0 flex-1 animate-pulse overflow-hidden rounded-lg bg-black/8 dark:bg-white/8"
						style={page.width && page.height
							? `aspect-ratio: ${page.width} / ${page.height};`
							: 'aspect-ratio: 2 / 3;'}
					>
						<div
							class="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent dark:via-white/8"
						/>
					</div>
				</div>
			{:else}
				<!-- IMAGE SKELETON (FULL BLEED SHIMMER) -->
				<div class="relative h-full w-full overflow-hidden bg-black/[0.06] dark:bg-white/[0.04]">
					<div
						class="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/15 to-transparent dark:via-white/6"
					/>
					<div class="absolute bottom-3 left-3 flex items-center gap-1.5">
						<div class="h-5 w-12 animate-pulse rounded bg-black/10 dark:bg-white/10" />
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/each}
