<script lang="ts">
	// -- IMPORTED DEP-MODULES -- //
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	// -- IMPORTED ICONS -- //
	import RotateCw from 'lucide-svelte/icons/rotate-cw';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import Layers from 'lucide-svelte/icons/layers';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	// -- IMPORTED UI COMPONENTS -- //
	import { Button, Modal } from '$lib/components/ui';

	// -- PROPS -- //
	export let open = false;
	export let bookId: string;
	export let chapterCount: number = 0;
	export let pageCount: number = 0;
	export let bookTitle: string = '';

	// -- EVENTS -- //
	const dispatch = createEventDispatcher<{
		complete: { chaptersReset: number; pagesReset: number };
		close: void;
	}>();

	// -- TYPES -- //
	type State = 'idle' | 'running' | 'done' | 'error';
	type StepId = 'db' | 'files' | 'chapters';

	// -- STATE -- //
	let state: State = 'idle';
	let message = 'Resetting database records and clearing generated layers...';
	let errorMessage = '';
	let result: { chaptersReset: number; pagesReset: number } | null = null;

	let stepStatus: Record<StepId, 'pending' | 'active' | 'done'> = {
		db: 'pending',
		files: 'pending',
		chapters: 'pending',
	};

	const STEPS: Array<{ id: StepId; label: string; desc: string }> = [
		{ id: 'db', label: '1. Database Records', desc: 'Clear OCR text, translated dialogues, and bounding box cache' },
		{ id: 'files', label: '2. Inpainted & Typeset Layers', desc: 'Purge LaMa cleaning masks and rendered output images from disk' },
		{ id: 'chapters', label: '3. Chapter States', desc: 'Reset all chapter status flags while preserving all raw original pages' },
	];

	function resetState() {
		state = 'idle';
		message = 'Resetting database records and clearing generated layers...';
		errorMessage = '';
		result = null;
		stepStatus = {
			db: 'pending',
			files: 'pending',
			chapters: 'pending',
		};
	}

	export async function start() {
		state = 'running';
		stepStatus.db = 'active';
		message = `Resetting progress across ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}...`;
		errorMessage = '';

		try {
			stepStatus.db = 'active';

			const resp = await fetch(`/api/books/${bookId}/clear-progress`, {
				method: 'POST',
			});

			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to clear translation progress');
			}

			const data = await resp.json();
			result = {
				chaptersReset: data.chaptersReset ?? chapterCount,
				pagesReset: data.pagesReset ?? pageCount,
			};

			stepStatus = {
				db: 'done',
				files: 'done',
				chapters: 'done',
			};

			state = 'done';
			toast.success(
				`Cleared progress for ${result.chaptersReset} chapter${result.chaptersReset === 1 ? '' : 's'} (${result.pagesReset} page${result.pagesReset === 1 ? '' : 's'}). All pages preserved.`
			);
		} catch (err: any) {
			state = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
			toast.error(errorMessage);
		}
	}

	function handleClose() {
		if (state === 'running') return;
		const wasDone = state === 'done';
		const savedResult = result;
		open = false;
		resetState();
		if (wasDone && savedResult) {
			dispatch('complete', savedResult);
		} else {
			dispatch('close');
		}
	}
</script>

<Modal
	bind:open
	title="Clear Translation Progress"
	size="md"
	closable={state !== 'running'}
	on:close={handleClose}
>
	<!-- HEADER BRANDING HERO -->
	<div class="flex items-start gap-3.5 rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 dark:border-red-400/20 dark:bg-red-400/5">
		<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-400/15 dark:text-red-400">
			{#if state === 'done'}
				<CheckCircle2 size={22} class="text-emerald-600 dark:text-emerald-400" />
			{:else if state === 'error'}
				<AlertCircle size={22} class="text-rose-600 dark:text-rose-400" />
			{:else}
				<RotateCw size={20} class={state === 'running' ? 'animate-spin' : ''} />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-bold tracking-tight">Reset Book Progress</h3>
				<span class="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-400/20 dark:text-red-400">
					Preserves Original Pages
				</span>
			</div>
			<p class="mt-0.5 text-xs opacity-70 leading-relaxed">
				{#if bookTitle}
					Reset all OCR and translations for <strong class="opacity-90">{bookTitle}</strong>.
				{:else}
					Reset all OCR, translation text, and rendered outputs for this book.
				{/if}
			</p>
		</div>
	</div>

	<!-- BODY: IDLE STATE -->
	{#if state === 'idle'}
		<div class="mt-4 space-y-3.5 text-xs">
			<!-- OVERVIEW STATS -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
				<div class="flex flex-col gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center gap-1.5 font-bold text-xs">
						<Layers size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Target Scope</span>
					</div>
					<p class="text-[11px] opacity-65 leading-relaxed">
						All <strong class="opacity-90 font-mono">{chapterCount}</strong> chapters in this book.
					</p>
				</div>

				<div class="flex flex-col gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center gap-1.5 font-bold text-xs">
						<ShieldCheck size={14} class="text-emerald-600 dark:text-emerald-400" />
						<span>Image Safety</span>
					</div>
					<p class="text-[11px] opacity-65 leading-relaxed">
						All raw page image uploads are preserved and intact.
					</p>
				</div>
			</div>

			<!-- WARNING NOTICE -->
			<div class="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
				<AlertTriangle size={15} class="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
				<p class="text-[11px] leading-relaxed opacity-90">
					This action resets OCR detections, glossary extractions, translations, and inpaint masks. Once started, this process cannot be undone.
				</p>
			</div>
		</div>

		<div class="mt-6 flex items-center justify-end gap-2.5">
			<Button variant="secondary" size="md" class="h-10 px-4 text-xs sm:text-sm font-medium" on:click={handleClose}>
				Cancel
			</Button>
			<Button
				variant="danger"
				size="md"
				class="h-10 px-4 text-xs sm:text-sm font-semibold shadow-sm"
				on:click={start}
			>
				<RotateCw size={14} />
				<span>Start Reset</span>
			</Button>
		</div>

	<!-- BODY: RUNNING LOCKED PROGRESS STATE -->
	{:else if state === 'running'}
		<div class="mt-4 space-y-4">
			<!-- STATUS HEADER -->
			<div class="flex items-center justify-between text-xs font-semibold">
				<span class="flex items-center gap-2 text-red-600 dark:text-red-400">
					<Loader2 size={15} class="animate-spin text-red-600 dark:text-red-400" />
					<span>Clearing Progress in Progress...</span>
				</span>
				<span class="text-[11px] font-normal opacity-50">Please keep this dialog open</span>
			</div>

			<!-- CURRENT STATUS MESSAGE BANNER -->
			<div class="rounded-xl border border-black/[0.08] bg-black/[0.02] p-3 text-center text-xs font-medium dark:border-white/[0.08] dark:bg-white/[0.02]">
				<span class="font-mono text-[11px] text-current opacity-80">{message}</span>
			</div>

			<!-- STEP STATUS CHECKLIST -->
			<div class="space-y-2 pt-1 text-xs">
				{#each STEPS as step, idx}
					{@const status = stepStatus[step.id]}
					<div
						class={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300 ${
							status === 'active'
								? 'border-red-500/40 bg-red-500/5 ring-2 ring-red-500/20 text-red-600 dark:text-red-400 font-semibold shadow-xs'
								: status === 'done'
									? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200 opacity-90'
									: 'border-black/[0.06] opacity-40 dark:border-white/[0.06]'
						}`}
					>
						<!-- STEP INDICATOR ICON -->
						{#if status === 'done'}
							<CheckCircle2 size={18} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
						{:else if status === 'active'}
							<Loader2 size={18} class="shrink-0 animate-spin text-red-600 dark:text-red-400" />
						{:else}
							<span class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold opacity-60">
								{idx + 1}
							</span>
						{/if}

						<div class="min-w-0 flex-1">
							<div class="text-xs font-bold leading-tight">{step.label}</div>
							<div class="text-[11px] opacity-70 leading-snug mt-0.5">{step.desc}</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3 text-[11px] opacity-60 dark:border-white/[0.06]">
				<span>Dialog is locked until completion</span>
				<span class="font-mono text-[10.5px]">Do not navigate away</span>
			</div>
		</div>

	<!-- BODY: DONE STATE -->
	{:else if state === 'done'}
		<div class="mt-4 space-y-4 text-xs">
			<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-950 dark:text-emerald-200 space-y-2">
				<div class="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-300">
					<CheckCircle2 size={18} />
					<span>Progress Cleared Successfully</span>
				</div>
				<p class="text-xs opacity-85 leading-relaxed">
					Reset translation and OCR progress across
					<strong>{result?.chaptersReset ?? chapterCount} chapter{(result?.chaptersReset ?? chapterCount) === 1 ? '' : 's'}</strong>
					{#if result?.pagesReset}
						({result.pagesReset} page{result.pagesReset === 1 ? '' : 's'})
					{/if}.
					All original page image files are preserved.
				</p>
			</div>

			<div class="mt-6 flex items-center justify-end">
				<Button
					variant="primary"
					size="md"
					class="h-10 px-5 text-xs sm:text-sm font-semibold shadow-sm"
					on:click={handleClose}
				>
					Done & Refresh
				</Button>
			</div>
		</div>

	<!-- BODY: ERROR STATE -->
	{:else if state === 'error'}
		<div class="mt-4 space-y-4 text-xs">
			<div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-950 dark:text-rose-200 space-y-2">
				<div class="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-300">
					<AlertCircle size={18} />
					<span>Clear Progress Failed</span>
				</div>
				<p class="text-xs opacity-85 leading-relaxed">{errorMessage}</p>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2.5">
				<Button variant="secondary" size="md" class="h-10 px-4 text-xs sm:text-sm font-medium" on:click={handleClose}>
					Close
				</Button>
				<Button variant="danger" size="md" class="h-10 px-4 text-xs sm:text-sm font-semibold shadow-sm" on:click={start}>
					<RotateCw size={14} /> Retry
				</Button>
			</div>
		</div>
	{/if}
</Modal>
