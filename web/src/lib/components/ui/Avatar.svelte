<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	// DISPLAY NAME / SEED — DRIVES INITIALS AND THE DETERMINISTIC GRADIENT
	export let name = '';
	// OPTIONAL PHOTO URL — OVERLAYS THE GRADIENT FALLBACK
	export let src: string | null = null;
	// SQUARE AVATAR SIZE IN PX
	export let size = 36;
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	// WARM, IN-WORLD GRADIENT PALETTE (CINNABAR / AMBER / JADE / GOLD / INK FAMILIES) — NO COLD SLATE/BLUE.
	// COMPLETE LITERAL CLASS STRINGS SO TAILWIND SCANS THEM; ONE IS PICKED BY HASH (NOT CONSTRUCTED AT RUNTIME).
	const GRADIENTS = [
		'from-[#b23a2e] to-[#7a241b]',
		'from-[#c9772e] to-[#8a3d1e]',
		'from-[#5b8a72] to-[#2f5a47]',
		'from-[#a97f28] to-[#6e4f17]',
		'from-[#8a5a3c] to-[#4f3324]',
		'from-[#9e3327] to-[#5a1e18]',
	];

	// -- REACTIVE STATES -- //

	$: initials =
		(name || '?')
			.replace(/@.*/, '')
			.split(/[\s._-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('') || '?';
	$: hash = [...(name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
	$: gradient = GRADIENTS[hash % GRADIENTS.length];
</script>

<!-- AVATAR — DETERMINISTIC GRADIENT INITIALS, OR A PHOTO WHEN PROVIDED (CONSOLIDATES 3 HAND-ROLLED COPIES) -->
<!-- SIZE + INITIALS FONT-SIZE ARE RUNTIME-DYNAMIC FROM THE size PROP — CANNOT BE STATIC TAILWIND CLASSES -->
<span
	class={cn(
		'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold text-white',
		gradient,
		className,
	)}
	style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.38)}px"
>
	{initials}
	{#if src}
		<img {src} alt="" class="absolute inset-0 h-full w-full object-cover" />
	{/if}
</span>
