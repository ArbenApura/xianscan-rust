<!-- INPAINTING & CLEANING TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { settings, DEFAULTS, INPAINT_MODES, type InpaintMode } from '$lib/stores/settings';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Brush from 'lucide-svelte/icons/brush';
	import Sliders from 'lucide-svelte/icons/sliders';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	// IMPORTED COMPONENTS
	import Switch from '$lib/components/ui/Switch.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- FUNCTIONS -- //

	function setInpaintMode(mode: InpaintMode) {
		settings.update((s) => ({ ...s, inpaintMode: mode }));
		const found = INPAINT_MODES.find((i) => i.id === mode);
		toast.success(`Inpainting strategy set to ${found?.label || mode}`);
	}

	$: isInpaintingModified =
		($settings.inpaintMode || 'patch') !== DEFAULTS.inpaintMode ||
		Boolean($settings.enableWhiteInpaint ?? true) !== Boolean(DEFAULTS.enableWhiteInpaint ?? true) ||
		Math.abs(($settings.inpaintExpansionPct ?? DEFAULTS.inpaintExpansionPct) - DEFAULTS.inpaintExpansionPct) >= 0.005;

	function resetInpaintingDefaults() {
		settings.update((s) => ({
			...s,
			inpaintMode: DEFAULTS.inpaintMode,
			enableWhiteInpaint: DEFAULTS.enableWhiteInpaint,
			inpaintExpansionPct: DEFAULTS.inpaintExpansionPct,
		}));
		toast.success('Inpainting settings reset to defaults');
	}

	function toggleWhiteInpaint() {
		const current = $settings.enableWhiteInpaint ?? true;
		settings.update((s) => ({ ...s, enableWhiteInpaint: !current }));
	}

	const INPAINT_EXPANSION_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.0, label: '0%', sub: 'Exact text bound' },
		{ value: 0.03, label: '3%', sub: 'Minimal margin (Default)' },
		{ value: 0.06, label: '6%', sub: 'Standard cleaning' },
		{ value: 0.09, label: '9%', sub: 'Broad inpaint mask' },
		{ value: 0.12, label: '12%', sub: 'Max font halo erase' },
	];

	function setInpaintExpansion(val: number) {
		settings.update((s) => ({ ...s, inpaintExpansionPct: val }));
		const label = INPAINT_EXPANSION_PRESETS.find((p) => Math.abs(p.value - val) < 0.005)?.label || `${Math.round(val * 100)}%`;
		toast.success(`Inpaint cleaning expansion set to ${label}`);
	}
</script>

<div class="space-y-5">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-bold">Inpainting & Cleaning</h2>
			<p class="text-xs opacity-60 mt-0.5">Artwork inpainting strategies and speech bubble shrinkwrap cleaning</p>
		</div>
		{#if isInpaintingModified}
			<button
				type="button"
				on:click={resetInpaintingDefaults}
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 hover:text-neutral-900 dark:hover:text-white transition-colors shrink-0 whitespace-nowrap self-start sm:self-auto cursor-pointer"
				use:ripple
			>
				<RotateCcw size={12} />
				<span>Reset Defaults</span>
			</button>
		{/if}
	</div>

	<!-- INPAINTING STRATEGY -->
	<div
		id="setting-inpaint-mode"
		class={`space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'inpaint-mode' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
	>
		<div class="text-xs font-bold uppercase tracking-wider opacity-80">Inpainting Strategy</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
			{#each INPAINT_MODES as mode}
				<button
					type="button"
					on:click={() => setInpaintMode(mode.id)}
					class={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
						$settings.inpaintMode === mode.id
							? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
							: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
					}`}
					use:ripple
				>
					<div>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold">{mode.label}</span>
							{#if $settings.inpaintMode === mode.id}<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />{/if}
						</div>
						<div class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold {mode.badgeColor}">
							{mode.tag}
						</div>
					</div>
					<p class="mt-2 text-[11px] opacity-75 leading-relaxed">{mode.blurb}</p>
				</button>
			{/each}
		</div>
	</div>

	<!-- INPAINT MASK MARGIN -->
	<div
		id="setting-inpaint-margin"
		class={cn(
			'border-t border-black/10 pt-4 dark:border-white/10 space-y-3 transition-all duration-300',
			highlightedSettingId === 'inpaint-margin' &&
				'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1'
		)}
	>
		<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
			<Sliders size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
			<span>Inpaint Mask Margin</span>
		</div>

		<!-- VISUAL DIAGRAM CARD / MASK PREVIEW -->
		<div class="relative overflow-hidden rounded-xl border border-black/10 bg-neutral-100 dark:border-white/10 dark:bg-neutral-950 p-3 flex flex-col items-center justify-center">
			<!-- INPAINT MASK (BLACK/NEUTRAL DASHED BORDER + TRANSLUCENT TINT) -->
			<div
				class="w-full max-w-[280px] rounded-md border-2 border-dashed border-black/80 dark:border-white/80 bg-black/10 dark:bg-white/10 transition-all duration-200 flex flex-col items-center"
				style="padding: {6 + Math.round(($settings.inpaintExpansionPct ?? 0.03) * 60)}px;"
			>
				<div class="flex items-center justify-between w-full text-[8.5px] font-semibold text-neutral-800 dark:text-neutral-200 mb-1 px-0.5">
					<span>Inpaint Mask</span>
					<span class="font-mono font-bold">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
				</div>
				<div class="w-[85%] rounded border-2 border-dotted border-white bg-black/20 dark:bg-black/60 px-2 py-1 text-center font-mono text-[9px] font-bold text-white shadow-xs">
					Text Anchor (0%)
				</div>
			</div>
		</div>

		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-[11px]">
				<span class="font-semibold opacity-75">Inpaint Mask Expansion</span>
				<span class="font-mono opacity-60">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
			</div>
			<div class="grid grid-cols-5 gap-1.5">
				{#each INPAINT_EXPANSION_PRESETS as preset}
					{@const isSelected = Math.abs(($settings.inpaintExpansionPct ?? 0.03) - preset.value) < 0.005}
					<button
						type="button"
						on:click={() => setInpaintExpansion(preset.value)}
						class={cn(
							'rounded-lg border py-1 px-1 text-center transition-all cursor-pointer',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
								: 'border-black/10 hover:border-black/20 dark:border-white/10 opacity-75 hover:opacity-100'
						)}
						use:ripple
					>
						<span class="text-xs font-mono font-bold">{preset.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- WHITE BUBBLE SHRINKWRAP CLEANING -->
	<div class="border-t border-black/10 pt-4 dark:border-white/10">
		<div
			id="setting-inpaint-white"
			class={cn(
				'flex items-start justify-between gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300',
				highlightedSettingId === 'inpaint-white' &&
					'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]'
			)}
		>
			<div>
				<div class="text-xs font-bold flex items-center gap-1.5">
					<Brush size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>White Bubble Shrinkwrap Cleaning</span>
				</div>
				<p class="text-[11px] opacity-60 mt-0.5 leading-relaxed">
					Flush residual inpainting dust, smudges, and watermarks inside speech bubbles while preserving outer ink strokes.
				</p>
			</div>
			<Switch
				checked={$settings.enableWhiteInpaint ?? true}
				on:click={toggleWhiteInpaint}
				ariaLabel="White Bubble Shrinkwrap Cleaning"
			/>
		</div>
	</div>
</div>
