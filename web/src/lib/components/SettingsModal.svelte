<script context="module" lang="ts">
	// -- TYPES -- //
	export type SettingsCategory =
		| 'appearance'
		| 'typesetting'
		| 'inpainting'
		| 'providers'
		| 'compute'
		| 'storage'
		| 'network'
		| 'about';
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { tick, createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED TYPES
	import type { HardwareInfo } from '$lib/components/settings/settings-helpers';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { refreshFontAvailability } from '$lib/stores/settings';
	import { mlStatus } from '$lib/stores/ml-status';
	import { resetSettingsSession, settingsHardwareInfo } from '$lib/stores/settings-ui';
	// IMPORTED ICONS
	import Cpu from 'lucide-svelte/icons/cpu';
	import Eraser from 'lucide-svelte/icons/eraser';
	import Zap from 'lucide-svelte/icons/zap';
	import Activity from 'lucide-svelte/icons/activity';
	import Type from 'lucide-svelte/icons/type';
	import AlignCenter from 'lucide-svelte/icons/align-center';
	import Eye from 'lucide-svelte/icons/eye';
	import Palette from 'lucide-svelte/icons/palette';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import Sliders from 'lucide-svelte/icons/sliders';
	import Search from 'lucide-svelte/icons/search';
	import Info from 'lucide-svelte/icons/info';
	import Hash from 'lucide-svelte/icons/hash';
	import Brain from 'lucide-svelte/icons/brain';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import X from 'lucide-svelte/icons/x';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import HardDrive from 'lucide-svelte/icons/hard-drive';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import NetworkAccessSection from '$lib/components/settings/NetworkAccessSection.svelte';
	// ONE COMPONENT PER TAB (FEAT-009 PHASE 6); THIS FILE KEEPS THE FRAME, THE NAV AND THE SEARCH INDEX
	import AppearanceTab from '$lib/components/settings/AppearanceTab.svelte';
	import TypesettingTab from '$lib/components/settings/TypesettingTab.svelte';
	import InpaintingTab from '$lib/components/settings/InpaintingTab.svelte';
	import ProvidersTab from '$lib/components/settings/ProvidersTab.svelte';
	import ComputeTab from '$lib/components/settings/ComputeTab.svelte';
	import StorageTab from '$lib/components/settings/StorageTab.svelte';
	import AboutTab from '$lib/components/settings/AboutTab.svelte';

	// PROPS COMPATIBILITY: ACCEPTS BOTH LEGACY (ai | compute | general) AND NEW CATEGORIES
	export let open = false;
	export let initialTab: 'ai' | 'compute' | 'general' | SettingsCategory = 'appearance';

	const dispatch = createEventDispatcher<{
		openTour: void;
		close: void;
	}>();

	// -- MAP LEGACY TABS TO CATEGORIES -- //
	function normalizeCategory(tab: string): SettingsCategory {
		if (tab === 'ai') return 'providers';
		if (tab === 'general') return 'appearance';
		if (tab === 'compute') return 'compute';
		if (tab === 'storage') return 'storage';
		if (['appearance', 'typesetting', 'inpainting', 'providers', 'compute', 'storage', 'network', 'about'].includes(tab)) {
			return tab as SettingsCategory;
		}
		return 'appearance';
	}

	// -- STATES -- //
	let activeCategory: SettingsCategory = normalizeCategory(initialTab);
	let mobileView: 'menu' | 'detail' = initialTab ? 'detail' : 'menu';
	let globalSearch = '';

	// SHARED BY THE COMPUTE TAB AND THE ABOUT TAB. IT LIVES IN A STORE BECAUSE A DEVICE SWITCH KEEPS POLLING (AND
	// PUBLISHING FRESHER STATUS) AFTER THE COMPUTE TAB UNMOUNTS
	let hardwareLoading = false;

	async function loadHardwareStatus() {
		hardwareLoading = true;
		try {
			const res = await fetch('/api/system/hardware');
			if (res.ok) {
				settingsHardwareInfo.set((await res.json()) as HardwareInfo);
			}
		} catch {
			// SILENT FALLBACK
		} finally {
			hardwareLoading = false;
		}
	}

	let lastOpen: boolean | undefined = undefined;
	$: if (open !== lastOpen) {
		lastOpen = open;
		if (open) {
			activeCategory = normalizeCategory(initialTab);
			mobileView = initialTab ? 'detail' : 'menu';
			globalSearch = '';
			resetSettingsSession();
			cancelPendingJump();
			loadHardwareStatus();
			void refreshFontAvailability();
			void mlStatus.checkHealth();
		}
	}

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
				{ id: 'typesetting', label: 'Typesetting & Lettering', icon: Type, keywords: ['font', 'cjk', 'script', 'bubble', 'dialogue', 'padding', 'stroke', 'outline', 'casing', 'angle', 'rotation', 'preview', 'rtl'] },
				{ id: 'inpainting', label: 'Inpainting & Cleaning', icon: Eraser, keywords: ['inpaint', 'patch', 'scaled', 'full', 'cleaning', 'white', 'shrinkwrap'] },
			],
		},
		{
			title: 'Engines & Compute',
			items: [
				{ id: 'providers', label: 'AI Translation Providers', icon: Zap, keywords: ['ai', 'provider', 'deepseek', 'gemini', 'groq', 'openrouter', 'openai', 'ollama', 'lmstudio', 'custom', 'model', 'api key', 'inference', 'sampling', 'temperature', 'top-p', 'tokens', 'reasoning', 'budget', 'penalty'] },
				{ id: 'compute', label: 'Hardware & Compute', icon: Cpu, keywords: ['hardware', 'gpu', 'cuda', 'directml', 'coreml', 'cpu', 'workers', 'parallel', 'reslice', 'performance', 'onnx'] },
			],
		},
		{
			title: 'System',
			items: [
				{ id: 'storage', label: 'Storage & Data', icon: HardDrive, keywords: ['storage', 'disk', 'cache', 'app data', 'purge', 'orphaned', 'size', 'clear', 'database', 'bytes'] },
				{ id: 'network', label: 'Network & Access', icon: ShieldCheck, keywords: ['lan', 'network', 'token', 'access', 'mihon', 'extension', 'pair', 'security', 'remote', 'unlock', 'restart'] },
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
		{ id: 'lang-pair', label: 'Default Localization Pair', category: 'appearance', categoryLabel: 'General & Appearance', categoryIcon: Palette, keywords: ['language', 'locale', 'source', 'target', 'chinese', 'english', 'japanese', 'korean', 'arabic', 'rtl', 'hindi', 'thai', 'russian'] },

		// TYPESETTING
		{ id: 'preview', label: 'Live Speech Bubble Preview', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['preview', 'bubble', 'dialogue', 'sample', 'live', 'manga', 'exact', 'render', 'rtl', 'arabic'] },
		{ id: 'typeset-font', label: 'Latin Dialogue Font', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['font', 'latin', 'english', 'wild words', 'montserrat', 'general sans', 'poppins', 'system fonts', 'import font', 'custom font', 'ttf', 'otf', 'woff2', 'variable'] },
		{ id: 'typeset-weight', label: 'Dialogue Font Weight (Regular & Bold)', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['weight', 'bold', 'regular', 'thickness', '400', '700', 'font weight', 'variants'] },
		{ id: 'typeset-casing', label: 'Dialogue Letterform Casing', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['casing', 'uppercase', 'lowercase', 'all-caps', 'capitalization'] },
		{ id: 'typeset-cjk', label: 'Script fonts (Chinese, Japanese, Korean, Hindi, Thai, Arabic, Cyrillic...)', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['cjk', 'chinese', 'japanese', 'korean', 'fallback', 'font', 'yahei', 'gothic', 'hangul', 'hindi', 'devanagari', 'thai', 'arabic', 'russian', 'cyrillic', 'script', 'tofu', 'boxes', 'coverage', 'rtl', 'tajawal', 'noto'] },
		{ id: 'typeset-padding', label: 'Bubble Inset Padding', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['padding', 'margin', 'inset', 'tight', 'balanced', 'spacious', 'airy', 'fit'] },
		{ id: 'typeset-outline', label: 'Text Stroke Outline', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['stroke', 'outline', 'border', 'thin', 'standard', 'heavy', 'thickness'] },
		{ id: 'typeset-angle', label: 'Bubble Tilt Angle Rotation', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Type, keywords: ['tilt', 'angle', 'rotation', 'rotate', 'diagonal'] },
		{ id: 'typeset-centering', label: 'Bubble Centering & Expansion', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: AlignCenter, keywords: ['centering', 'expansion', 'center', 'bubble', 'anchor', 'slack', 'carrier'] },
		{ id: 'live-pipeline-preview', label: 'Live Pipeline Step Previews', category: 'typesetting', categoryLabel: 'Typesetting & Lettering', categoryIcon: Eye, keywords: ['preview', 'live', 'ocr', 'inpaint', 'progressive', 'intermediate', 'step', 'stream'] },

		// INPAINTING
		{ id: 'inpaint-mode', label: 'Inpainting Strategy', category: 'inpainting', categoryLabel: 'Inpainting & Cleaning', categoryIcon: Eraser, keywords: ['inpaint', 'patch', 'scaled', 'full', 'erase', 'cleaning', 'lama', 'tiles', 'memory', 'bands', 'aspect'] },
		{ id: 'inpaint-margin', label: 'Inpaint Mask Margin', category: 'inpainting', categoryLabel: 'Inpainting & Cleaning', categoryIcon: Eraser, keywords: ['inpaint', 'margin', 'padding', 'expansion', 'boundary', 'mask', 'tight', 'ocr'] },
		{ id: 'inpaint-white', label: 'White Bubble Shrinkwrap Cleaning', category: 'inpainting', categoryLabel: 'Inpainting & Cleaning', categoryIcon: Eraser, keywords: ['white', 'shrinkwrap', 'bubble', 'clean', 'cavity', 'dust', 'inpaint', 'speech'] },

		// AI PROVIDERS
		{ id: 'ai-guide', label: 'AI Translation Getting Started Guide', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Info, keywords: ['getting started', 'guide', 'instructions', 'help', 'tutorial', 'setup', 'onboarding'] },
		{ id: 'providers-hub', label: 'AI Translation Provider Selection', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['provider', 'ai', 'cloud', 'local', 'custom', 'deepseek', 'gemini', 'groq', 'openrouter', 'openai', 'ollama', 'lmstudio'] },
		{ id: 'api-key', label: 'API Key Configuration & Vault', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['api key', 'key', 'token', 'auth', 'secret', 'mask'] },
		{ id: 'model-scan', label: 'Model Selection & Discovery Scanner', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['model', 'scan', 'discover', 'flash', 'pro', 'qwen', 'llama', 'gemini', 'deepseek'] },
		{ id: 'test-connection', label: 'Connection & Latency Tester', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['test', 'connection', 'ping', 'latency', 'verify'] },
		{ id: 'custom-endpoint', label: 'Custom Endpoint Base URL', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Zap, keywords: ['endpoint', 'url', 'base', 'custom', 'proxy'] },
		{ id: 'inference-sampling', label: 'Inference & Sampling Parameters', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: SlidersHorizontal, keywords: ['inference', 'sampling', 'parameters', 'tuning', 'generation', 'hyperparameters'] },
		{ id: 'max-tokens', label: 'Max Output Tokens Budget', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Hash, keywords: ['token', 'tokens', 'budget', 'max tokens', 'output', 'length', 'limit', 'custom tokens'] },
		{ id: 'reasoning-effort', label: 'Reasoning Effort & Thinking Budget', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: Brain, keywords: ['reasoning', 'effort', 'thinking', 'think', 'budget', 'r1', 'chain of thought', 'cot'] },
		{ id: 'dialogue-context', label: 'Sliding Dialogue Context Window', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: MessageSquare, keywords: ['context', 'dialogue', 'sliding', 'window', 'pages', 'valid pages', 'continuity', 'history'] },
		{ id: 'sampling-diversity', label: 'Sampling Diversity (Temperature & Penalties)', category: 'providers', categoryLabel: 'AI Translation Providers', categoryIcon: SlidersHorizontal, keywords: ['temperature', 'top-p', 'frequency penalty', 'presence penalty', 'diversity', 'creativity', 'sampling'] },

		// HARDWARE & COMPUTE
		{ id: 'compute-device', label: 'Hardware Compute Accelerator (ONNX)', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['hardware', 'accelerator', 'gpu', 'cuda', 'directml', 'coreml', 'cpu', 'nvidia', 'amd', 'intel'] },
		{ id: 'vram-limit', label: 'GPU VRAM Allocation Memory Limit', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Sliders, keywords: ['vram', 'gpu ram', 'memory', 'allocator', 'limit', 'gb', 'cuda memory', 'oom'] },
		{ id: 'telemetry-monitor', label: 'Live System & GPU Telemetry Monitor', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Activity, keywords: ['telemetry', 'monitor', 'live', 'vram', 'ram', 'cpu', 'load', 'queue', 'memory tracker'] },
		{ id: 'igpu-protect', label: 'Integrated GPU Protection', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['igpu', 'integrated', 'protection', 'driver', 'freeze', 'tdr'] },
		{ id: 'auto-reslice', label: 'Auto-Reslice Before Batch Translation', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['reslice', 'slice', 'webtoon', 'smart', 'seam', 'gutter', 'split'] },
		{ id: 'parallel-workers', label: 'Parallel Page Workers Concurrency', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['worker', 'parallel', 'concurrency', 'threads', 'speed', 'page'] },
		{ id: 'parallel-chapters', label: 'Parallel Batch Chapters Concurrency', category: 'compute', categoryLabel: 'Hardware & Compute', categoryIcon: Cpu, keywords: ['batch', 'chapter', 'concurrency', 'queue', 'parallel'] },

		// STORAGE
		{ id: 'storage-app-data', label: 'App Data Directory Location', category: 'storage', categoryLabel: 'Storage & Data', categoryIcon: HardDrive, keywords: ['app data', 'path', 'location', 'data root', 'disk'] },
		{ id: 'storage-breakdown', label: 'Disk Storage Consumption Breakdown', category: 'storage', categoryLabel: 'Storage & Data', categoryIcon: HardDrive, keywords: ['storage', 'size', 'bytes', 'breakdown', 'uploads', 'clean', 'output', 'covers', 'thumbnails'] },
		{ id: 'storage-purge-orphaned', label: 'Purge Orphaned Files & Caches', category: 'storage', categoryLabel: 'Storage & Data', categoryIcon: HardDrive, keywords: ['purge', 'orphaned', 'clean', 'stale', 'cache', 'delete', 'garbage'] },
		{ id: 'storage-clear-all', label: 'Clear All Data (Factory Reset)', category: 'storage', categoryLabel: 'Storage & Data', categoryIcon: HardDrive, keywords: ['clear all', 'delete all', 'reset', 'factory', 'wipe', 'danger'] },

		// NETWORK & ACCESS
		{ id: 'lan-access', label: 'LAN Access (Other Devices)', category: 'network', categoryLabel: 'Network & Access', categoryIcon: ShieldCheck, keywords: ['lan', 'network', 'wifi', 'phone', 'tablet', 'remote', 'mihon', 'share', 'restart', 'address', 'ip', 'docker'] },
		{ id: 'access-token', label: 'Access Token & Device Pairing', category: 'network', categoryLabel: 'Network & Access', categoryIcon: ShieldCheck, keywords: ['token', 'access', 'pair', 'extension', 'importer', 'mihon', 'password', 'security', 'unlock', 'print-token', 'docker'] },

		// ABOUT
		{ id: 'version-info', label: 'Native Core & Software Updates', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: Info, keywords: ['version', 'update', 'latest', 'release', 'github', 'build', 'hash', 'binary', 'commit', 'fingerprint'] },
		{ id: 'sidecar-health', label: 'ML Sidecar Health & Status', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: Info, keywords: ['sidecar', 'health', 'status', 'online', 'offline', 'ml'] },
		{ id: 'welcome-tour', label: 'Welcome Tour & Feature Guide', category: 'about', categoryLabel: 'About & Diagnostics', categoryIcon: HelpCircle, keywords: ['welcome', 'tour', 'guide', 'onboarding', 'tutorial', 'intro', 'introduction', 'walkthrough', 'step', 'help'] },
	];

	let searchFocused = false;
	let searchSelectedIndex = 0;
	let searchPopoverEl: HTMLDivElement | null = null;
	let highlightedSettingId: string | null = null;

	// PENDING SEARCH JUMP: THE TARGET MAY RENDER ONLY AFTER ITS TAB'S FETCH (PROVIDERS, NETWORK), SO THE LOOKUP RETRIES AND
	// A TAB'S loaded EVENT RE-SCROLLS ONCE (A LATE CARD ABOVE THE TARGET SHIFTS IT DOWN)
	const JUMP_RETRY_MS = 50;
	const JUMP_WINDOW_MS = 1500;
	const JUMP_HIGHLIGHT_MS = 2200;
	let jumpToken = 0;
	let pendingJumpId: string | null = null;
	let pendingJumpDeadline = 0;
	let jumpRetryTimer: ReturnType<typeof setTimeout> | null = null;
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;
	// SOME TARGETS RENDER ONLY IN SOME SETUPS (VRAM LIMIT NEEDS A GPU, API KEY IS HIDDEN FOR LOCAL PROVIDERS, THE GUIDE CAN BE
	// DISMISSED); WHEN ONE NEVER SHOWS, THE JUMP LANDS ON THE ALWAYS-RENDERED SECTION THAT HOLDS IT
	const JUMP_FALLBACKS: Record<string, string> = {
		'vram-limit': 'compute-device',
		'api-key': 'providers-hub',
		'custom-endpoint': 'providers-hub',
		'test-connection': 'providers-hub',
		'ai-guide': 'providers-hub',
	};

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
		searchSelectedIndex = 0;
		highlightedSettingId = setting.id;

		const token = ++jumpToken;
		pendingJumpId = setting.id;
		pendingJumpDeadline = Date.now() + JUMP_WINDOW_MS;
		if (jumpRetryTimer) clearTimeout(jumpRetryTimer);
		if (highlightTimer) clearTimeout(highlightTimer);
		jumpRetryTimer = null;
		highlightTimer = null;

		await tick();
		if (token !== jumpToken) return;
		jumpRetryTimer = setTimeout(() => tryScrollToPendingJump(token), 80);
	}

	function cancelPendingJump() {
		jumpToken++;
		pendingJumpId = null;
		highlightedSettingId = null;
		if (jumpRetryTimer) clearTimeout(jumpRetryTimer);
		if (highlightTimer) clearTimeout(highlightTimer);
		jumpRetryTimer = null;
		highlightTimer = null;
	}

	function scrollToSettingEl(id: string): boolean {
		const el = document.getElementById(`setting-${id}`);
		if (!el) return false;
		if (typeof el.scrollIntoView === 'function') {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		return true;
	}

	// THE HIGHLIGHT RING COUNTS FROM WHEN THE TARGET IS ACTUALLY ON SCREEN, NOT FROM THE CLICK
	function startHighlightTimer(id: string) {
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => {
			highlightTimer = null;
			if (highlightedSettingId === id) highlightedSettingId = null;
		}, JUMP_HIGHLIGHT_MS);
	}

	// THE TARGET WILL NOT RENDER: SCROLL TO ITS SECTION INSTEAD, OR DROP THE STALE HIGHLIGHT WHEN THERE IS NONE
	function settleMissingTarget(id: string) {
		pendingJumpId = null;
		const fallback = JUMP_FALLBACKS[id];
		if (fallback && scrollToSettingEl(fallback)) {
			highlightedSettingId = fallback;
			startHighlightTimer(fallback);
			return;
		}
		if (highlightedSettingId === id) highlightedSettingId = null;
	}

	function tryScrollToPendingJump(token: number) {
		jumpRetryTimer = null;
		if (token !== jumpToken || !pendingJumpId) return;
		const id = pendingJumpId;
		if (scrollToSettingEl(id)) {
			startHighlightTimer(id);
			return;
		}
		if (Date.now() < pendingJumpDeadline) {
			jumpRetryTimer = setTimeout(() => tryScrollToPendingJump(token), JUMP_RETRY_MS);
			return;
		}
		// GAVE UP: THE TARGET NEVER RENDERED (FAILED FETCH, DISMISSED GUIDE, NO GPU)
		settleMissingTarget(id);
	}

	// A TAB FINISHED ITS FETCH: RE-SCROLL A RECENT JUMP ONCE (ITS TARGET MAY HAVE MOVED OR JUST APPEARED)
	async function handleTabLoaded() {
		if (!pendingJumpId || Date.now() >= pendingJumpDeadline) return;
		const token = jumpToken;
		await tick();
		if (token !== jumpToken || !pendingJumpId) return;
		if (jumpRetryTimer) {
			// STILL WAITING FOR THE TARGET: LOOK NOW INSTEAD OF AT THE NEXT RETRY. THE TAB HAS LOADED, SO A TARGET THAT IS
			// STILL MISSING IS ONE THIS SETUP DOES NOT SHOW
			clearTimeout(jumpRetryTimer);
			jumpRetryTimer = null;
			if (!document.getElementById(`setting-${pendingJumpId}`)) {
				settleMissingTarget(pendingJumpId);
				return;
			}
			tryScrollToPendingJump(token);
		} else {
			scrollToSettingEl(pendingJumpId);
		}
		pendingJumpId = null;
	}

	function handleSearchKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			// ONLY SWALLOW THE KEY WHILE THE RESULTS POPOVER IS SHOWING; OTHERWISE THE MODAL STACK CLOSES SETTINGS
			if (searchFocused && globalSearch.trim()) {
				event.preventDefault();
				searchFocused = false;
			}
			return;
		}

		if (flatMatchingSettings.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			searchSelectedIndex = (searchSelectedIndex + 1) % flatMatchingSettings.length;
			scrollActiveSettingIntoView();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			searchSelectedIndex = (searchSelectedIndex - 1 + flatMatchingSettings.length) % flatMatchingSettings.length;
			scrollActiveSettingIntoView();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = flatMatchingSettings[searchSelectedIndex];
			if (target) {
				jumpToSetting(target);
			}
		}
	}

	function scrollActiveSettingIntoView() {
		tick().then(() => {
			const activeEl = searchPopoverEl?.querySelector(`[data-index="${searchSelectedIndex}"]`);
			if (activeEl && typeof (activeEl as HTMLElement).scrollIntoView === 'function') {
				(activeEl as HTMLElement).scrollIntoView({ block: 'nearest' });
			}
		});
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
	$: flatMatchingSettings = Array.from(matchingSettingsGroups.values()).flatMap((g) => g.items);
</script>

<!-- GLOBAL MASTER-DETAIL PREFERENCES & CONFIGURATION MODAL -->
<Modal
	bind:open
	title="Preferences & Configuration"
	size="2xl"
	placement="top"
	bodyClass="p-0"
	on:close={() => {
		open = false;
		dispatch('close');
	}}
>
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
						on:input={() => {
							searchFocused = true;
							searchSelectedIndex = 0;
						}}
						on:keydown={handleSearchKeyDown}
						placeholder="Search settings..."
						class="h-[36px] w-full rounded-lg border border-black/10 bg-transparent pl-9 pr-8 text-xs text-neutral-900 placeholder:opacity-40 outline-none transition-colors focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08] dark:text-neutral-100"
					/>
					{#if globalSearch.trim()}
						<button
							type="button"
							on:click={() => {
								globalSearch = '';
								searchFocused = false;
								searchSelectedIndex = 0;
							}}
							class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
						>
							<X size={13} />
						</button>
					{/if}
				</div>

				<!-- FLOATING SEARCH RESULTS POPOVER MENU -->
				{#if globalSearch.trim() && searchFocused}
					<!-- BACKDROP DISMISS FOR SEARCH POPOVER -->
					<button
						type="button"
						class="fixed inset-0 z-30 bg-transparent cursor-default outline-none"
						on:click={() => (searchFocused = false)}
						tabindex="-1"
						aria-label="Dismiss search results"
					></button>

					<div
						bind:this={searchPopoverEl}
						transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
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
											{@const flatIdx = flatMatchingSettings.indexOf(setting)}
											<button
												type="button"
												data-index={flatIdx}
												on:click={() => jumpToSetting(setting)}
												on:mouseenter={() => (searchSelectedIndex = flatIdx)}
												class={cn(
													'w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer group',
													searchSelectedIndex === flatIdx
														? 'bg-[#b23a2e]/[0.08] dark:bg-[#e08a63]/[0.12] ring-1 ring-[#b23a2e]/25 dark:ring-[#e08a63]/30 font-medium'
														: 'hover:bg-black/5 dark:hover:bg-white/5',
												)}
												use:ripple
											>
												<span class="truncate pl-1.5">
													{#if hp.match}
														{hp.before}<span class="font-bold text-[#b23a2e] dark:text-[#e08a63] underline">{hp.match}</span>{hp.after}
													{:else}
														{setting.label}
													{/if}
												</span>
												<span class={cn(
													'text-[9px] font-semibold transition text-[#b23a2e] dark:text-[#e08a63] pl-2 shrink-0',
													searchSelectedIndex === flatIdx ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
												)}>
													Jump ↵
												</span>
											</button>
										{/each}
									</div>
								</div>
							{/each}

							<!-- KEYBOARD HINTS FOOTER -->
							<div class="border-t border-black/10 dark:border-white/10 pt-1.5 px-2 flex items-center justify-between text-[10px] opacity-60">
								<span class="flex items-center gap-1">
									<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1 py-0.2 font-mono text-[9px]">↑</kbd>
									<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1 py-0.2 font-mono text-[9px]">↓</kbd>
									<span>Navigate</span>
								</span>
								<span class="flex items-center gap-1">
									<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1 py-0.2 font-mono text-[9px]">↵</kbd>
									<span>Jump</span>
								</span>
								<span class="flex items-center gap-1">
									<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.2 font-mono text-[9px]">ESC</kbd>
									<span>Dismiss</span>
								</span>
							</div>
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
		<div
			class={cn(
				'flex-1 overflow-y-auto p-4 sm:p-6 flex-col justify-start space-y-2',
				mobileView === 'menu' ? 'hidden md:flex' : 'flex'
			)}
		>
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
					<AppearanceTab {highlightedSettingId} />

				<!-- SECTION 2: TYPESETTING & LETTERING STUDIO -->
				{:else if activeCategory === 'typesetting'}
					<TypesettingTab {highlightedSettingId} />

				<!-- SECTION 3: INPAINTING & CLEANING -->
				{:else if activeCategory === 'inpainting'}
					<InpaintingTab {highlightedSettingId} />

				<!-- SECTION 4: AI TRANSLATION PROVIDERS -->
				{:else if activeCategory === 'providers'}
					<ProvidersTab {highlightedSettingId} on:loaded={handleTabLoaded} />

				<!-- SECTION 5: HARDWARE & COMPUTE -->
				{:else if activeCategory === 'compute'}
					<ComputeTab active={open} hardwareInfo={$settingsHardwareInfo} {highlightedSettingId} />

				<!-- SECTION: STORAGE & DATA CONSUMPTION -->
				{:else if activeCategory === 'storage'}
					<StorageTab {highlightedSettingId} />

				<!-- SECTION: NETWORK & ACCESS -->
				{:else if activeCategory === 'network'}
					<NetworkAccessSection {highlightedSettingId} on:loaded={handleTabLoaded} />

				<!-- SECTION 7: ABOUT & SYSTEM DIAGNOSTICS -->
				{:else if activeCategory === 'about'}
					<AboutTab hardwareInfo={$settingsHardwareInfo} {highlightedSettingId} on:openTour={() => {
						open = false;
						dispatch('close');
						dispatch('openTour');
					}} />
				{/if}
			</div>
		</div>
	</div>
</Modal>
