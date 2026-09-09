<script lang="ts">
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import { ripple } from '$lib/actions/ripple';

	// -- REQUIRED PROPS -- //
	export let bookId: string;
	export let chapterSeq: number;
	export let totalPages: number;

	// -- OPTIONAL PROPS -- //
	export let chapterTitle: string | null = null;
	export let chapterTitleTarget: string | null = null;
	export let prevChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = null;
	export let nextChapter: { id: number; seq: number; title: string | null; titleTarget?: string | null } | null = null;

	// -- REACTIVE STATEMENTS -- //
	$: currentLabel = chapterTitleTarget || chapterTitle || `Chapter ${chapterSeq + 1}`;
	$: prevLabel = prevChapter ? (prevChapter.titleTarget || prevChapter.title || `Ch. ${prevChapter.seq + 1}`) : '';
	$: nextLabel = nextChapter ? (nextChapter.titleTarget || nextChapter.title || `Ch. ${nextChapter.seq + 1}`) : '';
</script>

<div class="mt-14 mb-16 flex flex-col items-center gap-4 rounded-3xl border border-black/10 bg-white/60 p-8 text-center backdrop-blur-md shadow-xs dark:border-white/10 dark:bg-white/[0.02] max-w-xl mx-auto w-full">
	<div class="flex items-center gap-2 text-xs font-semibold opacity-60">
		<span class="max-w-[320px] truncate">End of {currentLabel}</span>
		<span>•</span>
		<span>{totalPages} Page{totalPages === 1 ? '' : 's'}</span>
	</div>

	<h3 class="text-lg font-bold max-w-md truncate">Finished reading {currentLabel}</h3>

	<div class="flex flex-wrap items-center justify-center gap-3 mt-2">
		{#if prevChapter}
			<a
				href={`/app/books/${bookId}/chapters/${prevChapter.id}`}
				class="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-semibold shadow-2xs transition hover:bg-white hover:shadow-xs dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
				use:ripple
				title={`Previous (${prevLabel})`}
			>
				<ChevronLeft size={16} />
				<span class="max-w-[180px] truncate">Previous ({prevLabel})</span>
			</a>
		{/if}

		<a
			href={`/app/books/${bookId}/`}
			class="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-semibold shadow-2xs transition hover:bg-white hover:shadow-xs dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
			use:ripple
		>
			<ArrowLeft size={15} />
			<span>Chapter List</span>
		</a>

		{#if nextChapter}
			<a
				href={`/app/books/${bookId}/chapters/${nextChapter.id}`}
				class="flex items-center gap-1.5 rounded-xl bg-[#b23a2e] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#c0392b] dark:bg-[#e08a63] dark:text-black dark:hover:bg-[#eb9a73]"
				use:ripple
				title={`Next Chapter (${nextLabel})`}
			>
				<span class="max-w-[200px] truncate">Next ({nextLabel})</span>
				<ChevronRight size={16} />
			</a>
		{/if}
	</div>
</div>
