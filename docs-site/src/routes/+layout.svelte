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

	// IMPORTED MODULES
	import '../app.css';
	import { themeStore, THEME_CLASS, THEME_HEADER } from '$lib/stores/theme';
	import { DOC_NAVIGATION } from '$lib/docs-nav';
	import { Button, DiscordIcon } from '$lib/components/ui';

	// -- STATES -- //

	let mobileNavOpen = false;

	// -- LIFECYCLES -- //

	onMount(() => {
		themeStore.init();
	});
</script>

<div class="flex min-h-screen flex-col {THEME_CLASS[$themeStore]}">
	<!-- GLOBAL TOP HEADER -->
	<header class="sticky top-0 z-50 w-full border-b backdrop-blur-md {THEME_HEADER[$themeStore]}">
		<div class="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
			<!-- BRAND IDENTITY WITH LOGO & MOBILE HAMBURGER -->
			<div class="flex items-center gap-2 sm:gap-4">
				<button
					type="button"
					aria-label="Toggle navigation menu"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 lg:hidden dark:border-white/10 active:scale-95"
					on:click={() => (mobileNavOpen = !mobileNavOpen)}
				>
					{#if mobileNavOpen}
						<X size={17} />
					{:else}
						<Menu size={17} />
					{/if}
				</button>

				<a href="/" class="flex items-center gap-2 sm:gap-3 transition-opacity hover:opacity-90 active:scale-[0.99]">
					<img src="/logo.svg" alt="XianScan Logo" class="h-7 w-7 sm:h-8 sm:w-8 rounded-[6px] shadow-sm shrink-0" />
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

				<!-- DISCORD (OFFICIAL SVG CLYDE ICON) -->
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
					<span class="hidden sm:inline text-xs">Discord</span>
				</Button>

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
					title="Switch Theme (Auto / Light / Sepia / Dark)"
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

	<!-- MOBILE DRAWER MODAL OVERLAY -->
	{#if mobileNavOpen}
		<div
			class="fixed inset-0 top-14 sm:top-16 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity"
			on:click={() => (mobileNavOpen = false)}
		>
			<div
				class="h-full w-4/5 max-w-xs {THEME_CLASS[$themeStore]} p-5 shadow-2xl overflow-y-auto border-r border-black/10 dark:border-white/10"
				on:click|stopPropagation
			>
				<div class="mb-4 pb-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
					<span class="text-xs font-bold uppercase tracking-wider opacity-60">Documentation Menu</span>
					<button
						type="button"
						aria-label="Close menu"
						class="rounded p-1 opacity-60 hover:opacity-100"
						on:click={() => (mobileNavOpen = false)}
					>
						<X size={16} />
					</button>
				</div>

				<nav class="space-y-5">
					<div class="space-y-1">
						<a
							href="/"
							on:click={() => (mobileNavOpen = false)}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors {$page.url.pathname === '/' ? 'bg-[#b23a2e] text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}"
						>
							<Globe size={14} />
							<span>Docs Home / Portal</span>
						</a>
					</div>

					{#each DOC_NAVIGATION as section}
						<div>
							<h3 class="mb-2 text-[10px] font-bold uppercase tracking-wider opacity-50 px-2">
								{section.title}
							</h3>
							<ul class="space-y-1">
								{#each section.items as item}
									<li>
										<a
											href={item.href}
											on:click={() => (mobileNavOpen = false)}
											class="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 {$page.url.pathname === item.href || ($page.url.pathname === item.href + '/' && item.href !== '/') ? 'bg-[#b23a2e]/10 text-[#b23a2e] font-bold dark:text-[#e08a63]' : 'opacity-85'}"
										>
											<span>{item.title}</span>
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</nav>
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
				<img src="/logo.svg" alt="XianScan" class="h-6 w-6 sm:h-7 sm:w-7 rounded-[5px] shadow-xs shrink-0" />
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
</div>