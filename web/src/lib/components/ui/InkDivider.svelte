<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	let className = '';
	export { className as class };
</script>

<!-- INK-WASH SECTION DIVIDER (水墨) — TWO TAPERED BRUSH STROKES FLANKING A CINNABAR DIAMOND. DECORATIVE. -->
<div class={cn('flex items-center justify-center gap-3 opacity-60', className)} aria-hidden="true">
	<!-- LEFT TAPERED STROKE — fill-current INHERITS THE THEME INK COLOUR -->
	<svg viewBox="0 0 120 8" preserveAspectRatio="none" class="h-2 w-20 fill-current sm:w-28">
		<path d="M0 4 Q60 0 120 4 Q60 8 0 4 Z" />
	</svg>
	<!-- CINNABAR CENTRE MARK -->
	<span class="h-1.5 w-1.5 rotate-45 bg-[#b23a2e]"></span>
	<!-- RIGHT TAPERED STROKE -->
	<svg viewBox="0 0 120 8" preserveAspectRatio="none" class="h-2 w-20 fill-current sm:w-28">
		<path d="M0 4 Q60 0 120 4 Q60 8 0 4 Z" />
	</svg>
</div>
