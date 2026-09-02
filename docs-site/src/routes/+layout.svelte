<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import Monitor from 'lucide-svelte/icons/monitor';
	import Github from 'lucide-svelte/icons/github';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Heart from 'lucide-svelte/icons/heart';
	import Globe from 'lucide-svelte/icons/globe';
	import Menu from 'lucide-svelte/icons/menu';
	import X from 'lucide-svelte/icons/x';

	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Search from 'lucide-svelte/icons/search';

	// IMPORTED MODULES
	import '../app.css';
	import { themeStore, THEME_CLASS, THEME_HEADER, THEME_PANEL } from '$lib/stores/theme';
	import { DOC_NAVIGATION } from '$lib/docs-nav';
	import { Button, DiscordIcon } from '$lib/components/ui';
	import { ripple } from '$lib/actions/ripple';
	import SearchModal from '$lib/components/SearchModal.svelte';

	// -- STATES -- //

	let mobileNavOpen = false;
	let searchOpen = false;

	// -- LIFECYCLES -- //

	onMount(() => {
		themeStore.init();

		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				searchOpen = !searchOpen;
			} else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
				e.preventDefault();
				searchOpen = true;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div class="relative flex min-h-screen flex-col {THEME_CLASS[$themeStore]} isolate transition-colors duration-200">
	<!-- AMBIENT GRADIENTS (RENDERED AT ROOT BEHIND TOPBAR & HERO ONLY ON LANDING PAGE) -->
	{#if $page.url.pathname === '/'}
		<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
			<!-- TOP HERO RADIANCE FLOWING UNDER TOPBAR -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 h-[550px] w-[950px] max-w-[100vw] rounded-full bg-gradient-to-b from-[#b23a2e]/[0.22] via-[#b23a2e]/[0.06] to-transparent blur-3xl dark:from-[#e08a63]/[0.18] dark:via-[#e08a63]/[0.04]"></div>
			<!-- SIDE JADE FLOURISH -->
			<div class="absolute top-[20%] -right-32 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-[#4f7a64]/[0.15] via-[#a97f28]/[0.06] to-transparent blur-3xl dark:from-[#83b39a]/[0.12]"></div>
			<!-- LOWER GOLD/CINNABAR MIST -->
			<div class="absolute top-[52%] -left-32 h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-[#a97f28]/[0.12] via-[#b23a2e]/[0.08] to-transparent blur-3xl dark:from-[#e08a63]/[0.10]"></div>
		</div>
	{/if}

	<!-- GLOBAL TOP HEADER (TRANSPARENT BLUR & SMOOTH THEME TRANSITION) -->
	<header class="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors duration-200 {THEME_HEADER[$themeStore]}">
		<div class="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
			<!-- BRAND IDENTITY WITH LOGO & MOBILE HAMBURGER (ONLY ON DOCS PAGES) -->
			<div class="flex items-center gap-2 sm:gap-4">
				{#if $page.url.pathname.startsWith('/docs')}
					<button
						type="button"
						aria-label="Toggle navigation menu"
						use:ripple
						class="flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 lg:hidden dark:border-white/10 active:scale-95 text-inherit"
						on:click={() => (mobileNavOpen = !mobileNavOpen)}
					>
						{#if mobileNavOpen}
							<X size={17} />
						{:else}
							<Menu size={17} />
						{/if}
					</button>
				{/if}

				<a href="/" class="flex items-center gap-2 sm:gap-3 transition-opacity hover:opacity-90 active:scale-[0.99]">
					<img src="/logo.svg" alt="XianScan Logo" class="h-7 w-7 sm:h-8 sm:w-8 rounded-[4px] shadow-xs shrink-0" />
					<div class="flex items-center gap-1.5">
						<span class="font-display text-base font-bold tracking-tight sm:text-lg">
							<span class="text-[#b23a2e] dark:text-[#e08a63]">Xian</span>Scan
						</span>
						<span class="rounded-full bg-[#b23a2e]/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#b23a2e] dark:text-[#e08a63]">
							Docs
						</span>
					</div>
				</a>
			</div>

			<!-- TOP NAV ACTIONS (CLEAN RESPONSIVE COLLAPSE) -->
			<div class="flex items-center gap-1.5 sm:gap-2.5">
				<!-- SEARCH BAR TRIGGER (DESKTOP) -->
				<button
					type="button"
					use:ripple
					on:click={() => (searchOpen = true)}
					class="hidden md:flex items-center gap-2.5 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-1.5 text-xs text-inherit opacity-80 hover:opacity-100 hover:border-black/20 hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-[#b23a2e]/30 transition-all cursor-pointer shadow-2xs"
					title="Search documentation (Ctrl+K or /)"
				>
					<Search size={14} class="text-[#b23a2e] dark:text-[#e08a63] opacity-90" />
					<span class="text-xs opacity-60 font-medium">Search docs...</span>
					<kbd class="ml-2 rounded-md border border-black/10 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold opacity-60">
						Ctrl K
					</kbd>
				</button>

				<!-- SEARCH ICON BUTTON (MOBILE) -->
				<div class="md:hidden">
					<Button
						variant="ghost"
						size="sm"
						on:click={() => (searchOpen = true)}
						title="Search Documentation"
						class="px-2"
					>
						<Search size={15} />
					</Button>
				</div>

				<!-- DOCS LINK (DESKTOP ONLY) -->
				<div class="hidden md:block">
					<Button
						variant="ghost"
						size="sm"
						href="/docs/getting-started/quick-start"
					>
						<BookOpen size={14} />
						<span class="font-semibold text-xs">Docs</span>
					</Button>
				</div>

				<!-- DISCORD (OFFICIAL SVG CLYDE ICON - DESKTOP / TABLET ONLY) -->
				<div class="hidden sm:block">
					<Button
						variant="ghost"
						size="sm"
						href="https://discord.gg/dRWaQftNnR"
						target="_blank"
						rel="noreferrer"
						title="Join Discord Community"
						class="px-2 sm:px-3"
					>
						<DiscordIcon size={15} color="currentColor" />
						<span class="hidden md:inline text-xs">Discord</span>
					</Button>
				</div>

				<!-- GITHUB REPO -->
				<Button
					variant="ghost"
					size="sm"
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
					title="View GitHub Repository"
					class="px-2 sm:px-3"
				>
					<Github size={15} />
					<span class="hidden sm:inline text-xs">GitHub</span>
				</Button>

				<!-- THEME SWITCHER -->
				<Button
					variant="secondary"
					size="sm"
					title="Switch Theme (Auto / Sepia / Light / Dark)"
					on:click={() => themeStore.toggle()}
					class="px-2 sm:px-3"
				>
					{#if $themeStore === 'dark'}
						<Moon size={14} class="text-[#d8cfc2]" />
						<span class="hidden sm:inline text-xs font-semibold capitalize">Dark</span>
					{:else if $themeStore === 'sepia'}
						<span class="h-3 w-3 rounded-full bg-[#f4ecd8] border border-[#5b4636]/60"></span>
						<span class="hidden sm:inline text-xs font-semibold capitalize">Sepia</span>
					{:else if $themeStore === 'light'}
						<Sun size={14} class="text-[#b23a2e]" />
						<span class="hidden sm:inline text-xs font-semibold capitalize">Light</span>
					{:else}
						<Monitor size={14} class="opacity-75" />
						<span class="hidden sm:inline text-xs font-semibold capitalize">Auto</span>
					{/if}
				</Button>
			</div>
		</div>
	</header>

	<!-- MOBILE DRAWER MODAL OVERLAY (DESIGN-SYSTEM COMPLIANT DRAWER) -->
	{#if mobileNavOpen}
		<div
			class="fixed inset-0 top-14 sm:top-16 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
			role="dialog"
			aria-modal="true"
			aria-label="Navigation drawer"
			tabindex="-1"
			transition:fade={{ duration: 150 }}
		>
			<!-- DISMISS BACKDROP BUTTON -->
			<button
				type="button"
				class="fixed inset-0 h-full w-full bg-transparent cursor-default outline-none"
				on:click={() => (mobileNavOpen = false)}
				aria-label="Close menu"
				tabindex="-1"
			></button>

			<!-- SLIDE-IN THEMED DRAWER PANEL -->
			<div
				class="relative z-10 h-full w-4/5 max-w-xs {THEME_PANEL[$themeStore]} p-4 sm:p-5 shadow-2xl overflow-y-auto border-r flex flex-col justify-between"
				transition:fly={{ x: -260, duration: 220, easing: cubicOut }}
			>
				<div>
					<!-- SEARCH TRIGGER BUTTON -->
					<div class="mb-4">
						<button
							type="button"
							use:ripple
							on:click={() => {
								mobileNavOpen = false;
								searchOpen = true;
							}}
							class="w-full flex items-center justify-between gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 text-xs font-medium transition-all hover:bg-black/[0.06] dark:hover:bg-white/[0.08] active:scale-[0.99] text-inherit cursor-pointer"
						>
							<div class="flex items-center gap-2.5">
								<Search size={14} class="text-[#b23a2e] dark:text-[#e08a63] opacity-90" />
								<span class="opacity-70 font-normal">Search docs...</span>
							</div>
							<kbd class="rounded border border-black/10 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-semibold opacity-60">
								/
							</kbd>
						</button>
					</div>

					<!-- NAVIGATION LINKS -->
					<nav class="space-y-5">
						<div>
							<a
								href="/"
								use:ripple
								on:click={() => (mobileNavOpen = false)}
								class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all {$page.url.pathname === '/' ? 'bg-[#b23a2e] text-white shadow-xs' : 'opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100'}"
							>
								<Globe size={14} class="shrink-0" />
								<span>Docs Home / Portal</span>
							</a>
						</div>

						{#each DOC_NAVIGATION as section}
							<div class="space-y-1">
								<h3 class="text-[10px] font-bold uppercase tracking-wider opacity-50 px-2">
									{section.title}
								</h3>
								<ul class="space-y-0.5">
									{#each section.items as item}
										<li>
											<a
												href={item.href}
												use:ripple
												on:click={() => (mobileNavOpen = false)}
												class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all {$page.url.pathname === item.href || ($page.url.pathname === item.href + '/' && item.href !== '/') ? 'bg-[#b23a2e]/10 text-[#b23a2e] font-bold dark:text-[#e08a63]' : 'opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'}"
											>
												<span class="truncate">{item.title}</span>
												{#if item.badge}
													<span class="rounded bg-black/5 px-1 py-0.2 text-[9px] dark:bg-white/10">{item.badge}</span>
												{/if}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</nav>
				</div>

				<!-- DRAWER FOOTER LINKS -->
				<div class="pt-5 mt-6 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs opacity-60">
					<span class="text-[11px] font-medium">XianScan v0.5.0</span>
					<div class="flex items-center gap-3">
						<a
							href="https://discord.gg/dRWaQftNnR"
							target="_blank"
							rel="noreferrer"
							class="hover:opacity-100 hover:text-[#5865F2] transition-colors p-1"
							aria-label="Discord"
						>
							<DiscordIcon size={14} color="currentColor" />
						</a>
						<a
							href="https://github.com/ArbenApura/xianscan-rust"
							target="_blank"
							rel="noreferrer"
							class="hover:opacity-100 transition-colors p-1"
							aria-label="GitHub"
						>
							<Github size={14} />
						</a>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- MAIN CONTENT -->
	<main class="flex-1">
		<slot />
	</main>

	<!-- SITE FOOTER -->
	<footer class="border-t border-black/10 py-8 sm:py-10 text-xs leading-relaxed dark:border-white/10">
		<div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8 text-center sm:text-left">
			<!-- BRAND & AUTHOR -->
			<div class="flex items-center gap-3">
				<img src="/logo.svg" alt="XianScan" class="h-6 w-6 sm:h-7 sm:w-7 rounded-[3px] shadow-2xs shrink-0" />
				<div class="flex flex-col">
					<div class="font-bold">
						<span class="text-[#b23a2e] dark:text-[#e08a63]">Xian</span>Scan <span class="font-normal opacity-60">· Built by Arben Apura</span>
					</div>
					<span class="opacity-50 text-[11px]">MIT License · 2026</span>
				</div>
			</div>

			<!-- FOOTER LINKS -->
			<div class="flex flex-wrap justify-center items-center gap-3 sm:gap-4 text-[11px] sm:text-xs">
				<a
					href="https://arbenger.com/contact/"
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-1 opacity-75 hover:opacity-100 hover:text-[#b23a2e] dark:hover:text-[#e08a63] transition-colors"
				>
					<Globe size={13} />
					<span>arbenger.com</span>
				</a>
				<span class="opacity-30">·</span>
				<a
					href="https://discord.gg/dRWaQftNnR"
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-1 opacity-75 hover:opacity-100 hover:text-[#5865F2] transition-colors"
				>
					<DiscordIcon size={13} color="currentColor" />
					<span>Discord</span>
				</a>
				<span class="opacity-30">·</span>
				<a
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-1 opacity-75 hover:opacity-100 hover:text-[#b23a2e] dark:hover:text-[#e08a63] transition-colors"
				>
					<Github size={13} />
					<span>GitHub</span>
				</a>
				<span class="opacity-30">·</span>
				<a
					href="https://ko-fi.com/arbenapura"
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-1 font-semibold text-[#b23a2e] hover:underline dark:text-[#e08a63]"
				>
					<Heart size={13} fill="currentColor" />
					<span>Ko-Fi</span>
				</a>
			</div>
		</div>
	</footer>

	<!-- SEARCH MODAL -->
	<SearchModal open={searchOpen} onClose={() => (searchOpen = false)} />
</div>