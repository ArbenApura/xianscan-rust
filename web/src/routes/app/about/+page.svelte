<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
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

	let openFaq: number | null = 0;

	function toggleFaq(index: number) {
		openFaq = openFaq === index ? null : index;
	}

	const faqs = [
		{
			q: 'Is XianScan open source and free to use?',
			a: 'Yes. XianScan is free and open-source software under the MIT License. The complete Rust engine, pipeline code, and web studio are publicly hosted on GitHub at https://github.com/ArbenApura/xianscan-rust.',
		},
		{
			q: 'Can I use XianScan completely offline?',
			a: 'Yes. The unified native Rust server runs ComicTextDetector, RapidOCR, and LaMa neural inpainting locally on your GPU/CPU without needing Python or an internet connection. If paired with a local LLM runner (like Ollama), the entire translation and typesetting pipeline works 100% offline.',
		},
		{
			q: 'Does XianScan require a dedicated GPU?',
			a: 'A GPU with DirectML or CUDA acceleration provides the fastest text detection and inpainting speeds, but the local sidecar also supports standard CPU execution seamlessly on any modern computer.',
		},
		{
			q: 'Where are my images and chapter data stored?',
			a: 'Everything is stored 100% locally on your computer in the app data directory. XianScan does not upload your raw comic images or SQLite database to any external cloud servers.',
		},
		{
			q: 'Does XianScan support Japanese (Manga) or Korean (Manhwa) source languages?',
			a: 'For now, XianScan is specialized and optimized primarily for Chinese Manhua. However, dedicated text detection and OCR pipelines for Japanese Manga and Korean Manhwa are planned and will expand in future releases.',
		},
		{
			q: 'How does Smart Re-slicing work?',
			a: 'Long vertical webtoons are often arbitrarily cut across dialogue bubbles by raw scan sites. Smart Re-slicing stitches chapter slices continuously and analyzes non-text whitespace gutters to re-cut pages cleanly without bisecting any speech bubbles.',
		},
	];

	// INITIALIZE KO-FI FLOATING WIDGET
	onMount(() => {
		if (typeof window === 'undefined') return;

		function initKofi() {
			if ((window as any).kofiWidgetOverlay) {
				try {
					(window as any).kofiWidgetOverlay.draw('arbenapura', {
						type: 'floating-chat',
						'floating-chat.donateButton.text': 'Support me',
						'floating-chat.donateButton.background-color': '#d9534f',
						'floating-chat.donateButton.text-color': '#fff',
					});
				} catch {
					// ignore if already drawn
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
	<meta name="description" content="About XianScan — Open-source local manhua translator, typesetter, and reader studio by Arben Apura." />
</svelte:head>

<div class="mx-auto max-w-3xl space-y-12 py-4">
	<!-- MAIN HEADER -->
	<header class="space-y-4">
		<div class="flex items-center gap-3.5">
			<img src="/favicon.svg" alt="XianScan Logo" class="h-11 w-11 rounded-2xl shadow-xs" />
			<div>
				<h1 class="text-2xl sm:text-3xl font-bold font-comic tracking-tight text-neutral-900 dark:text-neutral-100">
					Xian<span class="text-[#b23a2e] dark:text-[#e08a63]">Scan</span>
				</h1>
				<p class="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">Open-source local manhua translator, typesetter & reader</p>
			</div>
		</div>
		<p class="text-sm sm:text-base text-neutral-700 dark:text-neutral-300 leading-relaxed">
			XianScan was built to solve the hardest problems in vertical manhua and webtoon localization: continuous image slicing across dialogue bubbles, terminology consistency across hundreds of chapters, clean neural inpainting, and automated high-resolution typesetting.
		</p>
	</header>

	<!-- AUTHOR & LINKS -->
	<section class="rounded-2xl border border-black/10 bg-black/[0.02] p-6 sm:p-7 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
		<div>
			<h2 class="text-base font-bold text-neutral-900 dark:text-neutral-100">Creator & Development</h2>
			<p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
				Created and developed by <strong class="text-neutral-900 dark:text-neutral-100 font-semibold">Arben Apura</strong> as a personal open-source project for comic lovers, scanlators, and readers who want fast, local, and accurate manhua localization.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-3 pt-1">
			<!-- GITHUB REPO -->
			<a
				href="https://github.com/ArbenApura/xianscan-rust"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:border-black/30 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-white/30 dark:hover:bg-white/10"
			>
				<Github size={15} />
				<span>GitHub Repository</span>
				<ExternalLink size={12} class="opacity-40" />
			</a>

			<!-- PERSONAL WEBSITE -->
			<a
				href="https://arbenger.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition hover:border-black/30 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-white/30 dark:hover:bg-white/10"
			>
				<Globe size={15} />
				<span>arbenger.com</span>
				<ExternalLink size={12} class="opacity-40" />
			</a>

			<!-- LIBRARY SHORTCUT -->
			<a
				href="/app"
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
				Translation Pipeline
			</h2>
			<p class="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
				Each page streams continuously through four autonomous processing stages:
			</p>
		</div>

		<div class="rounded-2xl border border-black/10 bg-white/50 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-md overflow-hidden divide-y divide-black/5 dark:divide-white/5">
			<!-- STAGE 1 -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">01</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Text Detection & OCR</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">Comic-CTD · PaddleOCR</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Identifies vertical and horizontal dialogue bubbles, narrative boxes, and SFX text boundaries using local neural segmentation models, extracting Chinese or Japanese characters with layout orientation tags.
				</p>
			</div>

			<!-- STAGE 2 -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">02</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Glossary Memory & Translation</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">AI Engine · KV Prefix Cache</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Injects series glossaries, character names, cultivation realms, and previous context. Glossary terms are alphabetically sorted to maximize LLM KV-cache prefix hits for high-speed, consistent translations.
				</p>
			</div>

			<!-- STAGE 3 -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">03</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Neural Inpainting & Bubble Restoration</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">LaMa Neural Inpainter · DirectML / CUDA</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Erases the source characters cleanly using neural inpainting without harming background art, screentones, or speech bubble gradients, preparing a pristine canvas for target typesetting.
				</p>
			</div>

			<!-- STAGE 4 -->
			<div class="p-5 sm:p-6 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
				<div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mb-1.5">
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] bg-[#b23a2e]/10 px-2 py-0.5 rounded-md">04</span>
						<h3 class="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100">Dynamic Canvas Typesetting</h3>
					</div>
					<span class="text-[11px] font-mono opacity-50 pl-9 sm:pl-0">@napi-rs/canvas · Auto Font Scaling</span>
				</div>
				<p class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pl-9 sm:pl-9">
					Typesets translated text with dynamic font size calculation, natural multi-line wrapping, text stroke outlines, bubble padding, and vertical/horizontal alignment matched to the original comic bubble geometry.
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
			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<ShieldCheck size={16} class="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Local-First & Private:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Your raw images, chapters, and database stay on your local disk.</p>
				</div>
			</div>

			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Cpu size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Multi-Chapter Parallel Worker:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Translate 1 to 4 chapters concurrently with lookahead background pre-slicing.</p>
				</div>
			</div>

			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Palette size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Smart Gutter Re-slicing:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Combines fragmented webtoon slices and cuts along non-text whitespace gutters.</p>
				</div>
			</div>

			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Languages size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">Custom Glossary Management:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Import, export, and manage series terms via CSV with automatic matching.</p>
				</div>
			</div>

			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<BookOpen size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">3 Reading & Edit Modes:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Continuous Webtoon scroll, Card Grid overview with drag reordering, and Side-by-Side compare.</p>
				</div>
			</div>

			<div class="flex items-start gap-2.5 rounded-xl border border-black/10 bg-black/[0.01] p-3.5 dark:border-white/10 dark:bg-white/[0.01]">
				<Download size={16} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0 mt-0.5" />
				<div>
					<strong class="font-semibold text-neutral-900 dark:text-neutral-100">High-Resolution ZIP Export:</strong>
					<p class="text-neutral-600 dark:text-neutral-400 mt-0.5">Download full translated chapters packaged as CBZ/ZIP archives with one click.</p>
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
			{#each faqs as faq, i}
				{@const isOpen = openFaq === i}
				<div>
					<button
						type="button"
						on:click={() => toggleFaq(i)}
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
					<Heart size={16} class="text-[#d9534f]" fill="currentColor" />
					Support XianScan Development
				</h2>
				<p class="text-xs text-neutral-500 dark:text-neutral-400">
					If XianScan is helpful to your translation or editing workflow, consider supporting on Ko-fi.
				</p>
			</div>

			<a
				href="https://ko-fi.com/arbenapura"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d9534f] hover:bg-[#c9302c] text-white px-5 py-2.5 text-xs font-bold shadow-xs transition active:scale-95 shrink-0"
			>
				<Coffee size={15} />
				<span>Support on Ko-fi</span>
				<ExternalLink size={12} class="opacity-70" />
			</a>
		</div>
	</section>
</div>
