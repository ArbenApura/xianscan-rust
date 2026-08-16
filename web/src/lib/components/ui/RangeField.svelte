<script lang="ts">
	// -- OPTIONAL PROPS -- //

	export let value = 0;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let label = '';
	export let display = '';
</script>

<!-- RANGE FIELD: LABEL + LIVE VALUE + THEMED SLIDER -->
<label class="block">
	<span class="flex items-center justify-between text-xs opacity-60">
		<span>{label}</span>
		<span class="tabular-nums">{display}</span>
	</span>
	<input type="range" {min} {max} {step} bind:value class="mt-1.5 w-full accent-[#b23a2e]" on:input on:change />
</label>
