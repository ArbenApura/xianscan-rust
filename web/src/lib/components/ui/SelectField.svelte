<script lang="ts">
	// IMPORTED MODULES
	import Select, { type SelectOption } from './Select.svelte';
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //
	export let value: string = '';
	export let label = '';
	export let options: SelectOption[] = [];
	export let items: SelectOption[] = [];
	export let placeholder = 'Select…';
	export let disabled = false;
	let className = '';
	export { className as class };

	$: selectItems = items.length > 0 ? items : options;
</script>

<!-- SELECT FIELD: LABEL + PORTALED COMBOBOX SELECT (PORTALED TO document.body PREVENTING DIALOG OVERFLOW) -->
<div class={cn('block w-full', className)}>
	{#if label}
		<span class="mb-1 block text-xs font-medium opacity-60">{label}</span>
	{/if}
	<Select
		items={selectItems}
		bind:value
		{placeholder}
		{disabled}
		on:change
	/>
</div>
