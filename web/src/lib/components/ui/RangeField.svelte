<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	import { settings } from '$lib/stores/settings';
	// IMPORTED ICONS
	import Minus from 'lucide-svelte/icons/minus';
	import Plus from 'lucide-svelte/icons/plus';

	// -- OPTIONAL PROPS -- //

	export let value = 0;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let label = '';
	export let display = '';
	export let description = '';
	export let minLabel = '';
	export let maxLabel = '';
	export let recommended: number | undefined = undefined;
	export let steppers = true;
	export let showFooter = true;
	export let disabled = false;
	let className = '';
	export { className as class };

	// -- STORES & DISPATCH -- //

	const dispatch = createEventDispatcher<{
		input: number;
		change: number;
	}>();

	// -- REACTIVE DERIVED -- //

	$: safeMin = Number(min);
	$: safeMax = Number(max);
	$: safeStep = Number(step) > 0 ? Number(step) : 1;
	$: numDecimals = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
	$: displayValue = display || (numDecimals > 0 ? Number(value).toFixed(numDecimals) : Number(value).toString());
	$: fillPercent = safeMax > safeMin
		? Math.max(0, Math.min(100, ((Number(value) - safeMin) / (safeMax - safeMin)) * 100))
		: 0;
	$: isDark = $settings.theme === 'dark';
	$: activeTrackColor = isDark ? '#e08a63' : '#b23a2e';
	$: bgTrackColor = isDark ? 'rgba(255, 255, 255, 0.12)' : $settings.theme === 'sepia' ? 'rgba(91, 70, 54, 0.15)' : 'rgba(0, 0, 0, 0.08)';

	// -- FUNCTIONS -- //

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const n = Number(target.value);
		value = n;
		dispatch('input', n);
	}

	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const n = Number(target.value);
		value = n;
		dispatch('change', n);
	}

	function stepDown() {
		if (disabled) return;
		const next = Math.max(safeMin, Number((Number(value) - safeStep).toFixed(numDecimals || 4)));
		if (next !== value) {
			value = next;
			dispatch('input', value);
			dispatch('change', value);
		}
	}

	function stepUp() {
		if (disabled) return;
		const next = Math.min(safeMax, Number((Number(value) + safeStep).toFixed(numDecimals || 4)));
		if (next !== value) {
			value = next;
			dispatch('input', value);
			dispatch('change', value);
		}
	}
</script>

<!-- RANGE FIELD: ACCESSIBLE, SMOOTHLY DRAGGABLE SLIDER -->
<div class={cn('space-y-1.5', disabled && 'pointer-events-none opacity-50', className)}>
	<!-- HEADER: LABEL, SUBTITLE & LIVE VALUE BADGE -->
	<div class="flex items-center justify-between gap-2">
		<div class="min-w-0 flex-1">
			{#if label}
				<span class="block truncate text-xs font-medium text-foreground/80">{label}</span>
			{/if}
			{#if description}
				<span class="block truncate text-[10px] opacity-50">{description}</span>
			{/if}
		</div>

		<div class="flex items-center gap-1">
			{#if steppers}
				<button
					type="button"
					aria-label="Decrease value"
					use:ripple
					disabled={disabled || value <= safeMin}
					on:click={stepDown}
					class="flex h-5 w-5 items-center justify-center rounded border border-black/[0.08] text-foreground/70 transition-colors hover:border-[#b23a2e]/40 hover:bg-black/[0.04] hover:text-[#b23a2e] disabled:opacity-30 dark:border-white/[0.08] dark:hover:bg-white/[0.06] dark:hover:text-[#f87171] cursor-pointer"
				>
					<Minus class="h-2.5 w-2.5" />
				</button>
			{/if}

			<span
				class="inline-flex min-w-[2.75rem] items-center justify-center rounded-md border border-black/[0.08] bg-black/[0.03] px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#b23a2e] shadow-xs dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-[#f87171]"
			>
				{displayValue}
			</span>

			{#if steppers}
				<button
					type="button"
					aria-label="Increase value"
					use:ripple
					disabled={disabled || value >= safeMax}
					on:click={stepUp}
					class="flex h-5 w-5 items-center justify-center rounded border border-black/[0.08] text-foreground/70 transition-colors hover:border-[#b23a2e]/40 hover:bg-black/[0.04] hover:text-[#b23a2e] disabled:opacity-30 dark:border-white/[0.08] dark:hover:bg-white/[0.06] dark:hover:text-[#f87171] cursor-pointer"
				>
					<Plus class="h-2.5 w-2.5" />
				</button>
			{/if}
		</div>
	</div>

	<!-- NATIVE RANGE INPUT (HARDWARE ACCELERATED, 100% DRAGGABLE) -->
	<div class="relative py-1">
		<!-- DYNAMIC ACTIVE PROGRESS TRACK FILL VIA LINEAR-GRADIENT -->
		<input
			type="range"
			{min}
			{max}
			{step}
			bind:value
			{disabled}
			aria-label={label || 'Range slider'}
			on:input={handleInput}
			on:change={handleChange}
			style="background: linear-gradient(to right, {activeTrackColor} 0%, {activeTrackColor} {fillPercent}%, {bgTrackColor} {fillPercent}%, {bgTrackColor} 100%);"
			class="h-2 w-full cursor-pointer appearance-none rounded-lg accent-[#b23a2e] dark:accent-[#e08a63] focus:outline-hidden disabled:cursor-not-allowed"
		/>
	</div>

	<!-- FOOTER: BOUNDARY LABELS -->
	{#if showFooter}
		<div class="flex items-center justify-between px-0.5 text-[10px] font-mono text-foreground/40">
			<span>{minLabel || min}</span>
			{#if recommended !== undefined}
				<span class="text-[9px] text-[#b23a2e]/70 dark:text-[#f87171]/70">Optimal: {recommended}</span>
			{/if}
			<span>{maxLabel || max}</span>
		</div>
	{/if}
</div>
