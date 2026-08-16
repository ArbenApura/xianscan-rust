<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- TYPES -- //

	type Option = { value: string; label: string };

	// -- REQUIRED PROPS -- //

	export let options: Option[];

	// -- OPTIONAL PROPS -- //

	export let value = '';
	// FULL-WIDTH (EACH SEGMENT flex-1) — DEFAULT true FOR THUMB-FRIENDLY MOBILE TARGETS
	export let block = true;
	let className = '';
	export { className as class };

	// -- STORES -- //

	const dispatch = createEventDispatcher<{ change: string }>();
</script>

<!-- SEGMENTED CONTROL — role=radiogroup, CINNABAR-FILLED ACTIVE SEGMENT (REPLACES AD-HOC SELECTED-PILL ROWS) -->
<div
	role="radiogroup"
	class={cn(
		'inline-flex overflow-hidden rounded-lg border border-black/[0.12] text-xs dark:border-white/[0.08]',
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
				'px-3 py-1.5 transition-colors',
				block && 'flex-1',
				value === opt.value ? 'bg-[#b23a2e] text-white' : 'opacity-70 hover:opacity-100',
			)}>{opt.label}</button
		>
	{/each}
</div>
