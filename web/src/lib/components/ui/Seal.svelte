<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	// THE GLYPH STAMPED IN THE SEAL — DEFAULT 仙 ("IMMORTAL / CULTIVATOR"), THE BRAND MARK
	export let char = '仙';
	// SQUARE SEAL SIZE IN PX
	export let size = 28;
	let className = '';
	export { className as class };
</script>

<!-- CINNABAR SEAL / CHOP (印章) — THE BRAND STAMP. DECORATIVE, NON-INTERACTIVE (NO RIPPLE). -->
<!-- SIZE + GLYPH SIZE ARE RUNTIME-DYNAMIC FROM THE size PROP — CANNOT BE STATIC TAILWIND CLASSES -->
<span
	class={cn(
		"inline-flex shrink-0 select-none items-center justify-center rounded-[5px] bg-[#b23a2e] font-['LXGW_WenKai_TC'] font-bold leading-none text-[#f7efe0] shadow-sm",
		className,
	)}
	style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.58)}px"
	aria-hidden="true">{char}</span
>
