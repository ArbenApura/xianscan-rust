<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ripple } from '$lib/actions/ripple';
	import GlossaryPanel from '$lib/components/GlossaryPanel.svelte';
	import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Globe from 'lucide-svelte/icons/globe';
	import type { PageData } from './$types';

	export let data: PageData;

	let books = data.books;
	let sourceLang = data.initialSourceLang;
	let targetLang = data.initialTargetLang;
	let scope: 'global' | 'book' = data.initialScope;
	let selectedBookId = data.initialBookId || (books.length > 0 ? books[0].id : '');
	let mounted = false;

	$: books = data.books;

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

	onMount(() => {
		mounted = true;
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	});

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
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

	function onTargetLangChange(lang: string) {
		targetLang = lang;
		syncUrl(scope, selectedBookId, sourceLang, targetLang);
	}

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

	$: selectedBook = books.find((b) => b.id === selectedBookId);
	$: bookSelectItems = books.map((b) => {
		const primary = b.titleTarget?.trim() || b.title;
		const hint = b.titleTarget?.trim() && b.title ? b.title : undefined;
		return {
			value: b.id,
			label: primary,
			hint,
		};
	});
</script>

<svelte:head>
	<title>{scope === 'global' ? 'Global' : 'Book'} Glossary - XianScan</title>
	<meta name="description" content="Manage translation glossary terms, aliases, and character names for comic translation." />
</svelte:head>

<!-- GLOSSARY MANAGEMENT DASHBOARD -->
<div class="flex flex-col gap-6 pb-8 sm:pb-0">
	<!-- BREADCRUMB NAVIGATION -->
	<nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-xs sm:text-sm">
		<a
			href="/app/"
			class="inline-flex items-center gap-1.5 rounded-lg py-1 px-2 font-medium opacity-65 transition hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
			use:ripple
			title="Back to Library"
		>
			<ArrowLeft size={14} />
			<span>Library</span>
		</a>
		
		<ChevronRight size={14} class="opacity-30 shrink-0" />

		<span class="font-semibold truncate opacity-90">
			Glossary Terms
		</span>

		{#if scope === 'book' && selectedBook}
			<ChevronRight size={14} class="opacity-30 shrink-0" />
			<span class="opacity-70 truncate max-w-[160px] sm:max-w-xs font-medium" title={selectedBook.titleTarget ? `${selectedBook.titleTarget} (${selectedBook.title})` : selectedBook.title}>
				{selectedBook.titleTarget || selectedBook.title}
			</span>
		{/if}
	</nav>

	<!-- HERO HEADER CARD -->
	<div class="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white/50 p-6 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.02]">
		<div class="flex flex-col gap-4 min-[750px]:flex-row min-[750px]:items-center min-[750px]:justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Glossary Terms</h1>
				<p class="mt-1 text-sm opacity-60">
					{scope === 'global'
						? 'Global terms applied to every book matching the selected language pair.'
						: 'Book-specific terms and character names private to the selected series.'}
				</p>
			</div>

			<!-- SCOPE SWITCHER TABS -->
			<div class="flex items-center gap-1 self-start rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.04] min-[750px]:self-auto">
				<button
					type="button"
					class={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
						scope === 'global'
							? 'bg-white font-semibold text-black shadow-xs dark:bg-[#201c18] dark:text-white'
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
							? 'bg-white font-semibold text-black shadow-xs dark:bg-[#201c18] dark:text-white'
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
		<div class="rounded-2xl border border-black/[0.08] bg-white/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
				<div class="min-w-0">
					<span class="mb-1 block text-xs font-semibold opacity-60">Source (original)</span>
					<LanguagePicker mode="source" value={sourceLang} on:change={(e) => onSourceLangChange(e.detail)} />
				</div>
				<span class="hidden pb-2 text-center text-sm font-bold opacity-40 sm:block">→</span>
				<div class="min-w-0">
					<span class="mb-1 block text-xs font-semibold opacity-60">Target (translation)</span>
					<LanguagePicker value={targetLang} on:change={(e) => onTargetLangChange(e.detail)} />
				</div>
			</div>
		</div>

		{#key `${sourceLang}>${targetLang}`}
			<GlossaryPanel
				scope="global"
				{sourceLang}
				{targetLang}
				initialRows={data.initialScope === 'global' && data.initialSourceLang === sourceLang && data.initialTargetLang === targetLang ? data.initialGlossary.rows : null}
				initialTotal={data.initialScope === 'global' && data.initialSourceLang === sourceLang && data.initialTargetLang === targetLang ? data.initialGlossary.total : null}
			/>
		{/key}
	{:else}
		{#if selectedBookId && selectedBook}
			{#key selectedBookId}
				<GlossaryPanel
					scope="book"
					bookId={selectedBookId}
					bookTitle={selectedBook.titleTarget || selectedBook.title}
					initialRows={data.initialScope === 'book' && data.initialBookId === selectedBookId ? data.initialGlossary.rows : null}
					initialTotal={data.initialScope === 'book' && data.initialBookId === selectedBookId ? data.initialGlossary.total : null}
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
			<div class="rounded-2xl border border-dashed border-black/15 p-12 text-center text-sm opacity-60 dark:border-white/15">
				Create a book first to add book-specific glossary terms.
			</div>
		{/if}
	{/if}
</div>
