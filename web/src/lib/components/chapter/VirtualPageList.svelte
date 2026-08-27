<!-- VIRTUAL PAGE LIST — RENDERS ONLY PAGES NEAR THE VIEWPORT -->
<!-- USES window SCROLL EVENT + getBoundingClientRect SCAN SO THAT BOTH GRADUAL -->
<!-- SCROLLING AND SCROLLBAR JUMPS CORRECTLY ADVANCE THE RENDER WINDOW. -->
<!-- PAGES OUTSIDE THE WINDOW ARE REPLACED WITH SKELETON PLACEHOLDER DIVS SO -->
<!-- SCROLL POSITION AND LAYOUT REMAIN STABLE. NO HTTP CACHING IS ADDED. -->
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
	// CSS CLASS APPLIED TO PLACEHOLDER OUTER DIV (USEFUL FOR GRID VS WEBTOON)
	export let placeholderClass: string = 'w-full';
	// SKELETON VARIANT CONTROLS INNER CHROME: 'image' | 'card'
	// 'image'  — full-bleed shimmer fill (webtoon strip, compare panel)
	// 'card'   — rounded card with header row + image area (grid view)
	export let skeletonVariant: 'image' | 'card' = 'image';

	// -- STATES -- //
	// START AT THE BEGINNING OF THE LIST
	let visibleCenter = Math.floor(windowSize / 2);
	let rafId: number | null = null;

	// -- COMPUTED -- //
	$: half = Math.floor(windowSize / 2);
	$: start = Math.max(0, visibleCenter - half - overscan);
	$: end = Math.min(pages.length - 1, visibleCenter + half + overscan);

	// -- FUNCTIONS -- //

	// FIND THE PAGE INDEX (0-BASED) WHOSE ELEMENT CENTER IS NEAREST TO THE
	// VERTICAL MIDPOINT OF THE VISIBLE VIEWPORT. WORKS FOR BOTH GRADUAL SCROLL
	// AND SCROLLBAR JUMPS BECAUSE IT SCANS ALL [data-page-id] ELEMENTS IN THE DOM —
	// BOTH REAL RENDERED CARDS AND PLACEHOLDER DIVS ARE ALWAYS IN THE DOM.
	function updateCenter(): void {
		const viewMidY = window.innerHeight / 2;
		const allEls = document.querySelectorAll('[data-page-id]');
		if (!allEls.length) return;

		let bestIdx = visibleCenter;
		let bestDist = Infinity;

		allEls.forEach((el, idx) => {
			const rect = el.getBoundingClientRect();
			// USE THE ELEMENT CENTER FOR DISTANCE CALCULATION
			const elMidY = rect.top + rect.height / 2;
			const dist = Math.abs(elMidY - viewMidY);
			if (dist < bestDist) {
				bestDist = dist;
				bestIdx = idx;
			}
		});

		visibleCenter = Math.max(0, Math.min(pages.length - 1, bestIdx));
	}

	function onScroll(): void {
		// RAF-THROTTLE TO ONE UPDATE PER ANIMATION FRAME
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(() => {
			updateCenter();
			rafId = null;
		});
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		// onMount ONLY RUNS ON THE CLIENT — window IS ALWAYS DEFINED HERE
		window.addEventListener('scroll', onScroll, { passive: true });
		// INITIAL SCAN IN CASE THE PAGE LOADS MID-SCROLL (E.G. BFCACHE RESTORE)
		updateCenter();
	});

	onDestroy(() => {
		// onDestroy RUNS DURING SSR TOO — GUARD ALL BROWSER-ONLY APIS
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', onScroll);
			if (rafId !== null) cancelAnimationFrame(rafId);
		}
	});
</script>

{#each pages as page, i (page.id)}
	{#if i >= start && i <= end}
		<!-- REAL SLOT — PARENT FILLS WITH WEBTOON/GRID/COMPARE CARD -->
		<slot {page} {i} />
	{:else}
		<!-- SKELETON PLACEHOLDER — CORRECT SIZE SO SCROLL POSITION IS STABLE.       -->
		<!-- data-page-id AND data-page-seq MUST BE PRESENT SO updateCenter() CAN    -->
		<!-- LOCATE THIS PAGE WHEN IT IS OUTSIDE THE RENDER WINDOW.                  -->
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
				<!-- CARD SKELETON: ROUNDED BORDER + HEADER ROW + IMAGE SHIMMER AREA -->
				<div
					class="flex h-full w-full flex-col gap-2 rounded-xl border border-black/[0.08] bg-white/40 p-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:p-3.5"
				>
					<!-- HEADER ROW: PAGE LABEL PILL + STATUS BADGE + INSPECT BUTTON -->
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<div class="h-5 w-16 animate-pulse rounded bg-black/8 dark:bg-white/8" />
							<div class="h-5 w-14 animate-pulse rounded bg-black/8 dark:bg-white/8" />
						</div>
						<div class="h-6 w-16 animate-pulse rounded-md bg-black/8 dark:bg-white/8" />
					</div>
					<!-- IMAGE AREA SHIMMER -->
					<div
						class="relative min-h-0 flex-1 animate-pulse overflow-hidden rounded-lg bg-black/8 dark:bg-white/8"
						style={page.width && page.height
							? `aspect-ratio: ${page.width} / ${page.height};`
							: 'aspect-ratio: 2 / 3;'}
					>
						<!-- DIAGONAL SHIMMER SWEEP -->
						<div
							class="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent dark:via-white/8"
						/>
					</div>
				</div>
			{:else}
				<!-- IMAGE SKELETON: FULL-BLEED SHIMMER (WEBTOON / COMPARE COLUMNS) -->
				<div class="relative h-full w-full overflow-hidden bg-black/[0.06] dark:bg-white/[0.04]">
					<!-- DIAGONAL SHIMMER SWEEP -->
					<div
						class="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/15 to-transparent dark:via-white/6"
					/>
					<!-- PAGE NUMBER BADGE BOTTOM-LEFT -->
					<div class="absolute bottom-3 left-3 flex items-center gap-1.5">
						<div class="h-5 w-12 animate-pulse rounded bg-black/10 dark:bg-white/10" />
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/each}
