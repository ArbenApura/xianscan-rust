<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { streamSse, type SseEvent } from '$lib/sse';
	import { toast } from 'svelte-sonner';
	import Scissors from 'lucide-svelte/icons/scissors';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import Layers from 'lucide-svelte/icons/layers';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import X from 'lucide-svelte/icons/x';
	import { Button, Modal, Badge } from '$lib/components/ui';

	export let open = false;
	export let chapterId: number;
	export let pageCount: number;

	const dispatch = createEventDispatcher<{
		complete: { originalCount: number; newCount: number };
		success: { originalCount: number; newCount: number };
		close: void;
	}>();

	type State = 'idle' | 'running' | 'done' | 'error';
	type StepId = 'read' | 'reslice' | 'save';

	let state: State = 'idle';
	let message = 'Preparing chapter images...';
	let originalCount = pageCount;
	let newCount = pageCount;
	let errorMessage = '';

	let stepStatus: Record<StepId, 'pending' | 'active' | 'done'> = {
		read: 'pending',
		reslice: 'pending',
		save: 'pending',
	};

	// LIVE 0..=100 PERCENT FROM THE SIDECAR'S SSE FEED (MIRRORS TRANSLATION PROGRESS).
	let progressPct = 0;

	// PAGE-HEIGHT PRESET — TUNED FOR ~1500PX STRIPS WHERE SHORTER PAGES RAISE THE OCR
	// DETECTOR'S TEXT SCALE AND IMPROVE QUALITY (PREVIOUS DEFAULTS WERE 1600/1000/2400).
	let targetHeight = 1150;
	let minHeight = 850;
	let maxHeight = 1400;

	let abortController: AbortController | null = null;

	const STEPS: Array<{ id: StepId; label: string; desc: string }> = [
		{ id: 'read', label: '1. Stitch & Assemble', desc: 'Merge raw image slices into a continuous canvas' },
		{ id: 'reslice', label: '2. Protect Text & Find Margins', desc: 'Cluster dialogue bubbles to prevent split text and locate clean gutters' },
		{ id: 'save', label: '3. Generate Clean Pages', desc: 'Write re-sliced images and synchronize chapter database' },
	];

	function resetStepStatuses() {
		stepStatus = {
			read: 'pending',
			reslice: 'pending',
			save: 'pending',
		};
	}

	function updateStepFromBackend(step: StepId, msg: string) {
		if (step === 'read') {
			stepStatus = { read: 'active', reslice: 'pending', save: 'pending' };
		} else if (step === 'reslice') {
			stepStatus = { read: 'done', reslice: 'active', save: 'pending' };
		} else if (step === 'save') {
			stepStatus = { read: 'done', reslice: 'done', save: 'active' };
		}
		if (msg) message = msg;
	}

	export function start() {
		state = 'running';
		resetStepStatuses();
		stepStatus.read = 'active';
		progressPct = 0;
		message = `Stitching ${pageCount} image slices...`;
		errorMessage = '';
		const ctrl = new AbortController();
		abortController = ctrl;

		streamSse(
			`/api/chapters/${chapterId}/reslice`,
			{ targetHeight, minHeight, maxHeight },
			(e: SseEvent) => {
				if (e.type === 'start') {
					updateStepFromBackend('read', `Stitching ${pageCount} image slices...`);
				} else if (e.type === 'progress') {
					const backendStep = (e.step as StepId) || 'read';
					const backendMsg = (e.message as string) || message;
					if (typeof e.pct === 'number') progressPct = Math.max(0, Math.min(100, e.pct));
					updateStepFromBackend(backendStep, backendMsg);
				} else if (e.type === 'done') {
					originalCount = (e.originalCount as number) || pageCount;
					newCount = (e.newCount as number) || originalCount;
					const finalMsg = (e.message as string) || 'Chapter successfully re-sliced!';

					// MARK ALL STEPS AS COMPLETED
					stepStatus = { read: 'done', reslice: 'done', save: 'done' };
					progressPct = 100;
					message = finalMsg;

					setTimeout(() => {
						state = 'done';
						toast.success(`Re-slice complete: ${originalCount} slices → ${newCount} clean pages.`);
					}, 600);
				} else if (e.type === 'error') {
					state = 'error';
					errorMessage = (e.message as string) || 'Re-slicing failed.';
					toast.error(errorMessage);
				}
			},
			ctrl.signal,
		).catch((err) => {
			// CHECK *THIS* RUN'S CONTROLLER — IF THE USER ALREADY STARTED A NEW
			// RUN, `abortController` POINTS AT THE NEW ONE AND THIS STALE
			// REJECTION MUST NOT CLOBBER THE NEW RUN'S STATE.
			if (ctrl.signal.aborted) {
				if (abortController === ctrl) {
					state = 'idle';
					resetStepStatuses();
					toast.info('Re-slicing cancelled.');
					handleClose();
				}
			} else if (abortController === ctrl) {
				state = 'error';
				errorMessage = err instanceof Error ? err.message : String(err);
				toast.error(errorMessage);
			}
		});
	}

	function cancel() {
		if (abortController) {
			abortController.abort();
		}
		state = 'idle';
		resetStepStatuses();
		handleClose();
	}

	function handleClose() {
		if (state === 'running') return;
		const wasDone = state === 'done';
		open = false;
		state = 'idle';
		resetStepStatuses();
		if (wasDone) {
			dispatch('complete', { originalCount, newCount });
			dispatch('success', { originalCount, newCount });
		} else {
			dispatch('close');
		}
	}
</script>

<Modal
	bind:open
	title="Smart Webtoon Re-slicing"
	size="md"
	closable={state !== 'running'}
	on:close={handleClose}
>
	<!-- HEADER BRANDING HERO -->
	<div class="flex items-start gap-3.5 rounded-xl border border-[#b23a2e]/20 bg-[#b23a2e]/5 p-3.5 dark:border-[#e08a63]/20 dark:bg-[#e08a63]/5">
		<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63]">
			{#if state === 'done'}
				<CheckCircle2 size={22} class="text-emerald-600 dark:text-emerald-400" />
			{:else if state === 'error'}
				<AlertCircle size={22} class="text-rose-600 dark:text-rose-400" />
			{:else}
				<Scissors size={20} />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-bold tracking-tight">Continuous Canvas Re-slicer</h3>
				<span class="rounded-md bg-[#b23a2e]/15 px-2 py-0.5 text-[10px] font-bold text-[#b23a2e] dark:bg-[#e08a63]/20 dark:text-[#e08a63]">
					AI Protected
				</span>
			</div>
			<p class="mt-0.5 text-xs opacity-70 leading-relaxed">
				Stitch raw webtoon image slices into a seamless vertical strip and cut only along true panel gutters.
			</p>
		</div>
	</div>

	<!-- BODY: IDLE STATE -->
	{#if state === 'idle'}
		<div class="mt-4 space-y-3.5 text-xs">
			<!-- WHY USE RE-SLICER CARD -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
				<div class="flex flex-col gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center gap-1.5 font-bold text-xs">
						<ShieldCheck size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Bubble Guard</span>
					</div>
					<p class="text-[11px] opacity-65 leading-relaxed">
						Prevents speech bubbles and dialogue from being sliced across separate pages.
					</p>
				</div>

				<div class="flex flex-col gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center gap-1.5 font-bold text-xs">
						<Scissors size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Gutter Snapping</span>
					</div>
					<p class="text-[11px] opacity-65 leading-relaxed">
						Finds empty panel gaps and white spaces to ensure clean scene cuts.
					</p>
				</div>

				<div class="flex flex-col gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center gap-1.5 font-bold text-xs">
						<Layers size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Height Balance</span>
					</div>
					<p class="text-[11px] opacity-65 leading-relaxed">
						Normalizes page heights for optimal reading, inspection, and typesetting.
					</p>
				</div>
			</div>

			<!-- SOURCE STATUS OVERVIEW -->
			<div class="flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
				<span class="font-medium opacity-70">Current raw chapter slices:</span>
				<span class="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5">
					{pageCount} slice{pageCount === 1 ? '' : 's'}
				</span>
			</div>

			<!-- PAGE-HEIGHT PRESET — SHORTER PAGES RAISE OCR TEXT SCALE AND QUALITY -->
			<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
				<div class="flex items-center justify-between">
					<span class="font-bold text-xs">Page Height (px)</span>
					<span class="text-[10px] opacity-50">Target / Min / Max</span>
				</div>
				<div class="mt-2.5 grid grid-cols-3 gap-2.5">
					<label class="flex flex-col gap-1">
						<span class="text-[10px] font-medium uppercase tracking-wide opacity-55">Ideal</span>
						<input
							type="number"
							step="50"
							min="600"
							max="4000"
							bind:value={targetHeight}
							class="h-9 w-full rounded-lg border border-black/10 bg-transparent px-2.5 text-xs font-mono font-bold focus:border-[#b23a2e]/50 focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/25 dark:border-white/10"
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-[10px] font-medium uppercase tracking-wide opacity-55">Minimum</span>
						<input
							type="number"
							step="50"
							min="500"
							max="3000"
							bind:value={minHeight}
							class="h-9 w-full rounded-lg border border-black/10 bg-transparent px-2.5 text-xs font-mono font-bold focus:border-[#b23a2e]/50 focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/25 dark:border-white/10"
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-[10px] font-medium uppercase tracking-wide opacity-55">Maximum</span>
						<input
							type="number"
							step="50"
							min="600"
							max="4000"
							bind:value={maxHeight}
							class="h-9 w-full rounded-lg border border-black/10 bg-transparent px-2.5 text-xs font-mono font-bold focus:border-[#b23a2e]/50 focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/25 dark:border-white/10"
						/>
					</label>
				</div>
				<p class="mt-2 text-[10px] leading-relaxed opacity-50">
					Lower = shorter pages, larger OCR text scale, better detection. For ~1500px-wide strips the tuned
					default is 1150 / 850 / 1400.
				</p>
			</div>

			<!-- WARNING NOTICE -->
			<div class="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
				<AlertTriangle size={15} class="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
				<p class="text-[11px] leading-relaxed opacity-90">
					This replaces the current raw page files with cleanly divided pages. Existing translation/OCR progress on this chapter will be reset.
				</p>
			</div>
		</div>

		<div class="mt-6 flex items-center justify-end gap-2.5">
			<Button variant="secondary" size="md" class="h-10 px-4 text-xs sm:text-sm font-medium" on:click={handleClose}>Cancel</Button>
			<Button variant="primary" size="md" class="h-10 px-4 text-xs sm:text-sm font-semibold shadow-sm" on:click={start}>
				<Scissors size={15} /> Start Re-slicing
			</Button>
		</div>

	<!-- BODY: RUNNING LIVE PROGRESS STATE -->
	{:else if state === 'running'}
		<div class="mt-4 space-y-4">
			<!-- STATUS HEADER -->
			<div class="flex items-center justify-between text-xs font-semibold">
				<span class="flex items-center gap-2 text-[#b23a2e] dark:text-[#e08a63]">
					<Scissors size={15} />
					<span>Processing Re-slice...</span>
				</span>
				<span class="text-[11px] font-normal opacity-50">Please keep this dialog open</span>
			</div>

			<!-- CURRENT STATUS MESSAGE BANNER FROM BACKEND -->
			<div class="rounded-xl border border-black/[0.08] bg-black/[0.02] p-3 text-center text-xs font-medium dark:border-white/[0.08] dark:bg-white/[0.02]">
				<span class="font-mono text-[11px] text-current opacity-80">{message}</span>
			</div>

			<!-- LIVE PERCENT PROGRESS BAR (MIRRORS PAGE-TRANSLATION PROGRESS) -->
			<div class="flex items-center gap-3">
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
					<div
						class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] transition-all duration-300"
						style={`width: ${progressPct}%`}
					></div>
				</div>
				<span class="shrink-0 font-mono text-[11px] font-bold tabular-nums opacity-70">
					{Math.round(progressPct)}%
				</span>
			</div>

			<!-- STEP STATUS CHECKLIST WITH LIVE ROTATING SPINNERS -->
			<div class="space-y-2 pt-1 text-xs">
				{#each STEPS as step, idx}
					{@const status = stepStatus[step.id]}
					<div
						class={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300 ${
							status === 'active'
								? 'border-[#b23a2e]/40 bg-[#b23a2e]/5 ring-2 ring-[#b23a2e]/20 text-[#b23a2e] dark:text-[#e08a63] font-semibold shadow-xs'
								: status === 'done'
									? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200 opacity-90'
									: 'border-black/[0.06] opacity-40 dark:border-white/[0.06]'
						}`}
					>
						<!-- STEP INDICATOR ICON -->
						{#if status === 'done'}
							<CheckCircle2 size={18} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
						{:else if status === 'active'}
							<Loader2 size={18} class="shrink-0 animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
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
				<Button variant="secondary" size="md" class="h-9 px-3.5 text-xs font-medium" on:click={cancel}>
					<X size={14} /> Cancel Process
				</Button>
			</div>
		</div>

	<!-- BODY: DONE STATE -->
	{:else if state === 'done'}
		<div class="mt-4 space-y-4 text-xs">
			<div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
				<div class="flex items-center gap-2">
					<CheckCircle2 size={18} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
					<h4 class="font-bold text-sm">Re-slicing Complete!</h4>
				</div>
				<p class="mt-1 text-[11px] opacity-80 pl-6">{message}</p>
			</div>

			<!-- BEFORE / AFTER METRIC COMPARISON -->
			<div class="flex items-center justify-center gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
				<div class="flex-1">
					<span class="block text-[11px] opacity-60 font-semibold mb-1">Raw Input Slices</span>
					<span class="text-xl font-bold font-mono">{originalCount}</span>
				</div>

				<div class="flex items-center justify-center h-8 w-8 rounded-full bg-black/5 dark:bg-white/5 opacity-50 shrink-0">
					<ArrowRight size={14} />
				</div>

				<div class="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-emerald-700 dark:text-emerald-300">
					<span class="block text-[11px] font-semibold opacity-80 mb-1">Clean Pages</span>
					<span class="text-xl font-bold font-mono">{newCount}</span>
				</div>
			</div>

			<div class="mt-6 flex justify-end">
				<Button variant="primary" size="md" class="h-10 px-5 text-xs sm:text-sm font-semibold shadow-sm" on:click={handleClose}>
					Done & Reload Chapter
				</Button>
			</div>
		</div>

	<!-- BODY: ERROR STATE -->
	{:else if state === 'error'}
		<div class="mt-4 space-y-4 text-xs">
			<div class="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200">
				<div class="flex items-center gap-2">
					<AlertCircle size={18} class="text-rose-600 dark:text-rose-400 shrink-0" />
					<h4 class="font-bold text-sm">Re-slicing Failed</h4>
				</div>
				<p class="mt-1 text-[11px] opacity-80 pl-6">{errorMessage}</p>
			</div>

			<div class="mt-6 flex justify-end gap-2.5">
				<Button variant="secondary" size="md" class="h-10 px-4 text-xs sm:text-sm font-medium" on:click={handleClose}>Close</Button>
				<Button variant="primary" size="md" class="h-10 px-4 text-xs sm:text-sm font-semibold shadow-sm" on:click={start}>Try Again</Button>
			</div>
		</div>
	{/if}
</Modal>
