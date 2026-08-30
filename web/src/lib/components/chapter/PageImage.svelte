<!-- PAGE IMAGE WITH HARDWARE-ACCELERATED NATIVE STREAMING -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';

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
	let hasError = false;

	// -- FUNCTIONS -- //
	function onImgLoad(e: Event): void {
		hasError = false;
		const target = e.target as HTMLImageElement | null;
		if (target && target.naturalWidth && target.naturalHeight) {
			dispatch('load', {
				naturalWidth: target.naturalWidth,
				naturalHeight: target.naturalHeight,
			});
		}
	}

	function onImgError(): void {
		hasError = true;
	}

	function handleRootClick(e: MouseEvent): void {
		dispatch('click', e);
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={el}
	on:click={handleRootClick}
	class={cn('relative h-full w-full overflow-hidden cursor-pointer')}
>
	{#if src}
		<img
			{src}
			{alt}
			draggable="false"
			decoding="async"
			loading={eager ? 'eager' : 'lazy'}
			class={cn('block h-full w-full select-none', imgClass)}
			on:load={onImgLoad}
			on:error={onImgError}
		/>
	{/if}

	{#if hasError}
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
