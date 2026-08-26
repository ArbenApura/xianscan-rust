<script lang="ts">
	// IMPORTED ENVS
	import { browser } from '$app/environment';
	// IMPORTED DEP-MODULES
	import { Toaster } from 'svelte-sonner';
	import { onMount } from 'svelte';
	// IMPORTED MODULES
	import '../app.css';
	import { settings, THEME_CLASS, applyThemeClass, applyFontFamily } from '$lib/stores/settings';
	import { readingHistory } from '$lib/stores/reading-history';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	// UNREGISTER ANY ROGUE SERVICE WORKER / EVAPORATE ACCUMULATED LOCALHOST CACHESTORAGE
	onMount(() => {
		if (browser && 'serviceWorker' in navigator) {
			navigator.serviceWorker.getRegistrations().then((registrations) => {
				for (const reg of registrations) {
					reg.unregister();
				}
			});
		}
		if (browser && 'caches' in window) {
			caches.keys().then((names) => {
				for (const name of names) {
					caches.delete(name);
				}
			});
		}
	});

	// HYDRATE CANONICAL DATABASE SETTINGS & READING PROGRESS
	$: if (data?.canonicalSettings) {
		settings.hydrateFromRemote(data.canonicalSettings);
	}
	$: if (data?.readingHistory) {
		readingHistory.hydrateFromRemote(data.readingHistory);
	}

	// SYNC LOCAL STORE FROM SSR PREFERENCES (VIEWPORT MODES)
	$: if (data?.preferences) {
		settings.update((s) => ({
			...s,
			theme: data.preferences.theme ?? s.theme,
			appFont: data.preferences.appFont ?? s.appFont,
			readerViewMode: data.preferences.readerViewMode ?? s.readerViewMode,
			webtoonKind: data.preferences.webtoonKind ?? s.webtoonKind,
			webtoonWidth: data.preferences.webtoonWidth ?? s.webtoonWidth,
		}));
	}

	// KEEP THE DOCUMENT ROOT (dark CLASS, color-scheme, BG, FONT) IN SYNC WITH ACTIVE PREFERENCES
	$: if (browser) {
		applyThemeClass($settings.theme);
		applyFontFamily($settings.appFont);
	}
</script>

<!-- APP ROOT — THEME SURFACE COLOURS APPLIED ONCE HERE; PAGES/PANELS INHERIT THEM -->
<div class={THEME_CLASS[$settings.theme] + ' min-h-screen'}>
	<slot />
</div>

<Toaster
	position="top-center"
	richColors
	closeButton
	theme={$settings.theme === 'dark' ? 'dark' : 'light'}
	toastOptions={{
		style: 'font-family: var(--app-font-family, inherit);',
	}}
/>
