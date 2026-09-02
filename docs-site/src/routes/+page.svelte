<script lang="ts">
	// IMPORTED DEP-MODULES
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Languages from 'lucide-svelte/icons/languages';
	import Smartphone from 'lucide-svelte/icons/smartphone';
	import Globe from 'lucide-svelte/icons/globe';
	import Terminal from 'lucide-svelte/icons/terminal';
	import Github from 'lucide-svelte/icons/github';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Check from 'lucide-svelte/icons/check';
	import Copy from 'lucide-svelte/icons/copy';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Layers from 'lucide-svelte/icons/layers';
	import Scan from 'lucide-svelte/icons/scan';
	import FileText from 'lucide-svelte/icons/file-text';
	import Paintbrush from 'lucide-svelte/icons/paintbrush';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';

	// IMPORTED MODULES
	import { Button, Badge, Card, InkDivider, ComparisonSlider, SegmentedControl, DiscordIcon, type SegmentOption } from '$lib/components/ui';

	// -- STATES -- //

	let copied = false;
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;
	let activeBenchmark = 'manhua';
	let comparisonMode: 'translated' | 'cleaned' = 'translated';

	// -- CONSTANTS -- //

	const BENCHMARKS = [
		{
			id: 'manhua',
			title: 'Chinese Manhua',
			work: '《妖神记》 Tales of Demons and Gods',
			raw: '/showcase/manhua_raw.jpg',
			cleaned: '/showcase/manhua_cleaned.jpg',
			translated: '/showcase/manhua_translated.jpg',
			href: '/docs/benchmarks/manhua',
		},
		{
			id: 'manhwa',
			title: 'Korean Manhwa',
			work: '《역대급 영지 설계사》 The Greatest Estate Developer',
			raw: '/showcase/manhwa_estatedeveloper_raw.webp',
			cleaned: '/showcase/manhwa_estatedeveloper_cleaned.webp',
			translated: '/showcase/manhwa_estatedeveloper_translated.webp',
			href: '/docs/benchmarks/manhwa',
		},
		{
			id: 'manga',
			title: 'Japanese Manga',
			work: '《ワンパンマン》 One Punch Man',
			raw: '/showcase/manga_opm_raw.webp',
			cleaned: '/showcase/manga_opm_cleaned.webp',
			translated: '/showcase/manga_opm_translated.webp',
			href: '/docs/benchmarks/manga',
		},
	];

	const FORMAT_OPTIONS: SegmentOption[] = [
		{ value: 'manhua', label: 'Manhua', variant: 'cinnabar' },
		{ value: 'manhwa', label: 'Manhwa', variant: 'jade' },
		{ value: 'manga', label: 'Manga', variant: 'gold' },
	];

	const MODE_OPTIONS: SegmentOption[] = [
		{ value: 'translated', label: 'Translated', variant: 'cinnabar' },
		{ value: 'cleaned', label: 'Inpaint', variant: 'gold' },
	];

	const PIPELINE_STEPS = [
		{
			step: '01',
			title: 'Webtoon Gutter Reslicing',
			icon: SlidersHorizontal,
			tag: 'Reslice',
			desc: 'Recombines and splits vertical strips along natural panel gutters before processing, ensuring speech bubbles are never sliced in half across seams.',
		},
		{
			step: '02',
			title: 'Bubble & Panel Segmentation',
			icon: Scan,
			tag: 'RF-DETR',
			desc: 'Koharu RF-DETR Seg 2XL and RT-DETR models extract dialogue bubbles, narrative text boxes, and panel boundaries with polygon masks.',
		},
		{
			step: '03',
			title: 'Multi-Language OCR',
			icon: FileText,
			tag: '10 Languages',
			desc: 'RapidOCR engine extracts Hanzi, Hangul, and Kanji/Kana, ordering dialogue by cultural reading flow (RTL manga, vertical columns, or horizontal webtoons).',
		},
		{
			step: '04',
			title: 'Context-Aware Translation',
			icon: Languages,
			tag: 'LLM & Memory',
			desc: 'Elastic 5-page sliding dialogue context window combined with Aho-Corasick domain glossaries preserves speaker identity, pronouns, and terminology.',
		},
		{
			step: '05',
			title: 'Neural Artwork Inpainting',
			icon: Paintbrush,
			tag: 'LaMa FFC',
			desc: 'LaMa Fast Fourier Convolutions with 1:1 localized patch cropping remove source text while preserving artwork textures, gradients, and screentones.',
		},
		{
			step: '06',
			title: 'Automated Typesetting',
			icon: Sparkles,
			tag: 'Google Skia',
			desc: 'Computes optimal font sizing via binary-search fitting, multi-line wrapping, text outline strokes, and bubble tilt alignment using Google Skia.',
		},
	];

	// -- REACTIVE STATES -- //

	$: currentBenchmark = BENCHMARKS.find((b) => b.id === activeBenchmark) || BENCHMARKS[0];
	$: beforeSrc = currentBenchmark.raw;
	$: afterSrc = comparisonMode === 'translated' ? currentBenchmark.translated : currentBenchmark.cleaned;

	// -- FUNCTIONS -- //

	async function copyRepoUrl() {
		try {
			await navigator.clipboard.writeText('https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json');
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {}
	}
</script>

<svelte:head>
	<title>XianScan - Native Comic Translation & Typesetting Studio</title>
	<meta name="description" content="The native comic translation and typesetting studio for Chinese Manhua, Korean Manhwa, and Japanese Manga. Speech bubble segmentation, multi-script OCR, context-aware translation, and LaMa neural inpainting." />
	<link rel="canonical" href="https://xianscan.arbenger.com/" />
	
	<!-- OPEN GRAPH -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content="XianScan - Native Comic Translation & Typesetting Studio" />
	<meta property="og:description" content="Offline speech bubble detection, multi-script OCR, context-aware LLM translation, and LaMa neural inpainting for Chinese Manhua, Korean Manhwa, and Japanese Manga." />
	<meta property="og:url" content="https://xianscan.arbenger.com/" />
	<meta property="og:site_name" content="XianScan" />
	<meta property="og:image" content="https://xianscan.arbenger.com/logo.svg" />
	
	<!-- TWITTER CARDS -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="XianScan - Native Comic Translation & Typesetting Studio" />
	<meta name="twitter:description" content="The native comic translation and typesetting studio for Chinese Manhua, Korean Manhwa, and Japanese Manga." />
	<meta name="twitter:image" content="https://xianscan.arbenger.com/logo.svg" />

	<!-- STRUCTURED DATA (JSON-LD) -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "XianScan",
		"applicationCategory": "MultimediaApplication",
		"operatingSystem": "Windows, Linux, macOS",
		"description": "Native comic translation and typesetting server for Chinese Manhua, Korean Manhwa, and Japanese Manga.",
		"url": "https://xianscan.arbenger.com",
		"author": {
			"@type": "Person",
			"name": "Arben Apura",
			"url": "https://arbenger.com"
		},
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "USD"
		}
	}
	</script>`}
</svelte:head>

<div class="relative overflow-hidden py-10 sm:py-16">
	<div class="mx-auto max-w-5xl px-4 sm:px-6">
		
		<!-- ==============================================================================
		     1. HERO SECTION
		     ============================================================================== -->
		<div class="flex flex-col items-center text-center">
			<div class="mb-5 flex items-center justify-center">
				<Badge variant="cinnabar">
					v0.5.0-beta Native Engine
				</Badge>
			</div>

			<div class="flex flex-col items-center gap-3">
				<img src="/logo.svg" alt="XianScan" class="h-20 w-20 rounded-2xl shadow-sm ring-1 ring-black/10 dark:ring-white/10" />
				<h1 class="font-display text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">
					<span class="text-[#b23a2e] dark:text-[#e08a63]">Xian</span>Scan
				</h1>
			</div>

			<p class="mt-4 max-w-2xl text-sm sm:text-lg leading-relaxed opacity-85">
				The native comic translation and typesetting studio for Chinese Manhua, Korean Manhwa, and Japanese Manga. Offline speech bubble detection, multi-script OCR, context-aware LLM translation, and LaMa neural inpainting.
			</p>

			<!-- HERO ACTION BUTTONS -->
			<div class="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 w-full sm:w-auto">
				<Button
					variant="primary"
					size="md"
					href="/docs/getting-started/quick-start"
					class="w-full sm:w-auto"
				>
					<BookOpen size={16} />
					<span>Get Started (Quick Start)</span>
					<ArrowRight size={14} />
				</Button>

				<Button
					variant="secondary"
					size="md"
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
					class="w-full sm:w-auto"
				>
					<Github size={16} />
					<span>GitHub Source</span>
					<ExternalLink size={13} class="opacity-60" />
				</Button>

				<Button
					variant="secondary"
					size="md"
					href="https://discord.gg/dRWaQftNnR"
					target="_blank"
					rel="noreferrer"
					class="w-full sm:w-auto"
				>
					<DiscordIcon size={16} color="currentColor" />
					<span>Discord</span>
					<ExternalLink size={13} class="opacity-60" />
				</Button>
			</div>
		</div>

		<!-- INK DIVIDER -->
		<div class="my-10 sm:my-14">
			<InkDivider />
		</div>

		<!-- ==============================================================================
		     2. INTERACTIVE QUALITY COMPARISON (SLICK, CLEAN, PROMINENT)
		     ============================================================================== -->
		<div class="mt-12 sm:mt-16 mx-auto max-w-3xl lg:max-w-4xl">
			<div class="mb-5 text-center">
				<h2 class="font-display text-xl sm:text-3xl font-bold tracking-tight">
					Interactive Quality Comparison
				</h2>
				<p class="mt-1.5 text-xs sm:text-sm opacity-75 max-w-xl mx-auto">
					Drag the slider to compare raw scans against LaMa neural text cleaning and context-aware typeset output.
				</p>
			</div>

			<div class="rounded-2xl border border-black/10 bg-black/[0.015] p-3 sm:p-5 dark:border-white/10 dark:bg-white/[0.015] shadow-xs">
				<!-- TOP TOOLBAR -->
				<div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-black/10 dark:border-white/10">
					<!-- FORMAT SELECTOR -->
					<SegmentedControl
						options={FORMAT_OPTIONS}
						bind:value={activeBenchmark}
						activeVariant="cinnabar"
					/>

					<!-- MODE SELECTOR -->
					<SegmentedControl
						options={MODE_OPTIONS}
						bind:value={comparisonMode}
						activeVariant="jade"
					/>
				</div>

				<!-- SLIDER CANVAS -->
				<div class="py-3 flex justify-center">
					<ComparisonSlider
						{beforeSrc}
						{afterSrc}
						beforeLabel="RAW"
						afterLabel={comparisonMode === 'translated' ? 'TRANSLATED' : 'INPAINT ONLY'}
					/>
				</div>

				<!-- FOOTER CAPTION -->
				<div class="flex items-center justify-between gap-2 pt-3 border-t border-black/10 dark:border-white/10 text-xs sm:text-sm">
					<span class="truncate opacity-75 font-medium">
						{currentBenchmark.work}
					</span>
					<a
						href={currentBenchmark.href}
						class="inline-flex items-center gap-1 font-bold text-[#b23a2e] hover:underline dark:text-[#e08a63] transition-colors shrink-0"
					>
						<span>Full Benchmark Gallery</span>
						<ArrowRight size={13} />
					</a>
				</div>
			</div>
		</div>

		<!-- INK DIVIDER -->
		<div class="my-14 sm:my-20">
			<InkDivider />
		</div>

		<!-- ==============================================================================
		     3. AUTOMATED TRANSLATION PIPELINE
		     ============================================================================== -->
		<div class="mb-10 text-center">
			<Badge variant="jade" class="mb-2">Under The Hood</Badge>
			<h2 class="font-display text-xl sm:text-3xl font-bold tracking-tight">
				The 6-Stage Scanlation Pipeline
			</h2>
			<p class="mt-1.5 text-xs sm:text-sm opacity-75 max-w-xl mx-auto">
				Pure Rust neural inference pipeline executing reslicing, detection, OCR, translation, inpainting, and typesetting in a single automated pass.
			</p>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-12">
			{#each PIPELINE_STEPS as step}
				<div class="flex flex-col justify-between rounded-2xl border border-black/10 bg-black/[0.015] p-5 dark:border-white/10 dark:bg-white/[0.015] shadow-xs">
					<div>
						<div class="flex items-center justify-between mb-3">
							<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63]">
								STEP {step.step}
							</span>
							<span class="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-mono font-bold dark:bg-white/10 opacity-70">
								{step.tag}
							</span>
						</div>
						<div class="flex items-center gap-2 mb-2">
							<svelte:component this={step.icon} size={17} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<h3 class="font-display text-sm font-bold">{step.title}</h3>
						</div>
						<p class="text-xs leading-relaxed opacity-75">
							{step.desc}
						</p>
					</div>
				</div>
			{/each}
		</div>

		<!-- INK DIVIDER -->
		<div class="my-14 sm:my-20">
			<InkDivider />
		</div>

		<!-- ==============================================================================
		     4. END-TO-END DEMO VIDEO WALKTHROUGH
		     ============================================================================== -->
		<div class="mx-auto max-w-3xl lg:max-w-4xl">
			<div class="mb-5 text-center">
				<Badge variant="cinnabar" class="mb-2">Full Workflow Demo</Badge>
				<h2 class="font-display text-xl sm:text-3xl font-bold tracking-tight">
					Watch XianScan in Action
				</h2>
				<p class="mt-1.5 text-xs sm:text-sm opacity-75 max-w-xl mx-auto">
					1-click browser extension capture with live in-place translation, chapter uploading, smart webtoon re-slicing, and local Wi-Fi streaming to Mihon.
				</p>
			</div>

			<div class="overflow-hidden rounded-2xl border border-black/10 bg-black shadow-lg dark:border-white/10">
				<video
					src="/showcase/xianscan_demo.mp4"
					controls
					playsinline
					preload="metadata"
					class="w-full h-auto block"
				>
					<track kind="captions" />
				</video>
			</div>
		</div>

		<!-- INK DIVIDER -->
		<div class="my-14 sm:my-20">
			<InkDivider />
		</div>

		<!-- ==============================================================================
		     5. READING INTEGRATIONS & ECOSYSTEM
		     ============================================================================== -->
		<div class="mb-8 text-center">
			<Badge variant="gold" class="mb-2">Ecosystem</Badge>
			<h2 class="font-display text-xl sm:text-3xl font-bold tracking-tight">
				Read Anywhere Across Your Devices
			</h2>
			<p class="mt-1.5 text-xs sm:text-sm opacity-75 max-w-xl mx-auto">
				Enjoy translated series on desktop web, directly on comic sites, or synced to your Android phone and tablet.
			</p>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
			<!-- BROWSER EXTENSION -->
			<div class="flex flex-col justify-between rounded-2xl border border-black/10 bg-black/[0.015] p-5 sm:p-6 dark:border-white/10 dark:bg-white/[0.015] shadow-xs hover:border-[#4f7a64]/40 dark:hover:border-[#83b39a]/40 transition-colors">
				<div>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4f7a64]/10 text-[#4f7a64] dark:bg-[#4f7a64]/20 dark:text-[#83b39a] shrink-0">
							<Globe size={20} />
						</div>
						<div>
							<h3 class="font-display text-base sm:text-lg font-bold">Browser Importer Extension</h3>
							<span class="text-xs font-mono uppercase tracking-wider text-[#4f7a64] dark:text-[#83b39a] font-bold">Chrome / Edge / Firefox</span>
						</div>
					</div>
					<p class="mt-3 text-xs sm:text-sm opacity-75 leading-relaxed">
						1-click chapter importing, automatic image extraction, and live in-browser overlay translation right on raw web manga and manhua reader sites.
					</p>
				</div>

				<div class="mt-5 pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
					<a
						href="/docs/extensions/importer"
						class="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#4f7a64] hover:underline dark:text-[#83b39a] transition-colors"
					>
						<span>Setup Guide & Installation</span>
						<ArrowRight size={13} />
					</a>
				</div>
			</div>

			<!-- MIHON ANDROID EXTENSION -->
			<div class="flex flex-col justify-between rounded-2xl border border-black/10 bg-black/[0.015] p-5 sm:p-6 dark:border-white/10 dark:bg-white/[0.015] shadow-xs hover:border-[#b23a2e]/40 dark:hover:border-[#e08a63]/40 transition-colors">
				<div>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#b23a2e]/20 dark:text-[#e08a63] shrink-0">
							<Smartphone size={20} />
						</div>
						<div>
							<h3 class="font-display text-base sm:text-lg font-bold">Mihon / Tachiyomi Extension</h3>
							<span class="text-xs font-mono uppercase tracking-wider text-[#b23a2e] dark:text-[#e08a63] font-bold">Android Comic Readers</span>
						</div>
					</div>
					<p class="mt-3 text-xs sm:text-sm opacity-75 leading-relaxed">
						Stream translated chapters over your local Wi-Fi LAN directly into Mihon, Tachiyomi, and compatible Android comic reader apps.
					</p>
				</div>

				<div class="mt-5 pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
					<a
						href="/docs/extensions/mihon"
						class="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#b23a2e] hover:underline dark:text-[#e08a63] transition-colors"
					>
						<span>Mihon Guide</span>
						<ArrowRight size={13} />
					</a>
					<button
						type="button"
						on:click={copyRepoUrl}
						class="inline-flex items-center gap-1.5 rounded-lg bg-[#b23a2e] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#c0392b] active:scale-95 shrink-0"
					>
						{#if copied}
							<Check size={13} />
							<span>Copied!</span>
						{:else}
							<Copy size={13} />
							<span>Copy Repo URL</span>
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- ==============================================================================
		     6. BOTTOM CALL TO ACTION
		     ============================================================================== -->
		<div class="rounded-3xl border border-black/10 bg-black/[0.02] p-8 sm:p-10 dark:border-white/10 dark:bg-white/[0.02] text-center shadow-xs">
			<div class="flex items-center justify-center mb-3">
				<Badge variant="cinnabar">Self-Hosted & Private</Badge>
			</div>
			<h2 class="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
				Ready to Translate Your Comic Library?
			</h2>
			<p class="mt-2 text-xs sm:text-sm opacity-75 max-w-lg mx-auto leading-relaxed">
				Download the standalone binary or explore the documentation to set up your own self-hosted scanlation studio in minutes.
			</p>
			<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
				<Button
					variant="primary"
					size="md"
					href="/docs/getting-started/quick-start"
				>
					<BookOpen size={16} />
					<span>Get Started</span>
					<ArrowRight size={14} />
				</Button>
				<Button
					variant="secondary"
					size="md"
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
				>
					<Github size={16} />
					<span>GitHub</span>
					<ExternalLink size={13} class="opacity-60" />
				</Button>
			</div>
		</div>

	</div>
</div>