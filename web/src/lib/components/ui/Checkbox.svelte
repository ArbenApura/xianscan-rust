<script lang="ts">
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
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

<!-- CHECKBOX - CUSTOM CINNABAR BOX WITH REAL role/aria-checked (REPLACES BARE accent-* INPUTS) -->
<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	{disabled}
	use:ripple={{ disabled }}
	on:click={() => (checked = !checked)}
	class={cn('group inline-flex items-center gap-2 text-left text-sm disabled:opacity-40', className)}
>
	<span
		class={cn(
			'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
			checked
				? 'border-[#b23a2e] bg-[#b23a2e] text-white'
				: 'border-black/25 group-hover:border-black/40 dark:border-white/25 dark:group-hover:border-white/40',
		)}
	>
		{#if checked}<Check size={13} strokeWidth={3} />{/if}
	</span>
	{#if label}<span>{label}</span>{/if}
</button>
