<script lang="ts">
	// IMPORTED DEP-MODULES
	import Loader2 from 'lucide-svelte/icons/loader-2';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- OPTIONAL PROPS -- //

	export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' = 'secondary';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let type: 'button' | 'submit' = 'button';
	export let href: string | null = null;
	export let download: string | boolean | undefined = undefined;
	export let rel: string | undefined = undefined;
	export let target: string | undefined = undefined;
	export let disabled = false;
	export let loading = false;
	export let title: string | undefined = undefined;
	let ariaLabel: string | undefined = undefined;
	export { ariaLabel as 'aria-label' };
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	const BASE =
		'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';
	const VARIANTS = {
		primary: 'border-transparent bg-[#b23a2e] text-white hover:bg-[#c0392b] shadow-sm',
		secondary: 'border-black/10 hover:bg-black/5 dark:border-white/[0.08] dark:hover:bg-white/5',
		ghost: 'border-transparent opacity-80 hover:bg-current/5 hover:opacity-100',
		danger: 'border-transparent text-red-600 hover:bg-red-500/10 dark:text-red-400',
		destructive: 'border-transparent bg-[#a3342a] text-white hover:bg-[#b23a2e]',
	} as const;
	const SIZES = {
		sm: 'px-3 py-1.5 text-xs',
		md: 'px-4 py-2 text-sm',
		lg: 'px-5 py-2.5 text-base font-semibold',
	} as const;

	// -- REACTIVE STATES -- //

	$: classes = cn(BASE, VARIANTS[variant], SIZES[size], className);
</script>

<!-- LINK VARIANT (href provided) -->
{#if href}
	<a
		{href}
		{title}
		{download}
		{rel}
		{target}
		aria-label={ariaLabel}
		use:ripple={{ disabled }}
		class={cn(classes, disabled && 'pointer-events-none opacity-50')}
		{...$$restProps}
	><slot /></a>
	<!-- BUTTON VARIANT -->
{:else}
	<button
		{type}
		{title}
		aria-label={ariaLabel}
		{disabled}
		use:ripple={{ disabled }}
		class={classes}
		on:click
		{...$$restProps}
	>
		<!-- LOADING SPINNER -->
		{#if loading}<Loader2 size={16} class="animate-spin" />{/if}
		<slot />
	</button>
{/if}
