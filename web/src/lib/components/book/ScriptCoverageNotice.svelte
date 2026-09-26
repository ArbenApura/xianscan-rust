<!-- WARNS WHEN NO INSTALLED FONT CAN RENDER THE CHOSEN TARGET LANGUAGE'S SCRIPT (FEAT-006 PHASE 9) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onDestroy } from 'svelte';
	// IMPORTED MODULES
	import { scriptOfLanguage } from '$lib/languages';
	import { SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
	// IMPORTED DEP-COMPONENTS
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';

	// -- PROPS -- //

	export let lang: string;

	// -- STATES -- //

	let uncovered: ScriptFontSlot | null = null;
	let checkId = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	// -- FUNCTIONS -- //

	async function check(code: string): Promise<void> {
		const id = ++checkId;
		const script = scriptOfLanguage(code);
		if (!script || script === 'latin') {
			uncovered = null;
			return;
		}
		try {
			const res = await fetch(`/api/system/fonts/coverage?script=${script}`);
			if (!res.ok || id !== checkId) return;
			const data = (await res.json()) as { covered: boolean };
			// A NEWER CHECK MAY HAVE STARTED WHILE THE BODY WAS READ
			if (id !== checkId) return;
			uncovered = data.covered ? null : script;
		} catch {
			// NOTHING TO WARN ABOUT WHEN THE CHECK ITSELF FAILS
		}
	}

	// -- LIFECYCLES -- //

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	// -- REACTIVE STATEMENTS -- //

	$: {
		if (timer) clearTimeout(timer);
		const code = lang;
		timer = setTimeout(() => check(code), 250);
	}
</script>

{#if uncovered}
	<div class="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300" role="status" data-testid="script-coverage-notice">
		<AlertTriangle size={13} class="mt-0.5 shrink-0" />
		<span>
			No installed font has {SCRIPT_LABELS[uncovered]} letters, so translated text would show as boxes. Pick or import one in
			Settings, Typesetting & Lettering, Script Fonts.
		</span>
	</div>
{/if}
