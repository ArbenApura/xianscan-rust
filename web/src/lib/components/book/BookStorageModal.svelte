<script lang="ts">
	// BOOK STORAGE BREAKDOWN & MAINTENANCE MODAL
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { Modal, Button } from '$lib/components/ui';
	import { formatBytes } from '$lib/utils/upload';
	// IMPORTED DEP-ICONS
	import HardDrive from 'lucide-svelte/icons/hard-drive';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';

	// -- PROPS -- //

	export let open = false;
	export let bookId: string;
	export let bookTitle = '';

	// -- TYPES -- //

	interface CategoryStats {
		bytes: number;
		count: number;
	}

	interface BookStorageData {
		bookId: string;
		title: string;
		chapterCount: number;
		pageCount: number;
		totalBytes: number;
		categories: {
			uploads: CategoryStats;
			clean: CategoryStats;
			output: CategoryStats;
			annotated: CategoryStats;
			covers: CategoryStats;
			thumbs: CategoryStats;
		};
	}

	// -- STATES -- //

	let loading = false;
	let pruning = false;
	let data: BookStorageData | null = null;
	let errorMsg: string | null = null;
	let lastLoadedBookId: string | null = null;

	const dispatch = createEventDispatcher<{
		refresh: void;
	}>();

	// -- FUNCTIONS -- //

	async function loadStats() {
		if (!bookId) return;
		const targetId = bookId;
		loading = true;
		data = null;
		errorMsg = null;
		try {
			const res = await fetch(`/api/books/${targetId}/storage`);
			if (!res.ok) throw new Error('Failed to load book storage statistics');
			const json = (await res.json()) as BookStorageData;
			if (bookId === targetId && open) {
				data = json;
				lastLoadedBookId = targetId;
			}
		} catch (err: any) {
			if (bookId === targetId && open) {
				errorMsg = err?.message || 'Failed to inspect book storage';
			}
		} finally {
			if (bookId === targetId) {
				loading = false;
			}
		}
	}

	async function handlePruneCache() {
		if (!bookId || pruning) return;
		pruning = true;
		const toastId = toast.loading('Clearing book thumbnail cache...');
		try {
			const res = await fetch(`/api/books/${bookId}/storage`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'prune-cache' }),
			});
			if (!res.ok) throw new Error('Failed to prune book cache');
			const json = await res.json();
			if (json.stats) {
				data = json.stats;
			}
			toast.success('Book thumbnail caches cleared', { id: toastId });
		} catch (err: any) {
			toast.error(err?.message || 'Failed to prune cache', { id: toastId });
		} finally {
			pruning = false;
		}
	}

	$: if (!open) {
		data = null;
		errorMsg = null;
		lastLoadedBookId = null;
	} else if (open && bookId && bookId !== lastLoadedBookId) {
		void loadStats();
	}
</script>

<Modal bind:open title="Storage & Files" size="md">
	<div class="space-y-4 text-xs sm:text-sm">
		<!-- HEADER STATS CARD -->
		<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<HardDrive size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
						<h3 class="font-bold text-sm sm:text-base truncate" title={bookTitle || data?.title}>
							{bookTitle || data?.title || 'Book Storage'}
						</h3>
					</div>
					{#if data}
						<div class="mt-1 flex flex-wrap items-center gap-3 text-xs opacity-70">
							<span>{data.chapterCount} chapters</span>
							<span>•</span>
							<span>{data.pageCount} pages</span>
						</div>
					{:else}
						<div class="mt-1.5 flex items-center gap-2">
							<div class="h-3 w-28 rounded bg-black/[0.08] dark:bg-white/[0.08] animate-pulse"></div>
						</div>
					{/if}
				</div>
				<div class="text-right shrink-0">
					<div class="text-xs uppercase tracking-wider font-semibold opacity-60">Disk Space</div>
					{#if data}
						<div class="text-base sm:text-lg font-black text-[#b23a2e] dark:text-[#e08a63]">
							{formatBytes(data.totalBytes)}
						</div>
					{:else}
						<div class="mt-1 h-5 w-16 rounded bg-black/[0.08] dark:bg-white/[0.08] animate-pulse ml-auto"></div>
					{/if}
				</div>
			</div>

			<!-- VISUAL PROPORTION BAR -->
			{#if data && data.totalBytes > 0}
				<div class="mt-3">
					<div class="flex h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
						{#if data.categories.uploads.bytes > 0}
							<!-- UPLOADS PROPORTION -->
							<div
								style="width: {(data.categories.uploads.bytes / data.totalBytes) * 100}%"
								class="bg-[#a97f28] h-full"
								title="Uploads: {formatBytes(data.categories.uploads.bytes)}"
							></div>
						{/if}
						{#if data.categories.clean.bytes > 0}
							<!-- CLEAN PROPORTION -->
							<div
								style="width: {(data.categories.clean.bytes / data.totalBytes) * 100}%"
								class="bg-[#4f7a64] h-full"
								title="Clean: {formatBytes(data.categories.clean.bytes)}"
							></div>
						{/if}
						{#if data.categories.output.bytes > 0}
							<!-- OUTPUT PROPORTION -->
							<div
								style="width: {(data.categories.output.bytes / data.totalBytes) * 100}%"
								class="bg-[#b23a2e] h-full"
								title="Output: {formatBytes(data.categories.output.bytes)}"
							></div>
						{/if}
						{#if data.categories.annotated.bytes > 0}
							<!-- ANNOTATED PROPORTION -->
							<div
								style="width: {(data.categories.annotated.bytes / data.totalBytes) * 100}%"
								class="bg-purple-500 h-full"
								title="Annotated: {formatBytes(data.categories.annotated.bytes)}"
							></div>
						{/if}
						{#if data.categories.covers.bytes + data.categories.thumbs.bytes > 0}
							<!-- CACHES PROPORTION -->
							<div
								style="width: {((data.categories.covers.bytes + data.categories.thumbs.bytes) / data.totalBytes) * 100}%"
								class="bg-blue-500 h-full"
								title="Caches: {formatBytes(data.categories.covers.bytes + data.categories.thumbs.bytes)}"
							></div>
						{/if}
					</div>
				</div>
			{:else if loading}
				<div class="mt-3">
					<div class="h-2 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.08] animate-pulse"></div>
				</div>
			{/if}
		</div>

		<!-- CATEGORY BREAKDOWN LIST -->
		{#if loading && !data}
			<!-- SKELETON CATEGORY LIST -->
			<div class="space-y-1.5 rounded-xl border border-black/10 bg-black/[0.01] p-2 dark:border-white/10 dark:bg-white/[0.01] animate-pulse" aria-hidden="true">
				{#each [
					{ w: 'w-32', c: 'w-10' },
					{ w: 'w-28', c: 'w-8' },
					{ w: 'w-36', c: 'w-12' },
					{ w: 'w-24', c: 'w-8' },
					{ w: 'w-32', c: 'w-10' }
				] as row, i (i)}
					<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5">
						<div class="flex items-center gap-2 min-w-0 pr-2">
							<div class="h-2.5 w-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.08] shrink-0"></div>
							<div class={`h-3.5 ${row.w} rounded bg-black/[0.08] dark:bg-white/[0.08]`}></div>
							<div class={`h-3 ${row.c} rounded bg-black/[0.05] dark:bg-white/[0.05]`}></div>
						</div>
						<div class="h-3.5 w-14 rounded bg-black/[0.08] dark:bg-white/[0.08] shrink-0"></div>
					</div>
				{/each}
			</div>
		{:else if errorMsg}
			<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-red-600 dark:text-red-400 text-xs">
				{errorMsg}
			</div>
		{:else if data}
			<div class="space-y-1.5 rounded-xl border border-black/10 bg-black/[0.01] p-2 dark:border-white/10 dark:bg-white/[0.01]">
				<!-- 1. ORIGINAL UPLOADS -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#a97f28] shrink-0"></span>
						<span class="font-medium truncate">Original Uploads</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.uploads.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.uploads.bytes)}</span>
				</div>

				<!-- 2. CLEANED PAGES -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#4f7a64] shrink-0"></span>
						<span class="font-medium truncate">Cleaned Pages</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.clean.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.clean.bytes)}</span>
				</div>

				<!-- 3. TRANSLATED PAGES -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#b23a2e] shrink-0"></span>
						<span class="font-medium truncate">Translated Pages</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.output.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.output.bytes)}</span>
				</div>

				<!-- 4. OCR DEBUG PREVIEWS -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0"></span>
						<span class="font-medium truncate">OCR Debug Previews</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.annotated.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.annotated.bytes)}</span>
				</div>

				<!-- 5. BOOK COVERS -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0"></span>
						<span class="font-medium truncate">Book Covers & Cache</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.covers.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.covers.bytes)}</span>
				</div>

				<!-- 6. PAGE THUMBNAILS -->
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-sky-400 shrink-0"></span>
						<span class="font-medium truncate">Page Thumbnails</span>
						<span class="text-xs opacity-50 shrink-0">({data.categories.thumbs.count})</span>
					</div>
					<span class="font-mono font-bold text-xs shrink-0">{formatBytes(data.categories.thumbs.bytes)}</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- FOOTER ACTIONS -->
	<svelte:fragment slot="footer">
		<div class="flex flex-col-reverse sm:flex-row w-full items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
			<Button
				variant="secondary"
				size="md"
				class="w-full sm:w-auto h-9 sm:h-10 px-4 text-xs sm:text-sm font-medium"
				disabled={loading || pruning || !data || (data.categories.covers.bytes + data.categories.thumbs.bytes === 0)}
				on:click={handlePruneCache}
				title="Remove cached resized thumbnails to save space"
			>
				<RefreshCw size={14} class={`mr-1.5 ${pruning ? 'animate-spin' : ''}`} />
				<span>{pruning ? 'Clearing...' : 'Clear Thumbnail Cache'}</span>
			</Button>

			<Button
				variant="secondary"
				size="md"
				class="w-full sm:w-auto h-9 sm:h-10 px-5 text-xs sm:text-sm font-medium"
				on:click={() => (open = false)}
			>
				Close
			</Button>
		</div>
	</svelte:fragment>
</Modal>
