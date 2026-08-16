<script context="module" lang="ts">
	// MODULE-LEVEL SEQUENCE FOR UNIQUE aria-labelledby IDs (SEE titleId BELOW).
	let modalTitleSeq = 0;
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { ripple } from '$lib/actions/ripple';
	import { scrollLock } from '$lib/actions/scrollLock';
	import { settings, THEME_PANEL, THEME_PANEL_BORDER } from '$lib/stores/settings';
	// IMPORTED DEP-COMPONENTS
	import X from 'lucide-svelte/icons/x';

	// -- OPTIONAL PROPS -- //

	export let open = false;
	export let title = '';
	export let size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full' = 'md';
	export let closable = true;
	export let placement: 'top' | 'center' = 'center';
	// PADDING OF THE SCROLLABLE BODY. OVERRIDE (E.G. DROP THE TOP PAD) WHEN THE SLOT HAS ITS OWN STICKY HEADER.
	export let bodyClass = 'p-4 sm:p-5';

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher();
	// UNIQUE ID PER INSTANCE SO aria-labelledby CAN TARGET THE TITLE (THE DIALOG NEEDS AN ACCESSIBLE NAME).
	const titleId = `modal-title-${++modalTitleSeq}`;
	const SIZES: Record<string, string> = {
		xs: 'sm:max-w-sm',
		sm: 'sm:max-w-md',
		md: 'sm:max-w-lg',
		lg: 'sm:max-w-2xl',
		xl: 'sm:max-w-4xl',
		'2xl': 'sm:max-w-5xl',
		'3xl': 'sm:max-w-6xl',
		'4xl': 'sm:max-w-7xl',
		'5xl': 'sm:max-w-[90vw]',
		full: 'sm:max-w-[96vw]',
	};

	// -- REACTIVE STATES -- //

	// OPAQUE ELEVATED SURFACE + BORDER FOR THE ACTIVE THEME (KEEPS DIALOGS INSIDE THE 5-THEME WORLD)
	$: panel = THEME_PANEL[$settings.theme];
	$: panelBorder = THEME_PANEL_BORDER[$settings.theme];

	// -- FUNCTIONS -- //

	function close() {
		if (!closable) return;
		dispatch('close');
	}
</script>

<svelte:window on:keydown={(e) => open && closable && e.key === 'Escape' && close()} />

{#if open}
	<!-- DIALOG: BOTTOM SHEET ON MOBILE, TOP-ANCHORED OR CENTERED CARD ON DESKTOP. use:scrollLock FREEZES THE PAGE BEHIND. -->
	<div
		use:scrollLock
		class={cn(
			'fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4 overflow-y-auto overflow-x-hidden',
			placement === 'top' ? 'sm:items-start sm:pt-14 sm:pb-8' : 'sm:items-center'
		)}
		role="dialog"
		aria-modal="true"
		aria-labelledby={title ? titleId : undefined}
	>
		<!-- BACKDROP OVERLAY — NO RIPPLE (A FULL-SCREEN DISMISS SHOULDN'T FLASH A RIPPLE ON CLICK) -->
		<button
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			on:click={() => closable && close()}
			aria-label="Close dialog"
			tabindex="-1"
			transition:fade={{ duration: 150 }}
		></button>
		<!-- MODAL CARD (mx-auto ensures strict horizontal centering during scroll and wrap) -->
		<div
			use:focusTrap
			tabindex="-1"
			transition:fly={{ y: 24, duration: 220, easing: cubicOut }}
			class={cn(
				'relative z-10 mx-auto flex w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl outline-none text-left sm:rounded-2xl',
				// THEME-AWARE OPAQUE PANEL (WAS A HARDCODED white / slate-900 PLANE THAT IGNORED sepia/oled/contrast)
				panel,
				// MOBILE: A BOTTOM-SHEET DRAWER THAT STOPS WELL SHORT OF FULL HEIGHT (A STRIP OF THE PAGE STAYS
				// VISIBLE ABOVE IT, SO IT READS AS A DRAWER, NOT A FULL-SCREEN DIALOG). TALLER ON DESKTOP WHERE
				// IT'S A CENTERED CARD.
				'max-h-[88vh] sm:max-h-[90vh]',
				SIZES[size],
			)}
		>
			{#if title || $$slots.header}
				<!-- MODAL HEADER -->
				<header
					class={cn('flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-3.5', panelBorder)}
				>
					<h2 id={titleId} class="text-sm sm:text-base font-semibold truncate">{title}</h2>
					<slot name="header" />
					{#if closable}
						<!-- CLOSE BUTTON — TRANSLUCENT HOVER READS ON EVERY THEME PANEL -->
						<button
							on:click={close}
							use:ripple
							class="rounded-lg p-1.5 opacity-50 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
							aria-label="Close"
						>
							<X size={18} />
						</button>
					{/if}
				</header>
			{/if}
			<!-- MODAL BODY -->
			<div class={cn('min-h-0 flex-1 overflow-y-auto', bodyClass)}>
				<slot />
			</div>
			{#if $$slots.footer}
				<!-- MODAL FOOTER -->
				<footer class={cn('flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5 sm:px-5 sm:py-3', panelBorder)}>
					<slot name="footer" />
				</footer>
			{/if}
		</div>
	</div>
{/if}
