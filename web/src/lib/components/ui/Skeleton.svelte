<script lang="ts">
	// -- REQUIRED PROPS -- //

	// SHIMMER PLACEHOLDER LINES SHOWN WHILE TRANSLATED TEXT IS STILL STREAMING IN
	export let lines = 6;

	// -- CONSTANTS -- //

	// CYCLING WIDTH PERCENTAGES TO GIVE SKELETON LINES A NATURAL VARIED LOOK
	const WIDTHS = [97, 92, 85, 96, 70, 88, 90, 78, 94, 82];
</script>

<!-- SKELETON PLACEHOLDER LINES -->
<div class="space-y-3" aria-hidden="true">
	{#each Array(lines) as _, i (i)}
		<!-- RUNTIME-DYNAMIC PER-ITEM WIDTH — CANNOT BE EXPRESSED AS A TAILWIND CLASS -->
		<div class="bg-current/10 h-4 rounded" style="width:{WIDTHS[i % WIDTHS.length]}%"></div>
	{/each}
</div>
