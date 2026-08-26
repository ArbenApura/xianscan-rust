<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- OPTIONAL PROPS -- //
	export let checked = false;
	export let label = '';
	export let disabled = false;
	export let ariaLabel = '';
	export let id: string | undefined = undefined;
	export let size: 'sm' | 'md' = 'md';
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //
	const dispatch = createEventDispatcher<{
		change: boolean;
		click: MouseEvent;
	}>();

	// UNIQUE ID FOR ACCESSIBLE LABEL-FOR LINKING
	const autoId = `switch-${Math.random().toString(36).slice(2, 9)}`;

	// -- FUNCTIONS -- //
	function handleClick(e: MouseEvent) {
		if (disabled) return;
		checked = !checked;
		dispatch('change', checked);
		dispatch('click', e);
	}
</script>

{#if label}
	<!-- SWITCH WITH LABEL CONTAINER -->
	<div
		class={cn(
			'inline-flex items-center gap-2.5 text-left text-sm',
			disabled && 'opacity-40 pointer-events-none',
			className,
		)}
	>
		<button
			type="button"
			role="switch"
			id={id || autoId}
			aria-checked={checked}
			aria-label={ariaLabel || label || undefined}
			{disabled}
			use:ripple={{ disabled }}
			on:click={handleClick}
			class={cn(
				'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 overflow-hidden transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/40 disabled:opacity-40 disabled:cursor-not-allowed',
				size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
				checked ? 'bg-[#b23a2e] dark:bg-[#e08a63]' : 'bg-black/20 dark:bg-white/20',
			)}
		>
			<!-- SWITCH KNOB -->
			<span
				class={cn(
					'pointer-events-none inline-block rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out',
					size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
					size === 'sm'
						? checked ? 'translate-x-4' : 'translate-x-0'
						: checked ? 'translate-x-5' : 'translate-x-0',
				)}
			></span>
		</button>
		<label for={id || autoId} class="cursor-pointer select-none">{label}</label>
	</div>
{:else}
	<!-- STANDALONE SWITCH (TRACK IS ROOT BUTTON) -->
	<button
		type="button"
		role="switch"
		id={id || autoId}
		aria-checked={checked}
		aria-label={ariaLabel || undefined}
		{disabled}
		use:ripple={{ disabled }}
		on:click={handleClick}
		class={cn(
			'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 overflow-hidden transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/40 disabled:opacity-40 disabled:cursor-not-allowed',
			size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
			checked ? 'bg-[#b23a2e] dark:bg-[#e08a63]' : 'bg-black/20 dark:bg-white/20',
			className,
		)}
	>
		<!-- SWITCH KNOB -->
		<span
			class={cn(
				'pointer-events-none inline-block rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out',
				size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
				size === 'sm'
					? checked ? 'translate-x-4' : 'translate-x-0'
					: checked ? 'translate-x-5' : 'translate-x-0',
			)}
		></span>
	</button>
{/if}


