<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import ImageOff from 'lucide-svelte/icons/image-off';

	export let src: string = '';
	export let alt: string = '';
	export let aspectRatio: string = 'aspect-[2/3]';
	export let showSpineShadow: boolean = true;
	export let fallbackText: string = '';
	let className: string = '';
	export { className as class };

	let loaded = false;
	let errored = false;
	let imgElement: HTMLImageElement;

	function handleLoad() {
		loaded = true;
		errored = false;
	}

	function handleError() {
		loaded = true;
		errored = true;
	}

	$: if (src) {
		loaded = false;
		errored = false;
		if (imgElement && imgElement.complete) {
			if (imgElement.naturalWidth > 0) {
				loaded = true;
			}
		}
	}
</script>

<div
	class={cn(
		'relative w-full overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5 select-none',
		aspectRatio,
		className,
	)}
>
	<!-- SKELETON PLACEHOLDER (ACTIVE UNTIL IMAGE LOADS) -->
	{#if !loaded}
		<div class="absolute inset-0 z-0 bg-black/5 dark:bg-white/5"></div>
	{/if}

	<!-- SPINE SHADOW GRADIENT (GIVES A TACTILE BOOK FEEL) -->
	{#if showSpineShadow}
		<div class="pointer-events-none absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/35 via-black/10 to-transparent z-10"></div>
	{/if}

	{#if src && !errored}
		<img
			bind:this={imgElement}
			{src}
			{alt}
			loading="lazy"
			decoding="async"
			on:load={handleLoad}
			on:error={handleError}
			class={cn(
				'h-full w-full object-cover transition-all duration-500 ease-out',
				loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
			)}
		/>
	{:else}
		<!-- FALLBACK WHEN NO IMAGE IS AVAILABLE OR ERROR -->
		<div class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-black/5 to-black/15 p-2 text-center dark:from-white/5 dark:to-white/15">
			{#if fallbackText}
				<span class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-xs font-bold text-[#b23a2e] dark:text-[#e08a63]">
					{fallbackText}
				</span>
			{:else}
				<ImageOff size={18} class="opacity-30" />
			{/if}
			<span class="mt-1 text-[10px] font-semibold opacity-40">No cover</span>
		</div>
	{/if}
</div>
