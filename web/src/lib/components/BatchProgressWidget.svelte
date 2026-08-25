<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { batchTracker, batchProgress } from '$lib/stores/batch-tracker';
	import { jobTracker } from '$lib/stores/job-tracker';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import { ripple } from '$lib/actions/ripple';
	import { PIPELINE_STEP_LABELS, type PipelinePhase } from '$lib/types';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Pause from 'lucide-svelte/icons/pause';
	import Play from 'lucide-svelte/icons/play';
	import SkipForward from 'lucide-svelte/icons/skip-forward';
	import X from 'lucide-svelte/icons/x';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Layers from 'lucide-svelte/icons/layers';
	import Clock from 'lucide-svelte/icons/clock';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Scissors from 'lucide-svelte/icons/scissors';

	let expanded = false;
	let now = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		batchTracker.sync();
	});

	$: active = $batchTracker.active;
	$: status = $batchTracker.status;
	$: isRunning = status === 'running';
	$: isPaused = status === 'paused';
	$: isCompleted = status === 'completed';
	$: isCancelled = status === 'cancelled';

	$: progress = $batchProgress;
	$: currentChapter = progress.currentChapter;
	$: currentJobState = progress.currentJobState;
	$: currentSnapshot = currentJobState?.snapshot;

	$: if (isRunning) {
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

	$: elapsedMs = (() => {
		if (!$batchTracker.startedAt) return 0;
		if ($batchTracker.completedAt) {
			return Math.max(0, $batchTracker.completedAt - $batchTracker.startedAt);
		}
		return Math.max(0, now - $batchTracker.startedAt);
	})();

	$: estimatedRemainingMs = (() => {
		if (!isRunning || progress.completedAllPages === 0 || progress.totalAllPages <= progress.completedAllPages) return null;
		const avgMsPerPage = elapsedMs / progress.completedAllPages;
		const remainingPages = progress.totalAllPages - progress.completedAllPages;
		return Math.round(avgMsPerPage * remainingPages);
	})();

	function formatDuration(ms: number | undefined | null): string {
		if (ms === undefined || ms === null || ms <= 0) return '-';
		const totalSec = Math.round(ms / 1000);
		if (totalSec < 60) return `${totalSec}s`;
		const hours = Math.floor(totalSec / 3600);
		const min = Math.floor((totalSec % 3600) / 60);
		const remSec = totalSec % 60;
		if (hours > 0) {
			return `${hours}h ${min}m ${remSec}s`;
		}
		return `${min}m ${remSec}s`;
	}

	function jumpToReader(chapterId?: number) {
		const targetId = chapterId || currentChapter?.id;
		if (targetId && $batchTracker.bookId) {
			goto(`/app/books/${$batchTracker.bookId}/chapters/${targetId}/`);
		}
	}
</script>

{#if active}
	<!-- FLOATING BATCH TRANSLATION HUD CONTAINER -->
	<aside
		aria-label="Batch translation progress"
		class="fixed bottom-4 right-3 sm:right-5 z-50 flex flex-col items-end max-w-[calc(100vw-1.5rem)] sm:max-w-md"
		transition:fly={{ y: 20, duration: 250, easing: cubicOut }}
	>
		<!-- MAIN CARD CONTAINER -->
		<div
			class={`w-full overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${
				$settings.theme === 'dark'
					? 'border-white/15 bg-[#171410]/95 text-white shadow-black/80'
					: $settings.theme === 'sepia'
						? 'border-[#8c6b4f]/25 bg-[#fbf6ed]/95 text-[#2c2219] shadow-[#8c6b4f]/20'
						: 'border-black/15 bg-white/95 text-slate-900 shadow-black/15'
			}`}
		>
			<!-- COMPACT / SUMMARY TOP BAR (ALWAYS VISIBLE) -->
			<div class="flex items-center justify-between gap-2.5 p-3 sm:p-3.5">
				<!-- LEFT: STATUS ICON + TITLES -->
				<button
					type="button"
					on:click={() => (expanded = !expanded)}
					class="flex items-center gap-2.5 min-w-0 flex-1 text-left select-none group"
					aria-expanded={expanded}
					aria-label="Toggle batch details"
				>
					<div
						class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${
							isRunning
								? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]'
								: isPaused
									? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
									: isCompleted
										? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
										: 'bg-neutral-500/10 text-neutral-500'
						}`}
					>
						{#if isRunning}
							<Loader2 size={16} class="animate-spin" />
						{:else if isPaused}
							<Pause size={15} />
						{:else if isCompleted}
							<CheckCircle2 size={16} />
						{:else}
							<Layers size={16} />
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5 flex-wrap">
							<span class="text-[11px] font-bold tracking-tight uppercase opacity-60">
								{isRunning ? 'Batch Translating' : isPaused ? 'Batch Paused' : isCompleted ? 'Batch Completed' : 'Batch Stopped'}
							</span>
							<span class="text-[10px] font-mono rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.2 font-bold">
								{progress.completedChapters}/{progress.totalChapters} Chs ({progress.overallProgressPercent}%)
							</span>
							{#if elapsedMs > 0}
								<span class="text-[10px] font-mono opacity-60 flex items-center gap-0.5">
									<Clock size={10} /> {formatDuration(elapsedMs)}
									{#if isRunning && estimatedRemainingMs !== null}
										<span>• ~{formatDuration(estimatedRemainingMs)} left</span>
									{/if}
								</span>
							{/if}
						</div>
						<div class="text-xs font-bold truncate leading-snug mt-0.5" title={$batchTracker.bookTitle || 'Book Translation'}>
							{#if currentChapter && isRunning}
								<span>Ch.{currentChapter.seq + 1}: {currentChapter.titleTarget || currentChapter.title || `Chapter ${currentChapter.seq + 1}`}</span>
							{:else}
								<span>{$batchTracker.bookTitle || 'Batch Queue'}</span>
							{/if}
						</div>
					</div>
				</button>

				<!-- RIGHT: QUICK CONTROLS & EXPAND/CLOSE -->
				<div class="flex items-center gap-1.5 shrink-0">
					{#if isRunning}
						<button
							type="button"
							on:click={() => batchTracker.pauseBatch()}
							class="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-current hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 transition active:scale-95 shadow-2xs"
							title="Pause Batch Translation"
							aria-label="Pause batch"
							use:ripple
						>
							<Pause size={15} />
						</button>
					{:else if isPaused}
						<button
							type="button"
							on:click={() => batchTracker.resumeBatch()}
							class="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-[#b23a2e] text-white hover:opacity-90 transition active:scale-95 shadow-2xs"
							title="Resume Batch Translation"
							aria-label="Resume batch"
							use:ripple
						>
							<Play size={15} class="fill-current" />
						</button>
					{/if}

					<button
						type="button"
						on:click={() => (expanded = !expanded)}
						class="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-current hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 transition active:scale-95 shadow-2xs"
						title={expanded ? 'Minimize Details' : 'Expand Details'}
						aria-label={expanded ? 'Minimize details' : 'Expand details'}
						use:ripple
					>
						{#if expanded}
							<ChevronDown size={16} />
						{:else}
							<ChevronUp size={16} />
						{/if}
					</button>

					{#if isCompleted || isCancelled}
						<button
							type="button"
							on:click={() => batchTracker.clearBatch()}
							class="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-black/10 bg-black/5 text-current hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 transition active:scale-95 shadow-2xs opacity-70 hover:opacity-100"
							title="Dismiss Batch"
							aria-label="Dismiss batch"
							use:ripple
						>
							<X size={15} />
						</button>
					{/if}
				</div>
			</div>

			<!-- OVERALL BATCH PROGRESS LINE -->
			<div class="h-1 w-full bg-black/5 dark:bg-white/5 overflow-hidden">
				<div
					class={`h-full transition-all duration-300 ${
						isCompleted
							? 'bg-emerald-500'
							: isPaused
								? 'bg-amber-500'
								: 'bg-[#b23a2e] dark:bg-[#e08a63]'
					}`}
					style={`width: ${progress.overallProgressPercent}%`}
				></div>
			</div>

			<!-- EXPANDED DETAILED DRAWER -->
			{#if expanded}
				<div
					transition:slide={{ duration: 200 }}
					class="flex flex-col gap-3 p-3.5 sm:p-4 border-t border-black/[0.06] dark:border-white/[0.06] max-h-[70vh] overflow-y-auto no-scrollbar"
				>
					<!-- ACTIVE CHAPTER CURRENT PHASE & PAGE METRICS -->
					{#if (isRunning || isPaused) && (($batchProgress.activeChapters && $batchProgress.activeChapters.length > 0) || currentChapter)}
						{@const activeList = $batchProgress.activeChapters && $batchProgress.activeChapters.length > 0 ? $batchProgress.activeChapters : (currentChapter ? [currentChapter] : [])}
						<div class="flex flex-col gap-2.5">
							{#each activeList as ch (ch.id)}
								{@const chJobState = $jobTracker.jobs[ch.id]}
								{@const chSnapshot = chJobState?.snapshot}
								<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
									<div class="flex items-center justify-between gap-2 text-xs font-semibold">
										<div class="flex items-center gap-1.5 min-w-0">
											<span class="truncate">Chapter {ch.seq + 1}: {ch.titleTarget || ch.title || `Chapter ${ch.seq + 1}`}</span>
										</div>
										<button
											type="button"
											on:click={() => jumpToReader(ch.id)}
											class="inline-flex items-center gap-1 text-[11px] text-[#b23a2e] dark:text-[#e08a63] hover:underline shrink-0 font-medium"
										>
											<BookOpen size={12} />
											<span>Open</span>
										</button>
									</div>

									{#if ch.status === 'reslicing'}
										<div class="mt-2.5 flex items-center gap-2 rounded-lg bg-[#b23a2e]/10 px-2.5 py-2 text-xs font-medium text-[#b23a2e] dark:text-[#e08a63] border border-[#b23a2e]/20">
											{#if isRunning}
												<Loader2 size={14} class="animate-spin shrink-0 text-[#b23a2e] dark:text-[#e08a63]" />
											{:else}
												<Scissors size={14} class="shrink-0 text-[#b23a2e] dark:text-[#e08a63]" />
											{/if}
											<div class="min-w-0 flex-1">
												<div class="font-bold text-[11px]">Smart Page Re-slicing</div>
												<div class="text-[10px] opacity-75 truncate">{ch.resliceMessage || 'Stitching canvas & finding clean text gutters...'}</div>
											</div>
										</div>
									{:else}
										<!-- PAGE LEVEL SUB-PROGRESS BAR -->
										{#if chSnapshot}
											{@const donePages = chSnapshot.completedPages || 0}
											{@const totalPgs = chSnapshot.totalPages || ch.pageCount || 0}
											{@const pgPct = totalPgs > 0 ? Math.min(100, Math.round((donePages / totalPgs) * 100)) : 0}
											<div class="mt-2.5">
												<div class="flex items-center justify-between text-[10px] opacity-70 mb-1">
													<span>Page Pipeline Progress</span>
													<span class="font-mono font-bold">
														{donePages}/{totalPgs} pgs ({pgPct}%)
														{#if isRunning && estimatedRemainingMs !== null && activeList.length === 1}
															• ~{formatDuration(estimatedRemainingMs)} left
														{/if}
													</span>
												</div>
												<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
													<div class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] transition-all duration-300" style={`width: ${pgPct}%`}></div>
												</div>
											</div>
										{/if}
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- QUEUED CHAPTERS LIST -->
					<div>
						<div class="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1.5">
							Chapter Queue ({$batchTracker.queue.length})
						</div>
						<ul class="flex flex-col gap-1.5 max-h-40 overflow-y-auto no-scrollbar pr-0.5">
							{#each $batchTracker.queue as item, idx}
								<li
									class={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
										item.status === 'processing' || item.status === 'reslicing'
											? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63] font-bold ring-1 ring-[#b23a2e]/20'
											: item.status === 'done'
												? 'opacity-80 hover:bg-black/5 dark:hover:bg-white/5'
												: item.status === 'error'
													? 'text-red-600 dark:text-red-400 bg-red-500/10'
													: 'opacity-50'
									}`}
								>
									<div class="flex items-center gap-2 min-w-0 flex-1">
										<span class="font-mono text-[10px] opacity-60">#{item.seq + 1}</span>
										<span class="truncate">{item.titleTarget || item.title || `Chapter ${item.seq + 1}`}</span>
									</div>

									<div class="flex items-center gap-1.5 shrink-0">
										{#if item.status === 'done'}
											<span class="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">✓ Done</span>
										{:else if item.status === 'reslicing'}
											<span class="text-[10px] font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">✂ Re-slicing</span>
										{:else if item.status === 'processing'}
											<span class="text-[10px] font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">⚙ {item.translatedPages || 0}/{item.pageCount}</span>
										{:else if item.status === 'error'}
											<span class="text-[10px] font-mono font-bold text-red-500">✕ Error</span>
										{:else if item.status === 'skipped'}
											<span class="text-[10px] font-mono opacity-50">Skipped</span>
										{:else if item.status === 'cancelled'}
											<span class="text-[10px] font-mono opacity-50">Cancelled</span>
										{:else}
											<span class="text-[10px] font-mono opacity-60">{item.pageCount} pgs</span>
										{/if}

										{#if item.status === 'done'}
											<button
												type="button"
												on:click={() => jumpToReader(item.id)}
												class="p-0.5 rounded opacity-60 hover:opacity-100 hover:text-[#b23a2e] transition"
												title="Open Chapter Reader"
											>
												<ExternalLink size={12} />
											</button>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</div>


					<!-- ACTION FOOTER: SKIP / CANCEL -->
					{#if isRunning || isPaused}
						<div class="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
							<button
								type="button"
								on:click={() => batchTracker.skipCurrentChapter()}
								class="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition"
								use:ripple
							>
								<SkipForward size={12} />
								<span>Skip Chapter</span>
							</button>

							<button
								type="button"
								on:click={() => batchTracker.cancelBatch()}
								class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition"
								use:ripple
							>
								<X size={13} />
								<span>Cancel Batch</span>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</aside>
{/if}
