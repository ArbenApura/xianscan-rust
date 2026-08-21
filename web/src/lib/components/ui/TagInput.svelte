<script lang="ts">
	// CHIP-STYLE TAG / GENRE INPUT — A WRAP OF REMOVABLE CHIPS, AN INLINE TEXT INPUT, A LIVE SUGGESTION
	// PALETTE, AND A COUNTER. DESIGNED FOR BOOK GENRES/TAGS IN CREATE/EDIT FORMS. VALUE IS BINDABLE.

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	// IMPORTED DEP-COMPONENTS
	import Hash from 'lucide-svelte/icons/hash';
	import Plus from 'lucide-svelte/icons/plus';
	import X from 'lucide-svelte/icons/x';
	// IMPORTED COMPONENTS
	import { ripple } from '$lib/actions/ripple';

	// -- OPTIONAL PROPS -- //

	export let value: string[] = [];
	export let label = '';
	export let placeholder = 'Add a tag…';
	export let suggestions: string[] = [];
	export let max = 24;
	export let showCount = true;

	// -- STATES -- //

	let draft = '';
	let inputEl: HTMLInputElement;

	// -- REACTIVE STATES -- //

	// ALREADY-SELECTED TAG KEYS (LOWERCASED) — CASE-INSENSITIVE DEDUP WITHIN THE INPUT ITSELF.
	$: selectedKeys = new Set(value.map((t) => normalizeKey(t)));

	// SUGGESTIONS THAT ARE STILL ADDABLE, FILTERED BY THE CURRENT DRAFT, CAPPED FOR BREVITY.
	$: visibleSuggestions = suggestions
		.filter((s) => !selectedKeys.has(normalizeKey(s)))
		.filter((s) => !draft.trim() || s.toLowerCase().includes(draft.trim().toLowerCase()))
		.slice(0, 12);

	// -- FUNCTIONS -- //

	function normalizeKey(tag: string): string {
		return tag.trim().toLowerCase();
	}

	function normalize(tag: string): string {
		return tag.trim().replace(/\s+/g, ' ');
	}

	function add(raw: string) {
		const tag = normalize(raw);
		if (!tag) return;
		if (selectedKeys.has(normalizeKey(tag))) {
			draft = '';
			return;
		}
		if (value.length >= max) return;
		value = [...value, tag];
		draft = '';
	}

	function remove(tag: string) {
		value = value.filter((t) => t !== tag);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
			e.preventDefault();
			add(draft);
		} else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
			remove(value[value.length - 1]);
		} else if (e.key === 'Escape') {
			draft = '';
			inputEl?.blur();
		}
	}
</script>

<!-- TAG INPUT — LABEL, CHIP FIELD, SUGGESTION PALETTE, COUNTER -->
<div>
	<!-- LABEL ROW + COUNTER -->
	{#if label}
		<div class="mb-1 flex items-center justify-between">
			<span class="text-xs font-semibold opacity-60">{label}</span>
			{#if showCount}
				<span class="font-mono text-[10px] tabular-nums opacity-40">{value.length}/{max}</span>
			{/if}
		</div>
	{/if}

	<!-- CHIP FIELD — WRAP OF SELECTED CHIPS + INLINE INPUT -->
	<div
		class="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 transition-colors focus-within:border-[#b23a2e] focus-within:ring-2 focus-within:ring-[#b23a2e]/20 dark:border-white/[0.06]"
	>
		<!-- SELECTED TAG CHIPS -->
		{#each value as tag (tag)}
			<span
				class="inline-flex items-center gap-1 rounded-md bg-[#b23a2e]/10 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63]"
			>
				{tag}
				<button
					type="button"
					class="rounded p-0.5 transition-opacity hover:opacity-70"
					on:click={() => remove(tag)}
					aria-label={`Remove ${tag}`}
					use:ripple
				>
					<X size={11} />
				</button>
			</span>
		{/each}

		<!-- INLINE ADD-INPUT — HIDDEN AT MAX SO THE FIELD READS AS A FINISHED CHIP LIST -->
		{#if value.length < max}
			<input
				bind:this={inputEl}
				bind:value={draft}
				type="text"
				maxlength={40}
				{placeholder}
				class="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:opacity-40"
				on:keydown={onKeydown}
				on:blur={() => add(draft)}
			/>
		{/if}

		<!-- ADD BUTTON (ACTIVE ONLY WHEN THERE IS A DRAFT) -->
		{#if draft.trim() && value.length < max}
			<button
				type="button"
				class="shrink-0 rounded-md p-1 text-[#b23a2e] transition-opacity hover:opacity-70 dark:text-[#e08a63]"
				on:click={() => add(draft)}
				aria-label="Add tag"
				use:ripple
			>
				<Plus size={13} />
			</button>
		{/if}
	</div>

	<!-- SUGGESTION PALETTE — QUICK-ADD CHIPS FOR COMMON GENRES / EXISTING TAGS (HIDDEN AT MAX) -->
	{#if value.length < max && visibleSuggestions.length > 0}
		<div class="mt-1.5 flex flex-wrap gap-1.5">
			{#each visibleSuggestions as suggestion (suggestion)}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.02] px-2 py-0.5 text-[10px] font-medium opacity-70 transition-colors hover:border-[#b23a2e]/40 hover:text-[#b23a2e] dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:text-[#e08a63]"
					on:click={() => add(suggestion)}
					title={`Add ${suggestion}`}
					use:ripple
				>
					<Hash size={10} class="opacity-50" />
					{suggestion}
				</button>
			{/each}
		</div>
	{:else if value.length === 0}
		<p class="mt-1.5 text-[10px] opacity-40">No tags yet. Type one and press Enter, or pick from the suggestions.</p>
	{/if}
</div>
