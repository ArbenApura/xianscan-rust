<!-- ABOUT & SYSTEM DIAGNOSTICS TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED TYPES
	import type { HardwareInfo } from '$lib/components/settings/settings-helpers';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { mlStatus } from '$lib/stores/ml-status';
	import { versionCheck } from '$lib/stores/version-check';
	// IMPORTED DEP-COMPONENTS
	import Info from 'lucide-svelte/icons/info';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import ArrowUpCircle from 'lucide-svelte/icons/arrow-up-circle';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import BookOpen from 'lucide-svelte/icons/book-open';
	// IMPORTED COMPONENTS
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DiscordLogo from '$lib/components/ui/DiscordLogo.svelte';

	// -- OPTIONAL PROPS -- //

	export let hardwareInfo: HardwareInfo | null = null;
	export let highlightedSettingId: string | null = null;

	// -- CONSTANTS -- //

	// THE SHELL CLOSES THE MODAL, THEN RE-DISPATCHES openTour TO ITS OWN CALLER
	const dispatch = createEventDispatcher<{ openTour: void }>();

	// -- FUNCTIONS -- //

	async function handleManualUpdateCheck() {
		const checkPromise = versionCheck.checkForUpdates(true);
		toast.promise(checkPromise, {
			loading: 'Checking GitHub Releases for updates...',
			success: (res) => {
				if (!res.ok) {
					return res.error || 'Failed to check GitHub releases';
				}
				if (res.hasUpdate && res.latestVersion) {
					return `New version v${res.latestVersion} is available!`;
				}
				return 'XianScan is up to date!';
			},
			error: 'Network error checking for updates',
		});
	}
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-base font-bold">About & System Diagnostics</h2>
		<p class="text-xs opacity-60 mt-0.5">XianScan native runtime environment, build fingerprint, and service states</p>
	</div>

	<!-- VERSION & UPDATE STATUS CARD -->
	<div
		id="setting-version-info"
		class={`rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] space-y-3.5 transition-all duration-300 ${highlightedSettingId === 'version-info' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
	>
		<div class="flex items-center justify-between gap-3 border-b border-black/5 pb-3 dark:border-white/5">
			<div class="space-y-0.5">
				<div class="text-xs font-bold flex items-center gap-2">
					<Info size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Native Core & Software Version</span>
				</div>
				<p class="text-[11px] opacity-60">Runtime build fingerprint, sidecar connectivity, and releases</p>
			</div>
			<Button
				variant="secondary"
				size="sm"
				disabled={$versionCheck.checking}
				on:click={handleManualUpdateCheck}
				title="Check GitHub Releases for newer builds"
			>
				<RefreshCw size={12} class={$versionCheck.checking ? 'animate-spin' : ''} />
				<span>Check Updates</span>
			</Button>
		</div>

		<!-- UPDATE AVAILABLE CALLOUT BANNER -->
		{#if $versionCheck.hasUpdate && $versionCheck.latestVersion}
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#b23a2e]/25 bg-[#b23a2e]/[0.08] p-3 dark:border-[#e08a63]/30 dark:bg-[#e08a63]/[0.10]">
				<div class="space-y-0.5">
					<div class="flex items-center gap-1.5 text-xs font-bold text-[#b23a2e] dark:text-[#e08a63]">
						<ArrowUpCircle size={14} />
						<span>New Release v{$versionCheck.latestVersion} Available</span>
					</div>
					<p class="text-[11px] opacity-75 leading-relaxed">
						A newer build is ready on GitHub Releases with features and improvements.
					</p>
				</div>
				{#if $versionCheck.releaseUrl}
					<a
						href={$versionCheck.releaseUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#c0392b] text-white px-3.5 py-1.5 text-xs font-bold transition shrink-0 shadow-xs"
						use:ripple
					>
						<span>Download v{$versionCheck.latestVersion}</span>
						<ExternalLink size={11} class="opacity-70" />
					</a>
				{/if}
			</div>
		{/if}

		<!-- SPECS & HEALTH GRID -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-0.5">
			<div class="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
				<span class="opacity-60">Installed Core Version</span>
				<span class="font-mono font-bold text-[#b23a2e] dark:text-[#e08a63]">
					v{hardwareInfo?.version || $mlStatus.version || $versionCheck.currentVersion}
				</span>
			</div>
			<div class="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
				<span class="opacity-60">Latest Release</span>
				<div class="flex items-center gap-1.5">
					<span class="font-mono font-bold text-neutral-800 dark:text-neutral-200">
						{$versionCheck.latestVersion ? `v${$versionCheck.latestVersion}` : 'v' + ($versionCheck.currentVersion)}
					</span>
					{#if $versionCheck.hasUpdate}
						<Badge variant="gold">Update</Badge>
					{:else}
						<Badge variant="jade">Latest</Badge>
					{/if}
				</div>
			</div>
			{#if hardwareInfo?.web_build_hash || $mlStatus.webBuildHash || $versionCheck.webBuildHash}
				<div class="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
					<span class="opacity-60">Web Build Hash</span>
					<span class="font-mono">{hardwareInfo?.web_build_hash || $mlStatus.webBuildHash || $versionCheck.webBuildHash}</span>
				</div>
			{/if}
			<div
				id="setting-sidecar-health"
				class={`flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'sidecar-health' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63]' : ''}`}
			>
				<span class="opacity-60">ML Sidecar Health</span>
				<span class={`font-bold ${$mlStatus.online ? 'text-emerald-600' : 'text-red-500'}`}>
					{$mlStatus.online ? 'Healthy & Connected' : 'Offline / Unreachable'}
				</span>
			</div>
		</div>
	</div>

	<!-- ONBOARDING GUIDE REPLAY CARD -->
	<div
		id="setting-welcome-tour"
		class={`flex items-center justify-between rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'welcome-tour' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-4' : ''}`}
	>
		<div class="space-y-0.5">
			<div class="flex items-center gap-1.5 text-xs font-bold">
				<HelpCircle size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
				<span>Welcome Tour & Feature Guide</span>
			</div>
			<p class="text-[11px] opacity-60">Replay the introductory walkthrough covering the translation pipeline, extension, and setup.</p>
		</div>
		<Button
			variant="secondary"
			size="sm"
			on:click={() => dispatch('openTour')}
		>
			<span>Replay Tour</span>
		</Button>
	</div>

	<!-- DOCUMENTATION PORTAL CARD -->
	<div class="flex items-center justify-between rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
		<div class="space-y-0.5">
			<div class="flex items-center gap-1.5 text-xs font-bold text-[#b23a2e] dark:text-[#e08a63]">
				<BookOpen size={14} />
				<span>Official Documentation & Knowledge Base</span>
			</div>
			<p class="text-[11px] opacity-60">Complete guides, hardware setup, browser extension import, and API reference.</p>
		</div>
		<a
			href="https://xianscan.arbenger.com"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 rounded-lg bg-[#b23a2e] hover:bg-[#c0392b] text-white px-3 py-1.5 text-xs font-bold transition shrink-0"
			use:ripple
		>
			<span>Visit Docs</span>
			<ExternalLink size={11} class="opacity-60" />
		</a>
	</div>

	<!-- DISCORD COMMUNITY CARD -->
	<div class="flex items-center justify-between rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
		<div class="space-y-0.5">
			<div class="flex items-center gap-1.5 text-xs font-bold text-[#5865F2]">
				<DiscordLogo size={15} fill="#5865F2" />
				<span>Discord Community</span>
			</div>
			<p class="text-[11px] opacity-60">Join our community server to ask questions, share feedback, report bugs, or hang out.</p>
		</div>
		<a
			href="https://discord.gg/dRWaQftNnR"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white px-3 py-1.5 text-xs font-bold transition shrink-0"
			use:ripple
		>
			<span>Join Discord</span>
			<ExternalLink size={11} class="opacity-60" />
		</a>
	</div>
</div>
