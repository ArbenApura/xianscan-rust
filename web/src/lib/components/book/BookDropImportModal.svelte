<!-- BOOK DROP IMPORT MODAL - CREATE BOOK & BATCH IMPORT CHAPTERS FROM DROPPED FOLDERS -->
<script lang="ts">
	// IMPORTED DEP-TYPES
	import type { DiscoveredChapter } from '$lib/utils/folder-drop';
	import type { UploadFileInfo } from '$lib/utils/upload';

	// IMPORTED DEP-MODULES
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';
	import { scale } from 'svelte/transition';

	// IMPORTED MODULES
	import { settings } from '$lib/stores/settings';
	import { parseDataTransferItems, parseFileList } from '$lib/utils/folder-drop';
	import {
		uploadSingleFile,
		computeGlobalPercent,
		formatBytes,
		RING_RADIUS,
		RING_CIRCUMFERENCE,
	} from '$lib/utils/upload';

	// IMPORTED DEP-COMPONENTS
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Check from 'lucide-svelte/icons/check';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import FolderTree from 'lucide-svelte/icons/folder-tree';
	import Layers from 'lucide-svelte/icons/layers';
	import ScanLine from 'lucide-svelte/icons/scan-line';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import FolderUp from 'lucide-svelte/icons/folder-up';

	// IMPORTED COMPONENTS
	import { Modal, Button, TextField, LanguagePicker } from '$lib/components/ui';

	const dispatch = createEventDispatcher();

	// -- TYPES -- //
	type Phase = 'idle' | 'scanning' | 'confirm' | 'uploading' | 'done' | 'error';

	interface Row {
		title: string;
		seq: number | null;
		chapterId: number | null;
		files: UploadFileInfo[];
		rawFiles: File[];
	}

	// -- STATES -- //
	let visible = false;
	let phase: Phase = 'idle';
	let scanCount = 0;
	let errorMessage = '';
	let rows: Row[] = [];
	let bookTitle = '';
	let sourceLang = $settings.sourceLang || 'zh';
	let targetLang = $settings.targetLang || 'en';
	let createdBookId: string | null = null;
	let completedChapters = 0;
	let uploadController: AbortController | null = null;
	let isCancelled = false;
	let isDraggingOverModal = false;
	let folderPickerInput: HTMLInputElement;

	// -- REACTIVE STATEMENTS -- //
	let globalPercent = 0;
	let uploadedBytes = 0;
	$: totalImages = rows.reduce((sum, r) => sum + r.files.length, 0);
	$: {
		const allFiles = rows.flatMap((r) => r.files);
		globalPercent = computeGlobalPercent(allFiles);
		uploadedBytes = allFiles.reduce((sum, f) => sum + f.loaded, 0);
	}

	// -- FUNCTIONS -- //

	// OPEN THE MODAL IN IDLE STATE — USER WILL PICK A FOLDER FROM WITHIN THE MODAL
	export function open(): void {
		visible = true;
		phase = 'idle';
		isDraggingOverModal = false;
		scanCount = 0;
		errorMessage = '';
		rows = [];
		bookTitle = '';
		sourceLang = $settings.sourceLang || 'zh';
		targetLang = $settings.targetLang || 'en';
		createdBookId = null;
		completedChapters = 0;
		isCancelled = false;
	}

	// HANDLE FOLDER PICKER SELECTION FROM WITHIN THE IDLE MODAL
	async function handleIdleFolderSelected(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;
		const files = Array.from(target.files);
		target.value = '';
		await startImport(files);
	}

	// HANDLE DRAG-OVER WITHIN THE IDLE PHASE MODAL DROP ZONE
	function handleModalDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types?.includes('Files')) return;
		e.preventDefault();
		isDraggingOverModal = true;
	}

	function handleModalDragLeave(e: DragEvent) {
		if (e.currentTarget && (e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
		isDraggingOverModal = false;
	}

	// HANDLE DROP WITHIN THE IDLE PHASE MODAL DROP ZONE
	async function handleModalDrop(e: DragEvent) {
		e.preventDefault();
		isDraggingOverModal = false;
		if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
			await startImport(e.dataTransfer.items);
			return;
		}
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			await startImport(e.dataTransfer.files);
		}
	}

	function enableDirectorySelection(node: HTMLInputElement) {
		node.setAttribute('webkitdirectory', '');
		node.setAttribute('directory', '');
	}

	export function close(): void {
		if (phase === 'uploading') {
			cancelUpload();
		} else if (phase === 'scanning') {
			cancelScan();
		}
		visible = false;
	}

	export function cancelScan(): void {
		isCancelled = true;
		visible = false;
	}

	export function cancelUpload(): void {
		isCancelled = true;
		uploadController?.abort();
	}

	// ENTRY POINT: SCAN A DROPPED ITEM LIST OR FILE LIST FROM THE LIBRARY
	export async function startImport(source: DataTransferItemList | File[] | FileList): Promise<void> {
		visible = true;
		phase = 'scanning';
		scanCount = 0;
		errorMessage = '';
		rows = [];
		bookTitle = '';
		sourceLang = $settings.sourceLang || 'zh';
		targetLang = $settings.targetLang || 'en';
		createdBookId = null;
		completedChapters = 0;
		isCancelled = false;
		uploadController = new AbortController();

		try {
			const isFileLike = Array.isArray(source) || source instanceof FileList;
			const result = isFileLike
				? await parseFileList(source as File[] | FileList, (count) => {
						if (!isCancelled) scanCount = count;
					})
				: await parseDataTransferItems(source as DataTransferItemList, (count) => {
						if (!isCancelled) scanCount = count;
					});

			if (isCancelled) return;

			bookTitle = result.rootFolderName?.trim() || 'New Book';

			if (result.isMultiChapter && result.chapters.length >= 2) {
				rows = result.chapters.map((c) => buildRow(c.title || c.folderName, c.seqHint, c.files));
				phase = 'confirm';
				return;
			}

			if (result.flatFiles.length > 0) {
				rows = [buildRow('Chapter 1', 1, result.flatFiles)];
				phase = 'confirm';
				return;
			}

			phase = 'error';
			errorMessage = 'No images found in the dropped folder.';
		} catch (err: any) {
			if (isCancelled) return;
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

	// CREATE BOOK FIRST, THEN SEQUENTIALLY CREATE CHAPTERS AND UPLOAD PAGES
	async function runBookCreationAndUpload(): Promise<void> {
		if (!bookTitle.trim()) {
			errorMessage = 'Please provide a book title.';
			return;
		}

		phase = 'uploading';
		completedChapters = 0;
		isCancelled = false;
		uploadController = new AbortController();

		try {
			// STEP 1: CREATE BOOK RECORD
			const bookRes = await fetch('/api/books', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: bookTitle.trim(),
					sourceLang,
					targetLang,
				}),
				signal: uploadController.signal,
			});

			if (!bookRes.ok) {
				throw new Error('Failed to create book in library.');
			}

			const createdBook = await bookRes.json();
			createdBookId = createdBook.id;

			// STEP 2: CREATE CHAPTERS & UPLOAD PAGES
			for (let r = 0; r < rows.length; r++) {
				if (uploadController.signal.aborted || isCancelled) break;
				const row = rows[r];
				const createRes = await fetch(`/api/books/${createdBookId}/chapters`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						title: row.title,
						...(row.seq !== null ? { seq: row.seq } : { seq: r }),
					}),
					signal: uploadController.signal,
				});

				if (!createRes.ok) {
					throw new Error(`Failed to create chapter "${row.title}"`);
				}

				const createdCh = await createRes.json();
				const chapterId = createdCh.id;
				rows[r] = { ...row, chapterId };

				for (let f = 0; f < row.rawFiles.length; f++) {
					if (uploadController.signal.aborted || isCancelled) break;
					rows[r].files[f] = { ...rows[r].files[f], loaded: 0, status: 'uploading' };
					await uploadSingleFile(
						row.rawFiles[f],
						`/api/chapters/${chapterId}/pages`,
						(loaded, total) => {
							rows[r].files[f] = { ...rows[r].files[f], loaded, total, status: 'uploading' };
						},
						uploadController.signal
					);
					rows[r].files[f] = { ...rows[r].files[f], loaded: rows[r].files[f].total, status: 'done' };
				}

				if (uploadController.signal.aborted || isCancelled) break;
				completedChapters++;
			}

			if (uploadController.signal.aborted || isCancelled) {
				phase = 'error';
				errorMessage = 'Import cancelled by user.';
				dispatch('created', { bookId: createdBookId });
				return;
			}

			phase = 'done';
			dispatch('created', { bookId: createdBookId });
		} catch (err: any) {
			if (
				uploadController?.signal.aborted ||
				isCancelled ||
				err?.message === 'Upload cancelled' ||
				err?.name === 'AbortError'
			) {
				phase = 'error';
				errorMessage = 'Import cancelled by user.';
				if (createdBookId) {
					dispatch('created', { bookId: createdBookId });
				}
				return;
			}
			phase = 'error';
			errorMessage = err?.message || 'Failed to create book and import chapters.';
		}
	}

	function navigateToCreatedBook(): void {
		visible = false;
		if (createdBookId) {
			goto(`/app/books/${createdBookId}`);
		}
	}
</script>

<!-- HIDDEN FOLDER INPUT — USED BY THE IDLE PHASE BROWSE BUTTON -->
<input
	bind:this={folderPickerInput}
	type="file"
	use:enableDirectorySelection
	multiple
	class="hidden"
	on:change={handleIdleFolderSelected}
/>

<Modal
	open={visible}
	title={phase === 'idle'
		? 'Import Manga / Book Folder'
		: phase === 'scanning'
			? 'Scanning Dropped Folder'
			: phase === 'confirm'
				? 'Create Book from Dropped Folder'
				: phase === 'uploading'
					? 'Creating Book & Importing Chapters'
					: phase === 'done'
						? 'Book Created Successfully'
						: phase === 'error' && isCancelled
							? 'Import Cancelled'
							: 'Import Error'}
	size="md"
	closable={phase !== 'uploading'}
	on:close={close}
>
	{#if phase === 'idle'}
		<!-- IDLE PHASE — DROP ZONE + BROWSE BUTTON -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="flex flex-col gap-4 text-xs"
			on:dragover={handleModalDragOver}
			on:dragleave={handleModalDragLeave}
			on:drop={handleModalDrop}
		>
			<!-- MAIN DROP ZONE -->
			<div
				class="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed py-10 text-center transition-colors {isDraggingOverModal
					? 'border-[#b23a2e] bg-[#b23a2e]/5 dark:border-[#e08a63] dark:bg-[#e08a63]/5'
					: 'border-black/10 bg-black/[0.02] hover:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20'}"
			>
				<div
					class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/10 dark:text-[#e08a63]"
				>
					<BookOpen size={24} />
				</div>
				<div class="space-y-1">
					<p class="text-sm font-bold">Drop a manga or book folder here</p>
					<p class="text-[11px] opacity-60">
						XianScan will scan the folder structure and detect chapters automatically.
					</p>
				</div>
				<Button variant="secondary" class="gap-1.5" on:click={() => folderPickerInput?.click()}>
					<FolderUp size={15} />
					<span>Browse Folder</span>
				</Button>
			</div>

			<!-- HOW IT WORKS HINT ROW -->
			<div class="flex items-start gap-3 rounded-xl border border-black/[0.07] bg-black/[0.02] p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/10 dark:text-[#e08a63]">
					<FolderTree size={14} />
				</div>
				<div class="space-y-0.5">
					<p class="font-semibold">How it works</p>
					<p class="text-[11px] leading-snug opacity-65">
						Drop a single folder of pages to create one chapter, or a folder containing sub-folders
						to automatically create multiple chapters from each sub-folder.
					</p>
				</div>
			</div>
		</div>
	{:else if phase === 'scanning'}
		<!-- SCANNING PHASE -->

		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-xs dark:bg-white/10">
				<ScanLine size={24} class="text-[#b23a2e] dark:text-[#e08a63]" />
			</div>
			<div>
				<h3 class="text-sm font-bold">Scanning folder structure...</h3>
				<p class="mt-1 text-xs opacity-60">
					Found <strong>{scanCount}</strong> page{scanCount === 1 ? '' : 's'} so far.
				</p>
			</div>
			<div class="flex items-center gap-2 text-xs opacity-60">
				<Loader2 size={13} class="animate-spin" />
				<span>Please keep this window open while scanning...</span>
			</div>
		</div>
	{:else if phase === 'confirm'}
		<!-- CONFIRMATION & METADATA SETUP PHASE -->
		<div class="space-y-4 text-xs">
			<!-- CALLOUT BANNER -->
			<div
				class="flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] p-3 text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
			>
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63]"
				>
					<BookOpen size={18} />
				</div>
				<div class="min-w-0 space-y-0.5">
					<p class="text-xs font-bold leading-tight">
						Ready to create book with {rows.length} chapter{rows.length === 1 ? '' : 's'} ({totalImages} total pages)
					</p>
					<p class="text-[11px] leading-tight opacity-75">
						Configure the book title and languages before importing.
					</p>
				</div>
			</div>

			<!-- BOOK TITLE INPUT -->
			<div class="space-y-1">
				<TextField
					label="Book Title"
					bind:value={bookTitle}
					placeholder="Enter book title"
					required
				/>
			</div>

			<!-- LANGUAGE SELECTION -->
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Source Language</span>
					<LanguagePicker mode="source" bind:value={sourceLang} />
				</div>
				<div>
					<span class="mb-1 block text-xs font-semibold opacity-60">Target Language</span>
					<LanguagePicker bind:value={targetLang} excludeCode={sourceLang} />
				</div>
			</div>

			<!-- DISCOVERED CHAPTERS PREVIEW -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider opacity-60">
					<span>Chapters to Create</span>
					<span>Page Count</span>
				</div>
				<div class="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-black/[0.08] bg-black/[0.02] p-1.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
					{#each rows as row, idx}
						<div class="flex items-center justify-between rounded-lg border border-black/[0.04] bg-white/70 px-2.5 py-1.5 text-xs dark:border-white/[0.04] dark:bg-white/[0.04]">
							<div class="flex min-w-0 items-center gap-2">
								<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-black/5 font-mono text-[10px] font-bold opacity-60 dark:bg-white/10">
									{idx + 1}
								</span>
								<span class="truncate font-medium">{row.title}</span>
							</div>
							<span class="shrink-0 font-mono text-[11px] font-medium opacity-70">
								{row.files.length} pgs
							</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else if phase === 'uploading'}
		<!-- UPLOADING PROGRESS PHASE -->
		<div class="flex flex-col gap-4">
			<div
				class="flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
			>
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs dark:bg-white/10"
				>
					<Loader2 size={24} class="animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="truncate text-sm font-bold tracking-tight sm:text-base">
						Creating "{bookTitle}" ({totalImages} pages across {rows.length} chapter{rows.length === 1 ? '' : 's'})...
					</h3>
					<p class="mt-0.5 truncate text-xs opacity-65">
						Transferring {formatBytes(uploadedBytes)} to book storage...
					</p>
				</div>
			</div>

			<!-- OVERALL PROGRESS BAR -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between text-[11px] font-medium">
					<span class="uppercase tracking-wider opacity-60">Overall Import Progress</span>
					<span class="font-mono">{globalPercent}%</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
					<!-- GLOBAL PROGRESS BAR WIDTH - DYNAMIC RUNTIME -->
					<div
						class="h-full rounded-full bg-[#b23a2e] transition-[width] duration-200 ease-out dark:bg-[#e08a63]"
						style="width: {globalPercent}%"
					></div>
				</div>
			</div>

			{#if rows.length > 1}
				<div class="flex items-center gap-1.5 text-[11px] font-medium opacity-70">
					<Layers size={13} class="text-amber-500" />
					<span>Chapters completed: {completedChapters}/{rows.length}</span>
				</div>
			{/if}

			<!-- CHAPTER & FILE LIST PROGRESS -->
			<div class="mt-1 max-h-52 space-y-2 overflow-y-auto pr-0.5">
				{#each rows as row}
					<div
						class="rounded-xl border border-black/[0.06] bg-black/[0.01] p-2 dark:border-white/[0.06] dark:bg-white/[0.01]"
					>
						<div class="mb-1.5 flex items-center justify-between px-1">
							<span class="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold opacity-80">
								<FolderTree size={12} class="shrink-0 text-amber-500" />
								<span class="truncate">{row.title}</span>
							</span>
							<span class="shrink-0 font-mono text-[10px] opacity-50">
								{row.files.filter((f) => f.status === 'done').length}/{row.files.length}
							</span>
						</div>
						<div class="space-y-1">
							{#each row.files as item}
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
		<!-- DONE PHASE -->
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-[#4f7a64]/10 text-[#4f7a64] dark:text-[#83b39a]"
			>
				<CheckCircle2 size={26} />
			</div>
			<div>
				<h3 class="text-sm font-bold">Book created and imported!</h3>
				<p class="mt-1 text-xs opacity-60">
					"{bookTitle}" created with {rows.length} chapter{rows.length === 1 ? '' : 's'} and {totalImages} page{totalImages === 1 ? '' : 's'}.
				</p>
			</div>
		</div>
	{:else}
		<!-- ERROR PHASE -->
		<div class="flex flex-col items-center gap-4 py-8 text-center">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
				<AlertCircle size={26} />
			</div>
			<div>
				<h3 class="text-sm font-bold">{isCancelled ? 'Import cancelled' : 'Import failed'}</h3>
				<p class="mt-1 text-xs opacity-60">{errorMessage || 'An error occurred during import.'}</p>
				{#if isCancelled && completedChapters > 0}
					<p class="mt-1.5 text-xs text-[#4f7a64] dark:text-[#83b39a] font-medium">
						{completedChapters} chapter{completedChapters === 1 ? '' : 's'} were imported before cancellation.
					</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- MODAL FOOTER -->
	<svelte:fragment slot="footer">
		{#if phase === 'idle'}
			<Button variant="secondary" on:click={close}>Cancel</Button>
		{:else if phase === 'scanning'}
			<Button variant="secondary" on:click={cancelScan}>Cancel</Button>
		{:else if phase === 'confirm'}
			<div class="flex w-full items-center justify-between gap-2.5">
				<Button variant="secondary" on:click={close}>Cancel</Button>
				<Button
					variant="primary"
					class="gap-1.5"
					disabled={!bookTitle.trim()}
					on:click={runBookCreationAndUpload}
				>
					<Layers size={15} />
					<span>Create Book & Import</span>
				</Button>
			</div>
		{:else if phase === 'uploading'}
			<div class="flex w-full items-center justify-between gap-2.5">
				<div class="flex min-w-0 items-center gap-2 text-xs opacity-60">
					<Loader2 size={13} class="shrink-0 animate-spin" />
					<span class="truncate">Importing chapter {completedChapters + 1} of {rows.length}...</span>
				</div>
				<Button variant="secondary" on:click={cancelUpload}>Cancel</Button>
			</div>
		{:else if phase === 'done'}
			<div class="flex w-full items-center justify-between gap-2.5">
				<Button variant="secondary" on:click={close}>Close</Button>
				<Button variant="primary" class="gap-1.5" on:click={navigateToCreatedBook}>
					<span>Go to Book</span>
					<ArrowRight size={15} />
				</Button>
			</div>
		{:else if phase === 'error'}
			<Button variant="secondary" on:click={close}>Close</Button>
		{/if}
	</svelte:fragment>
</Modal>
