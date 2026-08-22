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
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Code from 'lucide-svelte/icons/code';

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
	let glossaryText = '';
	let userPromptText = '';
	let rawResponseText = '';
	let matchedTermsCount = 0;

	// -- REACTIVE STATEMENTS -- //
	$: matchedTermsCount = glossaryText ? (glossaryText.match(/^★/gm) || []).length : 0;
	$: {
		parsedResponse = null;
		parsedMessages = [];
		systemPromptText = '';
		glossaryText = '';
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

		if (page?.llmPrompt) {
			try {
				const parsed = typeof page.llmPrompt === 'string' ? JSON.parse(page.llmPrompt) : page.llmPrompt;
				if (Array.isArray(parsed)) {
					parsedMessages = parsed;
					for (const msg of parsed) {
						if (msg.role === 'system') {
							if (msg.content.startsWith('Glossary (')) {
								glossaryText = msg.content;
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
		if (ms === undefined || ms === null) return '—';
		if (ms < 1000) return `${ms} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	}

	function computeSpeed(tokens?: number, ms?: number): string {
		if (!tokens || !ms || ms <= 0) return '—';
		const speed = tokens / (ms / 1000);
		return `${speed.toFixed(1)} tok/s`;
	}
</script>

<Modal
	{open}
	title={`LLM Translation Benchmark & History — Page ${page ? page.seq + 1 : ''} (ID: ${page?.id ?? ''})`}
	size="3xl"
	bodyClass="p-3 sm:p-5 overflow-hidden flex flex-col h-[88vh] sm:h-[82vh] max-h-[92dvh]"
	on:close={() => dispatch('close')}
>
	{#if page}
		<!-- TOP BENCHMARK METRICS BAR -->
		{#if parsedResponse || page.llmPrompt}
			<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
				<!-- 1. DURATION -->
				<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
					<div
						class={cn(
							'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
							(parsedResponse?.durationMs ?? 0) <= 2000
								? 'bg-[#4f7a64]/15 text-[#4f7a64] dark:text-[#83b39a]'
								: (parsedResponse?.durationMs ?? 0) <= 5000
									? 'bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]'
									: 'bg-[#b23a2e]/15 text-[#b23a2e] dark:text-[#e08a63]'
						)}
					>
						<Clock size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Latency</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{formatDuration(parsedResponse?.durationMs)}
						</div>
					</div>
				</div>

				<!-- 2. MODEL -->
				<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-500/15 text-neutral-700 dark:text-neutral-300">
						<Cpu size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Model</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate" title={parsedResponse?.model || 'Unknown'}>
							{parsedResponse?.model || 'deepseek-v4-flash'}
						</div>
					</div>
				</div>

				<!-- 3. TOKEN USAGE & SPEED -->
				<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
						<Zap size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Throughput</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{computeSpeed(parsedResponse?.completionTokens, parsedResponse?.durationMs)}
						</div>
					</div>
				</div>

				<!-- 4. TOTAL TOKENS -->
				<div class="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#a97f28]/15 text-[#a97f28] dark:text-[#d8b15a]">
						<Cpu size={16} />
					</div>
					<div class="min-w-0">
						<div class="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Total Tokens</div>
						<div class="text-xs sm:text-sm font-bold font-mono truncate">
							{(parsedResponse?.promptTokens ?? 0) + (parsedResponse?.completionTokens ?? 0)} tok
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- TAB SWITCHER -->
		<div class="mb-3 flex items-center justify-between gap-2 border-b border-black/10 pb-2 dark:border-white/10 shrink-0">
			<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs font-semibold">
				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'formatted'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
					)}
					on:click={() => (activeTab = 'formatted')}
				>
					<Sparkles size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Formatted Exchange</span>
				</button>

				<button
					type="button"
					use:ripple
					class={cn(
						'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer',
						activeTab === 'raw_prompt'
							? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
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
							: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
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
					<Button
						variant="secondary"
						size="sm"
						on:click={() => copyText(rawResponseText, 'response', 'Raw Response')}
					>
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
				<div class="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-black/15 p-8 text-center text-xs opacity-70 dark:border-white/15">
					<Bot size={32} class="mb-3 text-[#b23a2e] opacity-40 dark:text-[#e08a63]" />
					<p class="font-semibold text-sm">No LLM Exchange Recorded Yet</p>
					<p class="mt-1 max-w-sm text-neutral-500 leading-normal">
						This page has not been translated through the LLM pipeline yet or was processed before prompt logging was enabled. Translate this page to record the full conversation.
					</p>
				</div>
			{:else if activeTab === 'formatted'}
				<div class="space-y-3.5">
					<!-- 1. SYSTEM PROMPT SECTION -->
					{#if systemPromptText}
						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
									<Bot size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
									<span>System Instructions</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
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
							<pre class="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{systemPromptText}</pre>
						</div>
					{/if}

					<!-- 2. PAGE-SCOPED GLOSSARY BLOCK -->
					<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
						<div class="mb-2 flex items-center justify-between">
							<span class="text-xs font-bold text-[#a97f28] dark:text-[#d8b15a] flex items-center gap-1.5">
								<FileCode size={14} />
								<span>Page-Scoped Glossary Injected</span>
								<span class="ml-1 rounded-full bg-[#a97f28]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#a97f28] dark:text-[#d8b15a]">
									{matchedTermsCount} {matchedTermsCount === 1 ? 'term' : 'terms'}
								</span>
							</span>
							{#if glossaryText}
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
									on:click={() => copyText(glossaryText, 'glossary', 'Glossary Block')}
								>
									{#if copiedKey === 'glossary'}
										<Check size={11} class="text-[#4f7a64] dark:text-[#83b39a]" />
									{:else}
										<Copy size={11} />
									{/if}
									<span>Copy</span>
								</button>
							{/if}
						</div>
						{#if glossaryText}
							<pre class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{glossaryText}</pre>
						{:else}
							<div class="rounded-lg bg-black/[0.03] p-2.5 text-xs text-neutral-500 italic dark:bg-white/[0.03]">
								No glossary terms matched this page's OCR text.
							</div>
						{/if}
					</div>

					<!-- 3. USER PAYLOAD SECTION -->
					{#if userPromptText}
						<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
									<Terminal size={14} class="text-indigo-600 dark:text-indigo-400" />
									<span>User Request & Region Texts</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
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
							<pre class="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{userPromptText}</pre>
						</div>
					{/if}

					<!-- 4. MODEL OUTPUT SECTION -->
					{#if rawResponseText}
						<div class="rounded-xl border border-black/10 bg-[#4f7a64]/5 p-3.5 dark:border-white/10 dark:bg-[#4f7a64]/10">
							<div class="mb-2 flex items-center justify-between">
								<span class="text-xs font-bold text-[#4f7a64] dark:text-[#83b39a] flex items-center gap-1.5">
									<Sparkles size={14} />
									<span>LLM Translation Output</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white"
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
							<pre class="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-black/40 dark:text-neutral-200">{rawResponseText}</pre>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'raw_prompt'}
				<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<pre class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{page.llmPrompt || 'No prompt recorded'}</pre>
				</div>
			{:else if activeTab === 'raw_response'}
				<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<pre class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200 select-all">{rawResponseText || 'No response recorded'}</pre>
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
			<Button variant="primary" size="md" class="w-full sm:w-auto px-6" on:click={() => dispatch('close')}>Close</Button>
		</div>
	</svelte:fragment>
</Modal>
