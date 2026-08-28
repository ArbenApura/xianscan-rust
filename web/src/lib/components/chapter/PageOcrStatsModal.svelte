<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	// IMPORTED DEP-COMPONENTS
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import Clock from 'lucide-svelte/icons/clock';
	import Zap from 'lucide-svelte/icons/zap';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Terminal from 'lucide-svelte/icons/terminal';
	import Scan from 'lucide-svelte/icons/scan';
	import Activity from 'lucide-svelte/icons/activity';
	import Layers from 'lucide-svelte/icons/layers';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';

	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';

	// -- REQUIRED PROPS -- //

	// -- OPTIONAL PROPS -- //
	export let open = false;
	export let page: any | null = null;

	// -- CONSTANTS -- //
	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	// -- TYPES -- //
	interface OcrStepLog {
		step: string;
		duration_ms: number;
		details: string;
	}

	interface OcrStatsPayload {
		total_time_ms: number;
		queue_wait_ms?: number;
		server_request_time_ms?: number;
		wall_time_ms?: number;
		detector_time_ms: number;
		ocr_fullpage_time_ms: number;
		rescue_time_ms: number;
		watermark_time_ms: number;
		assembly_time_ms: number;
		backend: string;
		device?: string;
		image_width: number;
		image_height: number;
		raw_bubbles_count: number;
		raw_text_bubbles_count: number;
		raw_text_free_count: number;
		raw_ocr_lines_count: number;
		rescued_crops_count: number;
		watermark_recovered_count: number;
		final_regions_count: number;
		avg_confidence: number;
		steps?: OcrStepLog[];
	}

	// -- STATES -- //
	let activeTab: 'overview' | 'steps' | 'raw' = 'overview';
	let copiedKey: string | null = null;

	// -- REACTIVE STATES -- //
	let parsedStats: OcrStatsPayload | null = null;
	let rawJsonText = '';
	let avgConfidence = 0;

	// -- REACTIVE STATEMENTS -- //
	$: {
		parsedStats = null;
		rawJsonText = '';

		if (page?.ocrStats) {
			try {
				const parsed = typeof page.ocrStats === 'string' ? JSON.parse(page.ocrStats) : page.ocrStats;
				if (parsed && typeof parsed === 'object') {
					parsedStats = parsed as OcrStatsPayload;
					rawJsonText = JSON.stringify(parsed, null, 2);
				}
			} catch {
				rawJsonText = String(page.ocrStats);
			}
		}

		if (parsedStats?.avg_confidence !== undefined && parsedStats?.avg_confidence !== null) {
			avgConfidence = parsedStats.avg_confidence;
		} else if (page?.regions?.length) {
			const sum = page.regions.reduce((acc: number, r: any) => acc + (r.conf ?? 0), 0);
			avgConfidence = sum / page.regions.length;
		} else {
			avgConfidence = 0;
		}
	}

	// -- FUNCTIONS -- //
	function copyText(text: string, key: string, label: string) {
		if (!text) return;
		navigator.clipboard?.writeText(text);
		copiedKey = key;
		toast.success(`Copied ${label} to clipboard`);
		setTimeout(() => {
			if (copiedKey === key) copiedKey = null;
		}, 2000);
	}

	function formatDuration(ms?: number): string {
		if (ms === undefined || ms === null || isNaN(ms)) return '—';
		if (ms < 1000) return `${Math.round(ms)} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	}

	function formatPercent(val?: number): string {
		if (val === undefined || val === null || isNaN(val)) return '—';
		return `${(val * 100).toFixed(1)}%`;
	}

	function getPhasePercent(duration: number, total: number): number {
		if (!total || total <= 0 || !duration) return 0;
		return Math.min(100, Math.max(2, (duration / total) * 100));
	}
</script>

<Modal
	{open}
	title={`OCR & Layout Diagnostics — Page ${page ? page.seq + 1 : ''} (ID: ${page?.id ?? ''})`}
	size="3xl"
	bodyClass="p-3 sm:p-5 overflow-hidden flex flex-col h-[88vh] sm:h-[82vh] max-h-[92dvh]"
	on:close={() => dispatch('close')}
>
	{#if page}
		<!-- TOP BENCHMARK METRICS BAR -->
		<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
			<!-- 1. TOTAL LATENCY -->
			<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
				<div
					class={cn(
						'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
						(parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 0) <= 1500
							? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
							: (parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 0) <= 6000
								? 'bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]'
								: 'bg-[#b23a2e]/15 text-[#b23a2e] dark:text-[#e08a63]'
					)}
				>
					<Clock size={16} />
				</div>
				<div class="min-w-0">
					<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
						{parsedStats?.wall_time_ms ? 'Total Wall Time' : 'Total Latency'}
					</div>
					<div class="text-xs sm:text-sm font-bold font-mono truncate" title={parsedStats?.wall_time_ms ? `Wall: ${formatDuration(parsedStats.wall_time_ms)} (Compute: ${formatDuration(parsedStats.total_time_ms)})` : undefined}>
						{formatDuration(parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms)}
					</div>
					{#if parsedStats?.wall_time_ms && parsedStats?.total_time_ms && parsedStats.wall_time_ms > parsedStats.total_time_ms + 50}
						<div class="text-[9px] font-mono text-neutral-400 truncate">
							Compute: {formatDuration(parsedStats.total_time_ms)}
						</div>
					{/if}
				</div>
			</div>

			<!-- 2. DETECTOR BACKEND & DEVICE -->
			<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
				<div class={cn(
					"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
					parsedStats?.device?.includes('CUDA') || parsedStats?.device?.includes('Dml') || parsedStats?.device?.includes('CoreML')
						? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
						: "bg-amber-500/15 text-amber-600 dark:text-amber-400"
				)}>
					<Cpu size={16} />
				</div>
				<div class="min-w-0">
					<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
						{parsedStats?.device ? parsedStats.device.replace('ExecutionProvider', '') : 'Backend'}
					</div>
					<div class="text-xs sm:text-sm font-bold font-mono truncate" title={`${parsedStats?.backend || 'RF-DETR Seg'} on ${parsedStats?.device || 'CPU'}`}>
						{parsedStats?.backend || 'RF-DETR Seg'}
					</div>
				</div>
			</div>

			<!-- 3. AVERAGE OCR CONFIDENCE -->
			<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
					<ShieldCheck size={16} />
				</div>
				<div class="min-w-0">
					<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Avg Confidence</div>
					<div class="text-xs sm:text-sm font-bold font-mono truncate">
						{formatPercent(avgConfidence)}
					</div>
				</div>
			</div>

			<!-- 4. TOTAL DETECTIONS / YIELD -->
			<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]">
					<Layers size={16} />
				</div>
				<div class="min-w-0">
					<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Regions Yield</div>
					<div class="text-xs sm:text-sm font-bold font-mono truncate">
						{parsedStats?.final_regions_count ?? page.regions?.length ?? 0} regions
					</div>
				</div>
			</div>
		</div>

		<!-- TAB SWITCHER -->
		<div class="mb-3 flex items-center justify-between gap-2 border-b border-black/10 pb-2 dark:border-white/10 shrink-0">
			<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs font-semibold">
				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'overview'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
					)}
					on:click={() => (activeTab = 'overview')}
				>
					<Activity size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Timing Breakdown</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'steps'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
					)}
					on:click={() => (activeTab = 'steps')}
				>
					<Scan size={13} />
					<span>Pipeline Steps Log</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'raw'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
					)}
					on:click={() => (activeTab = 'raw')}
				>
					<Terminal size={13} />
					<span>Raw JSON Stats</span>
				</button>
			</div>

			{#if rawJsonText}
				<Button
					variant="ghost"
					size="sm"
					class="h-7 text-xs"
					on:click={() => copyText(rawJsonText, 'stats', 'OCR Diagnostic JSON')}
				>
					{#if copiedKey === 'stats'}
						<Check size={13} class="mr-1 text-[#4f7a64]" />
						<span>Copied</span>
					{:else}
						<Copy size={13} class="mr-1" />
						<span>Copy JSON</span>
					{/if}
				</Button>
			{/if}
		</div>

		<!-- CONTENT AREA -->
		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			{#if !parsedStats && !page.ocrStats}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
						<Scan size={24} class="opacity-40" />
					</div>
					<div class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">No Telemetry Recorded Yet</div>
					<p class="mt-1 max-w-sm text-xs text-neutral-500 leading-relaxed">
						OCR timing benchmarks and step diagnostics are recorded automatically whenever this page is analyzed by the pipeline.
					</p>
				</div>
			{:else if activeTab === 'overview'}
				<!-- TIMING WATERFALL & BREAKDOWN -->
				<div class="space-y-4">
					<!-- SUMMARY STAT CARDS -->
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="text-[10px] uppercase font-semibold text-neutral-500">Image Canvas</div>
							<div class="mt-1 text-sm font-bold font-mono">
								{parsedStats?.image_width ?? page.width ?? '—'} × {parsedStats?.image_height ?? page.height ?? '—'}
							</div>
							<div class="text-[10px] text-neutral-400">Target Resolution</div>
						</div>

						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="text-[10px] uppercase font-semibold text-neutral-500">Speech Bubbles</div>
							<div class="mt-1 text-sm font-bold font-mono">
								{parsedStats?.raw_bubbles_count ?? '—'}
							</div>
							<div class="text-[10px] text-neutral-400">Containers Detected</div>
						</div>

						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="text-[10px] uppercase font-semibold text-neutral-500">Crop Rescues</div>
							<div class="mt-1 text-sm font-bold font-mono text-[#4f7a64] dark:text-[#83b39a]">
								{parsedStats?.rescued_crops_count ?? 0} rescued
							</div>
							<div class="text-[10px] text-neutral-400">Missed Text Recoveries</div>
						</div>

						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="text-[10px] uppercase font-semibold text-neutral-500">Watermark Clean</div>
							<div class="mt-1 text-sm font-bold font-mono text-[#a97f28] dark:text-[#d8b15a]">
								{parsedStats?.watermark_recovered_count ?? 0} lines
							</div>
							<div class="text-[10px] text-neutral-400">Inpainted Collisions</div>
						</div>
					</div>

					<!-- PHASE LATENCY PROGRESS BARS -->
					<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
						<div class="mb-3 flex items-center justify-between">
							<span class="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">Phase Latency Breakdown</span>
							<span class="font-mono text-xs font-semibold text-neutral-500">
								{formatDuration(parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms)} {parsedStats?.wall_time_ms ? 'wall' : 'total'}
							</span>
						</div>

						<div class="space-y-3">
							<!-- 0. CONCURRENCY QUEUE / ENGINE LOCK WAIT (IF PRESENT) -->
							{#if parsedStats?.queue_wait_ms && parsedStats.queue_wait_ms > 200}
								<div>
									<div class="mb-1 flex items-center justify-between text-xs">
										<span class="font-medium text-[#a97f28] dark:text-[#d8b15a]">0. Concurrency Queue & Engine Lock Wait</span>
										<span class="font-mono font-semibold text-[#a97f28] dark:text-[#d8b15a]">{formatDuration(parsedStats.queue_wait_ms)}</span>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
										<!-- PROGRESS BAR DYNAMIC WIDTH -->
										<div
											class="h-full rounded-full bg-[#a97f28]"
											style="width: {getPhasePercent(parsedStats.queue_wait_ms, parsedStats.wall_time_ms ?? (parsedStats.total_time_ms + parsedStats.queue_wait_ms))}%"
										></div>
									</div>
								</div>
							{/if}

							<!-- 1. DETECTOR -->
							<div>
								<div class="mb-1 flex items-center justify-between text-xs">
									<span class="font-medium text-neutral-600 dark:text-neutral-300">1. Comic Layout Detection (RF-DETR / RT-DETR)</span>
									<span class="font-mono font-semibold">{formatDuration(parsedStats?.detector_time_ms)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<!-- PROGRESS BAR DYNAMIC WIDTH -->
									<div
										class="h-full rounded-full bg-[#b23a2e]"
										style="width: {getPhasePercent(parsedStats?.detector_time_ms ?? 0, parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 1)}%"
									></div>
								</div>
							</div>

							<!-- 2. FULLPAGE OCR -->
							<div>
								<div class="mb-1 flex items-center justify-between text-xs">
									<span class="font-medium text-neutral-600 dark:text-neutral-300">2. Full-Page Line Detection & OCR (PP-OCRv6)</span>
									<span class="font-mono font-semibold">{formatDuration(parsedStats?.ocr_fullpage_time_ms)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<!-- PROGRESS BAR DYNAMIC WIDTH -->
									<div
										class="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
										style="width: {getPhasePercent(parsedStats?.ocr_fullpage_time_ms ?? 0, parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 1)}%"
									></div>
								</div>
							</div>

							<!-- 3. CROP RESCUE -->
							<div>
								<div class="mb-1 flex items-center justify-between text-xs">
									<span class="font-medium text-neutral-600 dark:text-neutral-300">3. Crop Rescue & Sub-Region Batching</span>
									<span class="font-mono font-semibold">{formatDuration(parsedStats?.rescue_time_ms)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<!-- PROGRESS BAR DYNAMIC WIDTH -->
									<div
										class="h-full rounded-full bg-[#4f7a64] dark:bg-[#83b39a]"
										style="width: {getPhasePercent(parsedStats?.rescue_time_ms ?? 0, parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 1)}%"
									></div>
								</div>
							</div>

							<!-- 4. WATERMARK -->
							<div>
								<div class="mb-1 flex items-center justify-between text-xs">
									<span class="font-medium text-neutral-600 dark:text-neutral-300">4. Chromatic Watermark Inpainting</span>
									<span class="font-mono font-semibold">{formatDuration(parsedStats?.watermark_time_ms)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<!-- PROGRESS BAR DYNAMIC WIDTH -->
									<div
										class="h-full rounded-full bg-[#a97f28] dark:bg-[#d8b15a]"
										style="width: {getPhasePercent(parsedStats?.watermark_time_ms ?? 0, parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 1)}%"
									></div>
								</div>
							</div>

							<!-- 5. UTTERANCE ASSEMBLY -->
							<div>
								<div class="mb-1 flex items-center justify-between text-xs">
									<span class="font-medium text-neutral-600 dark:text-neutral-300">5. Utterance Assembly & Reading Order Sort</span>
									<span class="font-mono font-semibold">{formatDuration(parsedStats?.assembly_time_ms)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
									<!-- PROGRESS BAR DYNAMIC WIDTH -->
									<div
										class="h-full rounded-full bg-neutral-600 dark:bg-neutral-400"
										style="width: {getPhasePercent(parsedStats?.assembly_time_ms ?? 0, parsedStats?.wall_time_ms ?? parsedStats?.total_time_ms ?? 1)}%"
									></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else if activeTab === 'steps'}
				<!-- STEP-BY-STEP LOG LIST -->
				<div class="space-y-2.5">
					{#if parsedStats?.steps && parsedStats.steps.length > 0}
						{#each parsedStats.steps as step, idx}
							<div class="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
								<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10 text-xs font-bold font-mono">
									{idx + 1}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-2">
										<span class="text-xs font-bold text-neutral-800 dark:text-neutral-200">{step.step}</span>
										<span class="font-mono text-xs font-semibold text-neutral-500">{formatDuration(step.duration_ms)}</span>
									</div>
									<p class="mt-1 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed font-mono">
										{step.details}
									</p>
								</div>
							</div>
						{/each}
					{:else}
						<div class="py-8 text-center text-xs text-neutral-500">
							No individual step log entries available.
						</div>
					{/if}
				</div>
			{:else if activeTab === 'raw'}
				<!-- RAW JSON CODE VIEWER -->
				<div class="rounded-xl border border-black/10 bg-black/[0.03] p-3.5 dark:border-white/10 dark:bg-black/40 font-mono text-[11px] leading-relaxed">
					<pre class="overflow-x-auto whitespace-pre-wrap select-all text-neutral-800 dark:text-neutral-200">{rawJsonText || 'No raw data available'}</pre>
				</div>
			{/if}
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<div class="flex items-center justify-end w-full">
			<Button variant="primary" size="md" class="w-full sm:w-auto px-6" on:click={() => dispatch('close')}>Close</Button>
		</div>
	</svelte:fragment>
</Modal>
