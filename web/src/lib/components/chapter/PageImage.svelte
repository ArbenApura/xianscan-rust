<!-- PAGE IMAGE WITH HARDWARE-ACCELERATED NATIVE STREAMING -->
<!-- USES BROWSER-NATIVE IMAGE DECODE AND INTERSECTION OBSERVER GATING -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	const dispatch = createEventDispatcher<{
		load: { naturalWidth: number; naturalHeight: number };
		click: MouseEvent;
	}>();

	// -- REQUIRED PROPS -- //
	export let src = '';
	export let alt = '';

	// -- OPTIONAL PROPS -- //
	export let imgClass = '';
	export let overlayClass = '';
	export let eager = false;

	// -- STATES -- //
	let el: HTMLDivElement;
	let phase: 'loading' | 'done' | 'error' = 'loading';
	let activeSrc = '';
	let isInView = false;
	let io: IntersectionObserver | null = null;

	// -- FUNCTIONS -- //
	function onImgLoad(e: Event): void {
		phase = 'done';
		const target = e.target as HTMLImageElement;
		if (target && target.naturalWidth && target.naturalHeight) {
			dispatch('load', {
				naturalWidth: target.naturalWidth,
				naturalHeight: target.naturalHeight,
			});
		}
	}

	function onImgError(): void {
		phase = 'error';
	}

	function handleRootClick(e: MouseEvent): void {
		dispatch('click', e);
	}

	// -- REACTIVE STATEMENTS -- //
	$: if (src && src !== activeSrc) {
		activeSrc = src;
		phase = 'loading';
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		if (typeof IntersectionObserver !== 'undefined' && !eager && el) {
			io = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						isInView = true;
						if (io) {
							io.disconnect();
							io = null;
						}
					}
				},
				{ rootMargin: '300px 0px' },
			);
			io.observe(el);
		} else {
			isInView = true;
		}
	});

	onDestroy(() => {
		if (io) {
			io.disconnect();
			io = null;
		}
	});
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={el}
	on:click={handleRootClick}
	class={cn('relative h-full w-full overflow-hidden', phase === 'loading' ? 'cursor-default' : 'cursor-pointer')}
>
	{#if activeSrc}
		<img
			src={activeSrc}
			{alt}
			draggable="false"
			decoding="async"
			loading={eager ? 'eager' : 'lazy'}
			class={cn(
				'block h-full w-full select-none transition-opacity duration-300 ease-out',
				imgClass,
				phase === 'done' ? 'opacity-100' : 'opacity-0',
			)}
			on:load={onImgLoad}
			on:error={onImgError}
		/>
	{/if}

	{#if phase === 'loading'}
		<!-- FAST SHIMMER AND SPINNER OVERLAY WITHOUT MEMORY OVERHEAD -->
		<div
			class={cn(
				'absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[1px] dark:bg-[#1a1713]/70',
				overlayClass,
			)}
		>
			<div class="relative h-9 w-9 text-[#b23a2e] dark:text-[#e08a63]">
				<svg viewBox="0 0 48 48" class="h-full w-full animate-spin" aria-hidden="true">
					<circle
						cx="24"
						cy="24"
						r="20"
						fill="none"
						stroke-width="3.5"
						class="opacity-20"
						stroke="currentColor"
					/>
					<circle
						cx="24"
						cy="24"
						r="20"
						fill="none"
						stroke-width="3.5"
						stroke-linecap="round"
						stroke="currentColor"
						stroke-dasharray="125.66"
						stroke-dashoffset="94.24"
					/>
				</svg>
			</div>
		</div>
	{:else if phase === 'error'}
		<!-- ERROR OVERLAY -->
		<div
			class={cn(
				'absolute inset-0 z-10 flex items-center justify-center bg-white/85 text-[11px] text-red-500 dark:bg-[#1a1713]/85',
				overlayClass,
			)}
		>
			<span class="rounded bg-black/5 px-2 py-1 dark:bg-white/10">Could not load image</span>
		</div>
	{/if}
</div>
