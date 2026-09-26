<!-- GENERAL & APPEARANCE TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { settings, DEFAULTS, APP_FONTS, type Theme, type AppFont } from '$lib/stores/settings';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Globe from 'lucide-svelte/icons/globe';
	import Type from 'lucide-svelte/icons/type';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	// IMPORTED COMPONENTS
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- CONSTANTS -- //

	const THEMES: { id: Theme; label: string; dot: string }[] = [
		{ id: 'auto', label: 'Auto', dot: 'border-slate-400 bg-gradient-to-r from-[#fbfaf7] via-slate-400 to-[#13100c]' },
		{ id: 'light', label: 'Light', dot: 'border-slate-300 bg-[#fbfaf7]' },
		{ id: 'sepia', label: 'Sepia', dot: 'border-[#d4c3a3] bg-[#f4ecd8]' },
		{ id: 'dark', label: 'Dark', dot: 'border-neutral-700 bg-[#13100c]' },
	];

	// -- FUNCTIONS -- //

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
</script>

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
