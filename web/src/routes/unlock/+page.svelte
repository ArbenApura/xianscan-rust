<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';
	// IMPORTED MODULES
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';
	import { safeNext } from '$lib/utils/safe-next';

	// -- STATES -- //

	let token = '';
	let submitting = false;
	let errorMessage = '';

	// -- REACTIVE STATEMENTS -- //

	$: next = safeNext($page.url.searchParams.get('next'));

	// -- FUNCTIONS -- //

	// FULL NAVIGATION (NOT goto) SO THE ROOT LAYOUT RELOADS ITS DATA WITH THE NEW SESSION COOKIE
	function enterApp() {
		window.location.assign(next);
	}

	async function unlock() {
		if (!token.trim() || submitting) return;
		submitting = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/auth/unlock', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: token.trim() }),
			});
			if (res.status === 204) {
				enterApp();
				return;
			}
			const data = await res.json().catch(() => ({}));
			errorMessage = data.message || 'Could not unlock XianScan.';
		} catch {
			errorMessage = 'Could not reach XianScan. Check that it is still running.';
		} finally {
			submitting = false;
		}
	}

	// -- LIFECYCLES -- //

	onMount(async () => {
		try {
			const res = await fetch('/api/auth/status');
			const data = await res.json();
			if (data.authenticated) enterApp();
		} catch {
			// STAY ON THE FORM
		}
	});
</script>

<svelte:head>
	<title>Unlock XianScan</title>
</svelte:head>

<!-- UNLOCK: ONE TOKEN FIELD, NO APP CHROME -->
<main class="flex min-h-full items-center justify-center px-4 py-16">
	<form class="w-full max-w-sm space-y-4" on:submit|preventDefault={unlock}>
		<div class="space-y-1">
			<h1 class="text-xl font-semibold">Unlock XianScan</h1>
			<p class="text-sm opacity-70">
				This device needs the access token once. On the computer running XianScan, open Settings, Network &amp;
				Access and copy the token. On a headless server, run
				<code class="rounded bg-black/5 px-1 dark:bg-white/10">xianscan --print-token</code>. In Docker, run
				<code class="rounded bg-black/5 px-1 dark:bg-white/10">docker exec &lt;container&gt; /app/xianscan --print-token</code>.
			</p>
		</div>

		<label class="block">
			<span class="mb-1 block text-xs font-medium opacity-60">Access token</span>
			<input
				type="password"
				bind:value={token}
				autocomplete="current-password"
				spellcheck="false"
				class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#c0392b] focus:ring-2 focus:ring-[#c0392b]/30 dark:border-white/[0.06]"
			/>
		</label>

		{#if errorMessage}
			<p class="text-sm text-[#c0392b]" role="alert">{errorMessage}</p>
		{/if}

		<Button type="submit" variant="primary" class="w-full" loading={submitting} disabled={!token.trim()}>Unlock</Button>
	</form>
</main>
