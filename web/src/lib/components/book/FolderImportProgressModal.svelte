<!-- FOLDER IMPORT PROGRESS MODAL — SCAN, CONFIRM, UPLOAD WITH PER-FILE PROGRESS -->
<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { DiscoveredChapter } from '$lib/utils/folder-drop';
	import type { UploadFileInfo } from '$lib/utils/upload';

	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { scale } from 'svelte/transition';

	// IMPORTED DEP-COMPONENTS
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Check from 'lucide-svelte/icons/check';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import FileImage from 'lucide-svelte/icons/file-image';
	import FolderTree from 'lucide-svelte/icons/folder-tree';
	import Layers from 'lucide-svelte/icons/layers';
	import ScanLine from 'lucide-svelte/icons/scan-line';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';

	// IMPORTED MODULES
	import { parseDataTransferItems, parseFileList } from '$lib/utils/folder-drop';
	import {
		uploadSingleFile,
		computeGlobalPercent,
		formatBytes,
		RING_RADIUS,
		RING_CIRCUMFERENCE,
	} from '$lib/utils/upload';

	const dispatch = createEventDispatcher();

	// -- REQUIRED PROPS -- //
	export let bookId = '';

	// -- OPTIONAL PROPS -- //
	export let nextChapterNumber = 1;

	// -- TYPES -- //
	type Phase = 'scanning' | 'confirm' | 'uploading' | 'done' | 'error';

	interface Row {
		title: string;
		seq: number | null;
		chapterId: number | null;
		files: UploadFileInfo[];
		rawFiles: File[];
	}

	// -- STATES -- //
	let visible = false;
	let phase: Phase = 'scanning';
	let scanCount = 0;
	let errorMessage = '';
	let rows: Row[] = [];
	let completedChapters = 0;

	// -- REACTIVE STATEMENTS -- //
	// REACTIVE AGGREGATE PROGRESS & PAGE TOTALS
	let globalPercent = 0;
	let uploadedBytes = 0;
	$: totalImages = rows.reduce((sum, r) => sum + r.files.length, 0);
	$: {
		const allFiles = rows.flatMap((r) => r.files);
		globalPercent = computeGlobalPercent(allFiles);
		uploadedBytes = allFiles.reduce((sum, f) => sum + f.loaded, 0);
	}

	// -- FUNCTIONS -- //

	export function open(): void {
		visible = true;
	}

	export function close(): void {
		visible = false;
	}

	// ENTRY POINT: SCAN A DROPPED ITEM LIST OR A FILE LIST, THEN IMPORT.
	export async function startImport(source: DataTransferItemList | File[] | FileList): Promise<void> {
		visible = true;
		phase = 'scanning';
		scanCount = 0;
		errorMessage = '';
		rows = [];
		completedChapters = 0;

		try {
			const isFileLike = Array.isArray(source) || source instanceof FileList;
			const result = isFileLike
				? await parseFileList(source as File[] | FileList, (count) => (scanCount = count))
				: await parseDataTransferItems(source as DataTransferItemList, (count) => (scanCount = count));

			if (result.isMultiChapter && result.chapters.length >= 2) {
				rows = result.chapters.map((c) => buildRow(c.title || c.folderName, c.seqHint, c.files));
				phase = 'confirm';
				return;
			}

			if (result.flatFiles.length > 0) {
				rows = [buildRow(`Chapter ${nextChapterNumber}`, null, result.flatFiles)];
				await runUpload();
				return;
			}

			phase = 'error';
			errorMessage = 'No images found in the dropped folder.';
		} catch (err: any) {
			phase = 'error';
			errorMessage = err?.message || 'Failed to scan the dropped folder.';
		}
	}

	function buildRow(title: string, seqHint: number | null, files: File[]): Row {
		return {
			title,
			seq: seqHint !== null ? seqHint - 1 : null,
			chapterId: null,
			rawFiles: files,
			files: files.map((f) => ({
				name: f.name,
				size: f.size,
				loaded: 0,
				total: f.size,
				status: 'pending',
			})),
		};
	}

	// CREATE CHAPTERS SEQUENTIALLY AND UPLOAD EACH FILE WITH PROGRESS.
	async function runUpload(): Promise<void> {
		phase = 'uploading';
		completedChapters = 0;
		try {
			for (let r = 0; r < rows.length; r++) {
				const row = rows[r];
				let chapterId = row.chapterId;
				if (chapterId === null) {
					const createRes = await fetch(`/api/books/${bookId}/chapters`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							title: row.title,
							...(row.seq !== null ? { seq: row.seq } : {}),
						}),
					});
					if (!createRes.ok) throw new Error(`Failed to create chapter "${row.title}"`);
					const created = await createRes.json();
					chapterId = created.id;
					rows[r] = { ...row, chapterId };
				}

				for (let f = 0; f < row.rawFiles.length; f++) {
					rows[r].files[f] = { ...rows[r].files[f], loaded: 0, status: 'uploading' };
					await uploadSingleFile(row.rawFiles[f], `/api/chapters/${chapterId}/pages`, (loaded, total) => {
						rows[r].files[f] = { ...rows[r].files[f], loaded, total, status: 'uploading' };
					});
					rows[r].files[f] = { ...rows[r].files[f], loaded: rows[r].files[f].total, status: 'done' };
				}

				completedChapters++;
			}

			phase = 'done';
			dispatch('done');
		} catch (err: any) {
			phase = 'error';
			errorMessage = err?.message || 'Import failed.';
		}
	}
</script>

<Modal
	open={visible}
	title={phase === 'scanning'
		? 'Scanning Dropped Folder'
		: phase === 'confirm'
			? 'Multi-Chapter Folder Detected'
			: phase === 'uploading'
				? 'Importing Chapters'
				: phase === 'done'
					? 'Import Complete'
					: 'Import Error'}
	size="md"
	closable={phase === 'done' || phase === 'error'}
	on:close={close}
>
	{#if phase === 'scanning'}
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div class="shadow-xs flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-white/10">
				<ScanLine size={24} class="text-[#b23a2e] dark:text-[#e08a63]" />
			</div>
			<div>
				<h3 class="text-sm font-bold">Scanning folder for images...</h3>
				<p class="mt-1 text-xs opacity-60">
					Found <strong>{scanCount}</strong> image{scanCount === 1 ? '' : 's'} so far.
				</p>
			</div>
			<div class="flex items-center gap-2 text-xs opacity-60">
				<Loader2 size={13} class="animate-spin" />
				<span>Please keep this window open while scanning...</span>
			</div>
		</div>
	{:else if phase === 'confirm'}
		<div class="space-y-3.5 text-xs">
			<div
				class="flex items-center gap-2.5 rounded-xl border border-[#b23a2e]/20 bg-[#b23a2e]/5 p-3 text-[#b23a2e] dark:text-[#e08a63]"
			>
				<FolderTree size={18} class="shrink-0" />
				<div class="min-w-0 space-y-0.5">
					<p class="text-xs font-bold">Found {rows.length} chapters ({totalImages} total images)</p>
					<p class="text-[11px] leading-tight opacity-80">
						Xianscan will create each folder as a new chapter and upload its pages in order.
					</p>
				</div>
			</div>

			<div class="space-y-1.5">
				<div
					class="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider opacity-60"
				>
					<span>Discovered Chapters</span>
					<span>Page Count</span>
				</div>
				<div
					class="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5 dark:border-white/[0.08] dark:bg-white/[0.02]"
				>
					{#each rows as row, idx}
						<div
							class="flex items-center justify-between rounded-lg border border-black/[0.04] bg-white/70 px-2.5 py-1.5 text-xs dark:border-white/[0.04] dark:bg-white/[0.04]"
						>
							<div class="flex min-w-0 items-center gap-2">
								<span class="font-mono text-[10px] font-bold opacity-40">#{idx + 1}</span>
								<span class="truncate font-medium">{row.title}</span>
							</div>
							<span class="shrink-0 font-mono text-[11px] font-medium opacity-70"
								>{row.files.length} pgs</span
							>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else if phase === 'uploading'}
		<div class="flex flex-col gap-4">
			<div
				class="flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
			>
				<div
					class="shadow-xs flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white/10"
				>
					<Loader2 size={24} class="animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="truncate text-sm font-bold tracking-tight sm:text-base">
						Importing {totalImages} page{totalImages === 1 ? '' : 's'} across {rows.length} chapter{rows.length ===
						1
							? ''
							: 's'}...
					</h3>
					<p class="mt-0.5 truncate text-xs opacity-65">
						Transferring {formatBytes(uploadedBytes)} to chapter storage...
					</p>
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between text-[11px] font-medium">
					<span class="uppercase tracking-wider opacity-60">Overall Upload Progress</span>
					<span class="font-mono">{globalPercent}%</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
					<!-- GLOBAL LINEAR PROGRESS WIDTH — DYNAMIC RUNTIME -->
					<div
						class="h-full rounded-full bg-[#b23a2e] transition-[width] duration-200 ease-out dark:bg-[#e08a63]"
						style="width: {globalPercent}%"
					></div>
				</div>
			</div>

			{#if rows.length > 1}
				<div class="flex items-center gap-1.5 text-[11px] font-medium opacity-70">
					<Layers size={13} class="text-amber-500" />
					<span>Chapters imported: {completedChapters}/{rows.length}</span>
				</div>
			{/if}

			<div class="mt-1 max-h-60 space-y-2 overflow-y-auto pr-0.5">
				{#each rows as row, r}
					<div
						class="rounded-xl border border-black/[0.06] bg-black/[0.01] p-2 dark:border-white/[0.06] dark:bg-white/[0.01]"
					>
						<div class="mb-1.5 flex items-center justify-between px-1">
							<span
								class="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold opacity-80"
							>
								<FolderTree size={12} class="shrink-0 text-amber-500" />
								<span class="truncate">{row.title}</span>
							</span>
							<span class="shrink-0 font-mono text-[10px] opacity-50">
								{row.files.filter((f) => f.status === 'done').length}/{row.files.length}
							</span>
						</div>
						<div class="space-y-1">
							{#each row.files as item, f}
								{@const pct = item.total > 0 ? item.loaded / item.total : 0}
								{@const ringOffset = RING_CIRCUMFERENCE * (1 - pct)}
								<div class="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs">
									<div class="flex min-w-0 flex-1 items-center gap-2">
										<div class="relative h-[18px] w-[18px] shrink-0">
											<svg
												viewBox="0 0 24 24"
												class="h-full w-full -rotate-90"
												aria-hidden="true"
											>
												<circle
													cx="12"
													cy="12"
													r={RING_RADIUS}
													fill="none"
													stroke-width="3"
													class="opacity-20"
													stroke={item.status === 'done'
														? '#4f7a64'
														: item.status === 'error'
															? '#dc2626'
															: 'currentColor'}
												/>
												{#if item.status === 'uploading' || item.status === 'done'}
													<circle
														cx="12"
														cy="12"
														r={RING_RADIUS}
														fill="none"
														stroke-width="3"
														stroke-linecap="round"
														stroke={item.status === 'done' ? '#4f7a64' : '#b23a2e'}
														stroke-dasharray={RING_CIRCUMFERENCE}
														stroke-dashoffset={ringOffset}
													/>
												{/if}
											</svg>
											{#if item.status === 'done'}
												<!-- SUCCESS CHECK ICON — POP-IN SCALE TRANSITION -->
												<div
													class="absolute inset-0 flex items-center justify-center"
													in:scale={{ duration: 200, start: 0.2 }}
												>
													<Check
														size={9}
														stroke-width={3.5}
														class="text-[#4f7a64] dark:text-[#83b39a]"
													/>
												</div>
											{/if}
										</div>
										<span class="truncate font-medium">{item.name}</span>
									</div>
									<span class="shrink-0 font-mono text-[10px] opacity-50">
										{item.status === 'done'
											? 'Done'
											: item.status === 'error'
												? 'Failed'
												: item.status === 'uploading'
													? `${Math.round(pct * 100)}%`
													: 'Queued'}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if phase === 'done'}
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-[#4f7a64]/10 text-[#4f7a64] dark:text-[#83b39a]"
			>
				<CheckCircle2 size={26} />
			</div>
			<div>
				<h3 class="text-sm font-bold">Import complete!</h3>
				<p class="mt-1 text-xs opacity-60">
					{rows.length} chapter{rows.length === 1 ? '' : 's'} and {totalImages} page{totalImages === 1
						? ''
						: 's'} imported successfully.
				</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
				<AlertCircle size={26} />
			</div>
			<div>
				<h3 class="text-sm font-bold">Import failed</h3>
				<p class="mt-1 text-xs opacity-60">{errorMessage || 'An error occurred during import.'}</p>
			</div>
		</div>
	{/if}

	<!-- CONDITIONAL FOOTER -->
	<svelte:fragment slot="footer">
		{#if phase === 'confirm'}
			<Button variant="secondary" on:click={close}>Cancel</Button>
			<Button variant="primary" class="gap-1.5" on:click={runUpload}>
				<Layers size={15} />
				<span>Import as {rows.length} Chapters</span>
			</Button>
		{:else if phase === 'uploading'}
			<div class="flex items-center gap-2 text-xs opacity-60">
				<Loader2 size={13} class="animate-spin" />
				<span>Please keep this window open while files upload...</span>
			</div>
		{:else if phase === 'done'}
			<Button variant="primary" on:click={close}>Done</Button>
		{:else if phase === 'error'}
			<Button variant="secondary" on:click={close}>Close</Button>
		{/if}
	</svelte:fragment>
</Modal>
