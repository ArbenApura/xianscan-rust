<script lang="ts">
	// IMPORTED DEP-MODULES
	import { page } from '$app/stores';

	// IMPORTED MODULES
	import { DOC_NAVIGATION } from '$lib/docs-nav';
	import { DOCS_CONTENT } from '$lib/docs-content';

	// -- REACTIVE STATES -- //
	$: currentSlug = $page.url.pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '');
	$: currentDoc = DOCS_CONTENT[currentSlug];
	$: currentSections = currentDoc?.sections || [];
</script>

<!-- 3-COLUMN DOCUMENTATION LAYOUT -->
<div class="mx-auto flex w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
	<!-- LEFT SIDEBAR: STICKY NAVIGATION (DESKTOP) -->
	<aside class="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-black/10 py-6 pr-6 lg:block dark:border-white/10">
		<nav class="space-y-6">
			{#each DOC_NAVIGATION as section}
				<div>
					<h3 class="mb-2 text-[11px] font-bold uppercase tracking-wider opacity-50 px-2">
						{section.title}
					</h3>
					<ul class="space-y-1">
						{#each section.items as item}
							<li>
								<a
									href={item.href}
									class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 {$page.url.pathname === item.href || ($page.url.pathname === item.href + '/' && item.href !== '/') ? 'bg-[#b23a2e]/10 text-[#b23a2e] font-bold dark:text-[#e08a63]' : 'opacity-80'}"
								>
									<span>{item.title}</span>
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
	</aside>

	<!-- CENTER CONTENT CANVAS -->
	<div class="min-w-0 flex-1 py-6 sm:py-8 lg:px-10">
		<slot />
	</div>

	<!-- RIGHT SIDEBAR: "ON THIS PAGE" TABLE OF CONTENTS (DESKTOP) -->
	<aside class="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto py-6 pl-6 xl:block">
		<div class="space-y-4">
			<h4 class="text-[11px] font-bold uppercase tracking-wider opacity-50">
				On This Page
			</h4>
			{#if currentSections.length > 0}
				<ul class="space-y-2 text-xs opacity-75">
					{#each currentSections as sec}
						<li>
							<a
								href="#{sec.id}"
								class="block hover:text-[#b23a2e] dark:hover:text-[#e08a63] transition-colors leading-snug"
							>
								{sec.title}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-xs opacity-50">Overview</p>
			{/if}

			<div class="pt-6 border-t border-black/10 dark:border-white/10 text-xs space-y-2 opacity-70">
				<a
					href="https://github.com/ArbenApura/xianscan-rust"
					target="_blank"
					rel="noreferrer"
					class="block hover:underline"
				>
					View on GitHub
				</a>
				<a
					href="https://discord.gg/dRWaQftNnR"
					target="_blank"
					rel="noreferrer"
					class="block hover:underline"
				>
					Join Discord Community
				</a>
			</div>
		</div>
	</aside>
</div>