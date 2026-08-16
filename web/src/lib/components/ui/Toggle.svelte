<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- OPTIONAL PROPS -- //

	export let checked = false;
	export let label = '';
	export let disabled = false;
	let className = '';
	export { className as class };
</script>

<!-- TOGGLE / SWITCH — CINNABAR WHEN ON (REPLACES BARE accent-* CHECKBOXES FOR ON/OFF SETTINGS) -->
<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	use:ripple={{ disabled }}
	on:click={() => (checked = !checked)}
	class={cn('inline-flex items-center gap-2.5 text-left text-sm disabled:opacity-40', className)}
>
	<span
		class={cn(
			'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
			checked ? 'bg-[#b23a2e]' : 'bg-black/20 dark:bg-white/20',
		)}
	>
		<!-- KNOB — SLIDES RIGHT WHEN ON -->
		<span
			class={cn(
				'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
				checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
			)}
		></span>
	</span>
	{#if label}<span>{label}</span>{/if}
</button>
