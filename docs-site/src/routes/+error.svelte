<script lang="ts">
	// IMPORTED DEP-MODULES
	import { page } from '$app/stores';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import BookOpen from 'lucide-svelte/icons/book-open';

	// IMPORTED MODULES
	import { Button } from '$lib/components/ui';
</script>

<svelte:head>
	<title>Page Not Found (404) - XianScan</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
	<div class="mb-4 rounded-full bg-[#b23a2e]/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#b23a2e] dark:text-[#e08a63]">
		404 Error
	</div>

	<h1 class="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
		Chapter Not Found
	</h1>

	<p class="mt-3 text-sm leading-relaxed opacity-75 sm:text-base">
		The page or documentation article you were looking for does not exist or may have been relocated.
	</p>

	<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
		<Button variant="primary" size="md" href="/">
			<ArrowLeft size={15} />
			<span>Back to Portal</span>
		</Button>
		<Button variant="secondary" size="md" href="/docs/getting-started/quick-start/">
			<BookOpen size={15} />
			<span>Quick Start Guide</span>
		</Button>
	</div>
</div>
