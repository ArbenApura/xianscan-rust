<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { ComponentType } from 'svelte';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	// OPTIONAL LUCIDE ICON COMPONENT SHOWN ABOVE THE TITLE
	export let icon: ComponentType | null = null;
	export let title = '';
	export let description = '';
	let className = '';
	export { className as class };
</script>

<!-- EMPTY / ZERO STATE — ICON + TITLE + DESCRIPTION + OPTIONAL ACTION SLOT -->
<div
	class={cn(
		'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/10 px-6 py-12 text-center dark:border-white/[0.08]',
		className,
	)}
>
	{#if icon}
		<svelte:component this={icon} size={28} class="opacity-30" />
	{/if}
	{#if title}<p class="text-sm font-semibold">{title}</p>{/if}
	{#if description}<p class="max-w-sm text-sm opacity-55">{description}</p>{/if}
	<!-- OPTIONAL ACTION (e.g. A CTA BUTTON) -->
	<slot />
</div>
