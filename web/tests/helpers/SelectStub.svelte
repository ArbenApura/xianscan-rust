<!-- TEST STUB FOR ui/Select.svelte: A NATIVE <select> WITH THE SAME items / value / change CONTRACT -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let items: { value: string; label: string }[] = [];
	export let value = '';

	const dispatch = createEventDispatcher<{ change: string }>();
</script>

<select aria-label="font choice" {value} on:change={(e) => dispatch('change', e.currentTarget.value)}>
	{#each items as item (item.value)}
		<option value={item.value}>{item.label}</option>
	{/each}
</select>
