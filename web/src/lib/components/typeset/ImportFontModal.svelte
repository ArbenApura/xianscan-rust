<!-- IMPORT FONT MODAL - UPLOAD TRUE TYPE OR OPEN TYPE FONTS FOR COMIC TYPESETTING -->
<script lang="ts">
// IMPORTED DEP-MODULES
import { createEventDispatcher } from 'svelte';
import { toast } from 'svelte-sonner';
// IMPORTED MODULES
import { refreshFontAvailability, type CustomFontItem } from '$lib/stores/settings';
import { SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
import type { Script } from '$lib/languages';
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

// -- OPTIONAL PROPS -- //

export let open: boolean = false;
export let targetScriptType: 'dialogue' | 'cjk' = 'dialogue';
export let lockScriptType: boolean = true;
/** THE SCRIPT SLOT THE USER UPLOADED FROM, IF ANY: THE SERVER WARNS WHEN THE FONT DOES NOT COVER IT (FEAT-006). */
export let targetSlot: ScriptFontSlot | undefined = undefined;

// -- CONSTANTS -- //

const dispatch = createEventDispatcher<{
	imported: { font: CustomFontItem };
}>();

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// EXAMPLE FAMILIES PER SCRIPT SLOT FOR THE NAME FIELD'S PLACEHOLDER
const SLOT_PLACEHOLDERS: Record<ScriptFontSlot, string> = {
	han: 'e.g. Noto Sans SC, Source Han Sans, PingFang SC',
	kana: 'e.g. Noto Sans JP, Yu Gothic, Hiragino Sans',
	hangul: 'e.g. Noto Sans KR, Malgun Gothic, Nanum Gothic',
	devanagari: 'e.g. Noto Sans Devanagari, Mukta, Hind',
	thai: 'e.g. Noto Sans Thai, Sarabun, Prompt',
	arabic: 'e.g. Noto Sans Arabic, Tajawal, Cairo',
	cyrillic: 'e.g. PT Sans, Roboto, Comic CAT',
	greek: 'e.g. Noto Sans, GFS Neohellenic, Roboto',
	hebrew: 'e.g. Noto Sans Hebrew, Rubik, Heebo',
	bengali: 'e.g. Noto Sans Bengali, Hind Siliguri',
	tamil: 'e.g. Noto Sans Tamil, Catamaran, Mukta Malar',
};

// -- STATES -- //

let selectedFiles: File[] = [];
let fontName: string = '';
let scriptType: 'dialogue' | 'cjk' = targetScriptType;
let isUploading: boolean = false;
let errorMessage: string = '';
let fileInputRef: HTMLInputElement | null = null;
let isDragging: boolean = false;
// SHOWN AFTER AN UPLOAD THAT CAME BACK WITH WARNINGS (SCRIPTS ARE DETECTED FROM THE FILE, NOT CHOSEN BY HAND)
let uploadResult: { name: string; scripts: Script[]; warnings: string[] } | null = null;
// BUMPED ON EVERY CLOSE: AN UPLOAD THAT FINISHES AFTER ITS MODAL CLOSED (OR WAS REOPENED) NEVER TOUCHES THE NEW ONE
let uploadToken = 0;

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
	uploadToken++;
	selectedFiles = [];
	fontName = '';
	scriptType = targetScriptType;
	isUploading = false;
	errorMessage = '';
	isDragging = false;
	uploadResult = null;
	if (fileInputRef) fileInputRef.value = '';
}

function handleFilesAdd(files: FileList | File[]): void {
	errorMessage = '';
	// A NEW FILE STARTS A NEW IMPORT: THE PREVIOUS RESULT AND ITS WARNINGS NO LONGER APPLY
	uploadResult = null;
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

	const token = ++uploadToken;
	isUploading = true;
	errorMessage = '';

	try {
		const formData = new FormData();
		for (const file of selectedFiles) {
			formData.append('files', file);
		}
		formData.append('name', fontName.trim());
		formData.append('scriptType', scriptType);
		if (targetSlot) formData.append('slot', targetSlot);

		const res = await fetch('/api/system/fonts', {
			method: 'POST',
			body: formData,
		});

		const data = await res.json();

		if (!res.ok || !data.success) {
			throw new Error(data.error || 'Failed to upload font');
		}

		await refreshFontAvailability();
		if (token !== uploadToken) {
			// THE MODAL WAS CLOSED MEANWHILE: THE FONT IS STORED, BUT NOTHING IS SELECTED AND THE FORM IS LEFT ALONE
			toast.success(`Font "${data.font.name}" imported`);
			return;
		}
		const countDesc = selectedFiles.length > 1 ? ` (${selectedFiles.length} weights)` : '';
		const scripts: Script[] = Array.isArray(data.scripts) ? data.scripts : [];
		const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
		const covers = scripts.length > 0 ? `. Covers: ${scripts.map((sc) => SCRIPT_LABELS[sc] ?? sc).join(', ')}` : '';
		toast.success(`Font "${data.font.name}"${countDesc} imported${covers}`);
		dispatch('imported', { font: data.font });
		if (warnings.length > 0) {
			// KEEP THE MODAL OPEN SO THE WARNING IS READ, NOT MISSED IN A TOAST
			uploadResult = { name: data.font.name, scripts, warnings };
			selectedFiles = [];
		} else {
			open = false;
			resetForm();
		}
	} catch (err: any) {
		if (token !== uploadToken) return;
		errorMessage = err.message || 'An unexpected error occurred during font upload.';
	} finally {
		if (token === uploadToken) isUploading = false;
	}
}

// -- REACTIVE STATEMENTS -- //

$: if (open) {
	scriptType = targetScriptType;
}

$: if (!open) {
	resetForm();
}

// A SCRIPT SLOT NAMES ITS OWN SCRIPT (THAI, ARABIC...); ONLY THE SLOT-LESS LEGACY PATH SAYS CJK
$: slotLabel = targetSlot ? SCRIPT_LABELS[targetSlot] : undefined;

$: modalTitle = slotLabel
	? `Import ${slotLabel} Font`
	: lockScriptType
		? targetScriptType === 'cjk'
			? 'Import CJK Fallback Font'
			: 'Import Dialogue Font'
		: 'Import Custom Font';

$: buttonLabel = slotLabel
	? 'Import Font'
	: lockScriptType
		? targetScriptType === 'cjk'
			? 'Import CJK Font'
			: 'Import Dialogue Font'
		: 'Import Font';

$: placeholderText = targetSlot
	? SLOT_PLACEHOLDERS[targetSlot]
	: targetScriptType === 'cjk'
		? 'e.g. Noto Sans CJK, Source Han Sans, PingFang'
		: 'e.g. CC Wild Words, Open Sans, Anime Ace';
</script>

<!-- NOT CLOSABLE MID-UPLOAD; THE UPLOAD TOKEN STILL GUARDS A CLOSE FROM OUTSIDE (THE PARENT RESETTING open) -->
<Modal bind:open title={modalTitle} size="md" placement="center" closable={!isUploading} on:close={() => (open = false)}>
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

		<!-- DETECTED SCRIPTS: THE FILE DECIDES WHICH SCRIPTS A FONT CAN RENDER (FEAT-006) -->
		{#if uploadResult}
			<div class="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs" data-testid="font-upload-result">
				<div class="font-semibold">"{uploadResult.name}" was imported.</div>
				{#if uploadResult.scripts.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each uploadResult.scripts as sc}
							<span class="rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">{SCRIPT_LABELS[sc] ?? sc}</span>
						{/each}
					</div>
				{/if}
				{#each uploadResult.warnings as warning}
					<div class="flex items-start gap-2 text-amber-800 dark:text-amber-200">
						<AlertCircle size={14} class="mt-0.5 shrink-0" />
						<span>{warning}</span>
					</div>
				{/each}
			</div>
		{:else}
			<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-[11px] opacity-80 dark:border-white/10 dark:bg-white/[0.02]">
				{#if targetSlot}
					Uploading for <strong>{SCRIPT_LABELS[targetSlot]}</strong> text. The scripts a font can render are read from the file itself.
				{:else}
					The scripts a font can render (Latin, Hindi, Thai, Chinese...) are read from the file itself.
				{/if}
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
