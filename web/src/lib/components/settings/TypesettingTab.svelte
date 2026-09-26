<!-- TYPESETTING & LETTERING TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import {
		settings,
		DEFAULTS,
		customFontsStore,
		systemFontsStore,
		unloadBrowserFontFace,
		getMergedDialogueFonts,
		fontAvailabilityStore,
		effectiveTypeset,
		refreshFontAvailability,
		scriptPreviewFamily,
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
		type CustomFontItem,
	} from '$lib/stores/settings';
	import { dominantScript, SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Type from 'lucide-svelte/icons/type';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Compass from 'lucide-svelte/icons/compass';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	import Monitor from 'lucide-svelte/icons/monitor';
	// IMPORTED COMPONENTS
	import Switch from '$lib/components/ui/Switch.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Select, { type SelectOption } from '$lib/components/ui/Select.svelte';
	import ImportFontModal from '$lib/components/typeset/ImportFontModal.svelte';
	import SystemFontBrowserModal from '$lib/components/typeset/SystemFontBrowserModal.svelte';
	import ScriptFontsSection from '$lib/components/settings/ScriptFontsSection.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

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
		{ id: 'hi', label: 'हिन्दी', lang: 'hi', text: 'रुको! यह कौन-सा साधना स्तर है...?!' },
		{ id: 'th', label: 'ไทย', lang: 'th', text: 'เดี๋ยวก่อน! นี่มันขั้นการฝึกตนอะไรกัน...?!' },
		{ id: 'ru', label: 'Русский', lang: 'ru', text: 'Постой! Что это за уровень культивации...?!' },
		// RIGHT-TO-LEFT LAYOUT IS HANDLED BY FEAT-007; THIS SAMPLE CHECKS THE GLYPHS
		{ id: 'ar', label: 'العربية', lang: 'ar', text: 'انتظر! ما هذا المستوى من التدريب...؟!' },
	];

	let previewDarkBackground = false;
	let previewSimulatedAngle = 8;
	let selectedPresetId = $settings.typesetPreviewPreset || 'en';
	let isCustomTextMode = ($settings.typesetPreviewPreset || 'en') === 'custom';
	let previewSampleText = $settings.typesetPreviewText || SAMPLE_TEXT_PRESETS[0].text;

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

	let importDialogueModalOpen = false;
	let importCjkModalOpen = false;
	// THE SCRIPT SLOT THE SYSTEM-FONT / IMPORT MODALS WERE OPENED FOR (FEAT-006)
	let scriptSlotForModal: ScriptFontSlot | undefined = undefined;
	function openSlotBrowser(slot: ScriptFontSlot): void {
		scriptSlotForModal = slot;
		systemCjkModalOpen = true;
	}
	function openSlotImport(slot: ScriptFontSlot): void {
		scriptSlotForModal = slot;
		importCjkModalOpen = true;
	}
	function assignScriptSlot(slot: ScriptFontSlot, family: string): void {
		settings.update((s) => ({ ...s, typesetScriptFonts: { ...(s.typesetScriptFonts || {}), [slot]: family } }));
	}
	function withoutScriptFont(map: Partial<Record<ScriptFontSlot, string>> | undefined, family: string) {
		return Object.fromEntries(Object.entries(map || {}).filter(([, f]) => f !== family)) as Partial<Record<ScriptFontSlot, string>>;
	}
	let systemDialogueModalOpen = false;
	let systemCjkModalOpen = false;
	let confirmDeleteFontOpen = false;
	let fontToDelete: { id: string; name: string } | null = null;
	let isDeletingFont = false;

	function promptDeleteFont(id: string, name: string): void {
		fontToDelete = { id, name };
		confirmDeleteFontOpen = true;
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
				const deletedName = fontToDelete.name;
				settings.update((s) => ({ ...s, typesetScriptFonts: withoutScriptFont(s.typesetScriptFonts, deletedName) }));
			} else {
				toast.error(data.error || 'Failed to delete font');
			}
		} catch (err: any) {
			toast.error(err.message || 'Failed to delete font');
		} finally {
			isDeletingFont = false;
			confirmDeleteFontOpen = false;
			fontToDelete = null;
		}
	}

	/** A FONT WITHOUT LATIN LETTERS IS STORED AS A SCRIPT FONT, SO IT MUST NOT BECOME THE DIALOGUE FONT. */
	function handleDialogueImported(font: CustomFontItem): void {
		const coversLatin = font.scripts && font.scripts.length > 0 ? font.scripts.includes('latin') : font.scriptType === 'dialogue';
		if (coversLatin && font.scriptType === 'dialogue') {
			$settings.typesetFont = font.name;
			return;
		}
		toast.warning(`"${font.name}" has no Latin letters, so it was not set as the dialogue font. Pick it under Script Fonts instead.`);
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
				typesetScriptFonts: withoutScriptFont(s.typesetScriptFonts, familyName),
			};
		});
		unloadBrowserFontFace(familyName);
		toast.info(`Disabled "${fontLabel || familyName}" from typesetting choices`);
	}

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

	function toggleLivePipelinePreview() {
		settings.update((s) => {
			const next = s.livePipelinePreview === false;
			toast.success(`Live pipeline step previews ${next ? 'enabled' : 'disabled'}`);
			return { ...s, livePipelinePreview: next };
		});
	}

	$: isTypesettingModified =
		($settings.typesetFont || 'CC Wild Words') !== DEFAULTS.typesetFont ||
		normalizeFontWeightSelectValue($settings.typesetFontWeight) !== normalizeFontWeightSelectValue(DEFAULTS.typesetFontWeight) ||
		Boolean($settings.enableTypesetItalic) !== Boolean(DEFAULTS.enableTypesetItalic) ||
		($settings.typesetCjkFont || DEFAULTS.typesetCjkFont) !== DEFAULTS.typesetCjkFont ||
		Object.keys($settings.typesetScriptFonts || {}).length > 0 ||
		Math.abs(($settings.typesetPadding || 0.05) - DEFAULTS.typesetPadding) >= 0.005 ||
		($settings.typesetOutline || 'standard') !== DEFAULTS.typesetOutline ||
		($settings.typesetCasing || 'uppercase') !== DEFAULTS.typesetCasing ||
		Boolean($settings.enableTextRotation) !== Boolean(DEFAULTS.enableTextRotation) ||
		Boolean($settings.enableTypesetCentering ?? true) !== Boolean(DEFAULTS.enableTypesetCentering ?? true) ||
		Boolean($settings.livePipelinePreview !== false) !== Boolean(DEFAULTS.livePipelinePreview !== false) ||
		($settings.typesetPreviewPreset || 'en') !== (DEFAULTS.typesetPreviewPreset || 'en') ||
		($settings.typesetPreviewText || '') !== (DEFAULTS.typesetPreviewText || '');

	function resetTypesetDefaults() {
		settings.update((s) => ({
			...s,
			typesetFont: DEFAULTS.typesetFont,
			typesetFontWeight: DEFAULTS.typesetFontWeight,
			enableTypesetItalic: DEFAULTS.enableTypesetItalic,
			typesetCjkFont: DEFAULTS.typesetCjkFont,
			typesetScriptFonts: {},
			typesetPadding: DEFAULTS.typesetPadding,
			typesetOutline: DEFAULTS.typesetOutline,
			typesetContrast: DEFAULTS.typesetContrast,
			typesetCasing: DEFAULTS.typesetCasing,
			typesetAllCaps: DEFAULTS.typesetAllCaps,
			enableTextRotation: DEFAULTS.enableTextRotation,
			enableTypesetCentering: DEFAULTS.enableTypesetCentering,
			livePipelinePreview: DEFAULTS.livePipelinePreview,
			typesetPreviewPreset: DEFAULTS.typesetPreviewPreset,
			typesetPreviewText: DEFAULTS.typesetPreviewText,
		}));
		selectedPresetId = 'en';
		previewSampleText = SAMPLE_TEXT_PRESETS[0].text;
		isCustomTextMode = false;
		toast.success('Typesetting settings reset to defaults');
	}

	// COMPUTED PREVIEW STYLES
	// THE EFFECTIVE STYLE IS DERIVED, NEVER WRITTEN BACK (FEAT-009 ADR-004): A CUSTOM FONT THAT IS NOT LOADED YET NO
	// LONGER RESETS THE STORED CASING AND WEIGHT TO CC WILD WORDS' ONLY OPTIONS.
	$: dialogueFonts = getMergedDialogueFonts($customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
	$: selectedFont = $effectiveTypeset.font;
	$: supportedWeights = $effectiveTypeset.supportedWeights;
	$: effectiveWeight = $effectiveTypeset.weight;

	// DIALOGUE FONT WEIGHT SELECTOR OPTIONS
	$: fontWeightOptions = FONT_WEIGHT_PRESETS.map((p) => {
		const supported = isWeightSupportedByFont(p.numeric, supportedWeights, selectedFont?.isVariable);
		return {
			value: p.value,
			label: p.label,
			hint: supported ? p.hint : 'Not supported by font',
			disabled: !supported,
		};
	}) satisfies SelectOption[];

	$: isFontAllCaps = $effectiveTypeset.isAllCaps;
	$: isFontLowercaseOnly = $effectiveTypeset.isLowercaseOnly;
	$: supportedCasings = $effectiveTypeset.supportedCasings;

	// DIALOGUE LETTERFORM CASING SELECTOR OPTIONS
	$: casingOptions = CASING_PRESETS.map((p) => {
		const supported = isCasingSupportedByFont(p.id, supportedCasings, isFontAllCaps, isFontLowercaseOnly);
		return {
			value: p.id,
			label: p.label,
			hint: supported ? p.desc : 'Not supported by font',
			disabled: !supported,
		};
	}) satisfies SelectOption[];

	// THE PREVIEW USES THE SAME FAMILY THE SERVER WOULD FOR THE SAMPLE'S SCRIPT (BUNDLED FONTS HAVE @font-face RULES)
	$: previewScript = dominantScript(previewSampleText, 'latin');
	$: dialogueStack = selectedFont?.stack || `"${$settings.typesetFont || 'CC Wild Words'}", sans-serif`;
	$: previewScriptFamily = previewScript === 'latin' ? undefined : scriptPreviewFamily(previewScript, $settings.typesetScriptFonts);
	$: previewFontFamily = previewScriptFamily ? `"${previewScriptFamily}", ${dialogueStack}` : dialogueStack;

	// EXACT PREVIEW (ADR-009): THE REAL SKIA RENDER, ON DEMAND ONLY. THE REQUEST CARRIES THE WHOLE EFFECTIVE STYLE, SO
	// A CHANGE MADE JUST BEFORE THE CLICK IS RENDERED EVEN IF THE DEBOUNCED SETTINGS SYNC HAS NOT SAVED IT YET.
	let exactPreviewUrl: string | null = null;
	let exactPreviewLoading = false;
	let exactPreviewError = '';
	// BUMPED WHENEVER THE INPUTS CHANGE: A RENDER STARTED FOR OLDER INPUTS IS DROPPED WHEN IT RETURNS
	let exactPreviewSeq = 0;

	function clearExactPreview(..._deps: unknown[]): void {
		exactPreviewSeq++;
		if (exactPreviewUrl) URL.revokeObjectURL(exactPreviewUrl);
		exactPreviewUrl = null;
		exactPreviewError = '';
		exactPreviewLoading = false;
	}

	/** SVELTEKIT error() ANSWERS WITH JSON { message }; ANYTHING ELSE FALLS BACK TO THE RAW TEXT OR THE STATUS. */
	async function readErrorMessage(res: Response): Promise<string> {
		const raw = await res.text().catch(() => '');
		try {
			const body = JSON.parse(raw);
			if (typeof body?.message === 'string' && body.message) return body.message;
			if (typeof body?.error === 'string' && body.error) return body.error;
		} catch {
			// NOT JSON
		}
		return raw.trim() || `Request failed (${res.status})`;
	}

	async function renderExactPreview(): Promise<void> {
		const seq = ++exactPreviewSeq;
		exactPreviewLoading = true;
		exactPreviewError = '';
		try {
			const preset = SAMPLE_TEXT_PRESETS.find((p) => p.id === selectedPresetId);
			const res = await fetch('/api/typeset/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					// THE RAW SAMPLE: THE SERVER APPLIES THE CASING ITSELF (AND SKIPS IT FOR CASELESS SCRIPTS)
					text: previewSampleText,
					targetLang: preset?.lang,
					options: exactPreviewOptions,
				}),
			});
			if (!res.ok) throw new Error(await readErrorMessage(res));
			const blob = await res.blob();
			if (seq !== exactPreviewSeq) return;
			if (exactPreviewUrl) URL.revokeObjectURL(exactPreviewUrl);
			exactPreviewUrl = URL.createObjectURL(blob);
		} catch (err: any) {
			if (seq !== exactPreviewSeq) return;
			exactPreviewError = err?.message || String(err);
			toast.error(`Exact preview failed: ${exactPreviewError}`);
		} finally {
			if (seq === exactPreviewSeq) exactPreviewLoading = false;
		}
	}
	$: previewIsDarkBubble = previewDarkBackground;
	$: previewTextColor = previewIsDarkBubble ? '#ffffff' : '#111111';
	$: previewStrokeColor = previewIsDarkBubble ? '#000000' : '#ffffff';
	$: previewStrokeWidth = $settings.typesetOutline === 'none' ? '0px' : $settings.typesetOutline === 'thin' ? '1px' : $settings.typesetOutline === 'heavy' ? '3px' : '2px';
	// THE PREVIEW SHOWS WHAT WILL BE SENT: THE EFFECTIVE WEIGHT AND CASING
	$: previewFontWeight = normalizeFontWeightNumeric($effectiveTypeset.weight);
	$: previewFontStyle = $settings.enableTypesetItalic ? 'italic' : 'normal';
	$: previewEffectiveText =
		$effectiveTypeset.casing === 'uppercase'
			? previewSampleText.toUpperCase()
			: $effectiveTypeset.casing === 'lowercase'
				? previewSampleText.toLowerCase()
				: previewSampleText;
	$: previewTransformRotation = $settings.enableTextRotation ? `rotate(${previewSimulatedAngle}deg)` : 'none';
	$: previewInsetPadding = `${Math.max(8, Math.round(120 * ($settings.typesetPadding || 0.05)))}px`;
	$: previewFontSizePx = '14px';

	// EVERYTHING THE EXACT RENDER DEPENDS ON, IN THE PREVIEW ROUTE'S OPTION SCHEMA
	$: exactPreviewOptions = {
		fontDialogue: $settings.typesetFont || DEFAULTS.typesetFont,
		scriptFonts: $settings.typesetScriptFonts || {},
		casing: $effectiveTypeset.casing,
		fontWeight: $effectiveTypeset.weight,
		fontStyle: ($settings.enableTypesetItalic ? 'italic' : 'normal') as 'italic' | 'normal',
		outlineMode: $settings.typesetOutline || DEFAULTS.typesetOutline,
		colorMode: $settings.typesetContrast || DEFAULTS.typesetContrast,
		boxInset: Math.min(0.2, Math.max(0.01, $settings.typesetPadding || DEFAULTS.typesetPadding)),
		enableRotation: Boolean($settings.enableTextRotation),
	};
	// A PRIMITIVE KEY, SO AN UNRELATED SETTINGS CHANGE DOES NOT CLEAR THE RENDERED IMAGE
	$: exactPreviewKey = JSON.stringify([previewSampleText, selectedPresetId, isCustomTextMode, exactPreviewOptions]);
	$: clearExactPreview(exactPreviewKey);

	// -- LIFECYCLES -- //

	onDestroy(() => {
		exactPreviewSeq++;
		if (exactPreviewUrl) URL.revokeObjectURL(exactPreviewUrl);
	});
</script>

<div class="space-y-5">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-bold">Typesetting & Lettering Studio</h2>
			<p class="text-xs opacity-60 mt-0.5">Dialogue and script fonts, stroke, padding, and live bubble preview</p>
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
			<div class="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white backdrop-blur-xs">
				<Compass size={10} />
				<span>{$settings.enableTextRotation ? `Tilt Angle: +${previewSimulatedAngle}°` : 'Horizontal (0°)'}</span>
			</div>
		</div>
		<div class="flex items-center justify-between gap-2">
			<p class="text-[11px] opacity-60">
				{previewScript === 'latin' ? 'Browser preview.' : `Browser preview (${SCRIPT_LABELS[previewScript]}).`} The exact render uses the same engine as your pages.
			</p>
			<button
				type="button"
				on:click={renderExactPreview}
				disabled={exactPreviewLoading}
				class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-[11px] font-semibold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
				data-testid="render-exact-preview"
				use:ripple
			>
				{exactPreviewLoading ? 'Rendering...' : 'Render exact preview'}
			</button>
		</div>
		{#if exactPreviewError}
			<p class="text-[11px] font-semibold text-red-700 dark:text-red-300" role="alert" data-testid="exact-preview-error">
				Exact preview failed: {exactPreviewError}
			</p>
		{/if}
		{#if exactPreviewUrl}
			<img src={exactPreviewUrl} alt="Exact typeset preview" class="w-full rounded-xl border border-black/10 dark:border-white/10" />
		{/if}
	</div>

	<!-- LIVE PIPELINE STEP PREVIEWS -->
	<div
		id="setting-live-pipeline-preview"
		class={cn(
			'flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300',
			highlightedSettingId === 'live-pipeline-preview' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]',
		)}
	>
		<div>
			<div class="text-xs font-bold">Live Pipeline Step Previews</div>
			<div class="text-[10px] opacity-60 mt-0.5">Stream live visual updates through OCR annotations, inpainting, and typesetting</div>
		</div>
		<Switch
			checked={$settings.livePipelinePreview !== false}
			on:click={toggleLivePipelinePreview}
			ariaLabel="Live Pipeline Step Previews"
		/>
	</div>

	<!-- LATIN DIALOGUE FONT -->
	<div
		id="setting-typeset-font"
		class={cn(
			'border-t border-black/10 pt-4 dark:border-white/10 space-y-2 transition-all duration-300',
			highlightedSettingId === 'typeset-font' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1',
		)}
	>
		<div class="flex items-center justify-between gap-2">
			<div class="text-xs font-bold uppercase tracking-wider opacity-80 truncate min-w-0">
				<span class="hidden sm:inline">Latin / English Dialogue Font</span>
				<span class="sm:hidden">Dialogue Font</span>
			</div>
			<div class="flex items-center gap-1 shrink-0">
				<button
					type="button"
					on:click={() => (systemDialogueModalOpen = true)}
					class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5 transition cursor-pointer whitespace-nowrap shrink-0"
					use:ripple
					title="Browse and enable fonts installed on your operating system"
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
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
						<span class="text-[10px] opacity-60 truncate pl-1.5">{!isAvailable ? 'Not Installed on Server' : font.sub}</span>
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
		<div
			id="setting-typeset-weight"
			class={cn(
				'space-y-1.5 transition-all duration-300',
				highlightedSettingId === 'typeset-weight' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1',
			)}
		>
			<div class="text-xs font-bold uppercase tracking-wider opacity-80">
				Dialogue Font Weight
			</div>
			<Select
				items={fontWeightOptions}
				value={effectiveWeight}
				on:change={(e) => setTypesetFontWeight(e.detail)}
			/>
		</div>

		<!-- DIALOGUE LETTERFORM CASING -->
		<div
			id="setting-typeset-casing"
			class={cn(
				'space-y-1.5 transition-all duration-300',
				highlightedSettingId === 'typeset-casing' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1',
			)}
		>
			<div class="text-xs font-bold uppercase tracking-wider opacity-80">
				Dialogue Letterform Casing
			</div>
			<Select
				items={casingOptions}
				value={$effectiveTypeset.casing}
				on:change={(e) => setCasing(e.detail)}
			/>
		</div>
	</div>

	<!-- SCRIPT FONTS (FEAT-006): ONE CHOICE PER WRITING SYSTEM, WITH COVERAGE CHECKS -->
	<ScriptFontsSection
		highlighted={highlightedSettingId === 'typeset-cjk'}
		on:browse={(e) => openSlotBrowser(e.detail.slot)}
		on:import={(e) => openSlotImport(e.detail.slot)}
		on:deleteFont={(e) => promptDeleteFont(e.detail.id, e.detail.name)}
		on:disableFont={(e) => disableSystemFont(e.detail.family)}
	/>

	<!-- TEXT STROKE OUTLINE -->
	<div
		id="setting-typeset-outline"
		class={cn(
			'border-t border-black/10 pt-4 dark:border-white/10 space-y-1.5 transition-all duration-300',
			highlightedSettingId === 'typeset-outline' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2',
		)}
	>
		<div class="text-xs font-bold uppercase tracking-wider opacity-80">Text Stroke Outline</div>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
			{#each OUTLINE_PRESETS as oPreset}
				{@const isSelected = ($settings.typesetOutline || 'standard') === oPreset.id}
				<button
					type="button"
					on:click={() => setOutline(oPreset.id)}
					class={cn(
						'rounded-lg border p-2 text-left transition-all cursor-pointer',
						isSelected
							? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
							: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]',
					)}
					use:ripple
				>
					<div class="text-xs font-bold">{oPreset.label}</div>
					<div class="text-[9px] opacity-60 truncate">{oPreset.desc}</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- BUBBLE GEOMETRY, INSET PADDING & ORIENTATION -->
	<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
		<div
			id="setting-typeset-padding"
			class={cn(
				'space-y-1.5 transition-all duration-300',
				highlightedSettingId === 'typeset-padding' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2',
			)}
		>
			<div class="text-xs font-bold uppercase tracking-wider opacity-80">Bubble Inset Padding</div>
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
				{#each PADDING_PRESETS as preset}
					{@const isSelected = Math.abs(($settings.typesetPadding || 0.05) - preset.value) < 0.005}
					<button
						type="button"
						on:click={() => setPadding(preset.value)}
						class={cn(
							'rounded-lg border p-2 text-left transition-all cursor-pointer',
							isSelected
								? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/30'
								: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02]',
						)}
						use:ripple
					>
						<div class="text-xs font-bold">{preset.label}</div>
						<div class="text-[9px] opacity-60 truncate">{preset.sub}</div>
					</button>
				{/each}
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
			<div
				id="setting-typeset-angle"
				class={cn(
					'flex items-start justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300',
					highlightedSettingId === 'typeset-angle' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]',
				)}
			>
				<div class="min-w-0 pr-1">
					<div class="text-xs font-bold">Bubble Tilt Angle</div>
					<div class="text-[10px] opacity-60 mt-0.5 leading-relaxed">Rotate text along detected bubble angle</div>
				</div>
				<Switch
					checked={$settings.enableTextRotation}
					on:click={toggleTextRotation}
					ariaLabel="Bubble Tilt Angle"
				/>
			</div>

			<div
				id="setting-typeset-centering"
				class={cn(
					'flex items-start justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300',
					highlightedSettingId === 'typeset-centering' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]',
				)}
			>
				<div class="min-w-0 pr-1">
					<div class="text-xs font-bold">Bubble Centering & Expansion</div>
					<div class="text-[10px] opacity-60 mt-0.5 leading-relaxed">Anchor translated text to bubble centers and expand typesetting into available space</div>
				</div>
				<Switch
					checked={$settings.enableTypesetCentering ?? true}
					on:click={toggleTypesetCentering}
					ariaLabel="Bubble Centering & Expansion"
				/>
			</div>
		</div>
	</div>
</div>

<!-- THE TAB'S DIALOGS NOW RENDER INSIDE THE SETTINGS PANE; display:contents KEEPS THEM OUT OF THE PANE'S space-y MARGINS -->
<div class="contents">
	<!-- IMPORT DIALOGUE FONT MODAL -->
	<ImportFontModal
		bind:open={importDialogueModalOpen}
		targetScriptType="dialogue"
		on:imported={(e) => handleDialogueImported(e.detail.font)}
	/>

	<!-- IMPORT CJK FALLBACK FONT MODAL -->
	<ImportFontModal
		bind:open={importCjkModalOpen}
		targetScriptType="cjk"
		targetSlot={scriptSlotForModal}
		on:imported={(e) => {
			if (scriptSlotForModal) assignScriptSlot(scriptSlotForModal, e.detail.font.name);
			else $settings.typesetCjkFont = e.detail.font.name;
		}}
	/>

	<!-- SYSTEM DIALOGUE FONT BROWSER MODAL -->
	<SystemFontBrowserModal
		bind:open={systemDialogueModalOpen}
		targetScriptType="dialogue"
		lockScriptType={true}
		on:enabled={(e) => {
			$settings.typesetFont = e.detail.family;
		}}
	/>

	<!-- SYSTEM CJK FONT BROWSER MODAL -->
	<SystemFontBrowserModal
		bind:open={systemCjkModalOpen}
		targetScriptType="cjk"
		targetSlot={scriptSlotForModal}
		lockScriptType={true}
		on:enabled={(e) => {
			// WITH A SLOT, THE BROWSER ALREADY ASSIGNED IT; OTHERWISE KEEP THE LEGACY CJK SETTING
			if (!scriptSlotForModal) $settings.typesetCjkFont = e.detail.family;
		}}
	/>

	<!-- CONFIRM FONT DELETION DIALOG -->
	<ConfirmDialog
		bind:open={confirmDeleteFontOpen}
		title="Delete Custom Font"
		message={`Are you sure you want to delete the font "${fontToDelete?.name}"? This action cannot be undone.`}
		confirmLabel="Delete Font"
		variant="danger"
		loading={isDeletingFont}
		on:confirm={handleDeleteFont}
		on:cancel={() => (fontToDelete = null)}
	/>
</div>
