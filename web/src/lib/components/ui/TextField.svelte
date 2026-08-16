<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	export let value = '';
	export let label = '';
	export let placeholder = '';
	export let type: 'text' | 'url' | 'search' = 'text';
	export let inputClass = '';
	export let required = false;
</script>

<!-- TEXT FIELD: OPTIONAL LABEL + THEMED INPUT, FORWARDS NATIVE EVENTS -->
<label class="block">
	<!-- LABEL TEXT -->
	{#if label}<span class="mb-1 block text-xs font-medium opacity-60">{label}</span>{/if}

	<!-- INPUT — type IS BRANCHED (NOT DYNAMIC {type}) BECAUSE Svelte FORBIDS A DYNAMIC type WITH bind:value; outline-none SUPPRESSES THE NATIVE OUTLINE, FOCUS IS SHOWN VIA focus:border-[#c0392b] -->
	{#if type === 'search'}
		<input
			type="search"
			bind:value
			{placeholder}
			{required}
			class={cn(
				'w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#c0392b] focus:ring-2 focus:ring-[#c0392b]/30 dark:border-white/[0.06]',
				inputClass,
			)}
			on:input
			on:change
			on:keydown
		/>
	{:else if type === 'url'}
		<input
			type="url"
			bind:value
			{placeholder}
			{required}
			class={cn(
				'w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#c0392b] focus:ring-2 focus:ring-[#c0392b]/30 dark:border-white/[0.06]',
				inputClass,
			)}
			on:input
			on:change
			on:keydown
		/>
	{:else}
		<input
			type="text"
			bind:value
			{placeholder}
			{required}
			class={cn(
				'w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#c0392b] focus:ring-2 focus:ring-[#c0392b]/30 dark:border-white/[0.06]',
				inputClass,
			)}
			on:input
			on:change
			on:keydown
		/>
	{/if}
</label>
