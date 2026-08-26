<!-- FOLDER UPLOAD GUIDE & PICKER MODAL -->
<script lang="ts">
	// IMPORTED DEP-COMPONENTS
	import FolderUp from 'lucide-svelte/icons/folder-up';
	import FolderTree from 'lucide-svelte/icons/folder-tree';
	import Info from 'lucide-svelte/icons/info';
	import FileImage from 'lucide-svelte/icons/file-image';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';

	// -- REQUIRED PROPS -- //
	export let open = false;

	// -- OPTIONAL PROPS -- //
	export let onSelectFolder: () => void = () => {};
	export let onClose: () => void = () => {};
</script>

<Modal
	{open}
	title="Import Manga / Chapter Folder"
	size="md"
	on:close={onClose}
>
	<div class="space-y-4 text-xs">
		<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex gap-2.5 text-blue-900 dark:text-blue-200">
			<Info size={16} class="shrink-0 text-blue-500 mt-0.5" />
			<div class="space-y-1">
				<p class="font-semibold text-xs">How Multi-Chapter Folder Import Works</p>
				<p class="text-[11px] opacity-80 leading-relaxed">
					You can select or drag & drop a root book folder containing multiple chapter subfolders. XianScan automatically detects chapter numbering (e.g. <code>Ch. 01</code>, <code>第1章</code>, <code>001 - Title</code>), creates chapters sequentially, and uploads page images in natural order.
				</p>
			</div>
		</div>

		<div class="space-y-1.5">
			<span class="text-[11px] font-semibold uppercase tracking-wider opacity-60">Recommended Folder Structure:</span>
			<div class="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-3 font-mono text-[11px] space-y-1">
				<div class="flex items-center gap-1.5 font-bold text-neutral-800 dark:text-neutral-200">
					<FolderTree size={14} class="text-amber-500" />
					<span>My Manga Book /</span>
				</div>
				<div class="pl-4 space-y-1 text-neutral-600 dark:text-neutral-400">
					<div class="flex items-center gap-1.5">
						<span>├──</span> <FolderTree size={13} class="text-amber-500/70" /> <span>Ch. 01 - The Beginning /</span>
					</div>
					<div class="pl-8 space-y-0.5 opacity-75">
						<div class="flex items-center gap-1"><span>├──</span> <FileImage size={11} /> <span>01.webp</span></div>
						<div class="flex items-center gap-1"><span>└──</span> <FileImage size={11} /> <span>02.webp</span></div>
					</div>
					<div class="flex items-center gap-1.5">
						<span>└──</span> <FolderTree size={13} class="text-amber-500/70" /> <span>Ch. 02 - Next Day /</span>
					</div>
					<div class="pl-8 space-y-0.5 opacity-75">
						<div class="flex items-center gap-1"><span>├──</span> <FileImage size={11} /> <span>01.webp</span></div>
						<div class="flex items-center gap-1"><span>└──</span> <FileImage size={11} /> <span>02.webp</span></div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<Button
			variant="secondary"
			on:click={onClose}
		>
			<span>Cancel</span>
		</Button>

		<Button
			variant="primary"
			class="gap-1.5"
			on:click={() => {
				onClose();
				onSelectFolder();
			}}
		>
			<FolderUp size={15} />
			<span>Select Folder to Import</span>
		</Button>
	</svelte:fragment>
</Modal>

