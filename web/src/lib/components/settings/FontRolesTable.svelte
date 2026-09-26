<!-- FONTS TABLE (FEAT-010 ADR-012): ONE ROW PER SCRIPT, A DIALOGUE AND AN ACCENT COLUMN. ONLY LATIN AND THE SCRIPTS THE
     LIBRARY IS TYPESET IN ARE SHOWN UNTIL "SHOW ALL SCRIPTS"; WARNINGS APPEAR ONLY WHEN A FONT LACKS LETTERS. -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import {
		settings,
		customFontsStore,
		systemFontsStore,
		getMergedDialogueFonts,
		getMergedScriptFonts,
		BUNDLED_ACCENT_FONTS,
		fontRemovalPatch,
		refreshFontAvailability,
		unloadBrowserFontFace,
		type TypesetFontOption,
		type CustomFontItem,
	} from '$lib/stores/settings';
	import { languageScripts, scriptOfLanguage, type Script } from '$lib/languages';
	import { SCRIPT_FONT_SLOTS, SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
	import { cn } from '$lib/utils/cn';
	import { plainLatinLetter } from '$lib/diacritics';
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Info from 'lucide-svelte/icons/info';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Plus from 'lucide-svelte/icons/plus';
	import Monitor from 'lucide-svelte/icons/monitor';
	import X from 'lucide-svelte/icons/x';
	// IMPORTED COMPONENTS
	import Select, { type SelectOption } from '$lib/components/ui/Select.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import ImportFontModal from '$lib/components/typeset/ImportFontModal.svelte';
	import SystemFontBrowserModal from '$lib/components/typeset/SystemFontBrowserModal.svelte';
	import SuggestedFontsModal from '$lib/components/typeset/SuggestedFontsModal.svelte';

	// -- TYPES -- //

	interface Coverage {
		script: ScriptFontSlot;
		chain: string[];
		coveringFonts: string[];
		covered: boolean;
		source: 'user' | 'dialogue' | 'bundled' | 'system' | 'none';
	}

	interface AccentCoverage {
		script: Script;
		family: string;
		available: boolean;
		verified: boolean;
		coversScript: boolean;
		missing: string[];
	}

	/** THE CELL AN IMPORT OR SYSTEM FONT PICK WAS STARTED FROM; THE NEW FONT IS ASSIGNED THERE. */
	interface CellTarget {
		role: 'dialogue' | 'accent';
		script: Script;
	}

	interface CellNote {
		tone: 'error' | 'warning' | 'info';
		text: string;
	}

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- CONSTANTS -- //

	const AUTOMATIC = '__automatic__';
	const OFF = '__off__';
	const IMPORT = '__import__';
	// ONLY SCRIPTS A BOOK CAN BE TRANSLATED INTO GET A ROW (NOT EVERY SCRIPT THE RENDERER KNOWS)
	const LANGUAGE_SLOTS = languageScripts().filter((s): s is ScriptFontSlot => s !== 'latin');
	const SYSTEM = '__system__';
	// EVERY FONT DROPDOWN ENDS WITH THESE TWO COMMANDS (THEY OPEN A DIALOG, THEY ARE NEVER A VALUE)
	const ACTION_ITEMS: SelectOption[] = [
		{ value: IMPORT, label: 'Import font...', icon: Plus, action: true },
		{ value: SYSTEM, label: 'Add system font...', icon: Monitor, action: true },
	];
	const REFRESH_DEBOUNCE_MS = 150;
	const dispatch = createEventDispatcher<{ setDialogueFont: string }>();

	// -- STATES -- //

	let bookScripts: Script[] = [];
	let showAll = false;
	let coverage: Partial<Record<ScriptFontSlot, Coverage>> = {};
	let accentCoverage: Partial<Record<Script, AccentCoverage>> = {};
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let requestSeq = 0;
	let firstRefresh = true;
	let bookScriptsRequested = false;
	let target: CellTarget | null = null;
	let importOpen = false;
	let systemOpen = false;
	let suggestedOpen = false;
	let fontToDelete: { id: string; name: string } | null = null;
	let confirmDeleteOpen = false;
	let isDeleting = false;
	let destroyed = false;

	// -- FUNCTIONS -- //

	function rowLabel(script: Script): string {
		return script === 'latin' ? 'Latin' : (SCRIPT_LABELS[script as ScriptFontSlot] ?? script);
	}

	async function loadBookScripts(): Promise<void> {
		try {
			const res = await fetch('/api/system/fonts/book-scripts');
			if (!res.ok) return;
			const data = (await res.json()) as { scripts?: unknown };
			// ONLY KNOWN SCRIPT NAMES: AN UNEXPECTED ANSWER (OLD SERVER, PROXY PAGE) MUST NOT BECOME ROWS
			const known = new Set<string>(['latin', ...LANGUAGE_SLOTS]);
			bookScripts = Array.isArray(data.scripts) ? data.scripts.filter((s): s is Script => typeof s === 'string' && known.has(s)) : [];
		} catch {
			// OFFLINE OR OLD SERVER: THE TARGET LANGUAGE'S SCRIPT STILL SHOWS
		}
	}

	async function refreshCoverage(): Promise<void> {
		if (destroyed) return;
		const id = ++requestSeq;
		// ASK ABOUT THE PENDING CHOICES, NOT WHAT THE DEBOUNCED SETTINGS SYNC HAS SAVED SO FAR
		const params = new URLSearchParams({
			scriptFonts: JSON.stringify($settings.typesetScriptFonts || {}),
			accentFonts: JSON.stringify($settings.typesetAccentFonts || {}),
		});
		if ($settings.typesetFont) params.set('dialogue', $settings.typesetFont);
		try {
			const res = await fetch(`/api/system/fonts/coverage?${params.toString()}`);
			if (!res.ok || id !== requestSeq) return;
			const data = (await res.json()) as { scripts: Coverage[]; accent?: AccentCoverage[] };
			if (id !== requestSeq) return;
			coverage = Object.fromEntries(data.scripts.map((c) => [c.script, c]));
			accentCoverage = Object.fromEntries((data.accent ?? []).map((c) => [c.script, c]));
		} catch {
			// OFFLINE OR OLD SERVER: CELLS SIMPLY SHOW NO WARNING
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

	function toOption(f: TypesetFontOption): SelectOption {
		// NO HINTS: IN A NARROW CELL THEY CRUSH THE FONT NAMES; EACH NAME IS SHOWN IN ITS OWN FACE INSTEAD
		return { value: f.id, label: f.label, fontFamily: f.stack ?? `"${f.id}", sans-serif` };
	}

	function dialogueOptions(script: Script, cov: Coverage | undefined): SelectOption[] {
		if (script === 'latin') return [...dialogueFonts.map(toOption), ...ACTION_ITEMS];
		const slot = script as ScriptFontSlot;
		const auto = cov?.chain[0] && cov.source !== 'user' ? `Automatic (${cov.chain[0]})` : 'Automatic';
		const items: SelectOption[] = [{ value: AUTOMATIC, label: auto }];
		items.push(...getMergedScriptFonts(slot, $customFontsStore, $settings.enabledSystemFonts, $systemFontsStore).map(toOption));
		const chosen = scriptFonts[slot];
		if (chosen && !items.some((i) => i.value === chosen)) items.push({ value: chosen, label: chosen });
		return [...items, ...ACTION_ITEMS];
	}

	function accentOptions(script: Script): SelectOption[] {
		const fonts = script === 'latin'
			? [...BUNDLED_ACCENT_FONTS, ...dialogueFonts.filter((f) => !BUNDLED_ACCENT_FONTS.some((b) => b.id === f.id))]
			: getMergedScriptFonts(script as ScriptFontSlot, $customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
		const items: SelectOption[] = [{ value: OFF, label: 'Off' }, ...fonts.map(toOption)];
		const chosen = accentFonts[script];
		if (chosen && !items.some((i) => i.value === chosen)) items.push({ value: chosen, label: chosen });
		return [...items, ...ACTION_ITEMS];
	}

	function onCellAction(cell: CellTarget, action: string): void {
		target = cell;
		if (action === IMPORT) importOpen = true;
		else if (action === SYSTEM) systemOpen = true;
	}

	/**
	 * AN IMPORT FOR A LATIN CELL MUST HAVE LATIN LETTERS (CODE CRITIC FEAT-010: THE OLD DIALOGUE-IMPORT GUARD). THE FONT
	 * STAYS IMPORTED, SO THE USER CAN STILL PICK IT IN THE ROW OF THE SCRIPT IT COVERS.
	 */
	function handleImported(font: CustomFontItem): void {
		if (target?.script === 'latin') {
			const coversLatin = font.scripts && font.scripts.length > 0 ? font.scripts.includes('latin') : font.scriptType === 'dialogue';
			if (!coversLatin) {
				toast.warning(`"${font.name}" has no Latin letters, so it was not set for Latin. Pick it in the row of the script it covers.`);
				target = null;
				return;
			}
		}
		assignToTarget(font.name);
	}

	/** PUTS A FONT THE USER JUST IMPORTED OR ENABLED INTO THE CELL THEY STARTED FROM. */
	function assignToTarget(family: string): void {
		if (!target || !family) return;
		if (target.role === 'accent') setAccent(target.script, family);
		else setDialogue(target.script, family);
		target = null;
	}

	function promptDelete(id: string, name: string): void {
		fontToDelete = { id, name };
		confirmDeleteOpen = true;
	}

	async function handleDelete(): Promise<void> {
		if (!fontToDelete) return;
		isDeleting = true;
		const deleted = fontToDelete.name;
		try {
			const res = await fetch(`/api/system/fonts/${fontToDelete.id}`, { method: 'DELETE' });
			const data = await res.json();
			if (res.ok && data.success) {
				// DIALOGUE, SCRIPT AND ACCENT CELLS THAT USED IT FALL BACK (FEAT-010 REVIEW H8)
				settings.update((s) => ({ ...s, ...fontRemovalPatch(s, deleted) }));
				await refreshFontAvailability();
				toast.success(`Font "${deleted}" deleted`);
			} else {
				toast.error(data.error || 'Failed to delete font');
			}
		} catch (err: any) {
			toast.error(err?.message || 'Failed to delete font');
		} finally {
			isDeleting = false;
			confirmDeleteOpen = false;
			fontToDelete = null;
		}
	}

	function disableSystemFont(family: string): void {
		settings.update((s) => ({ ...s, ...fontRemovalPatch(s, family, { disableSystem: true }) }));
		unloadBrowserFontFace(family);
		toast.info(`Removed "${family}" from the font choices`);
	}

	function setDialogue(script: Script, value: string): void {
		if (script === 'latin') {
			dispatch('setDialogueFont', value);
			return;
		}
		const slot = script as ScriptFontSlot;
		settings.update((s) => {
			const next = { ...(s.typesetScriptFonts || {}) };
			if (value === AUTOMATIC) delete next[slot];
			else next[slot] = value;
			return { ...s, typesetScriptFonts: next };
		});
	}

	function setAccent(script: Script, value: string): void {
		settings.update((s) => {
			const next = { ...(s.typesetAccentFonts || {}) };
			if (value === OFF) delete next[script];
			else next[script] = value;
			return { ...s, typesetAccentFonts: next };
		});
	}

	function dialogueNote(script: Script, cov: Coverage | undefined): CellNote | null {
		if (script === 'latin' || !cov) return null;
		const label = rowLabel(script);
		if (!cov.covered) return { tone: 'error', text: `No installed font has ${label} letters, so ${label} text shows as boxes. Import a font with these letters.` };
		const chosen = scriptFonts[script as ScriptFontSlot];
		if (chosen && !cov.coveringFonts.includes(chosen)) {
			return { tone: 'warning', text: `"${chosen}" has no ${label} letters; they fall back to ${cov.coveringFonts[0] ?? 'another font'}.` };
		}
		return null;
	}

	/**
	 * THE LETTERS AN ACCENT FONT STILL NEEDS (FEAT-011): A LATIN LETTER WITH A DIACRITIC THE FONT LACKS IS DRAWN PLAIN
	 * (É -> E) IN THAT FONT, SO ONLY LETTERS WITHOUT A PLAIN FORM (DIGITS, SYMBOLS, PLAIN LETTERS) STILL MATTER.
	 */
	function lettersStillMissing(script: Script, missing: string[]): string[] {
		return script === 'latin' ? missing.filter((ch) => plainLatinLetter(ch) === ch) : missing;
	}

	function accentNote(script: Script): CellNote | null {
		const cov = accentCoverage[script];
		if (!accentFonts[script] || !cov) return null;
		const label = rowLabel(script);
		if (!cov.available) return { tone: 'error', text: `"${cov.family}" is not installed. Accent text uses the dialogue font with a heavier outline.` };
		if (!cov.coversScript) return { tone: 'error', text: `"${cov.family}" has no ${label} letters, so ${label} accent text uses the dialogue font with a heavier outline.` };
		const missing = lettersStillMissing(script, cov.missing);
		if (missing.length > 0) {
			const shown = missing.slice(0, 12).join(' ');
			return { tone: 'warning', text: `"${cov.family}" lacks ${shown}${missing.length > 12 ? ' ...' : ''}. Accent text with these letters uses the dialogue font.` };
		}
		if (!cov.verified) return { tone: 'info', text: 'Letter coverage of this system font could not be checked here. Import the font file to verify it.' };
		return null;
	}

	// -- LIFECYCLES -- //

	onDestroy(() => {
		// A PENDING CHECK NEVER FIRES AND A RESPONSE THAT LANDS AFTER UNMOUNT IS IGNORED
		destroyed = true;
		requestSeq++;
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = null;
	});

	// -- REACTIVE STATEMENTS -- //

	// LOADED ONCE IN THE BROWSER (A REACTIVE START, LIKE THE COVERAGE CHECK BELOW)
	$: if (browser && !bookScriptsRequested) {
		bookScriptsRequested = true;
		loadBookScripts();
	}
	$: dialogueFonts = getMergedDialogueFonts($customFontsStore, $settings.enabledSystemFonts, $systemFontsStore);
	$: scriptFonts = $settings.typesetScriptFonts || {};
	$: accentFonts = $settings.typesetAccentFonts || {};
	// LATIN FIRST, THEN THE LIBRARY'S SCRIPTS AND THE DEFAULT LANGUAGE PAIR; SCRIPTS WITH A FONT SET STAY VISIBLE TOO
	$: primary = [
		...bookScripts,
		scriptOfLanguage($settings.targetLang),
		scriptOfLanguage($settings.sourceLang),
	].filter((s, i, all): s is ScriptFontSlot => Boolean(s) && s !== 'latin' && (LANGUAGE_SLOTS as readonly string[]).includes(s as string) && all.indexOf(s) === i);
	// A SCRIPT WITH A FONT SET STAYS VISIBLE, EVEN ONE NO SUPPORTED LANGUAGE USES (GREEK TEXT INSIDE A LATIN BOOK STILL
	// RENDERS WITH IT), SO AN ACTIVE SETTING CAN ALWAYS BE SEEN AND CHANGED (CODE CRITIC FEAT-010)
	$: withFontSet = ([...Object.keys(scriptFonts), ...Object.keys(accentFonts)] as Script[]).filter(
		(s, i, all): s is ScriptFontSlot => s !== 'latin' && (SCRIPT_FONT_SLOTS as readonly string[]).includes(s) && !primary.includes(s as ScriptFontSlot) && all.indexOf(s) === i,
	);
	$: others = LANGUAGE_SLOTS.filter((s) => !primary.includes(s) && !withFontSet.includes(s));
	$: rows = ['latin', ...primary, ...withFontSet, ...(showAll ? others : [])] as Script[];
	// THE SCRIPT SLOT OF THE CELL THAT OPENED THE IMPORT / SYSTEM FONT DIALOG (LATIN HAS NO SLOT)
	$: targetSlot = target && target.script !== 'latin' ? (target.script as ScriptFontSlot) : undefined;
	// PRIMITIVE KEYS: A SETTINGS CHANGE THAT LEAVES THESE EQUAL DOES NOT RE-RUN THE CHECK
	$: coverageKey = JSON.stringify([$settings.typesetFont || '', scriptFonts, accentFonts]);
	$: scheduleRefresh(coverageKey);
</script>

<div
	id="setting-typeset-fonts"
	class={cn(
		'border-t border-black/10 pt-4 dark:border-white/10 space-y-2 transition-all duration-300',
		highlightedSettingId === 'typeset-fonts' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1',
	)}
	data-testid="font-roles-table"
>
	<!-- HEADER: TITLE AND MANAGE FONTS ON ONE LINE, THE EXPLANATION UNDER IT -->
	<div class="space-y-0.5">
		<div class="flex items-center justify-between gap-2">
			<div class="text-xs font-bold uppercase tracking-wider opacity-80">Fonts</div>
			<button
				type="button"
				on:click={() => (suggestedOpen = true)}
				class="text-[11px] font-semibold text-[#b23a2e] hover:underline dark:text-[#e08a63] cursor-pointer"
				data-testid="free-accent-fonts"
			>
				Free accent fonts
			</button>
		</div>
		<p class="text-[11px] opacity-60">Dialogue is for speech and captions. Accent is for skill names, attacks, spells and title cards.</p>
	</div>

	<!-- ONE CARD: COLUMN HEADERS, A DIVIDED ROW PER SCRIPT, THE SHOW-ALL TOGGLE AS ITS FOOTER -->
	<!-- THE TABLE IS THE SEARCH TARGET FOR "ACCENT" -->
	<div id="setting-typeset-accent" class="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
		<!-- COLUMN HEADERS (WIDE SCREENS; ON PHONES EACH CELL CARRIES ITS OWN LABEL) -->
		<div
			class="hidden sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-black/10 bg-black/[0.02] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70 dark:border-white/10 dark:bg-white/[0.02]"
		>
			<span>Script</span>
			<span>Dialogue</span>
			<span>Accent</span>
		</div>

		<div class="divide-y divide-black/5 dark:divide-white/5">
			{#each rows as script (script)}
				{@const cov = script === 'latin' ? undefined : coverage[script]}
				{@const dNote = dialogueNote(script, cov)}
				{@const aNote = accentNote(script)}
				<div
					class="grid grid-cols-1 gap-1.5 px-3 py-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-3"
					data-testid={`font-row-${script}`}
				>
					<div class="truncate text-xs font-semibold sm:pt-1.5" title={rowLabel(script)}>{rowLabel(script)}</div>
					<div class="min-w-0 space-y-1">
						<span class="text-[10px] font-semibold uppercase opacity-50 sm:hidden">Dialogue</span>
						<Select
							items={dialogueOptions(script, cov)}
							value={script === 'latin' ? $settings.typesetFont || 'CC Wild Words' : (scriptFonts[script] ?? AUTOMATIC)}
							size="sm"
							hideTriggerHint
							on:change={(e) => setDialogue(script, e.detail)}
							on:action={(e) => onCellAction({ role: 'dialogue', script }, e.detail)}
						/>
						{#if dNote}
							<div
								class={cn('flex items-start gap-1 text-[10px] leading-snug', dNote.tone === 'error' ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-amber-700 dark:text-amber-300')}
								role={dNote.tone === 'error' ? 'alert' : 'status'}
								data-testid={`font-row-${script}-dialogue-note`}
							>
								<AlertTriangle size={11} class="mt-0.5 shrink-0" />
								<span>{dNote.text}</span>
							</div>
						{/if}
					</div>
					<div class="min-w-0 space-y-1" data-testid={`font-row-${script}-accent`}>
						<span class="text-[10px] font-semibold uppercase opacity-50 sm:hidden">Accent</span>
						<Select
							items={accentOptions(script)}
							value={accentFonts[script] ?? OFF}
							size="sm"
							hideTriggerHint
							on:change={(e) => setAccent(script, e.detail)}
							on:action={(e) => onCellAction({ role: 'accent', script }, e.detail)}
						/>
						{#if aNote}
							<div
								class={cn(
									'flex items-start gap-1 text-[10px] leading-snug',
									aNote.tone === 'error' ? 'text-red-700 dark:text-red-300 font-semibold' : aNote.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'opacity-70',
								)}
								role={aNote.tone === 'error' ? 'alert' : 'status'}
								data-testid={`font-row-${script}-accent-note`}
							>
								{#if aNote.tone === 'info'}
									<Info size={11} class="mt-0.5 shrink-0" />
								{:else}
									<AlertTriangle size={11} class="mt-0.5 shrink-0" />
								{/if}
								<span>{aNote.text}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if others.length > 0}
			<button
				type="button"
				on:click={() => (showAll = !showAll)}
				class="flex w-full items-center justify-center gap-1 border-t border-black/10 bg-black/[0.02] px-3 py-1.5 text-[11px] font-semibold opacity-80 transition-colors hover:bg-black/5 hover:opacity-100 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/5 cursor-pointer"
				aria-expanded={showAll}
				data-testid="font-rows-toggle"
				use:ripple
			>
				<ChevronDown size={12} class={cn('transition-transform', showAll && 'rotate-180')} />
				<span>{showAll ? 'Show fewer scripts' : `Show all scripts (${others.length} more)`}</span>
			</button>
		{/if}
	</div>

	<!-- YOUR FONTS: EVERY IMPORTED OR ENABLED SYSTEM FONT, REMOVABLE IN ONE CLICK (ONLY WHEN THERE ARE ANY) -->
	{#if $customFontsStore.length > 0 || ($settings.enabledSystemFonts || []).length > 0}
		<div class="flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="your-fonts">
			<span class="opacity-60">Your fonts:</span>
			{#each $customFontsStore as font (font.id)}
				<span class="inline-flex items-center gap-1 rounded-full border border-black/10 py-0.5 pl-2 pr-1 dark:border-white/10" data-testid={`your-font-${font.name}`}>
					<span class="max-w-[10rem] truncate font-semibold">{font.name}</span>
					<button
						type="button"
						on:click={() => promptDelete(font.id, font.name)}
						class="rounded-full p-0.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
						title={`Delete imported font "${font.name}"`}
						aria-label={`Delete imported font ${font.name}`}
						data-testid="your-font-delete"
					>
						<X size={11} />
					</button>
				</span>
			{/each}
			{#each $settings.enabledSystemFonts || [] as family (family)}
				<span class="inline-flex items-center gap-1 rounded-full border border-dashed border-black/15 py-0.5 pl-2 pr-1 dark:border-white/15" data-testid={`your-font-${family}`}>
					<span class="max-w-[10rem] truncate">{family}</span>
					<span class="text-[9px] uppercase opacity-50">system</span>
					<button
						type="button"
						on:click={() => disableSystemFont(family)}
						class="rounded-full p-0.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
						title={`Remove system font "${family}" from the choices`}
						aria-label={`Remove system font ${family}`}
						data-testid="your-font-disable"
					>
						<X size={11} />
					</button>
				</span>
			{/each}
		</div>
	{/if}
</div>

<!-- DIALOGS: IMPORT AND SYSTEM FONTS ASSIGN TO THE CELL THEY WERE OPENED FROM; display:contents KEEPS THEM OUT OF LAYOUT -->
<div class="contents">
	<ImportFontModal
		bind:open={importOpen}
		targetScriptType={targetSlot ? 'cjk' : 'dialogue'}
		{targetSlot}
		on:imported={(e) => handleImported(e.detail.font)}
	/>
	<SystemFontBrowserModal
		bind:open={systemOpen}
		targetScriptType={targetSlot ? 'cjk' : 'dialogue'}
		{targetSlot}
		lockScriptType
		enableOnly
		on:enabled={(e) => assignToTarget(e.detail.family)}
	/>
	<SuggestedFontsModal bind:open={suggestedOpen} />
	<ConfirmDialog
		bind:open={confirmDeleteOpen}
		title="Delete Font"
		message={`Delete "${fontToDelete?.name}"? Cells that use it go back to their defaults. This cannot be undone.`}
		confirmLabel="Delete Font"
		variant="danger"
		loading={isDeleting}
		on:confirm={handleDelete}
		on:cancel={() => (fontToDelete = null)}
	/>
</div>
