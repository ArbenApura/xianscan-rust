<script lang="ts">
	// IMPORTED DEP-MODULES
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';

	// -- REQUIRED PROPS -- //

	export let code: string;

	// -- OPTIONAL PROPS -- //

	export let filename: string | undefined = undefined;
	export let language = 'bash';
	let className = '';
	export { className as class };

	// -- STATES -- //

	let copied = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	// -- FUNCTIONS -- //

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy', err);
		}
	}
</script>

<div class={cn('my-5 overflow-hidden rounded-xl border border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-black/40', className)}>
	{#if filename}
		<div class="flex items-center justify-between border-b border-black/10 bg-black/[0.02] px-4 py-2 text-xs font-mono opacity-70 dark:border-white/10 dark:bg-white/[0.02]">
			<span>{filename}</span>
			<span class="uppercase text-[10px] opacity-60">{language}</span>
		</div>
	{/if}

	<div class="relative group">
		<pre class="overflow-x-auto p-4 font-mono text-xs leading-relaxed sm:text-sm"><code>{code}</code></pre>

		<button
			type="button"
			title="Copy to clipboard"
			use:ripple
			on:click={handleCopy}
			class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 bg-white/80 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 dark:border-white/10 dark:bg-[#211c15]/80"
		>
			{#if copied}
				<Check size={14} class="text-[#4f7a64] dark:text-[#83b39a]" />
			{:else}
				<Copy size={14} class="opacity-70" />
			{/if}
		</button>
	</div>
</div>
