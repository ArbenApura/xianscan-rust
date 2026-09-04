<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';

	// IMPORTED ICONS
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';

	// IMPORTED COMPONENTS
	import { Button, Modal, TextArea } from '$lib/components/ui';

	// -- OPTIONAL PROPS -- //
	export let open = false;
	export let book: {
		id: string;
		title: string;
		titleTarget?: string | null;
		customPrompt?: string | null;
	} | null = null;
	export let bookId: string = book?.id ?? '';
	export let bookTitle: string = book?.titleTarget || book?.title || '';
	export let initialPrompt: string = book?.customPrompt ?? '';

	// -- EVENTS -- //
	const dispatch = createEventDispatcher<{
		saved: { customPrompt: string | null; book?: any };
		close: void;
	}>();

	// -- STATES -- //
	let directivesText = '';
	let saving = false;
	let prevOpen = false;

	// REACTIVELY SYNCHRONIZE TEXT BUFFER WHEN OPENED
	$: effectiveBookId = book?.id ?? bookId;
	$: effectiveBookTitle = book?.titleTarget || book?.title || bookTitle;

	$: if (open && !prevOpen) {
		directivesText = (book?.customPrompt ?? initialPrompt ?? '').slice(0, 4000);
		prevOpen = true;
	} else if (!open) {
		prevOpen = false;
	}

	// -- FUNCTIONS -- //
	function resetDirectives() {
		directivesText = '';
		toast.success('Directives cleared from editor');
	}

	function handleClose() {
		open = false;
		dispatch('close');
	}

	async function saveDirectives() {
		if (!effectiveBookId) return;
		saving = true;
		try {
			const cleaned = directivesText.trim();
			const resp = await fetch(`/api/books/${effectiveBookId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ customPrompt: cleaned || null }),
			});

			if (!resp.ok) {
				const err = await resp.json().catch(() => null);
				throw new Error(err?.message || 'Failed to update directives');
			}

			const data = await resp.json();
			dispatch('saved', { customPrompt: cleaned || null, book: data.book });
			toast.success('Book localization directives saved');
			handleClose();
		} catch (e: any) {
			toast.error(e?.message || 'Failed to save directives');
		} finally {
			saving = false;
		}
	}
</script>

<Modal bind:open title="Localization Directives" size="lg" on:close={handleClose}>
	<div class="space-y-4">
		<!-- CONTEXT & EXPLANATION -->
		<div>
			<h3 class="text-sm font-semibold truncate text-foreground/90">
				{effectiveBookTitle || 'Book Directives'}
			</h3>
			<p class="text-xs opacity-65 mt-1 leading-relaxed">
				Add custom instructions for the translation model when processing chapters in this book. Use this to guide dialogue tone, character speaking styles, honorifics, or genre terms. Text structure and glossary entries are handled automatically.
			</p>
		</div>

		<!-- EDITOR TEXTAREA -->
		<div class="space-y-1.5">
			<TextArea
				bind:value={directivesText}
				rows={8}
				maxlength={4000}
				placeholder="e.g. Keep cultivation ranks formal in pinyin. Retain Korean honorifics like hyung and sunbae instead of translating to brother or senior. Make the main character speak casually while elders speak formally."
			/>
			<div class="flex items-center justify-between text-xs opacity-60 px-0.5">
				<div>
					{#if directivesText.trim().length > 0}
						<button
							type="button"
							use:ripple
							on:click={resetDirectives}
							class="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100 hover:text-red-500 transition-colors cursor-pointer"
						>
							<RotateCcw size={11} />
							<span>Clear Directives</span>
						</button>
					{/if}
				</div>
				<span class="font-mono text-[11px]">{directivesText.length} / 4,000</span>
			</div>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<Button on:click={handleClose}>Cancel</Button>
		<Button variant="primary" loading={saving} disabled={saving} on:click={saveDirectives}>
			Save Directives
		</Button>
	</svelte:fragment>
</Modal>
