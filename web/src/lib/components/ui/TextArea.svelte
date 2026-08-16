<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	export let value = '';
	export let label = '';
	export let placeholder = '';
	export let rows = 3;
	export let disabled = false;
	let inputClass = '';
	export { inputClass as class };
</script>

<!-- TEXTAREA FIELD — MATCHES TextField's BORDER + CINNABAR FOCUS RING (FILLS THE TextField TEXTAREA GAP) -->
<label class="block">
	{#if label}<span class="mb-1 block text-xs font-medium opacity-60">{label}</span>{/if}
	<textarea
		bind:value
		{placeholder}
		{rows}
		{disabled}
		class={cn(
			'w-full resize-y rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 disabled:opacity-50 dark:border-white/[0.06]',
			inputClass,
		)}
	></textarea>
</label>
