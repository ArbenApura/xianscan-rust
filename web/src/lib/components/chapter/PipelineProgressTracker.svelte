<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ripple } from '$lib/actions/ripple';
	import type { ChapterJobState } from '$lib/stores/job-tracker';
	import type { ChapterJobSnapshot, PageProgressState, PipelinePhase, PipelineStep } from '$lib/types';
	import { PIPELINE_STEP_LABELS } from '$lib/types';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Clock from 'lucide-svelte/icons/clock';
	import Zap from 'lucide-svelte/icons/zap';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import Wifi from 'lucide-svelte/icons/wifi';
	import WifiOff from 'lucide-svelte/icons/wifi-off';
	import Layers from 'lucide-svelte/icons/layers';
	import Square from 'lucide-svelte/icons/square';
	import X from 'lucide-svelte/icons/x';

	export let jobState: ChapterJobState;
	export let onRetryPage: ((pageId: number, pageIndex: number) => void) | undefined = undefined;
	export let onCancel: (() => void) | undefined = undefined;

	let expanded = true;
	let dismissed = false;
	let now = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	function scrollToPage(pageId?: number, seq?: number) {
		let el: HTMLElement | null = null;
		if (pageId !== undefined) {
			el = document.querySelector(`[data-page-id="${pageId}"]`);
		}
		if (!el && seq !== undefined) {
			el = document.querySelector(`[data-page-seq="${seq}"]`);
		}
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	$: snapshot = jobState.snapshot;
	$: running = jobState.running;
	$: connectionState = jobState.connectionState;

	$: if (running) {
		dismissed = false;
	}

	$: if (running) {
		if (!timer) {
			timer = setInterval(() => {
				now = Date.now();
			}, 200);
		}
	} else if (timer) {
		clearInterval(timer);
		timer = null;
	}

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	$: totalPages = snapshot?.totalPages || snapshot?.pages.length || 0;
	$: completedPages = snapshot?.completedPages || 0;
	$: failedPages = snapshot?.failedPages || 0;
	$: progressPercent = totalPages > 0 ? Math.min(100, Math.round((completedPages / totalPages) * 100)) : 0;

	// ELAPSED TIME (MS) — FROZEN WHEN JOB FINISHES OR IS CANCELLED
	$: elapsedMs = (() => {
		if (!snapshot?.startedAt) return 0;
		if (typeof snapshot.totalDurationMs === 'number' && snapshot.totalDurationMs > 0) {
			return snapshot.totalDurationMs;
		}
		if (snapshot.completedAt) {
			return Math.max(0, snapshot.completedAt - snapshot.startedAt);
		}
		if (running) {
			return Math.max(0, now - snapshot.startedAt);
		}
		return 0;
	})();

	// ESTIMATED TIME REMAINING
	$: estimatedRemainingMs = (() => {
		if (!running || completedPages === 0 || totalPages <= completedPages) return null;
		const avgMsPerPage = elapsedMs / completedPages;
		const remainingPages = totalPages - completedPages;
		return Math.round(avgMsPerPage * remainingPages);
	})();

	function formatDuration(ms: number | undefined): string {
		if (ms === undefined || ms === null || !Number.isFinite(ms)) return '-';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		const totalSec = ms / 1000;
		if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
		const totalSecInt = Math.round(totalSec);
		const hours = Math.floor(totalSecInt / 3600);
		const min = Math.floor((totalSecInt % 3600) / 60);
		const remSec = totalSecInt % 60;
		if (hours > 0) {
			return `${hours}h ${min}m ${remSec}s`;
		}
		return `${min}m ${remSec}s`;
	}

	function getPageTotalDuration(p: PageProgressState): number | undefined {
		if (typeof p.totalDurationMs === 'number' && Number.isFinite(p.totalDurationMs) && p.totalDurationMs > 0) {
			return p.totalDurationMs;
		}
		if (p.timings) {
			const values = Object.values(p.timings);
			const completedDurations = values
				.filter((t) => t && t.status === 'completed' && typeof t.durationMs === 'number' && Number.isFinite(t.durationMs))
				.map((t) => t!.durationMs!);
			if (completedDurations.length > 0) {
				return completedDurations.reduce((a, b) => a + b, 0);
			}
		}
		return undefined;
	}
</script>

{#if (snapshot || running) && !dismissed}
	<div class="overflow-hidden rounded-2xl border border-black/10 bg-white/70 shadow-sm backdrop-blur-md transition-all dark:border-white/10 dark:bg-[#181511]/80">
		<!-- HEADER BAR -->
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
			<div class="flex items-center gap-3">
				<div
					class={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
						running
							? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
							: failedPages > 0
								? 'bg-amber-500/10 text-amber-600'
								: 'bg-emerald-500/10 text-emerald-600'
					}`}
				>
					{#if running}
						<Loader2 size={18} class="animate-spin" />
					{:else if failedPages > 0}
						<AlertTriangle size={18} />
					{:else}
						<CheckCircle2 size={18} />
					{/if}
				</div>

				<div>
					<div class="flex items-center gap-2">
						<span class="text-sm font-bold tracking-tight">
							{#if running}
								Live Translation Pipeline
							{:else if failedPages > 0}
								Translation Completed with {failedPages} Error{failedPages === 1 ? '' : 's'}
							{:else}
								Translation Completed Successfully
							{/if}
						</span>

						<!-- CONNECTION HEALTH PILL -->
						<span
							class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
								connectionState === 'connected'
									? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
									: connectionState === 'reconnecting'
										? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
										: connectionState === 'connecting'
											? 'bg-blue-500/10 text-blue-600'
											: 'bg-black/5 text-neutral-500 dark:bg-white/5'
							}`}
						>
							{#if connectionState === 'connected'}
								<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
								Live SSE
							{:else if connectionState === 'reconnecting'}
								<WifiOff size={10} />
								Reconnecting...
							{:else if connectionState === 'connecting'}
								<Wifi size={10} />
								Connecting
							{:else}
								Synced
							{/if}
						</span>
					</div>

					<div class="mt-0.5 flex items-center gap-3 text-xs opacity-60">
						<span>{completedPages} of {totalPages} pages processed</span>
						<span>•</span>
						<span class="flex items-center gap-1">
							<Clock size={11} /> {formatDuration(elapsedMs)} elapsed
						</span>
						{#if estimatedRemainingMs !== null}
							<span>•</span>
							<span class="text-[#b23a2e] dark:text-[#e08a63] font-medium">
								~{formatDuration(estimatedRemainingMs)} remaining
							</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- TOP RIGHT STATS + COLLAPSE TOGGLE + CLOSE BUTTON -->
			<div class="flex items-center gap-2 sm:gap-3">
				<!-- METRICS PILLS -->
				<div class="hidden sm:flex items-center gap-2">

					{#if (snapshot?.cacheHitCount || 0) > 0}
						<div class="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
							<Zap size={12} />
							<span>{snapshot?.cacheHitCount} Cached</span>
						</div>
					{/if}
				</div>

				{#if running && onCancel}
					<button
						type="button"
						on:click={() => onCancel?.()}
						class="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
						use:ripple
						title="Cancel and stop active translation job"
					>
						<Square size={11} class="fill-current" />
						<span>Cancel</span>
					</button>
				{/if}

				<button
					type="button"
					on:click={() => (expanded = !expanded)}
					class="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium opacity-70 transition hover:opacity-100 dark:border-white/10"
					use:ripple
				>
					<span>{expanded ? 'Hide Details' : 'Show Details'}</span>
					{#if expanded}
						<ChevronUp size={13} />
					{:else}
						<ChevronDown size={13} />
					{/if}
				</button>

				<button
					type="button"
					on:click={() => (dismissed = true)}
					class="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-neutral-500 transition hover:bg-black/5 hover:text-black dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white"
					use:ripple
					title="Close and hide stats table"
					aria-label="Close stats table"
				>
					<X size={14} />
				</button>
			</div>
		</div>

		<!-- PROGRESS BAR -->
		<div class="relative h-1.5 w-full bg-black/5 dark:bg-white/5">
			<div
				class={`h-full transition-all duration-300 ${
					failedPages > 0 && !running
						? 'bg-amber-500'
						: running
							? 'bg-[#b23a2e]'
							: 'bg-emerald-500'
				}`}
				style={`width: ${progressPercent}%`}
			></div>
		</div>

		<!-- EXPANDABLE PER-PAGE STATUS MATRIX & DIAGNOSTICS -->
		{#if expanded}
			<div class="p-4 space-y-3">
				<!-- CRITICAL ERROR BANNER IF ANY PAGE FAILED -->
				{#if failedPages > 0}
					<div class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
						<div class="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
							<AlertTriangle size={14} />
							<span>{failedPages} page{failedPages === 1 ? '' : 's'} encountered an error during translation:</span>
						</div>
						<div class="mt-2 space-y-1.5">
							{#each (snapshot?.pages || []).filter((p) => p.status === 'error') as errPage}
								<div class="flex items-center justify-between gap-2 rounded-lg bg-white/60 p-2 dark:bg-black/40">
									<div>
										<span class="font-bold">Page {errPage.seq + 1}</span>
										{#if errPage.failedStep}
											<span class="ml-1.5 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
												Failed at: {PIPELINE_STEP_LABELS[errPage.failedStep] || errPage.failedStep}
											</span>
										{/if}
										<div class="mt-0.5 text-[11px] opacity-70">{errPage.errorMessage || 'Unknown failure'}</div>
									</div>
									{#if onRetryPage}
										<button
											type="button"
											on:click={() => onRetryPage(errPage.pageId, errPage.pageIndex)}
											class="flex items-center gap-1 rounded-md bg-[#b23a2e] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90"
											use:ripple
										>
											<RefreshCw size={11} /> Retry
										</button>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- LIVE PAGE TELEMETRY TABLE -->
				<div class="max-h-72 overflow-y-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
					<table class="w-full text-left text-xs border-collapse">
						<thead class="sticky top-0 z-10 border-b border-black/[0.06] bg-neutral-100/90 backdrop-blur dark:border-white/[0.06] dark:bg-[#201c18]/90 text-[11px] uppercase tracking-wider opacity-60">
							<tr>
								<th class="py-2 px-3 font-semibold">Page</th>
								<th class="py-2 px-3 font-semibold">Status / Active Step</th>
								<th class="py-2 px-3 font-semibold hidden md:table-cell">OCR Analyze</th>
								<th class="py-2 px-3 font-semibold hidden md:table-cell">LLM Translate</th>
								<th class="py-2 px-3 font-semibold hidden md:table-cell">Inpaint (LaMa)</th>
								<th class="py-2 px-3 font-semibold hidden md:table-cell">Typeset</th>
								<th class="py-2 px-3 font-semibold text-right">Total</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
							{#each snapshot?.pages || [] as p}
								{@const ocrTiming = p.timings.analyze}
								{@const transTiming = p.timings.translate}
								{@const cleanTiming = p.timings.clean}
								{@const typeTiming = p.timings.typeset}
								{@const totalDur = getPageTotalDuration(p)}
								<tr class="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
									<!-- PAGE NUMBER -->
									<td class="py-2 px-3 font-bold whitespace-nowrap">
										<button
											type="button"
											on:click={() => scrollToPage(p.pageId, p.seq)}
											class="inline-flex items-center gap-1 font-bold text-neutral-900 hover:text-[#b23a2e] dark:text-neutral-100 dark:hover:text-[#e08a63] hover:underline cursor-pointer transition-colors text-left"
											title={`Scroll to Page ${p.seq + 1}`}
										>
											<span>Page {p.seq + 1}</span>
										</button>
									</td>

									<!-- STATUS BADGE -->
									<td class="py-2 px-3">
										{#if p.status === 'done'}
											<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
												<CheckCircle2 size={12} /> Done
											</span>
										{:else if p.status === 'error'}
											<span class="inline-flex items-center gap-1 text-rose-600 font-semibold">
												<AlertTriangle size={12} /> Error ({p.failedStep ? PIPELINE_STEP_LABELS[p.failedStep] || p.failedStep : 'failed'})
											</span>
										{:else if p.status === 'processing' && jobState.running}
											<span class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] font-bold">
												<Loader2 size={12} class="animate-spin" />
												{p.currentStep ? PIPELINE_STEP_LABELS[p.currentStep] || p.currentStep : 'Processing...'}
											</span>
										{:else if p.status === 'processing' && !jobState.running}
											<span class="opacity-50 font-medium">Cancelled</span>
										{:else}
											<span class="opacity-40">Pending</span>
										{/if}
									</td>

									<!-- OCR TIMING -->
									<td class="py-2 px-3 hidden md:table-cell">
										{#if ocrTiming?.status === 'completed'}
											<span class="font-mono opacity-80">{formatDuration(ocrTiming.durationMs)}</span>
											{#if ocrTiming.details?.regionsCount !== undefined}
												<span class="ml-1 text-[10px] opacity-50">({ocrTiming.details.regionsCount} regions)</span>
											{/if}
										{:else if ocrTiming?.status === 'running' && jobState.running}
											<span class="text-[#b23a2e] font-semibold">Running...</span>
										{:else}
											<span class="opacity-25">-</span>
										{/if}
									</td>

									<!-- TRANSLATE TIMING -->
									<td class="py-2 px-3 hidden md:table-cell">
										{#if transTiming?.status === 'completed'}
											{#if transTiming.details?.skipped}
												<span class="text-[10px] opacity-40 italic">Skipped (0 text)</span>
											{:else}
												<span class="font-mono opacity-80">{formatDuration(transTiming.durationMs)}</span>
												{#if transTiming.details?.cacheHit}
													<span class="ml-1 rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-bold text-emerald-600">HIT</span>
												{/if}
											{/if}
										{:else if transTiming?.status === 'running' && jobState.running}
											<span class="text-[#b23a2e] font-semibold">Translating...</span>
										{:else if p.status === 'done' && ocrTiming?.status === 'completed' && (!ocrTiming.details?.regionsCount || ocrTiming.details.regionsCount === 0)}
											<span class="text-[10px] opacity-40 italic">Skipped (0 text)</span>
										{:else}
											<span class="opacity-25">-</span>
										{/if}
									</td>

									<!-- CLEAN / INPAINT TIMING -->
									<td class="py-2 px-3 hidden md:table-cell">
										{#if cleanTiming?.status === 'completed'}
											<span class="font-mono opacity-80">{formatDuration(cleanTiming.durationMs)}</span>
										{:else if cleanTiming?.status === 'running' && jobState.running}
											<span class="text-[#b23a2e] font-semibold">Inpainting...</span>
										{:else}
											<span class="opacity-25">-</span>
										{/if}
									</td>

									<!-- TYPESET TIMING -->
									<td class="py-2 px-3 hidden md:table-cell">
										{#if typeTiming?.status === 'completed'}
											<span class="font-mono opacity-80">{formatDuration(typeTiming.durationMs)}</span>
										{:else if typeTiming?.status === 'running' && jobState.running}
											<span class="text-[#b23a2e] font-semibold">Typesetting...</span>
										{:else}
											<span class="opacity-25">-</span>
										{/if}
									</td>

									<!-- TOTAL DURATION -->
									<td class="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
										{#if totalDur !== undefined}
											{formatDuration(totalDur)}
										{:else if p.status === 'processing' && jobState.running}
											<span class="text-xs text-[#b23a2e] dark:text-[#e08a63] font-sans">...</span>
										{:else}
											<span class="opacity-25">-</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>
{/if}
