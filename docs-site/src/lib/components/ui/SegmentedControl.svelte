<script context="module" lang="ts">
	export type SegmentOption = { value: string; label: string; variant?: 'cinnabar' | 'jade' | 'gold' };
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';

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

	// -- ACTIVE STYLING RECORD -- //

	const ACTIVE_STYLES = {
		cinnabar: 'bg-[#b23a2e] text-white shadow-xs',
		jade: 'bg-[#4f7a64] text-white shadow-xs',
		gold: 'bg-[#a97f28] text-white shadow-xs',
	};
</script>

<!-- SEGMENTED CONTROL: RADIOGROUP WITH CINNABAR / JADE / GOLD ACTIVE PILL -->
<div
	role="radiogroup"
	class={cn(
		'inline-flex items-center rounded-xl border border-black/10 bg-black/5 p-0.5 sm:p-1 text-[11px] sm:text-xs md:text-sm dark:border-white/10 dark:bg-white/5',
		block && 'flex w-full',
		className,
	)}
>
	{#each options as opt (opt.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === opt.value}
			use:ripple
			on:click={() => {
				value = opt.value;
				dispatch('change', opt.value);
			}}
			class={cn(
				'rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 font-bold transition-all whitespace-nowrap text-center',
				block && 'flex-1',
				value === opt.value
					? ACTIVE_STYLES[opt.variant || activeVariant]
					: 'opacity-70 hover:opacity-100',
			)}
		>
			{opt.label}
		</button>
	{/each}
</div>
