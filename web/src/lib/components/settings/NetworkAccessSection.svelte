<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Copy from 'lucide-svelte/icons/copy';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { Button, ConfirmDialog, Switch } from '$lib/components/ui';

	// -- TYPES -- //

	interface AccessStatus {
		token: string;
		lanAccessEnabled: boolean;
		effectiveBind: 'local' | 'lan';
		bindSource: 'setting' | 'env' | 'docker' | 'legacy-default' | 'default';
		restartRequired: boolean;
		lanUrls: string[];
		noticePending: boolean;
	}

	// -- OPTIONAL PROPS -- //

	/** Pre-loaded status (tests, SSR). When absent the section fetches it on mount. */
	export let initialStatus: AccessStatus | null = null;
	// SETTINGS SEARCH JUMP TARGET (SAME RING AS THE OTHER SETTINGS TABS)
	export let highlightedSettingId: string | null = null;

	// -- CONSTANTS -- //

	// SKELETON BAR, SAME TONE AS THE STORAGE TAB PLACEHOLDERS; THE PULSE RESPECTS REDUCED MOTION
	const BAR = 'rounded bg-black/[0.08] dark:bg-white/[0.08] motion-safe:animate-pulse';

	// -- STATES -- //

	// loaded FIRES AFTER THE STATUS FETCH SETTLES SO THE SHELL CAN RE-SCROLL A SEARCH JUMP ONCE THE CARDS HAVE RENDERED
	const dispatch = createEventDispatcher<{ loaded: void }>();

	let status: AccessStatus | null = initialStatus;
	let loadError = '';
	let showToken = false;
	let confirmRegenerate = false;
	let regenerating = false;
	let savingLan = false;

	// -- REACTIVE STATEMENTS -- //

	$: bindPinned = status?.bindSource === 'env' || status?.bindSource === 'docker';
	$: maskedToken = status ? '•'.repeat(Math.min(24, status.token.length)) : '';

	// -- FUNCTIONS -- //

	async function load() {
		try {
			const res = await fetch('/api/system/access');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			status = await res.json();
			loadError = '';
		} catch (e: any) {
			loadError = e?.message || 'Could not load access settings';
		} finally {
			dispatch('loaded');
		}
	}

	function retry() {
		loadError = '';
		void load();
	}

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${what} copied`);
		} catch {
			toast.error(`Could not copy the ${what.toLowerCase()}`);
		}
	}

	async function setLan(enabled: boolean) {
		savingLan = true;
		try {
			const res = await fetch('/api/system/access', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lanAccessEnabled: enabled }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			status = await res.json();
			toast.success(enabled ? 'LAN access will be on after restarting XianScan' : 'LAN access will be off after restarting XianScan');
		} catch (e: any) {
			toast.error(e?.message || 'Could not save LAN access');
			await load();
		} finally {
			savingLan = false;
		}
	}

	async function regenerate() {
		regenerating = true;
		try {
			const res = await fetch('/api/system/access/token/regenerate', { method: 'POST' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (status) status = { ...status, token: data.token };
			toast.success('New access token created. Paste it into every paired device.');
		} catch (e: any) {
			toast.error(e?.message || 'Could not regenerate the token');
		} finally {
			regenerating = false;
			confirmRegenerate = false;
		}
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		if (!status) void load();
	});
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-base font-bold">Network &amp; Access</h2>
		<p class="mt-0.5 text-xs opacity-60">Who can reach XianScan, and the token other devices use to connect</p>
	</div>

	{#if loadError}
		<div class="flex items-center justify-between gap-3 rounded-2xl border border-[#c0392b]/25 bg-[#c0392b]/[0.05] p-4" role="alert">
			<p class="text-sm text-[#c0392b]">Could not load access settings ({loadError}).</p>
			<Button size="sm" on:click={retry}><RefreshCw class="h-3.5 w-3.5" />Try again</Button>
		</div>
	{:else if !status}
		<!-- SKELETON: SAME CARDS AS THE LOADED VIEW SO NOTHING JUMPS WHEN THE STATUS ARRIVES -->
		<div class="space-y-5" role="status" aria-busy="true" data-testid="network-skeleton">
			<span class="sr-only">Loading network and access settings</span>

			<!-- LAN TOGGLE CARD -->
			<div class="space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10" aria-hidden="true">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0 flex-1 space-y-2">
						<div class={cn(BAR, 'h-4 w-24')}></div>
						<div class={cn(BAR, 'h-3 w-full max-w-md')}></div>
						<div class={cn(BAR, 'h-3 w-3/5 max-w-xs')}></div>
					</div>
					<div class={cn(BAR, 'h-6 w-11 shrink-0 rounded-full')}></div>
				</div>
			</div>

			<!-- ACCESS TOKEN CARD -->
			<div class="space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10" aria-hidden="true">
				<div class={cn(BAR, 'h-4 w-28')}></div>
				<div class="flex items-center gap-2">
					<div class={cn(BAR, 'h-8 min-w-0 flex-1 rounded-lg')}></div>
					<div class={cn(BAR, 'h-8 w-16 shrink-0 rounded-lg')}></div>
					<div class={cn(BAR, 'h-8 w-16 shrink-0 rounded-lg')}></div>
				</div>
				<div class={cn(BAR, 'h-7 w-28 rounded-lg')}></div>
			</div>

			<!-- PAIRING HELP CARD -->
			<div class="space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10" aria-hidden="true">
				<div class={cn(BAR, 'h-4 w-32')}></div>
				<div class={cn(BAR, 'h-3 w-full')}></div>
				<div class={cn(BAR, 'h-3 w-4/5')}></div>
				<div class={cn(BAR, 'h-3 w-2/3')}></div>
			</div>
		</div>
	{:else}
		<!-- LAN TOGGLE -->
		<div
			id="setting-lan-access"
			class={cn(
				'space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10 transition-all duration-300',
				highlightedSettingId === 'lan-access' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]',
			)}
		>
			<div class="flex items-center justify-between gap-3">
				<div>
					<div class="flex items-center gap-2 text-sm font-semibold">
						LAN access
						{#if status.restartRequired}
							<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300" data-testid="restart-pill">Restart required</span>
						{/if}
					</div>
					<p class="mt-1 text-xs opacity-60">
						Lets phones, tablets and other computers on your network use XianScan. They need the access token.
						Takes effect after restarting XianScan.
					</p>
				</div>
				<Switch
					checked={status.lanAccessEnabled}
					disabled={bindPinned || savingLan}
					ariaLabel="LAN access"
					on:change={(e) => setLan(e.detail)}
				/>
			</div>
			{#if bindPinned}
				<p class="text-xs opacity-60" data-testid="bind-pinned">
					{status.bindSource === 'docker' ? 'Set by the Docker image, so it cannot be changed here.' : 'Set by the --lan flag or the XIANSCAN_BIND environment variable, so it cannot be changed here.'}
				</p>
			{/if}
		</div>

		<!-- ACCESS TOKEN -->
		<div
			id="setting-access-token"
			class={cn(
				'space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10 transition-all duration-300',
				highlightedSettingId === 'access-token' && 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]',
			)}
		>
			<div class="text-sm font-semibold">Access token</div>
			<div class="flex items-center gap-2">
				<code class="min-w-0 flex-1 truncate rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/10" data-testid="access-token">{showToken ? status.token : maskedToken}</code>
				<Button size="sm" aria-label={showToken ? 'Hide token' : 'Show token'} on:click={() => (showToken = !showToken)}>
					{#if showToken}<EyeOff class="h-3.5 w-3.5" />Hide{:else}<Eye class="h-3.5 w-3.5" />Show{/if}
				</Button>
				<Button size="sm" aria-label="Copy token" on:click={() => status && copy(status.token, 'Token')}>
					<Copy class="h-3.5 w-3.5" />Copy
				</Button>
			</div>
			<Button size="sm" variant="ghost" on:click={() => (confirmRegenerate = true)}>
				<RefreshCw class="h-3.5 w-3.5" />Regenerate
			</Button>
		</div>

		<!-- LAN URLS -->
		{#if status.effectiveBind === 'lan' && status.lanUrls.length > 0}
			<div class="space-y-2 rounded-2xl border border-black/10 p-4 dark:border-white/10">
				<div class="text-sm font-semibold">Addresses on your network</div>
				{#each status.lanUrls as url}
					<div class="flex items-center gap-2">
						<code class="flex-1 truncate text-xs">{url}</code>
						<Button size="sm" aria-label={`Copy ${url}`} on:click={() => copy(url, 'Address')}><Copy class="h-3.5 w-3.5" /></Button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- PAIRING HELP -->
		<div class="space-y-1 rounded-2xl border border-black/10 p-4 text-xs opacity-80 dark:border-white/10">
			<div class="text-sm font-semibold opacity-100">Pair a device</div>
			<p>
				<strong>Mihon:</strong> turn on LAN access above and restart XianScan. Then in the extension settings, set Server
				address to one of the addresses shown and paste the Access token.
			</p>
			<p><strong>Browser importer:</strong> extension Settings, paste the Access token.</p>
			{#if status.effectiveBind === 'lan' && status.lanUrls.length > 0}
				<p><strong>Another device:</strong> open one of the addresses above and paste the token once.</p>
			{:else}
				<p><strong>Another device:</strong> turn on LAN access, restart XianScan, then open one of the listed addresses and paste the token once.</p>
			{/if}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmRegenerate}
	title="Regenerate the access token?"
	message="Every paired phone and extension will need the new token."
	confirmLabel="Regenerate"
	loading={regenerating}
	on:confirm={regenerate}
	on:cancel={() => (confirmRegenerate = false)}
/>
