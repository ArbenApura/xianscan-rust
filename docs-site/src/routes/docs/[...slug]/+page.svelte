<script lang="ts">
	// IMPORTED DEP-MODULES
	import { page } from '$app/stores';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Github from 'lucide-svelte/icons/github';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	// IMPORTED MODULES
	import { DOC_NAVIGATION } from '$lib/docs-nav';
	import { DOCS_CONTENT } from '$lib/docs-content';
	import { BENCHMARK_GALLERIES } from '$lib/benchmarks';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { Button, Badge, Card, Callout, InkDivider, ComparisonSlider, SegmentedControl } from '$lib/components/ui';
	import ProviderGrid from '$lib/components/ProviderGrid.svelte';

	// -- FUNCTIONS -- //

	function normalizeSlug(path: string | undefined): string {
		if (!path) return '';
		return path
			.trim()
			.replace(/^\/+/, '')
			.replace(/\/+$/, '')
			.replace(/^docs\//, '');
	}

	// -- STATES -- //
	let sampleModes: Record<number, 'translated' | 'cleaned'> = {};

	// -- REACTIVE STATES -- //

	$: rawSlug = $page.params.slug || $page.url.pathname;
	$: normalizedSlug = normalizeSlug(rawSlug);
	$: currentHref = '/docs/' + normalizedSlug + '/';
	$: allDocs = DOC_NAVIGATION.flatMap((s) => s.items);
	$: currentIdx = allDocs.findIndex((i) => normalizeSlug(i.href) === normalizedSlug || i.id === normalizedSlug || normalizeSlug(i.href).endsWith(normalizedSlug));
	$: currentDoc = currentIdx !== -1 ? allDocs[currentIdx] : undefined;
	$: prevDoc = currentIdx > 0 ? allDocs[currentIdx - 1] : undefined;
	$: nextDoc = currentIdx !== -1 && currentIdx < allDocs.length - 1 ? allDocs[currentIdx + 1] : undefined;
	$: currentSection = DOC_NAVIGATION.find((s) => s.items.some((i) => normalizeSlug(i.href) === normalizedSlug || i.id === normalizedSlug || normalizeSlug(i.href).endsWith(normalizedSlug)));
	$: benchmarkData = BENCHMARK_GALLERIES[normalizedSlug] || Object.entries(BENCHMARK_GALLERIES).find(([k]) => normalizeSlug(k) === normalizedSlug || normalizedSlug.endsWith(normalizeSlug(k)))?.[1];
	$: chapterData = DOCS_CONTENT[normalizedSlug] || Object.entries(DOCS_CONTENT).find(([k]) => normalizeSlug(k) === normalizedSlug || normalizeSlug(k).endsWith(normalizedSlug) || normalizedSlug.endsWith(normalizeSlug(k)))?.[1];

	// RESET TO 'translated' BY DEFAULT WHENEVER BENCHMARK DATA OR SLUG CHANGES
	$: if (benchmarkData) {
		const initialModes: Record<number, 'translated' | 'cleaned'> = {};
		benchmarkData.samples.forEach((_, idx) => {
			initialModes[idx] = sampleModes[idx] ?? 'translated';
		});
		sampleModes = initialModes;
	}

	$: pageTitle = (chapterData?.title ?? benchmarkData?.title ?? currentDoc?.title ?? 'Documentation') + ' - XianScan Docs';
	$: pageDesc = chapterData?.description ?? benchmarkData?.desc ?? `Documentation guide for ${currentDoc?.title ?? 'XianScan'}.`;
	$: canonicalUrl = `https://xianscan.arbenger.com/docs/${normalizedSlug}/`;
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDesc} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={canonicalUrl} />

	<!-- OPEN GRAPH -->
	<meta property="og:type" content="article" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDesc} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:site_name" content="XianScan Documentation" />
	<meta property="og:image" content="https://xianscan.arbenger.com/og-image.png" />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={pageTitle} />

	<!-- TWITTER CARDS -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDesc} />
	<meta name="twitter:image" content="https://xianscan.arbenger.com/og-image.png" />
	<meta name="twitter:image:alt" content={pageTitle} />

	<!-- STRUCTURED DATA (JSON-LD) -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "TechArticle",
				"headline": ${JSON.stringify(pageTitle)},
				"description": ${JSON.stringify(pageDesc)},
				"url": ${JSON.stringify(canonicalUrl)},
				"mainEntityOfPage": {
					"@type": "WebPage",
					"@id": ${JSON.stringify(canonicalUrl)}
				},
				"inLanguage": "en",
				"datePublished": "2026-09-01T00:00:00+08:00",
				"dateModified": ${JSON.stringify((chapterData?.lastUpdated ?? '2026-09-02') + 'T00:00:00+08:00')},
				"image": "https://xianscan.arbenger.com/og-image.png",
				"author": {
					"@type": "Person",
					"name": "Arben Apura"
				},
				"publisher": {
					"@type": "Organization",
					"name": "XianScan",
					"url": "https://xianscan.arbenger.com/",
					"logo": {
						"@type": "ImageObject",
						"url": "https://xianscan.arbenger.com/icon-512.png",
						"width": 512,
						"height": 512
					}
				}
			},
			{
				"@type": "BreadcrumbList",
				"itemListElement": [
					{
						"@type": "ListItem",
						"position": 1,
						"name": "Home",
						"item": "https://xianscan.arbenger.com/"
					},
					{
						"@type": "ListItem",
						"position": 2,
						"name": ${JSON.stringify(currentSection?.title ?? 'Documentation')},
						"item": ${JSON.stringify(canonicalUrl)}
					},
					{
						"@type": "ListItem",
						"position": 3,
						"name": ${JSON.stringify(chapterData?.title ?? benchmarkData?.title ?? currentDoc?.title ?? 'Guide')},
						"item": ${JSON.stringify(canonicalUrl)}
					}
				]
			}
		]
	}
	</script>`}
</svelte:head>

<article class="prose max-w-3xl w-full min-w-0 dark:prose-invert">
	<!-- BREADCRUMB -->
	<div class="mb-4 flex flex-wrap items-center gap-2 text-xs opacity-60">
		<a href="/" class="hover:underline">Docs</a>
		<span>/</span>
		<span>{currentSection?.title ?? 'Documentation'}</span>
		<span>/</span>
		<span class="text-[#b23a2e] dark:text-[#e08a63] font-medium">{chapterData?.title ?? benchmarkData?.title ?? currentDoc?.title ?? 'Chapter'}</span>
	</div>

	<!-- TITLE -->
	<div class="mb-8">
		<h1 id="overview" class="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
			{chapterData?.title ?? benchmarkData?.title ?? currentDoc?.title ?? 'Documentation Chapter'}
		</h1>
		<p class="mt-2 text-sm opacity-75 sm:text-base leading-relaxed">
			{chapterData?.description ?? benchmarkData?.desc ?? `Part of the ${currentSection?.title ?? 'Documentation'} section of XianScan documentation.`}
		</p>
	</div>

	<!-- DEDICATED BENCHMARK INTERACTIVE GALLERIES -->
	{#if benchmarkData}
		<div class="space-y-10">
			{#each benchmarkData.samples as sample, idx}
				{@const currentMode = sampleModes[idx] ?? 'translated'}
				<div class="rounded-2xl border border-black/10 bg-black/[0.015] p-4 sm:p-6 dark:border-white/10 dark:bg-white/[0.015] shadow-xs">
					<div class="mb-4 space-y-3 pb-3 border-b border-black/10 dark:border-white/10 text-center">
						<h3 class="font-display text-sm sm:text-base font-bold truncate max-w-full">
							Sample {idx + 1}: {sample.name}
						</h3>
						<div class="flex justify-center">
							<SegmentedControl
								options={[
									{ value: 'translated', label: 'Translated' },
									{ value: 'cleaned', label: 'Inpaint' }
								]}
								bind:value={sampleModes[idx]}
							/>
						</div>
					</div>

					<div class="flex justify-center py-2">
						<ComparisonSlider
							beforeSrc={sample.raw}
							afterSrc={currentMode === 'translated' ? sample.translated : sample.cleaned}
							beforeLabel="RAW"
							afterLabel={currentMode === 'translated' ? 'TRANSLATED' : 'INPAINT ONLY'}
							lazy={idx > 0}
						/>
					</div>
				</div>
			{/each}
		</div>
	{:else if chapterData}
		<!-- PRE-CONTENT NOTICE -->
		<div class="mb-8">
			<Callout variant="note" title="Preview Content">
				Please note that the details on this page are pre-content drafts. More detailed technical specifications, architectural breakdowns, and updated guides will be added soon.
			</Callout>
		</div>

		<!-- AUTHORED CHAPTER CONTENT SECTIONS -->
		<div class="space-y-10">
			{#each chapterData.sections as section}
				<section id={section.id} class="space-y-3">
					<h2 class="font-display text-lg sm:text-2xl font-bold tracking-tight border-b border-black/10 dark:border-white/10 pb-2">
						{section.title}
					</h2>
					<div class="leading-relaxed text-sm">
						{@html renderMarkdown(section.content)}
					</div>
					{#if section.id === 'providers-overview'}
						<ProviderGrid />
					{/if}
				</section>
			{/each}
		</div>
	{:else}
		<!-- STANDARD CHAPTER PLACEHOLDER -->
		<Callout variant="note" title="Section Under Active Writing">
			This documentation chapter is currently being compiled for the <code>v0.5.0-beta.6</code> release. In the meantime, you can explore the codebase or discuss technical details in the Discord community.
		</Callout>

		<div class="my-8">
			<InkDivider />
		</div>

		<section id="scope" class="space-y-4">
			<h2 class="font-display text-xl font-bold tracking-tight">
				What Will Be Covered Here
			</h2>
			<p class="text-xs leading-relaxed opacity-75 sm:text-sm">
				Comprehensive documentation for this module including technical architectures, parameter configurations, and usage workflows will be published shortly.
			</p>
			<div class="flex flex-wrap gap-3 pt-2">
				<Button
					variant="primary"
					size="sm"
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
				>
					<Github size={15} />
					<span>View Code on GitHub</span>
				</Button>
				<Button
					variant="secondary"
					size="sm"
					href="https://discord.gg/dRWaQftNnR"
					target="_blank"
					rel="noreferrer"
				>
					<MessageSquare size={15} />
					<span>Discuss on Discord</span>
				</Button>
			</div>
		</section>
	{/if}

	<!-- BOTTOM PREV/NEXT NAVIGATION CARDS -->
	<div class="mt-14 pt-6 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
		{#if prevDoc}
			<a
				href={prevDoc.href}
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-2.5 text-xs font-bold hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/5 transition-all"
			>
				<ArrowLeft size={14} />
				<span>Previous: {prevDoc.title}</span>
			</a>
		{:else}
			<a
				href="/"
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-2.5 text-xs font-bold hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/5 transition-all"
			>
				<ArrowLeft size={14} />
				<span>Back to Home</span>
			</a>
		{/if}

		{#if nextDoc}
			<a
				href={nextDoc.href}
				class="inline-flex items-center justify-end gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-2.5 text-xs font-bold text-[#b23a2e] hover:bg-[#b23a2e]/5 dark:text-[#e08a63] dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-[#e08a63]/5 transition-all ml-auto"
			>
				<span>Next: {nextDoc.title}</span>
				<ArrowRight size={14} />
			</a>
		{/if}
	</div>
</article>