<script lang="ts">
	// -- REQUIRED PROPS -- //
	export let pages: any[] = [];
</script>

<div class="contents">
	{#each pages as page, i (page.id)}
		<slot {page} {i} />
	{/each}
</div>

