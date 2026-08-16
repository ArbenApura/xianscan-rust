<script lang="ts" context="module">
	import type { ComponentType } from 'svelte';
	export interface SelectOption {
		value: string;
		label: string;
		icon?: ComponentType;
		hint?: string;
	}

	function portal(node: HTMLElement, target: HTMLElement) {
		target.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
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
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';

	// -- REQUIRED PROPS -- //

	export let items: SelectOption[];

	// -- OPTIONAL PROPS -- //

	export let value = '';
	export let placeholder = 'Select…';
	export let disabled = false;
	let className = '';
	export { className as class };

	// -- CONSTANTS -- //

	const dispatch = createEventDispatcher<{ change: string }>();

	// -- STATES -- //

	let open = false;
	let triggerEl: HTMLButtonElement;
	let dropdownEl: HTMLDivElement;
	let portalTarget: HTMLDivElement;
	let dropdownStyle = '';
	// KEYBOARD-HIGHLIGHTED OPTION (ROVING, VIA aria-activedescendant)
	let activeIndex = -1;
	const listboxId = `sel-${Math.round(performance.now() * 1000)}-${Math.floor(performance.now() % 1000)}`;
	const optionId = (i: number) => `${listboxId}-opt-${i}`;

	// -- REACTIVE STATES -- //

	$: selected = items.find((o) => o.value === value) ?? null;
	// THEME-AWARE OPAQUE POPOVER SURFACE + BORDER (WAS A HARDCODED white / slate-800 PLANE)
	$: popover = THEME_POPOVER[$settings.theme];
	$: popoverBorder = THEME_PANEL_BORDER[$settings.theme];

	// -- FUNCTIONS -- //

	function select(opt: SelectOption) {
		value = opt.value;
		open = false;
		dispatch('change', opt.value);
		triggerEl?.focus();
	}

	async function moveActive(to: number) {
		activeIndex = Math.min(items.length - 1, Math.max(0, to));
		await tick();
		dropdownEl?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({ block: 'nearest' });
	}

	async function openMenu(active = items.findIndex((o) => o.value === value)) {
		if (disabled || open) return;
		open = true;
		updatePosition();
		await tick();
		updatePosition();
		await moveActive(active < 0 ? 0 : active);
	}

	// KEYBOARD ON THE TRIGGER: OPEN THE LISTBOX AND PRE-HIGHLIGHT.
	function onTriggerKeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openMenu();
		}
	}

	function updatePosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const gap = 6;
		const maxH = 256;
		const width = rect.width;
		let left = rect.left;
		if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
		if (left < 8) left = 8;
		// FLIP ABOVE THE TRIGGER WHEN THERE IS NOT ROOM BELOW. ANCHOR THE DROPDOWN'S
		// BOTTOM EDGE TO THE TRIGGER SO IT HUGS IT REGARDLESS OF ITS ACTUAL HEIGHT.
		const spaceBelow = window.innerHeight - rect.bottom - gap;
		const spaceAbove = rect.top - gap;
		// RUNTIME-DYNAMIC PIXEL VALUES (left, width, top/bottom) CANNOT USE TAILWIND ARBITRARY CLASSES
		// BECAUSE THEY DEPEND ON getBoundingClientRect() AT RUNTIME — style="" EXCEPTION (b).
		const base = `left:${left}px;width:${width}px;`;
		if (spaceBelow < maxH && spaceAbove > spaceBelow) {
			dropdownStyle = `${base}bottom:${Math.round(window.innerHeight - rect.top + gap)}px;`;
		} else {
			dropdownStyle = `${base}top:${Math.round(rect.bottom + gap)}px;`;
		}
	}

	async function toggle() {
		if (disabled) return;
		if (open) {
			open = false;
		} else {
			await openMenu();
		}
	}

	function onClickOutside(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (triggerEl?.contains(t) || dropdownEl?.contains(t)) return;
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		switch (e.key) {
			case 'Escape':
				e.stopPropagation();
				open = false;
				triggerEl?.focus();
				break;
			case 'ArrowDown':
				e.preventDefault();
				moveActive(activeIndex + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				moveActive(activeIndex - 1);
				break;
			case 'Home':
				e.preventDefault();
				moveActive(0);
				break;
			case 'End':
				e.preventDefault();
				moveActive(items.length - 1);
				break;
			case 'Enter':
			case ' ':
				if (activeIndex >= 0 && items[activeIndex]) {
					e.preventDefault();
					select(items[activeIndex]);
				}
				break;
		}
	}

	function onScroll() {
		if (open) updatePosition();
	}

	// -- LIFECYCLES -- //

	onMount(() => {
		portalTarget = document.createElement('div');
		document.body.appendChild(portalTarget);
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

<!-- TRIGGER -->
<div class={cn('relative', className)}>
	<button
		bind:this={triggerEl}
		type="button"
		{disabled}
		use:ripple={{ disabled }}
		on:click={toggle}
		on:keydown={onTriggerKeydown}
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listboxId : undefined}
		aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
		class={cn(
			'flex w-full items-center gap-2 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-left text-sm transition-colors hover:border-black/20 dark:border-white/[0.08] dark:hover:border-white/20',
			open && 'border-[#c0392b] ring-1 ring-[#c0392b] dark:border-[#c0392b]',
			disabled && 'pointer-events-none opacity-50',
		)}
	>
		{#if selected?.icon}<svelte:component this={selected.icon} size={14} class="shrink-0 opacity-60" />{/if}
		<span class={cn('flex-1 truncate', !selected && 'opacity-40')}>{selected?.label ?? placeholder}</span>
		{#if selected?.hint}<span class="shrink-0 text-xs tabular-nums opacity-40">{selected.hint}</span>{/if}
		<ChevronDown
			size={14}
			class={cn('shrink-0 opacity-50 transition-transform duration-200', open && 'rotate-180')}
		/>
	</button>
</div>

<!-- DROPDOWN (PORTALED — NEUTRAL SURFACE) -->
<!-- RUNTIME-DYNAMIC PIXEL VALUES (left, width, top/bottom) REQUIRE style="" — EXCEPTION (b). FIXED POSITIONING AND Z-INDEX ARE IN TAILWIND CLASSES. -->
{#if open && portalTarget}
	<div
		bind:this={dropdownEl}
		use:portal={portalTarget}
		role="listbox"
		id={listboxId}
		tabindex="-1"
		transition:fly={{ y: -8, duration: 160, easing: cubicOut }}
		style={dropdownStyle}
		class={cn('fixed z-[9999] max-h-64 overflow-y-auto rounded-xl border p-1 shadow-lg', popover, popoverBorder)}
	>
		<!-- OPTION LIST -->
		{#each items as opt, i (opt.value)}
			<button
				type="button"
				role="option"
				id={optionId(i)}
				aria-selected={opt.value === value}
				use:ripple
				on:click={() => select(opt)}
				on:mousemove={() => (activeIndex = i)}
				class={cn(
					'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
					opt.value === value
						? 'bg-[#c0392b]/10 text-[#b23a2e] dark:text-[#e08a63]'
						: 'hover:bg-black/5 dark:hover:bg-white/5',
					i === activeIndex && 'bg-black/5 dark:bg-white/10',
				)}
			>
				{#if opt.icon}<svelte:component this={opt.icon} size={14} class="shrink-0" />{/if}
				<span class="flex-1 truncate">{opt.label}</span>
				{#if opt.hint}<span class="shrink-0 text-xs tabular-nums opacity-40">{opt.hint}</span>{/if}
				{#if opt.value === value}<Check size={14} class="shrink-0" />{/if}
			</button>
		{/each}
	</div>
{/if}
