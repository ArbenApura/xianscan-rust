<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- OPTIONAL PROPS -- //

	export let variant: 'neutral' | 'cinnabar' | 'jade' | 'gold' | 'sky' | 'violet' | 'amber' | 'emerald' | 'rose' =
		'neutral';
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	const VARIANTS = {
		neutral: 'bg-current/10 text-current opacity-70',
		cinnabar: 'bg-[#b23a2e]/12 text-[#b23a2e] dark:text-[#e08a63]',
		jade: 'bg-[#5b8a72]/14 text-[#4f7a64] dark:text-[#83b39a]',
		gold: 'bg-[#c9a24b]/16 text-[#a97f28] dark:text-[#d8b15a]',
		sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
		violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
		amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
		emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
		rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
	} as const;
</script>

<!-- BADGE PILL -->
<span
	class={cn(
		'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
		VARIANTS[variant],
		className,
	)}
>
	<slot />
</span>
