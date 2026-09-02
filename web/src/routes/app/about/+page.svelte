<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount, onDestroy } from 'svelte';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';
	import { versionCheck } from '$lib/stores/version-check';
	// IMPORTED DEP-COMPONENTS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Check from 'lucide-svelte/icons/check';
	import Coffee from 'lucide-svelte/icons/coffee';
	import Compass from 'lucide-svelte/icons/compass';
	import Copy from 'lucide-svelte/icons/copy';
	import Download from 'lucide-svelte/icons/download';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Github from 'lucide-svelte/icons/github';
	import Globe from 'lucide-svelte/icons/globe';
	import Heart from 'lucide-svelte/icons/heart';
	import Smartphone from 'lucide-svelte/icons/smartphone';
	import Zap from 'lucide-svelte/icons/zap';
	// IMPORTED COMPONENTS
	import { DiscordLogo, Seal } from '$lib/components/ui';
	import OnboardingModal from '$lib/components/OnboardingModal.svelte';

	// -- CONSTANTS -- //
	const DOCS_URL = 'https://xianscan.arbenger.com';
	const IMPORTER_DOCS_URL = 'https://xianscan.arbenger.com/docs/extensions/importer/';
	const MIHON_DOCS_URL = 'https://xianscan.arbenger.com/docs/extensions/mihon/';
	const GITHUB_RELEASES_URL = 'https://github.com/ArbenApura/xianscan-rust/releases/latest';
	const MIHON_REPO_URL = 'https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json';

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

<div class="mx-auto max-w-4xl space-y-4 sm:space-y-6 font-sans text-neutral-800 dark:text-neutral-200">
	<!-- APP IDENTITY & HERO -->
	<header class="rounded-2xl border border-black/10 bg-black/[0.015] p-4 sm:p-6 dark:border-white/10 dark:bg-white/[0.015] space-y-3 sm:space-y-4">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
			<div class="flex items-center gap-2.5 sm:gap-3">
				<Seal char="仙" size={28} />
				<div class="min-w-0">
					<div class="flex items-center gap-2 flex-wrap">
						<h1 class="text-lg sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
							XianScan
						</h1>
						<span class="rounded-md bg-[#b23a2e]/10 px-2 py-0.5 text-[10.5px] sm:text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63] font-mono shrink-0">
							v{$versionCheck.currentVersion}
						</span>
					</div>
					<p class="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
						Self-contained, local-first comic translation engine for Chinese, Korean, and Japanese.
					</p>
				</div>
			</div>

			<div class="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 pt-1 sm:pt-0">
				<button
					type="button"
					on:click={() => (tourOpen = true)}
					use:ripple
					class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#c0392b] text-white px-3 py-2 text-xs font-bold transition shadow-xs shadow-[#b23a2e]/20 cursor-pointer active:scale-95 text-center"
				>
					<Compass size={14} class="shrink-0" />
					<span class="truncate">Welcome Tour</span>
				</button>
				<a
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					use:ripple
					class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
				>
					<BookOpen size={14} class="text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
					<span>Docs</span>
					<ExternalLink size={10} class="opacity-50 shrink-0" />
				</a>
			</div>
		</div>

		<p class="text-[11.5px] sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed pt-2.5 border-t border-black/5 dark:border-white/5">
			XianScan automates the entire localization workflow on your local machine: detecting dialogue bubbles with RF-DETR Seg, extracting text via 10-language OCR, translating with LLMs, inpainting backgrounds with LaMa, and rendering typography with Google Skia.
		</p>
	</header>

	<!-- INTEGRATIONS & EXTENSIONS -->
	<section class="space-y-2.5 sm:space-y-3">
		<h2 class="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1">
			Ecosystem & Downloads
		</h2>

		<div class="divide-y divide-black/5 dark:divide-white/5 rounded-2xl border border-black/10 bg-black/[0.015] dark:border-white/10 dark:bg-white/[0.015] overflow-hidden">
			<!-- ITEM 1: BROWSER EXTENSION -->
			<div class="p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-start gap-2.5 sm:gap-3 min-w-0">
						<div class="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] mt-0.5">
							<Globe size={16} class="sm:w-[18px] sm:h-[18px]" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
								<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">
									1-Click Browser Importer
								</h3>
								<span class="text-[10px] text-neutral-500">Chrome · Edge · Firefox · Brave</span>
							</div>
							<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
								Captures chapters from online comic sites and replaces panels in-place in real-time as background translation finishes.
							</p>
						</div>
					</div>

					<a
						href={IMPORTER_DOCS_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline inline-flex items-center gap-1 shrink-0 pt-0.5"
					>
						<span>Docs</span>
						<ExternalLink size={10} />
					</a>
				</div>

				<div class="grid grid-cols-2 sm:flex sm:items-center gap-2 pt-0.5">
					<a
						href={GITHUB_RELEASES_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
					>
						<Download size={13} class="shrink-0" />
						<span class="truncate">Chrome / Edge</span>
					</a>
					<a
						href={GITHUB_RELEASES_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
					>
						<Download size={13} class="shrink-0" />
						<span class="truncate">Firefox</span>
					</a>
				</div>
			</div>

			<!-- ITEM 2: MIHON ANDROID EXTENSION -->
			<div class="p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-start gap-2.5 sm:gap-3 min-w-0">
						<div class="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] mt-0.5">
							<Smartphone size={16} class="sm:w-[18px] sm:h-[18px]" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
								<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">
									Mihon & Tachiyomi Extension
								</h3>
								<span class="text-[10px] text-neutral-500">Android · E-Ink</span>
							</div>
							<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
								Stream and read translated chapters over your local home Wi-Fi directly in Mihon or Tachiyomi.
							</p>
						</div>
					</div>

					<a
						href={MIHON_DOCS_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="text-[11px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline inline-flex items-center gap-1 shrink-0 pt-0.5"
					>
						<span>Docs</span>
						<ExternalLink size={10} />
					</a>
				</div>

				<div class="grid grid-cols-2 sm:flex sm:items-center gap-2 pt-0.5">
					<button
						type="button"
						on:click={copyMihonRepo}
						use:ripple
						class={cn(
							'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer text-center',
							isCopied
								? 'bg-emerald-600 text-white'
								: 'bg-[#b23a2e] text-white hover:bg-[#c0392b]'
						)}
					>
						{#if isCopied}
							<Check size={13} class="shrink-0" />
							<span>Copied!</span>
						{:else}
							<Copy size={13} class="shrink-0" />
							<span>Copy Repo URL</span>
						{/if}
					</button>
					<a
						href={GITHUB_RELEASES_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
					>
						<Download size={13} class="shrink-0" />
						<span>Direct APK</span>
					</a>
				</div>
			</div>

			<!-- ITEM 3: STANDALONE SERVER BINARIES -->
			<div class="p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-start gap-2.5 sm:gap-3 min-w-0">
						<div class="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63] mt-0.5">
							<Zap size={16} class="sm:w-[18px] sm:h-[18px]" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
								<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">
									Standalone Server Releases
								</h3>
								<span class="text-[10px] text-neutral-500">Windows · Linux · macOS</span>
							</div>
							<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
								Zero-dependency binaries with embedded neural models, DirectML, CUDA, and CoreML acceleration.
							</p>
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2 pt-0.5">
					<a
						href={GITHUB_RELEASES_URL}
						target="_blank"
						rel="noopener noreferrer"
						use:ripple
						class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
					>
						<Download size={13} class="shrink-0" />
						<span>GitHub Releases (All Platforms)</span>
						<ExternalLink size={10} class="opacity-40" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- SUPPORT & CREATOR -->
	<section class="rounded-2xl border border-[#b23a2e]/20 bg-[#b23a2e]/[0.03] dark:bg-[#b23a2e]/[0.06] p-4 sm:p-6 space-y-3 sm:space-y-4">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<Heart size={15} class="text-[#b23a2e] fill-current" />
				<h3 class="font-bold text-neutral-900 dark:text-neutral-100 text-xs sm:text-base">
					Support XianScan R&D
				</h3>
			</div>
			<p class="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
				XianScan is an open-source project by Arben Apura. Your sponsorship helps sustain continuous model testing, GPU compute costs, and development.
			</p>
		</div>

		<div class="grid grid-cols-1 sm:flex sm:items-center gap-2 pt-0.5">
			<a
				href="https://ko-fi.com/arbenapura"
				target="_blank"
				rel="noopener noreferrer"
				use:ripple
				class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b23a2e] hover:bg-[#c0392b] text-white px-4 py-2 text-xs font-bold transition shadow-xs shadow-[#b23a2e]/20 active:scale-95 cursor-pointer text-center"
			>
				<Coffee size={14} class="shrink-0" />
				<span>Support on Ko-fi</span>
			</a>
			<div class="grid grid-cols-2 sm:flex sm:items-center gap-2">
				<a
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noopener noreferrer"
					use:ripple
					class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
				>
					<Github size={14} class="shrink-0" />
					<span>GitHub</span>
				</a>
				<a
					href="https://discord.gg/dRWaQftNnR"
					target="_blank"
					rel="noopener noreferrer"
					use:ripple
					class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white/60 dark:border-white/15 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[#5865F2] hover:bg-neutral-100 dark:hover:bg-white/10 transition text-center"
				>
					<DiscordLogo size={14} fill="#5865F2" class="shrink-0" />
					<span>Discord</span>
				</a>
			</div>
		</div>
	</section>

	<!-- COMPACT FOOTER -->
	<footer class="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[11px] sm:text-xs text-neutral-500 text-center sm:text-left">
		<p>
			XianScan · Created by <a href="https://arbenger.com/contact/" target="_blank" rel="noopener noreferrer" class="font-semibold text-neutral-700 dark:text-neutral-300 hover:underline">Arben Apura</a> · MIT License
		</p>
		<div class="flex items-center justify-center gap-3">
			<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="hover:underline">Docs</a>
			<span>·</span>
			<a href={IMPORTER_DOCS_URL} target="_blank" rel="noopener noreferrer" class="hover:underline">Web Importer</a>
			<span>·</span>
			<a href={MIHON_DOCS_URL} target="_blank" rel="noopener noreferrer" class="hover:underline">Mihon</a>
			<span>·</span>
			<a href="https://ko-fi.com/arbenapura" target="_blank" rel="noopener noreferrer" class="text-[#b23a2e] dark:text-[#e08a63] font-medium hover:underline">Ko-fi</a>
		</div>
	</footer>
</div>

<!-- ONBOARDING WELCOME TOUR MODAL -->
<OnboardingModal bind:open={tourOpen} />
