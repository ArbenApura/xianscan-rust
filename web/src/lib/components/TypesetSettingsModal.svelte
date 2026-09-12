<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import {
		settings,
		DEFAULTS,
		AVAILABLE_TYPESET_FONTS,
		AVAILABLE_CJK_FONTS,
		customFontsStore,
		systemFontsStore,
		fetchInstalledSystemFonts,
		unloadBrowserFontFace,
		getMergedDialogueFonts,
		getMergedCjkFonts,
		fontAvailabilityStore,
		refreshFontAvailability,
		type TypesetOutline,
		type TypesetCasing,
		type TypesetFontWeight,
		FONT_WEIGHT_PRESETS,
		normalizeFontWeightNumeric,
		normalizeFontWeightSelectValue,
		isWeightSupportedByFont,
		getValidFontWeightForFont,
		CASING_PRESETS,
		isCasingSupportedByFont,
		getValidCasingForFont,
	} from '$lib/stores/settings';
	// IMPORTED ICONS
	import Type from 'lucide-svelte/icons/type';
	import Check from 'lucide-svelte/icons/check';
	import Sliders from 'lucide-svelte/icons/sliders';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Compass from 'lucide-svelte/icons/compass';
	import Palette from 'lucide-svelte/icons/palette';
	import Languages from 'lucide-svelte/icons/languages';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	import Info from 'lucide-svelte/icons/info';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Monitor from 'lucide-svelte/icons/monitor';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Select, { type SelectOption } from '$lib/components/ui/Select.svelte';
	import ImportFontModal from '$lib/components/typeset/ImportFontModal.svelte';
	import SystemFontBrowserModal from '$lib/components/typeset/SystemFontBrowserModal.svelte';

	// -- PROPS & EVENTS -- //
	export let open = false;

	let importDialogueModalOpen = false;
	let importCjkModalOpen = false;
	let systemDialogueModalOpen = false;
	let systemCjkModalOpen = false;
	let confirmDeleteOpen = false;
	let fontToDelete: { id: string; name: string } | null = null;
	let isDeletingFont = false;

	$: if (open) {
		void refreshFontAvailability();
	}

	// -- PREVIEW SCRIPT / LANGUAGE PRESETS -- //
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

	// -- STATES FOR LIVE PREVIEW CARD -- //
	let previewDarkBackground = false;
	let previewSimulatedAngle = 8; // DEGREES
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

	// -- OUTLINE PRESETS -- //
	const OUTLINE_PRESETS: { id: TypesetOutline; label: string; px: string; desc: string }[] = [
		{ id: 'none', label: 'None', px: '0px', desc: 'No outline stroke (clean minimalist text)' },
		{ id: 'thin', label: 'Thin', px: '1.5px', desc: 'Subtle boundary for clean line-art' },
		{ id: 'standard', label: 'Standard', px: '3px', desc: 'Balanced scanlation stroke outline' },
		{ id: 'heavy', label: 'Heavy', px: '5px', desc: 'Thick contrast halo for busy illustrations' },
	];

	// -- PADDING PRESETS -- //
	const PADDING_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.02, label: 'Tight (2%)', sub: 'Maximal bubble fill' },
		{ value: 0.05, label: 'Balanced (5%)', sub: 'Standard edge clearance · Default' },
		{ value: 0.08, label: 'Spacious (8%)', sub: 'Generous safety breathing room' },
		{ value: 0.12, label: 'Airy (12%)', sub: 'Large boundary padding' },
	];

	function setTypesetFont(font: string) {
		const targetStatus = $fontAvailabilityStore[font];
		const targetOption = dialogueFonts.find((f) => f.id === font);
		const supported = targetStatus?.supportedWeights || targetOption?.supportedWeights || ['normal'];
		const isVariable = Boolean(targetStatus?.isVariable || targetOption?.isVariable);
		const nextWeight = getValidFontWeightForFont($settings.typesetFontWeight, supported, isVariable);
		const isAllCaps = targetStatus?.allCapsOnly ?? targetOption?.allCapsOnly ?? false;
		const isLowercase = targetStatus?.lowercaseOnly ?? targetOption?.lowercaseOnly ?? false;
		const supportedCasings = targetStatus?.supportedCasings || targetOption?.supportedCasings;
		const nextCasing = getValidCasingForFont($settings.typesetCasing, supportedCasings, isAllCaps, isLowercase);

		settings.update((s) => ({
			...s,
			typesetFont: font,
			typesetFontWeight: nextWeight,
			typesetCasing: nextCasing,
			typesetAllCaps: nextCasing === 'uppercase',
		}));
		toast.success(`Dialogue font set to ${font}`);
	}

	function setTypesetFontWeight(weight: TypesetFontWeight | string) {
		const w = weight as TypesetFontWeight;
		settings.update((s) => ({ ...s, typesetFontWeight: w }));
		const preset = FONT_WEIGHT_PRESETS.find((p) => p.value === w);
		const label = preset ? `${preset.label} (${preset.numeric})` : (w === 'bold' ? 'Bold (700)' : 'Regular (400)');
		toast.success(`Font weight set to ${label}`);
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

	function setCasing(casing: TypesetCasing | string) {
		const c = casing as TypesetCasing;
		if (!isCasingSupportedByFont(c, supportedCasings, isFontAllCaps, isFontLowercaseOnly)) {
			toast.error(`Selected font does not support ${c} letterform`);
			return;
		}
		settings.update((s) => ({
			...s,
			typesetCasing: c,
			typesetAllCaps: c === 'uppercase',
		}));
		const label = CASING_PRESETS.find((p) => p.id === c)?.label || c;
		toast.success(`Dialogue casing set to ${label}`);
	}

	function toggleTextRotation() {
		settings.update((s) => {
			const next = !s.enableTextRotation;
			toast.success(`Text angle rotation ${next ? 'enabled' : 'disabled'}`);
			return { ...s, enableTextRotation: next };
		});
	}

	function toggleTypesetCentering() {
		settings.update((s) => {
			const next = s.enableTypesetCentering === false;
			toast.success(`Bubble centering & expansion ${next ? 'enabled' : 'disabled'}`);
			return { ...s, enableTypesetCentering: next };
		});
	}

	$: isTypesettingModified =
		($settings.typesetFont || 'CC Wild Words') !== DEFAULTS.typesetFont ||
		normalizeFontWeightSelectValue($settings.typesetFontWeight) !== normalizeFontWeightSelectValue(DEFAULTS.typesetFontWeight) ||
		Boolean($settings.enableTypesetItalic) !== Boolean(DEFAULTS.enableTypesetItalic) ||
		($settings.typesetCjkFont || 'Microsoft YaHei') !== DEFAULTS.typesetCjkFont ||
		Math.abs(($settings.typesetPadding || 0.05) - DEFAULTS.typesetPadding) >= 0.005 ||
		($settings.typesetOutline || 'standard') !== DEFAULTS.typesetOutline ||
		($settings.typesetCasing || 'uppercase') !== DEFAULTS.typesetCasing ||
		Boolean($settings.enableTextRotation) !== Boolean(DEFAULTS.enableTextRotation) ||
		Boolean($settings.enableTypesetCentering ?? true) !== Boolean(DEFAULTS.enableTypesetCentering ?? true) ||
		($settings.typesetPreviewPreset || 'en') !== (DEFAULTS.typesetPreviewPreset || 'en') ||
		($settings.typesetPreviewText || '') !== (DEFAULTS.typesetPreviewText || '');

	function resetTypesetDefaults() {
		settings.update((s) => ({
			...s,
			typesetFont: DEFAULTS.typesetFont,
			typesetFontWeight: DEFAULTS.typesetFontWeight,
			enableTypesetItalic: DEFAULTS.enableTypesetItalic,
			typesetCjkFont: DEFAULTS.typesetCjkFont,
			typesetPadding: DEFAULTS.typesetPadding,
			typesetOutline: DEFAULTS.typesetOutline,
			typesetContrast: DEFAULTS.typesetContrast,
			typesetCasing: DEFAULTS.typesetCasing,
			typesetAllCaps: DEFAULTS.typesetAllCaps,
			enableTextRotation: DEFAULTS.enableTextRotation,
			enableTypesetCentering: DEFAULTS.enableTypesetCentering,
			typesetPreviewPreset: DEFAULTS.typesetPreviewPreset,
			typesetPreviewText: DEFAULTS.typesetPreviewText,
		}));
		selectedPresetId = 'en';
		previewSampleText = SAMPLE_TEXT_PRESETS[0].text;
		isCustomTextMode = false;
		toast.success('Typesetting settings reset to defaults');
	}

	function promptDeleteFont(id: string, name: string): void {
		fontToDelete = { id, name };
		confirmDeleteOpen = true;
	}

	async function handleDeleteFont(): Promise<void> {
		if (!fontToDelete) return;
		isDeletingFont = true;
		try {
			const res = await fetch(`/api/system/fonts/${fontToDelete.id}`, { method: 'DELETE' });
			const data = await res.json();
			if (res.ok && data.success) {
				toast.success(`Font "${fontToDelete.name}" deleted`);
				await refreshFontAvailability();
				if ($settings.typesetFont === fontToDelete.name) {
					settings.update((s) => ({ ...s, typesetFont: DEFAULTS.typesetFont }));
				}
				if ($settings.typesetCjkFont === fontToDelete.name) {
					settings.update((s) => ({ ...s, typesetCjkFont: DEFAULTS.typesetCjkFont }));
				}
			} else {
				toast.error(data.error || 'Failed to delete font');
			}
		} catch (err: any) {
			toast.error(err.message || 'Failed to delete font');
		} finally {
			isDeletingFont = false;
			confirmDeleteOpen = false;
			fontToDelete = null;
		}
	}

	function disableSystemFont(familyName: string, fontLabel?: string): void {
		settings.update((s) => {
			const nextEnabled = (s.enabledSystemFonts || []).filter((f) => f !== familyName);
			let nextTypesetFont = s.typesetFont;
			let nextTypesetCjkFont = s.typesetCjkFont;

			if (s.typesetFont === familyName) {
				nextTypesetFont = 'CC Wild Words';
			}
			if (s.typesetCjkFont === familyName) {
				nextTypesetCjkFont = 'WenQuanYi Micro Hei';
			}

			return {
				...s,
				enabledSystemFonts: nextEnabled,
				typesetFont: nextTypesetFont,
				typesetCjkFont: nextTypesetCjkFont,
			};
		});
		unloadBrowserFontFace(familyName);
		toast.info(`Disabled "${fontLabel || familyName}" from typesetting choices`);
	}

	$: if (open && $systemFontsStore.length === 0) {
		fetchInstalledSystemFonts();
	}

	// COMPUTED PREVIEW STYLES
	$: dialogueFonts = getMergedDialogueFonts($customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
	$: cjkFonts = getMergedCjkFonts($customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
	$: selectedFont = dialogueFonts.find((f) => f.id === $settings.typesetFont) || AVAILABLE_TYPESET_FONTS[0];
	$: selectedCjkFont = cjkFonts.find((f) => f.id === $settings.typesetCjkFont) || AVAILABLE_CJK_FONTS[0];
	$: fontStatus = $fontAvailabilityStore[$settings.typesetFont];
	$: supportedWeights = fontStatus?.supportedWeights || selectedFont?.supportedWeights || ['normal'];
	$: effectiveWeight = normalizeFontWeightSelectValue($settings.typesetFontWeight);

	// -- FONT WEIGHT SELECT OPTIONS -- //
	$: fontWeightOptions = FONT_WEIGHT_PRESETS.map((p) => {
		const supported = isWeightSupportedByFont(p.numeric, supportedWeights, selectedFont?.isVariable);
		return {
			value: p.value,
			label: p.label,
			hint: supported ? p.hint : 'Not supported by font',
			disabled: !supported,
		};
	}) satisfies SelectOption[];

	$: isFontAllCaps = fontStatus?.allCapsOnly ?? selectedFont?.allCapsOnly ?? false;
	$: isFontLowercaseOnly = fontStatus?.lowercaseOnly ?? selectedFont?.lowercaseOnly ?? false;
	$: supportedCasings = fontStatus?.supportedCasings || selectedFont?.supportedCasings;

	// -- CASING SELECT OPTIONS -- //
	$: casingOptions = CASING_PRESETS.map((p) => {
		const supported = isCasingSupportedByFont(p.id, supportedCasings, isFontAllCaps, isFontLowercaseOnly);
		return {
			value: p.id,
			label: p.label,
			hint: supported ? p.desc : 'Not supported by font',
			disabled: !supported,
		};
	}) satisfies SelectOption[];

	// AUTO-FALLBACK IF CURRENT WEIGHT OR CASING IS UNSUPPORTED BY SELECTED FONT
	let prevDialogueFont = $settings.typesetFont;
	$: if ($settings.typesetFont && $settings.typesetFont !== prevDialogueFont) {
		prevDialogueFont = $settings.typesetFont;
		const nextWeight = getValidFontWeightForFont($settings.typesetFontWeight, supportedWeights, selectedFont?.isVariable);
		if (nextWeight !== normalizeFontWeightSelectValue($settings.typesetFontWeight)) {
			settings.update((s) => ({ ...s, typesetFontWeight: nextWeight }));
		}
		const nextCasing = getValidCasingForFont($settings.typesetCasing, supportedCasings, isFontAllCaps, isFontLowercaseOnly);
		if (nextCasing !== ($settings.typesetCasing || 'uppercase')) {
			settings.update((s) => ({ ...s, typesetCasing: nextCasing, typesetAllCaps: nextCasing === 'uppercase' }));
		}
	}

	// ENSURE ACTIVE CASING IS SUPPORTED BY CURRENTLY SELECTED FONT
	$: {
		const validCasing = getValidCasingForFont($settings.typesetCasing, supportedCasings, isFontAllCaps, isFontLowercaseOnly);
		if (validCasing !== ($settings.typesetCasing || 'uppercase')) {
			settings.update((s) => ({ ...s, typesetCasing: validCasing, typesetAllCaps: validCasing === 'uppercase' }));
		}
	}

	$: isTextCjk = CJK_REGEX.test(previewSampleText);
	$: previewFontFamily = isTextCjk
		? `"${$settings.typesetCjkFont || 'Microsoft YaHei'}", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", sans-serif`
		: (selectedFont?.stack || `"${$settings.typesetFont || 'CC Wild Words'}", sans-serif`);
	$: previewIsDarkBubble = previewDarkBackground;
	$: previewTextColor = previewIsDarkBubble ? '#ffffff' : '#111111';
	$: previewStrokeColor = previewIsDarkBubble ? '#000000' : '#ffffff';
	$: previewStrokeWidth = $settings.typesetOutline === 'none' ? '0px' : $settings.typesetOutline === 'thin' ? '1px' : $settings.typesetOutline === 'heavy' ? '3px' : '2px';
	$: previewFontWeight = normalizeFontWeightNumeric($settings.typesetFontWeight);
	$: previewFontStyle = $settings.enableTypesetItalic ? 'italic' : 'normal';
	$: previewEffectiveText =
		isFontAllCaps || ($settings.typesetCasing || 'uppercase') === 'uppercase'
			? previewSampleText.toUpperCase()
			: isFontLowercaseOnly || $settings.typesetCasing === 'lowercase'
				? previewSampleText.toLowerCase()
				: previewSampleText;
	$: previewTransformRotation = $settings.enableTextRotation ? `rotate(${previewSimulatedAngle}deg)` : 'none';
	$: previewInsetPadding = `${Math.max(8, Math.round(120 * ($settings.typesetPadding || 0.05)))}px`;
	$: previewFontSizePx = '14px';
</script>

<Modal {open} title="Typesetting & Lettering Studio" size="lg" placement="top" on:close={() => (open = false)}>
	<div class="flex flex-col gap-5 sm:gap-6">
		<!-- 1. INTERACTIVE LIVE SPEECH BUBBLE PREVIEW -->
		<div class="rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
					<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Live Speech Bubble Preview</span>
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						on:click={() => (previewDarkBackground = !previewDarkBackground)}
						class="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
						title="Toggle preview artwork contrast"
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
			</div>

			<!-- PRESET SCRIPT & DIALOGUE SWITCHER -->
			<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
				<div class="inline-flex items-center gap-1 text-[10px] font-bold uppercase opacity-60 mr-1">
					<Languages size={12} />
					<span>Sample:</span>
				</div>
				{#each SAMPLE_TEXT_PRESETS as preset}
					{@const isActive = !isCustomTextMode && selectedPresetId === preset.id}
					<button
						type="button"
						on:click={() => selectTextPreset(preset)}
						class={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold transition-all cursor-pointer ${
							isActive
								? 'border-[#b23a2e] bg-[#b23a2e] text-white shadow-2xs dark:bg-[#e08a63] dark:border-[#e08a63]'
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
							? 'border-[#b23a2e] bg-[#b23a2e] text-white shadow-2xs dark:bg-[#e08a63] dark:border-[#e08a63]'
							: 'border-black/10 bg-white hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300'
					}`}
				>
					<Edit3 size={11} />
					<span>Custom Text</span>
				</button>
			</div>

			<!-- CUSTOM TEXT INPUT IF SELECTED -->
			{#if isCustomTextMode}
				<div class="flex items-center gap-2">
					<input
						type="text"
						value={previewSampleText}
						on:input={(e) => onCustomTextChange(e.currentTarget.value)}
						placeholder="Type preview dialogue or symbols..."
						class="w-full rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs focus:border-[#b23a2e] focus:outline-hidden dark:border-white/15 dark:bg-neutral-800"
					/>
				</div>
			{/if}

			<!-- SIMULATED MANGA ARTWORK CANVAS & BUBBLE -->
			<div
				class={`relative flex min-h-[160px] sm:min-h-[180px] items-center justify-center overflow-hidden rounded-xl border p-6 transition-colors duration-200 ${
					previewDarkBackground
						? 'bg-neutral-900 border-neutral-800 text-white'
						: 'bg-[#faf7f2] border-neutral-300/80 text-neutral-900'
				}`}
			>
				<!-- Subtle manga screentone / grid background pattern -->
				<div class="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#888_1px,transparent_1px)] [background-size:12px_12px]"></div>

				<!-- SPEECH BUBBLE CONTAINER -->
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
						class="leading-snug select-none transition-all duration-150 break-words px-1.5"
						style="
							font-family: {previewFontFamily};
							font-weight: {previewFontWeight};
							font-style: {previewFontStyle};
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

				<!-- ROTATION ANGLE BADGE -->
				{#if $settings.enableTextRotation}
					<div class="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white backdrop-blur-xs">
						<Compass size={10} />
						<span>Tilt Angle: +{previewSimulatedAngle}°</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- 2. TYPOGRAPHY: ENGLISH / LATIN & CJK FALLBACK -->
		<div class="space-y-4">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Typography & Font Family</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5">Primary dialogue font for Latin translation and CJK fallback stack</p>
			</div>

			<!-- LATIN DIALOGUE FONTS -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between gap-2 pl-0.5">
					<div class="text-[11px] font-semibold opacity-75 truncate min-w-0">
						<span class="hidden sm:inline">Latin / English Dialogue Font</span>
						<span class="sm:hidden">Dialogue Font</span>
					</div>
					<div class="flex items-center gap-1 shrink-0">
						<button
							type="button"
							on:click={() => (systemDialogueModalOpen = true)}
							class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5 transition cursor-pointer whitespace-nowrap shrink-0"
							use:ripple
							title="Browse and enable dialogue fonts installed on your operating system"
						>
							<Monitor size={12} />
							<span>System Fonts</span>
						</button>
						<button
							type="button"
							on:click={() => (importDialogueModalOpen = true)}
							class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[#b23a2e] hover:bg-[#b23a2e]/10 dark:text-[#e08a63] dark:hover:bg-[#e08a63]/10 transition cursor-pointer whitespace-nowrap shrink-0"
							use:ripple
						>
							<Plus size={13} />
							<span>Import</span>
						</button>
					</div>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{#each dialogueFonts as font}
						{@const isSelected = ($settings.typesetFont || 'CC Wild Words') === font.id}
						{@const status = $fontAvailabilityStore[font.id]}
						{@const isAvailable = status ? status.available : (font.bundled ?? true)}
						<button
							type="button"
							disabled={!isAvailable}
							on:click={() => isAvailable && setTypesetFont(font.id)}
							title={!isAvailable ? `${font.label} is not installed on this system / server` : font.label}
							class={cn(
								'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
								!isAvailable
									? 'opacity-40 cursor-not-allowed border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01]'
									: isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-pointer'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] cursor-pointer',
							)}
							use:ripple
						>
							<div class="flex items-center justify-between gap-1">
								<span class="text-xs font-bold pl-1.5 truncate" style="font-family: {font.stack};">{font.label}</span>
								<div class="flex items-center gap-1 shrink-0">
									{#if font.custom}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#a97f28]/15 text-[#a97f28] dark:bg-[#c9a24b]/20 dark:text-[#d8b15a]">
											{font.isVariable ? 'Variable' : (font.variants && font.variants.length > 0 ? `${font.variants.length + 1}w` : 'Imported')}
										</span>
										<button
											type="button"
											on:click={(e) => { e.stopPropagation(); promptDeleteFont(font.customId || font.id, font.label); }}
											class="p-0.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/20 transition cursor-pointer"
											title="Delete imported font"
											use:ripple
										>
											<Trash2 size={12} />
										</button>
									{:else if font.system}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300">System</span>
										<button
											type="button"
											on:click={(e) => { e.stopPropagation(); disableSystemFont(font.id, font.label); }}
											class="p-0.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/20 transition cursor-pointer"
											title="Disable system font"
											use:ripple
										>
											<Trash2 size={12} />
										</button>
									{:else if !isAvailable}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">Missing</span>
									{:else if font.bundled}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#4f7a64]/15 text-[#4f7a64] dark:bg-[#4f7a64]/25 dark:text-[#83b39a]">Bundled</span>
									{/if}
									{#if isSelected}
										<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
									{/if}
								</div>
							</div>
							<div class="mt-1 flex items-center justify-between gap-1">
								<span class="text-[10px] opacity-60 leading-tight truncate pl-1.5">{!isAvailable ? 'Not Installed on Server' : font.sub}</span>
								{#if (font.allCapsOnly || (font.supportedCasings && font.supportedCasings.length === 1 && font.supportedCasings[0] === 'uppercase')) && isAvailable}
									<span class="rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[8px] font-bold opacity-70 shrink-0">ALL-CAPS</span>
								{:else if (font.lowercaseOnly || (font.supportedCasings && font.supportedCasings.length === 1 && font.supportedCasings[0] === 'lowercase')) && isAvailable}
									<span class="rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[8px] font-bold opacity-70 shrink-0">LOWERCASE</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- FONT WEIGHT & CASING ROW -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
				<!-- DIALOGUE FONT WEIGHT SELECTOR -->
				<div class="space-y-1.5">
					<div class="text-[11px] font-semibold opacity-75 pl-0.5">Dialogue Font Weight</div>
					<Select
						items={fontWeightOptions}
						value={effectiveWeight}
						on:change={(e) => setTypesetFontWeight(e.detail)}
					/>
				</div>

				<!-- DIALOGUE LETTERFORM CASING -->
				<div class="space-y-1.5">
					<div class="text-[11px] font-semibold opacity-75 pl-0.5">Dialogue Letterform Casing</div>
					<Select
						items={casingOptions}
						value={$settings.typesetCasing || 'uppercase'}
						on:change={(e) => setCasing(e.detail)}
					/>
				</div>
			</div>

			<!-- CJK FALLBACK STACK -->
			<div class="space-y-1.5 pt-1">
				<div class="flex items-center justify-between gap-2 pl-0.5">
					<div class="text-[11px] font-semibold opacity-75 truncate min-w-0">
						<span class="hidden sm:inline">CJK / East Asian Fallback Engine</span>
						<span class="sm:hidden">CJK Fallback Engine</span>
					</div>
					<div class="flex items-center gap-1 shrink-0">
						<button
							type="button"
							on:click={() => (systemCjkModalOpen = true)}
							class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5 transition cursor-pointer whitespace-nowrap shrink-0"
							use:ripple
							title="Browse and enable CJK fonts installed on your operating system"
						>
							<Monitor size={12} />
							<span>System Fonts</span>
						</button>
						<button
							type="button"
							on:click={() => (importCjkModalOpen = true)}
							class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[#b23a2e] hover:bg-[#b23a2e]/10 dark:text-[#e08a63] dark:hover:bg-[#e08a63]/10 transition cursor-pointer whitespace-nowrap shrink-0"
							use:ripple
						>
							<Plus size={13} />
							<span>Import</span>
						</button>
					</div>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
					{#each cjkFonts as cjk}
						{@const isSelected = ($settings.typesetCjkFont || 'Microsoft YaHei') === cjk.id}
						{@const status = $fontAvailabilityStore[cjk.id]}
						{@const isAvailable = status ? status.available : (cjk.bundled ?? true)}
						<button
							type="button"
							disabled={!isAvailable}
							on:click={() => isAvailable && setTypesetCjkFont(cjk.id)}
							title={!isAvailable ? `${cjk.label} is not installed on this system / server` : cjk.label}
							class={cn(
								'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
								!isAvailable
									? 'opacity-40 cursor-not-allowed border-black/5 bg-black/[0.01] dark:border-white/5 dark:bg-white/[0.01]'
									: isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-pointer'
										: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] cursor-pointer',
							)}
							use:ripple
						>
							<div class="flex items-center justify-between gap-1">
								<span class="text-xs font-bold truncate pl-1.5">{cjk.label}</span>
								<div class="flex items-center gap-1 shrink-0">
									{#if cjk.custom}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#a97f28]/15 text-[#a97f28] dark:bg-[#c9a24b]/20 dark:text-[#d8b15a]">
											{cjk.isVariable ? 'Variable' : (cjk.variants && cjk.variants.length > 0 ? `${cjk.variants.length + 1}w` : 'Imported')}
										</span>
										<button
											type="button"
											on:click={(e) => { e.stopPropagation(); promptDeleteFont(cjk.customId || cjk.id, cjk.label); }}
											class="p-0.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/20 transition cursor-pointer"
											title="Delete imported font"
											use:ripple
										>
											<Trash2 size={12} />
										</button>
									{:else if cjk.system}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300">System</span>
										<button
											type="button"
											on:click={(e) => { e.stopPropagation(); disableSystemFont(cjk.id, cjk.label); }}
											class="p-0.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/20 transition cursor-pointer"
											title="Disable system font"
											use:ripple
										>
											<Trash2 size={12} />
										</button>
									{:else if !isAvailable}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">Missing</span>
									{:else if cjk.bundled}
										<span class="text-[8.5px] font-mono font-semibold px-1 py-0.2 rounded bg-[#4f7a64]/15 text-[#4f7a64] dark:bg-[#4f7a64]/25 dark:text-[#83b39a]">Bundled</span>
									{/if}
									{#if isSelected}
										<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
									{/if}
								</div>
							</div>
							<div class="mt-1 text-[9px] opacity-60 truncate pl-1.5">{!isAvailable ? 'Not Installed on Server' : cjk.sub}</div>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- 3. TEXT STROKE OUTLINE -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-3">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Palette size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Text Stroke Outline</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5">High-contrast text stroke outlines and borders</p>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
				{#each OUTLINE_PRESETS as oPreset}
					{@const isSelected = ($settings.typesetOutline || 'standard') === oPreset.id}
					<button
						type="button"
						on:click={() => setOutline(oPreset.id)}
						class={cn(
							'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
								: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]',
						)}
						use:ripple
					>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold pl-0.5">{oPreset.label}</span>
							{#if isSelected}
								<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
							{/if}
						</div>
						<div class="mt-1 text-[9px] opacity-60 leading-tight pl-0.5">{oPreset.desc}</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- 4. BUBBLE GEOMETRY, INSET PADDING & ORIENTATION -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Sliders size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Bubble Geometry & Inset Padding</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5">Edge padding clearance margin and comic bubble layout adaptation</p>
			</div>

			<!-- BUBBLE INSET PADDING -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<div class="text-[11px] font-semibold opacity-75 pl-0.5">Bubble Edge Inset Padding</div>
					<span class="text-[10px] font-mono opacity-60">{Math.round(($settings.typesetPadding || 0.05) * 100)}% inset</span>
				</div>

				<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{#each PADDING_PRESETS as preset}
						{@const isSelected = Math.abs(($settings.typesetPadding || 0.05) - preset.value) < 0.005}
						<button
							type="button"
							on:click={() => setPadding(preset.value)}
							class={cn(
								'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer',
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]',
							)}
							use:ripple
						>
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold pl-0.5">{preset.label}</span>
								{#if isSelected}
									<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
								{/if}
							</div>
							<div class="mt-1 text-[9px] opacity-60 leading-tight pl-0.5">{preset.sub}</div>
						</button>
					{/each}
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
				<!-- ROTATION TOGGLE -->
				<div class="flex items-start justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.01] p-3 dark:border-white/10 dark:bg-white/[0.01]">
					<div class="min-w-0 pr-1">
						<div class="text-xs font-bold pl-0.5">Follow Comic Bubble Tilt Angle</div>
						<p class="text-[10px] opacity-60 mt-0.5 pl-0.5 leading-relaxed">Rotate rendered text along detected diagonal comic bubbles (±2° to ±45°)</p>
					</div>

					<Switch
						checked={$settings.enableTextRotation}
						on:click={toggleTextRotation}
						ariaLabel="Follow Comic Bubble Tilt Angle"
					/>
				</div>

				<!-- CENTERING & EXPANSION TOGGLE -->
				<div class="flex items-start justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.01] p-3 dark:border-white/10 dark:bg-white/[0.01]">
					<div class="min-w-0 pr-1">
						<div class="text-xs font-bold pl-0.5">Bubble Centering & Expansion</div>
						<p class="text-[10px] opacity-60 mt-0.5 pl-0.5 leading-relaxed">Anchor translated text to bubble centers and expand typesetting into available space</p>
					</div>

					<Switch
						checked={$settings.enableTypesetCentering ?? true}
						on:click={toggleTypesetCentering}
						ariaLabel="Bubble Centering & Expansion"
					/>
				</div>
			</div>
		</div>

		<!-- FOOTER ACTIONS -->
		<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/10">
			<div class="w-full sm:w-auto">
				{#if isTypesettingModified}
					<button
						type="button"
						on:click={resetTypesetDefaults}
						class="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition cursor-pointer shrink-0"
						use:ripple
					>
						<RotateCcw size={15} />
						<span>Reset Defaults</span>
					</button>
				{/if}
			</div>

			<Button variant="primary" size="md" class="w-full sm:w-auto px-6 shrink-0" on:click={() => (open = false)}>
				<span>Done</span>
			</Button>
		</div>
	</div>
</Modal>

<!-- IMPORT DIALOGUE FONT MODAL -->
<ImportFontModal
	bind:open={importDialogueModalOpen}
	targetScriptType="dialogue"
	on:imported={(e) => {
		setTypesetFont(e.detail.font.name);
	}}
/>

<!-- IMPORT CJK FALLBACK FONT MODAL -->
<ImportFontModal
	bind:open={importCjkModalOpen}
	targetScriptType="cjk"
	on:imported={(e) => {
		$settings.typesetCjkFont = e.detail.font.name;
	}}
/>

<!-- SYSTEM DIALOGUE FONT BROWSER MODAL -->
<SystemFontBrowserModal
	bind:open={systemDialogueModalOpen}
	targetScriptType="dialogue"
	lockScriptType={true}
	on:enabled={(e) => {
		setTypesetFont(e.detail.family);
	}}
/>

<!-- SYSTEM CJK FONT BROWSER MODAL -->
<SystemFontBrowserModal
	bind:open={systemCjkModalOpen}
	targetScriptType="cjk"
	lockScriptType={true}
	on:enabled={(e) => {
		$settings.typesetCjkFont = e.detail.family;
	}}
/>

<!-- CONFIRM FONT DELETION DIALOG -->
<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete Custom Font"
	message={`Are you sure you want to delete the font "${fontToDelete?.name}"? This action cannot be undone.`}
	confirmLabel="Delete Font"
	variant="danger"
	loading={isDeletingFont}
	on:confirm={handleDeleteFont}
	on:cancel={() => (fontToDelete = null)}
/>

