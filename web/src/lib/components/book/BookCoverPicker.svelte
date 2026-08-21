<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { Button, LazyImage } from '$lib/components/ui';
	import { cn } from '$lib/utils/cn';
	// IMPORTED DEP-COMPONENTS
	import ImageUp from 'lucide-svelte/icons/image-up';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import UploadCloud from 'lucide-svelte/icons/upload-cloud';

	// -- REQUIRED PROPS -- //

	export let bookId: string;

	// -- OPTIONAL PROPS -- //

	export let coverSrc: string | null = null;

	// -- TYPES -- //

	interface CoverResult {
		coverPath: string | null;
		coverRev: number;
	}

	// -- CONSTANTS -- //

	const MAX_COVER_BYTES = 20 * 1024 * 1024;

	// -- STATES -- //

	let uploading = false;
	let dragActive = false;
	let fileInput: HTMLInputElement;

	const dispatch = createEventDispatcher<{
		uploaded: { coverPath: string; coverRev: number };
		removed: void;
	}>();

	// -- FUNCTIONS -- //

	function onFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		void uploadCover(file);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragActive = true;
	}

	function onDragLeave() {
		dragActive = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		void uploadCover(file);
	}

	async function uploadCover(file: File) {
		if (file.size > MAX_COVER_BYTES) {
			toast.error('Cover image is larger than 20 MB.');
			return;
		}
		uploading = true;
		try {
			const form = new FormData();
			form.append('cover', file);
			const resp = await fetch(`/api/covers/${bookId}`, { method: 'POST', body: form });
			if (!resp.ok) {
				const body = await resp.json().catch(() => null);
				throw new Error((body as { message?: string } | null)?.message || 'Could not upload the cover.');
			}
			const data = (await resp.json()) as CoverResult;
			dispatch('uploaded', { coverPath: data.coverPath ?? '', coverRev: data.coverRev });
			toast.success('Cover updated.');
		} catch (e: any) {
			toast.error(e?.message || 'Could not upload cover.');
		} finally {
			uploading = false;
		}
	}

	async function removeCover() {
		uploading = true;
		try {
			const resp = await fetch(`/api/covers/${bookId}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error('Delete failed');
			dispatch('removed');
			toast.success('Cover removed.');
		} catch {
			toast.error('Could not remove cover.');
		} finally {
			uploading = false;
		}
	}
</script>

<div class="flex flex-col gap-2.5">
	<!-- DROP ZONE + PREVIEW -->
	<div
		role="group"
		aria-label="Book cover upload area"
		class={cn(
			'flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-4 transition-colors',
			dragActive
				? 'border-[#b23a2e] bg-[#b23a2e]/5 dark:border-[#e08a63] dark:bg-[#e08a63]/5'
				: 'border-black/10 bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.02]',
		)}
		on:dragover={onDragOver}
		on:dragleave={onDragLeave}
		on:drop={onDrop}
	>
		{#if coverSrc}
			<LazyImage
				src={coverSrc}
				alt="Book cover"
				aspectRatio="aspect-[2/3]"
				showSpineShadow={true}
				class="w-28 rounded-lg shadow-md"
			/>
		{:else}
			<!-- EMPTY STATE -->
			<div class="flex w-28 flex-col items-center gap-1.5 py-5 text-center">
				<UploadCloud size={22} class="opacity-40" />
				<p class="text-[10px] leading-relaxed opacity-50">
					Drop a cover image here,<br />or click below to browse
				</p>
			</div>
		{/if}

		<input
			type="file"
			accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
			class="hidden"
			bind:this={fileInput}
			on:change={onFileChosen}
		/>

		<div class="flex items-center gap-2">
			<Button variant="secondary" size="sm" loading={uploading} disabled={uploading} on:click={() => fileInput?.click()}>
				{#if !uploading}
					<ImageUp size={13} />
				{/if}
				<span>{coverSrc ? 'Replace Cover' : 'Upload Cover'}</span>
			</Button>
			{#if coverSrc}
				<Button
					variant="secondary"
					size="sm"
					disabled={uploading}
					on:click={removeCover}
					class="text-red-600 dark:text-red-400"
				>
					<Trash2 size={13} /> Remove
				</Button>
			{/if}
		</div>
	</div>

	<!-- HINT -->
	<p class="w-full text-[10px] leading-relaxed opacity-50">
		The cover is used in the library and shown to Mihon/Tachiyomi readers. Supported: JPEG, PNG, WebP, AVIF, HEIC.
	</p>
</div>
