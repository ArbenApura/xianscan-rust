<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy } from 'svelte';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	// IMPORTED DEP-COMPONENTS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Check from 'lucide-svelte/icons/check';
	import Coffee from 'lucide-svelte/icons/coffee';
	import Copy from 'lucide-svelte/icons/copy';
	import Cpu from 'lucide-svelte/icons/cpu';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Github from 'lucide-svelte/icons/github';
	import Globe from 'lucide-svelte/icons/globe';
	import Heart from 'lucide-svelte/icons/heart';
	import Mail from 'lucide-svelte/icons/mail';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import Smartphone from 'lucide-svelte/icons/smartphone';
	import Terminal from 'lucide-svelte/icons/terminal';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	// IMPORTED COMPONENTS
	import { DropCap, InkDivider, Seal } from '$lib/components/ui';
	import OnboardingModal from '$lib/components/OnboardingModal.svelte';

	// -- CONSTANTS -- //
	const MIHON_REPO_URL = 'https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json';

	const PIPELINE_STEPS = [
		{
			num: '01',
			title: 'Web Capture & DOM Filtering',
			engine: 'Browser Extension (Chrome, Edge, Firefox, Brave)',
			body: 'Smooth-scrolls online comic sites to trigger lazy image loaders and captures chapters directly, filtering out advertisements, banners, and sidebar noise.',
		},
		{
			num: '02',
			title: 'Webtoon Smart Gutter Re-slicing',
			engine: 'Gutter Detector (Rust / Image-rs)',
			body: 'Recombines fragmented webtoon slices into a continuous vertical roll, identifies non-text whitespace valleys, and re-slices along panel gutters so speech bubbles are never bisected.',
		},
		{
			num: '03',
			title: 'Speech Bubble & Text Segmentation',
			engine: 'Koharu RF-DETR Seg 2XL & RT-DETR (ONNX Runtime)',
			body: 'Locates dialogue bubbles, narrative text boxes, and sound effects with sub-pixel bounding polygon coordinates and configurable expansion margins.',
		},
		{
			num: '04',
			title: 'Multi-Script OCR Recognition',
			engine: 'PP-OCRv6 / RapidOCR with Angle Classifier',
			body: 'Extracts typography across 10 languages with orientation angle detection (horizontal vs. vertical flow) and punctuation normalization.',
		},
		{
			num: '05',
			title: 'Contextual AI Translation & Memory',
			engine: 'Sliding-Window Tracker + Aho-Corasick',
			body: 'Translates dialogue via local LLMs (Ollama, LM Studio) or cloud endpoints (Gemini, OpenAI, Groq, OpenRouter). Employs sliding-window cross-page dialogue tracking and instant glossary term matching to preserve character pronouns and realm names.',
		},
		{
			num: '06',
			title: 'Neural Artwork Inpainting',
			engine: 'LaMa (Large Mask Inpainting) ONNX',
			body: 'Erases original source characters while reconstructing background art, textures, and screentones. Features 1:1 localized patch cropping to keep unedited areas at full native sharpness.',
		},
		{
			num: '07',
			title: 'Dynamic Canvas Typesetting',
			engine: '@napi-rs/canvas (Google Skia)',
			body: 'Calculates optimal font sizing via binary search, line breaks, diagonal tilt rotation, outline contrast strokes, and automatic CJK fallback typography chains.',
		},
		{
			num: '08',
			title: 'Local Wi-Fi Streaming & Reader Sync',
			engine: 'Axum REST Engine + Mihon Source Protocol',
			body: 'Serves translated chapters instantly to the web studio reader (Continuous Webtoon, Card Grid, Side-by-Side) or streams directly over local Wi-Fi to Android devices via Mihon / Tachiyomi.',
		},
	];

	const FORMAT_BREAKDOWN = [
		{
			format: 'Chinese Manhua',
			focus: 'Cultivation & Martial Arts',
			description: 'Tuned for vertical strips, multi-line narrative blocks, and extensive cultivation realm terminology glossaries (Daoism, sects, martial ranks).',
		},
		{
			format: 'Korean Manhwa & Webtoons',
			focus: 'Continuous Vertical Rolls',
			description: 'Specialized gutter splitting, tall strip recombining, and Korean Hangul OCR dictionary models.',
		},
		{
			format: 'Japanese Manga',
			focus: 'Right-to-Left Layouts',
			description: 'Vertical column text extraction, multi-column bubble contours, and specialized Manga inpainting textures.',
		},
		{
			format: 'Western & Global Comics',
			focus: 'Horizontal Typography',
			description: 'Standard left-to-right reading flow, all-caps comic lettering, and SFX boundary fitting.',
		},
	];

	const SYSTEM_SPECS = [
		{ component: 'CPU Requirements', min: '4 Cores with AVX2 (Intel Core 6th Gen+ / AMD Ryzen) or Apple M1+', rec: '6 to 8 Cores (AVX2 / AVX-512 / ARM NEON)' },
		{ component: 'Memory (RAM)', min: '8 GB (Engine RSS ~1.2 GB + Image Buffers)', rec: '16 GB+ (Mandatory if running local LLMs like Ollama alongside)' },
		{ component: 'Disk Space', min: '1 GB (Standalone binary with embedded models)', rec: '5 GB+ SSD for chapter caching and SQLite storage' },
		{ component: 'External Dependencies', min: 'None (Standalone self-contained binary)', rec: 'None (zero Python / Conda / Node installation needed)' },
		{ component: 'GPU / Hardware Acceleration', min: 'None required (Multi-threaded CPU default)', rec: 'Dedicated GPU with 8 GB+ VRAM (DirectML / CUDA / CoreML)' },
		{ component: 'Local Database', min: 'SQLite 3 with Write-Ahead Logging (WAL)', rec: '100% private on local disk (%APPDATA% / ~/.local/share)' },
	];

	const ATTRIBUTIONS = [
		{
			name: 'Koharu RF-DETR Layout Detector & Segmenter',
			credit: 'by mayocream / koharu (Apache-2.0 / Manga109)',
			detail: 'High-resolution (1152px) RF-DETR Seg 2XL transformer model predicting speech bubbles, dialogue text, SFX, and panel instance masks.',
		},
		{
			name: 'PaddleOCR & RapidOCR Engine',
			credit: 'by PaddlePaddle / RapidAI / xberg-io (Apache-2.0)',
			detail: 'Multilingual OCR recognition models (PP-OCRv6, Korean, Cyrillic, Thai) and text direction angle classification.',
		},
		{
			name: 'LaMa Neural Inpainting',
			credit: 'by advimman / ogkalu (Apache-2.0)',
			detail: 'Large Mask Inpainting architecture and manga-specialized inpainting weights for deep background texture synthesis.',
		},
		{
			name: 'Typography & Open Font Licenses',
			credit: 'SIL Open Font License (OFL-1.1)',
			detail: 'Open-source dialogue and CJK fallback typography (Friendly Sans, LXGW WenKai, Anime Ace). CC Wild Words is a registered trademark of Comicraft.',
		},
		{
			name: 'ONNX Runtime & Google Skia',
			credit: 'Microsoft (MIT) & @napi-rs/canvas',
			detail: 'High-performance cross-platform SIMD inference engine and vector canvas graphics renderer.',
		},
	];

	// -- STATES -- //
	let isMounted = false;
	let isCopied = false;
	let tourOpen = false;
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	// -- FUNCTIONS -- //
	async function copyMihonRepo() {
		try {
			await navigator.clipboard.writeText(MIHON_REPO_URL);
			isCopied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				isCopied = false;
			}, 2500);
		} catch {
			// FALLBACK IF CLIPBOARD ACCESS IS BLOCKED
		}
	}

	function cleanupKofi() {
		if (typeof document === 'undefined') return;
		const selectors = [
			'.floatingchat-container-wrap',
			'.floatingchat-container-wrap-mobi',
			'.floating-chat-kofi-popup-iframe',
			'.floating-chat-kofi-popup-iframe-mobi',
			'#kofi-widget-overlay',
			'div[id*="kofi"]',
			'iframe[id*="kofi"]',
			'iframe[src*="ko-fi.com"]',
			'div[class*="floatingchat"]',
			'div[class*="floating-chat"]',
		];
		selectors.forEach((sel) => {
			try {
				document.querySelectorAll(sel).forEach((el) => el.remove());
			} catch {
				// IGNORE CLEANUP ERRORS
			}
		});
	}

	// -- LIFECYCLES -- //
	onMount(() => {
		isMounted = true;
		if (typeof window === 'undefined') return;

		function initKofi() {
			if (!isMounted) {
				cleanupKofi();
				return;
			}
			if ((window as any).kofiWidgetOverlay) {
				try {
					(window as any).kofiWidgetOverlay.draw('arbenapura', {
						type: 'floating-chat',
						'floating-chat.donateButton.text': 'Support me',
						'floating-chat.donateButton.background-color': '#b23a2e',
						'floating-chat.donateButton.text-color': '#fff',
					});
				} catch {
					// IGNORE IF ALREADY DRAWN
				}
			}
		}

		if ((window as any).kofiWidgetOverlay) {
			initKofi();
		} else {
			const script = document.createElement('script');
			script.id = 'kofi-overlay-widget-script';
			script.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
			script.async = true;
			script.onload = initKofi;
			document.body.appendChild(script);
		}
	});

	onDestroy(() => {
		isMounted = false;
		if (copyTimeout) clearTimeout(copyTimeout);
		cleanupKofi();
		setTimeout(cleanupKofi, 50);
		setTimeout(cleanupKofi, 300);
	});
</script>

<svelte:head>
	<title>About : XianScan Comic Translation Server</title>
	<meta
		name="description"
		content="About XianScan: Native comic translation server for Chinese Manhua, Korean Manhwa, and Japanese Manga built with Rust and ONNX Runtime by Arben Apura."
	/>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 sm:px-6 space-y-8 sm:space-y-12 py-4 sm:py-8 font-sans text-neutral-800 dark:text-neutral-200">
	<!-- EDITORIAL MASTHEAD -->
	<header class="space-y-4 border-b border-black/10 pb-6 sm:pb-8 dark:border-white/10">
		<div class="flex items-center justify-between gap-4">
			<div class="flex items-center gap-2.5">
				<Seal char="仙" size={26} />
				<span class="text-xs font-semibold tracking-widest text-[#b23a2e] dark:text-[#e08a63] uppercase">
					XianScan / Documentation & Spec
				</span>
			</div>
			<span class="text-[11px] sm:text-xs opacity-50 hidden xs:inline">MIT Licensed · Rust 1.88+</span>
		</div>

		<div class="space-y-2 pt-1 sm:pt-2">
			<h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
				Native Comic Translation Server
			</h1>
			<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
				Speech bubble detection, 10-language OCR, LLM translation, neural inpainting, and Skia typesetting for Chinese Manhua, Korean Manhwa, and Japanese Manga.
			</p>
		</div>

		<!-- ACTION BUTTONS / QUICK LINKS -->
		<div class="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-2">
			<button
				type="button"
				on:click={() => (tourOpen = true)}
				use:ripple
				class="inline-flex items-center justify-center gap-2 rounded-lg bg-[#b23a2e] px-4 py-2.5 sm:py-2 text-xs font-bold text-white transition hover:bg-[#c0392b] active:scale-95 cursor-pointer shadow-xs shadow-[#b23a2e]/20"
			>
				<Sparkles size={14} />
				<span>Start Welcome Tour</span>
			</button>
			<a
				href="/app"
				use:ripple
				class="inline-flex items-center justify-center gap-2 rounded-lg border border-black/15 bg-white/50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:bg-white/10 transition"
			>
				<BookOpen size={14} />
				<span>Open Library</span>
			</a>
			<a
				href="https://github.com/ArbenApura/xianscan-rust"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center justify-center gap-2 rounded-lg border border-black/15 bg-white/50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:bg-white/10 transition"
			>
				<Github size={14} />
				<span>Source Code</span>
				<ExternalLink size={11} class="opacity-40" />
			</a>
			<a
				href="https://arbenger.com/contact/"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center justify-center gap-2 rounded-lg border border-black/15 bg-white/50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:bg-white/10 transition"
			>
				<Globe size={14} />
				<span>arbenger.com</span>
				<ExternalLink size={11} class="opacity-40" />
			</a>
		</div>
	</header>

	<!-- 01 / OVERVIEW & ARCHITECTURAL PILLARS -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">01</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Overview & Architecture
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				Self-contained, local-first comic translation engine:
			</p>
		</div>

		<div class="space-y-3 sm:space-y-4 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed text-left">
			<p>
				<DropCap letter="X" />ianScan is a self-contained, local-first comic translation server built in Rust. It eliminates the manual busywork of screenshotting, external OCR, Photoshop cleaning, and manual typesetting by orchestrating the entire lifecycle in a single automated flow: from 1-click web reader import to streaming translated chapters directly to your mobile reader over local Wi-Fi.
			</p>
			<p>
				Unlike legacy translation scripts that require complex Python environments, Conda setups, or external runtime installations, XianScan ships as a single portable executable containing all ONNX neural models, OCR dictionaries, Skia graphics rendering, and the SvelteKit web interface.
			</p>
		</div>

		<!-- WORKFLOW TOOL COMPARISON NOTE -->
		<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 sm:p-4 text-xs space-y-2 dark:border-white/10 dark:bg-white/[0.02]">
			<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">Workflow Specialization:</h3>
			<ul class="space-y-2 text-neutral-600 dark:text-neutral-400 text-[11px] sm:text-xs leading-relaxed">
				<li>
					<strong class="text-neutral-800 dark:text-neutral-200">XianScan (Automated Reading Flow):</strong> Built specifically for readers and fast chapter catch-up. Delivers an automated 1-click pipeline (browser import -> OCR -> inpainting -> LLM translation -> typesetting -> Mihon streaming) in a zero-install standalone binary.
				</li>
				<li>
					<strong class="text-neutral-800 dark:text-neutral-200">Koharu (Comprehensive Studio):</strong> If you need a full desktop editor with multi-format project management, proofreading, a WebGPU-based canvas for manual touch-ups, and layered PSD export, check out <a href="https://github.com/mayocream/koharu" target="_blank" rel="noopener noreferrer" class="text-[#b23a2e] dark:text-[#e08a63] underline">Koharu</a>.
				</li>
			</ul>
		</div>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 02 / TRANSLATION PIPELINE -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">02</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Translation Pipeline (8 Stages)
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				The automated lifecycle of a page through the XianScan engine:
			</p>
		</div>

		<div class="space-y-2.5 sm:space-y-3">
			{#each PIPELINE_STEPS as step}
				<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3 sm:p-3.5 text-xs space-y-1 dark:border-white/10 dark:bg-white/[0.015]">
					<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5 sm:gap-1">
						<div class="flex items-center gap-2">
							<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63]">{step.num}.</span>
							<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">{step.title}</strong>
						</div>
						<span class="text-[10px] sm:text-[11px] font-mono text-neutral-500 pl-6 sm:pl-0">{step.engine}</span>
					</div>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] sm:text-xs leading-relaxed pl-6 sm:pl-6">
						{step.body}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 03 / SUPPORTED FORMATS & LANGUAGES -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">03</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Supported Formats & Languages
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				Format-specific optimizations and multi-script recognition tiers:
			</p>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
			{#each FORMAT_BREAKDOWN as item}
				<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-4 text-xs space-y-1.5 dark:border-white/10 dark:bg-white/[0.015]">
					<div class="flex items-center justify-between gap-2">
						<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">{item.format}</h3>
						<span class="text-[10px] sm:text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63] shrink-0">{item.focus}</span>
					</div>
					<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
						{item.description}
					</p>
				</div>
			{/each}
		</div>

		<!-- 10 OCR LANGUAGES -->
		<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-4 text-xs space-y-2 dark:border-white/10 dark:bg-white/[0.015]">
			<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">10 Supported OCR Languages:</h3>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-neutral-600 dark:text-neutral-400 text-[11px] sm:text-xs">
				<div class="rounded-lg bg-black/[0.02] dark:bg-white/[0.02] p-2 sm:p-0 sm:bg-transparent">
					<strong class="text-neutral-800 dark:text-neutral-200">East Asian:</strong> Chinese (Simp. & Trad.), Japanese, Korean
				</div>
				<div class="rounded-lg bg-black/[0.02] dark:bg-white/[0.02] p-2 sm:p-0 sm:bg-transparent">
					<strong class="text-neutral-800 dark:text-neutral-200">Southeast Asian:</strong> Thai, Indonesian
				</div>
				<div class="rounded-lg bg-black/[0.02] dark:bg-white/[0.02] p-2 sm:p-0 sm:bg-transparent">
					<strong class="text-neutral-800 dark:text-neutral-200">Global:</strong> English, Spanish, French, Russian
				</div>
			</div>
		</div>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 04 / SYSTEM REQUIREMENTS -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">04</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					System Requirements & Hardware Support
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				Tuned for CPU-first execution with dynamic GPU acceleration:
			</p>
		</div>

		<!-- MOBILE CARD VIEW (< 640px) -->
		<div class="space-y-2.5 sm:hidden">
			{#each SYSTEM_SPECS as spec}
				<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3 text-xs space-y-1.5 dark:border-white/10 dark:bg-white/[0.015]">
					<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs">{spec.component}</h3>
					<div class="space-y-1 text-[11px]">
						<div class="flex items-baseline gap-2 text-neutral-600 dark:text-neutral-400">
							<span class="font-semibold text-neutral-500 shrink-0 w-20">Minimum:</span>
							<span class="flex-1">{spec.min}</span>
						</div>
						<div class="flex items-baseline gap-2 text-neutral-700 dark:text-neutral-300">
							<span class="font-semibold text-neutral-500 shrink-0 w-20">Recommended:</span>
							<span class="flex-1 font-medium">{spec.rec}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- DESKTOP TABLE VIEW (>= 640px) -->
		<div class="hidden sm:block rounded-xl border border-black/10 bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.015] overflow-hidden">
			<table class="w-full text-left text-xs border-collapse">
				<thead>
					<tr class="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] text-xs font-semibold text-neutral-500">
						<th class="py-2.5 px-4">Component</th>
						<th class="py-2.5 px-4">Minimum Specification</th>
						<th class="py-2.5 px-4">Recommended Specification</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-black/5 dark:divide-white/5">
					{#each SYSTEM_SPECS as spec}
						<tr class="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
							<td class="py-3 px-4 font-bold text-neutral-900 dark:text-neutral-100 align-top">
								{spec.component}
							</td>
							<td class="py-3 px-4 text-neutral-600 dark:text-neutral-400 align-top">
								{spec.min}
							</td>
							<td class="py-3 px-4 text-neutral-600 dark:text-neutral-400 align-top">
								{spec.rec}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 05 / BROWSER WEB EXTENSION -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">05</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Browser Web Extension (Chrome, Edge, Firefox, Brave)
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				1-Click capture and real-time in-place translation on online comic reading sites:
			</p>
		</div>

		<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-5 dark:border-white/10 dark:bg-white/[0.015] space-y-3 sm:space-y-4">
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<Globe size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<h3 class="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
						XianScan Web Importer & In-Place Live Translator
					</h3>
				</div>
				<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
					A cross-browser Manifest V3 extension (<code class="font-mono text-neutral-800 dark:text-neutral-200">extensions/xianscan-importer/</code>) that captures chapters directly from web readers and swaps translated panels back onto the host page in real-time.
				</p>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs pt-1">
				<div class="rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 sm:p-3 space-y-1">
					<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs">In-Place Live Translation</strong>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
						Replaces raw panels on the host website as background translation completes, with dark-shaded pending slices and smooth status transitions.
					</p>
				</div>
				<div class="rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 sm:p-3 space-y-1">
					<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs">1-Click Smart Presets</strong>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
						Detects chapter numbers from URL parameters, subtitles, and sequences, pre-selecting <code class="font-mono">Chapter N (NEW)</code> for instant 1-click import.
					</p>
				</div>
				<div class="rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 sm:p-3 space-y-1">
					<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs">Intelligent Ad & Noise Shield</strong>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
						Filters out floating promo banners, external ad links, and extreme aspect ratio overlays (<code class="font-mono">880×99</code>).
					</p>
				</div>
				<div class="rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 sm:p-3 space-y-1">
					<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs">Private Network Safe</strong>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
						Streams in-memory Base64 data URLs via background IPC, eliminating browser Private Network Access (PNA) permission prompts.
					</p>
				</div>
			</div>
		</div>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 06 / MIHON & MOBILE READER ECOSYSTEM -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">06</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Mihon & Mobile Reader Ecosystem (Android)
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				Stream or download translated chapters directly over your home network:
			</p>
		</div>

		<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-5 dark:border-white/10 dark:bg-white/[0.015] space-y-3 sm:space-y-4">
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<Smartphone size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<h3 class="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
						Official Mihon / Tachiyomi Extension Repository
					</h3>
				</div>
				<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
					Compatible with Mihon, TachiyomiSY, J2K, Aniyomi, and Android E-Ink readers (Boox, Bigme, Meebook). Synchronizes book titles, reading directions, and covers automatically over your local Wi-Fi:
				</p>
			</div>

			<!-- REPOSITORY URL SNIPPET -->
			<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
				<div class="flex-1 min-w-0 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-2 text-[10px] sm:text-xs font-mono text-neutral-800 dark:text-neutral-200 break-all select-all">
					{MIHON_REPO_URL}
				</div>
				<button
					type="button"
					on:click={copyMihonRepo}
					use:ripple
					class={cn(
						'w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 sm:py-2 text-xs font-bold transition shrink-0',
						isCopied
							? 'bg-emerald-600 text-white'
							: 'bg-[#b23a2e] text-white hover:bg-[#c0392b]'
					)}
				>
					{#if isCopied}
						<Check size={14} />
						<span>Copied to Clipboard</span>
					{:else}
						<Copy size={14} />
						<span>Copy Repository URL</span>
					{/if}
				</button>
			</div>

			<!-- STEP BY STEP GUIDE -->
			<ol class="list-decimal list-inside space-y-1.5 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 pt-2 border-t border-black/5 dark:border-white/5 leading-relaxed">
				<li>In Mihon on Android, navigate to <strong>More → Settings → Browse → Extension Repos</strong>.</li>
				<li>Tap <strong>+ Add</strong>, paste the repository URL above, and confirm.</li>
				<li>In <strong>Browse → Extensions</strong>, locate <strong>XianScan</strong> and tap <strong>Install</strong>.</li>
				<li>Tap the settings cog beside XianScan, select <strong>Server Address</strong>, and enter your PC LAN address (found in your XianScan startup terminal banner, e.g. <code class="font-mono text-neutral-800 dark:text-neutral-200">http://192.168.1.50:8124</code>).</li>
				<li>In <strong>Browse → Sources</strong>, tap the filter icon and enable the <strong>Multi</strong> tag.</li>
			</ol>
		</div>
	</section>

	<!-- 07 / ETHICAL USE & COPYRIGHT NOTICE -->
	<section class="space-y-3.5 sm:space-y-4 rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-5 dark:border-white/10 dark:bg-white/[0.015] text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
		<div class="flex items-center gap-2">
			<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">07</span>
			<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
			<h2 class="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
				<ShieldCheck size={15} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
				Ethical Use & Copyright Notice
			</h2>
		</div>
		<p class="pl-6 sm:pl-7">
			XianScan is designed strictly as a <strong>local-first personal assistive translation and language-learning tool</strong>.
		</p>
		<ul class="list-disc list-inside space-y-1 pl-6 sm:pl-7 text-[11px] sm:text-xs">
			<li><strong>Respect for Creators:</strong> Users are strongly encouraged to support original creators on licensed digital platforms (Kuaikan Manhua, Bilibili Manga, Naver WEBTOON, KakaoPage, Tapas, MANGA Plus by Shueisha, VIZ Media, BookWalker).</li>
			<li><strong>100% Local & Private:</strong> XianScan does not host, re-distribute, or scrape copyrighted works on public cloud servers. All processing occurs entirely on the user's private local hardware.</li>
			<li><strong>No DRM Circumvention:</strong> XianScan contains no features designed to bypass encryption, digital rights management (DRM), or paywalls.</li>
		</ul>
	</section>

	<InkDivider class="max-w-xs mx-auto opacity-40" />

	<!-- 08 / ACKNOWLEDGMENTS & MODEL ATTRIBUTION -->
	<section class="space-y-3.5 sm:space-y-4">
		<div class="space-y-0.5">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">08</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Model Attributions & Credits
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 pl-6 sm:pl-7">
				Core research models and open-source foundations:
			</p>
		</div>

		<div class="space-y-2.5 sm:space-y-3">
			{#each ATTRIBUTIONS as item}
				<div class="rounded-xl border border-black/10 bg-black/[0.015] p-3 sm:p-3.5 text-xs space-y-1 dark:border-white/10 dark:bg-white/[0.015]">
					<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5 sm:gap-1">
						<strong class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">{item.name}</strong>
						<span class="text-[10px] sm:text-[11px] text-neutral-500">{item.credit}</span>
					</div>
					<p class="text-neutral-600 dark:text-neutral-400 text-[11px] sm:text-xs leading-relaxed">
						{item.detail}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- 09 / AUTHOR & OPPORTUNITIES -->
	<footer class="space-y-5 sm:space-y-6 pt-5 sm:pt-6 border-t border-black/10 dark:border-white/10 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<span class="font-mono text-xs sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">09</span>
				<span class="text-neutral-300 dark:text-neutral-700 font-mono text-xs sm:text-sm">/</span>
				<h2 class="text-sm sm:text-base font-extrabold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
					Author & Opportunities
				</h2>
			</div>
			<p class="text-[11px] sm:text-xs leading-relaxed pl-6 sm:pl-7">
				XianScan is architected and built by <strong class="text-neutral-900 dark:text-neutral-100">Arben Apura</strong> as a showcase of end-to-end full-stack web engineering, intuitive UI/UX design, and intelligent application architecture.
			</p>
			<div class="flex flex-wrap items-center gap-2 sm:gap-3 pt-1 pl-6 sm:pl-7 text-[11px] sm:text-xs">
				<a href="https://arbenger.com/contact/" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] hover:underline">
					<Globe size={13} />
					<span>arbenger.com/contact</span>
				</a>
				<span class="opacity-30">·</span>
				<a href="mailto:arbenapura.official@gmail.com" class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] hover:underline">
					<Mail size={13} />
					<span>arbenapura.official@gmail.com</span>
				</a>
				<span class="opacity-30">·</span>
				<a href="https://github.com/ArbenApura" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[#b23a2e] dark:text-[#e08a63] hover:underline">
					<Github size={13} />
					<span>@ArbenApura</span>
				</a>
				<span class="opacity-30">·</span>
				<a href="https://discord.gg/J5mjJX6c" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[#5865F2] hover:underline font-medium">
					<MessageSquare size={13} />
					<span>Discord Community</span>
				</a>
			</div>
		</div>

		<!-- KO-FI CONTRIBUTION & DISCORD COMMUNITY CARDS -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<div class="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.015]">
				<div class="space-y-1">
					<h3 class="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs sm:text-sm">
						<Heart size={14} class="text-[#b23a2e]" fill="currentColor" />
						<span>Support Open-Source R&D</span>
					</h3>
					<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
						Directly sustain independent development, essential living costs, and model optimization.
					</p>
				</div>

				<a
					href="https://ko-fi.com/arbenapura"
					target="_blank"
					rel="noopener noreferrer"
					use:ripple
					class="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#c0392b] text-white px-3.5 py-2 text-xs font-bold transition"
				>
					<Coffee size={14} />
					<span>Support on Ko-fi</span>
					<ExternalLink size={11} class="opacity-60" />
				</a>
			</div>

			<div class="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.015] p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.015]">
				<div class="space-y-1">
					<h3 class="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs sm:text-sm">
						<MessageSquare size={14} class="text-[#5865F2]" />
						<span>Join the Community</span>
					</h3>
					<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
						Chat with fellow readers, report bugs, request features, and discuss pipeline setups on Discord.
					</p>
				</div>

				<a
					href="https://discord.gg/J5mjJX6c"
					target="_blank"
					rel="noopener noreferrer"
					use:ripple
					class="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white px-3.5 py-2 text-xs font-bold transition"
				>
					<MessageSquare size={14} />
					<span>Join Discord Server</span>
					<ExternalLink size={11} class="opacity-60" />
				</a>
			</div>
		</div>

		<div class="text-center text-[10px] sm:text-xs opacity-40 pt-2 sm:pt-4">
			XianScan · Built by Arben Apura · 2026
		</div>
	</footer>
</div>

<!-- ONBOARDING WELCOME TOUR MODAL -->
<OnboardingModal bind:open={tourOpen} />
