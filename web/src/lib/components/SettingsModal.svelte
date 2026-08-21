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
	import { mlStatus } from '$lib/stores/ml-status';
	// IMPORTED ICONS
	import Languages from 'lucide-svelte/icons/languages';
	import Check from 'lucide-svelte/icons/check';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Zap from 'lucide-svelte/icons/zap';
	import ZapOff from 'lucide-svelte/icons/zap-off';
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
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Palette from 'lucide-svelte/icons/palette';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import Server from 'lucide-svelte/icons/server';
	import HardDrive from 'lucide-svelte/icons/hard-drive';
	import Search from 'lucide-svelte/icons/search';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import Info from 'lucide-svelte/icons/info';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import X from 'lucide-svelte/icons/x';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
	import TypesetSettingsModal from '$lib/components/TypesetSettingsModal.svelte';
	import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';

	// -- PROPS & EVENTS -- //
	export let open = false;
	export let initialTab: 'ai' | 'compute' | 'general' = 'ai';

	// -- STATES -- //
	let activeSettingsTab: 'ai' | 'compute' | 'general' = initialTab;
	let typesetModalOpen = false;

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
		reloading?: boolean;
		version?: string;
		app_version?: string;
		web_build_hash?: string;
		web_build_time?: string;
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
	// WHICH DEVICE IS CURRENTLY BEING SWITCHED TO (SHOWS A SPINNER + DISABLES OTHER CARDS).
	let switchingDevice: ExecutionDevice | null = null;

	// AI PROVIDERS STATE
	let providers: ProviderInfo[] = [];
	let selectedProviderId = '';
	let providerCategoryFilter: 'all' | 'cloud' | 'local' | 'custom' = 'all';
	let apiKeyDraft: Record<string, string> = {};
	let baseUrlDraft: Record<string, string> = {};
	let activeModelDraft: Record<string, string> = {};
	let showApiKey: Record<string, boolean> = {};
	let showAdvancedBaseUrl: Record<string, boolean> = {};
	let providersLoading = false;
	let testingProvider = false;
	let scanningModels = false;
	let savingProvider = false;
	let customModelInput = '';
	let modelSearch = '';
	let testResult: { ok: boolean; message: string; latencyMs: number } | null = null;

	function isLocal(id: string): boolean {
		return id === 'ollama' || id === 'lmstudio';
	}

	function getProviderCategory(id: string): 'cloud' | 'local' | 'custom' {
		if (id === 'ollama' || id === 'lmstudio') return 'local';
		if (id === 'custom') return 'custom';
		return 'cloud';
	}

	async function loadHardwareStatus() {
		hardwareLoading = true;
		try {
			const res = await fetch('/api/system/hardware');
			if (res.ok) {
				hardwareInfo = (await res.json()) as HardwareInfo;
			}
		} catch {
			// SILENT FALLBACK
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

				// SYNC MODEL AND BASEURL DRAFTS FROM DATABASE
				for (const p of providers) {
					activeModelDraft[p.id] = p.activeModel;
					baseUrlDraft[p.id] = p.baseUrl;
				}

				// SELECT ACTIVE DEFAULT PROVIDER IF CURRENT SELECTION IS EMPTY OR NOT FOUND
				if (!selectedProviderId || !providers.some((p) => p.id === selectedProviderId)) {
					const defaultP = providers.find((p) => p.isDefault) || providers[0];
					if (defaultP) {
						selectedProviderId = defaultP.id;
					}
				}
			}
		} catch {
			// SILENT FALLBACK
		} finally {
			providersLoading = false;
		}
	}

	$: if (open) {
		activeSettingsTab = initialTab;
		apiKeyDraft = {};
		testResult = null;
		customModelInput = '';
		selectedProviderId = '';
		loadHardwareStatus();
		loadProviders();
		void mlStatus.checkHealth();
	}

	// THE ML SIDECAR IS CONSIDERED OFFLINE ONLY AFTER A COMPLETED HEALTH CHECK SAYS SO — DURING THE
	// INITIAL LOADING WINDOW WE STAY ENABLED TO AVOID A FLASH OF DISABLED CONTROLS.
	$: mlOffline = !$mlStatus.loading && !$mlStatus.online;

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
		if (devId === 'auto' || devId === 'cpu') return true;
		// IF DETECTION IS STILL RUNNING, GPU OPTIONS ARE NOT YET CONFIRMED AVAILABLE.
		// RETURN FALSE SO AN INVALID ACCELERATOR CANNOT BE SELECTED BEFORE WE KNOW.
		if (!hardwareInfo) return false;
		if (devId === 'cuda') return hardwareInfo.has_cuda;
		if (devId === 'coreml') return hardwareInfo.has_coreml;
		if (devId === 'dml') return hardwareInfo.has_directml;
		return true;
	}

	function getDeviceAvailabilityReason(devId: ExecutionDevice): string | null {
		if (!hardwareInfo) return 'Detecting available hardware...';
		if (devId === 'cuda' && !hardwareInfo.has_cuda) return 'Dedicated NVIDIA CUDA GPU not detected';
		if (devId === 'coreml' && !hardwareInfo.has_coreml) return 'Apple Silicon GPU (CoreML) not detected';
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
		// THE SIDECAR HOSTS THE ONNX MODELS — WITH IT OFFLINE NO COMPUTE ENGINE CAN BE SWITCHED.
		if (mlOffline) {
			toast.error('ML sidecar is offline — cannot switch compute hardware.');
			return;
		}

		if (!isDeviceAvailable(dev)) {
			const reason = getDeviceAvailabilityReason(dev);
			toast.error(`Cannot select ${dev.toUpperCase()}: ${reason || 'Hardware not supported'}`);
			return;
		}

		if (switchingDevice) return;

		const found = EXECUTION_DEVICES.find((d) => d.id === dev);
		switchingDevice = dev;

		try {
			const res = await fetch('/api/system/hardware', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ device: dev }),
			});
			if (res.ok) {
				hardwareInfo = (await res.json()) as HardwareInfo;
				const expectedEp =
					dev === 'dml'
						? 'DmlExecutionProvider'
						: dev === 'cuda'
							? 'CUDAExecutionProvider'
							: dev === 'coreml'
								? 'CoreMLExecutionProvider'
								: null;
				const active = hardwareInfo.providers?.[0] ?? hardwareInfo.active_provider;
				const resolvedLabel = formatDeviceLabel(hardwareInfo.device_label) || found?.label || dev;
				if (expectedEp && active && active !== expectedEp) {
					// THE REQUESTED GPU IS NOT AVAILABLE AND THE BACKEND FELL BACK TO A
					// DIFFERENT PROVIDER. REPORT THE ACTUAL RESULT AND RESET THE SELECTION.
					settings.update((s) => ({ ...s, executionDevice: 'auto' }));
					toast.error(`${found?.label || dev} is not available. Running on ${resolvedLabel}.`);
				} else {
					settings.update((s) => ({ ...s, executionDevice: dev }));
					toast.success(`Compute hardware set to ${resolvedLabel}`);
				}
				// THE BACKEND RELOADS ALL ~400MB OF MODELS ASYNCHRONOUSLY; POLL UNTIL IT REPORTS READY.
				void waitForReloadDone(dev);
			} else {
				toast.error(`Failed to switch compute hardware to ${found?.label || dev}`);
				switchingDevice = null;
			}
		} catch {
			// IGNORE OFFLINE — CLEAR THE SPINNER SO THE UI ISN'T STUCK.
			switchingDevice = null;
			void mlStatus.checkHealth();
		}
	}

	async function waitForReloadDone(dev: ExecutionDevice) {
		const maxWaitMs = 60000;
		const startedAt = Date.now();
		while (Date.now() - startedAt < maxWaitMs) {
			// SHORT DELAY BEFORE THE FIRST POLL SO THE BACKEND HAS TIME TO KICK OFF THE RELOAD.
			await new Promise((r) => setTimeout(r, 300));
			try {
				const res = await fetch('/api/system/hardware');
				if (res.ok) {
					const info = (await res.json()) as HardwareInfo;
					hardwareInfo = info;
					if (!info.reloading) {
						break;
					}
				}
			} catch {
				break;
			}
		}
		switchingDevice = null;
		void mlStatus.checkHealth();
	}

	function updateSourceLang(lang: string) {
		settings.update((s) => {
			const nextTarget = s.targetLang === lang ? (lang === 'en' ? 'zh-Hans' : 'en') : s.targetLang;
			return { ...s, sourceLang: lang, targetLang: nextTarget };
		});
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
			const prov = providers.find((p) => p.id === providerId);

			const payload: Record<string, unknown> = {
				id: providerId,
				activeModel: model,
				baseUrl: base,
				availableModels: prov?.availableModels,
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
					? `${prov?.name || providerId} set as active translation engine!`
					: 'Provider settings saved successfully',
			);

			// CLEAR RAW APIKEY DRAFT AFTER SAVE
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

	const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
		deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
		google: ['gemini-3.7-flash', 'gemini-3.5-flash'],
		groq: ['llama-3.3-70b-versatile', 'qwen-2.5-32b', 'deepseek-r1-distill-llama-70b'],
		openrouter: [
			'google/gemini-2.5-flash',
			'anthropic/claude-3.5-sonnet',
			'deepseek/deepseek-v4-flash',
			'meta-llama/llama-3.3-70b-instruct',
		],
		openai: ['gpt-4o-mini', 'gpt-4o'],
		ollama: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2', 'deepseek-r1:8b'],
		lmstudio: ['local-model'],
		custom: ['custom-model'],
	};

	function formatModelLabel(modelId: string): string {
		if (MODEL_DESCRIPTIONS[modelId]?.label) return MODEL_DESCRIPTIONS[modelId].label;
		const base = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
		return base
			.replace(/[-_]/g, ' ')
			.replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
			.replace(/(\d+b)/i, (_, s) => s.toUpperCase());
	}

	function formatModelBadge(modelId: string, isLocalProv: boolean): string {
		if (MODEL_DESCRIPTIONS[modelId]?.badge) return MODEL_DESCRIPTIONS[modelId].badge;
		if (isLocalProv) return 'Local Model';
		if (modelId.includes('/')) return modelId.split('/')[0];
		const match = modelId.match(/(\d+b)/i);
		if (match) return `${match[1].toUpperCase()} Model`;
		return 'Discovered Model';
	}

	function getFilteredModels(models: string[], query: string): string[] {
		if (!query || !query.trim()) return models;
		const q = query.trim().toLowerCase();
		return models.filter((m) => {
			const info = MODEL_DESCRIPTIONS[m];
			const label = info?.label || formatModelLabel(m);
			const badge = info?.badge || '';
			const desc = info?.desc || '';
			return (
				m.toLowerCase().includes(q) ||
				label.toLowerCase().includes(q) ||
				badge.toLowerCase().includes(q) ||
				desc.toLowerCase().includes(q)
			);
		});
	}

	async function resetModelsToDefault(providerId: string) {
		const defaults = DEFAULT_PROVIDER_MODELS[providerId];
		if (!defaults) return;
		const prov = providers.find((p) => p.id === providerId);
		if (prov) {
			prov.availableModels = [...defaults];
			if (!defaults.includes(activeModelDraft[providerId])) {
				activeModelDraft[providerId] = defaults[0];
			}
			providers = [...providers];
			await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: providerId, availableModels: defaults }),
			});
			toast.success(`Reset models to defaults for ${prov.name}`);
		}
	}

	async function removeModel(providerId: string, modelId: string) {
		const prov = providers.find((p) => p.id === providerId);
		if (!prov || prov.availableModels.length <= 1) {
			toast.error('Cannot remove the only remaining model');
			return;
		}
		const nextModels = prov.availableModels.filter((m) => m !== modelId);
		prov.availableModels = nextModels;
		if (activeModelDraft[providerId] === modelId) {
			activeModelDraft[providerId] = nextModels[0];
		}
		providers = [...providers];
		try {
			await fetch('/api/system/providers', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: providerId, availableModels: nextModels }),
			});
			toast.success(`Removed model "${modelId}"`);
		} catch {
			// silent fallback
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
			} else {
				toast.error(data.message || 'No models found on endpoint');
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
				}),
			});

			const data = await res.json();
			testResult = data;

			if (data.ok) {
				toast.success(`Connection verified (${data.latencyMs}ms)`);
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
			badge: 'Flagship · High Accuracy',
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
		// Groq
		'llama-3.3-70b-versatile': {
			label: 'Llama 3.3 70B',
			badge: 'Ultra-Fast · 500+ t/s',
			desc: 'Flagship Meta open-source model running at extreme LPU throughput on Groq.',
		},
		'qwen-2.5-32b': {
			label: 'Qwen 2.5 32B',
			badge: 'High Accuracy · Fast',
			desc: 'High multilingual precision and strong Asian language comic localization context.',
		},
		'deepseek-r1-distill-llama-70b': {
			label: 'DeepSeek R1 Distill 70B',
			badge: 'Distilled Intelligence',
			desc: 'Distilled DeepSeek model running on Groq LPUs with high translation fluency.',
		},
		// OpenRouter
		'google/gemini-2.5-flash': {
			label: 'Gemini 2.5 Flash',
			badge: 'OpenRouter · Fast',
			desc: 'Cost-effective, high-speed multi-lingual translation through OpenRouter.',
		},
		'anthropic/claude-3.5-sonnet': {
			label: 'Claude 3.5 Sonnet',
			badge: 'Literary Flagship',
			desc: 'Unmatched prose quality, character dialogue nuance, and natural localization tone.',
		},
		'deepseek/deepseek-v4-flash': {
			label: 'DeepSeek V4 Flash',
			badge: 'Ultra-Fast',
			desc: 'DeepSeek V4 high-speed comic translation model via OpenRouter routing.',
		},
		'meta-llama/llama-3.3-70b-instruct': {
			label: 'Llama 3.3 70B Instruct',
			badge: 'Open Source Flagship',
			desc: 'Standard instruction-tuned Llama 3.3 model on OpenRouter.',
		},
		// OpenAI
		'gpt-4o-mini': {
			label: 'GPT-4o Mini',
			badge: 'Recommended · Fast',
			desc: 'Affordable, low-latency OpenAI multimodal model with sharp conversational dialogue.',
		},
		'gpt-4o': {
			label: 'GPT-4o',
			badge: 'OpenAI Flagship',
			desc: 'Top-tier multimodal model with nuanced conversational phrasing and slang preservation.',
		},
		// Ollama Local
		'qwen2.5:14b': {
			label: 'Qwen 2.5 14B',
			badge: 'Recommended Local',
			desc: 'Exceptional Chinese, Japanese, and Korean manhua localization quality on local GPUs.',
		},
		'qwen2.5:7b': {
			label: 'Qwen 2.5 7B',
			badge: 'Lightweight Local',
			desc: 'Fast local model running smoothly on lower VRAM GPUs or CPU offload.',
		},
		'llama3.2': {
			label: 'Llama 3.2',
			badge: 'Fast Local',
			desc: 'Compact Meta local model with quick inference generation.',
		},
		'deepseek-r1:8b': {
			label: 'DeepSeek R1 8B',
			badge: 'Local Reasoning',
			desc: 'Local quantized distilled model with reasoning suppressed for rapid translation.',
		},
		// LM Studio
		'local-model': {
			label: 'Active LM Studio Model',
			badge: 'Loaded Model',
			desc: 'Directly routes translations to whatever model is currently loaded in LM Studio.',
		},
		// Custom
		'custom-model': {
			label: 'Custom Model Identifier',
			badge: 'Custom',
			desc: 'Custom target model for self-hosted or reverse proxy endpoints.',
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
				<SlidersHorizontal size={13} class={`shrink-0 ${activeSettingsTab === 'general' ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''}`} />
				<span class="truncate px-0.5">
					Preferences<span class="hidden sm:inline"> & Config</span>
				</span>
			</button>
		</div>

		<!-- TAB 1: AI & PROVIDERS -->
		{#if activeSettingsTab === 'ai'}
			<div class="flex flex-col gap-6 py-1">
				<!-- INPAINTING STRATEGY (NOW PLACED FIRST) -->
				<div>
					<div class="mb-2.5 sm:mb-3">
						<div class="text-xs font-bold uppercase tracking-wider opacity-80 pl-0.5">Inpainting Strategy</div>
						<p class="text-[11px] opacity-60 pl-0.5">Choose how original comic text is erased and the background artwork is reconstructed</p>
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

				<!-- TRANSLATION AI PROVIDERS (WITH SVG LOGOS) -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
					<div>
						<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center justify-between">
							<span>AI Translation Provider</span>
							<span class="text-[10px] font-mono font-normal opacity-50">Multi-Provider Engine</span>
						</div>
						<p class="text-[11px] opacity-60">Select your preferred local or cloud LLM inference engine for comic localization</p>
					</div>

					<!-- CATEGORY FILTER PILLS -->
					<div class="flex flex-wrap items-center gap-1.5 border-b border-black/10 pb-2.5 dark:border-white/10">
						<button
							type="button"
							on:click={() => (providerCategoryFilter = 'all')}
							class={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
								providerCategoryFilter === 'all'
									? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
									: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
							}`}
						>
							All Providers ({providers.length})
						</button>
						<button
							type="button"
							on:click={() => (providerCategoryFilter = 'cloud')}
							class={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
								providerCategoryFilter === 'cloud'
									? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
									: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
							}`}
						>
							<Zap size={11} />
							<span>Cloud Fast</span>
						</button>
						<button
							type="button"
							on:click={() => (providerCategoryFilter = 'local')}
							class={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
								providerCategoryFilter === 'local'
									? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-neutral-950'
									: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
							}`}
						>
							<Server size={11} />
							<span>Local & Offline (Free)</span>
						</button>
						<button
							type="button"
							on:click={() => (providerCategoryFilter = 'custom')}
							class={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
								providerCategoryFilter === 'custom'
									? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
									: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
							}`}
						>
							<SlidersHorizontal size={11} />
							<span>Custom Endpoint</span>
						</button>
					</div>

					<!-- PROVIDER SELECTION GRID WITH SVG LOGOS -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
						{#each providers.filter((p) => providerCategoryFilter === 'all' || getProviderCategory(p.id) === providerCategoryFilter) as prov}
							{@const isSelected = selectedProviderId === prov.id}
							{@const isLoc = isLocal(prov.id)}
							<button
								type="button"
								on:click={() => {
									selectedProviderId = prov.id;
									testResult = null;
								}}
								class={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all duration-200 ${
									isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.06] text-current ring-2 ring-[#b23a2e]/30 shadow-xs dark:border-[#e08a63] dark:bg-[#e08a63]/[0.08]'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
								use:ripple
							>
								<div>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2 font-bold text-xs">
											<ProviderLogo
												providerId={prov.id}
												size={15}
												className={prov.id === 'deepseek'
													? 'text-sky-500 shrink-0'
													: prov.id === 'google'
														? 'text-[#b23a2e] dark:text-[#e08a63] shrink-0'
														: prov.id === 'groq'
															? 'text-orange-500 shrink-0'
															: prov.id === 'openrouter'
																? 'text-purple-500 shrink-0'
																: prov.id === 'openai'
																	? 'text-emerald-500 shrink-0'
																	: prov.id === 'ollama'
																		? 'text-teal-500 shrink-0'
																		: prov.id === 'lmstudio'
																			? 'text-indigo-500 shrink-0'
																			: 'text-amber-500 shrink-0'}
											/>
											<span class="pl-0.5 truncate">{prov.name}</span>
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

									<div class="mt-2 flex items-center gap-1.5 text-[10px] pl-0.5">
										{#if isLoc}
											<span class="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 font-bold text-teal-700 dark:text-teal-300">
												<Server size={10} /> Local Daemon
											</span>
										{:else if prov.hasKey}
											<span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
												<Check size={10} class="stroke-[3]" /> Key Configured ({prov.maskedKey})
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
												<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Key Required
											</span>
										{/if}
									</div>
								</div>

								<div class="mt-2 text-[10.5px] font-mono opacity-60 truncate pl-0.5">
									Active: {prov.activeModel}
								</div>
							</button>
						{/each}
					</div>

					<!-- SELECTED PROVIDER CONFIGURATION PANEL -->
					{#if selectedProviderId}
						{@const currentP = providers.find((p) => p.id === selectedProviderId)}
						{#if currentP}
							{@const currentIsLocal = isLocal(currentP.id)}
							{@const filteredModels = getFilteredModels(currentP.availableModels, modelSearch)}
							{@const canReset = currentP.availableModels.length > (DEFAULT_PROVIDER_MODELS[currentP.id]?.length || 2)}
							<div class="rounded-2xl border border-black/10 bg-black/[0.02] p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
										<ProviderLogo
											providerId={currentP.id}
											size={16}
											className={currentP.id === 'deepseek'
												? 'text-sky-500 shrink-0'
												: currentP.id === 'google'
													? 'text-[#b23a2e] dark:text-[#e08a63] shrink-0'
													: currentP.id === 'groq'
														? 'text-orange-500 shrink-0'
														: currentP.id === 'openrouter'
															? 'text-purple-500 shrink-0'
															: currentP.id === 'openai'
																? 'text-emerald-500 shrink-0'
																: currentP.id === 'ollama'
																	? 'text-teal-500 shrink-0'
																	: currentP.id === 'lmstudio'
																		? 'text-indigo-500 shrink-0'
																		: 'text-amber-500 shrink-0'}
										/>
										<span class="pl-0.5">{currentP.name} Configuration</span>
										{#if currentIsLocal}
											<span class="rounded-md bg-teal-500/15 border border-teal-500/30 px-1.5 py-0.5 text-[9px] font-bold text-teal-700 dark:text-teal-300">
												FREE & OFFLINE
											</span>
										{/if}
									</div>

									{#if currentP.id === 'google'}
										<a
											href="https://aistudio.google.com/api-keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-[11px] text-[#b23a2e] dark:text-[#e08a63] hover:underline font-semibold pl-0.5"
										>
											<span>Get Google AI API Key</span>
											<ExternalLink size={11} />
										</a>
									{:else if currentP.id === 'deepseek'}
										<a
											href="https://platform.deepseek.com/api_keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] hover:underline text-[11px] font-semibold pl-0.5"
										>
											<span>Get DeepSeek API Key</span>
											<ExternalLink size={11} />
										</a>
									{:else if currentP.id === 'groq'}
										<a
											href="https://console.groq.com/keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline text-[11px] font-semibold pl-0.5"
										>
											<span>Get Groq API Key</span>
											<ExternalLink size={11} />
										</a>
									{:else if currentP.id === 'openrouter'}
										<a
											href="https://openrouter.ai/keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline text-[11px] font-semibold pl-0.5"
										>
											<span>Get OpenRouter API Key</span>
											<ExternalLink size={11} />
										</a>
									{:else if currentP.id === 'openai'}
										<a
											href="https://platform.openai.com/api-keys"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline text-[11px] font-semibold pl-0.5"
										>
											<span>Get OpenAI API Key</span>
											<ExternalLink size={11} />
										</a>
									{/if}
								</div>

								<!-- LOCAL RUNNER HELPER CALLOUT -->
								{#if currentIsLocal}
									<div class="flex items-start gap-2.5 rounded-xl border border-teal-500/25 bg-teal-500/10 p-3 text-teal-900 dark:text-teal-200 text-xs leading-relaxed">
										<Server size={15} class="shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
										<div>
											<strong class="font-bold pl-0.5">Zero-Cost Local Server:</strong>
											<p class="mt-0.5 text-[11px] opacity-90 pl-0.5">
												Connects directly to your local {currentP.id === 'ollama' ? 'Ollama daemon (default http://localhost:11434)' : 'LM Studio server (default http://localhost:1234)'}. No cloud API keys or external network requests needed.
											</p>
										</div>
									</div>
								{/if}

								<!-- HIGH SPEED ZERO-REASONING NOTICE -->
								<div class="flex items-center gap-2 rounded-xl bg-black/[0.03] border border-black/10 px-3 py-2 text-[11px] dark:bg-white/[0.03] dark:border-white/10 text-neutral-700 dark:text-neutral-300">
									<Zap size={13} class="text-amber-500 shrink-0" />
									<span class="pl-0.5">
										<strong>High-Speed Mode Active:</strong> Thinking & reasoning tokens are automatically suppressed for rapid translation output and reduced token consumption.
									</span>
								</div>

								<!-- API KEY INPUT & STATUS (FOR CLOUD OR CUSTOM PROVIDERS) -->
								{#if !currentIsLocal}
									<div class="space-y-2">
										<div class="flex items-center justify-between">
											<label for={`provider-key-${currentP.id}`} class="text-[11px] font-semibold opacity-80 pl-0.5">
												API Key
											</label>
											{#if currentP.hasKey}
												<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-semibold pr-0.5">
													<Check size={11} class="stroke-[3]" /> Stored in SQLite: {currentP.maskedKey}
												</span>
											{:else}
												<span class="text-amber-600 dark:text-amber-400 text-[10px] font-medium pr-0.5">
													No key saved
												</span>
											{/if}
										</div>

										<!-- STORED KEY BANNER IF PRESENT -->
										{#if currentP.hasKey}
											<div class="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs">
												<div class="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium pl-0.5">
													<CheckCircle2 size={14} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
													<span>Active key: <code class="font-mono font-bold bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px]">{currentP.maskedKey}</code></span>
												</div>
												<button
													type="button"
													on:click={() => clearKey(currentP.id)}
													class="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline cursor-pointer pr-0.5"
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
													placeholder={currentP.hasKey ? `Replace key (Currently: ${currentP.maskedKey})...` : 'Enter API Key...'}
													class="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-10 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-black/30 dark:text-neutral-100 font-mono"
												/>
											{:else}
												<input
													id={`provider-key-${currentP.id}`}
													type="password"
													bind:value={apiKeyDraft[currentP.id]}
													placeholder={currentP.hasKey ? `Replace key (Currently: ${currentP.maskedKey})...` : 'Enter API Key...'}
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
								{/if}

								<!-- MODEL SELECTION & DISCOVERY -->
								<div class="space-y-2.5">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<div class="flex items-center gap-1.5 pl-0.5 shrink-0">
											<div class="text-[11px] font-semibold opacity-80 whitespace-nowrap">
												Active Model
											</div>
											<span class="rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10px] font-mono font-medium opacity-70 whitespace-nowrap">
												{currentP.availableModels.length} {currentP.availableModels.length === 1 ? 'model' : 'models'}
											</span>
										</div>
										<div class="flex items-center gap-2.5 pr-0.5 shrink-0">
											{#if canReset}
												<button
													type="button"
													on:click={() => resetModelsToDefault(currentP.id)}
													title="Reset to default curated models"
													class="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition whitespace-nowrap"
												>
													<RotateCcw size={11} />
													<span>Reset</span>
												</button>
											{/if}
											<button
												type="button"
												on:click={() => scanModels(currentP.id)}
												disabled={scanningModels}
												title={currentIsLocal ? 'Scan Installed Models via local endpoint' : 'Scan Models via API'}
												class="inline-flex items-center gap-1 text-[11px] font-bold text-[#b23a2e] dark:text-[#e08a63] hover:underline disabled:opacity-50 whitespace-nowrap"
											>
												<RefreshCw size={11} class={scanningModels ? 'animate-spin' : ''} />
												<span>{scanningModels ? 'Scanning...' : 'Scan Models'}</span>
												<span class="hidden min-[480px]:inline">{!scanningModels && (currentIsLocal ? ' (Local)' : ' (API)')}</span>
											</button>
										</div>
									</div>

									<!-- SEARCH FILTER (FOR SCAN RESULTS WITH > 3 MODELS OR ACTIVE SEARCH) -->
									{#if currentP.availableModels.length > 3 || modelSearch.trim()}
										<div class="relative flex items-center">
											<Search size={13} class="absolute left-2.5 text-neutral-400 pointer-events-none" />
											<input
												type="text"
												bind:value={modelSearch}
												placeholder={`Filter ${currentP.availableModels.length} models (e.g. qwen, flash, 70b)...`}
												class="w-full rounded-xl border border-black/10 bg-white/70 pl-8 pr-8 py-1.5 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/10 dark:bg-black/30 dark:text-neutral-100"
											/>
											{#if modelSearch.trim()}
												<button
													type="button"
													on:click={() => (modelSearch = '')}
													class="absolute right-2.5 p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
													title="Clear search"
												>
													<X size={13} />
												</button>
											{/if}
										</div>
									{/if}

									<!-- MODEL LIST / GRID (SCROLLABLE TO PREVENT MODAL BLOAT) -->
									<div class="max-h-[290px] overflow-y-auto pr-1 space-y-1.5">
										{#if filteredModels.length === 0}
											<div class="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-4 text-center">
												<p class="text-xs opacity-60">No models match "{modelSearch}".</p>
												<button
													type="button"
													on:click={() => (modelSearch = '')}
													class="mt-1 text-xs font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline"
												>
													Clear search filter
												</button>
											</div>
										{:else}
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
												{#each filteredModels as modelId}
													{@const label = formatModelLabel(modelId)}
													{@const badge = formatModelBadge(modelId, currentIsLocal)}
													{@const desc = MODEL_DESCRIPTIONS[modelId]?.desc || ''}
													{@const isModelSelected = (activeModelDraft[currentP.id] || currentP.activeModel) === modelId}
													<div
														class={`group relative flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
															isModelSelected
																? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] ring-1 ring-[#b23a2e]/30 dark:border-[#e08a63] dark:bg-[#e08a63]/[0.08]'
																: 'border-black/10 bg-white/40 hover:bg-white hover:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'
														}`}
													>
														<button
															type="button"
															on:click={() => (activeModelDraft[currentP.id] = modelId)}
															class="w-full text-left cursor-pointer focus:outline-hidden"
														>
															<div class="flex items-center justify-between gap-1">
																<span class="text-xs font-bold truncate pr-1 pl-0.5">{label}</span>
																{#if isModelSelected}
																	<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
																{/if}
															</div>
															{#if label !== modelId}
																<p class="font-mono text-[9px] opacity-50 truncate pl-0.5 mt-0.5">{modelId}</p>
															{/if}
															<div class="mt-1.5 flex items-center gap-1.5 pl-0.5">
																<span class="rounded-md bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-semibold opacity-70">
																	{badge}
																</span>
															</div>
															{#if desc}
																<p class="mt-1 text-[10px] opacity-60 leading-tight pl-0.5">{desc}</p>
															{/if}
														</button>

														<!-- DELETE / REMOVE MODEL ICON (IF NOT SELECTED & MULTIPLE MODELS EXIST) -->
														{#if !isModelSelected && currentP.availableModels.length > 1}
															<button
																type="button"
																on:click|stopPropagation={() => removeModel(currentP.id, modelId)}
																title={`Remove "${modelId}" from list`}
																class="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-600 dark:text-neutral-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition cursor-pointer rounded"
															>
																<Trash2 size={12} />
															</button>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>

									<!-- QUICK CUSTOM MODEL ENTRY -->
									<div class="flex items-center gap-1.5 pt-1">
										<input
											type="text"
											bind:value={customModelInput}
											placeholder="Add specific model tag (e.g. qwen2.5:32b, deepseek-ai/DeepSeek-V3)..."
											on:keydown={(e) => e.key === 'Enter' && addCustomModel(currentP.id)}
											class="w-full rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs text-neutral-900 shadow-2xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-black/30 dark:text-neutral-100 font-mono"
										/>
										<button
											type="button"
											on:click={() => addCustomModel(currentP.id)}
											disabled={!customModelInput.trim()}
											class="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs font-bold hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 disabled:opacity-40 shadow-2xs transition shrink-0 cursor-pointer"
										>
											<Plus size={13} />
											<span>Add</span>
										</button>
									</div>
								</div>

								<!-- ADVANCED: CUSTOM BASE URL -->
								<div class="space-y-2 pt-1 border-t border-black/10 dark:border-white/10">
									<button
										type="button"
										on:click={() => (showAdvancedBaseUrl[currentP.id] = !showAdvancedBaseUrl[currentP.id])}
										class="flex items-center gap-1 text-[11px] opacity-60 hover:opacity-100 font-semibold"
									>
										<span>{showAdvancedBaseUrl[currentP.id] ? 'Hide' : 'Show'} Endpoint URL ({currentP.baseUrl})</span>
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
										disabled={testingProvider || (!currentIsLocal && !currentP.hasKey && !apiKeyDraft[currentP.id])}
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
												<span>Set as Active Engine</span>
											</button>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					{/if}
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
						<!-- LIVE STATUS PILL (MOBILE ADAPTIVE) — SHOWS A SPINNER WHILE RELOADING MODELS -->
						{#if hardwareInfo}
							<div
								class={`self-start sm:self-auto flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 sm:py-1 text-[10px] font-bold max-w-full ${
									switchingDevice || hardwareInfo.reloading
										? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
										: mlOffline
											? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
											: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
								}`}
								title={mlOffline ? 'ML sidecar unreachable — compute accelerator selection disabled' : 'Active ONNX Runtime Provider'}
							>
								{#if switchingDevice || hardwareInfo.reloading}
									<Loader2 size={11} class="text-amber-500 shrink-0 animate-spin" />
									<span class="truncate px-0.5">Reloading models…</span>
								{:else if mlOffline}
									<ZapOff size={11} class="text-red-500 shrink-0" />
									<span class="truncate px-0.5">Offline (sidecar unreachable)</span>
								{:else}
									<Activity size={11} class="text-emerald-500 shrink-0 animate-pulse" />
									<span class="truncate px-0.5">{formatDeviceLabel(hardwareInfo.device_label)}</span>
								{/if}
							</div>
						{/if}
					</div>

					{#if mlOffline}
						<div
							class="mb-3 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-800 dark:text-red-300 text-[11px] leading-relaxed"
						>
							<ZapOff size={14} class="shrink-0 text-red-500 mt-0.5" />
							<div>
								<span class="font-bold">ML Sidecar Offline:</span>
								<span>
									The local OCR/Inpaint sidecar is unreachable, so compute accelerator selection is
									disabled. Start the sidecar to choose an execution engine.
								</span>
							</div>
						</div>
					{/if}

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
						{#each EXECUTION_DEVICES as dev (dev.id)}
							<button
								type="button"
								disabled={!!switchingDevice || mlOffline}
								on:click={() => setExecutionDevice(dev.id)}
								class={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all duration-200 ${
									mlOffline
										? 'opacity-40 hover:opacity-40 border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01] cursor-not-allowed'
										: !isDeviceAvailable(dev.id) || switchingDevice
											? 'opacity-45 hover:opacity-60 border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01] cursor-not-allowed'
											: $settings.executionDevice === dev.id
												? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
												: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
							>
								<div>
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5 font-bold text-xs">
											{#if switchingDevice === dev.id}
												<Loader2 size={13} class="shrink-0 animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
											{:else}
												<Cpu size={13} class={`shrink-0 ${isDeviceAvailable(dev.id) ? 'opacity-80' : 'opacity-40'}`} />
											{/if}
											<span>{dev.label}</span>
										</div>
										{#if $settings.executionDevice === dev.id && switchingDevice !== dev.id}
											<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
										{/if}
									</div>
									<div class="mt-1 text-[10px] opacity-70 leading-relaxed">{dev.blurb}</div>
								</div>
								{#if mlOffline}
									<div class="mt-1.5 text-[9px] font-semibold text-red-600 dark:text-red-400">
										Unavailable while sidecar is offline
									</div>
								{:else if !isDeviceAvailable(dev.id) && getDeviceAvailabilityReason(dev.id)}
									<div class="mt-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
										{getDeviceAvailabilityReason(dev.id)}
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

					<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
						{#each [1, 2, 3, 4] as count (count)}
							<button
								type="button"
								on:click={() => setParallelProcesses(count)}
								use:ripple
								class={`rounded-xl border py-2.5 px-2 text-center text-xs font-bold transition-all ${
									($settings.parallelProcesses || 2) === count
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
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

					<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
						{#each [1, 2, 3, 4] as count (count)}
							<button
								type="button"
								on:click={() => setParallelChapters(count)}
								use:ripple
								class={`rounded-xl border py-2.5 px-2 text-center text-xs font-bold transition-all ${
									($settings.parallelChapters || 2) === count
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
								}`}
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
							<div class="text-[11px] font-semibold opacity-75">Source Language</div>
							<LanguagePicker
								value={$settings.sourceLang || 'zh-Hans'}
								mode="source"
								on:change={(e) => updateSourceLang(e.detail)}
							/>
						</div>

						<div class="space-y-1">
							<div class="text-[11px] font-semibold opacity-75">Target Language</div>
							<LanguagePicker
								value={$settings.targetLang || 'en'}
								mode="target"
								excludeCode={$settings.sourceLang || 'zh-Hans'}
								on:change={(e) => updateTargetLang(e.detail)}
							/>
						</div>
					</div>
				</div>

				<!-- TYPESETTING & LETTERING STUDIO -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="flex items-center justify-between gap-4">
						<div>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Palette size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Typesetting & Lettering Studio</span>
							</div>
							<p class="text-[11px] opacity-60 mt-0.5 max-w-md">
								Configure dialogue fonts, CJK fallback engine, bubble padding margins, text stroke outlines, and angle tilt rotation.
							</p>
						</div>

						<button
							type="button"
							on:click={() => (typesetModalOpen = true)}
							class="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3.5 py-2 text-xs font-bold hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 transition shadow-2xs shrink-0 cursor-pointer"
							use:ripple
						>
							<SlidersHorizontal size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Customize</span>
						</button>
					</div>
				</div>

				<!-- SYSTEM & BUILD VERSION INFO -->
				<div class="border-t border-black/10 pt-4 dark:border-white/10">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Info size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>System & Build Information</span>
							</div>
							<p class="text-[11px] opacity-60 mt-0.5">
								XianScan native binary and embedded frontend build fingerprint
							</p>
						</div>

						<div class="flex items-center gap-2 self-start sm:self-auto">
							<div class="flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11px] font-mono dark:border-white/10 dark:bg-white/[0.03]">
								<span class="opacity-60">Version:</span>
								<span class="font-bold text-[#b23a2e] dark:text-[#e08a63]">v{hardwareInfo?.version || '0.1.0'}</span>
							</div>
							{#if hardwareInfo?.web_build_hash}
								<div
									class="flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11px] font-mono dark:border-white/10 dark:bg-white/[0.03]"
									title="Web frontend build hash"
								>
									<span class="opacity-60">Web:</span>
									<span class="font-bold">{hardwareInfo.web_build_hash}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</Modal>

<TypesetSettingsModal bind:open={typesetModalOpen} />
