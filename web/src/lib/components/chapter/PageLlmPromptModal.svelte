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
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Tag from 'lucide-svelte/icons/tag';
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

	interface ExtractedTermItem {
		source: string;
		target: string;
		category?: string;
		gender?: string;
		aliases?: string[];
		context?: string;
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
	let parsedNewTerms: ExtractedTermItem[] = [];

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
		parsedNewTerms = [];

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

		// PARSE EXTRACTED TERMS FROM RAW RESPONSE
		if (rawResponseText) {
			try {
				const cleaned = rawResponseText
					.replace(/^```json\s*/i, '')
					.replace(/^```\s*/i, '')
					.replace(/```\s*$/, '')
					.trim();
				const parsedOut = JSON.parse(cleaned);
				if (parsedOut && typeof parsedOut === 'object' && Array.isArray(parsedOut.newTerms)) {
					parsedNewTerms = parsedOut.newTerms.filter(
						(t: any) => t && typeof t === 'object' && t.source && t.target,
					);
				}
			} catch {
				// SAFE FALLBACK IF RAW RESPONSE WAS NOT JSON
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
	title={`LLM Translation Benchmark and History (Page ${page ? page.seq + 1 : ''}, ID ${page?.id ?? ''})`}
	size="3xl"
	bodyClass="p-3 sm:p-5 overflow-hidden flex flex-col h-[88vh] sm:h-[82vh] max-h-[92dvh]"
	on:close={() => dispatch('close')}
>
	{#if page}
		<!-- TOP BENCHMARK METRICS BAR -->
		{#if parsedResponse || page.llmPrompt}
			<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 shrink-0">
				<!-- 1. DURATION & CACHE STATE -->
				<div
					class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class={cn(
							'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
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
							<Database size={16} />
						{:else}
							<Clock size={16} />
						{/if}
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Latency</div>
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
					class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-500/15 text-neutral-700 dark:text-neutral-300"
					>
						<Cpu size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Model</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate" title={parsedResponse?.model || 'Unknown'}>
							{parsedResponse?.model || 'deepseek-v4-flash'}
						</div>
						<div class="text-[9px] text-neutral-500 truncate">Prompt pipeline v22</div>
					</div>
				</div>

				<!-- 3. PROMPT CACHE EFFICIENCY -->
				<div
					class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class={cn(
							'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
							isProviderCache || isSqliteCache
								? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
								: 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400',
						)}
					>
						<Zap size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Cache Hit Rate</div>
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
					class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]"
					>
						<FileCode size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Token Footprint</div>
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
					class="col-span-2 sm:col-span-1 flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
					>
						<Activity size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Throughput</div>
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
					class="mb-3 flex items-center gap-2.5 rounded-xl border border-[#4f7a64]/30 bg-[#4f7a64]/10 p-2.5 text-xs text-[#4f7a64] dark:border-[#83b39a]/30 dark:bg-[#83b39a]/10 dark:text-[#83b39a] shrink-0"
				>
					<Database size={15} class="shrink-0" />
					<span class="font-medium">
						Local SQLite memoization hit. Translation retrieved without external LLM API cost or network latency.
					</span>
				</div>
			{:else if isProviderCache}
				<div
					class="mb-3 flex items-center gap-2.5 rounded-xl border border-[#4f7a64]/30 bg-[#4f7a64]/10 p-2.5 text-xs text-[#4f7a64] dark:border-[#83b39a]/30 dark:bg-[#83b39a]/10 dark:text-[#83b39a] shrink-0"
				>
					<Zap size={15} class="shrink-0" />
					<span class="font-medium">
						Provider prefix cache hit. {cachedTokens.toLocaleString()} prompt tokens ({cacheHitRate}%) matched from
						provider memory, saving input costs and reducing initial latency.
					</span>
				</div>
			{/if}
		{/if}

		<!-- TAB SWITCHER -->
		<div
			class="mb-3 flex items-center justify-between gap-2 border-b border-black/10 pb-2 dark:border-white/10 shrink-0"
		>
			<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs font-semibold">
				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'formatted'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'formatted')}
				>
					<Languages size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Formatted Exchange</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'raw_prompt'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'raw_prompt')}
				>
					<Terminal size={13} />
					<span>Raw Prompt JSON</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'raw_response'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white',
					)}
					on:click={() => (activeTab = 'raw_response')}
				>
					<Code size={13} />
					<span>Raw Response JSON</span>
				</button>
			</div>

			<!-- ACTION BUTTONS FOR CURRENT ACTIVE TAB -->
			<div class="flex items-center gap-1.5">
				{#if activeTab === 'raw_prompt' && page.llmPrompt}
					<Button
						variant="secondary"
						size="sm"
						on:click={() => copyText(page.llmPrompt, 'prompt', 'Full Prompt JSON')}
					>
						{#if copiedKey === 'prompt'}
							<Check size={12} class="mr-1 text-[#4f7a64] dark:text-[#83b39a]" />
							<span>Copied</span>
						{:else}
							<Copy size={12} class="mr-1" />
							<span>Copy Prompt</span>
						{/if}
					</Button>
				{:else if activeTab === 'raw_response' && rawResponseText}
					<Button variant="secondary" size="sm" on:click={() => copyText(rawResponseText, 'response', 'Raw Response')}>
						{#if copiedKey === 'response'}
							<Check size={12} class="mr-1 text-[#4f7a64] dark:text-[#83b39a]" />
							<span>Copied</span>
						{:else}
							<Copy size={12} class="mr-1" />
							<span>Copy Response</span>
						{/if}
					</Button>
				{/if}
			</div>
		</div>

		<!-- CONTENT CONTAINER -->
		<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
			{#if !page.llmPrompt && !page.llmResponse}
				<!-- EMPTY STATE -->
				<div
					class="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-black/15 p-8 text-center text-xs opacity-70 dark:border-white/15"
				>
					<Bot size={32} class="mb-3 text-[#b23a2e] opacity-40 dark:text-[#e08a63]" />
					<p class="font-semibold text-sm">No LLM Exchange Recorded Yet</p>
					<p class="mt-1 max-w-sm text-neutral-500 leading-normal">
						This page has not been translated through the LLM pipeline yet or was processed before prompt logging was
						enabled. Translate this page to record the full conversation.
					</p>
				</div>
			{:else if activeTab === 'formatted'}
				<div class="space-y-3.5">
					<!-- 1. SYSTEM PROMPT SECTION -->
					{#if systemPromptText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
									<Bot size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
									<span>System Instructions (Invariant Profile)</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{systemPromptText}</pre>
						</div>
					{/if}

					<!-- 2. CHAPTER INVARIANT GLOSSARY BLOCK -->
					{#if chapterGlossaryText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-[#a97f28] dark:text-[#d8b15a] flex items-center gap-1.5">
									<BookOpen size={14} />
									<span>Chapter Invariant Glossary (Message 1)</span>
									<span
										class="ml-1 rounded-full bg-[#a97f28]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#a97f28] dark:text-[#d8b15a]"
									>
										{(chapterGlossaryText.match(/^★/gm) || []).length} terms
									</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{chapterGlossaryText}</pre>
						</div>
					{/if}

					<!-- 3. PAGE-SCOPED TRANSIENT GLOSSARY BLOCK -->
					{#if pageGlossaryText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-[#4f7a64] dark:text-[#83b39a] flex items-center gap-1.5">
									<FileCode size={14} />
									<span>Page Transient Glossary Matches</span>
									<span
										class="ml-1 rounded-full bg-[#4f7a64]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#4f7a64] dark:text-[#83b39a]"
									>
										{(pageGlossaryText.match(/^★/gm) || []).length} terms
									</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{pageGlossaryText}</pre>
						</div>
					{/if}

					<!-- 4. SLIDING DIALOGUE CONTEXT SECTION -->
					{#if dialogueContextText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
									<MessageSquare size={14} />
									<span>Sliding Dialogue Context (Previous Pages Window)</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{dialogueContextText}</pre>
						</div>
					{/if}

					<!-- 5. EXTRACTED NEW TERMS DISCOVERED ON THIS PAGE -->
					{#if parsedNewTerms.length > 0}
						<div
							class="rounded-xl border border-[#a97f28]/30 bg-[#a97f28]/5 p-3.5 dark:border-[#d8b15a]/30 dark:bg-[#d8b15a]/5"
						>
							<div class="mb-2.5 flex items-center justify-between">
								<span class="text-xs font-bold text-[#a97f28] dark:text-[#d8b15a] flex items-center gap-1.5">
									<Tag size={14} />
									<span>Discovered New Terms</span>
									<span
										class="ml-1 rounded-full bg-[#a97f28]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#a97f28] dark:text-[#d8b15a]"
									>
										{parsedNewTerms.length} extracted
									</span>
								</span>
								<span class="text-[10px] text-neutral-500">Auto-propagated to subsequent pages</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{#each parsedNewTerms as term}
									<div
										class="flex flex-col gap-1 rounded-lg border border-black/5 bg-white/80 p-2.5 shadow-2xs dark:border-white/5 dark:bg-neutral-800/80"
									>
										<div class="flex items-center justify-between gap-1.5 text-xs">
											<div class="flex items-center gap-1.5 font-semibold">
												<span class="text-neutral-900 dark:text-neutral-100">{term.source}</span>
												<ArrowRight size={12} class="text-neutral-400" />
												<span class="text-[#b23a2e] dark:text-[#e08a63]">{term.target}</span>
											</div>
											{#if term.category}
												<span
													class="rounded bg-black/5 px-1.5 py-0.2 text-[9px] font-medium text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
												>
													{term.category}
												</span>
											{/if}
										</div>
										{#if term.context}
											<div class="text-[10px] text-neutral-500 leading-tight">{term.context}</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- 6. USER REQUEST PAYLOAD SECTION -->
					{#if userPromptText}
						<div
							class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
									<Terminal size={14} class="text-indigo-600 dark:text-indigo-400" />
									<span>User Request and Region Payload</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{userPromptText}</pre>
						</div>
					{/if}

					<!-- 7. MODEL OUTPUT SECTION -->
					{#if rawResponseText}
						<div
							class="rounded-xl border border-black/10 bg-[#4f7a64]/5 p-3.5 dark:border-white/10 dark:bg-[#4f7a64]/10"
						>
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-[#4f7a64] dark:text-[#83b39a] flex items-center gap-1.5">
									<Languages size={14} />
									<span>LLM Raw Translation Output</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white cursor-pointer"
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
								class="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{rawResponseText}</pre>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'raw_prompt'}
				<div
					class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<pre
						class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{page.llmPrompt ||
							'No prompt recorded'}</pre>
				</div>
			{:else if activeTab === 'raw_response'}
				<div
					class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]"
				>
					<pre
						class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{rawResponseText ||
							'No response recorded'}</pre>
				</div>
			{/if}
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2">
			<span class="text-[11px] text-neutral-500 font-mono text-center sm:text-left">
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
