<!-- TYPESETTING & LETTERING TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import {
		settings,
		DEFAULTS,
		customFontsStore,
		systemFontsStore,
		getMergedDialogueFonts,
		fontAvailabilityStore,
		effectiveTypeset,
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
	} from '$lib/stores/settings';
	import { dominantScript, SCRIPT_LABELS } from '$lib/typeset-scripts';
	import { plainDiacritics } from '$lib/diacritics';
	// IMPORTED DEP-COMPONENTS
	import Type from 'lucide-svelte/icons/type';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Compass from 'lucide-svelte/icons/compass';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	// IMPORTED COMPONENTS
	import Switch from '$lib/components/ui/Switch.svelte';
	import Select, { type SelectOption } from '$lib/components/ui/Select.svelte';
	import FontRolesTable from '$lib/components/settings/FontRolesTable.svelte';

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

	// ACCENT SAMPLE PER PRESET (FEAT-010): A SKILL CALLOUT SHOWN UNDER THE BUBBLE ONCE AN ACCENT FONT IS SET
	const ACCENT_SAMPLES: Record<string, string> = {
		en: 'Green Wood Sword Art',
		'zh-hans': '青木剑诀',
		'zh-hant': '青木劍訣',
		ja: '奥義・青木剣',
		ko: '청목검법',
		hi: 'हरित वन खड्ग कला',
		th: 'วิชากระบี่ไม้เขียว',
		ru: 'Техника Меча Зелёного Леса',
		ar: 'فن سيف الخشب الأخضر',
	};

	let previewDarkBackground = false;
	let previewSimulatedAngle = 8;
	let selectedPresetId = $settings.typesetPreviewPreset || 'en';
	let isCustomTextMode = ($settings.typesetPreviewPreset || 'en') === 'custom';
	let previewSampleText = $settings.typesetPreviewText || SAMPLE_TEXT_PRESETS[0].text;
	let previewMode: 'dialogue' | 'accent' = 'dialogue';
	// CUSTOM ACCENT CALLOUT; EMPTY UNTIL THE USER TYPES ONE (THE LANGUAGE SAMPLE IS SHOWN MEANWHILE)
	let accentCustomText = '';

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

	function onCustomAccentChange(val: string) {
		accentCustomText = val;
	}

	function setPreviewMode(mode: 'dialogue' | 'accent') {
		previewMode = mode;
	}

	function enableCustomTextMode() {
		// START THE CUSTOM ACCENT FROM THE SAMPLE ON SCREEN, SO THE CALLOUT DOES NOT JUMP
		if (!accentCustomText) accentCustomText = ACCENT_SAMPLES[selectedPresetId] ?? ACCENT_SAMPLES.en;
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

	// PREVIEW SUBJECT: A DIALOGUE BUBBLE OR AN ACCENT CALLOUT (SKILL NAMES, ATTACKS, TITLE CARDS)
	const PREVIEW_MODES: { id: 'dialogue' | 'accent'; label: string }[] = [
		{ id: 'dialogue', label: 'Dialogue' },
		{ id: 'accent', label: 'Accent' },
	];

	const PADDING_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.02, label: 'Tight (2%)', sub: 'Maximal bubble fill' },
		{ value: 0.05, label: 'Balanced (5%)', sub: 'Standard edge clearance' },
		{ value: 0.08, label: 'Spacious (8%)', sub: 'Generous breathing room' },
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

	/**
	 * THE LATIN LETTERS `family` HAS NO GLYPH FOR, FROM THE COVERAGE ROUTE (FEAT-011), SO THE BROWSER PREVIEW DRAWS THEM
	 * PLAIN (É -> E) AS THE RENDERER DOES. CACHED PER FAMILY; AN EMPTY SET WHILE LOADING OR ON FAILURE.
	 */
	async function loadMissingLatin(family: string): Promise<void> {
		if (!family || missingLatin[family]) return;
		missingLatin = { ...missingLatin, [family]: new Set() };
		try {
			const res = await fetch(`/api/system/fonts/coverage?accentFonts=${encodeURIComponent(JSON.stringify({ latin: family }))}`);
			if (!res.ok) return;
			const body = await res.json();
			const entry = (body?.accent ?? []).find((a: { script?: string }) => a?.script === 'latin');
			if (Array.isArray(entry?.missing)) missingLatin = { ...missingLatin, [family]: new Set(entry.missing as string[]) };
		} catch {
			// NO COVERAGE: THE PREVIEW KEEPS EVERY LETTER
		}
	}

	/** CASED PREVIEW TEXT WITH THE LETTERS `family` LACKS DRAWN PLAIN, LIKE plainForFont ON THE SERVER. */
	function plainForPreview(text: string, family: string, missing: Record<string, Set<string>>): string {
		const set = missing[family];
		return set && set.size > 0 ? plainDiacritics(text, (codePoint) => !set.has(String.fromCodePoint(codePoint))) : text;
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
		($settings.typesetCjkFont || DEFAULTS.typesetCjkFont) !== DEFAULTS.typesetCjkFont ||
		Object.keys($settings.typesetScriptFonts || {}).length > 0 ||
		JSON.stringify($settings.typesetAccentFonts || {}) !== JSON.stringify(DEFAULTS.typesetAccentFonts) ||
		($settings.typesetAccentCasing || 'uppercase') !== DEFAULTS.typesetAccentCasing ||
		normalizeFontWeightSelectValue($settings.typesetAccentFontWeight) !== normalizeFontWeightSelectValue(DEFAULTS.typesetAccentFontWeight) ||
		Boolean($settings.typesetAccentInBubbles) !== Boolean(DEFAULTS.typesetAccentInBubbles) ||
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
			typesetScriptFonts: {},
			typesetAccentFonts: { ...DEFAULTS.typesetAccentFonts },
			typesetAccentCasing: DEFAULTS.typesetAccentCasing,
			typesetAccentFontWeight: DEFAULTS.typesetAccentFontWeight,
			typesetAccentInBubbles: DEFAULTS.typesetAccentInBubbles,
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
	$: previewScript = dominantScript(previewMode === 'accent' ? accentSampleText : previewSampleText, 'latin');
	$: dialogueStack = selectedFont?.stack || `"${$settings.typesetFont || 'CC Wild Words'}", sans-serif`;
	$: previewScriptFamily = previewScript === 'latin' ? undefined : scriptPreviewFamily(previewScript, $settings.typesetScriptFonts);
	$: previewFontFamily = previewScriptFamily ? `"${previewScriptFamily}", ${dialogueStack}` : dialogueStack;

	$: previewIsDarkBubble = previewDarkBackground;
	$: previewTextColor = previewIsDarkBubble ? '#ffffff' : '#111111';
	$: previewStrokeColor = previewIsDarkBubble ? '#000000' : '#ffffff';
	$: previewStrokeWidth = $settings.typesetOutline === 'none' ? '0px' : $settings.typesetOutline === 'thin' ? '1px' : $settings.typesetOutline === 'heavy' ? '3px' : '2px';
	// THE PREVIEW SHOWS WHAT WILL BE SENT: THE EFFECTIVE WEIGHT AND CASING
	$: previewFontWeight = normalizeFontWeightNumeric($effectiveTypeset.weight);
	$: previewFontStyle = $settings.enableTypesetItalic ? 'italic' : 'normal';
	// LETTERS WITH DIACRITICS THE FONT LACKS ARE DRAWN PLAIN (FEAT-011), AFTER CASING AS ON THE SERVER
	let missingLatin: Record<string, Set<string>> = {};
	$: previewDialogueFamily = $settings.typesetFont || DEFAULTS.typesetFont;
	$: loadMissingLatin(previewDialogueFamily);
	$: previewCasedText =
		$effectiveTypeset.casing === 'uppercase'
			? previewSampleText.toUpperCase()
			: $effectiveTypeset.casing === 'lowercase'
				? previewSampleText.toLowerCase()
				: previewSampleText;
	$: previewEffectiveText = plainForPreview(previewCasedText, previewDialogueFamily, missingLatin);
	$: previewTransformRotation = $settings.enableTextRotation ? `rotate(${previewSimulatedAngle}deg)` : 'none';
	$: previewInsetPadding = `${Math.max(8, Math.round(120 * ($settings.typesetPadding || 0.05)))}px`;
	$: previewFontSizePx = '14px';

	// ACCENT PREVIEW (FEAT-010): THE CALLOUT USES THE ACCENT FONT FOR THE SAMPLE'S SCRIPT, THE ACCENT CASING AND WEIGHT
	$: accentFonts = $settings.typesetAccentFonts || {};
	$: accentSampleText = isCustomTextMode
		? accentCustomText.trim() || ACCENT_SAMPLES.en
		: (ACCENT_SAMPLES[selectedPresetId] ?? ACCENT_SAMPLES.en);
	$: accentPreviewScript = dominantScript(accentSampleText, 'latin');
	// KANJI IN THE JAPANESE SAMPLE USE THE kana SLOT, AS THE RENDERER DOES FOR A JAPANESE BOOK
	$: accentPreviewFamily = (selectedPresetId === 'ja' && accentPreviewScript === 'han' ? accentFonts.kana : undefined) ?? accentFonts[accentPreviewScript];
	$: accentPreviewFontFamily = accentPreviewFamily ? `"${accentPreviewFamily}", ${previewFontFamily}` : previewFontFamily;
	$: accentCasedText = accentPreviewScript !== 'latin' && accentPreviewScript !== 'cyrillic' && accentPreviewScript !== 'greek'
		? accentSampleText
		: ($settings.typesetAccentCasing || 'uppercase') === 'uppercase'
			? accentSampleText.toUpperCase()
			: ($settings.typesetAccentCasing || 'uppercase') === 'lowercase'
				? accentSampleText.toLowerCase()
				: accentSampleText;
	$: accentDrawnFamily = accentPreviewFamily ?? previewDialogueFamily;
	$: loadMissingLatin(accentDrawnFamily);
	$: accentPreviewCased = plainForPreview(accentCasedText, accentDrawnFamily, missingLatin);
	// NO ACCENT FONT FOR THIS SCRIPT: THE DIALOGUE FONT WITH A HEAVIER OUTLINE, AS THE RENDERER DOES (ADR-009)
	$: accentPreviewStroke = accentPreviewFamily ? previewStrokeWidth : previewStrokeWidth === '0px' ? '1px' : previewStrokeWidth === '1px' ? '2px' : '3px';
	$: previewLetterStroke = previewMode === 'accent' ? accentPreviewStroke : previewStrokeWidth;

</script>

<div class="space-y-5">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-bold">Typesetting & Lettering Studio</h2>
			<p class="text-xs opacity-60 mt-0.5">Dialogue and accent fonts per script, stroke, padding, and live bubble preview</p>
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
			<div class="flex items-center gap-1.5">
				<!-- DIALOGUE / ACCENT: WHICH LETTERING THE PREVIEW SHOWS -->
				<div
					class="inline-flex items-center rounded-lg border border-black/10 bg-white p-0.5 shadow-2xs dark:border-white/10 dark:bg-neutral-800"
					role="tablist"
					aria-label="Preview lettering"
				>
					{#each PREVIEW_MODES as mode}
						{@const isActive = previewMode === mode.id}
						<button
							type="button"
							role="tab"
							aria-selected={isActive}
							on:click={() => setPreviewMode(mode.id)}
							class={cn(
								'rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer',
								isActive
									? 'bg-[#b23a2e] text-white dark:bg-[#e08a63] dark:text-neutral-950'
									: 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10',
							)}
							data-testid={`preview-mode-${mode.id}`}
							use:ripple
						>
							{mode.label}
						</button>
					{/each}
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

		{#if isCustomTextMode && previewMode === 'accent'}
			<input
				type="text"
				value={accentCustomText}
				on:input={(e) => onCustomAccentChange(e.currentTarget.value)}
				placeholder="Type a skill name, attack or title card..."
				maxlength="200"
				aria-label="Custom accent text"
				class="h-[36px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-xs outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
			/>
		{:else if isCustomTextMode}
			<input
				type="text"
				value={previewSampleText}
				on:input={(e) => onCustomTextChange(e.currentTarget.value)}
				placeholder="Type preview dialogue..."
				aria-label="Custom dialogue text"
				class="h-[36px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-xs outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.08]"
			/>
		{/if}

		<!-- SIMULATED MANGA ARTWORK CANVAS -->
		<div
			class={`relative flex min-h-[150px] flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border p-6 transition-colors duration-200 ${
				previewDarkBackground ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-[#faf7f2] border-neutral-300/80 text-neutral-900'
			}`}
		>
			<div class="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#888_1px,transparent_1px)] [background-size:12px_12px]"></div>
			<!-- ONE BUBBLE FOR BOTH: THE MODE ONLY SWAPS THE LETTERING (FONT, WEIGHT, CASING, OUTLINE); RUNTIME VALUES (EXCEPTION (b)) -->
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
					data-testid={previewMode === 'accent' ? 'accent-preview' : 'dialogue-preview'}
					style="
						font-family: {previewMode === 'accent' ? accentPreviewFontFamily : previewFontFamily};
						font-weight: {previewMode === 'accent' ? normalizeFontWeightNumeric($settings.typesetAccentFontWeight) : previewFontWeight};
						font-style: {previewMode === 'accent' ? 'normal' : previewFontStyle};
						font-size: {previewFontSizePx};
						color: {previewTextColor};
						paint-order: stroke fill;
						-webkit-text-stroke: {previewLetterStroke} {previewStrokeColor};
						text-shadow: {previewLetterStroke !== '0px' ? `0 0 3px ${previewStrokeColor}` : 'none'};
					"
				>
					{previewMode === 'accent' ? accentPreviewCased : previewEffectiveText}
				</div>
			</div>
			<div class="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white backdrop-blur-xs">
				<Compass size={10} />
				<span>{$settings.enableTextRotation ? `Tilt Angle: +${previewSimulatedAngle}°` : 'Horizontal (0°)'}</span>
			</div>
		</div>
		{#if previewMode === 'accent'}
			<p class="text-[11px] opacity-60" data-testid="accent-preview-font">
				{accentPreviewFamily
					? `Accent font: ${accentPreviewFamily}.`
					: `No accent font for ${SCRIPT_LABELS[accentPreviewScript]}: drawn in the dialogue font with a heavier outline. Choose one in the Fonts table below.`}
			</p>
		{/if}
	</div>

	<!-- FONTS TABLE: DIALOGUE AND ACCENT FONT PER SCRIPT, WITH IMPORT, SYSTEM FONTS AND REMOVAL INLINE (FEAT-010) -->
	<FontRolesTable {highlightedSettingId} on:setDialogueFont={(e) => setTypesetFont(e.detail)} />

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
