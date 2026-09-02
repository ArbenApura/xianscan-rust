<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { themeStore, THEME_PANEL } from '$lib/stores/theme';

	// -- OPTIONAL PROPS -- //

	export let padded = true;
	export let hover = false;
	let className = '';
	export { className as class };
</script>

<!-- CARD SURFACE — ADHERING TO DESIGN SYSTEM 3-THEME PANELS -->
<div
	class={cn(
		'rounded-2xl border shadow-xs backdrop-blur-sm transition-all duration-200',
		THEME_PANEL[$themeStore],
		hover && 'hover:-translate-y-0.5 hover:shadow-md hover:border-black/25 dark:hover:border-white/25',
		padded && 'p-6',
		className,
	)}
>
	<slot />
</div>