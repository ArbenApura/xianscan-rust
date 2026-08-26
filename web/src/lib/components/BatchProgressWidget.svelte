<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';

	// IMPORTED DEP-COMPONENTS
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Pause from 'lucide-svelte/icons/pause';
	import Play from 'lucide-svelte/icons/play';
	import SkipForward from 'lucide-svelte/icons/skip-forward';
	import X from 'lucide-svelte/icons/x';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import Layers from 'lucide-svelte/icons/layers';
	import Clock from 'lucide-svelte/icons/clock';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Scissors from 'lucide-svelte/icons/scissors';
	import Activity from 'lucide-svelte/icons/activity';
	import Zap from 'lucide-svelte/icons/zap';
	import Square from 'lucide-svelte/icons/square';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';

	// IMPORTED MODULES
	import { batchTracker, batchProgress } from '$lib/stores/batch-tracker';
	import { jobTracker, activeTranslatingChapters } from '$lib/stores/job-tracker';
	import { settings, THEME_PANEL, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { PIPELINE_STEP_LABELS, type PageProgressState } from '$lib/types';

	// -- STATES -- //

	let widgetEl: HTMLElement | null = null;
	let expanded = false;
	let activeTab: 'queue' | 'telemetry' = 'queue';
	let tabContentInnerEl: HTMLElement | null = null;
	let animatedHeight: number | null = null;
	let switchTimer: ReturnType<typeof setTimeout> | null = null;
	let resetTimer: ReturnType<typeof setTimeout> | null = null;
	let now = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;
	let singleChapterDismissed = false;
	let draggedQueueIndex: number | null = null;
	let dragOverQueueIndex: number | null = null;
	let selectedTelemetryChapterId: number | null = null;

	// -- LIFECYCLES -- //

	onMount(() => {
		batchTracker.sync();
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (switchTimer) clearTimeout(switchTimer);
		if (resetTimer) clearTimeout(resetTimer);
	});

	// -- REACTIVE STATEMENTS -- //

	$: isBatchActive = $batchTracker.active;
	$: batchStatus = $batchTracker.status;

	// ACTIVE SINGLE-CHAPTER RUN (FALLBACK WHEN BATCH IS NOT RUNNING)
	$: activeSingleChapterJobs = $activeTranslatingChapters;
	$: currentRouteChapterId = Number($page.params.chapterId);
	$: singleJobState = !isBatchActive
		? (Number.isInteger(currentRouteChapterId) && $jobTracker.jobs[currentRouteChapterId]?.running
				? $jobTracker.jobs[currentRouteChapterId]
				: activeSingleChapterJobs[0] || null)
		: null;

	$: isSingleRunning = Boolean(singleJobState?.running);
	$: singleSnapshot = singleJobState?.snapshot;

	// WIDGET VISIBILITY
	$: isVisible = isBatchActive || (isSingleRunning && !singleChapterDismissed);

	$: isSingleMode = !isBatchActive && Boolean(singleJobState);

	$: if (isSingleRunning) {
		singleChapterDismissed = false;
	}

	$: isRunning = isBatchActive ? batchStatus === 'running' : isSingleRunning;
	$: isPaused = isBatchActive && batchStatus === 'paused';
	$: isCompleted = isBatchActive && batchStatus === 'completed';
	$: isCancelled = isBatchActive && batchStatus === 'cancelled';

	$: progress = $batchProgress;
	$: currentChapter = isBatchActive ? progress.currentChapter : null;
	$: activeChapters = isBatchActive && $batchProgress.activeChapters && $batchProgress.activeChapters.length > 0
		? $batchProgress.activeChapters
		: (currentChapter ? [currentChapter] : []);

	// AUTO-RESOLVE SELECTED TELEMETRY CHAPTER AMONG RUNNING PARALLEL WORKERS
	$: effectiveTelemetryChapter = (() => {
		if (isSingleMode) return null;
		if (selectedTelemetryChapterId) {
			const found = activeChapters.find((c) => c.id === selectedTelemetryChapterId);
			if (found) return found;
		}
		return activeChapters[0] || currentChapter;
	})();

	$: telemetryJobState = effectiveTelemetryChapter
		? $jobTracker.jobs[effectiveTelemetryChapter.id] || null
		: (isBatchActive ? progress.currentJobState : singleJobState);

	$: currentJobState = isBatchActive ? progress.currentJobState : singleJobState;
	$: currentSnapshot = currentJobState?.snapshot;
	$: telemetrySnapshot = telemetryJobState?.snapshot || currentSnapshot || singleSnapshot || ($batchTracker.queue[0]?.id ? $jobTracker.jobs[$batchTracker.queue[0].id]?.snapshot : null);

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

	// RUNNING ELAPSED TIME
	$: elapsedMs = (() => {
		if (isBatchActive) {
			if (!$batchTracker.startedAt) return 0;
			if ($batchTracker.completedAt) {
				return Math.max(0, $batchTracker.completedAt - $batchTracker.startedAt);
			}
			return Math.max(0, now - $batchTracker.startedAt);
		} else if (singleSnapshot?.startedAt) {
			if (singleSnapshot.completedAt) {
				return Math.max(0, singleSnapshot.completedAt - singleSnapshot.startedAt);
			}
			return Math.max(0, now - singleSnapshot.startedAt);
		}
		return 0;
	})();

	// ESTIMATED TIME REMAINING
	$: estimatedRemainingMs = (() => {
		if (isBatchActive) {
			if (!isRunning || progress.completedAllPages === 0 || progress.totalAllPages <= progress.completedAllPages) return null;
			const avgMsPerPage = elapsedMs / progress.completedAllPages;
			const remainingPages = progress.totalAllPages - progress.completedAllPages;
			return Math.round(avgMsPerPage * remainingPages);
		} else if (singleSnapshot) {
			const completed = singleSnapshot.completedPages || 0;
			const total = singleSnapshot.totalPages || singleSnapshot.pages.length || 0;
			if (!isRunning || completed === 0 || total <= completed) return null;
			const avgMsPerPage = elapsedMs / completed;
			return Math.round(avgMsPerPage * (total - completed));
		}
		return null;
	})();

	// TARGET PAGE IDS FILTER (FOR INDIVIDUAL PAGE RUNS)
	$: targetPageIdSet = (() => {
		const qItem = currentChapter || $batchTracker.queue[0];
		if (qItem?.pageIds && qItem.pageIds.length > 0) {
			return new Set(qItem.pageIds);
		}
		if (singleSnapshot?.targetPageIds && singleSnapshot.targetPageIds.length > 0) {
			return new Set(singleSnapshot.targetPageIds);
		}
		return null;
	})();

	// SINGLE-CHAPTER / SINGLE-PAGE PROGRESS NUMBERS
	$: singleTargetPages = (() => {
		const raw = singleSnapshot?.pages || [];
		if (!raw.length) return [];
		const nonSkipped = raw.filter((p) => p.status !== 'skipped');
		if (targetPageIdSet) {
			return nonSkipped.filter((p) => targetPageIdSet.has(p.pageId));
		}
		return nonSkipped;
	})();
	$: singleTotalPages = singleSnapshot?.totalPages && targetPageIdSet
		? Math.min(singleSnapshot.totalPages, targetPageIdSet.size)
		: singleTargetPages.length;
	$: singleDonePages = singleTargetPages.filter((p) => p.status === 'done').length;
	$: singleProgressPercent = singleTotalPages > 0 ? Math.min(100, Math.round((singleDonePages / singleTotalPages) * 100)) : 0;

	// FILTERED TELEMETRY PAGES (EXCLUDES CANCELLED AND NON-TARGET PAGES)
	$: filteredTelemetryPages = (() => {
		const rawPages = telemetrySnapshot?.pages || currentSnapshot?.pages || [];
		if (!rawPages.length) return [];

		const nonSkipped = rawPages.filter((p) => p.status !== 'skipped');
		if (targetPageIdSet) {
			return nonSkipped.filter((p) => targetPageIdSet.has(p.pageId));
		}

		if (isSingleMode) {
			return singleTargetPages;
		}

		return nonSkipped;
	})();

	// ALWAYS CONNECT REAL-TIME TELEMETRY STREAM FOR ALL ACTIVE RUNNING CHAPTERS
	$: if (isRunning && activeChapters.length > 0) {
		for (const ch of activeChapters) {
			const job = $jobTracker.jobs[ch.id];
			if (!job || !job.running) {
				void jobTracker.syncChapter(ch.id);
			}
		}
	}

	// FILTER UPCOMING QUEUE TO EXCLUDE CURRENTLY ACTIVE AND ALREADY COMPLETED CHAPTERS
	$: upcomingQueue = $batchTracker.queue.filter(
		(item) => item.status !== 'processing' && item.status !== 'reslicing' && item.status !== 'done'
	);

	// -- FUNCTIONS -- //

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

	function formatChapterLabel(seq: number, title?: string | null, titleTarget?: string | null): string {
		const target = (titleTarget || '').trim();
		const src = (title || '').trim();
		if (target) {
			if (/^(chapter|ch\.?|ep\.?|第|\d+)/i.test(target)) return target;
			return `Ch. ${seq + 1}: ${target}`;
		}
		if (src) {
			if (/^(chapter|ch\.?|ep\.?|第|\d+)/i.test(src)) return src;
			return `Ch. ${seq + 1}: ${src}`;
		}
		return `Ch. ${seq + 1}`;
	}

	function toggleBatchPause() {
		if (isPaused) {
			void batchTracker.resumeBatch();
		} else {
			void batchTracker.pauseBatch();
		}
	}

	function dismissWidget() {
		if (isCompleted || isCancelled) {
			batchTracker.clearBatch();
		} else if (isSingleMode) {
			singleChapterDismissed = true;
		}
	}

	function jumpToReader(chapterId?: number, itemBookId?: string) {
		const targetId = chapterId || currentChapter?.id || singleJobState?.chapterId;
		const bookId = itemBookId || currentChapter?.bookId || $batchTracker.bookId || $page.params.id;
		if (targetId && bookId) {
			goto(`/app/books/${bookId}/chapters/${targetId}/`);
		}
	}

	async function cancelTelemetryPage(targetChapterId: number | undefined | null, targetPageId: number, pageSeq: number) {
		if (!targetChapterId || !targetPageId) return;
		try {
			await jobTracker.cancelPage(targetChapterId, targetPageId);
			batchTracker.cancelPage?.(targetChapterId, targetPageId);
			toast.info(`Cancelled Page ${pageSeq + 1} processing.`);
		} catch (err: any) {
			toast.error(err?.message || `Could not cancel Page ${pageSeq + 1}.`);
		}
	}

	function navigateToTelemetryPage(targetChapterId: number | undefined | null, targetBookId: string | undefined | null, pageId: number, pageSeq: number) {
		const chId = targetChapterId || effectiveTelemetryChapter?.id || currentChapter?.id || singleJobState?.chapterId;
		const bId = targetBookId || effectiveTelemetryChapter?.bookId || currentChapter?.bookId || $batchTracker.bookId || $page.params.id;

		if (!chId || !bId) return;

		const currentRouteChapterId = Number($page.params.chapterId);
		if (currentRouteChapterId === chId) {
			// ALREADY ON THIS CHAPTER PAGE -> SMOOTH SCROLL DIRECTLY
			const el = (document.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement | null) ||
				(document.querySelector(`[data-page-seq="${pageSeq}"]`) as HTMLElement | null);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				el.classList.add('ring-2', 'ring-[#b23a2e]', 'dark:ring-[#e08a63]');
				setTimeout(() => {
					el.classList.remove('ring-2', 'ring-[#b23a2e]', 'dark:ring-[#e08a63]');
				}, 2000);
			}
		} else {
			// NAVIGATE TO THE CHAPTER READER AND SCROLL TO PAGE
			goto(`/app/books/${bId}/chapters/${chId}/?pageId=${pageId}&seq=${pageSeq}#page-${pageId}`);
		}
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

	function switchTab(tab: 'queue' | 'telemetry') {
		if (activeTab === tab) return;
		if (tabContentInnerEl) {
			const startH = tabContentInnerEl.offsetHeight;
			if (startH > 0) {
				animatedHeight = startH;
			}
		}
		activeTab = tab;

		if (switchTimer) clearTimeout(switchTimer);
		if (resetTimer) clearTimeout(resetTimer);

		switchTimer = setTimeout(() => {
			if (tabContentInnerEl) {
				const targetH = tabContentInnerEl.scrollHeight;
				if (targetH > 0) {
					animatedHeight = targetH;
				}
			}
			resetTimer = setTimeout(() => {
				animatedHeight = null;
			}, 280);
		}, 20);
	}

	// AUTO-MINIMIZE WHEN USER TOUCHES OR CLICKS OUTSIDE THE HUD DRAWER
	function handleOutsidePointer(e: MouseEvent | TouchEvent | PointerEvent) {
		if (!expanded || !widgetEl) return;
		const target = e.target as Node | null;
		if (target && !widgetEl.contains(target)) {
			expanded = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (expanded && e.key === 'Escape') {
			expanded = false;
		}
	}

	// QUEUE REORDERING DRAG & DROP
	function handleQueueDragStart(e: DragEvent, index: number) {
		draggedQueueIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleQueueDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		if (dragOverQueueIndex !== index) {
			dragOverQueueIndex = index;
		}
	}

	function handleQueueDrop(e: DragEvent, dropIndex: number) {
		e.preventDefault();
		if (draggedQueueIndex === null || draggedQueueIndex === dropIndex) {
			draggedQueueIndex = null;
			dragOverQueueIndex = null;
			return;
		}

		const items = [...upcomingQueue];
		const [draggedItem] = items.splice(draggedQueueIndex, 1);
		items.splice(dropIndex, 0, draggedItem);

		draggedQueueIndex = null;
		dragOverQueueIndex = null;

		void batchTracker.reorderQueue(items.map((i) => i.id));
	}

	function handleQueueDragEnd() {
		draggedQueueIndex = null;
		dragOverQueueIndex = null;
	}
</script>

<svelte:window
	on:pointerdown={handleOutsidePointer}
	on:touchstart={handleOutsidePointer}
	on:keydown={handleKeydown}
/>

{#if isVisible}
	<!-- STUDIO FLOATING BATCH / CHAPTER HUD -->
	<aside
		bind:this={widgetEl}
		aria-label="Translation studio HUD"
		class="fixed bottom-3 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-50 flex flex-col items-center sm:items-end w-auto sm:w-[480px] max-w-[480px] select-none"
		transition:fly={{ y: 20, duration: 220, easing: cubicOut }}
	>
		<!-- MAIN CARD CONTAINER -->
		<div
			class={cn(
				'w-full overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl',
				THEME_PANEL[$settings.theme],
				THEME_PANEL_BORDER[$settings.theme],
				expanded ? 'max-h-[80vh] flex flex-col' : 'h-auto'
			)}
		>
			<!-- 1. SUMMARY BAR -->
			<div class="flex items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 shrink-0">
				<!-- LEFT: CLICK TO EXPAND DETAILS -->
				<button
					type="button"
					on:click={() => (expanded = !expanded)}
					class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left select-none cursor-pointer group"
					aria-expanded={expanded}
					aria-label="Toggle translation studio drawer"
				>
					<!-- STATUS ICON BADGE -->
					<div
						class={cn(
							'flex h-8.5 w-8.5 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-2xs',
							isRunning
								? 'bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#b23a2e]/20 dark:text-[#e08a63]'
								: isPaused
									? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
									: isCompleted
										? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
										: 'bg-neutral-500/10 text-neutral-500'
						)}
					>
						{#if isRunning}
							<Loader2 size={17} class="animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
						{:else if isPaused}
							<Pause size={16} />
						{:else if isCompleted}
							<CheckCircle2 size={17} />
						{:else}
							<Layers size={17} />
						{/if}
					</div>

					<!-- METRICS & TITLE -->
					<div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
						<!-- ROW 1: PRIMARY TITLE (CHAPTER + BOOK TITLE WITH ELLIPSIS TRUNCATE) -->
						<div class="text-xs sm:text-sm font-semibold truncate leading-tight opacity-90">
							{#if isSingleMode}
								<span>{singleJobState?.chapterId ? `Chapter ${singleJobState.chapterId}` : 'Chapter'}</span>
								{#if $batchTracker.bookTitle}
									<span class="opacity-60 font-normal"> ({$batchTracker.bookTitle})</span>
								{/if}
							{:else if currentChapter}
								<span>{formatChapterLabel(currentChapter.seq, currentChapter.title, currentChapter.titleTarget)}</span>
								{#if $batchTracker.bookTitle}
									<span class="opacity-60 font-normal"> ({$batchTracker.bookTitle})</span>
								{/if}
							{:else}
								<span>{$batchTracker.bookTitle || 'Translation Queue'}</span>
							{/if}
						</div>

						<!-- ROW 2: CLEAN INLINE METRICS (NO WRAPPING) -->
						<div class="flex items-center gap-1.5 text-[11px] font-medium opacity-70 truncate leading-none">
							<span class="font-bold uppercase tracking-wider text-[10px] opacity-90 shrink-0">
								{#if isSingleMode}
									Queue Active
								{:else}
									{isRunning ? 'Queue Active' : isPaused ? 'Queue Paused' : isCompleted ? 'Queue Finished' : 'Queue Stopped'}
								{/if}
							</span>

							<span class="opacity-35 shrink-0">•</span>

							<!-- PROGRESS BADGE -->
							<span class="font-semibold shrink-0">
								{#if isSingleMode}
									{singleDonePages}/{singleTotalPages} pgs ({singleProgressPercent}%)
								{:else}
									{progress.completedChapters}/{progress.totalChapters} chs ({progress.overallProgressPercent}%)
								{/if}
							</span>

							<!-- ELAPSED DURATION -->
							<span class="opacity-35 shrink-0">•</span>
							<span class="flex items-center gap-0.5 shrink-0">
								<Clock size={10} class="opacity-75 inline" />
								<span>{formatDuration(elapsedMs)}</span>
							</span>

							<!-- ESTIMATED TIME REMAINING -->
							{#if isRunning && estimatedRemainingMs !== null}
								<span class="opacity-35 hidden xs:inline shrink-0">•</span>
								<span class="text-[#b23a2e] dark:text-[#e08a63] font-semibold hidden xs:inline shrink-0">
									~{formatDuration(estimatedRemainingMs)} left
								</span>
							{/if}
						</div>
					</div>
				</button>

				<!-- RIGHT: QUICK CONTROLS -->
				<div class="flex items-center gap-1.5 shrink-0">
					<!-- PAUSE / RESUME TOGGLE BUTTON -->
					{#if isBatchActive && (isRunning || isPaused)}
						<button
							type="button"
							on:click={toggleBatchPause}
							class="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 transition hover:bg-black/5 active:scale-95 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
							title={isPaused ? 'Resume translation queue' : 'Pause translation queue'}
							aria-label={isPaused ? 'Resume translation queue' : 'Pause translation queue'}
							use:ripple
						>
							{#if isPaused}
								<Play size={15} class="text-emerald-600 dark:text-emerald-400 fill-current ml-0.5" />
							{:else}
								<Pause size={15} class="opacity-75" />
							{/if}
						</button>
					{/if}

					<!-- EXPAND / COLLAPSE DRAWER CHEVRON BUTTON -->
					<button
						type="button"
						on:click={() => (expanded = !expanded)}
						class="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 transition hover:bg-black/5 active:scale-95 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
						aria-label={expanded ? 'Collapse translation studio HUD' : 'Expand translation studio HUD'}
						use:ripple
					>
						{#if expanded}
							<ChevronDown size={16} class="opacity-75" />
						{:else}
							<ChevronUp size={16} class="opacity-75" />
						{/if}
					</button>

					<!-- CLOSE / DISMISS BUTTON (ONLY WHEN COMPLETED, CANCELLED, OR SINGLE CHAPTER) -->
					{#if isCompleted || isCancelled || isSingleMode}
						<button
							type="button"
							on:click={dismissWidget}
							class="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-black/5 active:scale-95 dark:hover:bg-white/5 cursor-pointer opacity-50 hover:opacity-100"
							title="Close HUD"
							aria-label="Close HUD"
							use:ripple
						>
							<X size={15} />
						</button>
					{/if}
				</div>
			</div>

			<!-- LINEAR PROGRESS BAR -->
			<div class="h-1 w-full bg-black/5 dark:bg-white/5 shrink-0">
				<div
					class={cn(
						'h-full transition-all duration-300',
						isCancelled
							? 'bg-neutral-500'
							: isPaused
								? 'bg-amber-500'
								: isCompleted
									? 'bg-emerald-600'
									: 'bg-[#b23a2e] dark:bg-[#e08a63]'
					)}
					style={`width: ${isSingleMode ? singleProgressPercent : progress.overallProgressPercent}%`}
				></div>
			</div>

			<!-- 2. EXPANDED STUDIO DRAWER -->
			{#if expanded}
				<div
					transition:slide={{ duration: 240, easing: cubicOut }}
					class="flex flex-col min-h-0 border-t border-black/[0.06] dark:border-white/[0.06]"
				>
					<!-- STUDIO TAB BAR (QUEUE & LIVE TELEMETRY) -->
					<div class="flex items-center justify-between border-b border-black/[0.06] px-3 py-2 dark:border-white/[0.06] shrink-0 bg-black/[0.02] dark:bg-white/[0.02]">
						<div class="flex items-center gap-1.5 text-xs font-semibold">
							<button
								type="button"
								use:ripple
								on:click={() => switchTab('queue')}
								class={cn(
									'px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5',
									activeTab === 'queue'
										? 'bg-white text-black shadow-xs dark:bg-neutral-800 dark:text-white font-bold'
										: 'opacity-60 hover:opacity-100'
								)}
							>
								<Layers size={13} />
								<span>Queue ({$batchTracker.active ? $batchTracker.queue.length : (isSingleRunning ? 1 : 0)})</span>
							</button>

							<button
								type="button"
								use:ripple
								on:click={() => switchTab('telemetry')}
								class={cn(
									'px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5',
									activeTab === 'telemetry'
										? 'bg-white text-black shadow-xs dark:bg-neutral-800 dark:text-white font-bold'
										: 'opacity-60 hover:opacity-100'
								)}
							>
								<Activity size={13} />
								<span>Live Telemetry</span>
							</button>
						</div>

						{#if (currentSnapshot?.cacheHitCount || 0) > 0}
							<div class="flex items-center gap-1 rounded-md border border-[#4f7a64]/30 bg-[#4f7a64]/10 px-2 py-0.5 text-[10px] font-bold text-[#4f7a64] dark:text-[#83b39a]">
								<Zap size={11} />
								<span>{currentSnapshot?.cacheHitCount} Cache HIT</span>
							</div>
						{/if}
					</div>

					<!-- TAB CONTENT BODY WITH SMOOTH HEIGHT TRANSITION -->
					<!-- DYNAMIC TAB BODY HEIGHT ANIMATION TRANSITION -->
					<div
						class="min-h-0 max-h-[min(520px,calc(80vh-130px))] overflow-y-auto no-scrollbar transition-[height] duration-250 ease-out"
						style={animatedHeight !== null ? `height: ${animatedHeight}px;` : undefined}
					>
						<div bind:this={tabContentInnerEl} class="p-3.5 space-y-3">
							{#if activeTab === 'queue'}
								<!-- TAB 1: ACTIVE CHAPTER WORKERS + UPCOMING QUEUE -->
								<div in:fade={{ duration: 180, delay: 40 }} class="space-y-3">
									{#if isSingleMode && singleJobState}
										<!-- SINGLE CHAPTER QUEUE CARD -->
										<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
											<div class="flex items-center justify-between gap-2 text-xs font-semibold">
												<div class="flex items-center gap-1.5 min-w-0">
													<span class="truncate">{singleJobState?.chapterId ? `Chapter ${singleJobState.chapterId}` : 'Chapter'}</span>
												</div>
											</div>
											<div class="mt-2">
												<div class="flex items-center justify-between text-xs opacity-75 mb-1">
													<span>Page Progress</span>
													<span class="font-bold">{singleDonePages}/{singleTotalPages} pgs ({singleProgressPercent}%)</span>
												</div>
												<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
													<div class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] transition-all duration-300" style="width: {singleProgressPercent}%"></div>
												</div>
											</div>
										</div>
									{:else if (isRunning || isPaused) && (($batchProgress.activeChapters && $batchProgress.activeChapters.length > 0) || currentChapter)}
										{@const activeList = $batchProgress.activeChapters && $batchProgress.activeChapters.length > 0 ? $batchProgress.activeChapters : (currentChapter ? [currentChapter] : [])}
										<div class="space-y-2">
											{#each activeList as ch (ch.id)}
												{@const chJobState = $jobTracker.jobs[ch.id]}
												{@const chSnapshot = chJobState?.snapshot}
												<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
													<div class="flex items-center justify-between gap-2 text-xs font-semibold">
														<div class="flex items-center gap-1.5 min-w-0">
															<span class="truncate">{formatChapterLabel(ch.seq, ch.title, ch.titleTarget)}</span>
															{#if ch.bookTitle}
																<span class="text-[10px] opacity-50 truncate">({ch.bookTitle})</span>
															{/if}
														</div>
														<div class="flex items-center gap-2 shrink-0">
															<button
																type="button"
																on:click={() => jumpToReader(ch.id, ch.bookId)}
																class="inline-flex items-center gap-1 text-xs text-[#b23a2e] dark:text-[#e08a63] hover:underline font-medium cursor-pointer"
															>
																<BookOpen size={12} />
																<span>Open</span>
															</button>
															<button
																type="button"
																on:click={() => batchTracker.removeFromQueue(ch.id)}
																class="flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
																title="Remove chapter from queue"
																aria-label="Remove chapter from queue"
																use:ripple
															>
																<X size={12} />
															</button>
														</div>
													</div>

													{#if ch.status === 'reslicing'}
														<div class="mt-2 flex items-center gap-2 rounded-lg bg-[#b23a2e]/10 px-2.5 py-1.5 text-xs font-medium text-[#b23a2e] dark:text-[#e08a63] border border-[#b23a2e]/20">
															{#if isRunning}
																<Loader2 size={14} class="animate-spin shrink-0" />
															{:else}
																<Scissors size={14} class="shrink-0" />
															{/if}
															<div class="min-w-0 flex-1">
																<div class="font-bold text-xs">Smart Page Re-slicing</div>
																<div class="text-[10px] opacity-75 truncate">{ch.resliceMessage || 'Stitching canvas & finding clean text gutters...'}</div>
															</div>
														</div>
													{:else if chSnapshot || ch.translatedPages !== undefined}
														{@const targetIds = ch.pageIds && ch.pageIds.length > 0 ? new Set(ch.pageIds) : null}
														{@const donePages = chSnapshot
															? (targetIds
																	? chSnapshot.pages.filter((p) => targetIds.has(p.pageId) && p.status === 'done').length
																	: (chSnapshot.completedPages || 0))
															: (ch.translatedPages || 0)}
														{@const totalPgs = targetIds ? targetIds.size : (ch.totalPages || chSnapshot?.totalPages || ch.pageCount || 0)}
														{@const pgPct = totalPgs > 0 ? Math.min(100, Math.round((donePages / totalPgs) * 100)) : 0}
														<div class="mt-2">
															<div class="flex items-center justify-between text-xs opacity-75 mb-1">
																<span>Page Progress</span>
																<span class="font-bold">{donePages}/{totalPgs} pgs ({pgPct}%)</span>
															</div>
															<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
																<div class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] transition-all duration-300" style="width: {pgPct}%"></div>
															</div>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{/if}

									<!-- UPCOMING QUEUE ROWS WITH DRAG & DROP SWAPPING -->
									{#if upcomingQueue.length > 0}
										{@const activeOffset = (isRunning || isPaused) ? (($batchProgress.activeChapters && $batchProgress.activeChapters.length > 0) ? $batchProgress.activeChapters.length : (currentChapter ? 1 : 0)) : 0}
										<div class="space-y-1.5">
											<div class="flex items-center justify-between text-xs font-bold uppercase tracking-wider opacity-50 px-1">
												<span>Upcoming Queue</span>
												<span class="text-[10px] font-normal normal-case opacity-75">Drag to reorder</span>
											</div>
											<div class="divide-y divide-black/[0.04] dark:divide-white/[0.04] rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] overflow-hidden">
												{#each upcomingQueue as item, idx (item.id)}
													<!-- svelte-ignore a11y-no-static-element-interactions -->
													<div
														draggable="true"
														on:dragstart={(e) => handleQueueDragStart(e, idx)}
														on:dragover={(e) => handleQueueDragOver(e, idx)}
														on:drop={(e) => handleQueueDrop(e, idx)}
														on:dragend={handleQueueDragEnd}
														class={cn(
															'flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 text-xs transition-colors duration-150 select-none group',
															draggedQueueIndex === idx && 'opacity-40 bg-black/5 dark:bg-white/5',
															dragOverQueueIndex === idx && 'border-t-2 border-[#b23a2e] dark:border-[#e08a63] bg-[#b23a2e]/5 dark:bg-[#e08a63]/5'
														)}
													>
														<div class="flex items-center gap-2 min-w-0 flex-1">
															<!-- DRAG HANDLE GRIP ICON -->
															<div
																class="flex h-5 w-4 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing text-neutral-400 opacity-40 group-hover:opacity-100 transition-opacity"
																title="Drag to swap queue position"
															>
																<GripVertical size={13} />
															</div>

															<!-- SEQUENCE BADGE -->
															<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/5 dark:bg-white/10 text-[10px] font-bold opacity-75">
																{activeOffset + idx + 1}
															</span>
															<div class="min-w-0 flex-1 truncate">
																<span class="font-medium">{formatChapterLabel(item.seq, item.title, item.titleTarget)}</span>
																{#if item.bookTitle}
																	<span class="text-[10px] opacity-50 ml-1.5 truncate">({item.bookTitle})</span>
																{/if}
															</div>
														</div>

														<div class="flex items-center gap-1.5 shrink-0 text-xs">
															{#if item.status === 'done'}
																<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Done</span>
															{:else if item.status === 'reslicing'}
																<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">✂ Reslice</span>
															{:else if item.status === 'processing'}
																<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold">⚙ {item.translatedPages || 0}/{item.pageIds && item.pageIds.length > 0 ? item.pageIds.length : (item.totalPages || item.pageCount)}</span>
															{:else if item.status === 'error'}
																<span class="text-red-500 font-bold">✕ Error</span>
															{:else if item.status === 'skipped'}
																<span class="opacity-50">Skipped</span>
															{:else}
																<span class="opacity-50">{item.pageIds && item.pageIds.length > 0 ? item.pageIds.length : (item.totalPages || item.pageCount)} pgs</span>
															{/if}
															<button
																type="button"
																on:click={() => batchTracker.removeFromQueue(item.id)}
																class="flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer ml-1"
																title="Remove from queue"
																aria-label="Remove from queue"
																use:ripple
															>
																<X size={12} />
															</button>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{:else if isCompleted || ($batchTracker.queue.length > 0 && !isRunning && !isPaused)}
										<div class="space-y-1.5">
											<div class="text-xs font-bold uppercase tracking-wider opacity-50 px-1">
												{isCompleted ? `Completed Chapters (${$batchTracker.queue.length})` : 'Queue Items'}
											</div>
											<div class="divide-y divide-black/[0.04] dark:divide-white/[0.04] rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] overflow-hidden">
												{#each $batchTracker.queue as item, idx}
													<div class="flex items-center justify-between gap-2 px-3 py-2 text-xs">
														<div class="flex items-center gap-2 min-w-0 flex-1">
															<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
																{item.status === 'done' ? '✓' : idx + 1}
															</span>
															<div class="min-w-0 flex-1 truncate">
																<span class="font-medium">{formatChapterLabel(item.seq, item.title, item.titleTarget)}</span>
																{#if item.bookTitle}
																	<span class="text-[10px] opacity-50 ml-1.5 truncate">({item.bookTitle})</span>
																{/if}
															</div>
														</div>

														<div class="flex items-center gap-1.5 shrink-0 text-xs">
															{#if item.status === 'done'}
																<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Done</span>
															{:else if item.status === 'error'}
																<span class="text-red-500 font-bold">✕ Error</span>
															{:else}
																<span class="opacity-50">{item.status}</span>
															{/if}
															<span class="opacity-50">{item.pageIds && item.pageIds.length > 0 ? item.pageIds.length : (item.totalPages || item.pageCount || 0)} pgs</span>
															<button
																type="button"
																on:click={() => jumpToReader(item.id, item.bookId)}
																class="inline-flex items-center gap-1 text-xs text-[#b23a2e] dark:text-[#e08a63] hover:underline font-medium cursor-pointer ml-1"
															>
																<BookOpen size={12} />
																<span>Open</span>
															</button>
															<button
																type="button"
																on:click={() => batchTracker.removeFromQueue(item.id)}
																class="flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer ml-0.5"
																title="Remove from queue"
																aria-label="Remove from queue"
																use:ripple
															>
																<X size={12} />
															</button>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{:else if activeTab === 'telemetry'}
								<!-- TAB 2: LIVE PIPELINE TELEMETRY OR RESLICING VIEW -->
								<div in:fade={{ duration: 180, delay: 40 }} class="space-y-3">
									<!-- MULTI-CHAPTER PARALLEL WORKER SELECTOR PILLS -->
									{#if activeChapters.length > 1}
										<div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
											{#each activeChapters as ch (ch.id)}
												<button
													type="button"
													use:ripple
													on:click={() => (selectedTelemetryChapterId = ch.id)}
													class={cn(
														'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer select-none',
														effectiveTelemetryChapter?.id === ch.id
															? 'bg-[#b23a2e] text-white dark:bg-[#e08a63] dark:text-black shadow-xs font-bold'
															: 'bg-black/5 text-current opacity-70 hover:opacity-100 dark:bg-white/5'
													)}
												>
													{#if ch.status === 'reslicing'}
														<Scissors size={11} />
													{:else}
														<Loader2 size={11} class="animate-spin" />
													{/if}
													<span>{formatChapterLabel(ch.seq, ch.title, ch.titleTarget)}</span>
												</button>
											{/each}
										</div>
									{/if}

									{#if effectiveTelemetryChapter?.status === 'reslicing'}
										<!-- ACTIVE SMART RESLICING CARD -->
										<div class="py-6 px-4 flex flex-col items-center justify-center text-center space-y-3 rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]">
											<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#b23a2e]/20 dark:text-[#e08a63]">
												<Loader2 size={24} class="animate-spin" />
											</div>
											<div class="space-y-1">
												<h4 class="text-sm font-bold tracking-tight">Smart Page Re-slicing Active</h4>
												<p class="text-xs opacity-70 max-w-xs">{effectiveTelemetryChapter.resliceMessage || 'Stitching canvas & finding clean text gutters...'}</p>
											</div>
											<div class="w-full max-w-xs h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-1">
												<div class="h-full rounded-full bg-[#b23a2e] dark:bg-[#e08a63] animate-pulse w-full"></div>
											</div>
										</div>
									{:else if filteredTelemetryPages.length > 0}
										{@const displayTelemetryPages = filteredTelemetryPages}
										<div class="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
											<table class="w-full text-left text-xs border-collapse">
												<thead class="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 text-[10px] uppercase tracking-wider opacity-60">
													<tr>
														<th class="py-2 px-2.5">Page</th>
														<th class="py-2 px-2.5">Status</th>
														<th class="py-2 px-2.5">OCR</th>
														<th class="py-2 px-2.5">LLM</th>
														<th class="py-2 px-2.5">Inpaint</th>
														<th class="py-2 px-2.5 text-right">Total</th>
														<th class="py-2 px-1 text-right w-7"></th>
													</tr>
												</thead>
												<tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
													{#each displayTelemetryPages as p}
														{@const ocrTiming = p.timings?.analyze}
														{@const transTiming = p.timings?.translate}
														{@const cleanTiming = p.timings?.clean}
														{@const totalDur = getPageTotalDuration(p)}
														<tr class="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
															<td class="py-2 px-2.5 font-bold whitespace-nowrap">
																<button
																	type="button"
																	on:click={() => navigateToTelemetryPage(effectiveTelemetryChapter?.id || currentChapter?.id || singleJobState?.chapterId, effectiveTelemetryChapter?.bookId || currentChapter?.bookId || $batchTracker.bookId, p.pageId, p.seq)}
																	class="inline-flex items-center px-2 py-0.5 rounded-lg border border-black/10 dark:border-white/10 text-[#b23a2e] dark:text-[#e08a63] hover:bg-[#b23a2e]/10 dark:hover:bg-[#e08a63]/10 font-bold transition cursor-pointer select-none"
																	title="Navigate and scroll to Page {p.seq + 1}"
																	aria-label="Navigate and scroll to Page {p.seq + 1}"
																	use:ripple
																>
																	Pg {p.seq + 1}
																</button>
															</td>
															<td class="py-2 px-2.5 whitespace-nowrap">
																{#if p.status === 'done'}
																	<span class="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
																		<CheckCircle2 size={12} />
																		<span>Done</span>
																	</span>
																{:else if p.status === 'processing'}
																	<span class="text-[#b23a2e] dark:text-[#e08a63] font-bold inline-flex items-center gap-1">
																		<Loader2 size={12} class="animate-spin" />
																		<span>{p.currentStep ? p.currentStep.toUpperCase() : 'RUNNING'}</span>
																	</span>
																{:else if p.status === 'error'}
																	<span class="text-red-500 font-bold inline-flex items-center gap-1">
																		<AlertCircle size={12} />
																		<span>Error</span>
																	</span>
																{:else}
																	<span class="opacity-40">Pending</span>
																{/if}
															</td>
															<td class="py-2 px-2.5">
																{#if ocrTiming?.status === 'completed'}
																	{formatDuration(ocrTiming.durationMs)}
																{:else if ocrTiming?.status === 'running'}
																	<span class="text-[#b23a2e] animate-pulse font-bold">Running</span>
																{:else}
																	<span class="opacity-30">-</span>
																{/if}
															</td>
															<td class="py-2 px-2.5">
																{#if transTiming?.status === 'completed'}
																	{formatDuration(transTiming.durationMs)}
																	{#if transTiming.details?.cacheHit}
																		<span class="text-emerald-600 font-bold text-[10px] ml-0.5">HIT</span>
																	{/if}
																{:else if transTiming?.status === 'running'}
																	<span class="text-[#b23a2e] animate-pulse font-bold">Running</span>
																{:else}
																	<span class="opacity-30">-</span>
																{/if}
															</td>
															<td class="py-2 px-2.5">
																{#if cleanTiming?.status === 'completed'}
																	{formatDuration(cleanTiming.durationMs)}
																{:else if cleanTiming?.status === 'running'}
																	<span class="text-[#b23a2e] animate-pulse font-bold">Running</span>
																{:else}
																	<span class="opacity-30">-</span>
																{/if}
															</td>
															<td class="py-2 px-2.5 text-right font-semibold">
																{formatDuration(totalDur)}
															</td>
															<td class="py-2 px-1 text-right whitespace-nowrap">
																{#if p.status === 'processing' || p.status === 'pending'}
																	<button
																		type="button"
																		on:click={() => cancelTelemetryPage(effectiveTelemetryChapter?.id || currentChapter?.id || singleJobState?.chapterId, p.pageId, p.seq)}
																		class="flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer ml-auto"
																		title="Cancel page translation"
																		aria-label="Cancel page translation"
																		use:ripple
																	>
																		<X size={12} />
																	</button>
																{/if}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{:else}
										<div class="py-10 text-center text-xs opacity-50">
											No chapter page telemetry recorded yet.
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- 3. ACTION FOOTER: SKIP / CANCEL / DISMISS -->
					{#if (isBatchActive && (isRunning || isPaused)) || (isSingleMode && isSingleRunning)}
						<div class="flex items-center justify-between gap-2 p-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
							{#if isBatchActive && $batchTracker.queue.length > 1}
								<button
									type="button"
									on:click={() => batchTracker.skipCurrentChapter()}
									class="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition cursor-pointer"
									use:ripple
								>
									<SkipForward size={13} />
									<span>Skip Chapter</span>
								</button>
							{:else}
								<span class="text-xs opacity-50 font-medium">
									{isBatchActive && $batchTracker.queue[0]?.pageIds?.length
										? `Translating ${$batchTracker.queue[0].pageIds.length} Page${$batchTracker.queue[0].pageIds.length === 1 ? '' : 's'}`
										: 'Translating Chapter'}
								</span>
							{/if}

							<button
								type="button"
								on:click={() => {
									if (isBatchActive) {
										void batchTracker.cancelBatch();
									} else if (singleJobState?.chapterId) {
										void jobTracker.cancelTranslation(singleJobState.chapterId);
									}
								}}
								class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
								use:ripple
							>
								<X size={14} />
								<span>Cancel Queue</span>
							</button>
						</div>
					{:else if isCompleted || isCancelled}
						<div class="flex items-center justify-between gap-2 p-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
							<div class="flex items-center gap-1.5 text-xs font-semibold">
								{#if isCompleted}
									<span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
										<CheckCircle2 size={14} />
										<span>Queue Finished ({progress.completedChapters}/{progress.totalChapters} chapters)</span>
									</span>
								{:else}
									<span class="text-neutral-500 flex items-center gap-1">
										<X size={14} />
										<span>Queue Cancelled</span>
									</span>
								{/if}
							</div>

							<button
								type="button"
								on:click={dismissWidget}
								class="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition cursor-pointer"
								use:ripple
							>
								<CheckCircle2 size={13} class="text-emerald-600 dark:text-emerald-400" />
								<span>Dismiss</span>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</aside>
{/if}
