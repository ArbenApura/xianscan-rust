<!-- VIRTUAL PAGE LIST (RENDERS ONLY PAGES NEAR THE VIEWPORT) -->
<!-- USES HIGH-PERFORMANCE SINGLE-CONTAINER GEOMETRIC TRACKING -->
<!-- RESOLVES SCROLLBAR JUMPS INSTANTLY WITH ZERO LAYOUT REFLOW STORMS -->
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
	let containerEl: HTMLElement | null = null;
	let visibleCenter = Math.floor(windowSize / 2);
	let rafId: number | null = null;

	// -- COMPUTED -- //
	$: half = Math.floor(windowSize / 2);
	$: start = Math.max(0, visibleCenter - half - overscan);
	$: end = Math.min(Math.max(0, pages.length - 1), visibleCenter + half + overscan);

	// -- FUNCTIONS -- //
	function updateCenter(): void {
		if (!containerEl || !pages.length) return;
		const targetEl =
			containerEl.classList.contains('contents') && containerEl.parentElement
				? containerEl.parentElement
				: containerEl;
		const rect = targetEl.getBoundingClientRect();
		if (rect.height <= 0) return;

		const viewMidY = window.innerHeight / 2;
		const progress = (viewMidY - rect.top) / rect.height;
		const clampedProgress = Math.max(0, Math.min(1, progress));
		const newCenter = Math.round(clampedProgress * (pages.length - 1));

		if (newCenter !== visibleCenter) {
			visibleCenter = newCenter;
		}
	}

	function onScroll(): void {
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(() => {
			updateCenter();
			rafId = null;
		});
	}

	// -- REACTIVE STATEMENTS -- //
	$: if (pages.length && typeof window !== 'undefined') {
		updateCenter();
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		updateCenter();
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (rafId !== null) cancelAnimationFrame(rafId);
		}
	});
</script>

<div bind:this={containerEl} class="contents">
	{#each pages as page, i (page.id)}
		{#if i >= start && i <= end}
			<!-- REAL SLOT (RENDERED VIEW COMPONENT) -->
			<slot {page} {i} />
		{:else}
			<!-- SKELETON PLACEHOLDER DIV (KEEPS SCROLL POSITION STABLE) -->
			<div
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
</div>
