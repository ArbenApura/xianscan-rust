<!-- SYSTEM FONT BROWSER MODAL - DISCOVER AND ACTIVATE INSTALLED OS FONTS -->
<script lang="ts">
// IMPORTED DEP-MODULES
import { createEventDispatcher } from 'svelte';
import { toast } from 'svelte-sonner';
// IMPORTED MODULES
import {
	settings,
	fontRemovalPatch,
	systemFontsStore,
	systemFontsLoadingStore,
	fetchInstalledSystemFonts,
	loadSystemBrowserFontFace,
	type SystemFontInfo,
} from '$lib/stores/settings';
import { cn } from '$lib/utils/cn';
import { ripple } from '$lib/actions/ripple';
import { SCRIPT_LABELS, SCRIPT_SAMPLES, type ScriptFontSlot } from '$lib/typeset-scripts';
// IMPORTED DEP-COMPONENTS
import Search from 'lucide-svelte/icons/search';
import Check from 'lucide-svelte/icons/check';
import Plus from 'lucide-svelte/icons/plus';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';
import Monitor from 'lucide-svelte/icons/monitor';
import Sparkles from 'lucide-svelte/icons/sparkles';
import EyeOff from 'lucide-svelte/icons/eye-off';
// IMPORTED COMPONENTS
import Modal from '$lib/components/ui/Modal.svelte';
import Button from '$lib/components/ui/Button.svelte';
import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
import Badge from '$lib/components/ui/Badge.svelte';

// -- OPTIONAL PROPS -- //

export let open: boolean = false;
export let targetScriptType: 'dialogue' | 'cjk' = 'dialogue';
export let lockScriptType: boolean = true;
/** WHEN SET, THE BROWSER LISTS ONLY FONTS WITH GLYPHS FOR THIS SCRIPT AND ENABLING ONE ASSIGNS IT TO THAT SLOT. */
export let targetSlot: ScriptFontSlot | undefined = undefined;
/**
 * ENABLE ONLY (FEAT-010 REVIEW H7): THE FONT LIBRARY ADDS FONTS TO THE CHOICES WITHOUT ASSIGNING THEM TO ANY ROLE; THE
 * USER PICKS THEM IN THE FONTS TABLE. OTHERWISE ENABLING ALSO SELECTS THE FONT, AS BEFORE.
 */
export let enableOnly: boolean = false;

// -- CONSTANTS -- //

const SCRIPT_TABS = [
	{ value: 'all', label: 'All Fonts' },
	{ value: 'dialogue', label: 'Latin Dialogue' },
	{ value: 'cjk', label: 'CJK Fallback' },
];

const SAMPLE_TEXT_DIALOGUE = 'WAIT! WHAT IS THIS REALM?!';
const SAMPLE_TEXT_CJK = '道生一，一生二，二生三，三生万物';

// -- STATES -- //

const dispatch = createEventDispatcher<{
	enabled: { family: string; scriptType: 'dialogue' | 'cjk' };
}>();

let searchQuery: string = '';
let activeTab: 'all' | 'dialogue' | 'cjk' = 'all';

// -- FUNCTIONS -- //

async function handleRefresh(): Promise<void> {
	await fetchInstalledSystemFonts();
	toast.success('System font list refreshed');
}

/** REMOVES A SYSTEM FONT FROM THE TYPESETTING CHOICES; EVERY SETTING THAT USED IT GOES BACK TO ITS DEFAULT. */
function disableFont(familyName: string): void {
	// DIALOGUE, SCRIPT AND ACCENT SETTINGS THAT USED IT FALL BACK (FEAT-010 REVIEW H8)
	settings.update((s) => ({ ...s, ...fontRemovalPatch(s, familyName, { disableSystem: true }) }));
	toast.info(`Disabled "${familyName}" from typesetting choices`);
}

/** ENABLES A SYSTEM FONT AND SELECTS IT FOR THE TARGET SLOT (OR THE DIALOGUE / LEGACY CJK SETTING). */
function enableFont(familyName: string): void {
	settings.update((s) => {
		const next = [...(s.enabledSystemFonts || []), familyName];
		if (enableOnly) {
			return { ...s, enabledSystemFonts: next };
		}
		if (targetSlot) {
			return { ...s, enabledSystemFonts: next, typesetScriptFonts: { ...(s.typesetScriptFonts || {}), [targetSlot]: familyName } };
		}
		if (targetScriptType === 'cjk') {
			return { ...s, enabledSystemFonts: next, typesetCjkFont: familyName };
		} else {
			return { ...s, enabledSystemFonts: next, typesetFont: familyName };
		}
	});
	// LOAD FONT IN BROWSER FOR LIVE CANVAS PREVIEW
	loadSystemBrowserFontFace(familyName, true);
	const categoryDesc = targetSlot
		? `${SCRIPT_LABELS[targetSlot]} text`
		: targetScriptType === 'cjk'
			? 'CJK fallback typesetting'
			: 'dialogue speech bubbles';
	toast.success(enableOnly ? `Enabled "${familyName}"` : `Enabled and selected "${familyName}" for ${categoryDesc}`);
	dispatch('enabled', { family: familyName, scriptType: targetScriptType });
	if (enableOnly) open = false;
}

/** AN ALREADY ENABLED FONT IS ONLY ASSIGNED TO THE SLOT; IT STAYS ENABLED FOR EVERY OTHER SETTING THAT USES IT. */
function useForSlot(familyName: string, slot: ScriptFontSlot): void {
	settings.update((s) => ({ ...s, typesetScriptFonts: { ...(s.typesetScriptFonts || {}), [slot]: familyName } }));
	loadSystemBrowserFontFace(familyName);
	toast.success(`Using "${familyName}" for ${SCRIPT_LABELS[slot]} text`);
	dispatch('enabled', { family: familyName, scriptType: targetScriptType });
}

/** THE MAIN BUTTON: WITH A TARGET SLOT IT NEVER DISABLES (THAT IS THE SEPARATE DISABLE BUTTON). */
function handleFontAction(familyName: string): void {
	const enabled = ($settings.enabledSystemFonts || []).includes(familyName);
	if (!enabled) enableFont(familyName);
	// ENABLE-ONLY (THE FONTS TABLE): AN ENABLED FONT IS PICKED FOR THE CELL THAT OPENED THE BROWSER
	else if (enableOnly) {
		dispatch('enabled', { family: familyName, scriptType: targetScriptType });
		open = false;
	}
	else if (targetSlot) useForSlot(familyName, targetSlot);
	else disableFont(familyName);
}

// -- REACTIVE STATEMENTS -- //

$: if (open && targetScriptType) {
	activeTab = targetScriptType;
}

// ONE AUTOMATIC SCAN PER OPENING: AN EMPTY RESULT MUST NOT TRIGGER ANOTHER SCAN (IT LOOPED WITH A SPINNER). THE REFRESH
// BUTTON STILL RESCANS ON DEMAND.
let scannedThisOpen = false;
$: if (!open) scannedThisOpen = false;
$: if (open && !scannedThisOpen && $systemFontsStore.length === 0) {
	scannedThisOpen = true;
	fetchInstalledSystemFonts();
}

$: effectiveTab = lockScriptType ? targetScriptType : activeTab;

/** DOES THE FONT HAVE GLYPHS FOR THE TARGET SLOT? OLDER SERVERS WITHOUT `scripts` FALL BACK TO THE CJK CATEGORY. */
function coversSlot(font: SystemFontInfo, slot: ScriptFontSlot): boolean {
	if (font.scripts) return font.scripts.includes(slot);
	return (slot === 'han' || slot === 'kana' || slot === 'hangul') && font.scriptType === 'cjk';
}

function sampleFor(font: SystemFontInfo): string {
	if (targetSlot) return SCRIPT_SAMPLES[targetSlot];
	const nonLatin = font.scripts?.find((sc) => sc !== 'latin');
	if (font.scripts && font.scripts.includes('latin')) return SAMPLE_TEXT_DIALOGUE;
	if (nonLatin) return SCRIPT_SAMPLES[nonLatin];
	return font.scriptType === 'cjk' ? SAMPLE_TEXT_CJK : SAMPLE_TEXT_DIALOGUE;
}

$: filteredFonts = ($systemFontsStore || []).filter((font: SystemFontInfo) => {
	if (targetSlot) {
		if (!coversSlot(font, targetSlot)) return false;
	} else if (effectiveTab !== 'all' && font.scriptType !== effectiveTab) {
		return false;
	}
	if (searchQuery.trim()) {
		return font.family.toLowerCase().includes(searchQuery.toLowerCase().trim());
	}
	return true;
});

$: categoryCount = targetSlot
	? ($systemFontsStore || []).filter((f) => coversSlot(f, targetSlot as ScriptFontSlot)).length
	: lockScriptType
		? ($systemFontsStore || []).filter((f) => f.scriptType === targetScriptType).length
		: ($systemFontsStore || []).length;

$: enabledCount = ($settings.enabledSystemFonts || []).length;

$: modalTitle = targetSlot
	? `System Fonts for ${SCRIPT_LABELS[targetSlot]}`
	: lockScriptType
	? targetScriptType === 'cjk'
		? 'System CJK Fallback Fonts'
		: 'System Dialogue Fonts'
	: 'System Installed Fonts';

// A SCRIPT SLOT (ARABIC, THAI...) NAMES ITS OWN SCRIPT; ONLY THE SLOT-LESS LEGACY PATH SAYS CJK
$: searchPlaceholder = targetSlot
	? `Search installed ${SCRIPT_LABELS[targetSlot]} fonts...`
	: lockScriptType
	? targetScriptType === 'cjk'
		? 'Search installed CJK fonts (e.g. YaHei, Gothic, Ming)...'
		: 'Search installed dialogue fonts (e.g. Arial, Comic, Impact)...'
	: 'Search installed system fonts...';
</script>

<Modal bind:open title={modalTitle} size="lg" placement="center" on:close={() => (open = false)}>
	<div class="space-y-3">
		<!-- HEADER SEARCH & REFRESH -->
		<div class="flex items-center gap-2">
			<div class="relative flex-1 min-w-0">
				<Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-current opacity-40" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={searchPlaceholder}
					class="w-full rounded-xl border border-black/10 bg-black/[0.02] py-2 pl-9 pr-3 text-xs text-current placeholder:text-current/40 focus:border-[#b23a2e] focus:outline-hidden dark:border-white/10 dark:bg-white/[0.02] dark:focus:border-[#e08a63]"
				/>
			</div>

			{#if !lockScriptType}
				<div class="hidden sm:block">
					<SegmentedControl options={SCRIPT_TABS} bind:value={activeTab} />
				</div>
			{/if}

			<Button
				variant="ghost"
				size="sm"
				loading={$systemFontsLoadingStore && $systemFontsStore.length > 0}
				disabled={$systemFontsLoadingStore}
				on:click={handleRefresh}
				title="Rescan system font directories"
				class="shrink-0"
			>
				<!-- Button SHOWS ITS OWN SPINNER WHILE LOADING; THE ICON IS ONLY SHOWN WHEN IDLE (ONE SPINNER, NOT TWO) -->
				{#if !($systemFontsLoadingStore && $systemFontsStore.length > 0)}<RefreshCw size={13} />{/if}
			</Button>
		</div>

		{#if !lockScriptType}
			<!-- MOBILE SEGMENTED CONTROL WHEN SCRIPT NOT LOCKED -->
			<div class="sm:hidden">
				<SegmentedControl options={SCRIPT_TABS} bind:value={activeTab} block />
			</div>
		{/if}

		<!-- STATUS SUMMARY BANNER -->
		<div class="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-1.5 text-xs text-current/80 dark:border-white/10 dark:bg-white/[0.02]">
			<div class="flex items-center gap-2 min-w-0">
				<Monitor size={14} class="opacity-60 shrink-0" />
				<span class="truncate">
					Found <strong>{categoryCount}</strong> installed fonts
				</span>
			</div>
			<div class="flex items-center gap-1.5 font-semibold text-xs shrink-0">
				<Badge variant={enabledCount > 0 ? 'jade' : 'neutral'}>
					{enabledCount} Active
				</Badge>
			</div>
		</div>

		<!-- FONTS SCROLLABLE LIST -->
		<div class="max-h-96 overflow-y-auto space-y-2 pr-1">
			{#if $systemFontsLoadingStore && $systemFontsStore.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center opacity-60">
					<RefreshCw size={24} class="animate-spin mb-2 text-[#b23a2e] dark:text-[#e08a63]" />
					<p class="text-xs font-semibold">Scanning operating system font directories...</p>
				</div>
			{:else if filteredFonts.length === 0}
				<div class="flex flex-col items-center justify-center py-10 text-center opacity-60">
					<p class="text-xs font-semibold">No system fonts matched your filter.</p>
					<p class="text-[11px] mt-1">Try another search term or switch to All Fonts.</p>
				</div>
			{:else}
				{#each filteredFonts as font}
					{@const enabled = ($settings.enabledSystemFonts || []).includes(font.family)}
					{@const inSlot = Boolean(!enableOnly && targetSlot && $settings.typesetScriptFonts?.[targetSlot] === font.family)}
					<div
						class={cn(
							'group flex flex-col gap-1.5 rounded-2xl border p-3 transition-all',
							enabled
								? 'border-[#4f7a64]/40 bg-[#4f7a64]/5 dark:border-[#83b39a]/30 dark:bg-[#83b39a]/5'
								: 'border-black/10 bg-white/60 hover:border-black/20 dark:border-white/10 dark:bg-neutral-800/60 dark:hover:border-white/20'
						)}
					>
						<!-- TOP ROW: FONT FAMILY + BADGES + ENABLE BUTTON -->
						<div class="flex items-center justify-between gap-2">
							<div class="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
								<span class="text-xs font-bold text-current truncate">{font.family}</span>
								{#if font.scripts && font.scripts.length > 0}
									{#each font.scripts.filter((sc) => sc !== 'latin').slice(0, 4) as sc}
										<Badge variant="cinnabar">{SCRIPT_LABELS[sc]}</Badge>
									{/each}
								{:else if !lockScriptType}
									<Badge variant={font.scriptType === 'cjk' ? 'cinnabar' : 'neutral'}>
										{font.scriptType === 'cjk' ? 'CJK' : 'Dialogue'}
									</Badge>
								{/if}
								{#if font.isVariable}
									<Badge variant="gold">Variable</Badge>
								{:else if font.supportedWeights?.includes('bold')}
									<Badge variant="neutral">Regular + Bold</Badge>
								{/if}
							</div>

							<!-- ACTION TOGGLE -->
							<div class="shrink-0 flex items-center gap-1">
								{#if targetSlot && enabled}
									<button
										type="button"
										on:click={() => disableFont(font.family)}
										class="inline-flex items-center rounded-xl p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition cursor-pointer"
										title={`Disable "${font.family}" everywhere`}
										aria-label={`Disable ${font.family}`}
										data-testid="system-font-disable"
										use:ripple
									>
										<EyeOff size={12} />
									</button>
								{/if}
								<button
									type="button"
									disabled={inSlot}
									on:click={() => handleFontAction(font.family)}
									class={cn(
										'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer shadow-2xs whitespace-nowrap disabled:cursor-default',
										inSlot || (enabled && !targetSlot && !enableOnly)
											? 'bg-[#4f7a64] text-white hover:bg-[#3d604e] dark:bg-[#5b8a72] dark:hover:bg-[#4d7560]'
											: 'border border-black/10 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
									)}
									use:ripple
								>
									{#if inSlot}
										<Check size={12} />
										<span>In use</span>
									{:else if enabled && (targetSlot || enableOnly)}
										<Plus size={12} />
										<span>Use</span>
									{:else if enabled}
										<Check size={12} />
										<span>Enabled</span>
									{:else}
										<Plus size={12} />
										<span>Enable</span>
									{/if}
								</button>
							</div>
						</div>

						<!-- FULL-WIDTH LIVE PREVIEW TEXT SAMPLE -->
						<div
							class="text-sm font-medium tracking-tight text-current/90 truncate pt-0.5"
							style="font-family: '{font.family}', sans-serif;"
						>
							{sampleFor(font)}
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- FOOTER -->
	<div slot="footer" class="flex items-center justify-between gap-3">
		<div class="text-[11px] opacity-60 flex-1 leading-tight truncate">
			Enabled fonts appear in typesetting studio.
		</div>
		<Button variant="primary" size="sm" class="shrink-0" on:click={() => (open = false)}>
			Done
		</Button>
	</div>
</Modal>
