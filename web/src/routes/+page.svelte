<script lang="ts">
	// IMPORTED ENVS & LIFECYCLE
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	// IMPORTED ICONS
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Languages from 'lucide-svelte/icons/languages';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	// IMPORTED UI COMPONENTS
	import { Button, InkDivider, Seal } from '$lib/components/ui';

	// -- REDIRECT COUNTDOWN STATE -- //
	let countdown = 5;
	let cancelled = false;
	let interval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		interval = setInterval(() => {
			if (cancelled) return;
			countdown -= 1;
			if (countdown <= 0) {
				if (interval) clearInterval(interval);
				goto('/app/');
			}
		}, 1000);

		return () => {
			if (interval) clearInterval(interval);
		};
	});

	function cancelRedirect() {
		cancelled = true;
		if (interval) clearInterval(interval);
	}
</script>

<svelte:head>
	<title>Xianscan — AI Comic & Manhua Translation</title>
</svelte:head>

<div class="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
	<!-- BACKGROUND GLOW EFFECTS -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div class="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#b23a2e]/10 blur-3xl"></div>
		<div class="absolute right-1/4 bottom-1/4 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl"></div>
	</div>

	<!-- HERO BRAND SEAL & BADGE -->
	<div class="relative z-10 mb-6 flex flex-col items-center gap-3">
		<Seal char="仙" size={36} class="shadow-md shadow-[#b23a2e]/20" />
		<div class="inline-flex items-center gap-2 rounded-full border border-[#b23a2e]/20 bg-[#b23a2e]/10 px-3.5 py-1.5 text-xs font-semibold text-[#b23a2e] dark:text-[#e08a63]">
			<Sparkles size={14} />
			<span>Self-hosted Comic & Manhua Translation Pipeline</span>
		</div>
	</div>

	<!-- MAIN TITLE -->
	<h1 class="relative z-10 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
		Xian<span class="bg-gradient-to-r from-[#b23a2e] to-amber-600 bg-clip-text text-transparent dark:from-[#e08a63] dark:to-amber-400">scan</span>
	</h1>

	<!-- SUBTITLE -->
	<p class="relative z-10 mt-4 max-w-xl text-base opacity-70 sm:text-lg leading-relaxed">
		End-to-end comic translation: text detection, OCR, AI translation with custom glossaries, LaMa text erasing, and Skia typesetting.
	</p>

	<!-- INK DIVIDER -->
	<InkDivider class="my-6 max-w-xs mx-auto" />

	<!-- CTA BUTTONS -->
	<div class="relative z-10 flex flex-wrap items-center justify-center gap-4">
		<Button href="/app/" variant="primary" size="md" class="px-6 py-3 text-base shadow-lg shadow-[#b23a2e]/20">
			Launch Library <ArrowRight size={18} class="ml-1" />
		</Button>
		<Button href="/app/glossary/" variant="secondary" size="md" class="px-6 py-3 text-base">
			Manage Glossary
		</Button>
	</div>

	<!-- FEATURE HIGHLIGHTS -->
	<div class="relative z-10 mt-12 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 text-left">
		<div class="rounded-xl border border-black/[0.07] bg-black/[0.02] p-5 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.02]">
			<div class="mb-3 inline-flex rounded-lg bg-[#b23a2e]/10 p-2.5 text-[#b23a2e] dark:text-[#e08a63]">
				<Cpu size={20} />
			</div>
			<h2 class="font-semibold">Local ML Sidecar</h2>
			<p class="mt-1 text-xs opacity-60 leading-relaxed">ONNX comic-text-detector + RapidOCR + LaMa inpainting running locally on CPU/GPU.</p>
		</div>

		<div class="rounded-xl border border-black/[0.07] bg-black/[0.02] p-5 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.02]">
			<div class="mb-3 inline-flex rounded-lg bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
				<Languages size={20} />
			</div>
			<h2 class="font-semibold">AI & Glossary</h2>
			<p class="mt-1 text-xs opacity-60 leading-relaxed">High-accuracy LLM translation with Aho-Corasick glossary term injection & caching.</p>
		</div>

		<div class="rounded-xl border border-black/[0.07] bg-black/[0.02] p-5 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.02]">
			<div class="mb-3 inline-flex rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
				<BookOpen size={20} />
			</div>
			<h2 class="font-semibold">Typesetting & Zip Export</h2>
			<p class="mt-1 text-xs opacity-60 leading-relaxed">Canvas rendering with OFL fonts, webtoon continuous reader, and chapter zip export.</p>
		</div>
	</div>

	<!-- REDIRECT COUNTDOWN -->
	<div class="relative z-10 mt-10 text-xs opacity-60">
		{#if !cancelled && countdown > 0}
			<span>Redirecting to library in <strong class="font-mono text-[#b23a2e] dark:text-[#e08a63]">{countdown}s</strong>... </span>
			<button type="button" class="underline ml-1 hover:opacity-100 text-[#b23a2e] dark:text-[#e08a63]" on:click={cancelRedirect}>
				Cancel
			</button>
			<span class="mx-1">•</span>
		{:else if cancelled}
			<span class="text-amber-600 dark:text-amber-400">Automatic redirect paused. </span>
		{/if}
		<a href="/app/" class="underline hover:text-[#b23a2e]">Click here to enter</a>
	</div>
</div>
