<!-- TEST STUB FOR ui/Select.svelte: A NATIVE <select> WITH THE SAME items / value / change CONTRACT -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let items: { value: string; label: string; action?: boolean }[] = [];
	export let value = '';

	const dispatch = createEventDispatcher<{ change: string; action: string }>();

	// AN ACTION ITEM FIRES `action` AND SNAPS BACK TO THE CURRENT VALUE, LIKE THE REAL SELECT
	function onChange(e: Event & { currentTarget: HTMLSelectElement }) {
		const picked = e.currentTarget.value;
		if (items.find((i) => i.value === picked)?.action) {
			e.currentTarget.value = value;
			dispatch('action', picked);
			return;
		}
		dispatch('change', picked);
	}
</script>

<select aria-label="font choice" {value} on:change={onChange}>
	{#each items as item (item.value)}
		<option value={item.value}>{item.label}</option>
	{/each}
</select>
