<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import {
		settings,
		INPAINT_MODES,
		EXECUTION_DEVICES,
		APP_FONTS,
		type Theme,
		type AppFont,
		type InpaintMode,
		type ExecutionDevice,
	} from '$lib/stores/settings';
	// IMPORTED ICONS
	import Languages from 'lucide-svelte/icons/languages';
	import Check from 'lucide-svelte/icons/check';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Zap from 'lucide-svelte/icons/zap';
	import Layers from 'lucide-svelte/icons/layers';
	import Maximize2 from 'lucide-svelte/icons/maximize-2';
	import Activity from 'lucide-svelte/icons/activity';
	import Type from 'lucide-svelte/icons/type';
	import Scissors from 'lucide-svelte/icons/scissors';
	import Key from 'lucide-svelte/icons/key';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Globe from 'lucide-svelte/icons/globe';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';

	// -- PROPS & EVENTS -- //
	export let open = false;
	export let initialTab: 'ai' | 'compute' | 'general' = 'ai';

	// -- STATES -- //
	let activeSettingsTab: 'ai' | 'compute' | 'general' = initialTab;

	interface HardwareInfo {
		device_label: string;
		active_provider: string;
		providers: string[];
		available_providers: string[];
		has_cuda: boolean;
		has_directml: boolean;
		has_directml_raw?: boolean;
		has_coreml: boolean;
		has_dedicated_gpu?: boolean;
		detected_gpus?: Array<{ device_id: number; name: string; vram_mb: number; is_dedicated: boolean; is_integrated: boolean }>;
		gpu_warning?: string | null;
	}

	interface ProviderInfo {
		id: string;
		name: string;
		baseUrl: string;
		activeModel: string;
		availableModels: string[];
		hasKey: boolean;
		maskedKey: string;
		enabled: boolean;
		isDefault: boolean;
	}

	let hardwareInfo: HardwareInfo | null = null;
	let hardwareLoading = false;

	// AI PROVIDERS STATE
	let providers: ProviderInfo[] = [];
	let selectedProviderId = 'deepseek';
	let apiKeyDraft: Record<string, string> = {};
	let baseUrlDraft: Record<string, string> = {};
	let activeModelDraft: Record<string, string> = {};
	let showApiKey: Record<string, boolean> = {};
	let showAdvancedBaseUrl: Record<string, boolean> = {};
	let providersLoading = false;
	let testingProvider = false;
	let savingProvider = false;
	let testResult: { ok: boolean; message: string; latencyMs: number } | null = null;

	async function loadHardwareStatus() {
		hardwareLoading = true;
		try {
			const res = await fetch('/api/system/hardware');
			if (res.ok) {
				hardwareInfo = (await res.json()) as HardwareInfo;
			}
		} catch {
			// Silent fallback
		} finally {
			hardwareLoading = false;
		}
	}

	async function loadProviders() {
		providersLoading = true;
		try {
			const res = await fetch('/api/system/providers');
			if (res.ok) {
				const data = await res.json();
				providers = (data.providers || []) as ProviderInfo[];

				// Sync model and baseUrl drafts from database
				for (const p of providers) {
					activeModelDraft[p.id] = p.activeModel;
					baseUrlDraft[p.id] = p.baseUrl;
				}

				// Select default provider if not set
				if (!selectedProviderId || !providers.some((p) => p.id === selectedProviderId)) {
					const defaultP = providers.find((p) => p.isDefault) || providers[0];
					if (defaultP) {
						selectedProviderId = defaultP.id;
					}
				}
			}
		} catch {
			// Silent fallback
		} finally {
			providersLoading = false;
		}
	}

	$: if (open) {
		activeSettingsTab = initialTab;
		apiKeyDraft = {};
		testResult = null;
		loadHardwareStatus();
		loadProviders();
	}

	const THEMES: { id: Theme; label: string; dot: string }[] = [
		{ id: 'light', label: 'Light', dot: 'border-slate-300 bg-[#fbfaf7]' },
		{ id: 'sepia', label: 'Sepia', dot: 'border-[#d4c3a3] bg-[#f4ecd8]' },
		{ id: 'dark', label: 'Dark', dot: 'border-neutral-700 bg-[#13100c]' },
	];

	function formatDeviceLabel(label?: string): string {
		if (!label) return 'Detecting...';
		return label
			.replace(/\s*\(Forced via MT_DEVICE=[^)]+\)/i, '')
			.replace(/\s*\(Standard\)/i, '')
			.replace(/\s*\/ AMD & Intel & NVIDIA/i, '')
			.trim();
	}

	function setTheme(t: Theme | string) {
		settings.update((s) => ({ ...s, theme: t as Theme }));
		const label = THEMES.find((item) => item.id === t)?.label || t;
		toast.success(`Theme updated to ${label}`);
	}

	function setAppFont(f: AppFont) {
		settings.update((s) => ({ ...s, appFont: f }));
		const found = APP_FONTS.find((item) => item.id === f);
		toast.success(`System font updated to ${found?.label || f}`);
	}

	function setInpaintMode(mode: InpaintMode) {
		settings.update((s) => ({ ...s, inpaintMode: mode }));
		const found = INPAINT_MODES.find((i) => i.id === mode);
		toast.success(`Inpainting strategy set to ${found?.label || mode}`);
	}

	function setParallelProcesses(n: number) {
		settings.update((s) => ({ ...s, parallelProcesses: n }));
		toast.success(`Parallel page workers set to ${n}`);
	}

	function setParallelChapters(n: number) {
		settings.update((s) => ({ ...s, parallelChapters: n }));
		toast.success(`Parallel batch chapters set to ${n}`);
	}

	function toggleResliceBeforeBatch() {
		settings.update((s) => {
			const next = !s.resliceBeforeBatch;
			toast.success(`Pre-translation smart reslicing ${next ? 'enabled' : 'disabled'}`);
			return { ...s, resliceBeforeBatch: next };
		});
	}

	function isDeviceAvailable(devId: ExecutionDevice): boolean {
		if (!hardwareInfo) return true;
		if (devId === 'auto' || devId === 'cpu') return true;
		if (devId === 'cuda') return hardwareInfo.has_cuda;
		if (devId === 'dml') return hardwareInfo.has_directml;
		return true;
	}

	function getDeviceAvailabilityReason(devId: ExecutionDevice): string | null {
		if (!hardwareInfo) return null;
		if (devId === 'cuda' && !hardwareInfo.has_cuda) return 'Dedicated NVIDIA CUDA GPU not detected';
		if (devId === 'dml' && !hardwareInfo.has_directml) {
			if (hardwareInfo.detected_gpus && hardwareInfo.detected_gpus.some((g) => g.is_integrated)) {
				const igpuName = hardwareInfo.detected_gpus.find((g) => g.is_integrated)?.name || 'Integrated GPU';
				return `Only ${igpuName} detected. DirectML disabled to protect system against freezing and driver TDR crashes.`;
			}
			return 'Dedicated GPU for DirectML not detected';
		}
		return null;
	}

	async function setExecutionDevice(dev: ExecutionDevice) {
		if (!isDeviceAvailable(dev)) {
			const reason = getDeviceAvailabilityReason(dev);
			toast.error(`Cannot select ${dev.toUpperCase()}: ${reason || 'Hardware not supported'}`);
			return;
		}

		settings.update((s) => ({ ...s, executionDevice: dev }));
		const found = EXECUTION_DEVICES.find((d) => d.id === dev);
		toast.success(`Compute hardware set to ${found?.label || dev}`);

		try {
			const res = await fetch('/api/system/hardware', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ device: dev }),
			});
			if (res.ok) {
				hardwareInfo = (await res.json()) as HardwareInfo;
				void mlStatus.checkHealth();
			}
		} catch {
			// Ignore offline
		}
	}

	function updateSourceLang(lang: string) {
		settings.update((s) => ({ ...s, sourceLang: lang }));
	}

	function updateTargetLang(lang: string) {
		settings.update((s) => ({ ...s, targetLang: lang }));
	}

	// PROVIDER METHODS
	async function saveProvider(providerId: string, setAsDefault = false) {
		savingProvider = true;
		testResult = null;
		try {
			const key = apiKeyDraft[providerId];
			const base = baseUrlDraft[providerId];
			const model = activeModelDraft[providerId];

			const payload: Record<string, unknown> = {
				id: providerId,
				activeModel: model,
				baseUrl: base,
			};

			if (key && key.trim().length > 0) {
				payload.apiKey = key.trim();
			}
			if (setAsDefault) {
				payload.isDefault = true;
			}

			const res = await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to save provider');
			}

			toast.success(
				setAsDefault
					? `${providerId === 'google' ? 'Google AI Studio' : 'DeepSeek'} set as active provider!`
					: 'Provider settings saved successfully',
			);

			// Clear raw apiKey draft after save
			apiKeyDraft[providerId] = '';
			await loadProviders();
		} catch (e: any) {
			toast.error(e.message || 'Failed to save provider');
		} finally {
			savingProvider = false;
		}
	}

	async function clearKey(providerId: string) {
		try {
			const res = await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: providerId,
					clearApiKey: true,
				}),
			});
			if (res.ok) {
				toast.success('API key removed');
				apiKeyDraft[providerId] = '';
				testResult = null;
				await loadProviders();
			} else {
				const err = await res.json();
				throw new Error(err.message || 'Failed to remove API key');
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to remove API key');
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
				}),
			});

			const data = await res.json();
			testResult = data;

			if (data.ok) {
				toast.success(`Connection successful (${data.latencyMs}ms)`);
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

	const MODEL_DESCRIPTIONS: Record<string, { label: string; badge: string; desc: string }> = {
		// DeepSeek V4
		'deepseek-v4-flash': {
			label: 'DeepSeek V4 Flash',
			badge: 'Recommended · High Speed',
			desc: 'Ultra-fast, cost-efficient translation model with prefix-cached glossary enforcement.',
		},
		'deepseek-v4-pro': {
			label: 'DeepSeek V4 Pro',
			badge: 'Flagship · Maximum Accuracy',
			desc: 'Highest literary precision and context reasoning for complex cultivation idioms.',
		},
		// Google Gemini
		'gemini-3.7-flash': {
			label: 'Gemini 3.7 Flash',
			badge: 'Recommended · Frontier Speed',
			desc: 'Google flagship workhorse: ultra-fast translation with advanced reasoning capabilities.',
		},
		'gemini-3.5-flash': {
			label: 'Gemini 3.5 Flash',
			badge: 'High Speed',
			desc: 'Next-gen multimodal translation engine for long webtoon sequences.',
		},
	};
</script>

<!-- GLOBAL SETTINGS & PREFERENCES MODAL -->
<Modal {open} title="Preferences & Configuration" size="lg" placement="top" on:close={() => (open = false)}>
	<div class="flex flex-col gap-4 sm:gap-5">
		<!-- ELEGANT SEGMENTED TABS -->
		<div class="grid grid-cols-3 gap-1 rounded-xl border border-black/[0.08] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
			<button
				type="button"
				on:click={() => (activeSettingsTab = 'ai')}
				class={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold transition-all duration-150 min-w-0 ${
					activeSettingsTab === 'ai'
						? 'bg-white text-[#b23a2e] shadow-xs dark:bg-[#25201b] dark:text-[#e08a63]'
						: 'opacity-65 hover:opacity-100 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
				}`}
				use:ripple
			>
				<Sparkles size={13} class={`shrink-0 ${activeSettingsTab === 'ai' ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''}`} />
				<span class="truncate px-0.5">
					AI<span class="hidden sm:inline"> & Providers</span>
				</span>
			</button>

			<button
				type="button"
				on:click={() => (activeSettingsTab = 'compute')}
				class={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold transition-all duration-150 min-w-0 ${
					activeSettingsTab === 'compute'
						? 'bg-white text-[#b23a2e] shadow-xs dark:bg-[#25201b] dark:text-[#e08a63]'
						: 'opacity-65 hover:opacity-100 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
				}`}
				use:ripple
			>
				<Cpu size={13} class={`shrink-0 ${activeSettingsTab === 'compute' ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''}`} />
				<span class="truncate px-0.5">
					Compute<span class="hidden sm:inline"> & Speed</span>
				</span>
			</button>

			<button
				type="button"
				on:click={() => (activeSettingsTab = 'general')}
				class={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold transition-all duration-150 min-w-0 ${
					activeSettingsTab === 'general'
						? 'bg-white text-[#b23a2e] shadow-xs dark:bg-[#25201b] dark:text-[#e08a63]'
						: 'opacity-65 hover:opacity-100 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
				}`}
				use:ripple
			>
				<Languages size={13} class={`shrink-0 ${activeSettingsTab === 'general' ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''}`} />
				<span class="truncate px-0.5">
					General<span class="hidden sm:inline"> & Lang</span>
				</span>
			</button>
		</div>

		<!-- TAB 1: AI & PROVIDERS -->
		{#if activeSettingsTab === 'ai'}
			<div class="flex flex-col gap-6 py-1">
				<!-- TRANSLATION AI PROVIDERS -->
				<div class="space-y-3.5">
					<div>
						<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center justify-between">
							<span>AI Translation Provider</span>
							<span class="text-[10px] font-mono font-normal opacity-50">SQLite Stored</span>
						</div>
						<p class="text-[11px] opacity-60">Select translation provider and configure API credentials</p>
					</div>

					<!-- PROVIDER SELECTION TABS (DEEPSEEK & GOOGLE AI STUDIO) -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{#each providers as prov}
							{@const isSelected = selectedProviderId === prov.id}
							<button
								type="button"
								on:click={() => {
									selectedProviderId = prov.id;
									testResult = null;
								}}
								class={`relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 ${
									isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.06] text-current ring-2 ring-[#b23a2e]/30 shadow-xs dark:border-[#e08a63] dark:bg-[#e08a63]/[0.08]'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<div>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2 font-bold text-xs">
											{#if prov.id === 'google'}
												<Sparkles size={15} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											{:else}
												<Zap size={15} class="text-sky-500 shrink-0" />
											{/if}
											<span>{prov.name}</span>
										</div>

										<div class="flex items-center gap-1.5">
											{#if prov.isDefault}
												<span class="rounded-full bg-[#b23a2e]/15 px-2 py-0.5 text-[9px] font-bold text-[#b23a2e] dark:bg-[#e08a63]/20 dark:text-[#e08a63]">
													ACTIVE
												</span>
											{/if}
											{#if isSelected}
												<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											{/if}
										</div>
									</div>

									<div class="mt-2.5 flex items-center gap-2 text-[10px]">
										{#if prov.hasKey}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
												<Check size={11} class="stroke-[3]" /> Key Configured ({prov.maskedKey})
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
												<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Key Required
											</span>
										{/if}
									</div>
								</div>

								<div class="mt-2 text-[11px] font-mono opacity-60">
									Active: {prov.activeModel}
								</div>
							</button>
						{/each}
					</div>

					<!-- SELECTED PROVIDER CONFIGURATION PANEL -->
					{#if selectedProviderId}
						{@const currentP = providers.find((p) => p.id === selectedProviderId)}
						{#if currentP}
							<div class="rounded-2xl border border-black/10 bg-black/[0.02] p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
										<Key size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
										<span>{currentP.name} Settings</span>
									</div>

									{#if selectedProviderId === 'google'}
										<a
											href="https://aistudio.google.com/api-keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-[11px] text-[#b23a2e] dark:text-[#e08a63] hover:underline font-semibold"
										>
											<span>Get Google AI API Key</span>
											<ExternalLink size={11} />
										</a>
									{:else if selectedProviderId === 'deepseek'}
										<a
											href="https://platform.deepseek.com/api_keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] hover:underline text-[11px] font-semibold"
										>
											<span>Get DeepSeek API Key</span>
											<ExternalLink size={11} />
										</a>
									{/if}
								</div>

								<!-- API KEY INPUT & STATUS -->
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<label for={`provider-key-${currentP.id}`} class="text-[11px] font-semibold opacity-80">
											API Key
										</label>
										{#if currentP.hasKey}
											<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-semibold">
												<Check size={11} class="stroke-[3]" /> Stored in SQLite: {currentP.maskedKey}
											</span>
										{:else}
											<span class="text-amber-600 dark:text-amber-400 text-[10px] font-medium">
												No key saved
											</span>
										{/if}
									</div>

									<!-- STORED KEY BANNER IF PRESENT -->
									{#if currentP.hasKey}
										<div class="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs">
											<div class="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
												<CheckCircle2 size={14} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
												<span>Active key: <code class="font-mono font-bold bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px]">{currentP.maskedKey}</code></span>
											</div>
											<button
												type="button"
												on:click={() => clearKey(currentP.id)}
												class="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline cursor-pointer"
											>
												Remove Key
											</button>
										</div>
									{/if}

									<div class="relative flex items-center">
										{#if showApiKey[currentP.id]}
											<input
												id={`provider-key-${currentP.id}`}
												type="text"
												bind:value={apiKeyDraft[currentP.id]}
												placeholder={currentP.hasKey ? `Replace key (Currently: ${currentP.maskedKey})...` : selectedProviderId === 'google' ? 'AIzaSy...' : 'sk-...'}
												class="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-10 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-black/30 dark:text-neutral-100 font-mono"
											/>
										{:else}
											<input
												id={`provider-key-${currentP.id}`}
												type="password"
												bind:value={apiKeyDraft[currentP.id]}
												placeholder={currentP.hasKey ? `Replace key (Currently: ${currentP.maskedKey})...` : selectedProviderId === 'google' ? 'AIzaSy...' : 'sk-...'}
												class="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-10 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-black/30 dark:text-neutral-100 font-mono"
											/>
										{/if}
										<button
											type="button"
											on:click={() => (showApiKey[currentP.id] = !showApiKey[currentP.id])}
											class="absolute right-2.5 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
											title={showApiKey[currentP.id] ? 'Hide Key' : 'Show Key'}
										>
											{#if showApiKey[currentP.id]}
												<EyeOff size={14} />
											{:else}
												<Eye size={14} />
											{/if}
										</button>
									</div>
								</div>

								<!-- MODEL SELECTION -->
								<div class="space-y-2">
									<label class="text-[11px] font-semibold opacity-80">
										Active Model
									</label>

									<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
										{#each currentP.availableModels as modelId}
											{@const info = MODEL_DESCRIPTIONS[modelId] || { label: modelId, badge: 'Model', desc: '' }}
											{@const isModelSelected = (activeModelDraft[currentP.id] || currentP.activeModel) === modelId}
											<button
												type="button"
												on:click={() => (activeModelDraft[currentP.id] = modelId)}
												class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
													isModelSelected
														? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] ring-1 ring-[#b23a2e]/30 dark:border-[#e08a63] dark:bg-[#e08a63]/[0.08]'
														: 'border-black/10 bg-white/40 hover:bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'
												}`}
											>
												<div class="flex items-center justify-between">
													<span class="text-xs font-bold">{info.label}</span>
													{#if isModelSelected}
														<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
													{/if}
												</div>
												<div class="mt-1 flex items-center gap-1.5">
													<span class="rounded-md bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-semibold opacity-70">
														{info.badge}
													</span>
												</div>
												{#if info.desc}
													<p class="mt-1 text-[10px] opacity-60 leading-tight">{info.desc}</p>
												{/if}
											</button>
										{/each}
									</div>
								</div>

								<!-- ADVANCED: CUSTOM BASE URL -->
								<div class="space-y-2 pt-1">
									<button
										type="button"
										on:click={() => (showAdvancedBaseUrl[currentP.id] = !showAdvancedBaseUrl[currentP.id])}
										class="flex items-center gap-1 text-[11px] opacity-60 hover:opacity-100 font-semibold"
									>
										<span>{showAdvancedBaseUrl[currentP.id] ? 'Hide' : 'Show'} Custom Base URL / Proxy</span>
									</button>

									{#if showAdvancedBaseUrl[currentP.id]}
										<div class="space-y-1">
											<label for="provider-base-url-input" class="text-[10px] opacity-60 font-mono">
												Endpoint URL (OpenAI-compatible)
											</label>
											<input
												id="provider-base-url-input"
												type="text"
												bind:value={baseUrlDraft[currentP.id]}
												placeholder={currentP.baseUrl}
												class="w-full rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-black/30 dark:text-neutral-100 font-mono"
											/>
										</div>
									{/if}
								</div>

								<!-- TEST STATUS BANNER -->
								{#if testResult}
									<div
										class={`flex items-start gap-2 rounded-xl p-3 text-xs leading-relaxed ${
											testResult.ok
												? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
												: 'bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300'
										}`}
									>
										{#if testResult.ok}
											<CheckCircle2 size={15} class="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
										{:else}
											<AlertCircle size={15} class="shrink-0 mt-0.5 text-red-500" />
										{/if}
										<div>
											<strong class="font-semibold">{testResult.ok ? 'Connection Verified' : 'Connection Error'}:</strong>
											<p class="mt-0.5 text-[11px] opacity-90">{testResult.message}</p>
										</div>
									</div>
								{/if}

								<!-- ACTION BUTTONS -->
								<div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-black/10 dark:border-white/10">
									<button
										type="button"
										on:click={() => testConnection(currentP.id)}
										disabled={testingProvider || (!currentP.hasKey && !apiKeyDraft[currentP.id])}
										class="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 disabled:opacity-40 transition shadow-2xs"
									>
										<RefreshCw size={13} class={testingProvider ? 'animate-spin' : ''} />
										<span>{testingProvider ? 'Testing...' : 'Test Connection'}</span>
									</button>

									<div class="flex items-center gap-2">
										<button
											type="button"
											on:click={() => saveProvider(currentP.id, false)}
											disabled={savingProvider}
											class="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3.5 py-2 text-xs font-semibold hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 transition shadow-2xs"
										>
											<span>Save Settings</span>
										</button>

										{#if !currentP.isDefault}
											<button
												type="button"
												on:click={() => saveProvider(currentP.id, true)}
												disabled={savingProvider}
												class="inline-flex items-center gap-1.5 rounded-xl bg-[#b23a2e] hover:bg-[#962f25] text-white px-3.5 py-2 text-xs font-bold transition shadow-xs"
											>
												<Check size={14} />
												<span>Set as Active</span>
											</button>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- INPAINTING STRATEGY -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80">Inpainting Strategy</div>
						<p class="text-[11px] opacity-60">Choose how comic text bubbles and watermarks are erased and reconstructed</p>
					</div>

					<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
						{#each INPAINT_MODES as mode}
							<button
								type="button"
								on:click={() => setInpaintMode(mode.id)}
								class={`relative flex flex-col justify-between rounded-xl border p-3 sm:p-3.5 text-left transition-all duration-200 ${
									$settings.inpaintMode === mode.id
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<div>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1.5 font-bold text-xs">
											{#if mode.id === 'patch'}
												<Zap size={14} class="text-emerald-500 shrink-0" />
											{:else if mode.id === 'scaled'}
												<Layers size={14} class="text-amber-500 shrink-0" />
											{:else}
												<Maximize2 size={14} class="text-sky-500 shrink-0" />
											{/if}
											<span>{mode.label}</span>
										</div>
										{#if $settings.inpaintMode === mode.id}
											<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
										{/if}
									</div>
									<div class="mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide whitespace-nowrap max-w-full truncate {mode.badgeColor}">
										{mode.tag}
									</div>
								</div>
								<div class="mt-2.5 text-[11px] opacity-75 leading-relaxed">{mode.blurb}</div>
							</button>
						{/each}
					</div>
				</div>
			</div>

		<!-- TAB 2: COMPUTE & PERFORMANCE -->
		{:else if activeSettingsTab === 'compute'}
			<div class="flex flex-col gap-5 sm:gap-6 py-1">
				<!-- HARDWARE COMPUTE ACCELERATOR -->
				<div>
					<div class="mb-2.5 sm:mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80">Hardware Compute Accelerator</div>
							<p class="text-[11px] opacity-60">Select execution engine for ONNX Runtime models</p>
						</div>
						<!-- LIVE STATUS PILL (MOBILE ADAPTIVE) -->
						{#if hardwareInfo}
							<div
								class="self-start sm:self-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 sm:py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 max-w-full"
								title="Active ONNX Runtime Provider"
							>
								<Activity size={11} class="text-emerald-500 shrink-0 animate-pulse" />
								<span class="truncate px-0.5">{formatDeviceLabel(hardwareInfo.device_label)}</span>
							</div>
						{/if}
					</div>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
						{#each EXECUTION_DEVICES as dev}
							{@const available = isDeviceAvailable(dev.id)}
							{@const reason = getDeviceAvailabilityReason(dev.id)}
							<button
								type="button"
								on:click={() => setExecutionDevice(dev.id)}
								class={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all duration-200 ${
									!available
										? 'opacity-45 hover:opacity-60 border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01] cursor-not-allowed'
										: $settings.executionDevice === dev.id
											? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
											: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<div>
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5 font-bold text-xs">
											<Cpu size={13} class={`shrink-0 ${available ? 'opacity-80' : 'opacity-40'}`} />
											<span>{dev.label}</span>
										</div>
										{#if $settings.executionDevice === dev.id}
											<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
										{/if}
									</div>
									<div class="mt-1 text-[10px] opacity-70 leading-relaxed">{dev.blurb}</div>
								</div>
								{#if !available && reason}
									<div class="mt-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
										{reason}
									</div>
								{/if}
							</button>
						{/each}
					</div>

					{#if hardwareInfo?.gpu_warning}
						<div class="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
							<Activity size={14} class="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
							<div>
								<span class="font-bold">Integrated GPU Protected:</span>
								<span>{hardwareInfo.gpu_warning}</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- SMART PRE-RESLICING TOGGLE -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="flex items-start justify-between gap-4">
						<div>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Scissors size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Auto-Reslice Before Batch Translation</span>
							</div>
							<p class="text-[11px] opacity-60 mt-0.5 max-w-md">
								Automatically recombine and re-cut long vertical webtoon chapters along clean whitespace gutters before running OCR and translation. Prevents dialogue bubbles from being bisected across slice seams.
							</p>
						</div>

						<button
							type="button"
							on:click={toggleResliceBeforeBatch}
							class={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
								$settings.resliceBeforeBatch ? 'bg-[#b23a2e] dark:bg-[#e08a63]' : 'bg-black/20 dark:bg-white/20'
							}`}
							role="switch"
							aria-checked={$settings.resliceBeforeBatch}
						>
							<span
								class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
									$settings.resliceBeforeBatch ? 'translate-x-5' : 'translate-x-0'
								}`}
							></span>
						</button>
					</div>
				</div>

				<!-- PARALLEL PAGE PROCESSING -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Page Workers</div>
						<p class="text-[11px] opacity-60">Number of comic pages processed simultaneously per chapter</p>
					</div>

					<div class="grid grid-cols-4 gap-2">
						{#each [1, 2, 3, 4] as count}
							<button
								type="button"
								on:click={() => setParallelProcesses(count)}
								class={`rounded-xl border py-2.5 text-center text-xs font-bold transition-all ${
									($settings.parallelProcesses || 2) === count
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								{count} {count === 1 ? 'Worker' : 'Workers'}
							</button>
						{/each}
					</div>
				</div>

				<!-- PARALLEL BATCH CHAPTERS -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Batch Chapters</div>
						<p class="text-[11px] opacity-60">Number of chapters translated concurrently during batch jobs</p>
					</div>

					<div class="grid grid-cols-4 gap-2">
						{#each [1, 2, 3, 4] as count}
							<button
								type="button"
								on:click={() => setParallelChapters(count)}
								class={`rounded-xl border py-2.5 text-center text-xs font-bold transition-all ${
									($settings.parallelChapters || 2) === count
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								{count} {count === 1 ? 'Chapter' : 'Chapters'}
							</button>
						{/each}
					</div>
				</div>
			</div>

		<!-- TAB 3: GENERAL & THEME -->
		{:else if activeSettingsTab === 'general'}
			<div class="flex flex-col gap-5 sm:gap-6 py-1">
				<!-- APP THEME PICKER -->
				<div>
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80">Reader Theme</div>
						<p class="text-[11px] opacity-60">Surface appearance and reader background contrast</p>
					</div>

					<div class="grid grid-cols-3 gap-2.5 sm:gap-3">
						{#each THEMES as theme}
							<button
								type="button"
								on:click={() => setTheme(theme.id)}
								class={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
									$settings.theme === theme.id
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<span class={`h-4 w-4 rounded-full border ${theme.dot} shrink-0 shadow-2xs`}></span>
								<span class="text-xs font-bold">{theme.label}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- APP FONT PICKER -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
							<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Studio System Font</span>
						</div>
						<p class="text-[11px] opacity-60">Typography style used throughout the navigation and reader studio</p>
					</div>

					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{#each APP_FONTS as font}
							<button
								type="button"
								on:click={() => setAppFont(font.id)}
								class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
									$settings.appFont === font.id
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<div class="flex items-center justify-between">
									<span class="text-xs font-bold" style="font-family: {font.stack};">{font.label}</span>
									{#if $settings.appFont === font.id}
										<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63]" />
									{/if}
								</div>
								<div class="mt-1.5 text-[10px] opacity-60" style="font-family: {font.stack};">Sample Text 123</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- DEFAULT SOURCE & TARGET LANGUAGES -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80">Default Localization Pair</div>
						<p class="text-[11px] opacity-60">Default language pair applied when creating new manga series</p>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label class="text-[11px] font-semibold opacity-75">Source Language</label>
							<LanguagePicker
								value={$settings.sourceLang || 'zh'}
								mode="source"
								on:change={(e) => updateSourceLang(e.detail)}
							/>
						</div>

						<div class="space-y-1">
							<label class="text-[11px] font-semibold opacity-75">Target Language</label>
							<LanguagePicker
								value={$settings.targetLang || 'en'}
								mode="target"
								on:change={(e) => updateTargetLang(e.detail)}
							/>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</Modal>
