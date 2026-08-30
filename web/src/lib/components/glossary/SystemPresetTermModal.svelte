<script context="module" lang="ts">
	import type { Gender, TermCategory } from '$lib/types';

	export interface SystemTermData {
		id: number;
		source: string;
		target: string;
		gender: Gender;
		context: string | null;
		category: TermCategory | null;
		pinned: boolean;
		aliases: string[];
		packId?: string;
	}
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import Star from 'lucide-svelte/icons/star';
	import Package from 'lucide-svelte/icons/package';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Globe from 'lucide-svelte/icons/globe';
	import ShieldAlert from 'lucide-svelte/icons/shield-alert';
	import Copy from 'lucide-svelte/icons/copy';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Check from 'lucide-svelte/icons/check';
	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	// -- OPTIONAL PROPS -- //

	export let open = false;
	export let term: SystemTermData | null = null;
	export let currentScope: 'global' | 'book' = 'global';
	export let bookTitle = '';

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{
		close: void;
		override: { term: SystemTermData; targetScope: 'global' | 'book' };
	}>();

	const CATEGORY_LABELS: Record<string, string> = {
		character: 'Character',
		location: 'Location',
		organization: 'Organization',
		technique: 'Technique',
		item: 'Item',
		realm: 'Realm',
		creature: 'Creature',
		title: 'Title',
		concept: 'Concept',
		other: 'Other',
	};

	const THEME_NAMES: Record<string, string> = {
		xianxia: 'Wuxia & Cultivation (Xianxia)',
		murim: 'Murim & Martial Arts',
		system: 'Hunter & System Leveling',
		fantasy: 'Fantasy & Isekai Guilds',
		rofan: 'Romance Fantasy & Otome Isekai',
		palace: 'Imperial Palace & Court Drama',
		scifi: 'Sci-Fi, Mecha & Sentinelverse',
	};

	function resolveThemeName(packId: string): string {
		for (const [key, label] of Object.entries(THEME_NAMES)) {
			if (packId.includes(key)) return label;
		}
		return packId.replace(/[-_]/g, ' ');
	}

	// -- STATES -- //

	let copied = false;

	// -- FUNCTIONS -- //

	function copyTarget() {
		if (!term) return;
		navigator.clipboard.writeText(term.target);
		copied = true;
		toast.success('Copied translation to clipboard.');
		setTimeout(() => (copied = false), 2000);
	}

	function handleOverride(targetScope: 'global' | 'book') {
		if (!term) return;
		open = false;
		dispatch('override', { term, targetScope });
	}
</script>

<!-- DEDICATED SYSTEM PRESET TERM DETAILS & OVERRIDE DIALOG -->
<Modal
	{open}
	size="md"
	title="System Preset Term"
	on:close={() => {
		open = false;
		dispatch('close');
	}}
>
	{#if term}
		<div class="flex flex-col gap-3 sm:gap-4">
			<!-- TOP SYSTEM BADGE BANNER -->
			<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 sm:px-3.5 sm:py-2.5 dark:bg-amber-500/8">
				<div class="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 min-w-0">
					<Package size={14} class="text-amber-600 dark:text-amber-400 shrink-0" />
					<span class="truncate">Preset: <strong>{term.packId || 'Global'}</strong></span>
				</div>
				<Badge variant="amber" class="shrink-0 text-[10px]">READ-ONLY</Badge>
			</div>

			<!-- SOURCE AND TARGET CARD -->
			<div class="rounded-xl sm:rounded-2xl border border-black/10 bg-black/[0.02] p-3 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
				<div class="flex flex-col gap-2.5 sm:gap-3">
					<div>
						<span class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider opacity-50">Source Term</span>
						<div class="mt-0.5 sm:mt-1 flex items-center justify-between gap-2">
							<span class="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 break-words">{term.source}</span>
							{#if term.pinned}
								<span class="inline-flex shrink-0 items-center gap-1 text-[11px] sm:text-xs font-semibold text-amber-600 dark:text-amber-400">
									<Star size={12} class="fill-amber-400" /> Pinned
								</span>
							{/if}
						</div>
					</div>

					<div class="h-px bg-black/10 dark:bg-white/10"></div>

					<div>
						<span class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider opacity-50">Standard Translation</span>
						<div class="mt-0.5 sm:mt-1 flex items-center justify-between gap-2">
							<span class="text-base sm:text-lg font-bold text-[#b23a2e] dark:text-[#e08a63] break-words">{term.target}</span>
							<button
								type="button"
								on:click={copyTarget}
								class="flex shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-black/[0.06] hover:border-black/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:border-white/20 cursor-pointer"
								use:ripple
								title="Copy target rendering"
							>
								{#if copied}
									<Check size={13} class="text-emerald-600 dark:text-emerald-400" />
									<span class="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
								{:else}
									<Copy size={13} class="opacity-70" />
									<span>Copy</span>
								{/if}
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- METADATA GRID: CATEGORY AND THEME SOURCE -->
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 text-xs">
				<div class="rounded-xl border border-black/[0.07] bg-white/40 p-2.5 sm:p-3 dark:border-white/[0.06] dark:bg-neutral-900/40">
					<span class="font-semibold opacity-50 text-[11px]">Category</span>
					<p class="mt-0.5 font-medium capitalize text-neutral-800 dark:text-neutral-200">
						{term.category ? CATEGORY_LABELS[term.category] || term.category : 'General / Concept'}
					</p>
					<span class="mt-0.5 block text-[10px] opacity-50">
						Preset classification
					</span>
				</div>
				<div class="rounded-xl border border-black/[0.07] bg-white/40 p-2.5 sm:p-3 dark:border-white/[0.06] dark:bg-neutral-900/40">
					<span class="font-semibold opacity-50 text-[11px]">Origin Theme Source</span>
					<p class="mt-0.5 font-medium text-neutral-800 dark:text-neutral-200 truncate">
						{term.packId ? resolveThemeName(term.packId) : 'Universal Catalog'}
					</p>
					<span class="mt-0.5 block text-[10px] opacity-50">
						System Theme Pack
					</span>
				</div>
			</div>

			<!-- ALIASES (IF ANY) -->
			{#if term.aliases && term.aliases.length > 0}
				<div class="rounded-xl border border-black/[0.07] bg-white/40 p-2.5 sm:p-3 text-xs dark:border-white/[0.06] dark:bg-neutral-900/40">
					<span class="font-semibold opacity-50 text-[11px]">Recognized Aliases / Variant Forms</span>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each term.aliases as alias}
							<span class="rounded bg-black/5 px-1.5 py-0.5 font-medium text-[11px] text-neutral-700 dark:bg-white/5 dark:text-neutral-300">
								{alias}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- DESCRIPTION / CONTEXT (IF ANY) -->
			{#if term.context}
				<div class="rounded-xl border border-black/[0.07] bg-white/40 p-2.5 sm:p-3 text-xs dark:border-white/[0.06] dark:bg-neutral-900/40">
					<span class="font-semibold opacity-50 text-[11px]">Context & Story Notes</span>
					<p class="mt-0.5 text-[11px] sm:text-xs leading-relaxed opacity-80">{term.context}</p>
				</div>
			{/if}

			<!-- CUSTOM OVERRIDE EXPLANATION -->
			<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 sm:p-3 text-[11px] sm:text-xs text-blue-900 dark:text-blue-200">
				<p class="leading-relaxed">
					Need a different rendering? You can create a <strong>custom override</strong> in this book or globally without altering the base preset.
				</p>
			</div>
		</div>
	{/if}

	<!-- FOOTER ACTIONS -->
	<svelte:fragment slot="footer">
		<div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
			<Button on:click={() => (open = false)} class="w-full sm:w-auto">Close</Button>

			<div class="flex w-full sm:w-auto items-center gap-2">
				{#if currentScope === 'book'}
					<Button
						variant="primary"
						class="w-full sm:w-auto"
						on:click={() => handleOverride('book')}
					>
						<BookOpen size={14} class="mr-1.5 shrink-0" />
						<span class="truncate">Override in {bookTitle || 'Book'}</span>
					</Button>
				{:else}
					<Button
						variant="primary"
						class="w-full sm:w-auto"
						on:click={() => handleOverride('global')}
					>
						<Globe size={14} class="mr-1.5 shrink-0" />
						<span class="truncate">Custom Override</span>
					</Button>
				{/if}
			</div>
		</div>
	</svelte:fragment>
</Modal>
