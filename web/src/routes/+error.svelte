<script lang="ts">
	// IMPORTED ENVS & SVELTEKIT STORES
	import { browser, dev } from '$app/environment';
	import { page } from '$app/stores';
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	// IMPORTED ICONS
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import Compass from 'lucide-svelte/icons/compass';
	import Copy from 'lucide-svelte/icons/copy';
	import Flame from 'lucide-svelte/icons/flame';
	import Home from 'lucide-svelte/icons/home';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import ShieldAlert from 'lucide-svelte/icons/shield-alert';
	import Terminal from 'lucide-svelte/icons/terminal';
	import ZapOff from 'lucide-svelte/icons/zap-off';
	// IMPORTED UI COMPONENTS
	import { Button, InkDivider, Seal } from '$lib/components/ui';

	// -- STATE -- //
	let copied = false;
	let showDetails = false;
	let reloading = false;

	// RESOLVE ERROR CONTEXT BASED ON HTTP STATUS CODE
	$: status = $page.status || 500;
	$: errorMessage = $page.error?.message || 'An unexpected internal error occurred.';

	$: meta = (() => {
		switch (status) {
			case 404:
				return {
					badge: '404 • Realm Not Found',
					title: 'Deviation from the Dao',
					subtitle:
						'The scripture, chapter, or sacred scroll you seek has vanished into the mist or does not exist in this library archive.',
					seal: '迷',
					icon: Compass,
					accentColor: 'text-amber-600 dark:text-amber-400',
					glowColor: 'bg-amber-500/10',
				};
			case 403:
				return {
					badge: '403 • Restricted Realm',
					title: 'Restricted Secret Realm',
					subtitle:
						'Access to this inner sanctuary is sealed. Your spiritual cultivation permissions are insufficient to view this scroll.',
					seal: '禁',
					icon: ShieldAlert,
					accentColor: 'text-rose-600 dark:text-rose-400',
					glowColor: 'bg-rose-500/10',
				};
			case 502:
			case 503:
			case 504:
				return {
					badge: `${status} • Sidecar Meditating`,
					title: 'Tribulation in Progress',
					subtitle:
						'The local ML sidecar or translation vessel is momentarily unreachable. It may be warming up models or restarting.',
					seal: '休',
					icon: ZapOff,
					accentColor: 'text-orange-600 dark:text-orange-400',
					glowColor: 'bg-orange-500/10',
				};
			case 500:
			default:
				return {
					badge: `${status} • Internal Error`,
					title: 'Spiritual Qi Deviation',
					subtitle:
						'An unexpected internal disruption interrupted the translation array. The celestial machinery encountered an anomaly.',
					seal: '劫',
					icon: Flame,
					accentColor: 'text-[#b23a2e] dark:text-[#e08a63]',
					glowColor: 'bg-[#b23a2e]/10',
				};
		}
	})();

	function handleReload() {
		if (!browser) return;
		reloading = true;
		window.location.reload();
	}

	function handleBack() {
		if (!browser) return;
		if (window.history.length > 1) {
			window.history.back();
		} else {
			window.location.href = '/app';
		}
	}

	async function copyDiagnostics() {
		if (!browser) return;
		const payload = {
			status,
			title: meta.title,
			message: errorMessage,
			path: $page.url.pathname + $page.url.search,
			timestamp: new Date().toISOString(),
			userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
		};

		try {
			await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
			copied = true;
			toast.success('Diagnostic information copied to clipboard');
			setTimeout(() => {
				copied = false;
			}, 2500);
		} catch {
			toast.error('Failed to copy diagnostics');
		}
	}
</script>

<svelte:head>
	<title>{status} - {meta.title} | XianScan</title>
</svelte:head>

<div class="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-12 text-center sm:px-6">
	<!-- BACKGROUND AMBIENT GLOW EFFECTS -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div
			class={`absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 sm:w-[32rem] sm:h-[32rem] rounded-full ${meta.glowColor} blur-3xl transition-colors duration-500`}
		></div>
		<div class="absolute right-1/4 bottom-1/4 w-72 h-72 rounded-full bg-amber-500/5 blur-3xl"></div>
	</div>

	<!-- CENTRAL CARD CONTAINER -->
	<div class="relative z-10 mx-auto w-full max-w-xl">
		<!-- BRAND STAMP & STATUS BADGE -->
		<div class="mb-6 flex items-center justify-center gap-2.5">
			<Seal char={meta.seal} size={32} class="shadow-md shadow-[#b23a2e]/20" />
			<div
				class="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-semibold backdrop-blur dark:border-white/10 dark:bg-white/[0.04]"
			>
				<svelte:component this={meta.icon} size={13} class={meta.accentColor} />
				<span class={meta.accentColor}>{meta.badge}</span>
			</div>
		</div>

		<!-- LARGE NUMERIC WATERMARK / HEADING -->
		<div class="relative mb-2">
			<span
				class="select-none text-7xl font-extrabold tracking-tighter opacity-15 sm:text-8xl md:text-9xl font-mono text-current block"
				aria-hidden="true"
			>
				{status}
			</span>
			<h1 class="relative -mt-10 sm:-mt-14 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl text-current">
				{meta.title}
			</h1>
		</div>

		<!-- SUBTITLE / NARRATIVE -->
		<p class="mx-auto mt-3 max-w-md text-sm leading-relaxed opacity-75 sm:text-base">
			{meta.subtitle}
		</p>

		<!-- INK DIVIDER -->
		<InkDivider class="my-6 max-w-xs mx-auto" />

		<!-- ACTION BUTTONS -->
		<div class="flex flex-wrap items-center justify-center gap-3">
			<Button href="/app" variant="primary" size="md" class="shadow-md shadow-[#b23a2e]/20">
				<Home size={15} />
				<span>Return to Library</span>
			</Button>

			<Button variant="secondary" size="md" loading={reloading} on:click={handleReload}>
				<RefreshCw size={15} />
				<span>Try Again</span>
			</Button>

			<Button variant="ghost" size="md" on:click={handleBack}>
				<ArrowLeft size={15} />
				<span>Go Back</span>
			</Button>
		</div>

		<!-- DIAGNOSTIC DETAILS (COLLAPSIBLE) -->
		<div class="mt-8 text-left">
			<div
				class="overflow-hidden rounded-xl border border-black/10 bg-black/[0.02] backdrop-blur transition-all dark:border-white/10 dark:bg-white/[0.02]"
			>
				<button
					type="button"
					class="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
					on:click={() => (showDetails = !showDetails)}
					aria-expanded={showDetails}
				>
					<span class="flex items-center gap-2">
						<Terminal size={14} class={meta.accentColor} />
						<span>Diagnostic Information</span>
					</span>
					<span class="flex items-center gap-1">
						{#if showDetails}
							<ChevronUp size={14} />
						{:else}
							<ChevronDown size={14} />
						{/if}
					</span>
				</button>

				{#if showDetails}
					<div class="border-t border-black/[0.08] px-4 py-3 text-xs dark:border-white/[0.08]">
						<div class="mb-2 flex items-center justify-between">
							<span class="font-mono text-[11px] opacity-60">Status Code: {status}</span>
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100"
								on:click={copyDiagnostics}
							>
								{#if copied}
									<Check size={12} class="text-emerald-500" />
									<span class="text-emerald-600 dark:text-emerald-400">Copied</span>
								{:else}
									<Copy size={12} />
									<span>Copy Details</span>
								{/if}
							</button>
						</div>

						<div class="space-y-1.5 font-mono text-[11px]">
							<div class="break-all rounded bg-black/5 p-2 dark:bg-black/40">
								<span class="font-semibold text-[#b23a2e] dark:text-[#e08a63]">Error:</span>
								<span class="opacity-90">{errorMessage}</span>
							</div>

							<div class="flex flex-wrap items-center gap-x-4 gap-y-1 opacity-60 text-[10px] pt-1">
								<span>Path: {$page.url.pathname}</span>
								<span>Time: {new Date().toLocaleTimeString()}</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- FOOTER TIP -->
		<div class="mt-8 text-center text-xs opacity-45">
			<span>Need assistance? Check the </span>
			<a href="/app/about" class="underline hover:opacity-80">System Documentation</a>
			<span> or restart the local service.</span>
		</div>
	</div>
</div>
