<!-- AI TRANSLATION PROVIDERS TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';
	import { invalidateAll } from '$app/navigation';
	// IMPORTED TYPES
	import type { ProviderInfo } from '$lib/components/settings/settings-helpers';
	import type { ProviderTestResult } from '$lib/stores/settings-ui';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import { providersSession, settingsOpenEpoch } from '$lib/stores/settings-ui';
	import {
		DEFAULT_PROVIDER_BASE_URLS,
		isLocal,
		hasChangesForProvider,
		formatModelLabel,
		getFilteredModels,
	} from '$lib/components/settings/settings-helpers';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Key from 'lucide-svelte/icons/key';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Save from 'lucide-svelte/icons/save';
	import Info from 'lucide-svelte/icons/info';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import X from 'lucide-svelte/icons/x';
	// IMPORTED COMPONENTS
	import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';
	import InferenceSamplingCard from '$lib/components/settings/InferenceSamplingCard.svelte';
	import ProviderModelDialogs from '$lib/components/settings/ProviderModelDialogs.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- STATES -- //

	// loaded FIRES AFTER EACH PROVIDER LIST FETCH SO THE SHELL CAN RE-SCROLL A SEARCH JUMP ONCE THE CARD HAS RENDERED
	const dispatch = createEventDispatcher<{ loaded: void }>();

	let providers: ProviderInfo[] = [];
	// SEEDED FROM THE SESSION STORE SO THE PICKED PROVIDER AND ITS TEST RESULT SURVIVE A TAB SWITCH (THE SHELL RESETS THE
	// STORE WHEN THE MODAL OPENS); THE DRAFTS BELOW STAY PER MOUNT, SO LEAVING THE TAB DISCARDS THEM
	let selectedProviderId = get(providersSession).selectedProviderId;
	let providerCategoryFilter: 'all' | 'cloud' | 'local' | 'custom' = 'all';
	let apiKeyDraft: Record<string, string> = {};
	let baseUrlDraft: Record<string, string> = {};
	let activeModelDraft: Record<string, string> = {};
	let showApiKey: Record<string, boolean> = {};
	let isReplacingKey: Record<string, boolean> = {};
	let showAdvancedBaseUrl: Record<string, boolean> = {};
	let showAddCustomModel: Record<string, boolean> = {};
	let providersLoading = false;
	let testingProvider = false;
	let scanningModels = false;
	let savingProvider = false;
	let customModelInput = '';
	let modelSearch = '';
	let testResult: ProviderTestResult | null = get(providersSession).testResult;
	let showModelModal = false;
	let showAddCustomModelModal = false;
	let showProviderPopover = false;
	const AI_GUIDE_STORAGE_KEY = 'xianscan:dismissed_ai_guide_note';
	let isAiGuideDismissed = false;

	// -- REACTIVE STATEMENTS -- //

	$: selectedProvider = providers.find((p) => p.id === selectedProviderId);
	$: activeProvider = providers.find((p) => p.isDefault) || providers.find((p) => p.id === 'ollama') || providers[0];
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];
	$: providersSession.set({ selectedProviderId, testResult });

	// A REOPEN WHILE THE CLOSE ANIMATION RUNS KEEPS THIS TAB MOUNTED: START OVER LIKE A FRESH MOUNT WOULD
	let seenOpenEpoch = get(settingsOpenEpoch);
	$: if ($settingsOpenEpoch !== seenOpenEpoch) {
		seenOpenEpoch = $settingsOpenEpoch;
		selectedProviderId = '';
		testResult = null;
		apiKeyDraft = {};
		isReplacingKey = {};
		customModelInput = '';
		showProviderPopover = false;
		showModelModal = false;
		showAddCustomModelModal = false;
		void loadProviders();
	}

	// -- FUNCTIONS -- //

	function dismissAiGuide() {
		isAiGuideDismissed = true;
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(AI_GUIDE_STORAGE_KEY, 'true');
			}
		} catch {}
	}

	async function loadProviders() {
		providersLoading = true;
		try {
			const res = await fetch('/api/system/providers');
			if (res.ok) {
				const data = await res.json();
				providers = (Array.isArray(data.providers)
					? data.providers.filter((p: any) => p && typeof p === 'object' && typeof p.id === 'string')
					: []) as ProviderInfo[];
				for (const p of providers) {
					activeModelDraft[p.id] = p.activeModel;
					baseUrlDraft[p.id] = p.baseUrl;
					apiKeyDraft[p.id] = '';
				}
				if (!selectedProviderId || !providers.some((p) => p.id === selectedProviderId)) {
					const defaultP = providers.find((p) => p.isDefault) || providers.find((p) => p.id === 'ollama') || providers[0];
					if (defaultP) {
						selectedProviderId = defaultP.id;
					}
				}
			}
		} catch {
			// SILENT FALLBACK
		} finally {
			providersLoading = false;
			dispatch('loaded');
		}
	}

	$: hasProviderChanges = hasChangesForProvider(
		selectedProviderId,
		providers,
		{ ...apiKeyDraft },
		{ ...baseUrlDraft },
		{ ...activeModelDraft },
	);

	async function saveProvider(providerId: string, setAsDefault = false) {
		savingProvider = true;
		testResult = null;
		try {
			const key = apiKeyDraft[providerId];
			const base = baseUrlDraft[providerId];
			const model = activeModelDraft[providerId];
			const prov = providers.find((p) => p.id === providerId);

			const payload: Record<string, unknown> = {
				id: providerId,
				activeModel: model || prov?.activeModel,
				baseUrl: base || prov?.baseUrl,
				availableModels: prov?.availableModels,
			};

			if (key && key.trim().length > 0) payload.apiKey = key.trim();
			if (setAsDefault) payload.isDefault = true;

			const res = await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				if (err.code === 'key_required_for_new_base_url') {
					promptKeyForNewBaseUrl(providerId);
					return;
				}
				throw new Error(err.message || 'Failed to save provider');
			}

			toast.success(
				setAsDefault
					? `${prov?.name || providerId} activated as primary translation engine!`
					: prov?.isDefault
						? `${prov?.name || providerId} active configuration updated`
						: `${prov?.name || providerId} settings saved (Standby)`,
			);

			apiKeyDraft[providerId] = '';
			isReplacingKey[providerId] = false;
			await loadProviders();
			void invalidateAll();
		} catch (e: any) {
			toast.error(e.message || 'Failed to save provider');
		} finally {
			savingProvider = false;
		}
	}

	function promptKeyForNewBaseUrl(providerId: string) {
		toast.error('Enter the API key again for the new base URL');
		isReplacingKey[providerId] = true;
		apiKeyDraft[providerId] = '';
	}

	async function clearKey(providerId: string) {
		try {
			const res = await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: providerId, clearApiKey: true }),
			});
			if (res.ok) {
				toast.success('API key removed');
				apiKeyDraft[providerId] = '';
				isReplacingKey[providerId] = false;
				testResult = null;
				await loadProviders();
				void invalidateAll();
			} else {
				const err = await res.json();
				throw new Error(err.message || 'Failed to remove API key');
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to remove API key');
		}
	}

	async function removeModel(providerId: string, modelId: string) {
		const prov = providers.find((p) => p.id === providerId);
		if (!prov) return;
		const nextModels = prov.availableModels.filter((m) => m !== modelId);
		prov.availableModels = nextModels;
		let nextActive = activeModelDraft[providerId];
		if (activeModelDraft[providerId] === modelId || prov.activeModel === modelId) {
			nextActive = nextModels.length > 0 ? nextModels[0] : '';
			activeModelDraft[providerId] = nextActive;
		}
		providers = [...providers];
		try {
			await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: providerId,
					availableModels: nextModels,
					activeModel: nextActive || undefined,
				}),
			});
			toast.success(`Removed model "${modelId}"`);
		} catch {
			// SILENT FALLBACK
		}
	}

	async function scanModels(providerId: string) {
		scanningModels = true;
		try {
			const key = apiKeyDraft[providerId];
			const base = baseUrlDraft[providerId];
			const res = await fetch('/api/system/providers/models', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: providerId,
					apiKey: key || undefined,
					baseUrl: base || undefined,
				}),
			});
			const data = await res.json();
			if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
				const prov = providers.find((p) => p.id === providerId);
				if (prov) {
					const merged = Array.from(new Set([...prov.availableModels, ...data.models]));
					prov.availableModels = merged;
					if (!activeModelDraft[providerId] || !merged.includes(activeModelDraft[providerId])) {
						activeModelDraft[providerId] = data.models[0];
					}
					providers = [...providers];
					await fetch('/api/system/providers', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ id: providerId, availableModels: merged }),
					});
				}
				toast.success(`Discovered ${data.models.length} model(s)!`);
			} else if (data.code === 'key_required_for_new_base_url') {
				promptKeyForNewBaseUrl(providerId);
			} else {
				const msg = data.message || 'No models found on endpoint';
				toast.error(data.detail ? `${msg}: ${data.detail}` : msg);
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to scan models');
		} finally {
			scanningModels = false;
		}
	}

	async function addCustomModel(providerId: string) {
		const raw = customModelInput.trim();
		if (!raw) return;
		const prov = providers.find((p) => p.id === providerId);
		if (prov) {
			if (!prov.availableModels.includes(raw)) {
				prov.availableModels = [raw, ...prov.availableModels];
			}
			activeModelDraft[providerId] = raw;
			providers = [...providers];
			customModelInput = '';
			toast.success(`Model "${raw}" selected`);
			try {
				await fetch('/api/system/providers', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ id: providerId, availableModels: prov.availableModels, activeModel: raw }),
				});
			} catch {
				// SILENT FALLBACK
			}
		}
	}

	async function testConnection(providerId: string) {
		testingProvider = true;
		testResult = null;
		try {
			const key = apiKeyDraft[providerId];
			const base = baseUrlDraft[providerId];
			const model = activeModelDraft[providerId];

			const res = await fetch('/api/system/providers/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: providerId,
					apiKey: key || undefined,
					baseUrl: base || undefined,
					model: model || undefined,
					temperature: $settings.translationTemperature,
					topP: $settings.translationTopP,
					reasoningEffort: $settings.translationReasoningEffort,
					frequencyPenalty: $settings.translationFrequencyPenalty,
					presencePenalty: $settings.translationPresencePenalty,
				}),
			});

			const data = await res.json();
			if (!data.ok && data.detail) data.message = `${data.message}: ${data.detail}`;
			testResult = data;

			if (data.ok) {
				toast.success(`Connection verified (${data.latencyMs}ms)`);
			} else if (data.code === 'key_required_for_new_base_url') {
				promptKeyForNewBaseUrl(providerId);
			} else {
				toast.error(`Connection test failed: ${data.message}`);
			}
		} catch (e: any) {
			testResult = {
				ok: false,
				message: e.message || 'Network request failed',
				latencyMs: 0,
			};
			toast.error(e.message || 'Test request failed');
		} finally {
			testingProvider = false;
		}
	}

	// -- LIFECYCLES -- //

	// THE TAB MOUNTS FRESH EACH TIME IT IS SHOWN, SO THESE RUN AT INIT (NOT onMount, WHICH THE VITEST HARNESS NEVER FIRES):
	// THE STORED GUIDE DISMISSAL IS READ AND THE PROVIDER LIST IS LOADED, AS THE SHELL DID ON EVERY OPEN BEFORE
	try {
		if (typeof localStorage !== 'undefined') {
			isAiGuideDismissed = localStorage.getItem(AI_GUIDE_STORAGE_KEY) === 'true';
		}
	} catch {}
	void loadProviders();
</script>

<div class="space-y-3.5">
	<!-- HEADER WITH ACTIVE ENGINE STATUS -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-black/10 dark:border-white/10">
		<div>
			<h2 class="text-base font-bold">AI Translation Provider</h2>
			<p class="text-xs opacity-60 mt-0.5">Model routing, credentials vault, and sampling configuration</p>
		</div>

		{#if activeProvider}
			<div class="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1 text-xs dark:border-white/10 dark:bg-white/[0.02] shrink-0 self-start sm:self-auto">
				<ProviderLogo providerId={activeProvider.id} size={14} class="shrink-0" />
				<span class="font-medium text-foreground/90 max-w-[150px] truncate">{activeProvider.name}</span>
				<span class="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/75 max-w-[180px] truncate">
					{formatModelLabel(activeProvider.activeModel || 'default')}
				</span>
			</div>
		{/if}
	</div>

	<!-- PERSISTENT AI TRANSLATION GUIDE NOTE -->
	{#if !isAiGuideDismissed}
		<div
			id="setting-ai-guide"
			class={cn(
				'flex items-start justify-between gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 dark:border-blue-400/25 dark:bg-blue-500/10 p-3 text-xs transition-all duration-300',
				highlightedSettingId === 'ai-guide' &&
					'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-500/15 dark:bg-blue-500/25'
			)}
		>
			<div class="flex items-start gap-2.5 min-w-0">
				<Info size={15} class="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
				<div class="space-y-0.5 min-w-0">
					<span class="font-semibold text-blue-950 dark:text-blue-100 block">Getting Started</span>
					<p class="text-[11.5px] text-blue-900/85 dark:text-blue-200/85 leading-relaxed">
						Switch translation providers, choose or add models, and supply API credentials below. Sampling parameters like temperature and penalties are omitted by default for broad model compatibility, and you can un-omit any parameter to customize it.
					</p>
				</div>
			</div>
			<button
				type="button"
				on:click={dismissAiGuide}
				class="p-1 rounded-md text-blue-600/70 hover:text-blue-900 dark:text-blue-300/70 dark:hover:text-blue-100 hover:bg-blue-500/10 dark:hover:bg-blue-400/15 transition-colors cursor-pointer shrink-0"
				aria-label="Dismiss guide"
				title="Dismiss guide"
				use:ripple
			>
				<X size={13} />
			</button>
		</div>
	{/if}

	<!-- SELECTED PROVIDER CONFIGURATION (FLAT & MINIMAL) -->
	{#if providersLoading && providers.length === 0}
		<div class="flex items-center justify-center p-8 text-xs opacity-60">
			<Loader2 size={16} class="animate-spin mr-2" />
			<span>Loading providers...</span>
		</div>
	{:else if selectedProviderId}
		{@const currentP = providers.find((p) => p.id === selectedProviderId)}
		{#if currentP}
			{@const currentIsLocal = isLocal(currentP.id)}
			{@const filteredModels = getFilteredModels(currentP.availableModels, modelSearch)}
			{@const currentModelId = activeModelDraft[currentP.id] || currentP.activeModel}
			<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.015] space-y-3">
				<!-- PROVIDER TITLE & ACTIVE MODEL ROW -->
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-black/5 dark:border-white/5">
					<!-- LEFT: PROVIDER SELECTOR POPOVER -->
					<div
						id="setting-providers-hub"
						class={cn(
							'relative transition-all duration-300 rounded-lg w-full sm:w-auto',
							highlightedSettingId === 'providers-hub' &&
								'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] p-1 -m-1'
						)}
					>
						<button
							type="button"
							id="setting-provider-brand-trigger"
							on:click={() => (showProviderPopover = !showProviderPopover)}
							aria-expanded={showProviderPopover}
							class={cn(
								'group w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-2.5 rounded-lg border px-2.5 py-2 sm:py-1.5 text-left transition cursor-pointer',
								showProviderPopover
									? 'border-[#b23a2e] bg-[#b23a2e]/10 text-neutral-900 dark:border-[#e08a63] dark:bg-[#e08a63]/15 dark:text-neutral-100 shadow-2xs'
									: 'border-black/10 bg-black/[0.03] hover:bg-black/5 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10 text-neutral-900 dark:text-neutral-100'
							)}
							use:ripple
						>
							<div class="flex items-center gap-2 min-w-0">
								<ProviderLogo providerId={currentP.id} size={18} class="shrink-0" />
								<div class="flex items-baseline gap-1.5 min-w-0">
									<span class="text-sm font-bold truncate max-w-[140px] sm:max-w-none">{currentP.name}</span>
									<span class="text-[10px] font-mono opacity-50 shrink-0">({currentP.id})</span>
								</div>
							</div>
							<ChevronDown
								size={13}
								class={cn(
									'opacity-40 transition-transform duration-200 group-hover:opacity-80 shrink-0 ml-0.5',
									showProviderPopover && 'rotate-180'
								)}
							/>
						</button>

						{#if showProviderPopover}
							<button
								type="button"
								transition:fade={{ duration: 120 }}
								class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0"
								on:click={() => (showProviderPopover = false)}
								aria-label="Close provider selector"
								tabindex="-1"
							></button>

							<div
								transition:fly={{ y: -8, duration: 160, easing: cubicOut }}
								class={cn(
									'absolute left-0 top-full z-50 mt-1.5 w-full sm:w-[400px] max-w-[calc(100vw-2.5rem)] rounded-xl border p-2 shadow-2xl backdrop-blur-md',
									popover,
									popoverBorder
								)}
							>
								<div class="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider opacity-50">
									<span>Switch Provider</span>
									<span>{providers.length} available</span>
								</div>

								<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 max-h-[300px] sm:max-h-[320px] overflow-y-auto p-0.5">
									{#each providers as prov}
										{@const isCurrent = prov.id === currentP.id}
										<button
											type="button"
											on:click={() => {
												selectedProviderId = prov.id;
												testResult = null;
												showProviderPopover = false;
											}}
											class={cn(
												'flex items-center justify-between gap-2 rounded-lg p-2.5 sm:p-2 text-left transition-all border cursor-pointer min-h-[44px] sm:min-h-0',
												isCurrent
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-foreground dark:border-[#e08a63] dark:bg-[#e08a63]/[0.12] shadow-2xs font-semibold'
													: 'border-black/5 bg-black/[0.02] hover:bg-black/5 hover:border-black/15 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/5 opacity-85 hover:opacity-100'
											)}
											use:ripple
										>
											<div class="flex items-center gap-2 min-w-0">
												<ProviderLogo providerId={prov.id} size={16} class="shrink-0" />
												<div class="min-w-0">
													<div class="text-xs font-semibold truncate leading-tight">{prov.name}</div>
													<div class="text-[9.5px] font-mono opacity-50 truncate mt-0.5">{prov.id}</div>
												</div>
											</div>
											<div class="flex items-center gap-1.5 shrink-0">
												{#if prov.isDefault}
													<span class="rounded bg-[#4f7a64]/15 px-1 py-0.5 text-[9px] font-bold text-[#4f7a64] dark:bg-[#689d7d]/20 dark:text-[#689d7d] leading-none">
														Active
													</span>
												{:else if prov.hasKey}
													<Key size={10} class="opacity-40" />
												{/if}
												{#if isCurrent}
													<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] stroke-[2.5]" />
												{/if}
											</div>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- RIGHT: ACTIVE MODEL SELECTOR -->
					<div
						id="setting-model-scan"
						class={cn(
							'relative transition-all duration-300 rounded-lg w-full sm:w-auto shrink-0',
							highlightedSettingId === 'model-scan' &&
								'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] p-1 -m-1'
						)}
					>
						<button
							type="button"
							id="setting-model-trigger"
							on:click={() => { modelSearch = ''; showModelModal = true; }}
							class="group w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-2.5 rounded-lg border border-black/10 bg-black/[0.03] hover:bg-black/5 hover:border-black/20 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10 px-2.5 py-2 sm:py-1.5 text-left transition cursor-pointer shadow-2xs overflow-hidden"
							use:ripple
							title="Change active model"
							aria-label="Change active model"
						>
							<div class="flex items-center gap-2 min-w-0">
								<Cpu size={14} class="text-[#b23a2e] dark:text-[#e08a63] opacity-80 shrink-0" />
								<div class="flex items-baseline gap-1.5 min-w-0">
									<span class="text-[10px] font-bold uppercase tracking-wider opacity-50 shrink-0">Model</span>
									{#if currentModelId}
										<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] truncate max-w-[140px] sm:max-w-[200px]">
											{currentModelId}
										</span>
									{:else}
										<span class="text-xs opacity-50 italic">None</span>
									{/if}
								</div>
							</div>

							<ChevronDown
								size={13}
								class="opacity-40 transition-transform duration-200 group-hover:opacity-80 shrink-0 ml-0.5"
							/>
						</button>
					</div>
				</div>

				<!-- CREDENTIALS & ENDPOINT GRID -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#if !currentIsLocal}
						<div id="setting-api-key" class="space-y-1">
							<div class="flex items-center justify-between text-xs font-semibold opacity-80">
								<label for={`prov-key-${currentP.id}`}>API Key</label>
								{#if currentP.hasKey && !isReplacingKey[currentP.id]}
									<span class="text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
										Configured
									</span>
								{:else if isReplacingKey[currentP.id]}
									<button
										type="button"
										on:click={() => { isReplacingKey[currentP.id] = false; apiKeyDraft[currentP.id] = ''; }}
										class="text-[10.5px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer"
										use:ripple
									>
										Cancel
									</button>
								{/if}
							</div>

							{#if currentP.hasKey && !isReplacingKey[currentP.id]}
								<!-- MASKED KEY PREVIEW (REPLACES INPUT FIELD) -->
								<div class="flex items-center justify-between gap-2 h-[34px] px-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
									<div class="flex items-center gap-2 min-w-0">
										<Key size={13} class="text-[#4f7a64] shrink-0" />
										<span class="font-mono text-xs tracking-wider text-foreground/90 truncate">
											{currentP.maskedKey || '••••••••••••'}
										</span>
									</div>
									<div class="flex items-center gap-1 shrink-0">
										<button
											type="button"
											on:click={() => { isReplacingKey[currentP.id] = true; apiKeyDraft[currentP.id] = ''; }}
											class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
											title="Replace API key"
											use:ripple
										>
											<Edit3 size={11} />
											<span>Change</span>
										</button>
										<button
											type="button"
											on:click={() => clearKey(currentP.id)}
											class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
											title="Clear API key"
											use:ripple
										>
											<Trash2 size={11} />
											<span>Clear</span>
										</button>
									</div>
								</div>
							{:else}
								<!-- NORMAL INPUT FIELD -->
								<div class="relative flex items-center">
									{#if showApiKey[currentP.id]}
										<input
											id={`prov-key-${currentP.id}`}
											type="text"
											bind:value={apiKeyDraft[selectedProviderId]}
											placeholder={currentP.hasKey ? 'Enter new API key...' : 'Enter API key...'}
											class="h-[34px] w-full rounded-lg border border-black/10 bg-transparent px-2.5 pr-8 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/10"
										/>
									{:else}
										<input
											id={`prov-key-${currentP.id}`}
											type="password"
											bind:value={apiKeyDraft[selectedProviderId]}
											placeholder={currentP.hasKey ? 'Enter new API key...' : 'Enter API key...'}
											class="h-[34px] w-full rounded-lg border border-black/10 bg-transparent px-2.5 pr-8 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/10"
										/>
									{/if}
									<button
										type="button"
										on:click={() => (showApiKey[currentP.id] = !showApiKey[currentP.id])}
										class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-200 cursor-pointer"
										title={showApiKey[currentP.id] ? 'Hide API key' : 'Show API key'}
										use:ripple
									>
										{#if showApiKey[currentP.id]}<EyeOff size={13} />{:else}<Eye size={13} />{/if}
									</button>
								</div>
							{/if}
						</div>
					{/if}

					<div id="setting-custom-endpoint" class={cn('space-y-1', currentIsLocal && 'sm:col-span-2')}>
						<div class="flex items-center justify-between text-xs font-semibold opacity-80">
							<label for={`prov-url-${currentP.id}`}>Endpoint Base URL</label>
							{#if baseUrlDraft[currentP.id] && DEFAULT_PROVIDER_BASE_URLS[currentP.id] && baseUrlDraft[currentP.id] !== DEFAULT_PROVIDER_BASE_URLS[currentP.id]}
								<button
									type="button"
									on:click={() => { baseUrlDraft[currentP.id] = DEFAULT_PROVIDER_BASE_URLS[currentP.id]; }}
									class="text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer"
									use:ripple
								>
									Reset Default
								</button>
							{/if}
						</div>
						<input
							id={`prov-url-${currentP.id}`}
							type="text"
							bind:value={baseUrlDraft[selectedProviderId]}
							placeholder={DEFAULT_PROVIDER_BASE_URLS[currentP.id] || 'https://api.openai.com/v1'}
							class="h-[34px] w-full rounded-lg border border-black/10 bg-transparent px-2.5 text-xs font-mono outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e]/30 dark:border-white/10"
						/>
					</div>
				</div>

				<!-- TEST RESULTS INLINE BANNER -->
				{#if testResult}
					<div data-testid="test-connection-result" class="flex items-start gap-2 rounded-lg p-2.5 text-xs border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
						{#if testResult.ok}
							<CheckCircle2 size={13} class="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
						{:else}
							<AlertCircle size={13} class="text-red-500 shrink-0 mt-0.5" />
						{/if}
						<div class="min-w-0 flex-1 space-y-0.5">
							<div class="flex items-center gap-1.5 font-bold">
								<span>{testResult.ok ? 'Verified' : 'Error'}</span>
								{#if testResult.ok && testResult.latencyMs}
									<span class="font-mono text-[10px] font-normal opacity-70">({testResult.latencyMs}ms)</span>
								{/if}
							</div>
							<p class="text-[11px] opacity-80 break-words leading-relaxed">{testResult.message}</p>
						</div>
					</div>
				{/if}

				<!-- ACTION BUTTONS -->
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/5">
					<button
						id="setting-test-connection"
						type="button"
						on:click={() => testConnection(currentP.id)}
						disabled={testingProvider}
						class="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-2 sm:py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 cursor-pointer"
						use:ripple
					>
						<RefreshCw size={11} class={testingProvider ? 'animate-spin' : ''} />
						<span>{testingProvider ? 'Testing...' : 'Test Connection'}</span>
					</button>

					<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
						<button
							type="button"
							on:click={() => saveProvider(currentP.id, false)}
							disabled={savingProvider || !hasProviderChanges}
							class={cn(
								'w-full sm:w-auto justify-center inline-flex items-center gap-1.5 rounded-lg px-3 py-2 sm:py-1.5 text-xs font-semibold cursor-pointer transition-colors',
								currentP.isDefault
									? 'bg-[#b23a2e] hover:bg-[#962f25] text-white font-bold'
									: 'border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5',
								!hasProviderChanges && 'opacity-40 cursor-not-allowed'
							)}
							use:ripple={{ disabled: !hasProviderChanges || savingProvider }}
						>
							<Save size={11} />
							<span>Save Provider</span>
						</button>

						{#if !currentP.isDefault}
							<button
								type="button"
								on:click={() => saveProvider(currentP.id, true)}
								disabled={savingProvider}
								class="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] text-white px-3 py-2 sm:py-1.5 text-xs font-bold cursor-pointer transition-colors shadow-2xs"
								use:ripple
							>
								<Check size={11} />
								<span>{hasProviderChanges ? 'Save & Set Active' : 'Set as Active Engine'}</span>
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<!-- INFERENCE & SAMPLING CARD -->
	<InferenceSamplingCard {highlightedSettingId} />
</div>

<!-- THE TAB'S DIALOGS NOW RENDER INSIDE THE SETTINGS PANE; display:contents KEEPS THEM OUT OF THE PANE'S space-y MARGINS -->
<div class="contents">
	<ProviderModelDialogs
		bind:showModelModal
		bind:showAddCustomModelModal
		bind:modelSearch
		bind:customModelInput
		bind:activeModelDraft
		{selectedProvider}
		{scanningModels}
		{scanModels}
		{removeModel}
		{addCustomModel}
	/>
</div>
