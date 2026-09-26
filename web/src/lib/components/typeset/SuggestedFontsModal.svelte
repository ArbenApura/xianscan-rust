<!-- FREE ACCENT FONTS (FEAT-010 ADR-011): LINKS ONLY, XIANSCAN DOWNLOADS AND BUNDLES NOTHING -->
<script lang="ts">
	// IMPORTED MODULES
	import { SUGGESTED_ACCENT_FONTS } from '$lib/suggested-accent-fonts';
	import { SCRIPT_LABELS, type ScriptFontSlot } from '$lib/typeset-scripts';
	// IMPORTED DEP-COMPONENTS
	import ExternalLink from 'lucide-svelte/icons/external-link';
	// IMPORTED COMPONENTS
	import Modal from '$lib/components/ui/Modal.svelte';

	// -- OPTIONAL PROPS -- //

	export let open = false;

	// -- FUNCTIONS -- //

	/** SHORT SCRIPT NAME FOR THE LEFT COLUMN ("Chinese", NOT "Chinese (Han)"). */
	function scriptName(script: string): string {
		return script === 'latin' ? 'Latin' : (SCRIPT_LABELS[script as ScriptFontSlot]?.split(' (')[0] ?? script);
	}
</script>

<Modal bind:open title="Free Accent Fonts" size="md" placement="center" on:close={() => (open = false)}>
	<div class="space-y-1.5" data-testid="suggested-accent-fonts">
		<p class="pb-1 text-[11px] opacity-70">
			Sigmar One is already bundled as the Latin accent font. For another look or another script, download one from its page, then pick <strong>Import font...</strong> in an Accent cell. All are under the SIL Open Font License.
		</p>
		{#each SUGGESTED_ACCENT_FONTS as font (font.family)}
			<a
				href={font.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
				data-testid={`suggested-font-${font.family}`}
			>
				<span class="w-20 shrink-0 text-[10px] font-semibold uppercase opacity-50">
					{scriptName(font.script)}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-xs font-bold">{font.family}</span>
					<span class="block truncate text-[10px] opacity-60">{font.note}</span>
				</span>
				<ExternalLink size={12} class="shrink-0 opacity-50" />
			</a>
		{/each}
		<p class="pt-1 text-[10px] opacity-60">
			Freeware comic fonts (for example Blambot fonts) also work for your own reading, but their licences usually forbid sharing them.
		</p>
	</div>
</Modal>
