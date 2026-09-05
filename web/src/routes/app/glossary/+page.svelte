<script lang="ts">
	// IMPORTED TYPES
	import type { PageData } from './$types';
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { apiFetch } from '$lib/api';
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Globe from 'lucide-svelte/icons/globe';
	import Layers from 'lucide-svelte/icons/layers';
	import Package from 'lucide-svelte/icons/package';
	// IMPORTED COMPONENTS
	import Button from '$lib/components/ui/Button.svelte';
	import GlossaryPanel from '$lib/components/GlossaryPanel.svelte';
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
	import PresetPacksModal from '$lib/components/glossary/PresetPacksModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	// -- REQUIRED PROPS -- //

	export let data: PageData;

	// -- STATES -- //

	let books = data.books;
	let sourceLang = data.initialSourceLang;
	let targetLang = data.initialTargetLang;
	let scope: 'global' | 'book' = data.initialScope;
	let selectedBookId = data.initialBookId || (books.length > 0 ? books[0].id : '');
	let mounted = false;
	let packsHash = 0;
	let presetModalOpen = false;

	// -- REACTIVE STATES -- //

	$: books = data.books;
	$: selectedBook = books.find((b) => b.id === selectedBookId);
	$: bookSelectItems = books
		.filter((b) => !b.archived || b.id === selectedBookId)
		.map((b) => ({
			value: b.id,
			label: (b.titleTarget?.trim() || b.title) + (b.archived ? ' (Archived)' : ''),
		}));

	// -- REACTIVE STATEMENTS -- //

	$: {
		const s = $page.url.searchParams.get('scope');
		const b = $page.url.searchParams.get('bookId');
		const src = $page.url.searchParams.get('src');
		const tgt = $page.url.searchParams.get('tgt');

		if (s === 'book' || s === 'global') {
			if (scope !== s) scope = s;
		}
		if (b && b !== selectedBookId && books.some((x) => x.id === b)) {
			selectedBookId = b;
		}
		if (src && src !== sourceLang) {
			sourceLang = src;
		}
		if (tgt && tgt !== targetLang) {
			targetLang = tgt;
		}
	}

	// -- FUNCTIONS -- //

	async function togglePack(packId: string, enabled: boolean) {
		try {
			const res = await apiFetch('/api/glossary/packs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ packId, enabled }),
			});
			if (!res.ok) throw new Error('Failed to update pack status');
			if (data.packs) {
				const target = data.packs.find((p) => p.id === packId);
				if (target) target.enabled = enabled;
				data.packs = [...data.packs];
			}
			packsHash++;
			toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${packId} theme pack.`);
		} catch {
			toast.error('Failed to toggle theme pack.');
		}
	}

	function syncUrl(newScope: 'global' | 'book', bId: string, src: string, tgt: string) {
		if (!mounted) return;
		const params = new URLSearchParams();
		params.set('scope', newScope);
		if (newScope === 'book') {
			if (bId) params.set('bookId', bId);
		} else {
			if (src) params.set('src', src);
			if (tgt) params.set('tgt', tgt);
		}
		const newSearch = `?${params.toString()}`;
		if ($page.url.search !== newSearch) {
			goto(`/app/glossary/${newSearch}`, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	function setScope(newScope: 'global' | 'book') {
		scope = newScope;
		if (newScope === 'book' && !selectedBookId && books.length > 0) {
			selectedBookId = books[0].id;
		}
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

	function onSelectBook(bId: string) {
		selectedBookId = bId;
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

	function onSourceLangChange(lang: string) {
		sourceLang = lang;
		if (targetLang === lang) {
			targetLang = lang === 'en' ? 'zh-Hans' : 'en';
		}
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

	function onTargetLangChange(lang: string) {
		targetLang = lang;
		if (sourceLang === lang) {
			sourceLang = lang === 'en' ? 'zh-Hans' : 'en';
		}
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		mounted = true;
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	});
</script>

<svelte:head>
	<title>{scope === 'global' ? 'Global' : 'Book'} Glossary - XianScan</title>
	<meta
		name="description"
		content="Manage translation glossary terms, aliases, and character names for comic translation."
	/>
</svelte:head>

<!-- GLOSSARY MANAGEMENT DASHBOARD -->
<div class="flex flex-col gap-6 pb-8 sm:pb-0">
	<!-- BREADCRUMB NAVIGATION -->
	<nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-xs sm:text-sm">
		<a
			href="/app/"
			class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium opacity-65 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
			use:ripple
			title="Back to Library"
		>
			<ArrowLeft size={14} />
			<span>Library</span>
		</a>

		<ChevronRight size={14} class="shrink-0 opacity-30" />

		<span class="truncate font-semibold opacity-90"> Glossary Terms </span>

		{#if scope === 'book' && selectedBook}
			<ChevronRight size={14} class="shrink-0 opacity-30" />
			<span
				class="max-w-[160px] truncate font-medium opacity-70 sm:max-w-xs"
				title={selectedBook.titleTarget
					? `${selectedBook.titleTarget} (${selectedBook.title})`
					: selectedBook.title}
			>
				{selectedBook.titleTarget || selectedBook.title}
			</span>
		{/if}
	</nav>

	<!-- HERO HEADER CARD -->
	<div
		class="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white/50 p-6 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.02]"
	>
		<div class="flex flex-col gap-4 min-[750px]:flex-row min-[750px]:items-center min-[750px]:justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Glossary Terms</h1>
				<p class="mt-1 text-sm opacity-60">
					{scope === 'global'
						? 'Global terms applied to every book matching the selected language pair.'
						: 'Book-specific terms and character names private to the selected book.'}
				</p>
			</div>

			<!-- SCOPE SWITCHER TABS -->
			<div
				class="flex items-center gap-1 self-start rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.04] min-[750px]:self-auto"
			>
				<button
					type="button"
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
						scope === 'global'
							? 'shadow-xs bg-white font-semibold text-black dark:bg-[#201c18] dark:text-white'
							: 'opacity-60 hover:opacity-100'
					}`}
					on:click={() => setScope('global')}
					use:ripple
				>
					<Globe size={14} />
					<span>Global Scope</span>
				</button>
				<button
					type="button"
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
						scope === 'book'
							? 'shadow-xs bg-white font-semibold text-black dark:bg-[#201c18] dark:text-white'
							: 'opacity-60 hover:opacity-100'
					}`}
					on:click={() => setScope('book')}
					use:ripple
				>
					<BookOpen size={14} />
					<span>Book Scope</span>
				</button>
			</div>
		</div>
	</div>

	<!-- SCOPE CONTROLS CARD -->
	{#if scope === 'global'}
		<div
			class="flex flex-col gap-3 rounded-2xl border border-black/[0.08] bg-white/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
				<div class="min-w-0">
					<span class="mb-1 block text-xs font-semibold opacity-60">Source (original)</span>
					<LanguagePicker
						mode="source"
						value={sourceLang}
						excludeCode={targetLang}
						on:change={(e) => onSourceLangChange(e.detail)}
					/>
				</div>
				<span class="hidden pb-2 text-center text-sm font-bold opacity-40 sm:block">→</span>
				<div class="min-w-0">
					<span class="mb-1 block text-xs font-semibold opacity-60">Target (translation)</span>
					<LanguagePicker
						value={targetLang}
						excludeCode={sourceLang}
						on:change={(e) => onTargetLangChange(e.detail)}
					/>
				</div>
			</div>

			<!-- MINIMAL UNIVERSAL THEMES BAR -->
			<div
				class="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-white/[0.015]"
			>
				<div class="flex min-w-0 flex-wrap items-center gap-1.5">
					<div class="mr-1 flex items-center gap-1.5 font-semibold opacity-70">
						<Package size={13} class="shrink-0 text-amber-600 dark:text-amber-400" />
						<span>Theme Presets</span>
						<span class="py-0.2 rounded-md bg-black/5 px-1.5 font-mono text-[10px] dark:bg-white/5">
							{(data.packs || []).filter((p) => p.enabled).length}/{(data.packs || []).length}
						</span>
					</div>

					{#each data.packs || [] as pack (pack.id)}
						<button
							type="button"
							on:click={() => togglePack(pack.id, !pack.enabled)}
							class={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
								pack.enabled
									? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
									: 'border-transparent bg-black/[0.03] opacity-45 hover:opacity-75 dark:bg-white/[0.03]'
							}`}
							title={`${pack.name} (${pack.enabled ? 'Enabled' : 'Disabled'}) - Click to toggle`}
						>
							<span class={`h-1.5 w-1.5 rounded-full ${pack.enabled ? 'bg-amber-500' : 'bg-neutral-400'}`}
							></span>
							<span>{pack.name.split(' ')[0].replace(/[,/&]/g, '')}</span>
						</button>
					{/each}
				</div>

				<Button
					size="sm"
					variant="ghost"
					class="h-6 shrink-0 px-2 text-xs text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
					on:click={() => (presetModalOpen = true)}
				>
					<Layers size={12} class="mr-1 opacity-70" />
					<span>Manage</span>
				</Button>
			</div>
		</div>

		<PresetPacksModal
			bind:open={presetModalOpen}
			packs={data.packs || []}
			on:change={(e) => {
				const enabledSet = new Set(e.detail.enabledPackIds);
				if (data.packs) {
					for (const p of data.packs) {
						p.enabled = enabledSet.has(p.id);
					}
					data.packs = [...data.packs];
				}
				packsHash++;
			}}
		/>

		{#key `${sourceLang}>${targetLang}>${packsHash}`}
			<GlossaryPanel
				scope="global"
				{sourceLang}
				{targetLang}
				initialRows={packsHash === 0 &&
				data.initialScope === 'global' &&
				data.initialSourceLang === sourceLang &&
				data.initialTargetLang === targetLang
					? data.initialGlossary.rows
					: null}
				initialTotal={packsHash === 0 &&
				data.initialScope === 'global' &&
				data.initialSourceLang === sourceLang &&
				data.initialTargetLang === targetLang
					? data.initialGlossary.total
					: null}
			/>
		{/key}
	{:else if selectedBookId && selectedBook}
		{#key selectedBookId}
			<GlossaryPanel
				scope="book"
				bookId={selectedBookId}
				bookTitle={selectedBook.titleTarget || selectedBook.title}
				initialRows={data.initialScope === 'book' && data.initialBookId === selectedBookId
					? data.initialGlossary.rows
					: null}
				initialTotal={data.initialScope === 'book' && data.initialBookId === selectedBookId
					? data.initialGlossary.total
					: null}
			>
				<svelte:fragment slot="prefix">
					{#if books.length > 0}
						<div class="w-40 sm:w-48 min-[750px]:w-60">
							<Select
								items={bookSelectItems}
								value={selectedBookId}
								on:change={(e) => onSelectBook(String(e.detail))}
							/>
						</div>
					{/if}
				</svelte:fragment>
			</GlossaryPanel>
		{/key}
	{:else if books.length === 0}
		<div
			class="rounded-2xl border border-dashed border-black/15 p-12 text-center text-sm opacity-60 dark:border-white/15"
		>
			Create a book first to add book-specific glossary terms.
		</div>
	{/if}
</div>
