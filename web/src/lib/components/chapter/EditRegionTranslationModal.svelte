<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils/cn';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { ripple } from '$lib/actions/ripple';
	import { scrollLock } from '$lib/actions/scrollLock';
	import { registerModalDismiss, unregisterModalDismiss } from '$lib/utils/modal-stack';
	import { settings, THEME_PANEL, THEME_PANEL_BORDER } from '$lib/stores/settings';
	import { validateForm } from '$lib/utils/form';
	import { translateTextSchema, updateRegionSchema } from '$lib/schemas';
	import Button from '$lib/components/ui/Button.svelte';
	import Copy from 'lucide-svelte/icons/copy';
	import Languages from 'lucide-svelte/icons/languages';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import Check from 'lucide-svelte/icons/check';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Type from 'lucide-svelte/icons/type';
	import Wand2 from 'lucide-svelte/icons/wand-2';
	import X from 'lucide-svelte/icons/x';

	export let open = false;
	export let pageId: number;
	export let region: any | null = null;

	const modalId = `edit-region-modal-${Math.random().toString(36).slice(2)}`;
	const dispatch = createEventDispatcher<{
		close: void;
		saved: { region: any; outputPath?: string; outputRev?: number };
	}>();

	let editTargetText = '';
	let customInstruction = '';
	let isRerolling = false;
	let isSaving = false;

	const AI_PRESET_PROMPTS = [
		{ label: 'Dramatic', prompt: 'Make it sound dramatic and impactful for a comic climax' },
		{ label: 'Concise', prompt: 'Translate concisely to fit inside a small speech bubble' },
		{ label: 'Literal', prompt: 'Provide an accurate, literal translation' },
		{ label: 'Poetic', prompt: 'Use poetic and elevated fantasy diction' },
		{ label: 'Casual / Slang', prompt: 'Use natural, punchy modern spoken dialogue' },
		{ label: 'Exclamatory', prompt: 'Emphasize urgency, exclamation, and emotional intensity' },
	];

	let lastInitializedKey: string | null = null;

	$: if (open && region) {
		const key = `${region.id}_${open}`;
		if (lastInitializedKey !== key) {
			lastInitializedKey = key;
			editTargetText = region.textTarget ?? '';
			customInstruction = '';
			isRerolling = false;
			isSaving = false;
		}
	} else if (!open) {
		lastInitializedKey = null;
	}

	$: isModified = Boolean(
		region?.originalTarget &&
		editTargetText &&
		editTargetText.trim() !== (region.originalTarget || '').trim()
	);

	$: panel = THEME_PANEL[$settings.theme];
	$: panelBorder = THEME_PANEL_BORDER[$settings.theme];

	// HIERARCHICAL ESCAPE KEY REGISTRATION (DEPTH-AWARE DISMISSAL)
	$: if (open && !isSaving) {
		registerModalDismiss(modalId, () => handleClose());
	} else {
		unregisterModalDismiss(modalId);
	}

	onDestroy(() => {
		unregisterModalDismiss(modalId);
	});

	function getBox(rawBox: any): { x: number; y: number; w: number; h: number } | null {
		if (!rawBox) return null;
		if (typeof rawBox === 'string') {
			try {
				return JSON.parse(rawBox);
			} catch {
				return null;
			}
		}
		if (typeof rawBox === 'object') return rawBox;
		return null;
	}

	async function handleRerunAi() {
		if (!region?.textSource) return;
		const payload = {
			text: region.textSource,
			kind: 'general' as const,
			instruction: customInstruction.trim() || undefined,
			pageId,
		};
		const validation = validateForm(translateTextSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid translation request');
			return;
		}

		isRerolling = true;
		try {
			const res = await fetch('/api/translate-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'AI retranslation failed');
			}
			const data = await res.json();
			if (typeof data.text === 'string') {
				editTargetText = data.text;
				toast.success('AI translation re-rolled successfully');
			}
		} catch (e: any) {
			toast.error(e?.message || 'Failed to re-roll AI translation');
		} finally {
			isRerolling = false;
		}
	}

	async function handleSave(action: 'save' | 'reset_ai' = 'save') {
		if (!region || !pageId) return;
		const payload = {
			textTarget: action === 'reset_ai' ? (region.originalTarget ?? region.textTarget) : editTargetText,
			action,
		};
		const validation = validateForm(updateRegionSchema, payload);
		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid update request');
			return;
		}

		isSaving = true;
		try {
			const res = await fetch(`/api/pages/${pageId}/regions/${region.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validation.data),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Failed to save translation');
			}
			const data = await res.json();
			toast.success(action === 'reset_ai' ? 'Reset to default AI translation' : 'Saved and re-typeset page');
			dispatch('saved', { region: data.region, outputPath: data.outputPath, outputRev: data.outputRev });
			handleClose();
		} catch (e: any) {
			toast.error(e?.message || 'Error saving translation');
		} finally {
			isSaving = false;
		}
	}

	function handleClose() {
		if (isSaving) return;
		open = false;
		dispatch('close');
	}
</script>

{#if open && region}
	{@const b = getBox(region.box)}
	<div
		use:scrollLock
		class="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:p-4 overflow-y-auto overflow-x-hidden sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-region-title"
	>
		<!-- BACKDROP -->
		<button
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			on:click={handleClose}
			aria-label="Close dialog"
			tabindex="-1"
			transition:fade={{ duration: 150 }}
		></button>

		<!-- MODAL PANEL CARD -->
		<div
			use:focusTrap
			tabindex="-1"
			transition:fly={{ y: 24, duration: 220, easing: cubicOut }}
			class={cn(
				'relative z-10 mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl shadow-2xl outline-none text-left sm:rounded-2xl border max-h-[88vh] sm:max-h-[90vh]',
				panel,
				panelBorder,
			)}
		>
			<!-- HEADER -->
			<header class={cn('flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-3.5', panelBorder)}>
				<div class="flex items-center gap-2.5 min-w-0">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#b23a2e]/10 text-[#b23a2e] dark:bg-[#e08a63]/15 dark:text-[#e08a63]">
						<Pencil size={16} />
					</div>
					<div class="min-w-0">
						<h2 id="edit-region-title" class="text-sm sm:text-base font-semibold truncate">
							Edit Region #{region.seq + 1} Translation
						</h2>
					</div>
				</div>

				<button
					on:click={handleClose}
					use:ripple
					disabled={isSaving}
					class="rounded-lg p-1.5 opacity-50 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 disabled:opacity-30 cursor-pointer"
					aria-label="Close dialog"
				>
					<X size={18} />
				</button>
			</header>

			<!-- BODY -->
			<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
				<!-- HERO BANNER -->
				<div class="flex items-start gap-3 rounded-xl border border-[#b23a2e]/20 bg-[#b23a2e]/5 p-3 dark:border-[#e08a63]/20 dark:bg-[#e08a63]/5">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-md bg-[#b23a2e]/15 px-2 py-0.5 text-[10px] font-bold text-[#b23a2e] dark:bg-[#e08a63]/20 dark:text-[#e08a63]">
								Region #{region.seq + 1}
							</span>
							{#if isModified}
								<span class="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
									Manual Edit
								</span>
							{:else if !region.textTarget && !region.originalTarget}
								<span class="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
									Preserved Art / SFX (Bypassed)
								</span>
							{/if}
							{#if b}
								<span class="text-[10px] font-mono opacity-50">
									Box: {b.w}×{b.h}px ({b.x}, {b.y})
								</span>
							{/if}
						</div>
						<p class="mt-1 text-[11px] opacity-70 leading-relaxed">
							Edit localized dialogue, re-roll with customized prompt instructions, or revert to baseline AI translation.
						</p>
					</div>
				</div>

				<!-- CARD 1: RAW OCR SOURCE -->
				<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
					<div class="flex items-center justify-between mb-1.5">
						<div class="flex items-center gap-1.5 font-bold text-xs">
							<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Raw OCR Source</span>
						</div>
						{#if region.textSource}
							<button
								type="button"
								class="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
								on:click={() => {
									navigator.clipboard?.writeText(region.textSource || '');
									toast.success('Copied raw OCR text');
								}}
							>
								<Copy size={12} />
								<span>Copy</span>
							</button>
						{/if}
					</div>
					<div class="font-mono text-xs leading-relaxed select-text p-2.5 rounded-lg bg-black/5 dark:bg-white/5 text-neutral-900 dark:text-neutral-100 break-words">
						{region.textSource || '— (No OCR text detected)'}
					</div>
				</div>

				<!-- CARD 2: AI RE-ROLL STUDIO WITH CUSTOM PROMPT -->
				<div class="rounded-xl border border-[#b23a2e]/20 bg-[#b23a2e]/5 p-3.5 dark:border-[#e08a63]/20 dark:bg-[#e08a63]/5 space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5 font-bold text-xs text-[#b23a2e] dark:text-[#e08a63]">
							<Wand2 size={14} />
							<span>AI Re-roll Studio</span>
						</div>
						<span class="text-[10px] opacity-60">Custom Localization Guidance</span>
					</div>

					<div>
						<input
							type="text"
							bind:value={customInstruction}
							placeholder="e.g. Make it dramatic, informal slang, shorter dialogue..."
							class="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-[#b23a2e] dark:border-white/15 dark:bg-[#141210] dark:text-neutral-100 dark:focus:border-[#e08a63]"
						/>
					</div>

					<!-- PRESET PROMPT PILLS -->
					<div class="flex flex-wrap gap-1.5">
						{#each AI_PRESET_PROMPTS as preset}
							<button
								type="button"
								on:click={() => (customInstruction = preset.prompt)}
								class={`rounded-md border px-2.5 py-1 text-[10px] font-medium transition-all cursor-pointer ${
									customInstruction === preset.prompt
										? 'border-[#b23a2e] bg-[#b23a2e] text-white dark:border-[#e08a63] dark:bg-[#e08a63]'
										: 'border-black/10 bg-white/80 text-neutral-700 hover:bg-white dark:border-white/10 dark:bg-black/40 dark:text-neutral-300 dark:hover:bg-black/60'
								}`}
							>
								{preset.label}
							</button>
						{/each}
					</div>

					<div class="flex justify-end pt-0.5">
						<Button
							variant="primary"
							size="sm"
							loading={isRerolling}
							disabled={isRerolling || !region.textSource}
							on:click={handleRerunAi}
						>
							<Languages size={13} />
							<span>{isRerolling ? 'Translating with AI...' : 'Re-roll with AI'}</span>
						</Button>
					</div>
				</div>

				<!-- CARD 3: TARGET TRANSLATION TEXTAREA -->
				<div class="rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02] space-y-2">
					<div class="flex items-center justify-between">
						<label for="edit-target-text-dialog" class="font-bold text-xs text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
							<Type size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Typeset Translation Output</span>
						</label>
						{#if region.originalTarget && editTargetText !== region.originalTarget}
							<button
								type="button"
								on:click={() => (editTargetText = region.originalTarget ?? '')}
								class="inline-flex items-center gap-1 text-[10px] font-semibold text-[#b23a2e] hover:underline dark:text-[#e08a63] cursor-pointer"
							>
								<RotateCcw size={10} />
								<span>Reset to AI Text</span>
							</button>
						{/if}
					</div>
					<textarea
						id="edit-target-text-dialog"
						bind:value={editTargetText}
						rows="3"
						placeholder="Enter translated dialogue to typeset onto the page..."
						class="w-full rounded-xl border border-black/15 bg-white p-3 text-xs leading-relaxed text-neutral-900 outline-none focus:border-[#b23a2e] focus:ring-1 focus:ring-[#b23a2e] dark:border-white/15 dark:bg-[#141210] dark:text-neutral-100 dark:focus:border-[#e08a63] dark:focus:ring-[#e08a63]"
					></textarea>
				</div>
			</div>

			<!-- FOOTER -->
			<footer class={cn('flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5 sm:px-5 sm:py-3', panelBorder)}>
				<div>
					{#if region?.originalTarget && (isModified || editTargetText !== region.originalTarget)}
						<Button
							variant="ghost"
							size="sm"
							disabled={isSaving}
							on:click={() => handleSave('reset_ai')}
						>
							<RotateCcw size={13} class="mr-1" />
							<span>Reset Default AI</span>
						</Button>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<Button variant="secondary" size="sm" on:click={handleClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						loading={isSaving}
						disabled={isSaving}
						on:click={() => handleSave('save')}
					>
						<Check size={14} class="mr-1" />
						<span>Save</span>
					</Button>
				</div>
			</footer>
		</div>
	</div>
{/if}
