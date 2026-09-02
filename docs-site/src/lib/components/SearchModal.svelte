<script lang="ts">
	// -- IMPORTED DEP-MODULES -- //
	import { tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';
	import CornerDownLeft from 'lucide-svelte/icons/corner-down-left';
	import ArrowUp from 'lucide-svelte/icons/arrow-up';
	import ArrowDown from 'lucide-svelte/icons/arrow-down';
	import FileText from 'lucide-svelte/icons/file-text';
	import Hash from 'lucide-svelte/icons/hash';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Sparkles from 'lucide-svelte/icons/sparkles';

	// -- IMPORTED MODULES -- //
	import { searchDocs, type SearchResultItem } from '$lib/search-index';
	import { themeStore, THEME_PANEL } from '$lib/stores/theme';
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';

	// -- PROPS -- //

	export let open = false;
	export let onClose: () => void = () => {};

	// -- STATES -- //

	let query = '';
	let results: SearchResultItem[] = [];
	let selectedIndex = 0;
	let inputEl: HTMLInputElement | null = null;
	let resultsContainerEl: HTMLDivElement | null = null;

	// -- REACTIVITY -- //

	let prevOpen = false;

	$: if (open !== prevOpen) {
		prevOpen = open;
		if (open) {
			query = '';
			results = [];
			selectedIndex = 0;
			tick().then(() => {
				inputEl?.focus();
			});
		} else {
			query = '';
			results = [];
			selectedIndex = 0;
		}
	}

	// -- HANDLERS -- //

	function handleInput() {
		results = query ? searchDocs(query) : [];
		selectedIndex = 0;
	}

	function handleSelect(item: SearchResultItem) {
		onClose();
		const isHash = item.href.includes('#');
		const [path, hash] = item.href.split('#');

		goto(item.href).then(() => {
			if (isHash && hash && typeof document !== 'undefined') {
				setTimeout(() => {
					const el = document.getElementById(hash);
					if (el) {
						el.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				}, 60);
			}
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}

		const currentList = (query && results.length > 0) ? results : (query ? [] : QUICK_LINKS);
		if (currentList.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = (selectedIndex + 1) % currentList.length;
			scrollActiveIntoView();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = (selectedIndex - 1 + currentList.length) % currentList.length;
			scrollActiveIntoView();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = currentList[selectedIndex];
			if (target) {
				handleSelect(target);
			}
		}
	}

	function scrollActiveIntoView() {
		tick().then(() => {
			const activeEl = resultsContainerEl?.querySelector(`[data-index="${selectedIndex}"]`);
			if (activeEl) {
				activeEl.scrollIntoView({ block: 'nearest' });
			}
		});
	}

	// POPULAR SEARCH SHORTCUTS WHEN EMPTY
	const QUICK_LINKS: SearchResultItem[] = [
		{ id: 'ql-1', title: 'Quick Start (3-Minute Setup)', href: '/docs/getting-started/quick-start', category: 'Getting Started', desc: 'Deploy standalone binary with DirectML / CUDA acceleration' },
		{ id: 'ql-2', title: 'Browser Web Importer', href: '/docs/extensions/importer', category: 'Reading Everywhere', desc: 'Single-click extension import from online raw comic portals' },
		{ id: 'ql-3', title: 'Chinese Manhua Benchmark', href: '/docs/benchmarks/manhua', category: 'Format Benchmarks', desc: 'Multi-line Daoist speech bubble detection and translation' },
		{ id: 'ql-4', title: 'GPU Hardware Acceleration', href: '/docs/advanced/gpu', category: 'Advanced Hub', desc: 'DirectML, CUDA 12, and CoreML runtime configuration' },
		{ id: 'ql-5', title: 'Preset Themes & Glossaries', href: '/docs/translation/glossaries', category: 'AI & Translation', desc: 'Xianxia, Murim, and Fantasy custom terminology packs' },
	];
</script>

<svelte:window on:keydown={(e) => open && (e.key === 'Escape' ? onClose() : handleKeyDown(e))} />

{#if open}
	<!-- BACKDROP OVERLAY -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center p-3 pt-12 sm:p-6 sm:pt-20 bg-black/50 backdrop-blur-md"
		role="dialog"
		aria-modal="true"
		aria-label="Search documentation"
		tabindex="-1"
		transition:fade={{ duration: 150 }}
	>
		<!-- BACKDROP CLICK DISMISS BUTTON -->
		<button
			type="button"
			class="fixed inset-0 h-full w-full bg-transparent cursor-default outline-none"
			on:click={onClose}
			aria-label="Close search dialog"
			tabindex="-1"
		></button>

		<!-- SLICK ELEVATED MODAL CARD PANEL -->
		<div
			class={cn(
				'relative z-10 w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[82vh]',
				THEME_PANEL[$themeStore]
			)}
			role="region"
			aria-label="Search modal panel"
			tabindex="-1"
			transition:fly={{ y: -16, duration: 200, easing: cubicOut }}
		>
			<!-- SEARCH BAR INPUT HEADER (CLEAN MINIMALIST INKWELL) -->
			<div class="relative flex items-center gap-3 border-b border-black/10 dark:border-white/10 px-4 py-3 sm:px-5 sm:py-3.5">
				<Search size={18} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 opacity-90" />
				<input
					bind:this={inputEl}
					bind:value={query}
					on:input={handleInput}
					type="search"
					placeholder="Search documentation, chapters, and topics..."
					class="w-full bg-transparent text-sm sm:text-base outline-none placeholder:opacity-40 text-inherit font-medium border-0 focus:outline-none focus:ring-0"
					autocomplete="off"
					spellcheck="false"
				/>
				<div class="flex items-center gap-1.5 shrink-0">
					{#if query}
						<button
							type="button"
							on:click={() => {
								query = '';
								handleInput();
								inputEl?.focus();
							}}
							aria-label="Clear query"
							class="rounded-lg p-1.5 opacity-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
						>
							<X size={15} />
						</button>
					{/if}
					<button
						type="button"
						on:click={onClose}
						aria-label="Close search modal"
						class="hidden sm:inline-flex items-center rounded-md border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-0.5 text-[11px] font-mono font-medium opacity-60 hover:opacity-100 transition-opacity"
					>
						ESC
					</button>
				</div>
			</div>

			<!-- RESULTS / POPULAR SECTIONS CONTAINER -->
			<div
				bind:this={resultsContainerEl}
				class="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1"
			>
				{#if query && results.length > 0}
					<div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-50">
						<span>Search Results</span>
						<span>{results.length} Found</span>
					</div>
					{#each results as item, idx}
						<button
							type="button"
							data-index={idx}
							use:ripple
							on:click={() => handleSelect(item)}
							on:mouseenter={() => (selectedIndex = idx)}
							class={cn(
								'w-full text-left rounded-xl p-3 transition-all flex items-start justify-between gap-3 group relative cursor-pointer',
								selectedIndex === idx
									? 'bg-[#b23a2e]/[0.08] dark:bg-[#e08a63]/[0.12] ring-1 ring-[#b23a2e]/25 dark:ring-[#e08a63]/30'
									: 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
							)}
						>
							<div class="space-y-1 min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap">
									{#if item.href.includes('#')}
										<Hash size={14} class="shrink-0 {selectedIndex === idx ? 'text-[#b23a2e] dark:text-[#e08a63]' : 'opacity-50'}" />
									{:else}
										<FileText size={14} class="shrink-0 {selectedIndex === idx ? 'text-[#b23a2e] dark:text-[#e08a63]' : 'opacity-50'}" />
									{/if}
									<span class="text-xs sm:text-sm font-semibold truncate text-inherit">
										{item.title}
									</span>
									{#if item.sectionTitle !== item.title}
										<span class="text-[11px] opacity-50 truncate">
											· {item.sectionTitle}
										</span>
									{/if}
								</div>
								{#if item.snippet}
									<p class="text-xs opacity-70 line-clamp-2 pl-5.5 leading-relaxed font-normal">
										{item.snippet}
									</p>
								{/if}
							</div>
							<div class="flex items-center gap-2 shrink-0 pt-0.5">
								<span class="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-medium opacity-70">
									{item.category}
								</span>
								<ArrowRight size={13} class="opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all duration-150 {selectedIndex === idx ? 'opacity-100 translate-x-0 text-[#b23a2e] dark:text-[#e08a63]' : ''}" />
							</div>
						</button>
					{/each}
				{:else if query && results.length === 0}
					<!-- NO RESULTS FOUND STATE (CLEAN EAST ASIAN SEAL STYLE) -->
					<div class="py-12 px-4 text-center space-y-3">
						<div class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.04] opacity-70">
							<Search size={18} class="opacity-60" />
						</div>
						<div class="space-y-1">
							<p class="text-sm font-semibold text-inherit">
								No matching documentation found
							</p>
							<p class="text-xs opacity-60 max-w-sm mx-auto leading-relaxed">
								No results for "<span class="font-medium text-inherit">{query}</span>". Try searching for topics like "DirectML", "Mihon", "OCR", or "Glossary".
							</p>
						</div>
					</div>
				{:else}
					<!-- POPULAR CHAPTERS (MINIMALIST SUGGESTIONS) -->
					<div class="p-2 space-y-2">
						<div class="flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider opacity-50">
							<Sparkles size={12} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Popular Documentation</span>
						</div>
						<div class="space-y-1">
							{#each QUICK_LINKS as link, idx}
								<button
									type="button"
									data-index={idx}
									use:ripple
									on:click={() => handleSelect(link)}
									on:mouseenter={() => (selectedIndex = idx)}
									class={cn(
										'w-full text-left rounded-xl p-2.5 text-xs sm:text-sm font-medium transition-all flex items-center justify-between group cursor-pointer',
										selectedIndex === idx
											? 'bg-[#b23a2e]/[0.08] dark:bg-[#e08a63]/[0.12] ring-1 ring-[#b23a2e]/25 dark:ring-[#e08a63]/30'
											: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
									)}
								>
									<div class="flex items-center gap-3 min-w-0">
										<div class="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.03] dark:bg-white/[0.04] group-hover:bg-[#b23a2e]/10 group-hover:text-[#b23a2e] dark:group-hover:text-[#e08a63] transition-colors shrink-0">
											<FileText size={14} class="opacity-60 group-hover:opacity-100 {selectedIndex === idx ? 'text-[#b23a2e] dark:text-[#e08a63] opacity-100' : ''}" />
										</div>
										<div class="min-w-0">
											<div class="truncate font-semibold text-inherit">{link.title}</div>
											<div class="text-[11px] opacity-50 truncate font-normal">{link.desc}</div>
										</div>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<span class="text-[10px] opacity-50 shrink-0 font-medium rounded-md px-2 py-0.5 bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
											{link.category}
										</span>
										<ArrowRight size={13} class="opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all duration-150 {selectedIndex === idx ? 'opacity-100 translate-x-0 text-[#b23a2e] dark:text-[#e08a63]' : ''}" />
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- SLICK FOOTER WITH CONVENTIONAL KEYBOARD HINTS -->
			<div class="border-t border-black/10 dark:border-white/10 px-4 py-2.5 sm:px-5 flex items-center justify-between text-[11px] opacity-60">
				<div class="hidden sm:flex items-center gap-4">
					<span class="flex items-center gap-1">
						<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1 py-0.5 font-mono text-[9px]">
							<ArrowUp size={9} class="inline" />
						</kbd>
						<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1 py-0.5 font-mono text-[9px]">
							<ArrowDown size={9} class="inline" />
						</kbd>
						<span class="text-[11px]">Navigate</span>
					</span>
					<span class="flex items-center gap-1">
						<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px]">
							<CornerDownLeft size={9} class="inline" />
						</kbd>
						<span class="text-[11px]">Select</span>
					</span>
					<span class="flex items-center gap-1">
						<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px]">ESC</kbd>
						<span class="text-[11px]">Close</span>
					</span>
				</div>
				<div class="text-[11px] ml-auto font-medium">
					<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">XianScan</span> Documentation
				</div>
			</div>
		</div>
	</div>
{/if}

