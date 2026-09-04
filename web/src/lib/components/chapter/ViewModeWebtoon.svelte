<!-- WEBTOON VIEW MODE - CONTINUOUS VERTICAL STREAM WITH ACTION OVERLAYS AND RE-TRANSLATION -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	import { Badge } from '$lib/components/ui';
	// IMPORTED ICONS
	import Eye from 'lucide-svelte/icons/eye';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';

	// IMPORTED COMPONENTS
	import PageImage from '$lib/components/chapter/PageImage.svelte';

	// -- REQUIRED PROPS -- //
	export let pages: any[] = [];

	// -- OPTIONAL PROPS -- //
	export let webtoonKind: 'output' | 'original' = 'output';
	export let webtoonWidth: 'sm' | 'md' | 'lg' = 'md';

	// -- EVENTS -- //
	const dispatch = createEventDispatcher<{
		inspect: any;
		translate: any;
	}>();

	// -- CONSTANTS -- //
	const widthClasses = {
		sm: 'max-w-lg',
		md: 'max-w-2xl',
		lg: 'max-w-4xl',
	};

	const stepBadgeLabels: Record<string, string> = {
		preprocess: 'Cleaning...',
		analyze: 'Detect & OCR...',
		persist_regions: 'Saving...',
		term_extract: 'Extracting...',
		match_glossary: 'Glossary...',
		translate: 'Translating...',
		persist_translations: 'Saving...',
		clean: 'Inpainting...',
		typeset: 'Typesetting...',
		save_output: 'Saving...',
	};
</script>

<div class="-mx-4 flex w-[calc(100%+2rem)] flex-col items-center sm:mx-0 sm:w-full">
	<div
		class={cn('w-full flex flex-col items-center bg-black shadow-2xl transition-all duration-300', widthClasses[webtoonWidth])}
	>
		{#each pages as page (page.id)}
			{@const hasRatio = Boolean(page.width && page.height && page.height > 0)}
			{@const isError = page.status === 'error' || Boolean(page.error)}
			{@const isProcessing = page.status === 'processing'}
			<!-- DYNAMIC RUNTIME ASPECT RATIO EXCEPTION -->
			<div
				class="group relative m-0 w-full border-0 bg-black p-0 leading-none"
				data-page-seq={page.seq}
				data-page-id={page.id}
				style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : 'min-height: 400px;'}
			>
				<!-- FLOATING ACTION PILL OVERLAY (SHOWN DURING ACTIVE PROCESSING) -->
				{#if isProcessing}
					<div
						class="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-xs text-white backdrop-blur-md border border-white/15 shadow-md"
					>
						<span class="font-bold font-mono text-[11px] opacity-80">
							p. {page.seq + 1}
						</span>

						<Badge variant="amber" class="text-[10px] py-0 px-1.5">
							{page.currentStep ? stepBadgeLabels[page.currentStep] || 'Processing...' : 'Processing...'}
						</Badge>
					</div>
				{/if}

				<!-- INLINE ERROR RETRY BANNER -->
				{#if isError}
					<div
						class="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-black/85 px-3 py-2 text-xs text-red-300 shadow-xl backdrop-blur-md"
					>
						<div class="flex items-center gap-2 min-w-0">
							<AlertTriangle size={15} class="shrink-0 text-red-400" />
							<span class="truncate font-mono text-[11px]">{page.error || 'Translation failed on this page'}</span>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors cursor-pointer"
								use:ripple
								title="Inspect Page Details"
								on:click={() => dispatch('inspect', page)}
							>
								<Eye size={11} />
								<span>Inspect</span>
							</button>
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-lg bg-[#b23a2e] hover:bg-[#962f25] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors cursor-pointer shrink-0"
								use:ripple
								on:click={() => dispatch('translate', page)}
							>
								<RotateCcw size={11} />
								<span>Retry</span>
							</button>
						</div>
					</div>
				{/if}

				<PageImage
					src={`/api/pages/${page.id}/file?kind=${webtoonKind === 'output' && page.outputPath ? 'output' : 'original'}&rev=${webtoonKind === 'output' && page.outputPath ? (page.outputRev ?? 0) : (page.originalRev ?? 0)}`}
					alt={`Page ${page.seq + 1}`}
					imgClass="pointer-events-none object-contain w-full h-full"
				/>
			</div>
		{/each}
	</div>
</div>


