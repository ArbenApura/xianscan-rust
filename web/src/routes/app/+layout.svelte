<script lang="ts">
	// IMPORTED DEP-COMPONENTS
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import {
		settings,
		THEME_CLASS,
		THEME_BAR,
		type Theme,
	} from '$lib/stores/settings';
	import { activeTranslatingChapters } from '$lib/stores/job-tracker';
	import { mlStatus, type MLStatusState } from '$lib/stores/ml-status';
	// IMPORTED ICONS
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Languages from 'lucide-svelte/icons/languages';
	import Settings from 'lucide-svelte/icons/settings';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Coffee from 'lucide-svelte/icons/coffee';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Info from 'lucide-svelte/icons/info';

	// IMPORTED UI COMPONENTS
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import BatchProgressWidget from '$lib/components/BatchProgressWidget.svelte';
	import { batchProgress } from '$lib/stores/batch-tracker';

	// -- STATES -- //
	let settingsOpen = false;
	let settingsTab: 'ai' | 'compute' | 'general' = 'ai';
	let lastScrollY = 0;
	let topbarHidden = false;

	function openSettings(tab: 'ai' | 'compute' | 'general' = 'ai') {
		settingsTab = tab;
		settingsOpen = true;
	}

	onMount(() => {
		mlStatus.startPolling();
	});

	onDestroy(() => {
		mlStatus.stopPolling();
	});

	function formatSidecarLabel(state: MLStatusState): string {
		if (state.loading) return 'Checking...';
		if (!state.online) return 'ML Offline';
		if (state.activeProvider.includes('CUDA')) return 'ML • CUDA';
		if (state.activeProvider.includes('Dml') || state.activeProvider.includes('DirectML')) return 'ML • DML';
		if (state.activeProvider.includes('CoreML')) return 'ML • CoreML';
		if (state.activeProvider.includes('CPU')) return 'ML • CPU';
		return 'ML Online';
	}

	function handleScroll() {
		if (typeof window === 'undefined') return;
		const currentScrollY = window.scrollY || document.documentElement.scrollTop;

		// Always show at top of page
		if (currentScrollY <= 20) {
			topbarHidden = false;
		} else if (currentScrollY > lastScrollY && currentScrollY > 70) {
			// Scrolling downwards with minimum threshold to avoid micro-jitter
			if (currentScrollY - lastScrollY > 6) {
				topbarHidden = true;
			}
		} else if (currentScrollY < lastScrollY) {
			// Scrolling upwards
			if (lastScrollY - currentScrollY > 6) {
				topbarHidden = false;
			}
		}
		lastScrollY = currentScrollY;
	}

	const THEMES: { id: Theme; label: string; dot: string }[] = [
		{ id: 'light', label: 'Light', dot: 'border-slate-300 bg-[#fbfaf7]' },
		{ id: 'sepia', label: 'Sepia', dot: 'border-[#d4c3a3] bg-[#f4ecd8]' },
		{ id: 'dark', label: 'Dark', dot: 'border-neutral-700 bg-[#13100c]' },
	];

	const THEME_ORDER: Theme[] = ['light', 'sepia', 'dark'];

	function setTheme(t: Theme | string) {
		settings.update((s) => ({ ...s, theme: t as Theme }));
		const label = THEMES.find((item) => item.id === t)?.label || t;
		toast.success(`Theme updated to ${label}`);
	}

	function cycleTheme() {
		const currentIndex = THEME_ORDER.indexOf($settings.theme);
		const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
		setTheme(THEME_ORDER[nextIndex]);
	}

	$: activePath = $page.url.pathname as string;
	$: isGlossaryActive = activePath.startsWith('/app/glossary');
	$: isAboutActive = activePath.startsWith('/app/about');
	$: isLibraryActive = !isGlossaryActive && !isAboutActive && (activePath === '/app/' || activePath === '/app' || activePath.startsWith('/app/books'));
</script>

<svelte:window on:scroll={handleScroll} />

<!-- APP SHELL — THEMED SURFACE + TOP NAV -->
<div class={THEME_CLASS[$settings.theme] + ' min-h-screen font-sans transition-colors duration-200'}>
	<!-- TOP BAR -->
	<header
		class={`sticky top-0 z-30 border-b border-black/10 transition-all duration-300 backdrop-blur-md dark:border-white/10 ${THEME_BAR[$settings.theme]} ${
			topbarHidden ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
		}`}
	>
		<nav class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-6">
			<!-- LEFT: LOGO / HOME LINK -->
			<div class="flex items-center gap-2 sm:gap-3 min-w-0">
				<a
					href="/app"
					class="flex items-center gap-2 sm:gap-2.5 font-bold tracking-tight transition-transform duration-200 hover:opacity-85 active:scale-95 shrink-0"
					aria-label="XianScan Home"
				>
					<img src="/favicon.svg" alt="XianScan Logo" class="h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-lg shadow-2xs" />
					<span class="text-base sm:text-lg font-comic font-bold tracking-wide text-[#b23a2e] dark:text-[#e08a63]">
						Xian<span class="text-black dark:text-white">Scan</span>
					</span>
				</a>

				<!-- PRIMARY NAVIGATION TABS -->
				<div class="flex items-center gap-1 pl-1 sm:pl-3 border-l border-black/10 dark:border-white/10">
					<!-- LIBRARY LINK -->
					<a
						href="/app"
						class={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all duration-150 active:scale-95 ${
							isLibraryActive
								? 'bg-black/[0.06] text-[#b23a2e] dark:bg-white/[0.08] dark:text-[#e08a63] shadow-2xs'
								: 'text-current opacity-70 hover:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
						}`}
						aria-current={isLibraryActive ? 'page' : undefined}
					>
						<BookOpen size={14} class={isLibraryActive ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''} />
						<span class="hidden min-[480px]:inline">Library</span>
					</a>

					<!-- GLOSSARY LINK -->
					<a
						href="/app/glossary"
						class={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all duration-150 active:scale-95 ${
							isGlossaryActive
								? 'bg-black/[0.06] text-[#b23a2e] dark:bg-white/[0.08] dark:text-[#e08a63] shadow-2xs'
								: 'text-current opacity-70 hover:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
						}`}
						aria-current={isGlossaryActive ? 'page' : undefined}
					>
						<Languages size={14} class={isGlossaryActive ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''} />
						<span class="hidden min-[480px]:inline">Glossary</span>
					</a>

					<!-- ABOUT LINK -->
					<a
						href="/app/about"
						class={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all duration-150 active:scale-95 ${
							isAboutActive
								? 'bg-black/[0.06] text-[#b23a2e] dark:bg-white/[0.08] dark:text-[#e08a63] shadow-2xs'
								: 'text-current opacity-70 hover:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
						}`}
						aria-current={isAboutActive ? 'page' : undefined}
					>
						<Info size={14} class={isAboutActive ? 'text-[#b23a2e] dark:text-[#e08a63]' : ''} />
						<span class="hidden min-[480px]:inline">About</span>
					</a>
				</div>

				<!-- LIVE BACKGROUND TRANSLATION ACTIVITY BADGES -->
				{#if $batchProgress.active && ($batchProgress.status === 'running' || $batchProgress.status === 'paused')}
					<div
						class="flex items-center gap-1 sm:gap-1.5 rounded-full border border-[#b23a2e]/30 bg-[#b23a2e]/10 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] shadow-xs shrink-0"
						title={`Batch translating: ${$batchProgress.completedChapters}/${$batchProgress.totalChapters} chapters complete`}
					>
						<span class={`h-1.5 w-1.5 rounded-full bg-[#b23a2e] dark:bg-[#e08a63] ${$batchProgress.status === 'running' ? 'animate-ping' : ''}`}></span>
						<span class="hidden sm:inline">Batch</span>
						<span class="font-mono text-[10px] sm:text-xs">({$batchProgress.completedChapters}/{$batchProgress.totalChapters} chs)</span>
					</div>
				{:else}
					{#each $activeTranslatingChapters as activeJob}
						{@const snap = activeJob.snapshot}
						{@const total = snap?.totalPages || snap?.pages.length || 0}
						{@const done = snap?.completedPages || 0}
						<div
							class="flex items-center gap-1 sm:gap-1.5 rounded-full border border-[#b23a2e]/30 bg-[#b23a2e]/10 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold text-[#b23a2e] dark:text-[#e08a63] animate-pulse shadow-xs shrink-0"
							title={`Translating chapter (${done}/${total} pages)`}
						>
							<span class="h-1.5 w-1.5 rounded-full bg-[#b23a2e] dark:bg-[#e08a63]"></span>
							<span class="hidden sm:inline">Translating</span>
							<span class="font-mono text-[10px] sm:text-xs">({done}/{total})</span>
						</div>
					{/each}
				{/if}
			</div>

			<!-- RIGHT: ML SIDECAR STATUS, THEME TOGGLE & SETTINGS BUTTONS -->
			<div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
				<!-- ML SIDECAR STATUS PILL (RESPONSIVE: COMPACT ON MOBILE, EXPANDED ON TABLET/DESKTOP) -->
				<button
					type="button"
					on:click={() => openSettings('compute')}
					class={`flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border px-2 sm:px-2.5 text-xs font-semibold shadow-2xs backdrop-blur transition-all duration-200 active:scale-95 ${
						$mlStatus.online
							? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
							: $mlStatus.loading
								? 'border-black/10 bg-black/5 text-current opacity-70 dark:border-white/10 dark:bg-white/5'
								: 'border-red-500/30 bg-red-500/10 text-red-600 hover:border-red-500/50 hover:bg-red-500/15 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20'
					}`}
					title={$mlStatus.online
						? `ML Sidecar: Online (${$mlStatus.deviceLabel}) — Click to configure Compute & Speed`
						: $mlStatus.loading
							? 'Connecting to ML Sidecar service...'
							: `ML Sidecar: Offline (${$mlStatus.error || 'Unreachable'}) — Click to configure Compute & Speed`}
					aria-label="ML Sidecar Status"
					use:ripple
				>
					<Cpu size={14} class="opacity-85 shrink-0" />

					<span class="hidden min-[540px]:inline font-mono text-[11px] font-bold tracking-tight px-0.5">
						{formatSidecarLabel($mlStatus)}
					</span>
				</button>

				<!-- THEME QUICK TOGGLE BUTTON (CYCLES ALL THEMES) -->
				<button
					type="button"
					on:click={cycleTheme}
					class="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-black/10 bg-white/70 text-current shadow-2xs backdrop-blur transition-all duration-200 hover:border-black/25 hover:bg-white hover:shadow-xs active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
					aria-label="Cycle theme"
					title={`Current theme: ${THEMES.find((item) => item.id === $settings.theme)?.label || $settings.theme}. Click to cycle themes.`}
					use:ripple
				>
					{#if $settings.theme === 'light'}
						<Sun size={16} class="text-amber-500 transition-transform duration-300 hover:rotate-45" />
					{:else if $settings.theme === 'sepia'}
						<Coffee size={16} class="text-[#8c6b4f] transition-transform duration-300 hover:-rotate-12" />
					{:else}
						<Moon size={16} class="text-indigo-400 transition-transform duration-300 hover:-rotate-12" />
					{/if}
				</button>

				<!-- SETTINGS DIALOG BUTTON -->
				<button
					type="button"
					on:click={() => openSettings('general')}
					class="group flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-black/10 bg-white/70 text-current shadow-2xs backdrop-blur transition-all duration-200 hover:border-black/25 hover:bg-white hover:shadow-xs active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
					aria-label="Settings"
					title="Preferences & Model Configuration"
					use:ripple
				>
					<Settings size={16} class="opacity-75 transition-transform duration-300 group-hover:rotate-45 group-hover:opacity-100" />
				</button>
			</div>
		</nav>
	</header>

	<!-- PAGE CONTENT -->
	<main class="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6">
		<slot />
	</main>

	<!-- PERSISTENT FLOATING BATCH TRANSLATION WIDGET -->
	<BatchProgressWidget />
</div>


<!-- GLOBAL SETTINGS & PREFERENCES MODAL -->
<SettingsModal bind:open={settingsOpen} initialTab={settingsTab} />
