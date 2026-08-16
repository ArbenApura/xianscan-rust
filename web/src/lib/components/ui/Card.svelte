<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	// PADDED INNER — SET false FOR EDGE-TO-EDGE CONTENT (e.g. A SCROLLING LIST)
	export let padded = true;
	let className = '';
	export { className as class };
</script>

<!-- CARD SURFACE — TRANSLUCENT TINT THAT LAYERS OVER ANY THEME BACKGROUND (ADAPTS VIA dark:) -->
<div
	class={cn(
		'rounded-2xl border border-black/[0.07] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02]',
		padded && 'p-4 sm:p-5',
		className,
	)}
>
	<slot />
</div>
