<script context="module" lang="ts">
	// -- TYPES -- //
	export type SettingsCategory =
		| 'appearance'
		| 'typesetting'
		| 'inpainting'
		| 'providers'
		| 'compute'
		| 'about';
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { tick, onDestroy, createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import {
		settings,
		DEFAULTS,
		INPAINT_MODES,
		EXECUTION_DEVICES,
		CUDA_VRAM_LIMIT_PRESETS,
		APP_FONTS,
		AVAILABLE_TYPESET_FONTS,
		AVAILABLE_CJK_FONTS,
		fontAvailabilityStore,
		refreshFontAvailability,
		type Theme,
		type AppFont,
		type InpaintMode,
		type ExecutionDevice,
		type TypesetOutline,
		type TypesetContrast,
		type TypesetCasing,
	} from '$lib/stores/settings';
	import { mlStatus } from '$lib/stores/ml-status';
	// IMPORTED ICONS
	import Languages from 'lucide-svelte/icons/languages';
	import Check from 'lucide-svelte/icons/check';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Eraser from 'lucide-svelte/icons/eraser';
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
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Palette from 'lucide-svelte/icons/palette';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import Sliders from 'lucide-svelte/icons/sliders';
	import Server from 'lucide-svelte/icons/server';
	import Search from 'lucide-svelte/icons/search';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Save from 'lucide-svelte/icons/save';
	import Info from 'lucide-svelte/icons/info';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Contrast from 'lucide-svelte/icons/contrast';
	import Compass from 'lucide-svelte/icons/compass';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import X from 'lucide-svelte/icons/x';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
	import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';

	// PROPS COMPATIBILITY: ACCEPTS BOTH LEGACY (ai | compute | general) AND NEW CATEGORIES
	export let open = false;
	export let initialTab: 'ai' | 'compute' | 'general' | SettingsCategory = 'appearance';

	const dispatch = createEventDispatcher<{
		openTour: void;
	}>();

	// -- MAP LEGACY TABS TO CATEGORIES -- //
	function normalizeCategory(tab: string): SettingsCategory {
		if (tab === 'ai') return 'providers';
		if (tab === 'general') return 'appearance';
		if (tab === 'compute') return 'compute';
		if (['appearance', 'typesetting', 'inpainting', 'providers', 'compute', 'about'].includes(tab)) {
			return tab as SettingsCategory;
		}
		return 'appearance';
	}

	// -- STATES -- //
	let activeCategory: SettingsCategory = normalizeCategory(initialTab);
	let mobileView: 'menu' | 'detail' = initialTab ? 'detail' : 'menu';
	let globalSearch = '';

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
		cuda_vram_limit_mb?: number | null;
		configured_cuda_vram_limit_mb?: number | null;
		version?: string;
		app_version?: string;
		web_build_hash?: string;
		web_build_time?: string;
	}

	interface SystemTelemetry {
		gpu?: {
			name: string;
			vram_used_mb: number;
			vram_total_mb: number;
			utilization_pct?: number | null;
			active_provider: string;
		} | null;
		host_memory: {
			used_mb: number;
			total_mb: number;
		};
		cpu: {
			cores: number;
			utilization_pct?: number | null;
		};
		queue: {
			active_jobs: number;
			queued_jobs: number;
		};
		timestamp_ms: number;
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
	let switchingDevice: ExecutionDevice | null = null;
	let switchingToastId: string | number | null = null;
	let settingVramLimit = false;
	let vramToastId: string | number | null = null;

	// LIVE TELEMETRY STATE
	let telemetry: SystemTelemetry | null = null;
	let telemetryInterval: ReturnType<typeof setInterval> | null = null;

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

	// TYPESETTING PREVIEW STATES
	interface TextPreset {
		id: string;
		label: string;
		lang: string;
		text: string;
	}

	const SAMPLE_TEXT_PRESETS: TextPreset[] = [
		{ id: 'en', label: 'English', lang: 'en', text: 'Hold on! What is this Cultivation Realm...?!' },
		{ id: 'zh-hans', label: '简体中文', lang: 'zh-Hans', text: '等一下！这是什么修炼境界……？！' },
		{ id: 'zh-hant', label: '繁體中文', lang: 'zh-Hant', text: '等一下！這是什麼修煉境界……？！' },
		{ id: 'ja', label: '日本語', lang: 'ja', text: 'ちょっと待て！この修業の領域は何だ…？！' },
		{ id: 'ko', label: '한국어', lang: 'ko', text: '잠깐만! 이 수련의 경지는 대체 뭐지...?!' },
	];

	let previewDarkBackground = false;
	let previewSimulatedAngle = 8;
	let selectedPresetId = $settings.typesetPreviewPreset || 'en';
	let isCustomTextMode = ($settings.typesetPreviewPreset || 'en') === 'custom';
	let previewSampleText = $settings.typesetPreviewText || SAMPLE_TEXT_PRESETS[0].text;
	const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/;

	function selectTextPreset(preset: TextPreset) {
		selectedPresetId = preset.id;
		previewSampleText = preset.text;
		isCustomTextMode = false;
		settings.update((s) => ({
			...s,
			typesetPreviewText: preset.text,
			typesetPreviewPreset: preset.id,
		}));
	}

	function onCustomTextChange(val: string) {
		previewSampleText = val;
		settings.update((s) => ({
			...s,
			typesetPreviewText: val,
			typesetPreviewPreset: 'custom',
		}));
	}

	function enableCustomTextMode() {
		isCustomTextMode = true;
		selectedPresetId = 'custom';
		settings.update((s) => ({
			...s,
			typesetPreviewPreset: 'custom',
		}));
	}

	// PRESETS
	const OUTLINE_PRESETS: { id: TypesetOutline; label: string; px: string; desc: string }[] = [
		{ id: 'none', label: 'None', px: '0px', desc: 'No outline stroke' },
		{ id: 'thin', label: 'Thin', px: '1.5px', desc: 'Subtle boundary' },
		{ id: 'standard', label: 'Standard', px: '3px', desc: 'Balanced scanlation stroke' },
		{ id: 'heavy', label: 'Heavy', px: '5px', desc: 'Thick contrast halo' },
	];

	const PADDING_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.02, label: 'Tight (2%)', sub: 'Maximal bubble fill' },
		{ value: 0.05, label: 'Balanced (5%)', sub: 'Standard edge clearance' },
		{ value: 0.08, label: 'Spacious (8%)', sub: 'Generous breathing room' },
		{ value: 0.12, label: 'Airy (12%)', sub: 'Large boundary padding' },
	];

	const CONTRAST_PRESETS: { id: TypesetContrast; label: string; shortLabel: string; desc: string }[] = [
		{ id: 'auto', label: 'Auto Contrast', shortLabel: 'Auto', desc: 'Luminance' },
		{ id: 'dark', label: 'Always Dark', shortLabel: 'Dark', desc: 'Black text' },
		{ id: 'light', label: 'Always Light', shortLabel: 'Light', desc: 'White text' },
	];

	const CASING_PRESETS: { id: TypesetCasing; label: string; sample: string; desc: string }[] = [
		{ id: 'uppercase', label: 'UPPERCASE', sample: 'HOLD ON! WHAT IS...', desc: 'Standard comic scanlation' },
		{ id: 'original', label: 'Normal / As Is', sample: 'Hold on! What is...', desc: 'Keep sentence casing' },
		{ id: 'lowercase', label: 'lowercase', sample: 'hold on! what is...', desc: 'All lower case' },
	];

	const INPAINT_EXPANSION_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.0, label: '0%', sub: 'Exact text bound' },
		{ value: 0.03, label: '3%', sub: 'Minimal margin (Default)' },
		{ value: 0.06, label: '6%', sub: 'Standard cleaning' },
		{ value: 0.09, label: '9%', sub: 'Broad inpaint mask' },
		{ value: 0.12, label: '12%', sub: 'Max font halo erase' },
	];

	const TYPESET_EXPANSION_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.0, label: '0%', sub: 'Exact text bound' },
		{ value: 0.03, label: '3%', sub: 'Minimal wrap margin (Default)' },
		{ value: 0.06, label: '6%', sub: 'Compact wrap margin' },
		{ value: 0.09, label: '9%', sub: 'Broad wrap margin' },
		{ value: 0.12, label: '12%', sub: 'Balanced wrap' },
	];

	const THEMES: { id: Theme; label: string; dot: string }[] = [
		{ id: 'auto', label: 'Auto', dot: 'border-slate-400 bg-gradient-to-r from-[#fbfaf7] via-slate-400 to-[#13100c]' },
		{ id: 'light', label: 'Light', dot: 'border-slate-300 bg-[#fbfaf7]' },
		{ id: 'sepia', label: 'Sepia', dot: 'border-[#d4c3a3] bg-[#f4ecd8]' },
		{ id: 'dark', label: 'Dark', dot: 'border-neutral-700 bg-[#13100c]' },
	];

	// HELPER FUNCTIONS
	function isLocal(id: string): boolean {
		return id === 'ollama' || id === 'lmstudio';
	}

	function getProviderCategory(id: string): 'cloud' | 'local' | 'custom' {
		if (id === 'ollama' || id === 'lmstudio') return 'local';
		if (id === 'custom') return 'custom';
		return 'cloud';
	}

	function formatDeviceLabel(label?: string): string {
		if (!label) return 'Detecting...';
		return label
			.replace(/\s*\(Forced via MT_DEVICE=[^)]+\)/i, '')
			.replace(/\s*\(Standard\)/i, '')
			.replace(/\s*\/ AMD & Intel & NVIDIA/i, '')
			.trim();
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

	async function loadTelemetry() {
		try {
			const res = await fetch('/api/system/telemetry');
			if (res.ok) {
				telemetry = (await res.json()) as SystemTelemetry;
			}
		} catch {
			// SILENT FALLBACK
		}
	}

	async function setCudaVramLimit(limitMb: number | null) {
		if (settingVramLimit || switchingDevice || mlOffline) return;
		settingVramLimit = true;
		const label = limitMb ? `${(limitMb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : 'Auto (Adaptive)';
		if (vramToastId) {
			toast.dismiss(vramToastId);
		}
		vramToastId = toast.loading(`Updating GPU VRAM allocation to ${label}...`);
		try {
			const res = await fetch('/api/system/hardware', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					device: $settings.executionDevice || 'auto',
					vram_limit_mb: limitMb === null ? 0 : limitMb,
				}),
			});
			if (res.ok) {
				hardwareInfo = (await res.json()) as HardwareInfo;
				settings.update((s) => ({ ...s, cudaVramLimitMb: limitMb }));
				if (hardwareInfo.reloading) {
					if (vramToastId) {
						toast.dismiss(vramToastId);
					}
					vramToastId = toast.loading(`Reallocating GPU VRAM memory pools (${label})...`);
					void waitForVramReloadDone(label);
				} else {
					if (vramToastId) {
						toast.dismiss(vramToastId);
						vramToastId = null;
					}
					toast.success(`GPU VRAM allocation set to ${label}`);
					settingVramLimit = false;
					void mlStatus.checkHealth();
				}
			} else {
				if (vramToastId) {
					toast.dismiss(vramToastId);
					vramToastId = null;
				}
				toast.error('Failed to update GPU VRAM allocation limit');
				settingVramLimit = false;
			}
		} catch (e: any) {
			if (vramToastId) {
				toast.dismiss(vramToastId);
				vramToastId = null;
			}
			toast.error(e.message || 'Failed to update GPU VRAM allocation');
			settingVramLimit = false;
		}
	}

	async function waitForVramReloadDone(label: string) {
		const maxWaitMs = 60000;
		const startedAt = Date.now();
		while (Date.now() - startedAt < maxWaitMs) {
			await new Promise((r) => setTimeout(r, 300));
			try {
				const res = await fetch('/api/system/hardware');
				if (res.ok) {
					const info = (await res.json()) as HardwareInfo;
					hardwareInfo = info;
					if (!info.reloading) break;
				}
			} catch {
				break;
			}
		}
		settingVramLimit = false;
		if (vramToastId) {
			toast.dismiss(vramToastId);
			vramToastId = null;
		}
		toast.success(`GPU VRAM allocation set to ${label}`);
		void mlStatus.checkHealth();
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
		activeCategory = normalizeCategory(initialTab);
		mobileView = initialTab ? 'detail' : 'menu';
		apiKeyDraft = {};
		testResult = null;
		customModelInput = '';
		globalSearch = '';
		loadHardwareStatus();
		loadProviders();
		loadTelemetry();
		void refreshFontAvailability();
		if (telemetryInterval) clearInterval(telemetryInterval);
		telemetryInterval = setInterval(loadTelemetry, 2000);
		void mlStatus.checkHealth();
	} else {
		if (telemetryInterval) {
			clearInterval(telemetryInterval);
			telemetryInterval = null;
		}
	}

	onDestroy(() => {
		if (telemetryInterval) {
			clearInterval(telemetryInterval);
			telemetryInterval = null;
		}
		if (switchingToastId) {
			toast.dismiss(switchingToastId);
			switchingToastId = null;
		}
		if (vramToastId) {
			toast.dismiss(vramToastId);
			vramToastId = null;
		}
	});

	$: mlOffline = !$mlStatus.loading && !$mlStatus.online;

	$: gpuVramPct = telemetry?.gpu && telemetry.gpu.vram_total_mb > 0
		? Math.min(100, Math.max(0, (telemetry.gpu.vram_used_mb / telemetry.gpu.vram_total_mb) * 100))
		: 0;

	$: hostRamPct = telemetry?.host_memory && telemetry.host_memory.total_mb > 0
		? Math.min(100, Math.max(0, (telemetry.host_memory.used_mb / telemetry.host_memory.total_mb) * 100))
		: 0;

	// SETTINGS DISPATCHERS
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

	function setTypesetFont(font: string) {
		settings.update((s) => ({ ...s, typesetFont: font }));
		toast.success(`Dialogue font set to ${font}`);
	}

	function setTypesetCjkFont(font: string) {
		settings.update((s) => ({ ...s, typesetCjkFont: font }));
		toast.success(`CJK fallback font set to ${font}`);
	}

	function setPadding(val: number) {
		settings.update((s) => ({ ...s, typesetPadding: val }));
		const label = PADDING_PRESETS.find((p) => Math.abs(p.value - val) < 0.005)?.label || `${Math.round(val * 100)}%`;
		toast.success(`Bubble padding set to ${label}`);
	}

	function setOutline(mode: TypesetOutline) {
		settings.update((s) => ({ ...s, typesetOutline: mode }));
		const label = OUTLINE_PRESETS.find((p) => p.id === mode)?.label || mode;
		toast.success(`Text stroke outline set to ${label}`);
	}

	function setContrast(mode: TypesetContrast) {
		settings.update((s) => ({ ...s, typesetContrast: mode }));
		const label = CONTRAST_PRESETS.find((p) => p.id === mode)?.label || mode;
		toast.success(`Contrast mode set to ${label}`);
	}

	function setCasing(casing: TypesetCasing) {
		settings.update((s) => ({
			...s,
			typesetCasing: casing,
			typesetAllCaps: casing === 'uppercase',
		}));
		const label = CASING_PRESETS.find((c) => c.id === casing)?.label || casing;
		toast.success(`Dialogue casing set to ${label}`);
	}

	function toggleTextRotation() {
		settings.update((s) => {
			const next = !s.enableTextRotation;
			toast.success(`Text angle rotation ${next ? 'enabled' : 'disabled'}`);
			return { ...s, enableTextRotation: next };
		});
	}

	function setInpaintExpansion(val: number) {
		settings.update((s) => ({ ...s, inpaintExpansionPct: val }));
		const label = INPAINT_EXPANSION_PRESETS.find((p) => Math.abs(p.value - val) < 0.005)?.label || `${Math.round(val * 100)}%`;
		toast.success(`Inpaint cleaning expansion set to ${label}`);
	}

	function setTypesetExpansion(val: number) {
		settings.update((s) => ({ ...s, typesetExpansionPct: val }));
		const label = TYPESET_EXPANSION_PRESETS.find((p) => Math.abs(p.value - val) < 0.005)?.label || `${Math.round(val * 100)}%`;
		toast.success(`Typeset layout expansion set to ${label}`);
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

	// TAB MODIFICATION DETECTORS (FOR CONDITIONAL RESET BUTTON VISIBILITY)
	$: isAppearanceModified =
		$settings.theme !== DEFAULTS.theme ||
		$settings.appFont !== DEFAULTS.appFont ||
		($settings.sourceLang || 'zh-Hans') !== (DEFAULTS.sourceLang || 'zh-Hans') ||
		($settings.targetLang || 'en') !== (DEFAULTS.targetLang || 'en');

	$: isTypesettingModified =
		($settings.typesetFont || 'CC Wild Words') !== DEFAULTS.typesetFont ||
		($settings.typesetCjkFont || 'Microsoft YaHei') !== DEFAULTS.typesetCjkFont ||
		Math.abs(($settings.typesetPadding || 0.05) - DEFAULTS.typesetPadding) >= 0.005 ||
		($settings.typesetOutline || 'standard') !== DEFAULTS.typesetOutline ||
		($settings.typesetContrast || 'auto') !== DEFAULTS.typesetContrast ||
		($settings.typesetCasing || 'uppercase') !== DEFAULTS.typesetCasing ||
		Boolean($settings.enableTextRotation) !== Boolean(DEFAULTS.enableTextRotation) ||
		($settings.typesetPreviewPreset || 'en') !== (DEFAULTS.typesetPreviewPreset || 'en') ||
		($settings.typesetPreviewText || '') !== (DEFAULTS.typesetPreviewText || '');

	$: isInpaintingModified =
		($settings.inpaintMode || 'patch') !== DEFAULTS.inpaintMode ||
		Math.abs(($settings.inpaintExpansionPct ?? 0.03) - DEFAULTS.inpaintExpansionPct) >= 0.005 ||
		Math.abs(($settings.typesetExpansionPct ?? 0.0) - DEFAULTS.typesetExpansionPct) >= 0.005;

	function resetAppearanceDefaults() {
		settings.update((s) => ({
			...s,
			theme: DEFAULTS.theme,
			appFont: DEFAULTS.appFont,
			sourceLang: DEFAULTS.sourceLang,
			targetLang: DEFAULTS.targetLang,
		}));
		toast.success('General & Appearance settings reset to defaults');
	}

	function resetTypesetDefaults() {
		settings.update((s) => ({
			...s,
			typesetFont: DEFAULTS.typesetFont,
			typesetCjkFont: DEFAULTS.typesetCjkFont,
			typesetPadding: DEFAULTS.typesetPadding,
			typesetOutline: DEFAULTS.typesetOutline,
			typesetContrast: DEFAULTS.typesetContrast,
			typesetCasing: DEFAULTS.typesetCasing,
			typesetAllCaps: DEFAULTS.typesetAllCaps,
			enableTextRotation: DEFAULTS.enableTextRotation,
			typesetPreviewPreset: DEFAULTS.typesetPreviewPreset,
			typesetPreviewText: DEFAULTS.typesetPreviewText,
		}));
		selectedPresetId = 'en';
		previewSampleText = SAMPLE_TEXT_PRESETS[0].text;
		isCustomTextMode = false;
		toast.success('Typesetting settings reset to defaults');
	}

	function resetInpaintingDefaults() {
		settings.update((s) => ({
			...s,
			inpaintMode: DEFAULTS.inpaintMode,
			inpaintExpansionPct: DEFAULTS.inpaintExpansionPct,
			typesetExpansionPct: DEFAULTS.typesetExpansionPct,
		}));
		toast.success('Inpainting settings reset to defaults');
	}

	// HARDWARE ACCELERATION METHODS
	function isDeviceAvailable(devId: ExecutionDevice): boolean {
		if (devId === 'auto' || devId === 'cpu') return true;
		if (!hardwareInfo) return false;
		if (devId === 'cuda') return hardwareInfo.has_cuda;
		if (devId === 'coreml') return hardwareInfo.has_coreml;
		if (devId === 'dml') return hardwareInfo.has_directml_raw ?? hardwareInfo.has_directml;
		return true;
	}

	function getDeviceAvailabilityReason(devId: ExecutionDevice): string | null {
		if (!hardwareInfo) return 'Detecting available hardware...';
		if (devId === 'cuda' && !hardwareInfo.has_cuda) return 'Dedicated NVIDIA CUDA GPU not detected';
		if (devId === 'coreml' && !hardwareInfo.has_coreml) return 'Apple Silicon GPU (CoreML) not detected';
		if (devId === 'dml' && !(hardwareInfo.has_directml_raw ?? hardwareInfo.has_directml)) {
			if (hardwareInfo.detected_gpus && hardwareInfo.detected_gpus.some((g) => g.is_integrated)) {
				const igpuName = hardwareInfo.detected_gpus.find((g) => g.is_integrated)?.name || 'Integrated GPU';
				return `Only ${igpuName} detected. DirectML disabled to protect system against freezing and driver TDR crashes.`;
			}
			return 'Dedicated GPU for DirectML not detected';
		}
		return null;
	}

	async function setExecutionDevice(dev: ExecutionDevice) {
		if (mlOffline) {
			toast.error('ML sidecar is offline: cannot switch compute hardware.');
			return;
		}

		if (!isDeviceAvailable(dev)) {
			const reason = getDeviceAvailabilityReason(dev);
			toast.error(`Cannot select ${dev.toUpperCase()}: ${reason || 'Hardware not supported'}`);
			return;
		}

		if (switchingDevice) return;

		const found = EXECUTION_DEVICES.find((d) => d.id === dev);
		const targetLabel = found?.label || dev;
		switchingDevice = dev;
		if (switchingToastId) {
			toast.dismiss(switchingToastId);
		}
		switchingToastId = toast.loading(`Initializing compute accelerator: ${targetLabel}...`);

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
				const resolvedLabel = formatDeviceLabel(hardwareInfo.device_label) || targetLabel;
				if (expectedEp && active && active !== expectedEp) {
					settings.update((s) => ({ ...s, executionDevice: 'auto' }));
					if (switchingToastId) {
						toast.dismiss(switchingToastId);
						switchingToastId = null;
					}
					toast.error(`${targetLabel} is not available. Running on ${resolvedLabel}.`);
					switchingDevice = null;
				} else {
					settings.update((s) => ({ ...s, executionDevice: dev }));
					if (hardwareInfo.reloading) {
						if (switchingToastId) {
							toast.dismiss(switchingToastId);
						}
						switchingToastId = toast.loading(`Reloading neural models on ${resolvedLabel}...`);
						void waitForReloadDone(dev, resolvedLabel);
					} else {
						if (switchingToastId) {
							toast.dismiss(switchingToastId);
							switchingToastId = null;
						}
						toast.success(`Compute accelerator active: ${resolvedLabel}`);
						switchingDevice = null;
						void mlStatus.checkHealth();
					}
				}
			} else {
				if (switchingToastId) {
					toast.dismiss(switchingToastId);
					switchingToastId = null;
				}
				toast.error(`Failed to switch compute hardware to ${targetLabel}`);
				switchingDevice = null;
			}
		} catch {
			if (switchingToastId) {
				toast.dismiss(switchingToastId);
				switchingToastId = null;
			}
			toast.error(`Failed to switch compute hardware to ${targetLabel}`);
			switchingDevice = null;
			void mlStatus.checkHealth();
		}
	}

	async function waitForReloadDone(dev: ExecutionDevice, resolvedLabel?: string) {
		const maxWaitMs = 60000;
		const startedAt = Date.now();
		while (Date.now() - startedAt < maxWaitMs) {
			await new Promise((r) => setTimeout(r, 300));
			try {
				const res = await fetch('/api/system/hardware');
				if (res.ok) {
					const info = (await res.json()) as HardwareInfo;
					hardwareInfo = info;
					if (!info.reloading) break;
				}
			} catch {
				break;
			}
		}
		switchingDevice = null;
		if (switchingToastId) {
			toast.dismiss(switchingToastId);
			switchingToastId = null;
		}
		if (resolvedLabel) {
			toast.success(`Compute accelerator ready: ${resolvedLabel}`);
		}
		void mlStatus.checkHealth();
	}

	// PROVIDER METHODS
	const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
		deepseek: 'https://api.deepseek.com',
		google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
		groq: 'https://api.groq.com/openai/v1',
		openrouter: 'https://openrouter.ai/api/v1',
		openai: 'https://api.openai.com/v1',
		ollama: 'http://localhost:11434/v1',
		lmstudio: 'http://localhost:1234/v1',
		custom: 'http://localhost:8000/v1',
	};

	function hasChangesForProvider(
		providerId: string,
		provList: ProviderInfo[],
		keyDraft: Record<string, string>,
		urlDraft: Record<string, string>,
		modelDraft: Record<string, string>
	): boolean {
		const prov = provList.find((p) => p.id === providerId);
		if (!prov) return false;
		const hasKey = Boolean(keyDraft[providerId] && keyDraft[providerId].trim().length > 0);
		const hasUrl = urlDraft[providerId] !== undefined && urlDraft[providerId] !== (prov.baseUrl || '');
		const hasModel = modelDraft[providerId] !== undefined && modelDraft[providerId] !== (prov.activeModel || '');
		return hasKey || hasUrl || hasModel;
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
				const err = await res.json();
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
				body: JSON.stringify({ id: providerId, clearApiKey: true }),
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
		'local-model': {
			label: 'Active LM Studio Model',
			badge: 'Loaded Model',
			desc: 'Directly routes translations to whatever model is currently loaded in LM Studio.',
		},
		'custom-model': {
			label: 'Custom Model Identifier',
			badge: 'Custom',
			desc: 'Custom target model for self-hosted or reverse proxy endpoints.',
		},
	};

	// COMPUTED PREVIEW STYLES
	$: selectedFont = AVAILABLE_TYPESET_FONTS.find((f) => f.id === $settings.typesetFont);
	$: isTextCjk = CJK_REGEX.test(previewSampleText);
	$: isCasingApplicable = !isTextCjk && !selectedFont?.allCapsOnly && $settings.typesetFont !== 'CC Wild Words';
	$: previewFontFamily = isTextCjk
		? `"${$settings.typesetCjkFont || 'Microsoft YaHei'}", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", sans-serif`
		: (selectedFont?.stack || "'CC Wild Words', sans-serif");
	$: previewIsDarkBubble = $settings.typesetContrast === 'light' ? true : $settings.typesetContrast === 'dark' ? false : previewDarkBackground;
	$: previewTextColor = previewIsDarkBubble ? '#ffffff' : '#111111';
	$: previewStrokeColor = previewIsDarkBubble ? '#000000' : '#ffffff';
	$: previewStrokeWidth = $settings.typesetOutline === 'none' ? '0px' : $settings.typesetOutline === 'thin' ? '1px' : $settings.typesetOutline === 'heavy' ? '3px' : '2px';
	$: previewEffectiveText =
		!isCasingApplicable || ($settings.typesetCasing || 'uppercase') === 'uppercase'
			? previewSampleText.toUpperCase()
			: $settings.typesetCasing === 'lowercase'
				? previewSampleText.toLowerCase()
				: previewSampleText;
	$: previewTransformRotation = $settings.enableTextRotation ? `rotate(${previewSimulatedAngle}deg)` : 'none';
	$: previewInsetPadding = `${Math.max(8, Math.round(120 * ($settings.typesetPadding || 0.05)))}px`;
	$: previewFontSizePx = '14px';

	// SIDEBAR CATEGORY NAVIGATION
	interface NavItem {
		id: SettingsCategory;
		label: string;
		icon: any;
		keywords: string[];
	}

	interface NavGroup {
		title: string;
		items: NavItem[];
	}

	const NAV_GROUPS: NavGroup[] = [
		{
			title: 'Reader & Studio',
			items: [
				{ id: 'appearance', label: 'General & Appearance', icon: Palette, keywords: ['theme', 'light', 'dark', 'sepia', 'font', 'language', 'locale', 'source', 'target'] },
				{ id: 'typesetting', label: 'Typesetting & Lettering', icon: Type, keywords: ['font', 'cjk', 'bubble', 'dialogue', 'padding', 'stroke', 'outline', 'contrast', 'casing', 'angle', 'rotation', 'preview'] },
				{ id: 'inpainting', label: 'Inpainting & Masking', icon: Eraser, keywords: ['inpaint', 'patch', 'scaled', 'full', 'watermark', 'geometry', 'expansion', 'mask'] },
			],
		},
		{
			title: 'Engines & Compute',
			items: [
				{ id: 'providers', label: 'AI Translation Providers', icon: Zap, keywords: ['ai', 'provider', 'deepseek', 'gemini', 'groq', 'openrouter', 'openai', 'ollama', 'lmstudio', 'custom', 'model', 'api key'] },
				{ id: 'compute', label: 'Hardware & Compute', icon: Cpu, keywords: ['hardware', 'gpu', 'cuda', 'directml', 'coreml', 'cpu', 'workers', 'parallel', 'reslice', 'performance', 'onnx'] },
			],
		},
		{
			title: 'System',
			items: [
				{ id: 'about', label: 'About & Diagnostics', icon: Info, keywords: ['version', 'build', 'hash', 'system', 'diagnostics', 'sidecar', 'health'] },
			],
		},
	];

	interface SearchableSetting {
		id: string;
		label: string;
		category: SettingsCategory;
		categoryLabel: string;
		categoryIcon: any;
		keywords: string[];
	}

	const ALL_SEARCHABLE_SETTINGS: SearchableSetting[] = [
		// APPEARANCE
		{ id: 'theme', label: 'Reader Surface Theme', category: 'appearance', categoryLabel: 'General & Appearance', categoryIcon: Palette, keywords: ['theme', 'dark', 'light', 'sepia', 'mode', 'color', 'background'] },
		{ id: 'app-font', label: 'Studio System Font', category: 'appearance', categoryLabel: 'General & Appearance', categoryIcon: Palette, keywords: ['font', 'typography', 'system', 'ui', 'wild words', 'clash', 'poppins', 'lexend', 'montserrat'] },
		{ id: 'lang-pair', label: 'Default Localization Pair', category: 'appearance', categoryLabel: 'General & Appearance', categoryIcon: Palette, keywords: ['language', 'locale', 'source', 'target', 'chinese', 'english', 'japanese', 'korean'] },

		// TYPESETTING
		{ id: 'preview', label: 'Live Speech Bubble Preview', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['preview', 'bubble', 'dialogue', 'sample', 'live', 'manga'] },
		{ id: 'typeset-font', label: 'Latin Dialogue Font', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['font', 'latin', 'english', 'wild words', 'montserrat', 'general sans', 'poppins'] },
		{ id: 'typeset-cjk', label: 'CJK East Asian Fallback Engine', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['cjk', 'chinese', 'japanese', 'korean', 'fallback', 'font', 'yahei', 'gothic', 'hangul'] },
		{ id: 'typeset-padding', label: 'Bubble Inset Padding', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['padding', 'margin', 'inset', 'tight', 'balanced', 'spacious', 'airy', 'fit'] },
		{ id: 'typeset-outline', label: 'Text Stroke Outline', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['stroke', 'outline', 'border', 'thin', 'standard', 'heavy', 'thickness'] },
		{ id: 'typeset-contrast', label: 'Contrast Strategy', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['contrast', 'auto', 'luminance', 'dark', 'light'] },
		{ id: 'typeset-angle', label: 'Bubble Tilt Angle Rotation', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['tilt', 'angle', 'rotation', 'rotate', 'diagonal'] },
		{ id: 'typeset-casing', label: 'Dialogue Letterform Casing', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['casing', 'uppercase', 'lowercase', 'all-caps', 'capitalization'] },

		// INPAINTING
		{ id: 'inpaint-mode', label: 'Inpainting Strategy', category: 'inpainting', categoryLabel: 'Inpainting & Masking', categoryIcon: Eraser, keywords: ['inpaint', 'patch', 'scaled', 'full', 'erase', 'cleaning', 'lama'] },
		{ id: 'inpaint-geom', label: 'Three-Tier Region Geometry Expansion', category: 'inpainting', categoryLabel: 'Inpainting & Masking', categoryIcon: Eraser, keywords: ['geometry', 'expansion', 'tier', 'margin', 'bounds', 'inpaint mask', 'typeset box'] },

		// AI PROVIDERS
		{ id: 'providers-hub', label: 'AI Translation Provider Selection', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['provider', 'ai', 'cloud', 'local', 'custom', 'deepseek', 'gemini', 'groq', 'openrouter', 'openai', 'ollama', 'lmstudio'] },
		{ id: 'api-key', label: 'API Key Configuration & Vault', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['api key', 'key', 'token', 'auth', 'secret', 'mask'] },
		{ id: 'model-scan', label: 'Model Selection & Discovery Scanner', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['model', 'scan', 'discover', 'flash', 'pro', 'qwen', 'llama', 'gemini', 'deepseek'] },
		{ id: 'test-connection', label: 'Connection & Latency Tester', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['test', 'connection', 'ping', 'latency', 'verify'] },
		{ id: 'custom-endpoint', label: 'Custom Endpoint Base URL', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['endpoint', 'url', 'base', 'custom', 'proxy'] },

		// HARDWARE & COMPUTE
		{ id: 'compute-device', label: 'Hardware Compute Accelerator (ONNX)', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['hardware', 'accelerator', 'gpu', 'cuda', 'directml', 'coreml', 'cpu', 'nvidia', 'amd', 'intel'] },
		{ id: 'vram-limit', label: 'GPU VRAM Allocation Memory Limit', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Sliders, keywords: ['vram', 'gpu ram', 'memory', 'allocator', 'limit', 'gb', 'cuda memory', 'oom'] },
		{ id: 'telemetry-monitor', label: 'Live System & GPU Telemetry Monitor', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Activity, keywords: ['telemetry', 'monitor', 'live', 'vram', 'ram', 'cpu', 'load', 'queue', 'memory tracker'] },
		{ id: 'igpu-protect', label: 'Integrated GPU Protection', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['igpu', 'integrated', 'protection', 'driver', 'freeze', 'tdr'] },
		{ id: 'auto-reslice', label: 'Auto-Reslice Before Batch Translation', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['reslice', 'slice', 'webtoon', 'smart', 'seam', 'gutter', 'split'] },
		{ id: 'parallel-workers', label: 'Parallel Page Workers Concurrency', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['worker', 'parallel', 'concurrency', 'threads', 'speed', 'page'] },
		{ id: 'parallel-chapters', label: 'Parallel Batch Chapters Concurrency', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['batch', 'chapter', 'concurrency', 'queue', 'parallel'] },

		// ABOUT
		{ id: 'version-info', label: 'Native Core & Web Build Fingerprint', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: Info, keywords: ['version', 'build', 'hash', 'binary', 'commit', 'fingerprint'] },
		{ id: 'sidecar-health', label: 'ML Sidecar Health & Status', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: Info, keywords: ['sidecar', 'health', 'status', 'online', 'offline', 'ml'] },
		{ id: 'welcome-tour', label: 'Welcome Tour & Feature Guide', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: Sparkles, keywords: ['welcome', 'tour', 'guide', 'onboarding', 'tutorial', 'intro', 'introduction', 'walkthrough', 'step', 'help'] },
	];

	let searchFocused = false;
	let highlightedSettingId: string | null = null;

	function getMatchingSettings(query: string): Map<string, { category: SettingsCategory; categoryIcon: any; items: SearchableSetting[] }> {
		const groups = new Map<string, { category: SettingsCategory; categoryIcon: any; items: SearchableSetting[] }>();
		if (!query.trim()) return groups;
		const q = query.trim().toLowerCase();

		for (const setting of ALL_SEARCHABLE_SETTINGS) {
			const labelMatch = setting.label.toLowerCase().includes(q);
			const catMatch = setting.categoryLabel.toLowerCase().includes(q);
			const kwMatch = setting.keywords.some((k) => k.includes(q));

			if (labelMatch || catMatch || kwMatch) {
				if (!groups.has(setting.categoryLabel)) {
					groups.set(setting.categoryLabel, {
						category: setting.category,
						categoryIcon: setting.categoryIcon,
						items: [],
					});
				}
				groups.get(setting.categoryLabel)!.items.push(setting);
			}
		}
		return groups;
	}

	function highlightParts(text: string, query: string): { before: string; match: string; after: string } {
		if (!query || !query.trim()) return { before: text, match: '', after: '' };
		const q = query.trim().toLowerCase();
		const idx = text.toLowerCase().indexOf(q);
		if (idx === -1) return { before: text, match: '', after: '' };
		return {
			before: text.slice(0, idx),
			match: text.slice(idx, idx + q.length),
			after: text.slice(idx + q.length),
		};
	}

	async function jumpToSetting(setting: SearchableSetting) {
		activeCategory = setting.category;
		mobileView = 'detail';
		searchFocused = false;
		globalSearch = '';
		highlightedSettingId = setting.id;

		await tick();
		setTimeout(() => {
			const el = document.getElementById(`setting-${setting.id}`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 80);

		setTimeout(() => {
			if (highlightedSettingId === setting.id) {
				highlightedSettingId = null;
			}
		}, 2200);
	}

	function getMatchingCategories(query: string): Set<SettingsCategory> {
		const matchSet = new Set<SettingsCategory>();
		if (!query.trim()) {
			for (const group of NAV_GROUPS) {
				for (const item of group.items) matchSet.add(item.id);
			}
			return matchSet;
		}
		const q = query.trim().toLowerCase();
		for (const group of NAV_GROUPS) {
			for (const item of group.items) {
				if (
					item.label.toLowerCase().includes(q) ||
					group.title.toLowerCase().includes(q) ||
					item.keywords.some((k) => k.includes(q))
				) {
					matchSet.add(item.id);
				}
			}
		}
		for (const setting of ALL_SEARCHABLE_SETTINGS) {
			if (
				setting.label.toLowerCase().includes(q) ||
				setting.keywords.some((k) => k.includes(q))
			) {
				matchSet.add(setting.category);
			}
		}
		return matchSet;
	}

	$: matchingCategories = getMatchingCategories(globalSearch);
	$: matchingSettingsGroups = getMatchingSettings(globalSearch);
</script>

<!-- GLOBAL MASTER-DETAIL PREFERENCES & CONFIGURATION MODAL -->
<Modal {open} title="Preferences & Configuration" size="2xl" placement="top" bodyClass="p-0" on:close={() => (open = false)}>
	<div class="flex flex-col md:flex-row h-[76vh] sm:h-[80vh] max-h-[760px] overflow-hidden">
		<!-- LEFT SIDEBAR NAVIGATION PANE (MENU VIEW ON MOBILE) -->
		<div class={`w-full md:w-60 lg:w-64 shrink-0 border-b md:border-b-0 md:border-r border-black/[0.08] bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.02] flex-col ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}>
			<!-- SEARCH BAR & POPOVER CONTAINER -->
			<div class="relative p-3 border-b border-black/[0.06] dark:border-white/[0.06]">
				<div class="relative flex items-center">
					<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none opacity-60" />
					<input
						type="text"
						bind:value={globalSearch}
						on:focus={() => (searchFocused = true)}
						placeholder="Search settings..."
						class="h-[36px] w-full rounded-lg border border-black/10 bg-transparent pl-9 pr-8 text-xs text-neutral-900 placeholder:opacity-40 outline-none transition-colors focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08] dark:text-neutral-100"
					/>
					{#if globalSearch.trim()}
						<button
							type="button"
							on:click={() => {
								globalSearch = '';
								searchFocused = false;
							}}
							class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
						>
							<X size={13} />
						</button>
					{/if}
				</div>

				<!-- FLOATING SEARCH RESULTS POPOVER MENU -->
				{#if globalSearch.trim() && searchFocused}
					<div
						class="absolute top-full left-2 right-2 mt-1.5 z-40 max-h-[290px] overflow-y-auto rounded-xl border border-black/15 bg-white/95 p-1.5 shadow-2xl backdrop-blur-md dark:border-white/15 dark:bg-[#1a1612]/95 space-y-2.5"
					>
						{#if matchingSettingsGroups.size === 0}
							<div class="p-3 text-center text-xs opacity-60">
								No settings matching "{globalSearch}"
							</div>
						{:else}
							{#each Array.from(matchingSettingsGroups.entries()) as [catTitle, groupData]}
								{@const GroupIcon = groupData.categoryIcon}
								<div class="space-y-1">
									<div class="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#b23a2e] dark:text-[#e08a63] opacity-80">
										<GroupIcon size={12} class="shrink-0" />
										<span class="pl-1">{catTitle}</span>
									</div>
									<div class="space-y-0.5">
										{#each groupData.items as setting}
											{@const hp = highlightParts(setting.label, globalSearch)}
											<button
												type="button"
												on:click={() => jumpToSetting(setting)}
												class="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer group"
												use:ripple
											>
												<span class="truncate pl-1.5">
													{#if hp.match}
														{hp.before}<span class="font-bold text-[#b23a2e] dark:text-[#e08a63] underline">{hp.match}</span>{hp.after}
													{:else}
														{setting.label}
													{/if}
												</span>
												<span class="text-[9px] font-semibold opacity-0 group-hover:opacity-60 transition text-[#b23a2e] dark:text-[#e08a63] pl-2 shrink-0">
													Jump ↵
												</span>
											</button>
										{/each}
									</div>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- NAVIGATION CATEGORY LIST -->
			<div class="flex-1 overflow-y-auto p-2 space-y-4">
				{#each NAV_GROUPS as group}
					{@const groupItems = group.items.filter((item) => matchingCategories.has(item.id))}
					{#if groupItems.length > 0}
						<div class="space-y-1">
							<div class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-65">
								{group.title}
							</div>
							<div class="space-y-0.5">
								{#each groupItems as item}
									{@const isActive = activeCategory === item.id}
									{@const IconComponent = item.icon}
									<button
										type="button"
										on:click={() => {
											activeCategory = item.id;
											mobileView = 'detail';
										}}
										class={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all text-left cursor-pointer ${
											isActive
												? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950 font-bold'
												: 'text-neutral-700 hover:bg-black/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.04] opacity-80 hover:opacity-100'
										}`}
										use:ripple
									>
										<IconComponent size={14} class={`shrink-0 ${isActive ? 'text-white dark:text-neutral-950' : 'opacity-70'}`} />
										<span class="truncate">{item.label}</span>
										<ChevronRight size={14} class="md:hidden ml-auto opacity-50 shrink-0" />
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- RIGHT CONTENT PANE (DETAIL VIEW ON MOBILE) -->
		<div class={`flex-1 overflow-y-auto p-4 sm:p-6 flex-col justify-start space-y-4 ${mobileView === 'menu' ? 'hidden md:flex' : 'flex'}`}>
			<!-- MOBILE DRILL-DOWN BACK BUTTON -->
			<button
				type="button"
				on:click={() => (mobileView = 'menu')}
				class="md:hidden inline-flex items-center gap-1.5 -ml-1 py-1 px-2.5 rounded-lg text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/[0.08] dark:bg-[#e08a63]/[0.10] hover:bg-[#b23a2e]/15 transition mb-1 self-start cursor-pointer shrink-0"
				use:ripple
			>
				<ChevronLeft size={15} />
				<span>All Categories</span>
			</button>

			<div class="space-y-6">
				<!-- SECTION 1: GENERAL & APPEARANCE -->
				{#if activeCategory === 'appearance'}
					<div class="space-y-6">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
							<div class="min-w-0 flex-1">
								<h2 class="text-base font-bold">General & Appearance</h2>
								<p class="text-xs opacity-60 mt-0.5">Surface themes, typography styles, and default localization settings</p>
							</div>
							{#if isAppearanceModified}
								<button
									type="button"
									on:click={resetAppearanceDefaults}
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 hover:text-neutral-900 dark:hover:text-white transition-colors shrink-0 whitespace-nowrap self-start sm:self-auto cursor-pointer"
									use:ripple
								>
									<RotateCcw size={12} />
									<span>Reset Defaults</span>
								</button>
							{/if}
						</div>

						<!-- THEME SELECTOR -->
						<div
							id="setting-theme"
							class={`space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'theme' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80">Reader Surface Theme</div>
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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

						<!-- STUDIO SYSTEM FONT -->
						<div
							id="setting-app-font"
							class={`border-t border-black/10 pt-4 dark:border-white/10 space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'app-font' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Studio System Font</span>
							</div>
							<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
											<span class="text-xs font-bold pl-1.5" style="font-family: {font.stack};">{font.label}</span>
											{#if $settings.appFont === font.id}
												<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63]" />
											{/if}
										</div>
										<div class="mt-1 text-[10px] opacity-60 truncate pl-1.5" style="font-family: {font.stack};">Sample 123</div>
									</button>
								{/each}
							</div>
						</div>

						<!-- DEFAULT LOCALIZATION PAIR -->
						<div
							id="setting-lang-pair"
							class={`border-t border-black/10 pt-4 dark:border-white/10 space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'lang-pair' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Globe size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Default Localization Pair</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
					</div>

				<!-- SECTION 2: TYPESETTING & LETTERING STUDIO -->
				{:else if activeCategory === 'typesetting'}
					<div class="space-y-5">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
							<div class="min-w-0 flex-1">
								<h2 class="text-base font-bold">Typesetting & Lettering Studio</h2>
								<p class="text-xs opacity-60 mt-0.5">Dialogue fonts, CJK fallback engines, stroke borders, and live bubble rendering</p>
							</div>
							{#if isTypesettingModified}
								<button
									type="button"
									on:click={resetTypesetDefaults}
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 hover:text-neutral-900 dark:hover:text-white transition-colors shrink-0 whitespace-nowrap self-start sm:self-auto cursor-pointer"
									use:ripple
								>
									<RotateCcw size={12} />
									<span>Reset Defaults</span>
								</button>
							{/if}
						</div>

						<!-- LIVE SPEECH BUBBLE PREVIEW CARD -->
						<div
							id="setting-preview"
							class={`rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3 transition-all duration-300 ${highlightedSettingId === 'preview' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
						>
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
									<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
									<span>Live Speech Bubble Preview</span>
								</div>
								<button
									type="button"
									on:click={() => (previewDarkBackground = !previewDarkBackground)}
									class="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
								>
									{#if previewDarkBackground}
										<Sun size={12} class="text-amber-500" />
										<span>Light Page Scene</span>
									{:else}
										<Moon size={12} class="text-indigo-400" />
										<span>Dark / Night Scene</span>
									{/if}
								</button>
							</div>

							<!-- SCRIPT / SAMPLE PRESET SWITCHER -->
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="text-[10px] font-bold uppercase opacity-60 mr-1">Sample:</span>
								{#each SAMPLE_TEXT_PRESETS as preset}
									{@const isActive = !isCustomTextMode && selectedPresetId === preset.id}
									<button
										type="button"
										on:click={() => selectTextPreset(preset)}
										class={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer ${
											isActive
												? 'border-[#b23a2e] bg-[#b23a2e] text-white shadow-2xs dark:bg-[#e08a63] dark:border-[#e08a63] dark:text-neutral-950'
												: 'border-black/10 bg-white hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300'
										}`}
									>
										{preset.label}
									</button>
								{/each}
								<button
									type="button"
									on:click={enableCustomTextMode}
									class={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer ${
										isCustomTextMode
											? 'border-[#b23a2e] bg-[#b23a2e] text-white shadow-2xs dark:bg-[#e08a63] dark:border-[#e08a63] dark:text-neutral-950'
											: 'border-black/10 bg-white hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300'
									}`}
								>
									<Edit3 size={11} />
									<span>Custom</span>
								</button>
							</div>

							{#if isCustomTextMode}
								<input
									type="text"
									value={previewSampleText}
									on:input={(e) => onCustomTextChange(e.currentTarget.value)}
									placeholder="Type preview dialogue..."
									class="h-[36px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-xs outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
								/>
							{/if}

							<!-- SIMULATED MANGA ARTWORK CANVAS -->
							<div
								class={`relative flex min-h-[150px] items-center justify-center overflow-hidden rounded-xl border p-6 transition-colors duration-200 ${
									previewDarkBackground ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-[#faf7f2] border-neutral-300/80 text-neutral-900'
								}`}
							>
								<div class="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#888_1px,transparent_1px)] [background-size:12px_12px]"></div>
								<div
									class="relative z-10 max-w-[280px] sm:max-w-[320px] rounded-3xl border-2 shadow-lg transition-all duration-150 text-center"
									style="
										padding: calc(10px + {previewInsetPadding}) calc(14px + {previewInsetPadding});
										transform: {previewTransformRotation};
										background-color: {previewIsDarkBubble ? '#181614' : '#ffffff'};
										border-color: {previewIsDarkBubble ? '#ffffff' : '#111111'};
									"
								>
									<div
										class="font-bold leading-snug select-none transition-all duration-150 break-words px-1.5"
										style="
											font-family: {previewFontFamily};
											font-size: {previewFontSizePx};
											color: {previewTextColor};
											paint-order: stroke fill;
											-webkit-text-stroke: {previewStrokeWidth} {previewStrokeColor};
											text-shadow: {previewStrokeWidth !== '0px' ? `0 0 3px ${previewStrokeColor}` : 'none'};
										"
									>
										{previewEffectiveText}
									</div>
								</div>
								<div class="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white backdrop-blur-xs">
									<Compass size={10} />
									<span>{$settings.enableTextRotation ? `Tilt Angle: +${previewSimulatedAngle}°` : 'Horizontal (0°)'}</span>
								</div>
							</div>
						</div>

						<!-- LATIN DIALOGUE FONT -->
						<div
							id="setting-typeset-font"
							class={`space-y-2 transition-all duration-300 ${highlightedSettingId === 'typeset-font' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80">Latin / English Dialogue Font</div>
							<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
								{#each AVAILABLE_TYPESET_FONTS as font}
									{@const isSelected = ($settings.typesetFont || 'CC Wild Words') === font.id}
									{@const status = $fontAvailabilityStore[font.id]}
									{@const isAvailable = status ? status.available : (font.bundled ?? true)}
									<button
										type="button"
										disabled={!isAvailable}
										on:click={() => isAvailable && setTypesetFont(font.id)}
										title={!isAvailable ? `${font.label} is not installed on this system / server` : font.label}
										class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
											!isAvailable
												? 'opacity-40 cursor-not-allowed border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01]'
												: isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-pointer'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] cursor-pointer'
										}`}
										use:ripple
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-bold pl-1.5" style="font-family: {font.stack};">{font.label}</span>
											{#if isSelected}
												<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											{:else if !isAvailable}
												<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">Missing</span>
											{:else if font.bundled}
												<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#4f7a64]/15 text-[#4f7a64] dark:bg-[#4f7a64]/25 dark:text-[#83b39a]">Bundled</span>
											{/if}
										</div>
										<div class="mt-1 text-[10px] opacity-60 truncate pl-1.5">
											{!isAvailable ? 'Not Installed on Server' : font.sub}
										</div>
									</button>
								{/each}
							</div>
						</div>

						<!-- CJK FALLBACK ENGINE -->
						<div
							id="setting-typeset-cjk"
							class={`border-t border-black/10 pt-4 dark:border-white/10 space-y-2 transition-all duration-300 ${highlightedSettingId === 'typeset-cjk' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80">CJK East Asian Fallback Engine</div>
							<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
								{#each AVAILABLE_CJK_FONTS as cjk}
									{@const isSelected = ($settings.typesetCjkFont || 'Microsoft YaHei') === cjk.id}
									{@const status = $fontAvailabilityStore[cjk.id]}
									{@const isAvailable = status ? status.available : (cjk.bundled ?? true)}
									<button
										type="button"
										disabled={!isAvailable}
										on:click={() => isAvailable && setTypesetCjkFont(cjk.id)}
										title={!isAvailable ? `${cjk.label} is not installed on this system / server` : cjk.label}
										class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
											!isAvailable
												? 'opacity-40 cursor-not-allowed border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01]'
												: isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-pointer'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] cursor-pointer'
										}`}
										use:ripple
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-bold truncate pl-1.5">{cjk.label}</span>
											{#if isSelected}
												<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											{:else if !isAvailable}
												<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">Missing</span>
											{:else if cjk.bundled}
												<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#4f7a64]/15 text-[#4f7a64] dark:bg-[#4f7a64]/25 dark:text-[#83b39a]">Bundled</span>
											{/if}
										</div>
										<div class="mt-1 text-[9px] opacity-60 truncate pl-1.5">
											{!isAvailable ? 'Not Installed on Server' : cjk.sub}
										</div>
									</button>
								{/each}
							</div>
						</div>

						<!-- BUBBLE PADDING & STROKE -->
						<div class="border-t border-black/10 pt-4 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div
								id="setting-typeset-padding"
								class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'typeset-padding' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
							>
								<div class="text-xs font-bold uppercase tracking-wider opacity-80">Bubble Inset Padding</div>
								<div class="grid grid-cols-2 gap-1.5">
									{#each PADDING_PRESETS as preset}
										{@const isSelected = Math.abs(($settings.typesetPadding || 0.05) - preset.value) < 0.005}
										<button
											type="button"
											on:click={() => setPadding(preset.value)}
											class={`rounded-lg border p-2 text-left transition-all ${
												isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]'
											}`}
											use:ripple
										>
											<div class="text-xs">{preset.label}</div>
											<div class="text-[9px] opacity-60 truncate">{preset.sub}</div>
										</button>
									{/each}
								</div>
							</div>

							<div
								id="setting-typeset-outline"
								class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'typeset-outline' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
							>
								<div class="text-xs font-bold uppercase tracking-wider opacity-80">Text Stroke Outline</div>
								<div class="grid grid-cols-2 gap-1.5">
									{#each OUTLINE_PRESETS as oPreset}
										{@const isSelected = ($settings.typesetOutline || 'standard') === oPreset.id}
										<button
											type="button"
											on:click={() => setOutline(oPreset.id)}
											class={`rounded-lg border p-2 text-left transition-all ${
												isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]'
											}`}
											use:ripple
										>
											<div class="text-xs">{oPreset.label}</div>
											<div class="text-[9px] opacity-60 truncate">{oPreset.desc}</div>
										</button>
									{/each}
								</div>
							</div>
						</div>

						<!-- CONTRAST & TILT ROTATION -->
						<div class="border-t border-black/10 pt-4 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div
								id="setting-typeset-contrast"
								class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'typeset-contrast' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
							>
								<div class="text-xs font-bold uppercase tracking-wider opacity-80">Contrast Strategy</div>
								<div class="grid grid-cols-3 gap-1.5">
									{#each CONTRAST_PRESETS as cPreset}
										{@const isSelected = ($settings.typesetContrast || 'auto') === cPreset.id}
										<button
											type="button"
											on:click={() => setContrast(cPreset.id)}
											class={`rounded-lg border p-2 text-center transition-all ${
												isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]'
											}`}
											use:ripple
										>
											<div class="text-xs">{cPreset.shortLabel}</div>
											<div class="text-[9px] opacity-60 truncate">{cPreset.desc}</div>
										</button>
									{/each}
								</div>
							</div>

							<div
								id="setting-typeset-angle"
								class={`flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'typeset-angle' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
							>
								<div>
									<div class="text-xs font-bold">Bubble Tilt Angle</div>
									<div class="text-[10px] opacity-60 mt-0.5">Rotate text along detected bubble angle</div>
								</div>
								<Switch
									checked={$settings.enableTextRotation}
									on:click={toggleTextRotation}
									ariaLabel="Bubble Tilt Angle"
								/>
							</div>
						</div>

						<!-- DIALOGUE LETTERFORM CASING -->
						<div
							id="setting-typeset-casing"
							class={`border-t border-black/10 pt-4 dark:border-white/10 space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'typeset-casing' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="flex items-center justify-between">
								<div class="text-xs font-bold uppercase tracking-wider opacity-80">Dialogue Letterform Casing</div>
								{#if !isCasingApplicable}
									<span class="text-[10px] opacity-50 italic">Active font is all-caps / CJK</span>
								{/if}
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
								{#each CASING_PRESETS as cPreset}
									{@const isSelected = ($settings.typesetCasing || 'uppercase') === cPreset.id}
									<button
										type="button"
										on:click={() => setCasing(cPreset.id)}
										class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
											isSelected
												? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 font-bold shadow-xs'
												: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
										}`}
										use:ripple
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-bold pl-0.5">{cPreset.label}</span>
											{#if isSelected}
												<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											{/if}
										</div>
										<div class="mt-1 text-[9px] opacity-60 leading-tight pl-0.5">{cPreset.desc}</div>
									</button>
								{/each}
							</div>
						</div>
					</div>

				<!-- SECTION 3: INPAINTING & MASKING -->
				{:else if activeCategory === 'inpainting'}
					<div class="space-y-5">
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
							<div class="min-w-0 flex-1">
								<h2 class="text-base font-bold">Inpainting & Masking</h2>
								<p class="text-xs opacity-60 mt-0.5">Artwork cleaning strategies, watermark removal, and three-tier geometry bounds</p>
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

						<!-- THREE-TIER REGION GEOMETRY EXPANSION -->
						<div
							id="setting-inpaint-geom"
							class={`border-t border-black/10 pt-4 dark:border-white/10 space-y-3 transition-all duration-300 ${highlightedSettingId === 'inpaint-geom' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
								<Sliders size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>Three-Tier Region Geometry Expansion</span>
							</div>

							<!-- VISUAL DIAGRAM CARD -->
							<div class="relative overflow-hidden rounded-xl border border-black/10 bg-neutral-100 dark:border-white/10 dark:bg-neutral-950 p-3 flex flex-col items-center justify-center">
								<div class="w-full max-w-[280px] rounded-lg border-2 border-[#7f1d1d] dark:border-red-500 bg-[#7f1d1d]/20 dark:bg-red-500/20 p-2 flex flex-col items-center text-center">
									<div class="flex items-center justify-between w-full text-[9px] font-bold text-[#7f1d1d] dark:text-red-300 mb-1 px-1">
										<span>Tier 3: Typesetting Box</span>
										<span class="font-mono">+{Math.round(($settings.typesetExpansionPct ?? 0.03) * 100)}%</span>
									</div>
									<div class="w-[90%] rounded-md border-2 border-dashed border-black/80 dark:border-white/80 bg-black/10 dark:bg-white/10 p-1.5 flex flex-col items-center">
										<div class="flex items-center justify-between w-full text-[8.5px] font-semibold text-neutral-800 dark:text-neutral-200 mb-1 px-0.5">
											<span>Tier 2: Inpaint Mask</span>
											<span class="font-mono">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
										</div>
										<div class="w-[85%] rounded border-2 border-dotted border-white bg-black/20 dark:bg-black/60 px-2 py-1 text-center font-mono text-[9px] font-bold text-white shadow-xs">
											Tier 1: Text Anchor (0%)
										</div>
									</div>
								</div>
							</div>

							<div class="space-y-1.5">
								<div class="flex items-center justify-between text-[11px]">
									<span class="font-semibold opacity-75">Tier 2: Inpaint Mask Margin</span>
									<span class="font-mono opacity-60">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
								</div>
								<div class="grid grid-cols-5 gap-1.5">
									{#each INPAINT_EXPANSION_PRESETS as preset}
										{@const isSelected = Math.abs(($settings.inpaintExpansionPct ?? 0.03) - preset.value) < 0.005}
										<button
											type="button"
											on:click={() => setInpaintExpansion(preset.value)}
											class={`rounded-lg border py-1 px-1 text-center transition-all ${
												isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
													: 'border-black/10 hover:border-black/20 dark:border-white/10 opacity-75'
											}`}
											use:ripple
										>
											<span class="text-xs">{preset.label}</span>
										</button>
									{/each}
								</div>
							</div>

							<div class="space-y-1.5">
								<div class="flex items-center justify-between text-[11px]">
									<span class="font-semibold opacity-75">Tier 3: Typeset Box Margin</span>
									<span class="font-mono opacity-60">+{Math.round(($settings.typesetExpansionPct ?? 0.03) * 100)}%</span>
								</div>
								<div class="grid grid-cols-5 gap-1.5">
									{#each TYPESET_EXPANSION_PRESETS as preset}
										{@const isSelected = Math.abs(($settings.typesetExpansionPct ?? 0.03) - preset.value) < 0.005}
										<button
											type="button"
											on:click={() => setTypesetExpansion(preset.value)}
											class={`rounded-lg border py-1 px-1 text-center transition-all ${
												isSelected
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
													: 'border-black/10 hover:border-black/20 dark:border-white/10 opacity-75'
											}`}
											use:ripple
										>
											<span class="text-xs">{preset.label}</span>
										</button>
									{/each}
								</div>
							</div>

							<!-- NOTICE: RE-TRANSLATION REQUIRED FOR NEW EXPANSION MARGINS -->
							<div class="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-relaxed text-amber-800 dark:text-amber-300">
								<Info size={14} class="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
								<span>
									<strong>Note:</strong> Changing region geometry expansion percentages applies to future chapter translations. To apply new boundary margins to previously translated chapters, trigger a full re-translation.
								</span>
							</div>
						</div>
					</div>

				<!-- SECTION 4: AI TRANSLATION PROVIDERS -->
				{:else if activeCategory === 'providers'}
					<div class="space-y-5">
						<div>
							<h2 class="text-base font-bold">AI Translation Provider</h2>
							<p class="text-xs opacity-60 mt-0.5">Configure cloud and local LLM localization engines, custom base URLs, API keys, and model parameters</p>
						</div>

						<!-- CATEGORY FILTER PILLS -->
						<div class="flex flex-wrap items-center gap-1.5 border-b border-black/10 pb-2.5 dark:border-white/10">
							<button
								type="button"
								on:click={() => (providerCategoryFilter = 'all')}
								class={cn(
									'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
									providerCategoryFilter === 'all'
										? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
										: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70'
								)}
								use:ripple
							>
								All Providers ({providers.length})
							</button>
							<button
								type="button"
								on:click={() => (providerCategoryFilter = 'cloud')}
								class={cn(
									'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
									providerCategoryFilter === 'cloud'
										? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
										: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70'
								)}
								use:ripple
							>
								<Zap size={11} />
								<span>Cloud Fast</span>
							</button>
							<button
								type="button"
								on:click={() => (providerCategoryFilter = 'local')}
								class={cn(
									'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
									providerCategoryFilter === 'local'
										? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-neutral-950'
										: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70'
								)}
								use:ripple
							>
								<Server size={11} />
								<span>Local & Offline</span>
							</button>
							<button
								type="button"
								on:click={() => (providerCategoryFilter = 'custom')}
								class={cn(
									'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
									providerCategoryFilter === 'custom'
										? 'bg-[#b23a2e] text-white shadow-xs dark:bg-[#e08a63] dark:text-neutral-950'
										: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 opacity-70'
								)}
								use:ripple
							>
								<SlidersHorizontal size={11} />
								<span>Custom Endpoint</span>
							</button>
						</div>

						<!-- PROVIDER CARDS GRID -->
						<div
							id="setting-providers-hub"
							class={cn(
								'grid grid-cols-1 sm:grid-cols-2 gap-2.5 transition-all duration-300',
								highlightedSettingId === 'providers-hub' &&
									'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1'
							)}
						>
							{#each providers.filter((p) => providerCategoryFilter === 'all' || getProviderCategory(p.id) === providerCategoryFilter) as prov}
								{@const isSelected = selectedProviderId === prov.id}
								{@const isLoc = isLocal(prov.id)}
								<button
									type="button"
									on:click={() => { selectedProviderId = prov.id; testResult = null; }}
									class={cn(
										'flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer',
										isSelected
											? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] ring-2 ring-[#b23a2e]/30 shadow-xs dark:border-[#e08a63] dark:bg-[#e08a63]/[0.1]'
											: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
									)}
									use:ripple
								>
									<div>
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2 font-bold text-xs min-w-0">
												<ProviderLogo providerId={prov.id} size={15} />
												<span class="truncate">{prov.name}</span>
											</div>
											<div class="flex items-center gap-1.5 shrink-0">
												{#if prov.isDefault}
													<span class="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
														ACTIVE
													</span>
												{/if}
												{#if isSelected}<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />{/if}
											</div>
										</div>

										<div class="mt-2 flex items-center gap-1.5 text-[10px]">
											{#if isLoc}
												<span class="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 font-bold text-teal-700 dark:text-teal-300">
													<Server size={10} /> Local Daemon
												</span>
											{:else if prov.hasKey}
												<span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
													<Check size={10} class="stroke-[3]" /> Key Saved ({prov.maskedKey})
												</span>
											{:else}
												<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
													<Key size={10} /> Key Required
												</span>
											{/if}
										</div>
									</div>
									<div class="mt-2 text-[10.5px] font-mono opacity-60 truncate">Active: {prov.activeModel || 'None selected'}</div>
								</button>
							{/each}
						</div>

						<!-- ACTIVE PROVIDER CONFIGURATION PANEL -->
						{#if selectedProviderId}
							{@const currentP = providers.find((p) => p.id === selectedProviderId)}
							{#if currentP}
								{@const currentIsLocal = isLocal(currentP.id)}
								{@const filteredModels = getFilteredModels(currentP.availableModels, modelSearch)}
								<div class="rounded-2xl border border-black/10 bg-black/[0.02] p-3.5 sm:p-5 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
									<!-- PANEL HEADER -->
									<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-black/10 pb-3 dark:border-white/10">
										<div class="flex items-center gap-2.5 min-w-0">
											<ProviderLogo providerId={currentP.id} size={18} />
											<div class="min-w-0">
												<h3 class="text-sm font-bold truncate">{currentP.name}</h3>
												<p class="text-[11px] opacity-60 font-mono truncate">{currentP.id}</p>
											</div>
										</div>
										{#if currentP.isDefault}
											<div class="inline-flex items-center self-start sm:self-auto gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs whitespace-nowrap">
												<Check size={12} class="stroke-[3] text-emerald-600 dark:text-emerald-400 shrink-0" />
												<span>Primary Active Engine</span>
											</div>
										{:else}
											<div class="inline-flex items-center self-start sm:self-auto gap-1.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-2.5 py-0.5 text-[10.5px] font-medium opacity-60 whitespace-nowrap">
												<span>Standby Engine</span>
											</div>
										{/if}
									</div>

									<!-- ENDPOINT BASE URL VIEWER & EDITOR -->
									<div
										id="setting-custom-endpoint"
										class={cn(
											'space-y-1.5 transition-all duration-300',
											highlightedSettingId === 'custom-endpoint' &&
												'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2'
										)}
									>
										<div class="flex items-center justify-between gap-2">
											<label for={`prov-url-${currentP.id}`} class="text-[11px] font-semibold opacity-80 flex items-center gap-1.5 min-w-0">
												<Globe size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
												<span class="truncate">Endpoint Base URL</span>
											</label>
											{#if baseUrlDraft[currentP.id] && DEFAULT_PROVIDER_BASE_URLS[currentP.id] && baseUrlDraft[currentP.id] !== DEFAULT_PROVIDER_BASE_URLS[currentP.id]}
												<button
													type="button"
													on:click={() => { baseUrlDraft[currentP.id] = DEFAULT_PROVIDER_BASE_URLS[currentP.id]; }}
													class="inline-flex items-center gap-1 text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer shrink-0"
													use:ripple
												>
													<RotateCcw size={10} />
													<span>Reset Default</span>
												</button>
											{/if}
										</div>
										<div class="relative flex items-center">
											<input
												id={`prov-url-${currentP.id}`}
												type="text"
												bind:value={baseUrlDraft[selectedProviderId]}
												placeholder={DEFAULT_PROVIDER_BASE_URLS[currentP.id] || 'https://api.fireworks.ai/inference/v1'}
												class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-xs font-mono outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
											/>
										</div>
										<p class="text-[10px] opacity-60">
											OpenAI-compatible inference endpoint (e.g. Fireworks AI, OpenRouter, vLLM, or custom proxy).
										</p>
									</div>

									<!-- API KEY FIELD (VAULT) -->
									{#if !currentIsLocal}
										<div
											id="setting-api-key"
											class={cn(
											'space-y-1.5 transition-all duration-300',
											highlightedSettingId === 'api-key' &&
												'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2'
										)}
									>
										<div class="flex flex-wrap items-center justify-between gap-1">
											<label for={`prov-key-${currentP.id}`} class="text-[11px] font-semibold opacity-80 flex items-center gap-1.5">
												<Key size={12} class="text-[#b23a2e] dark:text-[#e08a63]" />
												<span>API Key Vault</span>
											</label>
											{#if currentP.hasKey}
												<div class="flex items-center gap-2 text-[10px]">
													<span class="text-emerald-600 dark:text-emerald-400 font-mono font-semibold truncate max-w-[140px] sm:max-w-none">Active: {currentP.maskedKey}</span>
													<button
														type="button"
														on:click={() => clearKey(currentP.id)}
														class="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer shrink-0"
														use:ripple
													>
														<Trash2 size={10} />
														<span>Clear</span>
													</button>
												</div>
											{/if}
										</div>
										<div class="relative flex items-center">
											{#if showApiKey[currentP.id]}
												<input
													id={`prov-key-${currentP.id}`}
													type="text"
													bind:value={apiKeyDraft[selectedProviderId]}
													placeholder={currentP.hasKey ? `Replace key (${currentP.maskedKey})...` : 'Enter API Key...'}
													class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 pr-10 text-xs font-mono outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
												/>
											{:else}
												<input
													id={`prov-key-${currentP.id}`}
													type="password"
													bind:value={apiKeyDraft[selectedProviderId]}
													placeholder={currentP.hasKey ? `Replace key (${currentP.maskedKey})...` : 'Enter API Key...'}
													class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 pr-10 text-xs font-mono outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
												/>
											{/if}
											<button
												type="button"
												on:click={() => (showApiKey[currentP.id] = !showApiKey[currentP.id])}
												class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
												use:ripple
											>
												{#if showApiKey[currentP.id]}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
											</button>
										</div>
									</div>
								{/if}

								<!-- MODEL PICKER, SCANNER & MANAGEMENT -->
								<div
									id="setting-model-scan"
									class={cn(
										'space-y-2.5 transition-all duration-300',
										highlightedSettingId === 'model-scan' &&
											'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2'
									)}
								>
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5 min-w-0">
											<Cpu size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
											<span class="text-[11px] font-semibold opacity-80 truncate">Available Models ({currentP.availableModels.length})</span>
										</div>
										<button
											type="button"
											on:click={() => scanModels(currentP.id)}
											disabled={scanningModels}
											class="inline-flex items-center gap-1 text-[11px] font-bold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer disabled:opacity-50 shrink-0"
											use:ripple
										>
											<RefreshCw size={11} class={scanningModels ? 'animate-spin' : ''} />
											<span>{scanningModels ? 'Scanning Endpoint...' : 'Scan Models'}</span>
										</button>
									</div>

									<!-- SEARCH & ADD CUSTOM MODEL ROW -->
									<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
										{#if currentP.availableModels.length >= 4}
											<div class="relative flex-1 w-full">
												<Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40" />
												<input
													type="text"
													bind:value={modelSearch}
													placeholder="Filter models..."
													class="h-[32px] w-full rounded-lg border border-black/10 bg-transparent pl-7 pr-3 text-[11px] outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] dark:border-white/[0.08]"
												/>
											</div>
										{/if}
										<div class="flex items-center gap-1.5 w-full flex-1">
											<input
												type="text"
												bind:value={customModelInput}
												placeholder="Add model ID (e.g. qwen-2.5-72b)..."
												class="h-[32px] min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 text-[11px] font-mono outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] dark:border-white/[0.08]"
												on:keydown={(e) => { if (e.key === 'Enter') addCustomModel(currentP.id); }}
											/>
											<button
												type="button"
												on:click={() => addCustomModel(currentP.id)}
												disabled={!customModelInput.trim()}
												class="inline-flex items-center justify-center gap-1 h-[32px] rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 text-[11px] font-bold cursor-pointer disabled:opacity-40 shrink-0"
												use:ripple
											>
												<Plus size={12} />
												<span>Add</span>
											</button>
										</div>
									</div>

									<!-- MODEL TILES GRID -->
									<div class="max-h-[240px] overflow-y-auto space-y-1.5 pr-1">
										{#if filteredModels.length > 0}
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
												{#each filteredModels as modelId}
													{@const isModelSelected = (activeModelDraft[currentP.id] || currentP.activeModel) === modelId}
													<button
														type="button"
														on:click={() => (activeModelDraft[currentP.id] = modelId)}
														class={cn(
															'group relative flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer',
															isModelSelected
																? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] ring-1 ring-[#b23a2e]/30 dark:border-[#e08a63] dark:bg-[#e08a63]/[0.08]'
																: 'border-black/10 hover:border-black/20 dark:border-white/10'
														)}
														use:ripple
													>
														<div class="flex items-start justify-between w-full gap-2">
															<div class="min-w-0 pr-6">
																<span class="text-xs font-bold truncate block">{formatModelLabel(modelId)}</span>
																<div class="mt-0.5 text-[9px] font-mono opacity-50 truncate break-all">{modelId}</div>
															</div>
															{#if isModelSelected}
																<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
															{/if}
														</div>

														<!-- DELETE BUTTON -->
														<button
															type="button"
															on:click|stopPropagation={() => removeModel(currentP.id, modelId)}
															title={`Remove model "${modelId}"`}
															class="absolute right-2 top-2 p-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
															use:ripple
														>
															<Trash2 size={12} />
														</button>
													</button>
												{/each}
											</div>
										{:else}
											<div class="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-4 text-center">
												<p class="text-xs opacity-60">No models in list.</p>
												<p class="text-[11px] opacity-40 mt-1">Click <strong>Scan Models</strong> to query the endpoint or enter a model ID above.</p>
											</div>
										{/if}
									</div>
								</div>

								<!-- TEST RESULTS BANNER -->
								{#if testResult}
									<div
										id="setting-test-connection"
										class={cn(
											'flex items-start gap-2.5 rounded-xl p-3 text-xs leading-relaxed',
											testResult.ok
												? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
												: 'bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300'
										)}
									>
										{#if testResult.ok}
											<CheckCircle2 size={16} class="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
										{:else}
											<AlertCircle size={16} class="shrink-0 text-red-500 mt-0.5" />
										{/if}
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<strong>{testResult.ok ? 'Connection Verified' : 'Connection Error'}</strong>
												{#if testResult.ok && testResult.latencyMs}
													<span class="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-mono font-bold">
														{testResult.latencyMs}ms
													</span>
												{/if}
											</div>
											<p class="mt-0.5 text-[11px] opacity-90 break-words">{testResult.message}</p>
										</div>
									</div>
								{/if}

								<!-- ACTION BUTTONS -->
								<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-black/10 dark:border-white/10">
									<!-- TEST CONNECTION BUTTON -->
									<button
										id="setting-test-connection"
										type="button"
										on:click={() => testConnection(currentP.id)}
										disabled={testingProvider}
										class={`inline-flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-3.5 py-2 text-xs font-semibold hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer w-full sm:w-auto transition-all duration-300 ${highlightedSettingId === 'test-connection' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
										use:ripple
									>
										<RefreshCw size={13} class={testingProvider ? 'animate-spin' : ''} />
										<span>{testingProvider ? 'Testing Endpoint...' : 'Test Connection'}</span>
									</button>

									<!-- SAVE & ACTIVATION BUTTONS -->
									<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
										<!-- SAVE PROVIDER BUTTON -->
										<button
											type="button"
											on:click={() => saveProvider(currentP.id, false)}
											disabled={savingProvider || !hasProviderChanges}
											class={cn(
												'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer w-full sm:w-auto transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
												currentP.isDefault
													? 'bg-[#b23a2e] hover:bg-[#962f25] text-white font-bold shadow-xs'
													: 'border border-black/15 bg-white hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10'
											)}
											title={hasProviderChanges ? 'Save endpoint and API credentials' : 'No changes to save'}
											use:ripple={{ disabled: !hasProviderChanges || savingProvider }}
										>
											<Save size={13} />
											<span>Save Provider</span>
										</button>

										{#if !currentP.isDefault}
											<!-- SAVE & SET AS ACTIVE ENGINE -->
											<button
												type="button"
												on:click={() => saveProvider(currentP.id, true)}
												disabled={savingProvider}
												class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b23a2e] hover:bg-[#962f25] text-white px-4 py-2 text-xs font-bold cursor-pointer w-full sm:w-auto shadow-xs"
												title="Save configuration and route all chapter translations through this engine"
												use:ripple
											>
												<Check size={13} />
												<span>Save & Set Active</span>
											</button>
										{/if}
									</div>
								</div>
								</div>
							{/if}
						{/if}
					</div>

				<!-- SECTION 5: HARDWARE & COMPUTE -->
				{:else if activeCategory === 'compute'}
					<div class="space-y-5">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
							<div>
								<h2 class="text-base font-bold">Hardware & Compute Accelerator</h2>
								<p class="text-xs opacity-60 mt-0.5">ONNX Runtime execution engines, GPU allocation, and batch processing concurrency</p>
							</div>

							<!-- ACCELERATOR STATUS BADGE -->
							<div class="self-start sm:self-auto shrink-0">
								{#if switchingDevice || hardwareInfo?.reloading}
									<div class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 shadow-2xs backdrop-blur-xs">
										<Loader2 size={12} class="animate-spin text-amber-500 shrink-0" />
										<span>Reloading models…</span>
									</div>
								{:else if mlOffline}
									<div class="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300 shadow-2xs backdrop-blur-xs">
										<ZapOff size={12} class="text-red-500 shrink-0" />
										<span>ML Core Offline</span>
									</div>
								{:else if hardwareInfo}
									<div
										class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 shadow-2xs backdrop-blur-xs"
										title={hardwareInfo.detected_gpus?.[0]?.name ? `Detected: ${hardwareInfo.detected_gpus[0].name}` : `Active Engine: ${hardwareInfo.device_label}`}
									>
										<Cpu size={12} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
										<span class="font-mono text-[10px] uppercase font-bold tracking-wider opacity-60">Active:</span>
										<span class="font-medium">{formatDeviceLabel(hardwareInfo.device_label)}</span>
									</div>
								{:else}
									<div class="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[11px] font-medium opacity-60 dark:border-white/10 dark:bg-white/[0.03]">
										<Activity size={12} class="text-neutral-400 shrink-0" />
										<span>Detecting hardware…</span>
									</div>
								{/if}
							</div>
						</div>

						<!-- DEVICE CARDS -->
						<div
							id="setting-compute-device"
							class={`space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'compute-device' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
						>
							<!-- AUTO DETECT FEATURED CARD -->
							{#if EXECUTION_DEVICES[0]}
								{@const autoDev = EXECUTION_DEVICES[0]}
								<button
									type="button"
									disabled={!!switchingDevice || !!hardwareInfo?.reloading || mlOffline || !isDeviceAvailable(autoDev.id)}
									on:click={() => setExecutionDevice(autoDev.id)}
									class={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
										mlOffline || !isDeviceAvailable(autoDev.id)
											? 'opacity-40 border-black/5 bg-black/[0.01] dark:border-white/5 cursor-not-allowed'
											: switchingDevice || hardwareInfo?.reloading
												? $settings.executionDevice === autoDev.id
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-wait opacity-85'
													: 'border-black/10 opacity-50 cursor-not-allowed dark:border-white/10'
												: $settings.executionDevice === autoDev.id
													? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
													: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
									}`}
									use:ripple
								>
									<div>
										<div class="flex items-center gap-2 font-bold text-xs">
											{#if switchingDevice === autoDev.id}
												<Loader2 size={13} class="animate-spin text-[#b23a2e]" />
											{:else}
												<Cpu size={13} class={isDeviceAvailable(autoDev.id) ? 'opacity-80' : 'opacity-40'} />
											{/if}
											<span>{autoDev.label}</span>
											<span class="rounded-full bg-[#b23a2e]/10 dark:bg-[#e08a63]/15 px-2 py-0.5 text-[9.5px] font-semibold text-[#b23a2e] dark:text-[#e08a63] uppercase tracking-wider">Recommended</span>
										</div>
										<p class="mt-1 text-[10.5px] opacity-70 leading-relaxed">{autoDev.blurb}</p>
									</div>
									<div class="shrink-0 ml-3">
										{#if $settings.executionDevice === autoDev.id && switchingDevice !== autoDev.id}
											<Check size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
										{/if}
									</div>
								</button>
							{/if}

							<!-- MANUAL EXPLICIT BACKENDS (2x2 GRID) -->
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
								{#each EXECUTION_DEVICES.slice(1) as dev (dev.id)}
									<button
										type="button"
										id={dev.id === 'dml' ? 'setting-igpu-protect' : undefined}
										disabled={!!switchingDevice || !!hardwareInfo?.reloading || mlOffline || !isDeviceAvailable(dev.id)}
										on:click={() => setExecutionDevice(dev.id)}
										class={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
											highlightedSettingId === 'igpu-protect' && dev.id === 'dml'
												? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]'
												: ''
										} ${
											mlOffline || !isDeviceAvailable(dev.id)
												? 'opacity-40 border-black/5 bg-black/[0.01] dark:border-white/5 cursor-not-allowed'
												: switchingDevice || hardwareInfo?.reloading
													? $settings.executionDevice === dev.id
														? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-wait opacity-85'
														: 'border-black/10 opacity-50 cursor-not-allowed dark:border-white/10'
													: $settings.executionDevice === dev.id
														? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
														: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
										}`}
										use:ripple
									>
										<div>
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-1.5 font-bold text-xs">
													{#if switchingDevice === dev.id}
														<Loader2 size={13} class="animate-spin text-[#b23a2e]" />
													{:else}
														<Cpu size={13} class={isDeviceAvailable(dev.id) ? 'opacity-80' : 'opacity-40'} />
													{/if}
													<span>{dev.label}</span>
												</div>
												{#if $settings.executionDevice === dev.id && switchingDevice !== dev.id}
													<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
												{/if}
											</div>
											<p class="mt-1 text-[10px] opacity-70 leading-relaxed">{dev.blurb}</p>
										</div>
										{#if !isDeviceAvailable(dev.id) && getDeviceAvailabilityReason(dev.id)}
											<div class="mt-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
												{getDeviceAvailabilityReason(dev.id)}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						</div>

						<!-- GPU VRAM MEMORY ALLOCATOR -->
						{#if hardwareInfo?.has_cuda || $settings.executionDevice === 'cuda' || hardwareInfo?.detected_gpus?.some((g) => g.is_dedicated)}
							<div
								id="setting-vram-limit"
								class={`space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'vram-limit' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
							>
								<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
									<div class="flex items-center gap-1.5 font-bold text-xs">
										<Sliders size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
										<span>GPU VRAM Allocation Limit</span>
									</div>
									<div class="font-mono text-[10.5px] opacity-70">
										Active Limit: <span class="font-bold text-[#b23a2e] dark:text-[#e08a63]">{hardwareInfo?.cuda_vram_limit_mb ? `${(hardwareInfo.cuda_vram_limit_mb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : 'Auto'}</span>
										{#if hardwareInfo?.configured_cuda_vram_limit_mb}
											<span class="opacity-60">(Manual override)</span>
										{:else}
											<span class="opacity-60">(Hardware adaptive)</span>
										{/if}
									</div>
								</div>
								<p class="text-[10.5px] opacity-60 leading-relaxed">
									Sets the maximum memory capacity allocated per ONNX CUDA session to prevent out-of-memory errors on large transformer layers.
								</p>
								<div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-1">
									{#each CUDA_VRAM_LIMIT_PRESETS as preset}
										{@const isSelected = $settings.cudaVramLimitMb === preset.value || ($settings.cudaVramLimitMb === null && preset.value === null)}
										{@const maxGpuVramMb = hardwareInfo?.detected_gpus?.[0]?.vram_mb ?? 0}
										{@const exceedsPhysicalVram = preset.value !== null && maxGpuVramMb > 0 && preset.value > maxGpuVramMb}
										{@const isBusy = settingVramLimit || !!switchingDevice || !!hardwareInfo?.reloading || mlOffline || exceedsPhysicalVram}
										<button
											type="button"
											disabled={isBusy}
											on:click={() => setCudaVramLimit(preset.value)}
											class={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-center transition-all ${
												exceedsPhysicalVram
													? 'border-black/5 bg-black/[0.01] dark:border-white/5 opacity-30 cursor-not-allowed'
													: isBusy
														? isSelected
															? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30 font-bold opacity-85 cursor-wait'
															: 'border-black/10 opacity-40 cursor-not-allowed dark:border-white/10'
														: isSelected
															? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30 font-bold cursor-pointer'
															: 'border-black/10 hover:border-black/20 dark:border-white/10 opacity-75 cursor-pointer'
											}`}
											title={exceedsPhysicalVram ? `Exceeds detected GPU VRAM (${(maxGpuVramMb / 1024).toFixed(1)} GB)` : ''}
											use:ripple
										>
											<span class="text-xs font-mono">{preset.label}</span>
											<span class="text-[9px] opacity-60 mt-0.5">{exceedsPhysicalVram ? 'Exceeds GPU' : preset.sub}</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}

						<!-- LIVE SYSTEM TELEMETRY -->
						<div
							id="setting-telemetry-monitor"
							class={`space-y-3 rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'telemetry-monitor' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1.5 font-bold text-xs">
									<Activity size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
									<span>Live System Telemetry</span>
								</div>
								<div class="flex items-center gap-2 text-[10px] font-mono opacity-60">
									<span>Auto-refresh: 2.0s</span>
								</div>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
								<!-- GPU VRAM GAUGE -->
								<div class="rounded-lg border border-black/5 bg-white/40 p-2.5 dark:border-white/5 dark:bg-black/20 space-y-1.5">
									<div class="flex items-center justify-between text-[11px]">
										<span class="font-semibold opacity-80 flex items-center gap-1">
											<Cpu size={12} class="opacity-60" />
											<span>GPU VRAM</span>
										</span>
										<span class="font-mono text-[10px] font-bold">
											{#if telemetry?.gpu}
												{telemetry.gpu.vram_used_mb.toFixed(0)} MB / {telemetry.gpu.vram_total_mb.toFixed(0)} MB
												{#if telemetry.gpu.vram_total_mb > 0}
													<span class="opacity-60">({((telemetry.gpu.vram_used_mb / telemetry.gpu.vram_total_mb) * 100).toFixed(0)}%)</span>
												{/if}
											{:else}
												<span class="opacity-50 font-normal">No dedicated GPU</span>
											{/if}
										</span>
									</div>
									<div class="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
										<!-- DYNAMIC RUNTIME GAUGE WIDTH -->
										<div
											class={`h-full rounded-full transition-all duration-500 ${gpuVramPct > 85 ? 'bg-amber-500' : 'bg-[#b23a2e] dark:bg-[#e08a63]'}`}
											style={`width: ${gpuVramPct}%;`}
										></div>
									</div>
									<div class="flex items-center justify-between text-[9.5px] font-mono opacity-50 truncate">
										<span>{telemetry?.gpu?.name || 'CPU Multi-threaded'}</span>
										{#if telemetry?.gpu?.utilization_pct !== null && telemetry?.gpu?.utilization_pct !== undefined}
											<span>Load: {telemetry.gpu.utilization_pct.toFixed(0)}%</span>
										{/if}
									</div>
								</div>

								<!-- HOST RAM GAUGE -->
								<div class="rounded-lg border border-black/5 bg-white/40 p-2.5 dark:border-white/5 dark:bg-black/20 space-y-1.5">
									<div class="flex items-center justify-between text-[11px]">
										<span class="font-semibold opacity-80 flex items-center gap-1">
											<Server size={12} class="opacity-60" />
											<span>Host System RAM</span>
										</span>
										<span class="font-mono text-[10px] font-bold">
											{#if telemetry?.host_memory && telemetry.host_memory.total_mb > 0}
												{telemetry.host_memory.used_mb.toFixed(0)} MB / {telemetry.host_memory.total_mb.toFixed(0)} MB
												<span class="opacity-60">({((telemetry.host_memory.used_mb / telemetry.host_memory.total_mb) * 100).toFixed(0)}%)</span>
											{:else}
												<span class="opacity-50 font-normal">Reading…</span>
											{/if}
										</span>
									</div>
									<div class="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
										<!-- DYNAMIC RUNTIME GAUGE WIDTH -->
										<div
											class={`h-full rounded-full transition-all duration-500 ${hostRamPct > 90 ? 'bg-red-500' : hostRamPct > 75 ? 'bg-amber-500' : 'bg-[#4f7a64] dark:bg-[#83b39a]'}`}
											style={`width: ${hostRamPct}%;`}
										></div>
									</div>
									<div class="flex items-center justify-between text-[9.5px] font-mono opacity-50">
										<span>CPU Threads: {telemetry?.cpu?.cores || 1}</span>
										<span>Active Process</span>
									</div>
								</div>
							</div>
						</div>

						<!-- PRE-RESLICING & PARALLEL WORKERS -->
						<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
							<div
								id="setting-auto-reslice"
								class={`flex items-start justify-between gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'auto-reslice' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
							>
								<div>
									<div class="text-xs font-bold flex items-center gap-1.5">
										<Scissors size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
										<span>Auto-Reslice Before Batch Translation</span>
									</div>
									<p class="text-[11px] opacity-60 mt-0.5">Recombine and cut vertical webtoon chapters along whitespace gutters before OCR to protect speech bubbles.</p>
								</div>
								<Switch
									checked={$settings.resliceBeforeBatch}
									on:click={toggleResliceBeforeBatch}
									ariaLabel="Auto-Reslice Before Batch Translation"
								/>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div
									id="setting-parallel-workers"
									class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'parallel-workers' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
								>
									<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Page Workers</div>
									<div class="grid grid-cols-4 gap-1.5">
										{#each [1, 2, 3, 4] as count}
											<button
												type="button"
												on:click={() => setParallelProcesses(count)}
												class={`rounded-lg border py-2 text-center text-xs font-bold transition-all ${
													($settings.parallelProcesses || 2) === count
														? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30'
														: 'border-black/10 hover:border-black/20 dark:border-white/10'
												}`}
												use:ripple
											>
												{count}
											</button>
										{/each}
									</div>
								</div>

								<div
									id="setting-parallel-chapters"
									class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'parallel-chapters' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
								>
									<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Batch Chapters</div>
									<div class="grid grid-cols-4 gap-1.5">
										{#each [1, 2, 3, 4] as count}
											<button
												type="button"
												on:click={() => setParallelChapters(count)}
												class={`rounded-lg border py-2 text-center text-xs font-bold transition-all ${
													($settings.parallelChapters || 2) === count
														? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30'
														: 'border-black/10 hover:border-black/20 dark:border-white/10'
												}`}
												use:ripple
											>
												{count}
											</button>
										{/each}
									</div>
								</div>
							</div>

							<!-- NOTICE: CONCURRENCY HARDWARE STRAIN WARNING -->
							<div class="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-relaxed text-amber-800 dark:text-amber-300">
								<AlertTriangle size={14} class="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
								<span>
									<strong>Warning:</strong> Setting parallel page workers or batch chapters too high may put heavy strain on your processor and system memory, potentially causing crashes or out-of-memory errors. Only configure concurrency levels that your CPU, GPU, and RAM can handle efficiently.
								</span>
							</div>
						</div>
					</div>

				<!-- SECTION 6: ABOUT & SYSTEM DIAGNOSTICS -->
				{:else if activeCategory === 'about'}
					<div class="space-y-5">
						<div>
							<h2 class="text-base font-bold">About & System Diagnostics</h2>
							<p class="text-xs opacity-60 mt-0.5">XianScan native runtime environment, build fingerprint, and service states</p>
						</div>

						<div class="rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3">
							<div
								id="setting-version-info"
								class={`flex items-center justify-between text-xs py-1 border-b border-black/5 dark:border-white/5 transition-all duration-300 ${highlightedSettingId === 'version-info' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-lg p-1.5' : ''}`}
							>
								<span class="opacity-60">Native Core Version</span>
								{#if hardwareInfo?.version || $mlStatus.version}
									<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">v{hardwareInfo?.version || $mlStatus.version}</span>
								{:else if hardwareLoading || $mlStatus.loading}
									<span class="inline-block h-3.5 w-12 animate-pulse rounded bg-black/10 dark:bg-white/10"></span>
								{:else}
									<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">v--</span>
								{/if}
							</div>
							{#if hardwareInfo?.web_build_hash || $mlStatus.webBuildHash}
								<div class="flex items-center justify-between text-xs py-1 border-b border-black/5 dark:border-white/5">
									<span class="opacity-60">Web Build Hash</span>
									<span class="font-mono">{hardwareInfo?.web_build_hash || $mlStatus.webBuildHash}</span>
								</div>
							{/if}
							<div
								id="setting-sidecar-health"
								class={`flex items-center justify-between text-xs py-1 transition-all duration-300 ${highlightedSettingId === 'sidecar-health' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-lg p-1.5' : ''}`}
							>
								<span class="opacity-60">ML Sidecar Health</span>
								<span class={`font-bold ${$mlStatus.online ? 'text-emerald-600' : 'text-red-500'}`}>
									{$mlStatus.online ? 'Healthy & Connected' : 'Offline / Unreachable'}
								</span>
							</div>
						</div>

						<!-- ONBOARDING GUIDE REPLAY CARD -->
						<div
							id="setting-welcome-tour"
							class={`flex items-center justify-between rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'welcome-tour' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-4' : ''}`}
						>
							<div class="space-y-0.5">
								<div class="flex items-center gap-1.5 text-xs font-bold">
									<Sparkles size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
									<span>Welcome Tour & Feature Guide</span>
								</div>
								<p class="text-[11px] opacity-60">Replay the introductory walkthrough covering the translation pipeline, extension, and setup.</p>
							</div>
							<Button
								variant="secondary"
								size="sm"
								on:click={() => {
									open = false;
									dispatch('openTour');
								}}
							>
								<span>Replay Tour</span>
							</Button>
						</div>

						<!-- DISCORD COMMUNITY CARD -->
						<div class="flex items-center justify-between rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="space-y-0.5">
								<div class="flex items-center gap-1.5 text-xs font-bold text-[#5865F2]">
									<MessageSquare size={14} />
									<span>Discord Community</span>
								</div>
								<p class="text-[11px] opacity-60">Join our community server to ask questions, share feedback, report bugs, or hang out.</p>
							</div>
							<a
								href="https://discord.gg/J5mjJX6c"
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white px-3 py-1.5 text-xs font-bold transition shrink-0"
								use:ripple
							>
								<span>Join Discord</span>
								<ExternalLink size={11} class="opacity-60" />
							</a>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</Modal>
