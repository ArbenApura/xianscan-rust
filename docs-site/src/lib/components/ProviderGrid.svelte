<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import Globe from 'lucide-svelte/icons/globe';
	import Server from 'lucide-svelte/icons/server';
	import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';
	import { ripple } from '$lib/actions/ripple';

	interface ProviderItem {
		id: string;
		name: string;
		category: string;
		baseUrl: string;
		isDefault?: boolean;
		isLocal?: boolean;
		tag?: string;
	}

	const PROVIDERS: ProviderItem[] = [
		{
			id: 'deepseek',
			name: 'DeepSeek',
			category: 'Cloud API',
			baseUrl: 'https://api.deepseek.com',
			isDefault: true,
			tag: 'Default Engine',
		},
		{
			id: 'google',
			name: 'Google AI Studio',
			category: 'Cloud API',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
			tag: 'Gemini 3.7',
		},
		{
			id: 'groq',
			name: 'Groq',
			category: 'Cloud API',
			baseUrl: 'https://api.groq.com/openai/v1',
			tag: 'Ultra-Fast LPU',
		},
		{
			id: 'ollama',
			name: 'Ollama',
			category: 'Local Daemon',
			baseUrl: 'http://localhost:11434/v1',
			isLocal: true,
			tag: 'Local & Cloud',
		},
		{
			id: 'lmstudio',
			name: 'LM Studio',
			category: 'Local Daemon',
			baseUrl: 'http://localhost:1234/v1',
			isLocal: true,
			tag: 'GGUF Runtime',
		},
		{
			id: 'openai',
			name: 'OpenAI',
			category: 'Cloud API',
			baseUrl: 'https://api.openai.com/v1',
			tag: 'GPT-5.6 / o3',
		},
		{
			id: 'openrouter',
			name: 'OpenRouter',
			category: 'Universal Gateway',
			baseUrl: 'https://openrouter.ai/api/v1',
			tag: 'Multi-Router',
		},
		{
			id: 'custom',
			name: 'Custom Endpoint',
			category: 'Self-Hosted',
			baseUrl: 'http://localhost:8000/v1',
			isLocal: true,
			tag: 'vLLM / SGLang',
		},
	];

	let copiedId: string | null = null;
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	async function handleCopy(id: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedId = id;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copiedId = null;
			}, 2000);
		} catch {
			// Fallback copy failed
		}
	}
</script>

<div class="my-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
	{#each PROVIDERS as prov}
		{@const isCopied = copiedId === prov.id}
		<div
			class="group relative flex flex-col justify-between rounded-2xl border border-black/10 bg-black/[0.015] p-4 transition-all duration-200 hover:border-black/20 hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.035] shadow-xs"
		>
			<!-- HEADER: LOGO, NAME & BADGE -->
			<div class="flex items-start justify-between gap-2.5">
				<div class="flex items-center gap-2.5 min-w-0">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white shadow-2xs dark:border-white/10 dark:bg-black/40 text-black dark:text-white group-hover:scale-105 transition-transform"
					>
						<ProviderLogo providerId={prov.id} size={18} />
					</div>
					<div class="min-w-0">
						<div class="flex items-center gap-1.5 flex-wrap">
							<h4 class="font-display text-xs sm:text-sm font-bold truncate leading-snug">
								{prov.name}
							</h4>
							{#if prov.isDefault}
								<span
									class="inline-flex items-center rounded-full bg-[#b23a2e]/10 dark:bg-[#e08a63]/15 border border-[#b23a2e]/30 dark:border-[#e08a63]/30 px-2 py-0.2 text-[9.5px] font-bold text-[#b23a2e] dark:text-[#e08a63]"
								>
									DEFAULT
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-1 text-[10.5px] opacity-60 font-medium mt-0.5">
							{#if prov.isLocal}
								<span class="inline-flex items-center gap-0.5 text-teal-600 dark:text-teal-400">
									<Server size={10} /> Local
								</span>
								<span>•</span>
							{/if}
							<span>{prov.category}</span>
						</div>
					</div>
				</div>

				{#if prov.tag}
					<span
						class="inline-flex shrink-0 items-center rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-medium opacity-70 dark:bg-white/5 border border-black/5 dark:border-white/5"
					>
						{prov.tag}
					</span>
				{/if}
			</div>

			<!-- BASE URL CONTAINER -->
			<div class="mt-3.5 space-y-1">
				<div class="flex items-center justify-between text-[10.5px] opacity-60 font-medium">
					<span class="flex items-center gap-1">
						<Globe size={11} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Default Base URL</span>
					</span>
					<button
						type="button"
						on:click={() => handleCopy(prov.id, prov.baseUrl)}
						class="inline-flex items-center gap-1 text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline cursor-pointer transition-opacity"
						use:ripple
						title="Copy endpoint base URL"
					>
						{#if isCopied}
							<Check size={11} class="stroke-[2.5]" />
							<span>Copied!</span>
						{:else}
							<Copy size={11} />
							<span>Copy</span>
						{/if}
					</button>
				</div>

				<div
					class="flex items-center justify-between rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-[11px] font-mono dark:border-white/10 dark:bg-black/30 group-hover:border-black/20 dark:group-hover:border-white/20 transition-colors"
				>
					<span class="truncate select-all text-neutral-800 dark:text-neutral-200">
						{prov.baseUrl}
					</span>
				</div>
			</div>
		</div>
	{/each}
</div>
