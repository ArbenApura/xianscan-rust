<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import {
		settings,
		AVAILABLE_TYPESET_FONTS,
		AVAILABLE_CJK_FONTS,
		SFX_AREA_PRESETS,
		type TypesetOutline,
		type TypesetContrast,
		type TypesetCasing,
	} from '$lib/stores/settings';
	// IMPORTED ICONS
	import Type from 'lucide-svelte/icons/type';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Volume2 from 'lucide-svelte/icons/volume-2';
	import Check from 'lucide-svelte/icons/check';
	import Sliders from 'lucide-svelte/icons/sliders';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Contrast from 'lucide-svelte/icons/contrast';
	import Compass from 'lucide-svelte/icons/compass';
	import Palette from 'lucide-svelte/icons/palette';
	import Languages from 'lucide-svelte/icons/languages';
	import Edit3 from 'lucide-svelte/icons/edit-3';
	import Info from 'lucide-svelte/icons/info';

	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// -- PROPS & EVENTS -- //
	export let open = false;

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
	let previewSimulatedAngle = 8; // degrees
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

	// -- CONTRAST PRESETS -- //
	const CONTRAST_PRESETS: { id: TypesetContrast; label: string; desc: string }[] = [
		{ id: 'auto', label: 'Auto Contrast', desc: 'Luminance sensing chooses black or white fill' },
		{ id: 'dark', label: 'Always Dark', desc: 'Black text with white stroke border' },
		{ id: 'light', label: 'Always Light', desc: 'White text with black stroke border' },
	];

	// -- CASING PRESETS -- //
	const CASING_PRESETS: { id: TypesetCasing; label: string; sample: string; desc: string }[] = [
		{ id: 'uppercase', label: 'UPPERCASE', sample: 'HOLD ON! WHAT IS THIS...', desc: 'Standard comic scanlation format' },
		{ id: 'original', label: 'Normal / As Is', sample: 'Hold on! What is this...', desc: 'Keep translated sentence capitalization' },
		{ id: 'lowercase', label: 'lowercase', sample: 'hold on! what is this...', desc: 'All lower case letterform' },
	];

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

	function toggleSfx() {
		settings.update((s) => {
			const next = !s.enableSfx;
			toast.success(`Sound effects (SFX) translation ${next ? 'enabled' : 'disabled'}`);
			return { ...s, enableSfx: next };
		});
	}

	function setSfxMaxArea(val: number) {
		settings.update((s) => ({ ...s, sfxMaxAreaPct: val }));
		const label = SFX_AREA_PRESETS.find((p) => Math.abs(p.value - val) < 0.005)?.label || `${Math.round(val * 100)}%`;
		toast.success(`SFX max area threshold set to ${label}`);
	}

	// -- INPAINT EXPANSION PRESETS -- //
	const INPAINT_EXPANSION_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.0, label: '0%', sub: 'Exact text bound' },
		{ value: 0.03, label: '3%', sub: 'Minimal margin · Default' },
		{ value: 0.06, label: '6%', sub: 'Standard cleaning' },
		{ value: 0.09, label: '9%', sub: 'Broad inpaint mask' },
		{ value: 0.12, label: '12%', sub: 'Maximum font halo erase' },
	];

	// -- TYPESET EXPANSION PRESETS -- //
	const TYPESET_EXPANSION_PRESETS: { value: number; label: string; sub: string }[] = [
		{ value: 0.0, label: '0%', sub: 'Exact text bound' },
		{ value: 0.03, label: '3%', sub: 'Minimal wrap margin' },
		{ value: 0.06, label: '6%', sub: 'Compact wrap margin · Default' },
		{ value: 0.09, label: '9%', sub: 'Broad wrap margin' },
		{ value: 0.12, label: '12%', sub: 'Balanced wrap' },
	];

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

	function resetTypesetDefaults() {
		settings.update((s) => ({
			...s,
			typesetFont: 'CC Wild Words',
			typesetCjkFont: 'Friendly Sans',
			typesetPadding: 0.05,
			typesetOutline: 'standard',
			typesetContrast: 'auto',
			typesetCasing: 'uppercase',
			typesetAllCaps: true,
			enableTextRotation: true,
			enableSfx: false,
			sfxMaxAreaPct: 0.30,
			inpaintExpansionPct: 0.03,
			typesetExpansionPct: 0.06,
		}));
		selectedPresetId = 'en';
		previewSampleText = SAMPLE_TEXT_PRESETS[0].text;
		isCustomTextMode = false;
		toast.success('Typesetting settings reset to defaults');
	}

	// Computed preview styles
	$: selectedFont = AVAILABLE_TYPESET_FONTS.find((f) => f.id === $settings.typesetFont);
	$: isTextCjk = CJK_REGEX.test(previewSampleText);
	$: isCasingApplicable = !isTextCjk && !selectedFont?.allCapsOnly && $settings.typesetFont !== 'CC Wild Words';
	$: previewFontFamily = isTextCjk
		? `"${$settings.typesetCjkFont || 'Friendly Sans'}", "Yu Gothic", "Microsoft YaHei", sans-serif`
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
</script>

<Modal {open} title="Typesetting & Lettering Studio" size="lg" placement="top" on:close={() => (open = false)}>
	<div class="flex flex-col gap-5 sm:gap-6">
		<!-- 1. INTERACTIVE LIVE SPEECH BUBBLE PREVIEW -->
		<div class="rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
					<Sparkles size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
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
				<div class="text-[11px] font-semibold opacity-75 pl-0.5">Latin / English Dialogue Font</div>
				<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
					{#each AVAILABLE_TYPESET_FONTS as font}
						{@const isSelected = ($settings.typesetFont || 'CC Wild Words') === font.id}
						<button
							type="button"
							on:click={() => setTypesetFont(font.id)}
							class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
							}`}
							use:ripple
						>
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold pl-1.5" style="font-family: {font.stack};">{font.label}</span>
								{#if isSelected}
									<Check size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
								{/if}
							</div>
							<div class="mt-1 flex items-center justify-between gap-1">
								<span class="text-[10px] opacity-60 leading-tight truncate pl-1.5">{font.sub}</span>
								{#if font.allCapsOnly}
									<span class="rounded bg-black/5 dark:bg-white/10 px-1 py-0.2 text-[8px] font-bold opacity-70 shrink-0">ALL-CAPS</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- CJK FALLBACK STACK -->
			<div class="space-y-1.5 pt-1">
				<div class="text-[11px] font-semibold opacity-75 pl-0.5">CJK / East Asian Fallback Engine</div>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{#each AVAILABLE_CJK_FONTS as cjk}
						{@const isSelected = ($settings.typesetCjkFont || 'Friendly Sans') === cjk.id}
						<button
							type="button"
							on:click={() => setTypesetCjkFont(cjk.id)}
							class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
							}`}
							use:ripple
						>
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold truncate pl-1.5">{cjk.label}</span>
								{#if isSelected}
									<Check size={12} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
								{/if}
							</div>
							<div class="mt-1 text-[9px] opacity-60 truncate pl-1.5">{cjk.sub}</div>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- 3. BUBBLE FITTING & PADDING -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Sliders size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Bubble Fitting & Inset Padding</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5">Edge padding clearance margin between rendered text and bubble boundary</p>
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
							class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
							}`}
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
		</div>

		<!-- 4. CONTRAST & OUTLINE BORDERS -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Palette size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Legibility & Stroke Borders</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5">High-contrast text stroke outlines and background luminance sensing</p>
			</div>

			<!-- CONTRAST MODE -->
			<div class="space-y-1.5">
				<div class="text-[11px] font-semibold opacity-75 pl-0.5">Contrast Strategy</div>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
					{#each CONTRAST_PRESETS as cPreset}
						{@const isSelected = ($settings.typesetContrast || 'auto') === cPreset.id}
						<button
							type="button"
							on:click={() => setContrast(cPreset.id)}
							class={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
							}`}
							use:ripple
						>
							{#if cPreset.id === 'auto'}
								<Contrast size={15} class="shrink-0 mt-0.5" />
							{:else if cPreset.id === 'dark'}
								<Moon size={15} class="shrink-0 mt-0.5" />
							{:else}
								<Sun size={15} class="shrink-0 mt-0.5" />
							{/if}
							<div>
								<div class="text-xs font-bold pl-0.5">{cPreset.label}</div>
								<div class="text-[10px] opacity-60 leading-tight mt-0.5 pl-0.5">{cPreset.desc}</div>
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- STROKE OUTLINE THICKNESS -->
			<div class="space-y-1.5 pt-1">
				<div class="text-[11px] font-semibold opacity-75 pl-0.5">Text Stroke Outline</div>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{#each OUTLINE_PRESETS as oPreset}
						{@const isSelected = ($settings.typesetOutline || 'standard') === oPreset.id}
						<button
							type="button"
							on:click={() => setOutline(oPreset.id)}
							class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
							}`}
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
		</div>

		<!-- 5. ORIENTATION & CASING FORMATTING -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-3.5">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Compass size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Orientation & Formatting</span>
				</div>
			</div>

			<!-- ROTATION TOGGLE -->
			<div class="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-black/[0.01] p-3 dark:border-white/10 dark:bg-white/[0.01]">
				<div>
					<div class="text-xs font-bold pl-0.5">Follow Comic Bubble Tilt Angle</div>
					<p class="text-[10px] opacity-60 mt-0.5 pl-0.5">Rotate rendered text along detected diagonal comic bubbles (±2° to ±45°)</p>
				</div>

				<button
					type="button"
					on:click={toggleTextRotation}
					class={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
						$settings.enableTextRotation ? 'bg-[#b23a2e] dark:bg-[#e08a63]' : 'bg-black/20 dark:bg-white/20'
					}`}
					role="switch"
					aria-checked={$settings.enableTextRotation}
				>
					<span
						class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
							$settings.enableTextRotation ? 'translate-x-5' : 'translate-x-0'
						}`}
					></span>
				</button>
			</div>

			<!-- SOUND EFFECTS (SFX) INPAINTING & TYPESETTING TOGGLE -->
			<div class="rounded-xl border border-black/10 bg-black/[0.01] p-3 dark:border-white/10 dark:bg-white/[0.01] space-y-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<div class="text-xs font-bold pl-0.5 flex items-center gap-1.5">
							<Volume2 size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Sound Effects (SFX) Inpaint & Typeset</span>
						</div>
						<p class="text-[10px] opacity-60 mt-0.5 pl-0.5">
							Inpaint and typeset onomatopoeia. When disabled, original Japanese/Korean/Chinese sound art is kept untouched.
						</p>
					</div>

					<button
						type="button"
						on:click={toggleSfx}
						class={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
							$settings.enableSfx ? 'bg-[#b23a2e] dark:bg-[#e08a63]' : 'bg-black/20 dark:bg-white/20'
						}`}
						role="switch"
						aria-checked={$settings.enableSfx}
					>
						<span
							class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
								$settings.enableSfx ? 'translate-x-5' : 'translate-x-0'
							}`}
						></span>
					</button>
				</div>

				{#if $settings.enableSfx}
					<div class="border-t border-black/10 pt-2.5 dark:border-white/10">
						<div class="flex items-center justify-between mb-1.5">
							<span class="text-[10px] font-bold uppercase tracking-wider opacity-75 pl-0.5">Artwork Preservation Threshold</span>
							<span class="text-[10px] font-mono opacity-60">Skip if &gt; {Math.round($settings.sfxMaxAreaPct * 100)}% page area</span>
						</div>
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
							{#each SFX_AREA_PRESETS as preset}
								<button
									type="button"
									on:click={() => setSfxMaxArea(preset.value)}
									class={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-2 text-center transition-all ${
										Math.abs($settings.sfxMaxAreaPct - preset.value) < 0.005
											? 'border-[#b23a2e] bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] font-bold shadow-xs'
											: 'border-black/10 hover:border-black/20 bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:bg-white/[0.02] opacity-70 hover:opacity-100'
									}`}
									use:ripple
								>
									<span class="text-xs font-bold">{preset.label}</span>
									<span class="text-[9px] opacity-60 truncate max-w-full">{preset.sub.split('·')[0].trim()}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- DIALOGUE CASING 3-WAY SELECTOR (ONLY SHOWN FOR FONTS SUPPORTING MIXED/LOWER CASE) -->
			{#if isCasingApplicable}
				<div class="space-y-1.5 pt-1">
					<div class="text-[11px] font-semibold opacity-75 pl-0.5">Dialogue Letterform Casing</div>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
						{#each CASING_PRESETS as cPreset}
							{@const isSelected = ($settings.typesetCasing || 'uppercase') === cPreset.id}
							<button
								type="button"
								on:click={() => setCasing(cPreset.id)}
								class={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
									isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
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
			{/if}
		</div>

		<!-- 6. THREE-TIER REGION GEOMETRY EXPANSION (ADVANCED FOOTPRINT) -->
		<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-3.5">
			<div>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
					<Sliders size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span class="pl-0.5">Three-Tier Region Geometry Expansion</span>
				</div>
				<p class="text-[11px] opacity-60 pl-0.5 mt-0.5">Controls the inpaint cleaning footprint and target typesetting layout bounds computed from text anchors.</p>
			</div>

			<!-- THREE-TIER VISUAL DIAGRAM CARD -->
			<div class="relative overflow-hidden rounded-xl border border-black/10 bg-neutral-100 dark:border-white/10 dark:bg-neutral-950 p-4 flex flex-col items-center justify-center">
				<!-- TIER 3 TYPESET BOX (SOLID BOLD BORDER + OPAQUE FILL) -->
				<div
					class="w-full max-w-[290px] rounded-lg border-2 border-[#7f1d1d] dark:border-red-500 bg-[#7f1d1d]/20 dark:bg-red-500/20 p-2.5 transition-all flex flex-col items-center text-center shadow-xs"
				>
					<div class="flex items-center justify-between w-full text-[9px] font-bold text-[#7f1d1d] dark:text-red-300 mb-1.5 px-1">
						<span>Tier 3: Typesetting Box</span>
						<span class="font-mono">+{Math.round(($settings.typesetExpansionPct ?? 0.06) * 100)}%</span>
					</div>

					<!-- TIER 2 INPAINT BOX (BLACK/NEUTRAL DASHED BORDER + TRANSLUCENT TINT) -->
					<div
						class="w-[90%] rounded-md border-2 border-dashed border-black/80 dark:border-white/80 bg-black/10 dark:bg-white/10 p-2 transition-all flex flex-col items-center"
					>
						<div class="flex items-center justify-between w-full text-[8.5px] font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5 px-0.5">
							<span>Tier 2: Inpaint Mask</span>
							<span class="font-mono">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
						</div>

						<!-- TIER 1 BASE ANCHOR (WHITE DOTTED BORDER + TRANSPARENT FILL WITH SHADOW) -->
						<div
							class="w-[85%] rounded border-2 border-dotted border-white bg-black/20 dark:bg-black/60 px-2 py-1.5 text-center font-mono text-[9.5px] font-bold text-white shadow-xs"
						>
							Tier 1: Text Anchor (0%)
						</div>
					</div>
				</div>
			</div>

			<!-- TIER 2 INPAINT EXPANSION PRESETS -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<div class="text-[10.5px] font-medium opacity-75 pl-0.5">Tier 2: Inpaint Mask Expansion (Cleaning Margin)</div>
					<span class="text-[10px] font-mono opacity-60">+{Math.round(($settings.inpaintExpansionPct ?? 0.03) * 100)}%</span>
				</div>

				<div class="grid grid-cols-5 gap-1 sm:gap-1.5">
					{#each INPAINT_EXPANSION_PRESETS as preset}
						{@const isSelected = Math.abs(($settings.inpaintExpansionPct ?? 0.03) - preset.value) < 0.005}
						<button
							type="button"
							on:click={() => setInpaintExpansion(preset.value)}
							class={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-0.5 sm:px-1 text-center transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-2 ring-[#b23a2e]/30'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] opacity-75'
							}`}
							use:ripple
						>
							<span class="text-[11px] sm:text-xs">{preset.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- TIER 3 TYPESET EXPANSION PRESETS -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<div class="text-[10.5px] font-medium opacity-75 pl-0.5">Tier 3: Typesetting Layout Expansion (Wrapping Budget)</div>
					<span class="text-[10px] font-mono opacity-60">+{Math.round(($settings.typesetExpansionPct ?? 0.06) * 100)}%</span>
				</div>

				<div class="grid grid-cols-5 gap-1 sm:gap-1.5">
					{#each TYPESET_EXPANSION_PRESETS as preset}
						{@const isSelected = Math.abs(($settings.typesetExpansionPct ?? 0.06) - preset.value) < 0.005}
						<button
							type="button"
							on:click={() => setTypesetExpansion(preset.value)}
							class={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-0.5 sm:px-1 text-center transition-all ${
								isSelected
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] font-bold ring-2 ring-[#b23a2e]/30'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02] opacity-75'
							}`}
							use:ripple
						>
							<span class="text-[11px] sm:text-xs">{preset.label}</span>
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

		<!-- FOOTER ACTIONS -->
		<div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/10">
			<button
				type="button"
				on:click={resetTypesetDefaults}
				class="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition cursor-pointer shrink-0"
				use:ripple
			>
				<RotateCcw size={15} />
				<span>Reset Defaults</span>
			</button>

			<Button variant="primary" size="md" class="w-full sm:w-auto px-6 shrink-0" on:click={() => (open = false)}>
				<span>Done</span>
			</Button>
		</div>
	</div>
</Modal>
