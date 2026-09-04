<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	// IMPORTED DEP-COMPONENTS
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Clock from 'lucide-svelte/icons/clock';
	import Zap from 'lucide-svelte/icons/zap';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Wifi from 'lucide-svelte/icons/wifi';
	import WifiOff from 'lucide-svelte/icons/wifi-off';
	import Layers from 'lucide-svelte/icons/layers';
	import Square from 'lucide-svelte/icons/square';
	import X from 'lucide-svelte/icons/x';
	import Activity from 'lucide-svelte/icons/activity';

	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { scrollLock } from '$lib/actions/scrollLock';
	import { cn } from '$lib/utils/cn';
	import { settings, THEME_PANEL, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import type { ChapterJobState } from '$lib/stores/job-tracker';
	import type { PageProgressState } from '$lib/types';
	import { PIPELINE_STEP_LABELS } from '$lib/types';

	// -- REQUIRED PROPS -- //
	export let jobState: ChapterJobState;

	// -- OPTIONAL PROPS -- //
	export let onRetryPage: ((pageId: number, pageIndex: number) => void) | undefined = undefined;
	export let onCancel: (() => void) | undefined = undefined;

	// -- STATES -- //
	let modalOpen = false;
	let dismissed = false;
	let now = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	// -- FUNCTIONS -- //

	function scrollToPage(pageId?: number, seq?: number) {
		modalOpen = false;
		let el: HTMLElement | null = null;
		if (pageId !== undefined) {
			el = document.querySelector(`[data-page-id="${pageId}"]`);
		}
		if (!el && seq !== undefined) {
			el = document.querySelector(`[data-page-seq="${seq}"]`);
		}
		if (el) {
			setTimeout(() => {
				el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 100);
		}
	}

	// -- REACTIVE STATEMENTS -- //

	$: snapshot = jobState?.snapshot;
	$: running = jobState?.running ?? false;
	$: connectionState = jobState?.connectionState ?? 'idle';

	$: if (running) {
		dismissed = false;
	}

	$: if (running) {
		if (!timer) {
			timer = setInterval(() => {
				now = Date.now();
			}, 500);
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

	// ELAPSED TIME (MS)
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

<!-- 1. FLOATING TELEMETRY PILL (BOTTOM LEFT) -->
{#if (snapshot || running) && !dismissed}
	<aside
		aria-label="Floating Chapter Telemetry"
		class="fixed bottom-4 sm:bottom-6 left-3 sm:left-6 z-40 flex items-center select-none"
		transition:fly={{ y: 20, duration: 220, easing: cubicOut }}
	>
		<div
			class={cn(
				'flex items-center gap-3 rounded-2xl border-2 p-2 sm:p-2.5 shadow-2xl backdrop-blur-xl transition-all',
				THEME_PANEL[$settings.theme],
				THEME_PANEL_BORDER[$settings.theme]
			)}
		>
			<!-- CLICK PILL TO OPEN TELEMETRY MODAL -->
			<button
				type="button"
				on:click={() => (modalOpen = true)}
				class="flex items-center gap-3 px-1.5 py-1 min-w-0 text-left cursor-pointer group"
				title="Open live pipeline telemetry"
				aria-label="Open live pipeline telemetry"
				use:ripple
			>
				<div
					class={cn(
						'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm transition-transform duration-200 group-hover:scale-105 shadow-xs',
						running
							? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
							: failedPages > 0
								? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
								: 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
					)}
				>
					{#if running}
						<Loader2 size={18} class="animate-spin" />
					{:else if failedPages > 0}
						<AlertTriangle size={17} />
					{:else}
						<CheckCircle2 size={18} />
					{/if}
				</div>

				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<span class="text-xs font-bold tracking-tight">
							{running ? 'Translating Chapter' : failedPages > 0 ? `${failedPages} Errors` : 'Chapter Done'}
						</span>
						<span class="text-xs font-mono font-bold opacity-75">
							{completedPages}/{totalPages} pgs ({progressPercent}%)
						</span>
					</div>
					<div class="text-[10px] sm:text-[11px] font-mono opacity-60 flex items-center gap-1.5 mt-0.5">
						<Clock size={11} />
						<span>{formatDuration(elapsedMs)}</span>
						{#if running && estimatedRemainingMs !== null}
							<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">
								• ~{formatDuration(estimatedRemainingMs)} left
							</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center text-black/50 group-hover:text-black dark:text-white/50 dark:group-hover:text-white transition pl-1">
					<Activity size={16} />
				</div>
			</button>

			<!-- CANCEL TRANSLATION BUTTON (IF RUNNING) -->
			{#if running && onCancel}
				<button
					type="button"
					on:click={() => onCancel?.()}
					class="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition text-xs cursor-pointer"
					title="Cancel Translation"
					aria-label="Cancel translation"
					use:ripple
				>
					<Square size={13} class="fill-current" />
				</button>
			{/if}

			<!-- DISMISS PILL BUTTON -->
			<button
				type="button"
				on:click={() => (dismissed = true)}
				class="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-black/5 opacity-60 hover:opacity-100 dark:border-white/10 dark:bg-white/5 transition text-xs cursor-pointer"
				title="Dismiss"
				aria-label="Dismiss"
				use:ripple
			>
				<X size={15} />
			</button>
		</div>
	</aside>
{/if}

<!-- 2. TELEMETRY DETAILS MODAL -->
{#if modalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs"
		transition:fade={{ duration: 150 }}
		use:scrollLock
	>
		<!-- BACKDROP CLICK DISMISS -->
		<button
			type="button"
			class="fixed inset-0 h-full w-full cursor-default"
			tabindex="-1"
			aria-label="Close modal"
			on:click={() => (modalOpen = false)}
		></button>

		<!-- MODAL CARD -->
		<div
			class={cn(
				'relative z-10 flex flex-col w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl',
				THEME_PANEL[$settings.theme],
				THEME_PANEL_BORDER[$settings.theme]
			)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="telemetry-modal-title"
			use:focusTrap
			transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
		>
			<!-- MODAL HEADER -->
			<div class="flex items-center justify-between border-b border-black/[0.06] p-3.5 sm:p-4 dark:border-white/[0.06] shrink-0">
				<div class="flex items-center gap-2.5 min-w-0">
					<div
						class={cn(
							'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm',
							running
								? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
								: failedPages > 0
									? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
									: 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
						)}
					>
						{#if running}
							<Loader2 size={16} class="animate-spin" />
						{:else if failedPages > 0}
							<AlertTriangle size={16} />
						{:else}
							<CheckCircle2 size={16} />
						{/if}
					</div>

					<div class="min-w-0">
						<h3 id="telemetry-modal-title" class="text-sm font-bold tracking-tight">
							Chapter Pipeline Telemetry
						</h3>
						<div class="flex items-center gap-2 text-[10px] font-mono opacity-60 mt-0.5">
							<span>{completedPages}/{totalPages} pages ({progressPercent}%)</span>
							<span>•</span>
							<span class="flex items-center gap-0.5">
								<Clock size={10} /> {formatDuration(elapsedMs)}
							</span>
							{#if (snapshot?.cacheHitCount || 0) > 0}
								<span>•</span>
								<span class="text-[#4f7a64] dark:text-[#83b39a] font-bold">
									{snapshot?.cacheHitCount} Cache Hits
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex items-center gap-1.5 shrink-0">
					{#if running && onCancel}
						<button
							type="button"
							on:click={() => {
								onCancel?.();
								modalOpen = false;
							}}
							class="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-500/20 dark:text-red-400 cursor-pointer"
							use:ripple
						>
							<Square size={11} class="fill-current" />
							<span>Cancel Job</span>
						</button>
					{/if}

					<button
						type="button"
						on:click={() => (modalOpen = false)}
						class="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 opacity-60 hover:opacity-100 dark:border-white/10 transition cursor-pointer"
						title="Close Modal"
						aria-label="Close modal"
						use:ripple
					>
						<X size={15} />
					</button>
				</div>
			</div>

			<!-- PROGRESS BAR -->
			<div class="h-1 w-full bg-black/5 dark:bg-white/5 overflow-hidden shrink-0">
				<div
					class={cn(
						'h-full transition-all duration-300',
						failedPages > 0 && !running
							? 'bg-amber-500'
							: running
								? 'bg-[#b23a2e] dark:bg-[#e08a63]'
								: 'bg-[#4f7a64]'
					)}
					style="width: {progressPercent}%"
				></div>
			</div>

			<!-- MODAL BODY -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
				<!-- FAILED PAGES ALERT (IF ANY) -->
				{#if failedPages > 0}
					<div class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
						<div class="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400 text-xs">
							<AlertTriangle size={14} />
							<span>{failedPages} page{failedPages === 1 ? '' : 's'} encountered errors:</span>
						</div>
						<div class="mt-2 space-y-1.5">
							{#each (snapshot?.pages || []).filter((p) => p.status === 'error') as errPage}
								<div class="flex items-center justify-between gap-2 rounded-lg bg-black/5 dark:bg-white/5 p-2 text-xs">
									<div>
										<span class="font-bold">Page {errPage.seq + 1}</span>
										{#if errPage.failedStep}
											<span class="ml-1 opacity-75">
												({PIPELINE_STEP_LABELS[errPage.failedStep] || errPage.failedStep})
											</span>
										{/if}
										<div class="text-[10px] opacity-70 font-mono mt-0.5">{errPage.errorMessage || 'Unknown failure'}</div>
									</div>
									{#if onRetryPage}
										<button
											type="button"
											on:click={() => onRetryPage(errPage.pageId, errPage.pageIndex)}
											class="flex items-center gap-1 rounded-lg bg-[#b23a2e] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:opacity-90 cursor-pointer"
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

				<!-- DETAILED TELEMETRY TABLE -->
				{#if snapshot?.pages && snapshot.pages.length > 0}
					<div class="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
						<table class="w-full text-left text-xs font-mono border-collapse">
							<thead class="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 text-[10px] uppercase tracking-wider opacity-60">
								<tr>
									<th class="py-2 px-3">Page</th>
									<th class="py-2 px-3">OCR</th>
									<th class="py-2 px-3">LLM</th>
									<th class="py-2 px-3">Inpaint</th>
									<th class="py-2 px-3">Typeset</th>
									<th class="py-2 px-3 text-right">Total</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.04] text-[11px]">
								{#each snapshot.pages as p}
									{@const ocrTiming = p.timings.analyze}
									{@const transTiming = p.timings.translate}
									{@const cleanTiming = p.timings.clean}
									{@const typeTiming = p.timings.typeset}
									{@const isOcrRunning = ocrTiming?.status === 'running' || (p.status === 'processing' && p.currentStep === 'analyze' && running)}
									{@const isTransRunning = transTiming?.status === 'running' || (p.status === 'processing' && p.currentStep === 'translate' && running)}
									{@const isCleanRunning = cleanTiming?.status === 'running' || (p.status === 'processing' && p.currentStep === 'clean' && running)}
									{@const isTypeRunning = typeTiming?.status === 'running' || (p.status === 'processing' && p.currentStep === 'typeset' && running)}
									{@const isRetrying = (p.retryAttempt ?? 0) > 0 || (p.isRetrying ?? false)}
									{@const retryAttempt = p.retryAttempt ?? 1}
									{@const totalDur = getPageTotalDuration(p)}
									<tr class="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
										<td class="py-2.5 px-3 font-bold whitespace-nowrap">
											<button
												type="button"
												on:click={() => scrollToPage(p.pageId, p.seq)}
												class={cn(
													'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-bold transition cursor-pointer select-none',
													isRetrying
														? 'border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10'
														: 'border-black/10 dark:border-white/10 text-[#b23a2e] dark:text-[#e08a63] hover:bg-[#b23a2e]/10 dark:hover:bg-[#e08a63]/10'
												)}
												title={`Scroll to Page ${p.seq + 1}${isRetrying ? ` (Retry ${retryAttempt}/3)` : ''}`}
												aria-label={`Scroll to Page ${p.seq + 1}`}
												use:ripple
											>
												Pg {p.seq + 1}
											</button>
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if isOcrRunning}
												{#if isRetrying}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<RefreshCw size={9} class="animate-spin shrink-0 text-amber-600 dark:text-amber-400" />
														<span>OCR (R{retryAttempt})...</span>
													</span>
												{:else}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<Loader2 size={9} class="animate-spin shrink-0" />
														<span>OCR...</span>
													</span>
												{/if}
											{:else if ocrTiming?.status === 'completed'}
												<span class="inline-flex items-center gap-1 font-mono text-neutral-800 dark:text-neutral-200">
													<CheckCircle2 size={11} class="text-[#4f7a64] dark:text-[#83b39a] shrink-0" />
													<span>{formatDuration(ocrTiming.durationMs)}</span>
												</span>
											{:else if ocrTiming?.status === 'failed'}
												<span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
													<AlertTriangle size={11} class="shrink-0" />
													<span>Failed</span>
												</span>
											{:else}
												<span class="opacity-25 font-mono text-[11px] select-none">-</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if isTransRunning}
												{#if isRetrying}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<RefreshCw size={9} class="animate-spin shrink-0 text-amber-600 dark:text-amber-400" />
														<span>LLM (R{retryAttempt})...</span>
													</span>
												{:else}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<Loader2 size={9} class="animate-spin shrink-0" />
														<span>LLM...</span>
													</span>
												{/if}
											{:else if transTiming?.status === 'completed'}
												<span class="inline-flex items-center gap-1 font-mono text-neutral-800 dark:text-neutral-200">
													<CheckCircle2 size={11} class="text-[#4f7a64] dark:text-[#83b39a] shrink-0" />
													<span>{formatDuration(transTiming.durationMs)}</span>
												</span>
											{:else if transTiming?.status === 'failed'}
												<span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
													<AlertTriangle size={11} class="shrink-0" />
													<span>Failed</span>
												</span>
											{:else}
												<span class="opacity-25 font-mono text-[11px] select-none">-</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if isCleanRunning}
												{#if isRetrying}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<RefreshCw size={9} class="animate-spin shrink-0 text-amber-600 dark:text-amber-400" />
														<span>Inpaint (R{retryAttempt})...</span>
													</span>
												{:else}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<Loader2 size={9} class="animate-spin shrink-0" />
														<span>Inpaint...</span>
													</span>
												{/if}
											{:else if cleanTiming?.status === 'completed'}
												<span class="inline-flex items-center gap-1 font-mono text-neutral-800 dark:text-neutral-200">
													<CheckCircle2 size={11} class="text-[#4f7a64] dark:text-[#83b39a] shrink-0" />
													<span>{formatDuration(cleanTiming.durationMs)}</span>
												</span>
											{:else if cleanTiming?.status === 'failed'}
												<span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
													<AlertTriangle size={11} class="shrink-0" />
													<span>Failed</span>
												</span>
											{:else}
												<span class="opacity-25 font-mono text-[11px] select-none">-</span>
											{/if}
										</td>
										<td class="py-2.5 px-3 whitespace-nowrap">
											{#if isTypeRunning}
												{#if isRetrying}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<RefreshCw size={9} class="animate-spin shrink-0 text-amber-600 dark:text-amber-400" />
														<span>Typeset (R{retryAttempt})...</span>
													</span>
												{:else}
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-mono text-[10px] font-semibold tracking-tight shadow-2xs">
														<Loader2 size={9} class="animate-spin shrink-0" />
														<span>Typeset...</span>
													</span>
												{/if}
											{:else if typeTiming?.status === 'completed'}
												<span class="inline-flex items-center gap-1 font-mono text-neutral-800 dark:text-neutral-200">
													<CheckCircle2 size={11} class="text-[#4f7a64] dark:text-[#83b39a] shrink-0" />
													<span>{formatDuration(typeTiming.durationMs)}</span>
												</span>
											{:else if typeTiming?.status === 'failed'}
												<span class="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
													<AlertTriangle size={11} class="shrink-0" />
													<span>Failed</span>
												</span>
											{:else}
												<span class="opacity-25 font-mono text-[11px] select-none">-</span>
											{/if}
										</td>
										<td class="py-2 px-3 text-right font-bold whitespace-nowrap">
											{formatDuration(totalDur)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="py-12 text-center text-xs opacity-50">
						No telemetry data recorded for this chapter yet.
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

