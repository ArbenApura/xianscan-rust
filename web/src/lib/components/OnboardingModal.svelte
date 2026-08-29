<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { settings } from '$lib/stores/settings';
	// IMPORTED ICONS
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Check from 'lucide-svelte/icons/check';
	import Cloud from 'lucide-svelte/icons/cloud';
	import Cpu from 'lucide-svelte/icons/cpu';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import Globe from 'lucide-svelte/icons/globe';
	import Languages from 'lucide-svelte/icons/languages';
	import MonitorSmartphone from 'lucide-svelte/icons/monitor-smartphone';
	import VolumeX from 'lucide-svelte/icons/volume-x';
	import X from 'lucide-svelte/icons/x';
	import Zap from 'lucide-svelte/icons/zap';
	// IMPORTED UI COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import InkDivider from '$lib/components/ui/InkDivider.svelte';

	// -- PROPS & DISPATCHER -- //
	export let open = false;

	const dispatch = createEventDispatcher<{
		close: void;
		complete: void;
	}>();

	// -- CONSTANTS -- //
	const RELEASES_URL = 'https://github.com/ArbenApura/xianscan-rust/releases/latest';

	// -- STEP STATE -- //
	let currentStep = 0;
	const TOTAL_STEPS = 3;

	// ALWAYS RESET TO STEP 0 WHENEVER OPEN IS FALSE
	$: if (!open) {
		currentStep = 0;
	}

	function nextStep() {
		if (currentStep < TOTAL_STEPS - 1) {
			currentStep += 1;
		} else {
			completeOnboarding();
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep -= 1;
		}
	}

	function goToStep(index: number) {
		if (index >= 0 && index < TOTAL_STEPS) {
			currentStep = index;
		}
	}

	function completeOnboarding() {
		settings.update((s) => ({ ...s, hasCompletedOnboarding: true }));
		currentStep = 0;
		open = false;
		dispatch('complete');
		dispatch('close');
	}

	function skipOnboarding() {
		settings.update((s) => ({ ...s, hasCompletedOnboarding: true }));
		currentStep = 0;
		open = false;
		dispatch('close');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowRight') {
			nextStep();
		} else if (e.key === 'ArrowLeft') {
			prevStep();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<Modal
	bind:open
	size="lg"
	placement="center"
	bodyClass="p-0"
	closable={false}
>
	<div class="relative flex flex-col overflow-hidden text-current">
		<!-- HEADER WITH CANONICAL XIANSCAN LOGO, TITLE & SKIP -->
		<div class="flex items-center justify-between px-4 py-3.5 sm:px-8 sm:pt-5 sm:pb-3.5 shrink-0">
			<div class="flex items-center gap-2.5 sm:gap-3">
				<img src="/favicon.svg" alt="XianScan Logo" class="h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-lg shadow-xs" />
				<div>
					<h2 class="text-sm sm:text-lg font-bold tracking-tight font-comic">
						<span class="text-[#b23a2e] dark:text-[#e08a63]">Xian</span><span class="text-black dark:text-white">Scan</span> Tour
					</h2>
					<p class="text-[10.5px] sm:text-xs opacity-60">Step {currentStep + 1} of {TOTAL_STEPS}</p>
				</div>
			</div>

			<button
				type="button"
				on:click={skipOnboarding}
				class="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium opacity-60 transition-all hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 cursor-pointer"
				aria-label="Skip welcome tour"
				use:ripple
			>
				<span>Skip</span>
				<X size={15} />
			</button>
		</div>

		<InkDivider class="opacity-40" />

		<!-- RESPONSIVE SLIDE STACK: SCROLLABLE AUTO-HEIGHT ON MOBILE, BALANCED FIXED ON DESKTOP -->
		<div class="relative px-4 py-4 sm:px-8 sm:py-5.5 max-h-[62vh] sm:max-h-none sm:h-[325px] overflow-y-auto sm:overflow-hidden grid grid-cols-1 grid-rows-1 items-stretch">
			{#if currentStep === 0}
				<!-- SLIDE 1: TRANSLATION PIPELINE, LLM & SFX NOTICE -->
				<div
					in:fly={{ x: 14, duration: 180, easing: cubicOut }}
					out:fade={{ duration: 90 }}
					class="col-start-1 row-start-1 flex flex-col justify-between space-y-3 sm:space-y-0 h-full"
				>
					<div class="space-y-2.5 sm:space-y-3">
						<div class="flex items-center gap-2 sm:gap-2.5">
							<div class="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-[#b23a2e]/10 text-[#b23a2e] dark:text-[#e08a63]">
								<Zap size={15} />
							</div>
							<h3 class="text-xs sm:text-base font-bold">1. End-to-End Translation Pipeline</h3>
						</div>

						<p class="text-[11.5px] sm:text-sm leading-relaxed opacity-75">
							XianScan brings complete comic translation to your machine: bubble segmentation, multi-language OCR, LLM translation, neural inpainting (LaMa), and typography layout.
						</p>

						<!-- PIPELINE FLOW 4 MINI-BADGES -->
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 pt-0.5 text-center">
							<div class="rounded-xl border border-black/5 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/5 dark:bg-white/[0.02]">
								<div class="text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-[#b23a2e] dark:text-[#e08a63]">1. Detect</div>
								<div class="text-[11px] sm:text-xs opacity-75 mt-0.5 font-medium">RF-DETR + OCR</div>
							</div>
							<div class="rounded-xl border border-black/5 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/5 dark:bg-white/[0.02]">
								<div class="text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">2. LLM AI</div>
								<div class="text-[11px] sm:text-xs opacity-75 mt-0.5 font-medium">Local or Cloud</div>
							</div>
							<div class="rounded-xl border border-black/5 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/5 dark:bg-white/[0.02]">
								<div class="text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">3. Inpaint</div>
								<div class="text-[11px] sm:text-xs opacity-75 mt-0.5 font-medium">LaMa Erasing</div>
							</div>
							<div class="rounded-xl border border-black/5 bg-black/[0.02] p-2 sm:p-2.5 dark:border-white/5 dark:bg-white/[0.02]">
								<div class="text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">4. Typeset</div>
								<div class="text-[11px] sm:text-xs opacity-75 mt-0.5 font-medium">Skia Fonts</div>
							</div>
						</div>
					</div>

					<!-- PROMINENT SFX STATUS NOTICE -->
					<div class="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 sm:p-3 text-left">
						<div class="rounded-md bg-amber-500/20 p-1 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
							<VolumeX size={14} />
						</div>
						<div class="space-y-0.5">
							<div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
								<span class="text-[11px] sm:text-[12.5px] font-bold text-amber-900 dark:text-amber-200">
									Sound Effects (SFX) Paused
								</span>
								<Badge variant="amber">In Development</Badge>
							</div>
							<p class="text-[10.5px] sm:text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
								SFX inpainting is temporarily disabled because stylized text is prone to visual artifacts. Dedicated SFX models are in active development for an upcoming release!
							</p>
						</div>
					</div>
				</div>

			{:else if currentStep === 1}
				<!-- SLIDE 2: LOCAL OR CLOUD LLMs & GLOSSARY -->
				<div
					in:fly={{ x: 14, duration: 180, easing: cubicOut }}
					out:fade={{ duration: 90 }}
					class="col-start-1 row-start-1 flex flex-col justify-between space-y-3 sm:space-y-0 h-full"
				>
					<div class="space-y-2.5 sm:space-y-3">
						<div class="flex items-center gap-2 sm:gap-2.5">
							<div class="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
								<Languages size={15} />
							</div>
							<h3 class="text-xs sm:text-base font-bold">2. Local & Cloud AI Translation</h3>
						</div>

						<p class="text-[11.5px] sm:text-sm leading-relaxed opacity-75">
							Translate dialogue using your preferred AI backend with full context memory and custom martial arts / name glossaries.
						</p>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-0.5">
							<!-- LOCAL AI CARD -->
							<div class="flex flex-col justify-between rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
								<div class="space-y-1 sm:space-y-1.5">
									<div class="flex items-center gap-1.5 sm:gap-2 text-[11.5px] sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">
										<Cpu size={15} />
										<span>Local AI (Offline & Free)</span>
									</div>
									<p class="text-[11px] sm:text-xs opacity-75 leading-relaxed">
										Connect to <strong>Ollama</strong> or <strong>LM Studio</strong> (e.g. Qwen, Llama). 100% private with zero API token costs.
									</p>
								</div>
							</div>

							<!-- CLOUD AI CARD -->
							<div class="flex flex-col justify-between rounded-xl border border-black/10 bg-black/[0.02] p-2.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
								<div class="space-y-1.5">
									<div class="flex items-center gap-1.5 sm:gap-2 text-[11.5px] sm:text-sm font-bold text-indigo-600 dark:text-indigo-400">
										<Cloud size={15} />
										<span>Cloud AI APIs</span>
									</div>
									<p class="text-[11px] sm:text-xs opacity-75 leading-relaxed">
										Connect <strong>Gemini</strong>, <strong>OpenAI</strong>, <strong>Groq</strong>, or <strong>OpenRouter</strong> for ultra-fast chapter translations.
									</p>
								</div>
							</div>
						</div>
					</div>

					<p class="text-[10.5px] sm:text-xs opacity-60 italic text-center pt-1 sm:pt-0">
						Configure your API keys or local endpoint anytime in <strong>Preferences & Configuration &gt; AI Translation Providers</strong>.
					</p>
				</div>

			{:else}
				<!-- SLIDE 3: BROWSER EXTENSION, MIHON & RELEASES LINK -->
				<div
					in:fly={{ x: 14, duration: 180, easing: cubicOut }}
					out:fade={{ duration: 90 }}
					class="col-start-1 row-start-1 flex flex-col justify-between space-y-3 sm:space-y-0 h-full"
				>
					<div class="space-y-2.5 sm:space-y-3">
						<div class="flex items-center gap-2 sm:gap-2.5">
							<div class="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
								<MonitorSmartphone size={15} />
							</div>
							<h3 class="text-xs sm:text-base font-bold">3. Capture & Mobile Reading</h3>
						</div>

						<p class="text-[11.5px] sm:text-sm leading-relaxed opacity-75">
							Capture raw webtoons directly from your browser and stream finished chapters to your mobile devices.
						</p>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-0.5">
							<!-- CLICKABLE WEB IMPORTER EXTENSION CARD (LATEST RELEASE) -->
							<a
								href={RELEASES_URL}
								target="_blank"
								rel="noopener noreferrer"
								class="group flex flex-col justify-between rounded-xl border border-black/10 bg-black/[0.02] hover:bg-black/[0.04] p-2.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05] hover:border-[#b23a2e]/40 dark:hover:border-[#e08a63]/40 transition-all duration-150 active:scale-[0.99] cursor-pointer"
								title="Download latest Web Importer Extension release"
								use:ripple
							>
								<div class="space-y-1 sm:space-y-1.5">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1.5 sm:gap-2 text-[11.5px] sm:text-sm font-bold text-[#b23a2e] dark:text-[#e08a63]">
											<Globe size={15} />
											<span>Web Importer Extension</span>
										</div>
										<ExternalLink size={12} class="opacity-40 group-hover:opacity-100 transition-opacity text-[#b23a2e] dark:text-[#e08a63]" />
									</div>
									<p class="text-[11px] sm:text-xs opacity-75 leading-relaxed">
										1-click chapter capture from web comic sites with autoscroll and smart gutter re-slicing.
									</p>
								</div>
							</a>

							<!-- CLICKABLE MIHON / TACHIYOMI EXTENSION CARD (LATEST RELEASE) -->
							<a
								href={RELEASES_URL}
								target="_blank"
								rel="noopener noreferrer"
								class="group flex flex-col justify-between rounded-xl border border-black/10 bg-black/[0.02] hover:bg-black/[0.04] p-2.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05] hover:border-emerald-500/40 dark:hover:border-emerald-400/40 transition-all duration-150 active:scale-[0.99] cursor-pointer"
								title="Download latest Mihon Extension release"
								use:ripple
							>
								<div class="space-y-1 sm:space-y-1.5">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1.5 sm:gap-2 text-[11.5px] sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
											<BookOpen size={15} />
											<span>Mihon / Tachiyomi</span>
										</div>
										<ExternalLink size={12} class="opacity-40 group-hover:opacity-100 transition-opacity text-emerald-600 dark:text-emerald-400" />
									</div>
									<p class="text-[11px] sm:text-xs opacity-75 leading-relaxed">
										Stream translated chapters directly to your Android phone or E-Ink tablet over local Wi-Fi.
									</p>
								</div>
							</a>
						</div>
					</div>

					<p class="text-[10.5px] sm:text-xs opacity-60 text-center pt-1 sm:pt-0">
						You're all set! Replay this tour anytime from <strong>Preferences & Configuration &gt; About & Diagnostics</strong>.
					</p>
				</div>
			{/if}
		</div>

		<InkDivider class="opacity-40" />

		<!-- FOOTER ACTIONS & STEP DOTS -->
		<div class="flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 bg-black/[0.01] dark:bg-white/[0.01] shrink-0">
			<!-- STEP PROGRESS DOTS -->
			<div class="flex items-center gap-1.5 sm:gap-2" role="tablist" aria-label="Tour progress">
				{#each Array(TOTAL_STEPS) as _, i}
					<button
						type="button"
						on:click={() => goToStep(i)}
						class={`h-2 sm:h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
							currentStep === i
								? 'w-5 sm:w-7 bg-[#b23a2e] dark:bg-[#e08a63]'
								: 'w-2 sm:w-2.5 bg-black/20 hover:bg-black/40 dark:bg-white/20 dark:hover:bg-white/40'
						}`}
						aria-label={`Go to step ${i + 1}`}
						aria-selected={currentStep === i}
						role="tab"
					></button>
				{/each}
			</div>

			<!-- NAVIGATION BUTTONS -->
			<div class="flex items-center gap-1.5 sm:gap-2.5">
				{#if currentStep > 0}
					<Button
						variant="ghost"
						size="sm"
						on:click={prevStep}
						class="px-3 sm:px-4 sm:h-10 text-xs sm:text-sm"
					>
						<ArrowLeft size={14} class="mr-1 sm:mr-1.5" />
						<span>Back</span>
					</Button>
				{/if}

				{#if currentStep < TOTAL_STEPS - 1}
					<Button
						variant="primary"
						size="sm"
						on:click={nextStep}
						class="px-4 sm:px-5 sm:h-10 text-xs sm:text-sm shadow-sm shadow-[#b23a2e]/20"
					>
						<span>Next</span>
						<ArrowRight size={14} class="ml-1 sm:ml-1.5" />
					</Button>
				{:else}
					<Button
						variant="primary"
						size="sm"
						on:click={completeOnboarding}
						class="px-4 sm:px-6 sm:h-10 text-xs sm:text-sm shadow-md shadow-[#b23a2e]/20 font-bold"
					>
						<span>Get Started</span>
						<Check size={14} class="ml-1 sm:ml-1.5" />
					</Button>
				{/if}
			</div>
		</div>
	</div>
</Modal>
