<!-- INFERENCE & SAMPLING CARD OF THE AI PROVIDERS TAB, WITH ITS CUSTOM-VALUE DIALOGS (FEAT-009 PHASE 6: MOVED OUT OF
SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import {
		settings,
		DEFAULTS,
		DIALOGUE_CONTEXT_PAGES_PRESETS,
		type ReasoningEffortOption,
	} from '$lib/stores/settings';
	import { isFloatModified } from '$lib/components/settings/settings-helpers';
	import { lastActiveSampling } from '$lib/stores/settings-ui';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Hash from 'lucide-svelte/icons/hash';
	import Brain from 'lucide-svelte/icons/brain';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	// IMPORTED COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import RangeField from '$lib/components/ui/RangeField.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- STATES -- //

	let showCustomReasoningModal = false;
	let showCustomTokensModal = false;
	let customTokensInput = '';
	let showCustomDialoguePagesModal = false;
	let customDialoguePagesInput = '';

	// CONVENTIONAL INFERENCE CONFIGURATION HELPERS
	const REASONING_EFFORT_OPTIONS: { value: ReasoningEffortOption; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'minimal', label: 'Minimal' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'max', label: 'Max' },
		{ value: 'auto', label: 'Auto' },
	];

	const TOKEN_BUDGET_PRESETS = [2048, 4096, 8192, 16384, 32768];
	$: isCustomTokensActive = !TOKEN_BUDGET_PRESETS.includes($settings.translationMaxTokens ?? 4096);
	$: isCustomDialoguePagesActive = !DIALOGUE_CONTEXT_PAGES_PRESETS.includes($settings.translationDialogueContextPages as any);

	let customReasoningDraft = '';

	$: currentReasoningEffort = $settings.translationReasoningEffort ?? 'none';
	$: isCustomReasoningActive =
		currentReasoningEffort.startsWith('custom:') ||
		!REASONING_EFFORT_OPTIONS.some((o) => o.value === currentReasoningEffort);
	$: currentCustomReasoningValue = currentReasoningEffort.startsWith('custom:')
		? currentReasoningEffort.slice(7)
		: (isCustomReasoningActive ? currentReasoningEffort : '');

	$: isInferenceModified =
		($settings.translationMaxTokens ?? 4096) !== DEFAULTS.translationMaxTokens ||
		isFloatModified($settings.translationTemperature, DEFAULTS.translationTemperature) ||
		isFloatModified($settings.translationTopP, DEFAULTS.translationTopP) ||
		($settings.translationReasoningEffort ?? 'none') !== DEFAULTS.translationReasoningEffort ||
		isFloatModified($settings.translationFrequencyPenalty, DEFAULTS.translationFrequencyPenalty) ||
		isFloatModified($settings.translationPresencePenalty, DEFAULTS.translationPresencePenalty) ||
		($settings.translationDialogueContextPages ?? 4) !== DEFAULTS.translationDialogueContextPages;

	function setMaxTokens(val: number) {
		const clamped = Math.max(1024, Math.min(65536, Math.round(val)));
		settings.update((s) => ({ ...s, translationMaxTokens: clamped }));
		toast.success(`Max completion tokens set to ${clamped.toLocaleString()}`);
	}

	function setDialogueContextPages(val: number) {
		const clamped = Math.max(0, Math.min(10, Math.round(val)));
		settings.update((s) => ({ ...s, translationDialogueContextPages: clamped }));
		if (clamped === 0) {
			toast.success('Dialogue context disabled (0 pages)');
		} else {
			toast.success(`Dialogue context set to ${clamped} valid ${clamped === 1 ? 'page' : 'pages'}`);
		}
	}

	// SEEDED FROM THE MODULE-LEVEL MEMORY SO A REMOUNT (TAB SWITCH) KEEPS THE LAST NON-OMITTED VALUES; EVERY WRITE BELOW
	// GOES BACK THROUGH rememberSampling
	let lastActiveTemperature = lastActiveSampling.temperature;
	let lastActiveTopP = lastActiveSampling.topP;
	let lastActiveFrequencyPenalty = lastActiveSampling.frequencyPenalty;
	let lastActivePresencePenalty = lastActiveSampling.presencePenalty;

	$: if ($settings.translationTemperature !== null) {
		lastActiveTemperature = rememberSampling('temperature', $settings.translationTemperature);
	}
	$: if ($settings.translationTopP !== null) {
		lastActiveTopP = rememberSampling('topP', $settings.translationTopP);
	}
	$: if ($settings.translationFrequencyPenalty !== null) {
		lastActiveFrequencyPenalty = rememberSampling('frequencyPenalty', $settings.translationFrequencyPenalty);
	}
	$: if ($settings.translationPresencePenalty !== null) {
		lastActivePresencePenalty = rememberSampling('presencePenalty', $settings.translationPresencePenalty);
	}

	function rememberSampling(key: keyof typeof lastActiveSampling, val: number): number {
		lastActiveSampling[key] = val;
		return val;
	}

	function setTemperature(val: number | null) {
		if (val === null) {
			settings.update((s) => ({ ...s, translationTemperature: null }));
			return;
		}
		const clamped = Math.max(0.0, Math.min(1.0, Number(val.toFixed(2))));
		lastActiveTemperature = rememberSampling('temperature', clamped);
		settings.update((s) => ({ ...s, translationTemperature: clamped }));
	}

	function setTopP(val: number | null) {
		if (val === null) {
			settings.update((s) => ({ ...s, translationTopP: null }));
			return;
		}
		const clamped = Math.max(0.0, Math.min(1.0, Number(val.toFixed(2))));
		lastActiveTopP = rememberSampling('topP', clamped);
		settings.update((s) => ({ ...s, translationTopP: clamped }));
	}

	function setFrequencyPenalty(val: number | null) {
		if (val === null) {
			settings.update((s) => ({ ...s, translationFrequencyPenalty: null }));
			return;
		}
		const clamped = Math.max(0.0, Math.min(2.0, Number(val.toFixed(2))));
		lastActiveFrequencyPenalty = rememberSampling('frequencyPenalty', clamped);
		settings.update((s) => ({ ...s, translationFrequencyPenalty: clamped }));
	}

	function setPresencePenalty(val: number | null) {
		if (val === null) {
			settings.update((s) => ({ ...s, translationPresencePenalty: null }));
			return;
		}
		const clamped = Math.max(0.0, Math.min(2.0, Number(val.toFixed(2))));
		lastActivePresencePenalty = rememberSampling('presencePenalty', clamped);
		settings.update((s) => ({ ...s, translationPresencePenalty: clamped }));
	}

	function setReasoningEffort(effort: string) {
		settings.update((s) => ({ ...s, translationReasoningEffort: effort as ReasoningEffortOption }));
		const label = REASONING_EFFORT_OPTIONS.find((o) => o.value === effort)?.label || effort;
		toast.success(`Reasoning effort set to ${label}`);
	}

	function applyCustomReasoning() {
		const trimmed = customReasoningDraft.trim();
		if (!trimmed) return;
		const finalVal = trimmed.startsWith('custom:') ? trimmed : `custom:${trimmed}`;
		settings.update((s) => ({ ...s, translationReasoningEffort: finalVal as ReasoningEffortOption }));
		showCustomReasoningModal = false;
		toast.success(`Reasoning effort set to custom "${trimmed.replace(/^custom:/, '')}"`);
	}

	function applyCustomTokens() {
		const parsed = parseInt(customTokensInput, 10);
		if (!isNaN(parsed)) {
			setMaxTokens(parsed);
			showCustomTokensModal = false;
		}
	}

	function applyCustomDialoguePages() {
		const parsed = parseInt(customDialoguePagesInput, 10);
		if (!isNaN(parsed)) {
			setDialogueContextPages(parsed);
			showCustomDialoguePagesModal = false;
		}
	}

	function resetInferenceDefaults() {
		showCustomReasoningModal = false;
		showCustomTokensModal = false;
		showCustomDialoguePagesModal = false;
		customReasoningDraft = '';
		customTokensInput = '';
		customDialoguePagesInput = '';
		settings.update((s) => ({
			...s,
			translationMaxTokens: DEFAULTS.translationMaxTokens,
			translationTemperature: DEFAULTS.translationTemperature,
			translationTopP: DEFAULTS.translationTopP,
			translationReasoningEffort: DEFAULTS.translationReasoningEffort,
			translationFrequencyPenalty: DEFAULTS.translationFrequencyPenalty,
			translationPresencePenalty: DEFAULTS.translationPresencePenalty,
			translationDialogueContextPages: DEFAULTS.translationDialogueContextPages,
		}));
		toast.success('Inference parameters reset to defaults');
	}

	function handleTemperatureChange(e: CustomEvent<number> | Event) {
		const val = (e as CustomEvent).detail !== undefined ? (e as CustomEvent).detail : Number((e.target as HTMLInputElement)?.value);
		if (!isNaN(val)) setTemperature(val);
	}

	function handleTopPChange(e: CustomEvent<number> | Event) {
		const val = (e as CustomEvent).detail !== undefined ? (e as CustomEvent).detail : Number((e.target as HTMLInputElement)?.value);
		if (!isNaN(val)) setTopP(val);
	}

	function handleFrequencyPenaltyChange(e: CustomEvent<number> | Event) {
		const val = (e as CustomEvent).detail !== undefined ? (e as CustomEvent).detail : Number((e.target as HTMLInputElement)?.value);
		if (!isNaN(val)) setFrequencyPenalty(val);
	}

	function handlePresencePenaltyChange(e: CustomEvent<number> | Event) {
		const val = (e as CustomEvent).detail !== undefined ? (e as CustomEvent).detail : Number((e.target as HTMLInputElement)?.value);
		if (!isNaN(val)) setPresencePenalty(val);
	}
</script>

<div
	id="setting-inference-sampling"
	class={cn(
		'rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.015] p-3.5 sm:p-4 space-y-4 transition-all duration-300',
		highlightedSettingId === 'inference-sampling' &&
			'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]'
	)}
>
	<!-- CARD HEADER -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-black/10 dark:border-white/10">
		<div class="flex items-center gap-2.5">
			<div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] shrink-0">
				<SlidersHorizontal size={14} />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<span class="text-xs font-bold uppercase tracking-wider opacity-85">Inference & Sampling</span>
				</div>
				<p class="text-[11px] opacity-50">Token budget, sampling diversity, and reasoning limits</p>
			</div>
		</div>
		{#if isInferenceModified}
			<button
				type="button"
				on:click={resetInferenceDefaults}
				class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer self-start sm:self-auto"
				use:ripple
			>
				<RotateCcw size={11} />
				<span>Reset to Defaults</span>
			</button>
		{/if}
	</div>

	<!-- PARAMETERS -->
	<div class="space-y-4">
		<!-- MAX OUTPUT TOKENS -->
		<div
			id="setting-max-tokens"
			class={cn(
				'space-y-2 transition-all duration-300',
				highlightedSettingId === 'max-tokens' &&
					'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2 -m-2'
			)}
		>
			<div class="flex items-center justify-between gap-2 text-xs">
				<div class="flex items-center gap-1.5 font-semibold min-w-0">
					<Hash size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span class="opacity-80">Max Output Tokens</span>
				</div>
				<div class="flex items-center gap-1.5 text-xs shrink-0 whitespace-nowrap">
					{#if isCustomTokensActive}
						<span class="rounded bg-[#b23a2e]/10 dark:bg-[#e08a63]/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">
							Custom
						</span>
					{/if}
					<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63] text-xs whitespace-nowrap">
						{($settings.translationMaxTokens ?? 4096).toLocaleString()} tokens
					</span>
				</div>
			</div>

			<div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
				{#each TOKEN_BUDGET_PRESETS as preset}
					{@const isSelected = !isCustomTokensActive && ($settings.translationMaxTokens ?? 4096) === preset}
					<button
						type="button"
						on:click={() => setMaxTokens(preset)}
						class={cn(
							'h-8 flex items-center justify-center rounded-lg border text-xs font-mono font-bold transition-colors cursor-pointer',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 shadow-2xs'
								: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
						)}
						use:ripple
					>
						{preset >= 1024 ? `${preset / 1024}k` : preset}
					</button>
				{/each}
				<button
					type="button"
					on:click={() => {
						customTokensInput = String($settings.translationMaxTokens ?? 4096);
						showCustomTokensModal = true;
					}}
					class={cn(
						'h-8 flex items-center justify-center rounded-lg border text-xs font-semibold transition-colors cursor-pointer',
						isCustomTokensActive
							? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 shadow-2xs font-bold'
							: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
					)}
					use:ripple
				>
					Custom
				</button>
			</div>
		</div>

		<div class="border-t border-black/10 dark:border-white/10" />

		<!-- REASONING EFFORT -->
		<div
			id="setting-reasoning-effort"
			class={cn(
				'space-y-2 transition-all duration-300',
				highlightedSettingId === 'reasoning-effort' &&
					'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2 -m-2'
			)}
		>
			<div class="flex items-center justify-between gap-2 text-xs">
				<div class="flex items-center gap-1.5 font-semibold min-w-0">
					<Brain size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span class="opacity-80">Reasoning Effort</span>
				</div>
				<div class="flex items-center gap-1.5 text-xs shrink-0 min-w-0">
					{#if isCustomReasoningActive}
						<span class="rounded bg-[#b23a2e]/10 dark:bg-[#e08a63]/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#b23a2e] dark:text-[#e08a63] shrink-0">
							Custom
						</span>
						<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63] text-xs truncate max-w-[120px] sm:max-w-[160px]">
							{currentCustomReasoningValue || 'custom'}
						</span>
					{:else}
						<span class="font-mono text-xs opacity-70 font-semibold capitalize whitespace-nowrap">
							{currentReasoningEffort}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				{#each REASONING_EFFORT_OPTIONS as opt}
					{@const isSelected = !isCustomReasoningActive && currentReasoningEffort === opt.value}
					<button
						type="button"
						on:click={() => setReasoningEffort(opt.value)}
						class={cn(
							'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 font-bold shadow-2xs'
								: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
						)}
						use:ripple
					>
						{opt.label}
					</button>
				{/each}
				<button
					type="button"
					on:click={() => {
						customReasoningDraft = currentCustomReasoningValue || '';
						showCustomReasoningModal = true;
					}}
					class={cn(
						'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
						isCustomReasoningActive
							? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 font-bold shadow-2xs'
							: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
					)}
					use:ripple
				>
					Custom
				</button>
			</div>
		</div>

		<div class="border-t border-black/10 dark:border-white/10" />

		<!-- SLIDING DIALOGUE CONTEXT WINDOW -->
		<div
			id="setting-dialogue-context"
			class={cn(
				'space-y-2 transition-all duration-300',
				highlightedSettingId === 'dialogue-context' &&
					'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2 -m-2'
			)}
		>
			<div class="flex items-center justify-between gap-2 text-xs">
				<div class="flex items-center gap-1.5 font-semibold min-w-0">
					<MessageSquare size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span class="opacity-80">Sliding Dialogue Context</span>
				</div>
				<div class="flex items-center gap-1.5 text-xs shrink-0 whitespace-nowrap">
					{#if isCustomDialoguePagesActive}
						<span class="rounded bg-[#b23a2e]/10 dark:bg-[#e08a63]/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">
							Custom
						</span>
					{/if}
					<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63] text-xs whitespace-nowrap">
						{#if ($settings.translationDialogueContextPages ?? 4) === 0}
							Off
						{:else}
							{$settings.translationDialogueContextPages ?? 4} <span class="hidden sm:inline">valid </span>{($settings.translationDialogueContextPages ?? 4) === 1 ? 'page' : 'pages'}
						{/if}
					</span>
				</div>
			</div>
			<p class="text-[11px] opacity-50">
				Number of preceding pages with dialogue to include for consistent speaker flow and pronouns. Silent pages are skipped automatically.
			</p>

			<div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
				{#each DIALOGUE_CONTEXT_PAGES_PRESETS as pagesCount}
					{@const isSelected = !isCustomDialoguePagesActive && ($settings.translationDialogueContextPages ?? 4) === pagesCount}
					<button
						type="button"
						on:click={() => setDialogueContextPages(pagesCount)}
						class={cn(
							'h-8 flex items-center justify-center rounded-lg border text-xs font-mono font-bold transition-colors cursor-pointer px-1',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 shadow-2xs'
								: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
						)}
						use:ripple
					>
						{pagesCount === 0 ? 'Off' : pagesCount}
					</button>
				{/each}
				<button
					type="button"
					on:click={() => {
						customDialoguePagesInput = String($settings.translationDialogueContextPages ?? 4);
						showCustomDialoguePagesModal = true;
					}}
					class={cn(
						'h-8 flex items-center justify-center rounded-lg border text-xs font-semibold transition-colors cursor-pointer px-1',
						isCustomDialoguePagesActive
							? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63] dark:text-neutral-950 shadow-2xs font-bold'
							: 'border-black/10 bg-white/60 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:bg-white/5 opacity-80 hover:opacity-100'
					)}
					use:ripple
				>
					Custom
				</button>
			</div>
		</div>

		<div class="border-t border-black/10 dark:border-white/10" />

		<!-- SAMPLING & DIVERSITY SLIDERS -->
		<div
			id="setting-sampling-diversity"
			class={cn(
				'space-y-3 transition-all duration-300',
				highlightedSettingId === 'sampling-diversity' &&
					'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2 -m-2'
			)}
		>
			<div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-75">
				<SlidersHorizontal size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
				<span>Sampling & Diversity</span>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<RangeField
					label="Temperature"
					display={($settings.translationTemperature ?? 0.2).toFixed(2)}
					min={0}
					max={1}
					step={0.05}
					showFooter={false}
					omittable={true}
					omitted={$settings.translationTemperature === null}
					value={$settings.translationTemperature ?? 0.2}
					on:toggleOmit={(e) => {
						if (e.detail) {
							setTemperature(null);
							toast.success('Temperature omitted (provider default)');
						} else {
							setTemperature(lastActiveTemperature ?? 0.2);
							toast.success(`Temperature enabled (${(lastActiveTemperature ?? 0.2).toFixed(2)})`);
						}
					}}
					on:input={handleTemperatureChange}
					on:change={handleTemperatureChange}
				/>

				<RangeField
					label="Top-P"
					display={($settings.translationTopP ?? 1.0).toFixed(2)}
					min={0}
					max={1}
					step={0.05}
					showFooter={false}
					omittable={true}
					omitted={$settings.translationTopP === null}
					value={$settings.translationTopP ?? 1.0}
					on:toggleOmit={(e) => {
						if (e.detail) {
							setTopP(null);
							toast.success('Top-P omitted (provider default)');
						} else {
							setTopP(lastActiveTopP ?? 1.0);
							toast.success(`Top-P enabled (${(lastActiveTopP ?? 1.0).toFixed(2)})`);
						}
					}}
					on:input={handleTopPChange}
					on:change={handleTopPChange}
				/>

				<RangeField
					label="Frequency Penalty"
					display={($settings.translationFrequencyPenalty ?? 0.0).toFixed(2)}
					min={0}
					max={2}
					step={0.05}
					showFooter={false}
					omittable={true}
					omitted={$settings.translationFrequencyPenalty === null}
					value={$settings.translationFrequencyPenalty ?? 0.0}
					on:toggleOmit={(e) => {
						if (e.detail) {
							setFrequencyPenalty(null);
							toast.success('Frequency penalty omitted (provider default)');
						} else {
							setFrequencyPenalty(lastActiveFrequencyPenalty ?? 0.0);
							toast.success(`Frequency penalty enabled (${(lastActiveFrequencyPenalty ?? 0.0).toFixed(2)})`);
						}
					}}
					on:input={handleFrequencyPenaltyChange}
					on:change={handleFrequencyPenaltyChange}
				/>

				<RangeField
					label="Presence Penalty"
					display={($settings.translationPresencePenalty ?? 0.0).toFixed(2)}
					min={0}
					max={2}
					step={0.05}
					showFooter={false}
					omittable={true}
					omitted={$settings.translationPresencePenalty === null}
					value={$settings.translationPresencePenalty ?? 0.0}
					on:toggleOmit={(e) => {
						if (e.detail) {
							setPresencePenalty(null);
							toast.success('Presence penalty omitted (provider default)');
						} else {
							setPresencePenalty(lastActivePresencePenalty ?? 0.0);
							toast.success(`Presence penalty enabled (${(lastActivePresencePenalty ?? 0.0).toFixed(2)})`);
						}
					}}
					on:input={handlePresencePenaltyChange}
					on:change={handlePresencePenaltyChange}
				/>
			</div>
		</div>
	</div>
</div>

<!-- THE TAB'S DIALOGS NOW RENDER INSIDE THE SETTINGS PANE; display:contents KEEPS THEM OUT OF THE PANE'S space-y MARGINS -->
<div class="contents">
	<!-- CUSTOM TOKEN BUDGET MODAL -->
	<Modal
		bind:open={showCustomTokensModal}
		title="Custom Token Budget"
		size="sm"
		zIndex="z-[70]"
		on:close={() => (showCustomTokensModal = false)}
	>
		<form
			on:submit|preventDefault={applyCustomTokens}
			class="space-y-3.5"
		>
			<div class="space-y-1.5">
				<label for="custom-tokens-input" class="text-xs font-semibold opacity-80">
					Max Completion Tokens
				</label>
				<input
					id="custom-tokens-input"
					type="number"
					min="1024"
					max="65536"
					step="256"
					bind:value={customTokensInput}
					placeholder="e.g. 10000, 12000, 24000..."
					class="h-9 w-full rounded-lg border border-black/15 bg-transparent px-3 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/15"
				/>
				<p class="text-[11px] opacity-50">
					Enter any custom completion token budget between 1,024 and 65,536 tokens.
				</p>
			</div>

			<!-- QUICK SUGGESTIONS -->
			<div class="space-y-1.5">
				<span class="text-[10px] font-bold uppercase tracking-wider opacity-60">
					Common Budgets
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each [10240, 12288, 20480, 24576, 49152] as count}
						<button
							type="button"
							on:click={() => (customTokensInput = String(count))}
							class="rounded-md border border-black/10 bg-black/[0.03] hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10 px-2 py-1 text-[11px] font-mono opacity-80 hover:opacity-100 cursor-pointer transition-colors"
							use:ripple
						>
							{count.toLocaleString()}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
				<button
					type="button"
					on:click={() => (showCustomTokensModal = false)}
					class="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
					use:ripple
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!customTokensInput || isNaN(parseInt(customTokensInput, 10))}
					class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
					use:ripple
				>
					<Check size={12} class="stroke-[3]" />
					<span>Set Tokens</span>
				</button>
			</div>
		</form>
	</Modal>

	<!-- CUSTOM DIALOGUE CONTEXT PAGES MODAL -->
	<Modal
		bind:open={showCustomDialoguePagesModal}
		title="Custom Dialogue Context Window"
		size="sm"
		zIndex="z-[70]"
		on:close={() => (showCustomDialoguePagesModal = false)}
	>
		<form
			on:submit|preventDefault={applyCustomDialoguePages}
			class="space-y-3.5"
		>
			<div class="space-y-1.5">
				<label for="custom-dialogue-pages-input" class="text-xs font-semibold opacity-80">
					Preceding Valid Dialogue Pages
				</label>
				<input
					id="custom-dialogue-pages-input"
					type="number"
					min="0"
					max="30"
					step="1"
					bind:value={customDialoguePagesInput}
					placeholder="e.g. 7, 8, 10, 12..."
					class="h-9 w-full rounded-lg border border-black/15 bg-transparent px-3 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/15"
				/>
				<p class="text-[11px] opacity-50">
					Enter any custom number of preceding pages with dialogue to include (between 0 and 30).
				</p>
			</div>

			<!-- QUICK SUGGESTIONS -->
			<div class="space-y-1.5">
				<span class="text-[10px] font-bold uppercase tracking-wider opacity-60">
					Common Presets
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each [7, 8, 10, 12, 15] as count}
						<button
							type="button"
							on:click={() => (customDialoguePagesInput = String(count))}
							class="rounded-md border border-black/10 bg-black/[0.03] hover:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10 px-2 py-1 text-[11px] font-mono opacity-80 hover:opacity-100 cursor-pointer transition-colors"
							use:ripple
						>
							{count} pages
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
				<button
					type="button"
					on:click={() => (showCustomDialoguePagesModal = false)}
					class="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
					use:ripple
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!customDialoguePagesInput || isNaN(parseInt(customDialoguePagesInput, 10))}
					class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
					use:ripple
				>
					<Check size={12} class="stroke-[3]" />
					<span>Set Pages</span>
				</button>
			</div>
		</form>
	</Modal>

	<!-- CUSTOM REASONING EFFORT MODAL -->
	<Modal
		bind:open={showCustomReasoningModal}
		title="Custom Reasoning Effort"
		size="sm"
		zIndex="z-[70]"
		on:close={() => (showCustomReasoningModal = false)}
	>
		<form
			on:submit|preventDefault={applyCustomReasoning}
			class="space-y-3.5"
		>
			<div class="space-y-1.5">
				<label for="custom-reasoning-input" class="text-xs font-semibold opacity-80">
					Reasoning Tier or Budget
				</label>
				<input
					id="custom-reasoning-input"
					type="text"
					bind:value={customReasoningDraft}
					placeholder="e.g. minimal, low, budget:4096..."
					class="h-9 w-full rounded-lg border border-black/15 bg-transparent px-3 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/15"
				/>
				<p class="text-[11px] opacity-50">
					Enter a model-specific reasoning effort tier or token budget identifier.
				</p>
			</div>

			<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-black/5 dark:border-white/5">
				{#if isCustomReasoningActive}
					<button
						type="button"
						on:click={() => {
							setReasoningEffort('none');
							showCustomReasoningModal = false;
						}}
						class="text-xs font-semibold text-neutral-500 hover:text-red-500 cursor-pointer transition-colors text-center sm:text-left py-1"
						use:ripple
					>
						Reset to None
					</button>
				{:else}
					<span></span>
				{/if}
				<div class="flex items-center gap-2">
					<button
						type="button"
						on:click={() => (showCustomReasoningModal = false)}
						class="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
						use:ripple
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!customReasoningDraft.trim()}
						class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
						use:ripple
					>
						<Check size={12} class="stroke-[3]" />
						<span>Set Effort</span>
					</button>
				</div>
			</div>
		</form>
	</Modal>
</div>
