<!-- IMPORT FONT MODAL - UPLOAD TRUE TYPE OR OPEN TYPE FONTS FOR COMIC TYPESETTING -->
<script lang="ts">
// IMPORTED DEP-MODULES
import { createEventDispatcher } from 'svelte';
import { toast } from 'svelte-sonner';
// IMPORTED MODULES
import { refreshFontAvailability, type CustomFontItem } from '$lib/stores/settings';
import { cn } from '$lib/utils/cn';
import { ripple } from '$lib/actions/ripple';
// IMPORTED DEP-COMPONENTS
import Upload from 'lucide-svelte/icons/upload';
import Type from 'lucide-svelte/icons/type';
import FileText from 'lucide-svelte/icons/file-text';
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import X from 'lucide-svelte/icons/x';
import Plus from 'lucide-svelte/icons/plus';
import Layers from 'lucide-svelte/icons/layers';
// IMPORTED COMPONENTS
import Modal from '$lib/components/ui/Modal.svelte';
import Button from '$lib/components/ui/Button.svelte';
import TextField from '$lib/components/ui/TextField.svelte';
import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';

// -- OPTIONAL PROPS -- //

export let open: boolean = false;
export let targetScriptType: 'dialogue' | 'cjk' = 'dialogue';
export let lockScriptType: boolean = true;

// -- CONSTANTS -- //

const dispatch = createEventDispatcher<{
	imported: { font: CustomFontItem };
}>();

const SCRIPT_OPTIONS = [
	{ value: 'dialogue', label: 'Latin Dialogue' },
	{ value: 'cjk', label: 'CJK Fallback' },
];

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// -- STATES -- //

let selectedFiles: File[] = [];
let fontName: string = '';
let scriptType: 'dialogue' | 'cjk' = targetScriptType;
let isUploading: boolean = false;
let errorMessage: string = '';
let fileInputRef: HTMLInputElement | null = null;
let isDragging: boolean = false;

// -- FUNCTIONS -- //

function detectWeightHint(filename: string): { label: string; isBold: boolean } {
	const lower = filename.toLowerCase();
	if (lower.includes('variable') || lower.includes('varfont')) {
		return { label: 'Variable', isBold: false };
	}
	if (lower.includes('black') || lower.includes('heavy') || lower.includes('extrabold') || lower.includes('extra-bold')) {
		return { label: 'Black / Extra Bold', isBold: true };
	}
	if (lower.includes('semibold') || lower.includes('semi-bold') || lower.includes('demibold')) {
		return { label: 'SemiBold', isBold: true };
	}
	if (lower.includes('bold')) {
		return { label: 'Bold', isBold: true };
	}
	if (lower.includes('medium')) {
		return { label: 'Medium', isBold: false };
	}
	if (lower.includes('light') || lower.includes('thin') || lower.includes('extralight')) {
		return { label: 'Light', isBold: false };
	}
	if (lower.includes('italic')) {
		return { label: 'Italic', isBold: false };
	}
	return { label: 'Regular', isBold: false };
}

function resetForm(): void {
	selectedFiles = [];
	fontName = '';
	scriptType = targetScriptType;
	isUploading = false;
	errorMessage = '';
	isDragging = false;
	if (fileInputRef) fileInputRef.value = '';
}

function handleFilesAdd(files: FileList | File[]): void {
	errorMessage = '';
	const incoming = Array.from(files);
	const validFiles: File[] = [];

	for (const f of incoming) {
		const lower = f.name.toLowerCase();
		if (!lower.endsWith('.ttf') && !lower.endsWith('.otf')) {
			errorMessage = `"${f.name}" is not a TrueType (.ttf) or OpenType (.otf) font.`;
			continue;
		}
		if (f.size > MAX_SIZE_BYTES) {
			errorMessage = `"${f.name}" exceeds the 20 MB size limit.`;
			continue;
		}
		// PREVENT DUPLICATES BY NAME
		if (!selectedFiles.some((s) => s.name === f.name)) {
			validFiles.push(f);
		}
	}

	if (validFiles.length > 0) {
		selectedFiles = [...selectedFiles, ...validFiles];

		// PRE-POPULATE FONT FAMILY NAME IF EMPTY
		if (!fontName) {
			const first = selectedFiles[0];
			const baseName = first.name.replace(/\.[^/.]+$/, '');
			const cleaned = baseName
				.replace(/[-_](static|variablefont|vf)/gi, '')
				.replace(/[-_](regular|bold|italic|semibold|semi-bold|light|thin|black|medium)/gi, '')
				.replace(/[-_]/g, ' ')
				.trim();
			fontName = cleaned || baseName;
		}
	}
}

function handleRemoveFile(index: number): void {
	selectedFiles = selectedFiles.filter((_, i) => i !== index);
	if (selectedFiles.length === 0) {
		fontName = '';
	}
}

function handleFileInputChange(e: Event): void {
	const target = e.target as HTMLInputElement;
	if (target.files && target.files.length > 0) {
		handleFilesAdd(target.files);
		target.value = '';
	}
}

function handleDrop(e: DragEvent): void {
	e.preventDefault();
	isDragging = false;
	if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
		handleFilesAdd(e.dataTransfer.files);
	}
}

function handleDragOver(e: DragEvent): void {
	e.preventDefault();
	isDragging = true;
}

function handleDragLeave(): void {
	isDragging = false;
}

async function handleUpload(): Promise<void> {
	if (selectedFiles.length === 0) {
		errorMessage = 'Please choose at least one font file to import.';
		return;
	}

	isUploading = true;
	errorMessage = '';

	try {
		const formData = new FormData();
		for (const file of selectedFiles) {
			formData.append('files', file);
		}
		formData.append('name', fontName.trim());
		formData.append('scriptType', scriptType);

		const res = await fetch('/api/system/fonts', {
			method: 'POST',
			body: formData,
		});

		const data = await res.json();

		if (!res.ok || !data.success) {
			throw new Error(data.error || 'Failed to upload font');
		}

		await refreshFontAvailability();
		const countDesc = selectedFiles.length > 1 ? ` (${selectedFiles.length} weights)` : '';
		toast.success(`Font "${data.font.name}"${countDesc} imported successfully`);
		dispatch('imported', { font: data.font });
		open = false;
		resetForm();
	} catch (err: any) {
		errorMessage = err.message || 'An unexpected error occurred during font upload.';
	} finally {
		isUploading = false;
	}
}

// -- REACTIVE STATEMENTS -- //

$: if (open) {
	scriptType = targetScriptType;
}

$: if (!open) {
	resetForm();
}

$: modalTitle = lockScriptType
	? targetScriptType === 'cjk'
		? 'Import CJK Fallback Font'
		: 'Import Dialogue Font'
	: 'Import Custom Font';

$: buttonLabel = lockScriptType
	? targetScriptType === 'cjk'
		? 'Import CJK Font'
		: 'Import Dialogue Font'
	: 'Import Font';

$: placeholderText = targetScriptType === 'cjk'
	? 'e.g. Noto Sans CJK, Source Han Sans, PingFang'
	: 'e.g. CC Wild Words, Open Sans, Anime Ace';
</script>

<Modal bind:open title={modalTitle} size="md" placement="center" on:close={() => (open = false)}>
	<div class="space-y-4">
		<!-- DROPZONE FILE SELECTOR -->
		<div
			class={cn(
				'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-all',
				isDragging
					? 'border-[#b23a2e] bg-[#b23a2e]/5 dark:border-[#e08a63] dark:bg-[#e08a63]/5'
					: selectedFiles.length > 0
						? 'border-[#4f7a64]/50 bg-[#4f7a64]/5 dark:border-[#83b39a]/40 dark:bg-[#83b39a]/5'
						: 'border-black/15 bg-black/[0.02] hover:border-black/25 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-white/25',
			)}
			on:dragover={handleDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleDrop}
			role="region"
			aria-label="Font file drop zone"
		>
			<input
				type="file"
				multiple
				accept=".ttf,.otf"
				bind:this={fileInputRef}
				on:change={handleFileInputChange}
				class="hidden"
				id="custom-font-input"
			/>

			{#if selectedFiles.length > 0}
				<div class="w-full space-y-2">
					<div class="flex items-center justify-between pb-1">
						<span class="inline-flex items-center gap-1.5 text-xs font-bold text-current">
							<Layers size={14} class="text-[#4f7a64] dark:text-[#83b39a]" />
							<span>{selectedFiles.length} {selectedFiles.length === 1 ? 'Font File' : 'Font Files'} Selected</span>
						</span>
						<button
							type="button"
							on:click={() => fileInputRef?.click()}
							class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b23a2e] hover:underline dark:text-[#e08a63] cursor-pointer"
							use:ripple
						>
							<Plus size={12} />
							<span>Add More</span>
						</button>
					</div>

					<!-- LIST OF SELECTED FILES WITH WEIGHT BADGES -->
					<div class="max-h-40 overflow-y-auto space-y-1.5 pr-1">
						{#each selectedFiles as file, idx}
							{@const hint = detectWeightHint(file.name)}
							<div class="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white/70 px-3 py-1.5 dark:border-white/10 dark:bg-neutral-800/80">
								<div class="flex items-center gap-2 min-w-0">
									<FileText size={15} class="shrink-0 text-current opacity-60" />
									<div class="text-left truncate">
										<span class="text-xs font-medium text-current truncate block max-w-[130px] sm:max-w-[200px]">{file.name}</span>
										<span class="text-[10px] opacity-50 block">{(file.size / 1024).toFixed(0)} KB</span>
									</div>
								</div>

								<div class="flex items-center gap-1.5 shrink-0">
									<span class={cn(
										'rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
										hint.isBold
											? 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200'
											: 'bg-black/5 text-neutral-700 dark:bg-white/10 dark:text-neutral-300'
									)}>
										{hint.label}
									</span>
									<button
										type="button"
										on:click={() => handleRemoveFile(idx)}
										class="p-1 text-current opacity-50 hover:opacity-100 rounded-md hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
										title="Remove file"
									>
										<X size={13} />
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5 text-current opacity-75 mb-2">
					<Upload size={24} />
				</div>
				<p class="text-xs font-bold text-current">Drag and drop font files here</p>
				<p class="text-[11px] opacity-60 mt-0.5">Select single or multiple weights (Regular, Bold, Italic) up to 20 MB each</p>

				<button
					type="button"
					on:click={() => fileInputRef?.click()}
					class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-2xs hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
					use:ripple
				>
					<Type size={14} />
					<span>Browse Files</span>
				</button>
			{/if}
		</div>

		<!-- SCRIPT TARGET CATEGORY -->
		{#if !lockScriptType}
			<div class="space-y-1.5">
				<label for="font-script-type" class="block text-xs font-bold uppercase tracking-wider opacity-75">
					Font Category
				</label>
				<SegmentedControl options={SCRIPT_OPTIONS} bind:value={scriptType} block />
				<p class="text-[11px] opacity-60">
					{scriptType === 'dialogue'
						? 'Used for primary Latin and English speech bubble dialogue.'
						: 'Used as fallback glyph stack for Chinese, Japanese, or Korean text.'}
				</p>
			</div>
		{:else}
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
				<div class="space-y-0.5 min-w-0 flex-1">
					<div class="text-[11px] font-bold uppercase tracking-wider opacity-60">Target Category</div>
					<div class="text-xs font-semibold text-current">
						{targetScriptType === 'cjk' ? 'CJK East Asian Fallback Engine' : 'Latin Speech Bubble Dialogue'}
					</div>
					<p class="text-[11px] opacity-60">
						{targetScriptType === 'cjk'
							? 'Renders Chinese, Japanese, or Korean text glyphs.'
							: 'Renders primary English and Latin comic dialogue.'}
					</p>
				</div>
				<span class={cn(
					'inline-flex shrink-0 self-start sm:self-center items-center rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
					targetScriptType === 'cjk'
						? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63]'
						: 'bg-[#4f7a64]/10 text-[#4f7a64] dark:bg-[#83b39a]/15 dark:text-[#83b39a]'
				)}>
					{targetScriptType === 'cjk' ? 'CJK' : 'Dialogue'}
				</span>
			</div>
		{/if}

		<!-- FONT FAMILY DISPLAY LABEL -->
		<div class="space-y-1.5">
			<TextField
				label="Font Display Label"
				placeholder={placeholderText}
				bind:value={fontName}
				required
			/>
			<p class="text-[11px] opacity-60">
				The name shown across typesetting studio controls and comic renderers.
			</p>
		</div>

		<!-- ERROR ALERT -->
		{#if errorMessage}
			<div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-700 dark:border-red-500/30 dark:text-red-300">
				<AlertCircle size={15} class="shrink-0 mt-0.5" />
				<span>{errorMessage}</span>
			</div>
		{/if}
	</div>

	<!-- FOOTER CONTROLS -->
	<div slot="footer" class="flex items-center justify-end gap-2">
		<Button variant="ghost" size="sm" on:click={() => (open = false)} disabled={isUploading}>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			loading={isUploading}
			disabled={selectedFiles.length === 0 || !fontName.trim() || isUploading}
			on:click={handleUpload}
		>
			<Upload size={14} class="mr-1.5" />
			<span>{buttonLabel}</span>
		</Button>
	</div>
</Modal>
