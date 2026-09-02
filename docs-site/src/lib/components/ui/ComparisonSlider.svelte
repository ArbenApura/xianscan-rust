<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onMount } from 'svelte';

	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- REQUIRED PROPS -- //

	export let beforeSrc: string;
	export let afterSrc: string;

	// -- OPTIONAL PROPS -- //

	export let beforeLabel: string = 'RAW';
	export let afterLabel: string = 'TRANSLATED';
	export let lazy: boolean = false;

	let className = '';
	export { className as class };

	// -- STATES -- //

	let sliderPos = 50;
	let isDragging = false;
	let isTallStrip = false;
	let stageEl: HTMLElement | null = null;
	let baseImgEl: HTMLImageElement | null = null;

	// -- FUNCTIONS -- //

	function checkAspectRatio(img: HTMLImageElement | null) {
		if (!img) return;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			isTallStrip = img.naturalHeight / img.naturalWidth > 1.6;
		}
	}

	function handleImageLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		checkAspectRatio(img);
	}

	$: if (baseImgEl && baseImgEl.complete) {
		checkAspectRatio(baseImgEl);
	}

	$: if (afterSrc || beforeSrc) {
		if (baseImgEl && baseImgEl.complete) {
			checkAspectRatio(baseImgEl);
		}
	}

	function updatePosition(clientX: number) {
		if (!stageEl) return;
		const rect = stageEl.getBoundingClientRect();
		if (rect.width <= 0) return;
		const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
		sliderPos = Math.round((x / rect.width) * 1000) / 10;
	}

	function handlePointerDown(e: PointerEvent) {
		if (!stageEl) return;
		isDragging = true;
		stageEl.setPointerCapture?.(e.pointerId);
		updatePosition(e.clientX);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		updatePosition(e.clientX);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		if (stageEl?.hasPointerCapture?.(e.pointerId)) {
			stageEl.releasePointerCapture(e.pointerId);
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		let step = 0;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			step = -5;
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			step = 5;
		} else if (e.key === 'Home') {
			sliderPos = 0;
			e.preventDefault();
			return;
		} else if (e.key === 'End') {
			sliderPos = 100;
			e.preventDefault();
			return;
		}

		if (step !== 0) {
			sliderPos = Math.max(0, Math.min(100, sliderPos + step));
			e.preventDefault();
		}
	}

	onMount(() => {
		const handleGlobalPointerUp = () => {
			isDragging = false;
		};
		window.addEventListener('pointerup', handleGlobalPointerUp);
		window.addEventListener('pointercancel', handleGlobalPointerUp);
		return () => {
			window.removeEventListener('pointerup', handleGlobalPointerUp);
			window.removeEventListener('pointercancel', handleGlobalPointerUp);
		};
	});
</script>

<!-- SLICK, COMPACT STUDIO COMPARISON SLIDER -->
<div class="flex justify-center w-full select-none">
	<!-- SCROLLABLE FRAME (FOR TALL WEBTOONS) OR NATURAL FRAME (FOR STANDARD PAGES) -->
	<div
		class={cn(
			'relative overflow-hidden rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] shadow-sm',
			isTallStrip
				? 'w-full max-w-[480px] sm:max-w-[560px] max-h-[580px] sm:max-h-[660px] overflow-y-auto'
				: 'inline-block max-w-full',
			className,
		)}
	>
		<!-- INTERACTIVE STAGE -->
		<div
			bind:this={stageEl}
			role="slider"
			tabindex="0"
			aria-label="Image comparison slider"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(sliderPos)}
			on:pointerdown={handlePointerDown}
			on:pointermove={handlePointerMove}
			on:pointerup={handlePointerUp}
			on:pointercancel={handlePointerUp}
			on:keydown={handleKeyDown}
			class={cn(
				'group relative block focus:outline-none',
				isDragging ? 'cursor-ew-resize' : 'cursor-col-resize',
			)}
			style="touch-action: pan-y;"
		>
			<!-- AFTER IMAGE (BOTTOM BASE LAYER) -->
			<img
				bind:this={baseImgEl}
				src={afterSrc}
				alt={afterLabel}
				on:load={handleImageLoad}
				class={cn(
					'block pointer-events-none',
					isTallStrip
						? 'w-full h-auto'
						: 'max-h-[540px] sm:max-h-[640px] w-auto max-w-full object-contain'
				)}
				draggable="false"
				loading={lazy ? 'lazy' : 'eager'}
				decoding="async"
			/>

			<!-- BEFORE IMAGE (CLIPPED TOP LAYER) -->
			<div
				class="absolute inset-0 overflow-hidden pointer-events-none"
				style="clip-path: inset(0 {100 - sliderPos}% 0 0);"
			>
				<img
					src={beforeSrc}
					alt={beforeLabel}
					class={cn(
						'block pointer-events-none',
						isTallStrip
							? 'w-full h-auto'
							: 'h-full w-full object-contain'
					)}
					draggable="false"
					loading={lazy ? 'lazy' : 'eager'}
					decoding="async"
				/>
			</div>

			<!-- CORNER LABELS -->
			<div
				class="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-md bg-black/75 px-2 py-0.5 text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-white backdrop-blur-xs transition-opacity duration-150 shadow-xs border border-white/10"
				style="opacity: {sliderPos < 20 ? Math.max(0, sliderPos / 20) : 1};"
			>
				{beforeLabel}
			</div>

			<div
				class={cn(
					'pointer-events-none absolute top-2.5 right-2.5 z-10 rounded-md px-2 py-0.5 text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-white backdrop-blur-xs transition-opacity duration-150 shadow-xs border border-white/10',
					afterLabel.includes('INPAINT')
						? 'bg-[#a97f28]/90 text-white'
						: 'bg-[#b23a2e]/90 text-white',
				)}
				style="opacity: {sliderPos > 80 ? Math.max(0, (100 - sliderPos) / 20) : 1};"
			>
				{afterLabel}
			</div>

			<!-- VERTICAL DIVIDER LINE -->
			<div
				class="absolute top-0 bottom-0 w-[1.5px] bg-white pointer-events-none shadow-[0_0_8px_rgba(0,0,0,0.5)] z-20"
				style="left: {sliderPos}%;"
			>
				<!-- SLICK COMPACT HANDLE -->
				<div
					class="sticky top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full border border-white/90 bg-[#b23a2e] text-white shadow-md transition-transform duration-100 group-hover:scale-110 active:scale-95"
				>
					<svg viewBox="0 0 24 24" class="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-none stroke-current stroke-2">
						<path d="m9 18-6-6 6-6" />
						<path d="m15 6 6 6-6 6" />
					</svg>
				</div>
			</div>
		</div>
	</div>
</div>