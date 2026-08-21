<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	// IMPORTED DEP-COMPONENTS
	import Github from 'lucide-svelte/icons/github';
	import Globe from 'lucide-svelte/icons/globe';
	import Heart from 'lucide-svelte/icons/heart';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Layers from 'lucide-svelte/icons/layers';
	import Languages from 'lucide-svelte/icons/languages';
	import Palette from 'lucide-svelte/icons/palette';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import Download from 'lucide-svelte/icons/download';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Coffee from 'lucide-svelte/icons/coffee';
	import Puzzle from 'lucide-svelte/icons/puzzle';
	import Zap from 'lucide-svelte/icons/zap';
	import Smartphone from 'lucide-svelte/icons/smartphone';

	// -- STATES -- //
	let openFaq: number | null = 0;

	// -- CONSTANTS -- //
	const FAQS = [
		{
			q: 'Is XianScan open source and free to use?',
			a: 'Yes. XianScan is free and open-source software under the MIT License. The complete Rust backend, neural pipeline, browser extensions, and SvelteKit web studio are publicly hosted on GitHub at https://github.com/ArbenApura/xianscan-rust.',
		},
		{
			q: 'How do I read my comics on Mihon / Tachiyomi on mobile?',
			a: 'XianScan includes a dedicated Mihon extension repository! In Mihon on Android, navigate to Settings → Browse → Extension repos (or Extension stores) → Add, paste https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json, tap Add, and install the XianScan extension under Browse → Extensions / Store. Then set your PC’s local IP address (e.g. http://192.168.1.50:8124) in the extension settings.',
		},
		{
			q: 'Can I use XianScan completely offline?',
			a: 'Yes. The standalone executable embeds all ML weights (RT-DETR bubble detector, 10-language OCR, and LaMa neural inpainter). Combined with a local LLM runner (such as Ollama or LM Studio), the entire detection, OCR, translation, and typesetting workflow runs 100% offline with zero internet access.',
		},
		{
			q: 'Does XianScan require a dedicated GPU or CUDA?',
			a: 'No GPU or CUDA is required. XianScan runs on highly optimized multi-threaded SIMD inference (AVX2, AVX-512, ARM NEON) on standard CPUs. If a compatible GPU is present, it automatically accelerates via DirectML (Windows), CoreML/Metal (Apple Silicon), or CUDA (Linux NVIDIA).',
		},
		{
			q: 'Where are my comic libraries and chapter data stored?',
			a: 'Everything is stored 100% locally on your computer in your system application data directory (%APPDATA%\\XianScan\\data on Windows, ~/.local/share/xianscan/data on Linux, ~/Library/Application Support/XianScan/data on macOS). XianScan never uploads your raw images or SQLite database to any cloud servers.',
		},
		{
			q: 'What comic formats and languages are supported?',
			a: 'XianScan natively supports Chinese Manhua (Simplified & Traditional), Korean Manhwa & Webtoons, Japanese Manga, and Western/Global comics across 10 OCR languages (Simplified Chinese, Traditional Chinese, Japanese, Korean, Thai, Indonesian, English, Spanish, French, Russian) with automatic CJK font fallbacks.',
		},
		{
			q: 'How does Webtoon Smart Gutter Re-slicing work?',
			a: 'Vertical webtoons often get cut arbitrarily across speech bubbles by raw hosting sites. XianScan’s smart reslicer recombines chapter strips into continuous rolls and calculates non-text whitespace gutters to slice pages cleanly without bisecting speech bubbles.',
		},
	];

	// -- FUNCTIONS -- //
	function toggleFaq(index: number) {
		openFaq = openFaq === index ? null : index;
	}

	// -- LIFECYCLES -- //
	// INITIALIZE KO-FI FLOATING WIDGET
	onMount(() => {
		if (typeof window === 'undefined') return;

		function initKofi() {
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
			script.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
			script.async = true;
			script.onload = initKofi;
			document.body.appendChild(script);
		}

		return () => {
			const floatingButtons = document.querySelectorAll(
				'.floatingchat-container-wrap, .floating-chat-kofi-popup-iframe, #kofi-widget-overlay',
			);
			floatingButtons.forEach((el) => el.remove());
		};
	});
</script>

<svelte:head>
	<title>About — XianScan</title>
	<meta
		name="description"
		content="About XianScan — Native open-source comic translation server, inpainter, and typesetting studio for Manhua, Manhwa, and Manga by Arben Apura."
	/>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-12 py-4">
	<!-- MAIN HEADER -->
	<header class="space-y-4">
		<div class="flex items-center gap-3.5">
			<img src="/favicon.svg" alt="XianScan Cinnabar Seal" class="h-11 w-11 rounded-2xl shadow-xs" />
			<div>
				<h1 class="text-2xl sm:text-3xl font-bold font-comic tracking-tight text-neutral-900 dark:text-neutral-100">
					Xian<span class="text-[#b23a2e] dark:text-[#e08a63]">Scan</span>
				</h1>
				<p class="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">Native comic translation server for Chinese Manhua, Korean Manhwa & Japanese Manga</p>
			</div>
		</div>
		<p class="text-sm sm:text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
			XianScan is an open-source, local-first comic translation studio engineered with Rust, ONNX Runtime, and SvelteKit. It automates the entire localization workflow—from 1-click browser importing and neural bubble detection to multi-language OCR, LaMa artwork inpainting, and Skia canvas typesetting.
		</p>
	</header>

	<!-- AUTHOR & LINKS -->
	<section class="rounded-2xl border border-black/10 bg-black/[0.02] p-6 sm:p-7 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
		<div>
			<h2 class="text-base font-bold text-neutral-900 dark:text-neutral-100">Creator & Development</h2>
			<p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
				Architected and built by <strong class="text-neutral-900 dark:text-neutral-100 font-semibold">Arben Apura</strong> as a high-performance open-source translation studio for comic readers, language learners, and localization teams.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-3 pt-1">
			<!-- GITHUB REPOSITORY -->
			<a
				href="https://github.com/ArbenApura/xianscan-rust"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:border-black/30 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-white/30 dark:hover:bg-white/10"
			>
				<Github size={15} />
				<span>GitHub Repository</span>
				<ExternalLink size={12} class="opacity-40" />
			</a>

			<!-- PERSONAL PORTFOLIO -->
			<a
				href="https://arbenger.com/contact/"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:border-black/30 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-white/30 dark:hover:bg-white/10"
			>
				<Globe size={15} />
				<span>arbenger.com</span>
				<ExternalLink size={12} class="opacity-40" />
			</a>

			<!-- LIBRARY SHORTCUT -->
			<a
				href="/app"
				use:ripple
				class="inline-flex items-center gap-2 rounded-xl bg-black/[0.05] px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-black/[0.08] dark:bg-white/[0.05] dark:text-neutral-300 dark:hover:bg-white/[0.08] transition"
			>
				<BookOpen size={15} />
				<span>Open Library</span>
			</a>
		</div>
	</section>

	<!-- HOW IT WORKS PIPELINE -->
	<section class="space-y-4">
		<div>
			<h2 class="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
				<Layers size={18} class="text-[#b23a2e] dark:text-[#e08a63]" />
				Automated 5-Stage Pipeline
			</h2>
			<p class="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
				Each page streams continuously through five automated neural processing stages:
			</p>
		</div>

		<div class="rounded-2xl border border-black/10 bg-white/50 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-md overflow-hidden divide-y divide-black/5 dark:divide-white/5">
			<!-- STAGE 1: DETECTION & SEGMENTATION -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">01</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">RT-DETR Detection & Segmentation</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">RT-DETR · Comic Text & Bubble Detector</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Locates vertical and horizontal dialogue bubbles, sound effects, and narrative boxes with an RT-DETR model.
				</p>
			</div>

			<!-- STAGE 2: OCR -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">02</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Multi-Script OCR Recognition</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">RapidOCR / PP-OCRv6</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Extracts horizontal and vertical text across 10 languages (Simplified & Traditional Chinese, Japanese, Korean, Thai, Indonesian, English, Spanish, French, Russian) with direction classification.
				</p>
			</div>

			<!-- STAGE 3: TRANSLATION & GLOSSARY -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">03</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Contextual Translation & Series Glossaries</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">Ollama / LM Studio · Cloud AI · Aho-Corasick</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Translates dialogue using free local LLMs (Qwen 2.5/3, Llama 3.3, TranslateGemma) or cloud APIs (Gemini, OpenAI, Groq, OpenRouter), enforcing consistent character names, cultivation realms, and skill terms via dynamic Aho-Corasick glossary matching.
				</p>
			</div>

			<!-- STAGE 4: INPAINTING -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">04</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">LaMa Neural Artwork Inpainting</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">LaMa ONNX · Patch / Balanced / Dynamic Modes</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Erases original source characters seamlessly using Large Mask Inpainting (LaMa), restoring background artwork, textures, screentones, and gradients without destructive white-box overlays.
				</p>
			</div>

			<!-- STAGE 5: TYPESETTING -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">05</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Dynamic Skia Typesetting Studio</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">@napi-rs/canvas · Auto Font Scaling · CJK Fallbacks</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Renders translated dialogue with automatic font scaling, boundary fitting, diagonal tilt rotation, stroke outlines, and automatic CJK font fallbacks matched to the original comic bubble contours.
				</p>
			</div>
		</div>
	</section>

	<!-- KEY FEATURES LIST -->
	<section class="space-y-4">
		<div>
			<h2 class="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
				<Sparkles size={18} class="text-[#b23a2e] dark:text-[#e08a63]" />
				Key Features
			</h2>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
			<!-- LOCAL-FIRST -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<ShieldCheck size={16} class="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">100% Local-First & Private:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Standalone binary (self-contained, size varies by platform) running completely offline with SQLite and raw images on your local disk.</p>
				</div>
			</div>

			<!-- HARDWARE FREEDOM -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Zap size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Runs on Any CPU (No GPU Required):</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Multi-threaded SIMD inference (AVX2, AVX-512, ARM NEON) with automatic DirectML (Windows), CoreML/Metal (macOS), or CUDA (Linux) GPU acceleration.</p>
				</div>
			</div>

			<!-- BROWSER EXTENSION -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Puzzle size={16} class="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">1-Click Browser Extension:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Fast DOM scanner for Chrome, Firefox, Edge, and Brave with a 4-tier noise filter to drop ads and placeholders.</p>
				</div>
			</div>

			<!-- PARALLEL PROCESSING -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Cpu size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Parallel Chapter Processing:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Translate 1 to 8 concurrent page worker threads with lookahead background pre-slicing.</p>
				</div>
			</div>

			<!-- SMART GUTTER RESLICING -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Palette size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Smart Gutter Re-slicing:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Combines fragmented webtoon strips and slices along panel gutters to avoid bisecting speech bubbles.</p>
				</div>
			</div>

			<!-- GLOSSARY MANAGEMENT -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Languages size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Series Terminology Glossaries:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Import, export, and manage series terms via CSV with automatic Aho-Corasick pattern matching.</p>
				</div>
			</div>

			<!-- READING & STUDIO MODES -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<BookOpen size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">3 Reading & Studio Modes:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Continuous Webtoon scroll, Card Grid overview with drag reordering, and Side-by-Side compare.</p>
				</div>
			</div>

			<!-- MIHON MOBILE READER -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Smartphone size={16} class="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Mihon / Tachiyomi Reader (Android):</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Browse dedicated covers, series metadata, and read translated chapters on phones and tablets via our 1-click extension repo.</p>
				</div>
			</div>

			<!-- EXPORT -->
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Download size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">High-Resolution ZIP / CBZ Export:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Download full translated chapters packaged as ZIP archives with one click.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- FAQ ACCORDION SECTION -->
	<section class="space-y-4">
		<div>
			<h2 class="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
				<HelpCircle size={18} class="text-[#b23a2e] dark:text-[#e08a63]" />
				Frequently Asked Questions
			</h2>
			<p class="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
				Quick answers to common questions about setup, models, and features:
			</p>
		</div>

		<div class="overflow-hidden rounded-2xl border border-black/10 bg-white/50 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-md divide-y divide-black/5 dark:divide-white/5">
			{#each FAQS as faq, i}
				{@const isOpen = openFaq === i}
				<div>
					<button
						type="button"
						on:click={() => toggleFaq(i)}
						use:ripple
						class="flex w-full items-center justify-between gap-4 p-4.5 sm:p-5 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
						aria-expanded={isOpen}
					>
						<span class="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
							{faq.q}
						</span>
						<span
							class={`shrink-0 rounded-lg p-1 text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ${
								isOpen ? 'rotate-180 text-[#b23a2e] dark:text-[#e08a63]' : ''
							}`}
						>
							<ChevronDown size={16} />
						</span>
					</button>

					{#if isOpen}
						<div
							transition:slide={{ duration: 180 }}
							class="px-4.5 pb-5 sm:px-5 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed border-t border-black/5 dark:border-white/5 pt-3"
						>
							{faq.a}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- SUPPORT SECTION -->
	<section class="rounded-2xl border border-black/10 bg-black/[0.02] p-6 sm:p-7 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			<div class="space-y-1">
				<h2 class="text-base font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
					<Heart size={16} class="text-[#b23a2e]" fill="currentColor" />
					Support XianScan Development
				</h2>
				<p class="text-xs text-neutral-500 dark:text-neutral-400">
					If XianScan is helpful to your translation or editing workflow, consider supporting on Ko-fi.
				</p>
			</div>

			<!-- KO-FI SUPPORT BUTTON -->
			<a
				href="https://ko-fi.com/arbenapura"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#b23a2e] hover:bg-[#c0392b] text-white px-5 py-2.5 text-xs font-bold shadow-xs transition active:scale-95 shrink-0"
			>
				<Coffee size={15} />
				<span>Support on Ko-fi</span>
				<ExternalLink size={12} class="opacity-70" />
			</a>
		</div>
	</section>
</div>
