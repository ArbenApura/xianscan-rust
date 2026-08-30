<script context="module" lang="ts">
	export interface PackInfo {
		id: string;
		name: string;
		theme: string;
		description: string;
		sourceLang?: string;
		targetLang?: string;
		termCount: number;
		enabled?: boolean;
	}
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { apiFetch } from '$lib/api';
	import { ripple } from '$lib/actions/ripple';
	import { languageName } from '$lib/languages';
	// IMPORTED DEP-COMPONENTS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Check from 'lucide-svelte/icons/check';
	import Package from 'lucide-svelte/icons/package';
	import Search from 'lucide-svelte/icons/search';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import Star from 'lucide-svelte/icons/star';
	import Eye from 'lucide-svelte/icons/eye';
	import Layers from 'lucide-svelte/icons/layers';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	// -- OPTIONAL PROPS -- //

	export let open = false;
	export let packs: PackInfo[] = [];

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{
		close: void;
		change: { enabledPackIds: string[] };
	}>();

	// -- STATES -- //

	let searchQuery = '';
	let selectedPackIds = new Set<string>();
	let busy = false;

	// -- REACTIVE STATES -- //

	$: if (open && packs.length > 0) {
		selectedPackIds = new Set(packs.filter((p) => p.enabled).map((p) => p.id));
	}

	$: visiblePacks = packs.filter((p) => {
		if (!searchQuery.trim()) return true;
		const q = searchQuery.toLowerCase();
		return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.theme.toLowerCase().includes(q);
	});

	$: enabledCount = packs.filter((p) => selectedPackIds.has(p.id)).length;
	$: allVisibleSelected = visiblePacks.length > 0 && visiblePacks.every((p) => selectedPackIds.has(p.id));

	// -- FUNCTIONS -- //

	function togglePackSelection(packId: string) {
		const next = new Set(selectedPackIds);
		if (next.has(packId)) next.delete(packId);
		else next.add(packId);
		selectedPackIds = next;
	}

	function selectAllVisible() {
		const next = new Set(selectedPackIds);
		for (const p of visiblePacks) next.add(p.id);
		selectedPackIds = next;
	}

	function deselectAllVisible() {
		const next = new Set(selectedPackIds);
		for (const p of visiblePacks) next.delete(p.id);
		selectedPackIds = next;
	}

	async function saveAndApply() {
		busy = true;
		const enabledList = [...selectedPackIds];
		try {
			const res = await apiFetch('/api/glossary/packs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabledPackIds: enabledList }),
			});
			if (!res.ok) throw new Error('Failed to save preset pack preferences');
			for (const p of packs) {
				p.enabled = selectedPackIds.has(p.id);
			}
			packs = [...packs];
			dispatch('change', { enabledPackIds: enabledList });
			toast.success(`Active preset themes updated (${enabledList.length} enabled).`);
			open = false;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not save preset packs');
		} finally {
			busy = false;
		}
	}
</script>

<!-- MULTI-PACK SYSTEM PRESETS MANAGER MODAL -->
<Modal
	{open}
	size="lg"
	title="Global Translation Theme Packs"
	on:close={() => {
		open = false;
		dispatch('close');
	}}
>
	<div class="flex flex-col gap-4">
		<!-- TOOLBAR: SEARCH AND QUICK ACTIONS -->
		<div class="flex items-center justify-between gap-3">
			<div class="relative flex-1">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Search themes..."
					class="h-8 w-full rounded-lg border border-black/10 bg-black/[0.02] pl-8 pr-3 text-xs outline-none focus:border-[#b23a2e] dark:border-white/10 dark:bg-white/[0.03]"
				/>
			</div>

			<div class="flex items-center gap-1.5 shrink-0">
				<button
					type="button"
					on:click={selectAllVisible}
					class="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white px-2 py-1 rounded transition cursor-pointer"
				>
					Enable All
				</button>
				<span class="text-neutral-300 dark:text-neutral-700">|</span>
				<button
					type="button"
					on:click={deselectAllVisible}
					class="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white px-2 py-1 rounded transition cursor-pointer"
				>
					Disable All
				</button>
			</div>
		</div>

		<!-- PRESET PACK CARDS LIST -->
		<div class="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.06] rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
			{#each visiblePacks as pack (pack.id)}
				{@const isEnabled = selectedPackIds.has(pack.id)}
				<div class="flex items-center justify-between gap-3 p-3 transition hover:bg-black/[0.015] dark:hover:bg-white/[0.015]">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<h4 class="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
								{pack.name}
							</h4>
							<span class="rounded bg-black/5 px-1.5 py-0.2 text-[10px] font-mono opacity-60 dark:bg-white/5">
								{pack.termCount}
							</span>
						</div>
						<p class="text-[11px] leading-normal opacity-60 truncate mt-0.5">
							{pack.description}
						</p>
					</div>

					<Switch
						checked={isEnabled}
						size="sm"
						ariaLabel={`Enable ${pack.name}`}
						on:change={() => togglePackSelection(pack.id)}
					/>
				</div>
			{/each}
		</div>
	</div>

	<!-- MODAL ACTIONS FOOTER -->
	<svelte:fragment slot="footer">
		<div class="flex w-full items-center justify-between">
			<span class="text-xs font-medium opacity-60">
				{enabledCount} of {packs.length} packs active globally
			</span>
			<div class="flex items-center gap-2">
				<Button on:click={() => (open = false)}>Cancel</Button>
				<Button variant="primary" loading={busy} on:click={saveAndApply}>
					<Check size={14} class="mr-1" /> Apply & Save ({enabledCount})
				</Button>
			</div>
		</div>
	</svelte:fragment>
</Modal>
