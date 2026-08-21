<!-- PAGE IMAGE WITH OPAQUE LOADING OVERLAY + REAL DOWNLOAD PROGRESS -->
<!-- FETCHES VIA XHR SO PERCENTAGE IS ACCURATE (NATIVE <IMG> EXPOSES NO PROGRESS) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	const dispatch = createEventDispatcher();

	// -- REQUIRED PROPS -- //
	export let src = '';
	export let alt = '';

	// -- OPTIONAL PROPS -- //
	export let imgClass = '';
	export let overlayClass = '';
	export let eager = false;

	// -- CONSTANTS -- //
	// CIRCULAR PROGRESS RING GEOMETRY (VIEWBOX 0 0 48 48)
	const RING_R = 20;
	const RING_C = 2 * Math.PI * RING_R;

	// -- STATES -- //
	let el: HTMLDivElement;
	let phase: 'loading' | 'done' | 'error' = 'loading';
	let percent = 0;
	let objectUrl: string | null = null;
	let xhr: XMLHttpRequest | null = null;
	let activeSrc = '';
	let isInView = false;

	// -- FUNCTIONS -- //

	// LOAD IMAGE OVER XHR TO TRACK REAL BYTE PROGRESS, THEN SWAP TO AN OBJECT URL.
	function doLoad(): void {
		xhr?.abort();
		percent = 0;
		phase = 'loading';
		const url = src;
		const next = new XMLHttpRequest();
		next.open('GET', url);
		next.responseType = 'blob';
		next.onprogress = (e) => {
			if (e.lengthComputable && e.total > 0) {
				percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
			}
		};
		next.onload = () => {
			if (next.status >= 200 && next.status < 300 && next.response) {
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				objectUrl = URL.createObjectURL(next.response);
				percent = 100;
			} else {
				phase = 'error';
			}
		};
		next.onerror = () => {
			phase = 'error';
		};
		xhr = next;
		next.send();
	}

	function onImgLoad(): void {
		phase = 'done';
	}

	function handleRootClick(e: MouseEvent): void {
		dispatch('click', e);
	}

	// -- REACTIVE STATEMENTS -- //
	// RELOAD WHEN THE SOURCE URL CHANGES (REV BUMP AFTER RE-TRANSLATION) — BUT ONLY
	// START THE FETCH ONCE THE ELEMENT IS NEAR THE VIEWPORT (LAZY) OR EAGER.
	$: if (src && src !== activeSrc) {
		activeSrc = src;
		if (eager || isInView) doLoad();
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		if (typeof IntersectionObserver !== 'undefined' && !eager && el) {
			const io = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						isInView = true;
						if (activeSrc === src) doLoad();
						io.disconnect();
					}
				},
				{ rootMargin: '200px 0px' },
			);
			io.observe(el);
		} else {
			isInView = true;
		}
	});

	onDestroy(() => {
		xhr?.abort();
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	});
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={el}
	on:click={handleRootClick}
	class={cn('relative h-full w-full', phase === 'loading' ? 'cursor-default' : 'cursor-pointer')}
>
	{#if src}
		<img
			src={objectUrl || src}
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
			on:error={() => (phase = 'error')}
		/>
	{/if}

	{#if phase === 'loading'}
		<!-- OPAQUE LOADING OVERLAY WITH REAL PROGRESS RING -->
		<div
			class={cn(
				'absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/85 backdrop-blur-[1px] dark:bg-[#1a1713]/85',
				overlayClass,
			)}
		>
			<div class="relative h-12 w-12 text-[#b23a2e] dark:text-[#e08a63]">
				<!-- PROGRESS RING — DYNAMIC DASHOFFSET AT RUNTIME -->
				<svg viewBox="0 0 48 48" class="h-full w-full -rotate-90" aria-hidden="true">
					<circle
						cx="24"
						cy="24"
						r={RING_R}
						fill="none"
						stroke-width="3.5"
						class="opacity-20"
						stroke="currentColor"
					/>
					<circle
						cx="24"
						cy="24"
						r={RING_R}
						fill="none"
						stroke-width="3.5"
						stroke-linecap="round"
						stroke="currentColor"
						stroke-dasharray={RING_C}
						stroke-dashoffset={RING_C * (1 - percent / 100)}
						class="transition-[stroke-dashoffset] duration-150 ease-out"
					/>
				</svg>
				<span class="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold">
					{percent}%
				</span>
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
			<span class="rounded bg-black/5 px-2 py-1 dark:bg-white/10">Couldn't load image</span>
		</div>
	{/if}
</div>
