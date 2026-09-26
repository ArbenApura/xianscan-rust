<!-- STORAGE & DATA TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	// IMPORTED MODULES
	import { formatBytes } from '$lib/utils/upload';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Eraser from 'lucide-svelte/icons/eraser';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import HardDrive from 'lucide-svelte/icons/hard-drive';
	import Copy from 'lucide-svelte/icons/copy';
	import Folder from 'lucide-svelte/icons/folder';
	import Database from 'lucide-svelte/icons/database';
	// IMPORTED COMPONENTS
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	// -- OPTIONAL PROPS -- //

	export let highlightedSettingId: string | null = null;

	// -- STORAGE & DATA STATES -- //

	interface SystemCategoryStats {
		bytes: number;
		count: number;
	}

	interface SystemStorageStats {
		dataRoot: string;
		totalBytes: number;
		bookCount: number;
		chapterCount: number;
		pageCount: number;
		categories: {
			uploads: SystemCategoryStats;
			clean: SystemCategoryStats;
			output: SystemCategoryStats;
			annotated: SystemCategoryStats;
			covers: SystemCategoryStats;
			thumbs: SystemCategoryStats;
			database: SystemCategoryStats;
			caches: SystemCategoryStats;
		};
	}

	let storageStats: SystemStorageStats | null = null;
	let storageLoading = false;
	let purgingOrphaned = false;
	let clearingCaches = false;
	let clearingAll = false;
	let clearAllConfirmOpen = false;
	let copiedDataRoot = false;

	async function loadStorageStats() {
		// EVERY REACTIVE INVALIDATION ON THE STORAGE TAB CALLS THIS; ONE REQUEST AT A TIME
		if (storageLoading) return;
		storageLoading = true;
		try {
			const res = await fetch('/api/system/storage');
			if (!res.ok) throw new Error('Failed to load storage statistics');
			storageStats = (await res.json()) as SystemStorageStats;
		} catch (err: any) {
			console.error('[storage] fetch failed', err);
		} finally {
			storageLoading = false;
		}
	}

	async function handlePurgeOrphaned() {
		if (purgingOrphaned) return;
		purgingOrphaned = true;
		const toastId = toast.loading('Purging orphaned files...');
		try {
			const res = await fetch('/api/system/storage', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'purge-orphaned' }),
			});
			if (!res.ok) throw new Error('Failed to purge orphaned storage');
			const json = await res.json();
			if (json.stats) storageStats = json.stats;
			toast.success(`Purged ${json.result.purgedFiles} orphaned files, reclaimed ${formatBytes(json.result.reclaimedBytes)}`, { id: toastId });
		} catch (err: any) {
			toast.error(err?.message || 'Failed to purge orphaned files', { id: toastId });
		} finally {
			purgingOrphaned = false;
		}
	}

	async function handleClearSystemCaches() {
		if (clearingCaches) return;
		clearingCaches = true;
		const toastId = toast.loading('Clearing thumbnail caches...');
		try {
			const res = await fetch('/api/system/storage', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'clear-cache' }),
			});
			if (!res.ok) throw new Error('Failed to clear caches');
			const json = await res.json();
			if (json.stats) storageStats = json.stats;
			toast.success(`Cleared thumbnail caches, reclaimed ${formatBytes(json.result.reclaimedBytes)}`, { id: toastId });
		} catch (err: any) {
			toast.error(err?.message || 'Failed to clear thumbnail caches', { id: toastId });
		} finally {
			clearingCaches = false;
		}
	}

	async function handleClearAllData() {
		clearingAll = true;
		const toastId = toast.loading('Resetting all application data...');
		try {
			const res = await fetch('/api/system/storage', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'clear-all' }),
			});
			if (!res.ok) throw new Error('Failed to clear application data');
			clearAllConfirmOpen = false;
			toast.success('All application data cleared', { id: toastId });
			await invalidateAll();
			window.location.href = '/app';
		} catch (err: any) {
			toast.error(err?.message || 'Failed to clear all data', { id: toastId });
		} finally {
			clearingAll = false;
		}
	}

	function copyDataRoot() {
		if (!storageStats?.dataRoot) return;
		try {
			navigator.clipboard.writeText(storageStats.dataRoot);
			copiedDataRoot = true;
			toast.success('App data directory copied to clipboard');
			setTimeout(() => {
				copiedDataRoot = false;
			}, 2000);
		} catch {
			toast.error('Could not copy directory path');
		}
	}

	// -- LIFECYCLES -- //

	// THE TAB MOUNTS ONLY WHILE IT IS SHOWN, SO THIS LOADS ONCE PER VISIT (THE IN-FLIGHT GUARD STAYS)
	onMount(() => {
		void loadStorageStats();
	});
</script>

<div class="space-y-5">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-base font-bold">Storage & Data</h2>
			<p class="text-xs opacity-60 mt-0.5">Disk usage, directory locations, cache cleanup, and library reset</p>
		</div>
		<Button
			variant="secondary"
			size="md"
			class="h-9 px-3.5 text-xs font-medium"
			disabled={storageLoading}
			on:click={loadStorageStats}
			title="Refresh storage statistics"
		>
			<RefreshCw size={14} class={`mr-1.5 ${storageLoading ? 'animate-spin' : ''}`} />
			<span>Refresh</span>
		</Button>
	</div>

	<!-- DATA DIRECTORY LOCATION CARD -->
	<div
		id="setting-storage-app-data"
		class={`rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3 transition-all duration-300 ${highlightedSettingId === 'storage-app-data' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
	>
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
			<div class="space-y-0.5">
				<div class="text-xs font-bold flex items-center gap-2">
					<Folder size={15} class="text-[#a97f28] shrink-0" />
					<span>Data Directory</span>
				</div>
				<p class="text-[11px] opacity-60">Folder on your computer where database, scans, and outputs are saved</p>
			</div>
			{#if storageStats?.dataRoot}
				<Button
					variant="secondary"
					size="md"
					class="self-start sm:self-auto shrink-0 h-8 px-3 text-xs font-medium"
					on:click={copyDataRoot}
					title="Copy path to clipboard"
				>
					{#if copiedDataRoot}
						<Check size={13} class="mr-1 text-[#4f7a64]" />
						<span>Copied</span>
					{:else}
						<Copy size={13} class="mr-1" />
						<span>Copy Path</span>
					{/if}
				</Button>
			{:else}
				<div class="h-8 w-24 rounded-lg bg-black/[0.06] dark:bg-white/[0.06] animate-pulse self-start sm:self-auto shrink-0"></div>
			{/if}
		</div>
		{#if storageStats?.dataRoot}
			<div class="rounded-xl border border-black/5 bg-black/[0.03] px-3 py-2 font-mono text-xs dark:border-white/5 dark:bg-white/[0.03] select-all break-all">
				{storageStats.dataRoot}
			</div>
		{:else}
			<div class="rounded-xl border border-black/5 bg-black/[0.03] px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
				<div class="h-3.5 w-3/4 rounded bg-black/[0.08] dark:bg-white/[0.08] animate-pulse"></div>
			</div>
		{/if}
	</div>

	<!-- STORAGE USAGE CARD -->
	<div
		id="setting-storage-breakdown"
		class={`rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3.5 transition-all duration-300 ${highlightedSettingId === 'storage-breakdown' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
	>
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-3 dark:border-white/5">
			<div class="space-y-0.5">
				<div class="text-xs font-bold flex items-center gap-2">
					<HardDrive size={15} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span>Storage Usage</span>
				</div>
				{#if storageStats}
					<p class="text-[11px] opacity-60">
						{storageStats.bookCount} books • {storageStats.chapterCount} chapters • {storageStats.pageCount} pages
					</p>
				{:else}
					<div class="pt-0.5">
						<div class="h-3 w-40 rounded bg-black/[0.08] dark:bg-white/[0.08] animate-pulse"></div>
					</div>
				{/if}
			</div>
			<div class="flex items-baseline sm:flex-col sm:items-end justify-between sm:justify-start gap-1">
				<div class="text-[10px] uppercase font-bold tracking-wider opacity-60">Total Space</div>
				{#if storageStats}
					<div class="text-base font-black text-[#b23a2e] dark:text-[#e08a63]">
						{formatBytes(storageStats.totalBytes)}
					</div>
				{:else}
					<div class="h-5 w-16 rounded bg-black/[0.08] dark:bg-white/[0.08] animate-pulse mt-0.5"></div>
				{/if}
			</div>
		</div>

		<!-- PROPORTION BAR -->
		{#if storageStats && storageStats.totalBytes > 0}
			<div class="flex h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
				{#if storageStats.categories.uploads.bytes > 0}
					<div
						style="width: {(storageStats.categories.uploads.bytes / storageStats.totalBytes) * 100}%"
						class="bg-[#a97f28] h-full"
						title="Uploads: {formatBytes(storageStats.categories.uploads.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.clean.bytes > 0}
					<div
						style="width: {(storageStats.categories.clean.bytes / storageStats.totalBytes) * 100}%"
						class="bg-[#4f7a64] h-full"
						title="Clean: {formatBytes(storageStats.categories.clean.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.output.bytes > 0}
					<div
						style="width: {(storageStats.categories.output.bytes / storageStats.totalBytes) * 100}%"
						class="bg-[#b23a2e] h-full"
						title="Output: {formatBytes(storageStats.categories.output.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.annotated.bytes > 0}
					<div
						style="width: {(storageStats.categories.annotated.bytes / storageStats.totalBytes) * 100}%"
						class="bg-purple-500 h-full"
						title="Annotated: {formatBytes(storageStats.categories.annotated.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.covers.bytes > 0}
					<div
						style="width: {(storageStats.categories.covers.bytes / storageStats.totalBytes) * 100}%"
						class="bg-blue-500 h-full"
						title="Covers: {formatBytes(storageStats.categories.covers.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.thumbs.bytes > 0}
					<div
						style="width: {(storageStats.categories.thumbs.bytes / storageStats.totalBytes) * 100}%"
						class="bg-sky-400 h-full"
						title="Thumbs: {formatBytes(storageStats.categories.thumbs.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.database.bytes > 0}
					<div
						style="width: {(storageStats.categories.database.bytes / storageStats.totalBytes) * 100}%"
						class="bg-amber-600 h-full"
						title="Database: {formatBytes(storageStats.categories.database.bytes)}"
					></div>
				{/if}
				{#if storageStats.categories.caches.bytes > 0}
					<div
						style="width: {(storageStats.categories.caches.bytes / storageStats.totalBytes) * 100}%"
						class="bg-neutral-400 h-full"
						title="Caches: {formatBytes(storageStats.categories.caches.bytes)}"
					></div>
				{/if}
			</div>
		{:else if storageLoading && !storageStats}
			<!-- SKELETON PROPORTION BAR -->
			<div class="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.08] animate-pulse"></div>
		{/if}

		<!-- CATEGORY TABLE -->
		{#if storageLoading && !storageStats}
			<!-- SKELETON CATEGORY ROWS -->
			<div class="space-y-1.5 py-1 animate-pulse" aria-hidden="true">
				{#each [
					{ w: 'w-36', c: 'w-14' },
					{ w: 'w-32', c: 'w-12' },
					{ w: 'w-40', c: 'w-16' },
					{ w: 'w-28', c: 'w-10' },
					{ w: 'w-32', c: 'w-14' },
					{ w: 'w-24', c: 'w-12' }
				] as row, i (i)}
					<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5">
						<div class="flex items-center gap-2 min-w-0">
							<div class="h-2.5 w-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.08] shrink-0"></div>
							<div class={`h-3.5 ${row.w} rounded bg-black/[0.08] dark:bg-white/[0.08]`}></div>
							<div class={`h-3 ${row.c} rounded bg-black/[0.05] dark:bg-white/[0.05]`}></div>
						</div>
						<div class="h-3.5 w-14 rounded bg-black/[0.08] dark:bg-white/[0.08] shrink-0"></div>
					</div>
				{/each}
			</div>
		{:else if storageStats}
			<div class="space-y-1 text-xs">
				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#a97f28] shrink-0"></span>
						<span class="font-medium truncate">Raw Scans (uploads/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.uploads.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.uploads.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#4f7a64] shrink-0"></span>
						<span class="font-medium truncate">Cleaned Pages (clean/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.clean.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.clean.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-[#b23a2e] shrink-0"></span>
						<span class="font-medium truncate">Translated Pages (output/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.output.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.output.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0"></span>
						<span class="font-medium truncate">OCR Previews (annotated/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.annotated.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.annotated.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0"></span>
						<span class="font-medium truncate">Book Covers (covers/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.covers.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.covers.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-sky-400 shrink-0"></span>
						<span class="font-medium truncate">Page Thumbnails (cache/thumbs/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.thumbs.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.thumbs.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-amber-600 shrink-0"></span>
						<span class="font-medium truncate">Database (xianscan.db)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.database.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.database.bytes)}</span>
				</div>

				<div class="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
					<div class="flex items-center gap-2 min-w-0 pr-2">
						<span class="h-2.5 w-2.5 rounded-full bg-neutral-400 shrink-0"></span>
						<span class="font-medium truncate">Translation Cache (cache/translate/)</span>
						<span class="text-[11px] opacity-50 shrink-0">({storageStats.categories.caches.count} files)</span>
					</div>
					<span class="font-mono font-bold shrink-0">{formatBytes(storageStats.categories.caches.bytes)}</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- STORAGE MAINTENANCE CARD -->
	<div
		id="setting-storage-purge-orphaned"
		class={`rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-4 transition-all duration-300 ${highlightedSettingId === 'storage-purge-orphaned' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
	>
		<div class="space-y-0.5">
			<div class="text-xs font-bold flex items-center gap-2">
				<Eraser size={15} class="text-[#4f7a64] shrink-0" />
				<span>Storage Maintenance</span>
			</div>
			<p class="text-[11px] opacity-60">Free up space by removing unused files and temporary caches</p>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<!-- PURGE ORPHANED FILES -->
			<div class="flex flex-col justify-between rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.02] gap-3">
				<div class="space-y-1">
					<div class="font-bold text-xs">Purge Orphaned Files</div>
					<p class="text-[11px] opacity-60 leading-relaxed">
						Deletes leftover folders, unattached pages, and old covers from books or chapters that were deleted.
					</p>
				</div>
				<div>
					<Button
						variant="secondary"
						size="md"
						class="w-full h-9 px-4 text-xs sm:text-sm font-medium"
						disabled={purgingOrphaned || storageLoading}
						on:click={handlePurgeOrphaned}
					>
						{#if purgingOrphaned}
							<RefreshCw size={14} class="mr-1.5 animate-spin text-[#4f7a64]" />
							<span>Purging...</span>
						{:else}
							<Eraser size={14} class="mr-1.5 text-[#4f7a64]" />
							<span>Purge Orphaned Files</span>
						{/if}
					</Button>
				</div>
			</div>

			<!-- CLEAR CACHES -->
			<div class="flex flex-col justify-between rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/5 dark:bg-white/[0.02] gap-3">
				<div class="space-y-1">
					<div class="font-bold text-xs">Clear Thumbnail Caches</div>
					<p class="text-[11px] opacity-60 leading-relaxed">
						Deletes generated preview thumbnails. Raw scans and translations remain safe, and thumbnails regenerate when viewed.
					</p>
				</div>
				<div>
					<Button
						variant="secondary"
						size="md"
						class="w-full h-9 px-4 text-xs sm:text-sm font-medium"
						disabled={clearingCaches || storageLoading}
						on:click={handleClearSystemCaches}
					>
						<RotateCcw size={14} class={`mr-1.5 text-sky-500 ${clearingCaches ? 'animate-spin' : ''}`} />
						<span>{clearingCaches ? 'Clearing...' : 'Clear Thumbnail Caches'}</span>
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- DANGER ZONE CARD -->
	<div
		id="setting-storage-clear-all"
		class={`rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 dark:border-red-500/30 dark:bg-red-500/[0.06] space-y-3 transition-all duration-300 ${highlightedSettingId === 'storage-clear-all' ? 'ring-2 ring-red-500 bg-red-500/10' : ''}`}
	>
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
			<div class="space-y-1 min-w-0">
				<div class="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
					<AlertTriangle size={15} class="shrink-0 text-red-600 dark:text-red-400" />
					<span>Danger Zone - Reset All Data</span>
				</div>
				<p class="text-[11px] text-red-700/90 dark:text-red-300/90 leading-relaxed">
					Permanently deletes all books, chapters, images, and translations. This resets the entire database and cannot be undone.
				</p>
			</div>
			<Button
				variant="destructive"
				size="md"
				class="w-full sm:w-auto shrink-0 h-10 px-5 text-xs sm:text-sm font-bold shadow-md bg-red-600 hover:bg-red-700 text-white border-transparent"
				on:click={() => (clearAllConfirmOpen = true)}
			>
				<Trash2 size={15} class="mr-1.5 text-white shrink-0" />
				<span>Clear All Data</span>
			</Button>
		</div>
	</div>
</div>

<!-- THE TAB'S DIALOGS NOW RENDER INSIDE THE SETTINGS PANE; display:contents KEEPS THEM OUT OF THE PANE'S space-y MARGINS -->
<div class="contents">
	<!-- CLEAR ALL DATA CONFIRM DIALOG -->
	<ConfirmDialog
		bind:open={clearAllConfirmOpen}
		title="Clear All Application Data?"
		message="This will permanently delete all books, chapters, pages, uploaded images, translations, and cached files on disk. This action cannot be undone."
		confirmLabel="Permanently Delete Everything"
		requireText="CLEAR ALL DATA"
		variant="danger"
		loading={clearingAll}
		on:confirm={handleClearAllData}
		on:cancel={() => (clearAllConfirmOpen = false)}
	/>
</div>
