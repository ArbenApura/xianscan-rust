<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { TargetOption } from '$lib/languages';
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED MODULES
	import { languageName, NO_TRANSLATION, SOURCE_LANGUAGE_OPTIONS, targetLanguageOptions } from '$lib/languages';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Languages from 'lucide-svelte/icons/languages';
	import Search from 'lucide-svelte/icons/search';

	// -- PORTAL HELPER FOR MOUNTING TO DOCUMENT BODY -- //
	function portal(node: HTMLElement, target: HTMLElement) {
		target.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}

	// -- REQUIRED PROPS -- //

	export let value: string;

	// -- OPTIONAL PROPS -- //

	export let mode: 'target' | 'source' = 'target';
	export let allowNone = false;
	export let excludeCode: string | null = null;
	let klass = '';
	export { klass as class };

	// -- TYPES -- //

	type Group = { tier: 1 | 2 | 3; label: string; items: TargetOption[] };

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{ change: string }>();
	const TARGET_ALL = targetLanguageOptions();
	const SOURCE_ALL: TargetOption[] = SOURCE_LANGUAGE_OPTIONS.map((o) => ({
		value: o.value,
		name: o.name,
		endonym: o.endonym,
		tier: 1 as const,
		script: 'latin' as const,
		rtl: false,
	}));
	const TIER_LABEL: Record<1 | 2 | 3, string> = {
		1: 'Best — production quality',
		2: 'Strong',
		3: 'Usable',
	};

	// -- STATES -- //

	let open = false;
	let query = '';
	let searchEl: HTMLInputElement | undefined;
	let triggerEl: HTMLButtonElement | undefined;
	let dropdownEl: HTMLDivElement | undefined;
	let portalTarget: HTMLDivElement;
	let dropdownStyle = '';

	// -- REACTIVE STATES -- //

	$: isSource = mode === 'source';
	$: isNone = value === NO_TRANSLATION;
	$: selectedName = languageName(value);
	$: selectedEndonym = isNone
		? ''
		: isSource
			? (SOURCE_ALL.find((l) => l.value === value)?.endonym ?? '')
			: (TARGET_ALL.find((l) => l.value === value)?.endonym ?? '');
	$: q = query.trim().toLowerCase();
	$: baseList = isSource ? SOURCE_ALL : TARGET_ALL;
	$: availableList = excludeCode ? baseList.filter((l) => l.value !== excludeCode) : baseList;
	$: filtered = q
		? availableList.filter(
				(l) =>
					l.name.toLowerCase().includes(q) ||
					l.endonym.toLowerCase().includes(q) ||
					l.value.toLowerCase().includes(q),
			)
		: availableList;
	$: groups = isSource
		? ([{ tier: 1 as const, label: 'Source Options', items: filtered }])
		: ([1, 2, 3] as const)
				.map((tier) => ({ tier, label: TIER_LABEL[tier], items: filtered.filter((l) => l.tier === tier) }))
				.filter((g) => g.items.length > 0) satisfies Group[];
	$: showNoneRow = allowNone && (!q || 'original'.includes(q) || 'none'.includes(q));
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];

	// -- FUNCTIONS -- //

	function updatePosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const gap = 6;
		const maxH = 320;
		const width = Math.max(260, rect.width);
		let left = rect.left;
		if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
		if (left < 8) left = 8;
		const spaceBelow = window.innerHeight - rect.bottom - gap;
		const spaceAbove = rect.top - gap;
		const base = `left:${Math.round(left)}px;width:${Math.round(width)}px;`;
		if (spaceBelow < maxH && spaceAbove > spaceBelow) {
			dropdownStyle = `${base}bottom:${Math.round(window.innerHeight - rect.top + gap)}px;`;
		} else {
			dropdownStyle = `${base}top:${Math.round(rect.bottom + gap)}px;`;
		}
	}

	async function toggle() {
		open = !open;
		if (open) {
			query = '';
			updatePosition();
			await tick();
			updatePosition();
			searchEl?.focus();
		}
	}

	function close() {
		open = false;
	}

	function pick(code: string) {
		value = code;
		dispatch('change', code);
		close();
		triggerEl?.focus();
	}

	function onClickOutside(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (triggerEl?.contains(t) || dropdownEl?.contains(t)) return;
		close();
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			close();
			triggerEl?.focus();
		}
	}

	function onScroll() {
		if (open) updatePosition();
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		portalTarget = document.createElement('div');
		document.body.appendChild(portalTarget);
		document.addEventListener('mousedown', onClickOutside);
		document.addEventListener('keydown', onKeydown);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onScroll);
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('mousedown', onClickOutside);
			document.removeEventListener('keydown', onKeydown);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
			if (portalTarget?.parentNode) portalTarget.parentNode.removeChild(portalTarget);
		}
	});
</script>

<!-- TRIGGER -->
<div class={cn('relative', klass)}>
	<button
		bind:this={triggerEl}
		use:ripple
		type="button"
		on:click={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
		class={cn(
			'flex w-full items-center gap-2 rounded-lg border bg-transparent px-3 py-2 text-left text-sm transition-colors',
			open
				? 'border-[#b23a2e] ring-1 ring-[#b23a2e]'
				: 'border-black/10 hover:border-black/20 dark:border-white/[0.08] dark:hover:border-white/20',
		)}
	>
		{#if isNone}
			<BookOpen size={15} class="shrink-0 opacity-60" />
		{:else}
			<Languages size={15} class="shrink-0 opacity-60 text-[#b23a2e] dark:text-[#e08a63]" />
		{/if}
		<span class="min-w-0 flex-1 truncate">
			{selectedName}{#if selectedEndonym && selectedEndonym !== selectedName}<span class="opacity-50">
					· {selectedEndonym}</span
				>{/if}
		</span>
		<ChevronDown size={15} class={cn('shrink-0 opacity-50 transition-transform duration-200', open && 'rotate-180')} />
	</button>
</div>

<!-- PORTALED POPOVER (MOUNTED DIRECTLY TO document.body SO DIALOGS CANNOT CLIP OR OVERFLOW IT) -->
{#if open && portalTarget}
	<div
		bind:this={dropdownEl}
		use:portal={portalTarget}
		transition:fly={{ y: -8, duration: 160, easing: cubicOut }}
		style={dropdownStyle}
		class={cn(
			'fixed z-[9999] overflow-hidden rounded-xl border shadow-2xl',
			popover,
			popoverBorder,
		)}
	>
		<!-- SEARCH -->
		<div class="border-b border-black/[0.06] p-2 dark:border-white/[0.06]">
			<div class="relative">
				<Search
					size={14}
					class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40"
				/>
				<input
					bind:this={searchEl}
					bind:value={query}
					type="text"
					placeholder="Search languages…"
					class="w-full rounded-lg border border-black/10 bg-transparent py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[#b23a2e] dark:border-white/[0.08]"
				/>
			</div>
		</div>

		<!-- OPTIONS -->
		<div class="max-h-64 overflow-y-auto py-1">
			{#if showNoneRow}
				<button
					use:ripple
					type="button"
					on:click={() => pick(NO_TRANSLATION)}
					class={cn(
						'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
						isNone
							? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
							: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
					)}
				>
					<BookOpen size={16} class="shrink-0 opacity-70" />
					<span class="min-w-0 flex-1">
						<span class="block font-medium">Read in original</span>
						<span class="block text-[11px] opacity-50">No translation — just the source text</span>
					</span>
					{#if isNone}<Check size={15} class="shrink-0" />{/if}
				</button>
				<div class="my-1 border-t border-black/[0.06] dark:border-white/[0.06]"></div>
			{/if}

			{#each groups as group (group.tier)}
				<div class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider opacity-40">
					{group.label}
				</div>
				{#each group.items as lang (lang.value)}
					<button
						use:ripple
						type="button"
						on:click={() => pick(lang.value)}
						class={cn(
							'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors',
							value === lang.value
								? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
								: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
						)}
					>
						<span class="min-w-0 flex-1 truncate">
							{lang.name}{#if lang.endonym && lang.endonym !== lang.name}<span class="opacity-50">
									· {lang.endonym}</span
								>{/if}
						</span>
						{#if lang.rtl}<span
								class="shrink-0 rounded bg-black/[0.06] px-1 text-[9px] font-medium opacity-60 dark:bg-white/[0.08]"
								>RTL</span
							>{/if}
						{#if value === lang.value}<Check size={15} class="shrink-0" />{/if}
					</button>
				{/each}
			{/each}

			{#if groups.length === 0 && !showNoneRow}
				<p class="px-3 py-6 text-center text-sm opacity-40">No language matches “{query}”.</p>
			{/if}
		</div>
	</div>
{/if}
