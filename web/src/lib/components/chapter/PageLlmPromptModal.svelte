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
	import FileCode from 'lucide-svelte/icons/file-code';
	import Bot from 'lucide-svelte/icons/bot';
	import Languages from 'lucide-svelte/icons/languages';
	import Code from 'lucide-svelte/icons/code';
	import Database from 'lucide-svelte/icons/database';
	import Activity from 'lucide-svelte/icons/activity';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import BookOpen from 'lucide-svelte/icons/book-open';

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
	interface ParsedLlmResponse {
		raw: string;
		model?: string;
		durationMs?: number;
		promptTokens?: number;
		cachedTokens?: number;
		completionTokens?: number;
		timestamp?: number;
		cachedFromSqlite?: boolean;
	}

	interface MessageItem {
		role: string;
		content: string;
	}

	// -- STATES -- //
	let activeTab: 'formatted' | 'raw_prompt' | 'raw_response' = 'formatted';
	let copiedKey: string | null = null;

	// -- REACTIVE STATES -- //
	let parsedResponse: ParsedLlmResponse | null = null;
	let parsedMessages: MessageItem[] = [];
	let systemPromptText = '';
	let chapterGlossaryText = '';
	let pageGlossaryText = '';
	let dialogueContextText = '';
	let userPromptText = '';
	let rawResponseText = '';
	let matchedTermsCount = 0;
	let promptTokens = 0;
	let cachedTokens = 0;
	let completionTokens = 0;
	let totalTokens = 0;
	let netBilledTokens = 0;
	let cacheHitRate = '0.0';
	let isSqliteCache = false;
	let isProviderCache = false;

	// -- REACTIVE STATEMENTS -- //
	$: matchedTermsCount =
		(chapterGlossaryText ? (chapterGlossaryText.match(/^★/gm) || []).length : 0) +
		(pageGlossaryText ? (pageGlossaryText.match(/^★/gm) || []).length : 0);

	$: {
		parsedResponse = null;
		parsedMessages = [];
		systemPromptText = '';
		chapterGlossaryText = '';
		pageGlossaryText = '';
		dialogueContextText = '';
		userPromptText = '';
		rawResponseText = '';

		if (page?.llmResponse) {
			try {
				const parsed = typeof page.llmResponse === 'string' ? JSON.parse(page.llmResponse) : page.llmResponse;
				if (parsed && typeof parsed === 'object' && 'raw' in parsed) {
					parsedResponse = parsed as ParsedLlmResponse;
					rawResponseText = parsed.raw || '';
				} else if (typeof parsed === 'string') {
					rawResponseText = parsed;
				} else {
					rawResponseText = JSON.stringify(parsed, null, 2);
				}
			} catch {
				rawResponseText = String(page.llmResponse);
			}
		}

		promptTokens = parsedResponse?.promptTokens ?? 0;
		cachedTokens = parsedResponse?.cachedTokens ?? 0;
		completionTokens = parsedResponse?.completionTokens ?? 0;
		totalTokens = promptTokens + completionTokens;
		netBilledTokens = Math.max(0, promptTokens - cachedTokens);
		cacheHitRate = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) : '0.0';
		isSqliteCache = Boolean(parsedResponse?.cachedFromSqlite);
		isProviderCache = cachedTokens > 0;

		if (page?.llmPrompt) {
			try {
				const parsed = typeof page.llmPrompt === 'string' ? JSON.parse(page.llmPrompt) : page.llmPrompt;
				if (Array.isArray(parsed)) {
					parsedMessages = parsed;
					for (const msg of parsed) {
						if (msg.role === 'system') {
							if (msg.content.startsWith('Glossary (')) {
								chapterGlossaryText = msg.content;
							} else {
								systemPromptText = msg.content;
							}
						} else if (msg.role === 'user') {
							userPromptText = msg.content;
						}
					}
				}
			} catch {
				parsedMessages = [];
			}
		}

		// EXTRACT DIALOGUE CONTEXT AND TRANSIENT TERMS FROM USER PROMPT IF PRESENT
		if (userPromptText) {
			const ctxMatch = userPromptText.match(
				/\[RECENT DIALOGUE CONTEXT \(Previous Pages\)\][\s\S]*?(?=(?:\n\nGlossary \(|\n\nTranslate the following|\nTranslate the following))/i,
			);
			if (ctxMatch) {
				dialogueContextText = ctxMatch[0].trim();
			}

			const pageTermsMatch = userPromptText.match(
				/Glossary \([^)]+\) - Use these EXACT[\s\S]*?(?=(?:\n\nTranslate the following|\nTranslate the following))/i,
			);
			if (pageTermsMatch) {
				pageGlossaryText = pageTermsMatch[0].trim();
			}
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
		if (ms === undefined || ms === null) return '-';
		if (ms < 1000) return `${ms} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	}

	function computeSpeed(tokens?: number, ms?: number): string {
		if (!tokens || !ms || ms <= 0) return '-';
		const speed = tokens / (ms / 1000);
		return `${speed.toFixed(1)} tok/s`;
	}
</script>

<Modal
	{open}
	title={`LLM Translation Benchmark and History (Page ${page ? page.seq + 1 : ''})`}
	size="3xl"
	bodyClass="p-2.5 sm:p-5 overflow-hidden flex flex-col h-full"
	on:close={() => dispatch('close')}
>
	{#if page}
		<!-- TOP BENCHMARK METRICS BAR (SWIPEABLE ROW ON MOBILE, MULTI-COL GRID ON TABLET/DESKTOP) -->
		{#if parsedResponse || page.llmPrompt}
			<div class="mb-2.5 sm:mb-3 flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 shrink-0 snap-x">
				<!-- 1. DURATION & CACHE STATE -->
				<div
					class="flex min-w-[130px] sm:min-w-0 flex-1 shrink-0 sm:shrink snap-start items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class={cn(
							'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg',
							isSqliteCache
								? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
								: (parsedResponse?.durationMs ?? 0) <= 2000
									? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
									: (parsedResponse?.durationMs ?? 0) <= 5000
										? 'bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]'
										: 'bg-[#b23a2e]/15 text-[#b23a2e] dark:text-[#e08a63]',
						)}
					>
						{#if isSqliteCache}
							<Database size={15} />
						{:else}
							<Clock size={15} />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Latency</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{formatDuration(parsedResponse?.durationMs)}
						</div>
						<div class="text-[9px] text-neutral-500 truncate">
							{#if isSqliteCache}
								SQLite memoized
							{:else if isProviderCache}
								Prefix cache hit
							{:else}
								Direct provider query
							{/if}
						</div>
					</div>
				</div>

				<!-- 2. MODEL & PIPELINE -->
				<div
					class="flex min-w-[130px] sm:min-w-0 flex-1 shrink-0 sm:shrink snap-start items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-500/15 text-neutral-700 dark:text-neutral-300"
					>
						<Cpu size={15} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Model</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate" title={parsedResponse?.model || 'Unknown'}>
							{parsedResponse?.model || 'deepseek-v4-flash'}
						</div>
						<div class="text-[9px] text-neutral-500 truncate">Prompt pipeline v22</div>
					</div>
				</div>

				<!-- 3. PROMPT CACHE EFFICIENCY -->
				<div
					class="flex min-w-[130px] sm:min-w-0 flex-1 shrink-0 sm:shrink snap-start items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class={cn(
							'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg',
							isProviderCache || isSqliteCache
								? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
								: 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400',
						)}
					>
						<Zap size={15} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Cache Hit Rate</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{#if isSqliteCache}
								100% (local)
							{:else}
								{cacheHitRate}%
							{/if}
						</div>
						<div class="text-[9px] text-neutral-500 truncate">
							{#if isSqliteCache}
								Full SQLite cache
							{:else}
								{cachedTokens.toLocaleString()} tok cached
							{/if}
						</div>
					</div>
				</div>

				<!-- 4. TOTAL & BILLED TOKENS -->
				<div
					class="flex min-w-[130px] sm:min-w-0 flex-1 shrink-0 sm:shrink snap-start items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]"
					>
						<FileCode size={15} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Token Footprint</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{totalTokens.toLocaleString()} tok
						</div>
						<div class="text-[9px] text-neutral-500 truncate" title={`Billed: ${netBilledTokens}, Out: ${completionTokens}`}>
							{netBilledTokens} in, {completionTokens} out
						</div>
					</div>
				</div>

				<!-- 5. GENERATION THROUGHPUT -->
				<div
					class="flex min-w-[130px] sm:min-w-0 flex-1 shrink-0 sm:shrink snap-start items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
					>
						<Activity size={15} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Throughput</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{computeSpeed(completionTokens, parsedResponse?.durationMs)}
						</div>
						<div class="text-[9px] text-neutral-500 truncate">Generation speed</div>
					</div>
				</div>
			</div>

			<!-- CACHE STATUS HIGHLIGHT BANNER -->
			{#if isSqliteCache}
				<div
					class="mb-2.5 sm:mb-3 flex items-center gap-2 rounded-xl border border-[#4f7a64]/30 bg-[#4f7a64]/10 p-2 sm:p-2.5 text-[11px] sm:text-xs text-[#4f7a64] dark:border-[#83b39a]/30 dark:bg-[#83b39a]/10 dark:text-[#83b39a] shrink-0"
				>
					<Database size={14} class="shrink-0" />
					<span class="font-medium">
						Local SQLite memoization hit. Translation retrieved without external LLM API cost or network latency.
					</span>
				</div>
			{:else if isProviderCache}
				<div
					class="mb-2.5 sm:mb-3 flex items-center gap-2 rounded-xl border border-[#4f7a64]/30 bg-[#4f7a64]/10 p-2 sm:p-2.5 text-[11px] sm:text-xs text-[#4f7a64] dark:border-[#83b39a]/30 dark:bg-[#83b39a]/10 dark:text-[#83b39a] shrink-0"
				>
					<Zap size={14} class="shrink-0" />
					<span class="font-medium">
						Provider prefix cache hit. {cachedTokens.toLocaleString()} prompt tokens ({cacheHitRate}%) matched from
						provider memory, saving input costs and reducing initial latency.
					</span>
				</div>
			{/if}
		{/if}

		<!-- TAB SWITCHER -->
		<div
			class="mb-2.5 sm:mb-3 flex items-center justify-between gap-2 border-b border-black/10 pb-2 dark:border-white/10 shrink-0"
		>
			<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs font-semibold flex-1 sm:flex-initial">
				<button
					type="button"
					use:ripple
					class={cn(
						'flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs transition-all cursor-pointer whitespace-nowrap',
						activeTab === 'formatted'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'formatted')}
				>
					<Languages size={13} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span class="hidden sm:inline">Formatted Exchange</span>
					<span class="sm:hidden">Exchange</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs transition-all cursor-pointer whitespace-nowrap',
						activeTab === 'raw_prompt'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'raw_prompt')}
				>
					<Terminal size={13} class="shrink-0" />
					<span class="hidden sm:inline">Raw Prompt JSON</span>
					<span class="sm:hidden">Prompt</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs transition-all cursor-pointer whitespace-nowrap',
						activeTab === 'raw_response'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'raw_response')}
				>
					<Code size={13} class="shrink-0" />
					<span class="hidden sm:inline">Raw Response JSON</span>
					<span class="sm:hidden">Response</span>
				</button>
			</div>

			<!-- ACTION BUTTONS FOR CURRENT ACTIVE TAB -->
			<div class="flex items-center gap-1.5">
				{#if activeTab === 'raw_prompt' && page.llmPrompt}
					<Button
						variant="secondary"
						size="sm"
						class="px-2 sm:px-3 text-xs"
						on:click={() => copyText(page.llmPrompt, 'prompt', 'Full Prompt JSON')}
					>
						{#if copiedKey === 'prompt'}
							<Check size={12} class="mr-1 text-[#4f7a64] dark:text-[#83b39a]" />
							<span>Copied</span>
						{:else}
							<Copy size={12} class="mr-1" />
							<span class="hidden sm:inline">Copy Prompt</span>
							<span class="sm:hidden">Copy</span>
						{/if}
					</Button>
				{:else if activeTab === 'raw_response' && rawResponseText}
					<Button
						variant="secondary"
						size="sm"
						class="px-2 sm:px-3 text-xs"
						on:click={() => copyText(rawResponseText, 'response', 'Raw Response')}
					>
						{#if copiedKey === 'response'}
							<Check size={12} class="mr-1 text-[#4f7a64] dark:text-[#83b39a]" />
							<span>Copied</span>
						{:else}
							<Copy size={12} class="mr-1" />
							<span class="hidden sm:inline">Copy Response</span>
							<span class="sm:hidden">Copy</span>
						{/if}
					</Button>
				{/if}
			</div>
		</div>

		<!-- CONTENT CONTAINER -->
		<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5 sm:pr-1">
			{#if !page.llmPrompt && !page.llmResponse}
				<!-- EMPTY STATE -->
				<div
					class="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-black/15 p-6 sm:p-8 text-center text-xs opacity-70 dark:border-white/15"
				>
					<Bot size={32} class="mb-3 text-[#b23a2e] opacity-40 dark:text-[#e08a63]" />
					<p class="font-semibold text-sm">No LLM Exchange Recorded Yet</p>
					<p class="mt-1 max-w-sm text-neutral-500 leading-normal">
						This page has not been translated through the LLM pipeline yet or was processed before prompt logging was
						enabled. Translate this page to record the full conversation.
					</p>
				</div>
			{:else if activeTab === 'formatted'}
				<div class="space-y-2.5 sm:space-y-3.5">
					<!-- 1. SYSTEM PROMPT SECTION -->
					{#if systemPromptText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<Bot size={13} class="shrink-0 text-[#b23a2e] dark:text-[#e08a63]" />
									<span class="text-[11px] sm:text-xs font-bold text-neutral-700 dark:text-neutral-300 truncate">
										System Instructions <span class="hidden sm:inline">(Invariant Profile)</span>
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(systemPromptText, 'system', 'System Prompt')}
								>
									{#if copiedKey === 'system'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-40 sm:max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{systemPromptText}</pre>
						</div>
					{/if}

					<!-- 2. CHAPTER INVARIANT GLOSSARY BLOCK -->
					{#if chapterGlossaryText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<BookOpen size={13} class="shrink-0 text-[#a97f28] dark:text-[#d8b15a]" />
									<span class="text-[11px] sm:text-xs font-bold text-[#a97f28] dark:text-[#d8b15a] truncate">
										Chapter Invariant Glossary <span class="hidden sm:inline">(Message 1)</span>
									</span>
									<span
										class="rounded-full bg-[#a97f28]/15 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-[#a97f28] dark:text-[#d8b15a] whitespace-nowrap shrink-0"
									>
										{(chapterGlossaryText.match(/^★/gm) || []).length} terms
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(chapterGlossaryText, 'ch_glossary', 'Chapter Glossary')}
								>
									{#if copiedKey === 'ch_glossary'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-36 sm:max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{chapterGlossaryText}</pre>
						</div>
					{/if}

					<!-- 3. PAGE-SCOPED TRANSIENT GLOSSARY BLOCK -->
					{#if pageGlossaryText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<FileCode size={13} class="shrink-0 text-[#4f7a64] dark:text-[#83b39a]" />
									<span class="text-[11px] sm:text-xs font-bold text-[#4f7a64] dark:text-[#83b39a] truncate">
										Page Transient Glossary Matches
									</span>
									<span
										class="rounded-full bg-[#4f7a64]/15 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-[#4f7a64] dark:text-[#83b39a] whitespace-nowrap shrink-0"
									>
										{(pageGlossaryText.match(/^★/gm) || []).length} terms
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(pageGlossaryText, 'page_glossary', 'Page Glossary')}
								>
									{#if copiedKey === 'page_glossary'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-36 sm:max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{pageGlossaryText}</pre>
						</div>
					{/if}

					<!-- 4. SLIDING DIALOGUE CONTEXT SECTION -->
					{#if dialogueContextText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<MessageSquare size={13} class="shrink-0 text-indigo-600 dark:text-indigo-400" />
									<span class="text-[11px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate">
										Sliding Dialogue Context <span class="hidden sm:inline">(Previous Pages Window)</span>
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(dialogueContextText, 'dialogue_ctx', 'Dialogue Context')}
								>
									{#if copiedKey === 'dialogue_ctx'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-36 sm:max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{dialogueContextText}</pre>
						</div>
					{/if}

					<!-- 5. USER REQUEST PAYLOAD SECTION -->
					{#if userPromptText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<Terminal size={13} class="shrink-0 text-indigo-600 dark:text-indigo-400" />
									<span class="text-[11px] sm:text-xs font-bold text-neutral-700 dark:text-neutral-300 truncate">
										User Request and Region Payload
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(userPromptText, 'user', 'User Prompt')}
								>
									{#if copiedKey === 'user'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-48 sm:max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{userPromptText}</pre>
						</div>
					{/if}

					<!-- 6. MODEL OUTPUT SECTION -->
					{#if rawResponseText}
						<div
							class="rounded-xl border border-black/10 bg-[#4f7a64]/5 p-2.5 sm:p-3.5 dark:border-white/10 dark:bg-[#4f7a64]/10"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<Languages size={13} class="shrink-0 text-[#4f7a64] dark:text-[#83b39a]" />
									<span class="text-[11px] sm:text-xs font-bold text-[#4f7a64] dark:text-[#83b39a] truncate">
										LLM Raw Translation Output
									</span>
								</div>
								<button
									type="button"
									use:ripple
									class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
									on:click={() => copyText(rawResponseText, 'model_out', 'Translation Output')}
								>
									{#if copiedKey === 'model_out'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							</div>
							<pre
								class="max-h-52 sm:max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 sm:p-2.5 font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{rawResponseText}</pre>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'raw_prompt'}
				<div
					class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<pre
						class="whitespace-pre-wrap font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{page.llmPrompt ||
							'No prompt recorded'}</pre>
				</div>
			{:else if activeTab === 'raw_response'}
				<div
					class="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<pre
						class="whitespace-pre-wrap font-mono text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{rawResponseText ||
							'No response recorded'}</pre>
				</div>
			{/if}
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2">
			<span class="text-[10px] sm:text-[11px] text-neutral-500 font-mono text-center sm:text-left">
				{#if parsedResponse?.timestamp}
					Recorded {new Date(parsedResponse.timestamp).toLocaleTimeString()}
				{/if}
			</span>
			<Button variant="primary" size="md" class="w-full sm:w-auto px-6" on:click={() => dispatch('close')}>
				Close
			</Button>
		</div>
	</svelte:fragment>
</Modal>
