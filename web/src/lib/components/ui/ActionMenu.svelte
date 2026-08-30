<script lang="ts" context="module">
	import type { ComponentType } from 'svelte';
	export interface MenuAction {
		value: string;
		label: string;
		icon?: ComponentType;
		// RENDER IN A DESTRUCTIVE (RED) STYLE — E.G. DELETE
		danger?: boolean;
		disabled?: boolean;
	}

	// MOVE THE MENU TO document.body SO A CLIPPING ANCESTOR (overflow-hidden LIST) CAN'T CUT IT OFF
	function portal(node: HTMLElement, target: HTMLElement) {
		target.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}
</script>

<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	import { settings, THEME_POPOVER, THEME_PANEL_BORDER } from '$lib/stores/settings';
	// IMPORTED DEP-COMPONENTS
	import MoreVertical from 'lucide-svelte/icons/more-vertical';

	// -- REQUIRED PROPS -- //

	export let items: MenuAction[];

	// -- OPTIONAL PROPS -- //

	export let label = 'Actions';
	// TRIGGER ICON SIZE (px) — CALLERS BUMP IT WHERE THE KEBAB SITS BESIDE TALLER TEXT.
	export let iconSize = 16;
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{ select: string }>();
	// FIXED MENU WIDTH SO THE PORTALED POPOVER CAN BE PLACED WITHOUT MEASURING ITS CONTENTS
	const MENU_W = 184;

	// -- STATES -- //

	let open = false;
	let triggerEl: HTMLButtonElement;
	let menuEl: HTMLDivElement;
	let portalTarget: HTMLDivElement | null = typeof document !== 'undefined' ? document.createElement('div') : null;
	let menuStyle = '';

	// -- REACTIVE STATES -- //

	// THEME-AWARE OPAQUE POPOVER SURFACE + BORDER (WAS A HARDCODED white / slate-800 PLANE)
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];

	// -- FUNCTIONS -- //

	function updatePosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const gap = 6;
		const maxH = 280;
		// RIGHT-ALIGN THE MENU TO THE TRIGGER, THEN CLAMP INTO THE VIEWPORT
		let left = rect.right - MENU_W;
		if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8;
		if (left < 8) left = 8;
		const spaceBelow = window.innerHeight - rect.bottom - gap;
		const spaceAbove = rect.top - gap;
		// RUNTIME-DYNAMIC PIXEL VALUES FROM getBoundingClientRect() CANNOT BE TAILWIND CLASSES — style="" EXCEPTION (b)
		const base = `left:${Math.round(left)}px;width:${MENU_W}px;`;
		if (spaceBelow < maxH && spaceAbove > spaceBelow) {
			menuStyle = `${base}bottom:${Math.round(window.innerHeight - rect.top + gap)}px;`;
		} else {
			menuStyle = `${base}top:${Math.round(rect.bottom + gap)}px;`;
		}
	}

	async function openMenu() {
		open = true;
		updatePosition();
		await tick();
		updatePosition();
	}

	function toggle() {
		if (open) open = false;
		else openMenu();
	}

	function choose(item: MenuAction) {
		open = false;
		dispatch('select', item.value);
		triggerEl?.focus();
	}

	function onClickOutside(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (triggerEl?.contains(t) || menuEl?.contains(t)) return;
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.stopPropagation();
			open = false;
			triggerEl?.focus();
		}
	}

	function onScroll() {
		if (open) updatePosition();
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		if (!portalTarget) portalTarget = document.createElement('div');
		if (!portalTarget.parentNode) document.body.appendChild(portalTarget);
		document.addEventListener('mousedown', onClickOutside);
		document.addEventListener('keydown', onKeydown);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onScroll);
	});
	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('mousedown', onClickOutside);
			document.removeEventListener('keydown', onKeydown);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
			if (portalTarget?.parentNode) portalTarget.parentNode.removeChild(portalTarget);
		}
	});
</script>

<!-- KEBAB TRIGGER (THREE VERTICAL DOTS) -->
<button
	bind:this={triggerEl}
	type="button"
	use:ripple
	on:click={toggle}
	aria-haspopup="menu"
	aria-expanded={open}
	aria-label={label}
	class={cn('rounded-lg p-1.5 opacity-80 transition-all hover:opacity-100', open && 'opacity-100', className)}
>
	<MoreVertical size={iconSize} />
</button>

<!-- POPOVER MENU (PORTALED TO body SO THE LIST'S overflow-hidden CAN'T CLIP IT) -->
<!-- RUNTIME-DYNAMIC PIXEL VALUES (left, width, top/bottom) REQUIRE style="" — EXCEPTION (b) -->
{#if open && portalTarget}
	<div
		bind:this={menuEl}
		use:portal={portalTarget}
		role="menu"
		tabindex="-1"
		transition:fly={{ y: -8, duration: 150, easing: cubicOut }}
		style={menuStyle}
		class={cn('fixed z-[9999] overflow-hidden rounded-xl border p-1 shadow-lg', popover, popoverBorder)}
	>
		{#each items as item (item.value)}
			<!-- MENU ITEM -->
			<button
				type="button"
				role="menuitem"
				disabled={item.disabled}
				use:ripple={{ disabled: item.disabled }}
				on:click={() => !item.disabled && choose(item)}
				class={cn(
					'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40',
					item.danger
						? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
						: 'hover:bg-black/5 dark:hover:bg-white/5',
				)}
			>
				{#if item.icon}<svelte:component this={item.icon} size={15} class="shrink-0" />{/if}
				<span class="flex-1 truncate">{item.label}</span>
			</button>
		{/each}
	</div>
{/if}
