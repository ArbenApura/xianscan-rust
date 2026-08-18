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
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

	// -- OPTIONAL PROPS -- //

	export let open = false;
	export let title = 'Are you sure?';
	export let message = 'This action cannot be undone.';
	export let confirmLabel = 'Confirm';
	export let cancelLabel = 'Cancel';
	export let variant: 'danger' | 'default' = 'danger';
	export let requireText: string | null = null;
	export let requireVerificationCode = false;
	export let inputPlaceholder: string = '';

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();
	const STYLES = {
		danger: { icon: 'text-red-500', iconBg: 'bg-red-500/10', confirm: 'bg-red-600 text-white hover:bg-red-500' },
		default: {
			icon: 'text-[#c0392b]',
			iconBg: 'bg-[#c0392b]/10',
			confirm: 'bg-[#b23a2e] text-white hover:bg-[#c0392b]',
		},
	} as const;

	// -- STATES -- //

	let inputValue = '';
	let randomCode = '';
	let inputEl: HTMLInputElement | undefined;
	let lastOpen = false;

	// -- REACTIVE STATES -- //

	// GENERATE A RANDOM 6-DIGIT CODE WHEN OPENED
	$: if (open !== lastOpen) {
		lastOpen = open;
		if (open) {
			inputValue = '';
			if (requireVerificationCode) {
				randomCode = String(Math.floor(100000 + Math.random() * 900000));
			}
			if (requireVerificationCode || requireText) {
				setTimeout(() => inputEl?.focus(), 50);
			}
		} else {
			inputValue = '';
			randomCode = '';
		}
	}

	$: targetMatch = requireVerificationCode ? randomCode : requireText;

	// THEME-AWARE OPAQUE PANEL + BORDER
	$: panel = THEME_PANEL[$settings.theme];
	$: panelBorder = THEME_PANEL_BORDER[$settings.theme];
	$: isMatch = !targetMatch || inputValue.trim() === targetMatch.trim();

	// -- FUNCTIONS -- //

	function confirm() {
		if (!isMatch) return;
		open = false;
		dispatch('confirm');
	}
	function cancel() {
		open = false;
		dispatch('cancel');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && isMatch) {
			e.preventDefault();
			confirm();
		}
	}
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && cancel()} />

<!-- DIALOG OVERLAY -->
{#if open}
	<!-- use:scrollLock FREEZES THE PAGE BEHIND WHILE THE DIALOG IS OPEN -->
	<div
		use:scrollLock
		class="fixed inset-0 z-[100] flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
	>
		<!-- BACKDROP DISMISS BUTTON — NO RIPPLE -->
		<button
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			on:click={cancel}
			aria-label="Cancel"
			tabindex="-1"
			transition:fade={{ duration: 150 }}
		></button>
		<!-- DIALOG PANEL -->
		<div
			use:focusTrap
			tabindex="-1"
			transition:fly={{ y: 16, duration: 220, easing: cubicOut }}
			class={cn(
				'relative z-10 w-full max-w-sm rounded-xl border p-5 shadow-2xl outline-none',
				panel,
				panelBorder,
			)}
		>
			<!-- ICON AND MESSAGE -->
			<div class="flex gap-4">
				<div
					class={cn(
						'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
						STYLES[variant].iconBg,
					)}
				>
					<TriangleAlert size={20} class={STYLES[variant].icon} />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="text-sm font-semibold">{title}</h3>
					<p class="mt-1 text-xs opacity-60 leading-relaxed">{message}</p>
				</div>
			</div>

			<!-- VERIFICATION INPUT IF REQUIRED -->
			{#if targetMatch}
				<div class="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
					<label for="confirm-dialog-input" class="block text-[11px] font-semibold opacity-70 mb-1.5">
						Type <code class="rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs font-bold text-[#b23a2e] dark:bg-white/10 dark:text-[#e08a63] tracking-widest select-all">{targetMatch}</code> to confirm:
					</label>
					<input
						id="confirm-dialog-input"
						bind:this={inputEl}
						type="text"
						bind:value={inputValue}
						placeholder={inputPlaceholder || `Type ${targetMatch}`}
						on:keydown={handleKeydown}
						class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 font-mono text-xs outline-none transition placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/15"
					/>
				</div>
			{/if}

			<!-- ACTION BUTTONS -->
			<div class="mt-5 flex justify-end gap-2">
				<button
					use:ripple
					class="hover:bg-current/5 rounded-lg border border-black/10 px-4 py-2 text-xs font-medium opacity-70 transition-colors hover:opacity-100 dark:border-white/[0.08]"
					on:click={cancel}
				>
					{cancelLabel}
				</button>
				<button
					use:ripple
					disabled={!isMatch}
					class={cn(
						'rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150',
						STYLES[variant].confirm,
						!isMatch && 'opacity-40 cursor-not-allowed pointer-events-none'
					)}
					on:click={confirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
