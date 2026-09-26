<!-- SCRIPT FONTS - ONE FONT CHOICE PER WRITING SYSTEM, WITH LIVE COVERAGE CHECKS (FEAT-006 PHASE 9) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, onMount } from 'svelte';
	import { browser } from '$app/environment';
	// IMPORTED MODULES
	import {
		settings,
		customFontsStore,
		systemFontsStore,
		getMergedScriptFonts,
	} from '$lib/stores/settings';
	import { scriptOfLanguage } from '$lib/languages';
	import { SCRIPT_FONT_SLOTS, SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import Monitor from 'lucide-svelte/icons/monitor';
	import Plus from 'lucide-svelte/icons/plus';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	// IMPORTED COMPONENTS
	import Select, { type SelectOption } from '$lib/components/ui/Select.svelte';

	// -- TYPES -- //

	interface Coverage {
		script: ScriptFontSlot;
		chain: string[];
		coveringFonts: string[];
		covered: boolean;
		source: 'user' | 'dialogue' | 'bundled' | 'system' | 'none';
	}

	// -- PROPS -- //

	export let highlighted = false;

	// -- CONSTANTS -- //

	const AUTOMATIC = '__automatic__';
	// SHORT DEBOUNCE: THE PENDING SLOTS ARE SENT WITH THE REQUEST, SO THERE IS NO NEED TO WAIT FOR THE SETTINGS SAVE
	const REFRESH_DEBOUNCE_MS = 150;
	const dispatch = createEventDispatcher<{
		browse: { slot: ScriptFontSlot };
		import: { slot: ScriptFontSlot };
		/** DELETE AN IMPORTED FONT (THE PARENT CONFIRMS AND CALLS THE API). */
		deleteFont: { id: string; name: string };
		/** REMOVE AN ENABLED SYSTEM FONT FROM THE TYPESETTING CHOICES. */
		disableFont: { family: string };
	}>();

	// -- STATES -- //

	let coverage: Partial<Record<ScriptFontSlot, Coverage>> = {};
	let showOther = false;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	// ONLY THE NEWEST COVERAGE REQUEST MAY WRITE ITS ANSWER; AN OLDER ONE THAT RETURNS LATE IS DROPPED
	let requestSeq = 0;
	// THE FIRST CHECK RUNS AT ONCE; LATER ONES ARE DEBOUNCED SO A BURST OF CHANGES SENDS ONE REQUEST
	let firstRefresh = true;

	// -- FUNCTIONS -- //

	async function refreshCoverage(): Promise<void> {
		const id = ++requestSeq;
		// ASK ABOUT THE PENDING CHOICE, NOT WHAT THE DEBOUNCED SETTINGS SYNC HAS SAVED SO FAR
		const params = new URLSearchParams({ scriptFonts: JSON.stringify($settings.typesetScriptFonts || {}) });
		if ($settings.typesetFont) params.set('dialogue', $settings.typesetFont);
		try {
			const res = await fetch(`/api/system/fonts/coverage?${params.toString()}`);
			if (!res.ok || id !== requestSeq) return;
			const data = (await res.json()) as { scripts: Coverage[] };
			if (id !== requestSeq) return;
			coverage = Object.fromEntries(data.scripts.map((c) => [c.script, c]));
		} catch {
			// OFFLINE OR OLD SERVER: ROWS SIMPLY SHOW NO COVERAGE LINE
		}
	}

	function scheduleRefresh(..._deps: unknown[]): void {
		if (!browser) return;
		if (refreshTimer) clearTimeout(refreshTimer);
		if (firstRefresh) {
			firstRefresh = false;
			refreshCoverage();
			return;
		}
		refreshTimer = setTimeout(refreshCoverage, REFRESH_DEBOUNCE_MS);
	}

	function setSlot(slot: ScriptFontSlot, value: string): void {
		settings.update((s) => {
			const next = { ...(s.typesetScriptFonts || {}) };
			if (value === AUTOMATIC) delete next[slot];
			else next[slot] = value;
			return { ...s, typesetScriptFonts: next };
		});
	}

	function optionsFor(slot: ScriptFontSlot, chosen: string | undefined, cov: Coverage | undefined): SelectOption[] {
		const auto = cov?.chain[0] && cov.source !== 'user' ? `Automatic (${cov.chain[0]})` : 'Automatic';
		const fonts = getMergedScriptFonts(slot, $customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
		const items: SelectOption[] = [{ value: AUTOMATIC, label: auto, hint: 'Best installed font that has these letters' }];
		for (const f of fonts) items.push({ value: f.id, label: f.label, hint: f.sub });
		if (chosen && !items.some((i) => i.value === chosen)) items.push({ value: chosen, label: chosen, hint: 'Current choice' });
		return items;
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		return () => {
			// A RESPONSE THAT LANDS AFTER UNMOUNT IS IGNORED
			requestSeq++;
			if (refreshTimer) clearTimeout(refreshTimer);
		};
	});

	// -- REACTIVE STATEMENTS -- //

	// THE TARGET (AND SOURCE) LANGUAGE'S SCRIPTS COME FIRST; EVERYTHING ELSE SITS UNDER "OTHER SCRIPTS"
	$: primary = [scriptOfLanguage($settings.targetLang), scriptOfLanguage($settings.sourceLang)].filter(
		(s, i, all): s is ScriptFontSlot => Boolean(s) && s !== 'latin' && all.indexOf(s) === i,
	);
	$: others = SCRIPT_FONT_SLOTS.filter((s) => !primary.includes(s));
	$: scriptFonts = $settings.typesetScriptFonts || {};
	$: enabledSystemFonts = $settings.enabledSystemFonts || [];
	// IMPORTED FONTS WITHOUT LATIN LETTERS NEVER APPEAR IN THE DIALOGUE GRID, SO THEY ARE MANAGED HERE
	$: importedScriptFonts = $customFontsStore.filter((f) => f.scriptType !== 'dialogue');
	// PRIMITIVE KEYS: A SETTINGS CHANGE THAT LEAVES THESE EQUAL DOES NOT RE-RUN THE CHECK BELOW
	$: dialogueFontKey = $settings.typesetFont || '';
	$: scriptFontsKey = JSON.stringify(scriptFonts);
	// THE DIALOGUE FONT CAN COVER SCRIPTS TOO (E.G. POPPINS FOR HINDI): RE-CHECK WHEN IT OR A SLOT CHANGES
	$: scheduleRefresh(dialogueFontKey, scriptFontsKey);
</script>

<div
	id="setting-typeset-cjk"
	class={cn(
		'border-t border-black/10 pt-4 dark:border-white/10 space-y-3 transition-all duration-300',
		highlighted && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1',
	)}
	data-testid="script-fonts-section"
>
	<div>
		<div class="text-xs font-bold uppercase tracking-wider opacity-80">Script Fonts</div>
		<p class="text-[11px] opacity-60">
			The font used for each writing system. Automatic picks the best installed font that really has the letters.
		</p>
	</div>

	{#each [...primary, ...(showOther ? others : [])] as slot (slot)}
		{@const cov = coverage[slot]}
		{@const chosen = scriptFonts[slot]}
		{@const chosenCovers = !chosen || !cov || cov.coveringFonts.includes(chosen)}
		{@const chosenCustom = chosen ? $customFontsStore.find((f) => f.name === chosen) : undefined}
		{@const chosenSystem = Boolean(chosen && !chosenCustom && enabledSystemFonts.includes(chosen))}
		<div class="space-y-1.5 rounded-xl border border-black/10 p-2.5 dark:border-white/10" data-testid={`script-font-row-${slot}`}>
			<div class="flex items-center justify-between gap-2">
				<div class="text-xs font-bold truncate">{SCRIPT_LABELS[slot]}</div>
				<div class="flex items-center gap-1 shrink-0">
					<button
						type="button"
						on:click={() => dispatch('browse', { slot })}
						class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5 transition cursor-pointer whitespace-nowrap"
						title={`Browse installed fonts that have ${SCRIPT_LABELS[slot]} letters`}
						use:ripple
					>
						<Monitor size={12} />
						<span>System Fonts</span>
					</button>
					<button
						type="button"
						on:click={() => dispatch('import', { slot })}
						class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[#b23a2e] hover:bg-[#b23a2e]/10 dark:text-[#e08a63] dark:hover:bg-[#e08a63]/10 transition cursor-pointer whitespace-nowrap"
						use:ripple
					>
						<Plus size={13} />
						<span>Import</span>
					</button>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<div class="min-w-0 flex-1">
					<Select
						items={optionsFor(slot, chosen, cov)}
						value={chosen ?? AUTOMATIC}
						size="sm"
						on:change={(e) => setSlot(slot, e.detail)}
					/>
				</div>
				{#if chosenCustom}
					<button
						type="button"
						on:click={() => chosenCustom && dispatch('deleteFont', { id: chosenCustom.id, name: chosenCustom.name })}
						class="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition cursor-pointer"
						title={`Delete imported font "${chosenCustom.name}"`}
						aria-label={`Delete imported font ${chosenCustom.name}`}
						data-testid={`script-font-delete-${slot}`}
						use:ripple
					>
						<Trash2 size={13} />
					</button>
				{:else if chosenSystem && chosen}
					<button
						type="button"
						on:click={() => chosen && dispatch('disableFont', { family: chosen })}
						class="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition cursor-pointer"
						title={`Disable system font "${chosen}"`}
						aria-label={`Disable system font ${chosen}`}
						data-testid={`script-font-disable-${slot}`}
						use:ripple
					>
						<EyeOff size={13} />
					</button>
				{/if}
			</div>
			{#if cov && !cov.covered}
				<div class="flex items-start gap-1.5 rounded-lg bg-red-500/10 p-2 text-[11px] font-semibold text-red-700 dark:text-red-300" role="alert">
					<AlertTriangle size={13} class="mt-0.5 shrink-0" />
					<span>{SCRIPT_LABELS[slot]} text will render as boxes. Install or import a font with these letters, or pick one above.</span>
				</div>
			{:else if !chosenCovers}
				<div class="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300" role="status">
					<AlertTriangle size={13} class="mt-0.5 shrink-0" />
					<span>"{chosen}" has no {SCRIPT_LABELS[slot]} letters; missing ones fall back to {cov?.coveringFonts[0] ?? 'another font'}.</span>
				</div>
			{:else if cov?.chain[0]}
				<div class="flex items-center gap-1.5 text-[11px] opacity-70">
					<Check size={12} class="shrink-0 text-[#4f7a64] dark:text-[#83b39a]" />
					<span>Renders with {cov.chain[0]}</span>
				</div>
			{/if}
		</div>
	{/each}

	<button
		type="button"
		on:click={() => (showOther = !showOther)}
		class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold opacity-80 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
		aria-expanded={showOther}
		use:ripple
	>
		<ChevronDown size={12} class={cn('transition-transform', showOther && 'rotate-180')} />
		<span>{showOther ? 'Hide other scripts' : `Other scripts (${others.length})`}</span>
	</button>

	<!-- IMPORTED NON-LATIN FONTS: THE ONLY PLACE THEY CAN BE DELETED (THE DIALOGUE GRID LISTS LATIN FONTS ONLY) -->
	{#if importedScriptFonts.length > 0}
		<div class="space-y-1.5" data-testid="imported-script-fonts">
			<div class="text-[10px] font-bold uppercase tracking-wider opacity-60">Imported script fonts</div>
			{#each importedScriptFonts as font (font.id)}
				<div class="flex items-center justify-between gap-2 rounded-lg border border-black/10 px-2.5 py-1.5 dark:border-white/10">
					<div class="min-w-0 flex-1">
						<div class="truncate text-xs font-semibold">{font.name}</div>
						{#if font.scripts && font.scripts.length > 0}
							<div class="truncate text-[10px] opacity-60">
								{font.scripts.map((sc) => SCRIPT_LABELS[sc] ?? sc).join(', ')}
							</div>
						{/if}
					</div>
					<button
						type="button"
						on:click={() => dispatch('deleteFont', { id: font.id, name: font.name })}
						class="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition cursor-pointer"
						title={`Delete imported font "${font.name}"`}
						aria-label={`Delete imported font ${font.name}`}
						data-testid={`imported-script-font-delete-${font.id}`}
						use:ripple
					>
						<Trash2 size={12} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
