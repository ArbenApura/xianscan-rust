<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { ComponentType } from 'svelte';
	// IMPORTED DEP-MODULES
	import Info from 'lucide-svelte/icons/info';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import AlertOctagon from 'lucide-svelte/icons/alert-octagon';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	export let variant: 'note' | 'tip' | 'warning' | 'caution' = 'note';
	export let title: string | undefined = undefined;
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	const ICONS: Record<typeof variant, ComponentType> = {
		note: Info,
		tip: CheckCircle2,
		warning: AlertTriangle,
		caution: AlertOctagon,
	};

	const STYLES: Record<typeof variant, { wrapper: string; icon: string; title: string }> = {
		note: {
			wrapper: 'border-sky-500/30 bg-sky-500/5 text-sky-950 dark:text-sky-200',
			icon: 'text-sky-600 dark:text-sky-400',
			title: 'text-sky-900 dark:text-sky-300',
		},
		tip: {
			wrapper: 'border-[#4f7a64]/30 bg-[#4f7a64]/5 text-[#2b2320] dark:text-[#83b39a]',
			icon: 'text-[#4f7a64] dark:text-[#83b39a]',
			title: 'text-[#4f7a64] dark:text-[#83b39a]',
		},
		warning: {
			wrapper: 'border-[#a97f28]/30 bg-[#a97f28]/5 text-[#2b2320] dark:text-[#d8b15a]',
			icon: 'text-[#a97f28] dark:text-[#d8b15a]',
			title: 'text-[#a97f28] dark:text-[#d8b15a]',
		},
		caution: {
			wrapper: 'border-[#b23a2e]/30 bg-[#b23a2e]/5 text-[#2b2320] dark:text-[#e08a63]',
			icon: 'text-[#b23a2e] dark:text-[#e08a63]',
			title: 'text-[#b23a2e] dark:text-[#e08a63]',
		},
	};
</script>

<div class={cn('my-5 rounded-xl border p-4 text-xs leading-relaxed sm:text-sm', STYLES[variant].wrapper, className)}>
	<div class="flex items-start gap-3">
		<svelte:component this={ICONS[variant]} size={18} class={cn('mt-0.5 shrink-0', STYLES[variant].icon)} />
		<div class="flex-1">
			{#if title}
				<div class={cn('mb-1 font-semibold uppercase tracking-wider text-xs', STYLES[variant].title)}>
					{title}
				</div>
			{/if}
			<div class="opacity-90">
				<slot />
			</div>
		</div>
	</div>
</div>
