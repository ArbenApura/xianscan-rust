<!-- MODEL SELECTION AND ADD-CUSTOM-MODEL DIALOGS OF THE AI PROVIDERS TAB (FEAT-009 PHASE 6: MOVED OUT OF
SettingsModal.svelte). THE PROVIDER STATE STAYS IN ProvidersTab; THIS FILE ONLY HOLDS THE MARKUP. -->
<script lang="ts">
	// IMPORTED TYPES
	import type { ProviderInfo } from '$lib/components/settings/settings-helpers';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { isLocal, getFilteredModels } from '$lib/components/settings/settings-helpers';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Plus from 'lucide-svelte/icons/plus';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Search from 'lucide-svelte/icons/search';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import X from 'lucide-svelte/icons/x';
	// IMPORTED COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';

	// -- REQUIRED PROPS -- //

	export let selectedProvider: ProviderInfo | undefined;
	export let scanModels: (providerId: string) => unknown;
	export let removeModel: (providerId: string, modelId: string) => unknown;
	export let addCustomModel: (providerId: string) => unknown;

	// -- OPTIONAL PROPS -- //

	// BOUND BY ProvidersTab (TWO-WAY)
	export let showModelModal = false;
	export let showAddCustomModelModal = false;
	export let modelSearch = '';
	export let customModelInput = '';
	export let activeModelDraft: Record<string, string> = {};
	export let scanningModels = false;
</script>

<!-- MODEL SELECTION MODAL -->
<Modal
	bind:open={showModelModal}
	title="Select Model"
	size="md"
	zIndex="z-[60]"
	on:close={() => (showModelModal = false)}
>
	<div class="space-y-3.5">
		{#if selectedProvider}
			{@const currentP = selectedProvider}
			{@const currentIsLocal = isLocal(currentP.id)}
			{@const filteredModels = getFilteredModels(currentP.availableModels, modelSearch)}

			<!-- HEADER INFO: ACTIVE PROVIDER & SCAN -->
			<div class="flex items-center justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/10">
				<div class="flex items-center gap-2 min-w-0">
					<ProviderLogo providerId={currentP.id} size={16} class="shrink-0" />
					<span class="text-xs font-semibold truncate">{currentP.name} Models</span>
					<span class="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono opacity-70">
						{currentP.availableModels.length}
					</span>
				</div>
				<button
					type="button"
					on:click={() => scanModels(currentP.id)}
					disabled={scanningModels}
					class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-[#b23a2e] dark:text-[#e08a63] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50 shrink-0 overflow-hidden transition-colors"
					use:ripple
				>
					<RefreshCw size={11} class={scanningModels ? 'animate-spin' : ''} />
					<span>{scanningModels ? 'Scanning...' : 'Scan Models'}</span>
				</button>
			</div>

			<!-- SEARCH & ADD MODEL TOOLBAR -->
			<div class="flex items-center gap-2">
				<div class="relative flex-1 min-w-0">
					<Search size={13} class="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
					<input
						type="text"
						bind:value={modelSearch}
						placeholder="Search models..."
						class="h-9 w-full rounded-lg border border-black/15 bg-transparent pl-9 pr-8 text-xs outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/15"
					/>
					{#if modelSearch}
						<button
							type="button"
							on:click={() => (modelSearch = '')}
							class="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 p-1 cursor-pointer rounded-full overflow-hidden transition-opacity"
							use:ripple
						>
							<X size={12} />
						</button>
					{/if}
				</div>

				<button
					type="button"
					on:click={() => { customModelInput = ''; showAddCustomModelModal = true; }}
					class="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-black/15 bg-white hover:bg-black/5 dark:border-white/15 dark:bg-neutral-800 dark:hover:bg-white/10 text-xs font-semibold cursor-pointer shadow-2xs transition-colors shrink-0 overflow-hidden"
					use:ripple
					title="Add custom model identifier"
				>
					<Plus size={13} />
					<span>Add Model</span>
				</button>
			</div>

			<!-- MODEL LIST -->
			<div class="max-h-[300px] overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-black/10 dark:border-white/10 p-1.5 bg-black/[0.01] dark:bg-white/[0.01]">
				{#if filteredModels.length > 0}
					{#each filteredModels as modelId}
						{@const isModelSelected = (activeModelDraft[currentP.id] || currentP.activeModel) === modelId}
						{@const canDelete = currentP.availableModels.length > 1 || currentP.id === 'custom'}
						<div class="group relative">
							<button
								type="button"
								on:click={() => (activeModelDraft[currentP.id] = modelId)}
								class={cn(
									'w-full flex items-center gap-2.5 min-w-0 px-3 py-2 text-left cursor-pointer rounded-lg border transition-all duration-150 overflow-hidden',
									canDelete ? 'pr-10' : 'pr-3',
									isModelSelected
										? 'border-[#b23a2e]/40 bg-[#b23a2e]/[0.08] dark:border-[#e08a63]/40 dark:bg-[#e08a63]/[0.12] shadow-2xs'
										: 'border-black/5 hover:border-black/15 bg-white/50 hover:bg-black/[0.02] dark:border-white/5 dark:hover:border-white/15 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]'
								)}
								use:ripple
							>
								<!-- RADIO CHECKMARK INDICATOR -->
								<div
									class={cn(
										'h-4 w-4 rounded-full flex items-center justify-center shrink-0 transition-colors',
										isModelSelected
											? 'bg-[#b23a2e] text-white dark:bg-[#e08a63] dark:text-neutral-950'
											: 'border border-black/25 dark:border-white/25 group-hover:border-[#b23a2e]/60 dark:group-hover:border-[#e08a63]/60'
									)}
								>
									{#if isModelSelected}
										<Check size={10} class="stroke-[3]" />
									{/if}
								</div>

								<!-- MODEL IDENTIFIER -->
								<div class="min-w-0 flex-1">
									<span
										class={cn(
											'font-mono text-xs truncate block',
											isModelSelected
												? 'font-bold text-[#b23a2e] dark:text-[#e08a63]'
												: 'font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white'
										)}
									>
										{modelId}
									</span>
								</div>

								<!-- ACTIVE STATUS -->
								{#if isModelSelected}
									<div class="flex items-center gap-1.5 shrink-0">
										<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-[#b23a2e]/15 text-[#b23a2e] dark:bg-[#e08a63]/20 dark:text-[#e08a63]">
											Active
										</span>
									</div>
								{/if}
							</button>

							{#if canDelete}
								<button
									type="button"
									on:click|stopPropagation={() => removeModel(currentP.id, modelId)}
									title={`Remove model "${modelId}"`}
									class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-400/10 transition-colors cursor-pointer z-10 overflow-hidden"
									use:ripple
								>
									<Trash2 size={12} />
								</button>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="py-8 text-center text-xs opacity-60 space-y-2.5">
						<div>No models found matching "{modelSearch}".</div>
						{#if modelSearch.trim()}
							<button
								type="button"
								on:click={() => {
									customModelInput = modelSearch.trim();
									showAddCustomModelModal = true;
								}}
								class="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white hover:bg-black/5 dark:border-white/15 dark:bg-neutral-800 dark:hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#b23a2e] dark:text-[#e08a63] cursor-pointer shadow-2xs transition-colors overflow-hidden"
								use:ripple
							>
								<Plus size={12} />
								<span>Add "{modelSearch.trim()}" as custom model</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- FOOTER -->
	<div slot="footer" class="flex w-full items-center justify-between">
		{#if selectedProvider}
			{@const currentP = selectedProvider}
			<div class="flex items-center gap-1.5 text-xs min-w-0">
				<span class="opacity-50 text-[11px]">Selected</span>
				<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63] truncate max-w-[240px]">
					{activeModelDraft[currentP.id] || currentP.activeModel || 'None'}
				</span>
			</div>
		{:else}
			<span></span>
		{/if}
		<button
			type="button"
			on:click={() => (showModelModal = false)}
			class="px-4 py-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white text-xs font-bold cursor-pointer transition-colors overflow-hidden"
			use:ripple
		>
			Done
		</button>
	</div>
</Modal>

<!-- ADD CUSTOM MODEL MODAL -->
<Modal
	bind:open={showAddCustomModelModal}
	title="Add Custom Model"
	size="sm"
	zIndex="z-[70]"
	on:close={() => (showAddCustomModelModal = false)}
>
	{#if selectedProvider}
		{@const currentP = selectedProvider}
		<form
			on:submit|preventDefault={() => {
				if (customModelInput.trim()) {
					addCustomModel(currentP.id);
					showAddCustomModelModal = false;
				}
			}}
			class="space-y-3.5"
		>
			<div class="space-y-1.5">
				<label for="custom-model-id-input" class="text-xs font-semibold opacity-80">
					Model Identifier
				</label>
				<input
					id="custom-model-id-input"
					type="text"
					bind:value={customModelInput}
					placeholder="e.g. gpt-4o-mini, claude-3-5-sonnet..."
					class="h-9 w-full rounded-lg border border-black/15 bg-transparent px-3 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/15"
				/>
				<p class="text-[11px] opacity-50">
					Enter the exact technical model identifier supported by {currentP.name}.
				</p>
			</div>

			<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
				<button
					type="button"
					on:click={() => (showAddCustomModelModal = false)}
					class="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 text-xs font-semibold cursor-pointer transition-colors"
					use:ripple
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!customModelInput.trim()}
					class="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors shadow-2xs"
					use:ripple
				>
					<Plus size={12} />
					<span>Add Model</span>
				</button>
			</div>
		</form>
	{/if}
</Modal>
