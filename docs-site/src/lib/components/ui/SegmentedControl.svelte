<script context="module" lang="ts">
	export type SegmentOption = { value: string; label: string; variant?: 'cinnabar' | 'jade' | 'gold' };
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, tick, onMount } from 'svelte';

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- REQUIRED PROPS -- //

	export let options: SegmentOption[];

	// -- OPTIONAL PROPS -- //

	export let value = '';
	export let block = false;
	export let activeVariant: 'cinnabar' | 'jade' | 'gold' = 'cinnabar';
	let className = '';
	export { className as class };

	// -- STORES & DISPATCHERS -- //

	const dispatch = createEventDispatcher<{ change: string }>();

	// -- STATES FOR SLIDING ACTIVE PILL -- //

	let containerEl: HTMLDivElement | null = null;
	let indicatorStyle = '';

	const VARIANT_GRADIENTS = {
		cinnabar: 'bg-[#b23a2e] text-white shadow-xs',
		jade: 'bg-[#b23a2e] text-white shadow-xs',
		gold: 'bg-[#b23a2e] text-white shadow-xs',
	};

	function updateIndicator() {
		if (!containerEl) return;
		const activeBtn = containerEl.querySelector(`[data-val="${value}"]`) as HTMLElement | null;
		if (activeBtn) {
			const left = activeBtn.offsetLeft;
			const top = activeBtn.offsetTop;
			const width = activeBtn.offsetWidth;
			const height = activeBtn.offsetHeight;
			indicatorStyle = `transform: translate3d(${left}px, ${top}px, 0); width: ${width}px; height: ${height}px;`;
		}
	}

	$: if (!value && options && options.length > 0) {
		value = options[0].value;
	}

	$: if (value || options) {
		tick().then(updateIndicator);
	}

	onMount(() => {
		if (!value && options && options.length > 0) {
			value = options[0].value;
		}
		updateIndicator();
		window.addEventListener('resize', updateIndicator);
		return () => window.removeEventListener('resize', updateIndicator);
	});

	$: currentOption = options.find((o) => o.value === value);
	$: currentVariant = currentOption?.variant || activeVariant;
</script>

<!-- SLICK SEGMENTED CONTROL WITH ANIMATED SLIDING PILL -->
<div
	bind:this={containerEl}
	role="radiogroup"
	class={cn(
		'relative inline-flex items-center rounded-xl border border-black/10 bg-black/[0.03] p-1 text-[11px] sm:text-xs font-semibold dark:border-white/10 dark:bg-white/[0.04] shadow-2xs isolate select-none',
		block && 'flex w-full',
		className,
	)}
>
	<!-- ANIMATED GLIDING PILL BACKGROUND -->
	{#if indicatorStyle}
		<div
			class={cn(
				'absolute top-0 left-0 rounded-lg -z-10 transition-all duration-250 ease-out',
				VARIANT_GRADIENTS[currentVariant]
			)}
			style={indicatorStyle}
			aria-hidden="true"
		></div>
	{/if}

	{#each options as opt (opt.value)}
		<button
			type="button"
			role="radio"
			data-val={opt.value}
			aria-checked={value === opt.value}
			use:ripple
			on:click={() => {
				value = opt.value;
				dispatch('change', opt.value);
			}}
			class={cn(
				'relative z-10 rounded-lg px-3 py-1.5 font-bold transition-colors whitespace-nowrap text-center outline-none cursor-pointer',
				block && 'flex-1',
				value === opt.value
					? 'text-white'
					: 'opacity-65 hover:opacity-100 hover:text-inherit'
			)}
		>
			{opt.label}
		</button>
	{/each}
</div>
