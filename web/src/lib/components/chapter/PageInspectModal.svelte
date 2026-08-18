<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	// IMPORTED DEP-COMPONENTS
	import Copy from 'lucide-svelte/icons/copy';
	import Target from 'lucide-svelte/icons/target';
	import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
	import Compass from 'lucide-svelte/icons/compass';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Eye from 'lucide-svelte/icons/eye';
	import Layers from 'lucide-svelte/icons/layers';
	import List from 'lucide-svelte/icons/list';
	import ImageIcon from 'lucide-svelte/icons/image';
	import Pencil from 'lucide-svelte/icons/pencil';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';
	import EditRegionTranslationModal from './EditRegionTranslationModal.svelte';

	// -- REQUIRED PROPS -- //

	// -- OPTIONAL PROPS -- //
	export let open = false;
	export let page: any | null = null;
	export let reloadKey = Date.now();

	// -- CONSTANTS -- //
	const dispatch = createEventDispatcher<{
		close: void;
		update: { page: any; region?: any; reloadKey: number };
	}>();

	// -- STATES -- //
	let inspectTab: 'output' | 'cleaned' | 'original' = 'output';
	let mobileSection: 'image' | 'regions' = 'image';
	let showRegions = true;
	let showTypeset = true;
	let showInpaint = true;
	let hoveredRegionId: number | null = null;
	let imageScrollContainer: HTMLDivElement | null = null;

	// REGION TRANSLATION EDITOR STATE
	let editingRegion: any | null = null;
	let editModalOpen = false;
	let loadingDetails = false;
	let lastFetchedKey: string | null = null;

	$: if (page) {
		if (page.outputPath) inspectTab = 'output';
		else if (page.cleanedPath) inspectTab = 'cleaned';
		else inspectTab = 'original';
	}

	async function fetchFreshPageData(pageId: number, silent = false) {
		if (!pageId) return;
		if (!silent) loadingDetails = true;
		try {
			const res = await fetch(`/api/pages/${pageId}`);
			if (!res.ok) throw new Error('Failed to load page details');
			const data = await res.json();
			if (data.page && data.page.id === pageId) {
				page = { ...page, ...data.page };
				if (page.outputPath && inspectTab === 'original' && !page.cleanedPath) {
					inspectTab = 'output';
				}
				dispatch('update', { page, reloadKey });
			}
		} catch (e: any) {
			if (!silent) toast.error('Could not refresh page regions');
		} finally {
			loadingDetails = false;
		}
	}

	// Auto-sync ONCE whenever inspect modal opens or targets a different page
	$: if (open && page?.id) {
		const key = `${page.id}_${open}`;
		if (lastFetchedKey !== key) {
			lastFetchedKey = key;
			void fetchFreshPageData(page.id, false);
		}
	} else if (!open) {
		lastFetchedKey = null;
	}

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

	function getPolygon(rawPoly: any): [number, number][] | null {
		if (!rawPoly) return null;
		if (typeof rawPoly === 'string') {
			try {
				const parsed = JSON.parse(rawPoly);
				if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
			} catch {
				return null;
			}
		}
		if (Array.isArray(rawPoly) && rawPoly.length >= 3) return rawPoly;
		return null;
	}

	function polygonToSvgPoints(poly: [number, number][]): string {
		return poly.map((p) => `${p[0]},${p[1]}`).join(' ');
	}

	function getRegionAngle(region: any): number | null {
		if (typeof region.angle === 'number') return region.angle;
		const b = getBox(region.box);
		if (b && typeof (b as any).angle === 'number') return (b as any).angle;
		if (region.polygon) {
			try {
				const poly = typeof region.polygon === 'string' ? JSON.parse(region.polygon) : region.polygon;
				if (Array.isArray(poly) && poly.length >= 2) {
					const [p0, p1] = poly;
					if (Array.isArray(p0) && Array.isArray(p1) && p0.length >= 2 && p1.length >= 2) {
						const dx = p1[0] - p0[0];
						const dy = p1[1] - p0[1];
						const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
						if (Math.abs(deg) >= 0.5) return Math.round(deg * 10) / 10;
						return 0;
					}
				}
			} catch {
				return null;
			}
		}
		return null;
	}

	function isRegionVertical(region: any): boolean {
		if (region.vertical === true) return true;
		const b = getBox(region.box);
		if (b && (b as any).vertical === true) return true;
		return false;
	}

	function toggleOriginalOutput() {
		if (!page) return;
		if (inspectTab === 'original') {
			inspectTab = page.outputPath ? 'output' : page.cleanedPath ? 'cleaned' : 'original';
		} else {
			inspectTab = 'original';
		}
	}

	function scrollToRegion(region: any) {
		const b = getBox(region.box);
		if (!b || !imageScrollContainer || !page?.height) return;
		const ratio = b.y / page.height;
		const scrollTarget = ratio * imageScrollContainer.scrollHeight - 60;
		imageScrollContainer.scrollTo({
			top: Math.max(0, scrollTarget),
			behavior: 'smooth',
		});
	}

	function selectRegionOnMobile(region: any) {
		hoveredRegionId = region.id;
		mobileSection = 'image';
		setTimeout(() => {
			scrollToRegion(region);
		}, 60);
	}

	function openEdit(region: any) {
		editingRegion = region;
		editModalOpen = true;
	}

	function handleRegionSaved(e: CustomEvent<{ region: any; outputPath?: string }>) {
		if (!page) return;
		const updatedReg = e.detail.region;
		const reg = page.regions?.find((r: any) => r.id === updatedReg.id);
		if (reg) {
			reg.textTarget = updatedReg.textTarget;
			reg.originalTarget = updatedReg.originalTarget;
		}
		if (e.detail.outputPath) {
			page.outputPath = e.detail.outputPath;
		}
		reloadKey = Date.now();
		page = { ...page };
		editModalOpen = false;
		editingRegion = null;
		dispatch('update', { page, region: updatedReg, reloadKey });
	}

	async function handleQuickResetRegion(region: any) {
		if (!page) return;
		try {
			const res = await fetch(`/api/pages/${page.id}/regions/${region.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reset_ai' }),
			});
			if (!res.ok) throw new Error('Failed to reset translation');
			const data = await res.json();
			const reg = page.regions?.find((r: any) => r.id === region.id);
			if (reg) {
				reg.textTarget = data.region.textTarget;
				reg.originalTarget = data.region.originalTarget;
			}
			if (data.outputPath) {
				page.outputPath = data.outputPath;
			}
			reloadKey = Date.now();
			page = { ...page };
			toast.success(`Reset #${region.seq + 1} to default AI translation`);
			dispatch('update', { page, region: data.region, reloadKey });
		} catch (e: any) {
			toast.error(e?.message || 'Failed to reset translation');
		}
	}

	let retypesetting = false;

	async function handleRetypesetPage() {
		if (!page?.id || retypesetting) return;
		retypesetting = true;
		try {
			const res = await fetch(`/api/pages/${page.id}/typeset`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to retypeset page');
			}
			const data = await res.json();
			if (data.outputPath) {
				page.outputPath = data.outputPath;
			}
			inspectTab = 'output';
			reloadKey = Date.now();
			page = { ...page };
			toast.success(`Page ${page.seq + 1} re-typeset successfully`);
			dispatch('update', { page, reloadKey });
		} catch (e: any) {
			toast.error(e?.message || 'Failed to re-typeset page');
		} finally {
			retypesetting = false;
		}
	}

	function getRegionKind(region: any): 'dialogue_bubble' | 'free_text' | 'sound_effect' {
		if (!region) return 'dialogue_bubble';
		if (region.kind) return region.kind;
		const b = getBox(region.box);
		if (b && (b as any).kind) return (b as any).kind;
		return 'dialogue_bubble';
	}

	function copyInspectDebugInfo() {
		if (!page) return;
		const debug = {
			pageId: page.id,
			seq: page.seq,
			dimensions: { width: page.width, height: page.height },
			status: page.status,
			error: page.error,
			regionsCount: page.regions?.length ?? 0,
			regions: (page.regions || []).map((r: any) => ({
				id: r.id,
				seq: r.seq,
				kind: getRegionKind(r),
				confidence: r.conf,
				angle: getRegionAngle(r),
				vertical: isRegionVertical(r),
				typesetBox: getBox(r.box),
				inpaintPolygon: getPolygon(r.polygon),
				sourceOcr: r.textSource,
				translation: r.textTarget,
				originalTarget: r.originalTarget,
			})),
		};
		navigator.clipboard?.writeText(JSON.stringify(debug, null, 2));
		toast.success('Page debug JSON copied to clipboard.');
	}
</script>

<Modal
	{open}
	title={`Inspect Page ${page ? page.seq + 1 : ''} (ID: ${page?.id ?? ''})`}
	size="3xl"
	bodyClass="p-3 sm:p-5 overflow-hidden flex flex-col h-[88vh] sm:h-[82vh] max-h-[92dvh]"
	on:close={() => dispatch('close')}
>
	{#if page}
		{@const pw = page.width}
		{@const ph = page.height}

		<!-- MOBILE-ONLY SECTION SWITCHER (VISIBLE ON < LG SCREENS) -->
		<div class="mb-2.5 flex lg:hidden items-center justify-center bg-black/5 dark:bg-white/5 p-1 rounded-xl shrink-0">
			<button
				type="button"
				class={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
					mobileSection === 'image'
						? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
						: 'text-neutral-600 dark:text-neutral-400'
				}`}
				on:click={() => (mobileSection = 'image')}
			>
				<ImageIcon size={13} />
				<span>Page Canvas</span>
			</button>

			<button
				type="button"
				class={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
					mobileSection === 'regions'
						? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
						: 'text-neutral-600 dark:text-neutral-400'
				}`}
				on:click={() => (mobileSection = 'regions')}
			>
				<List size={13} />
				<span>Regions ({page.regions?.length ?? 0})</span>
			</button>
		</div>

		<div class="grid grid-cols-1 gap-4 lg:gap-5 lg:grid-cols-12 flex-1 min-h-0 h-full">
			<!-- 1. IMAGE & OVERLAY CANVAS COLUMN -->
			<div class={`flex flex-col gap-2 lg:col-span-7 h-full min-h-0 ${mobileSection === 'image' ? 'flex' : 'hidden lg:flex'}`}>
				<!-- INTERACTIVE COMBINED VIEW & TOGGLE CONTROLS -->
				<div class="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 text-xs shrink-0 bg-black/[0.03] dark:bg-white/[0.03] p-1.5 rounded-xl border border-black/10 dark:border-white/10">
					<!-- SEGMENTED VIEW SWITCHER -->
					<div class="flex flex-wrap items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg">
						<!-- ORIGINAL IMAGE -->
						<button
							type="button"
							class={`inline-flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
								inspectTab === 'original'
									? 'bg-white text-black shadow-2xs dark:bg-neutral-800 dark:text-white'
									: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
							}`}
							on:click={() => (inspectTab = 'original')}
						>
							<Eye size={11} class="sm:w-3 sm:h-3" />
							<span>Original</span>
						</button>

						<!-- TRANSLATED OUTPUT -->
						{#if page.outputPath}
							<button
								type="button"
								class={`inline-flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
									inspectTab === 'output'
										? 'bg-[#b23a2e] text-white shadow-2xs dark:bg-[#e08a63]'
										: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
								}`}
								on:click={() => (inspectTab = 'output')}
							>
								<Sparkles size={11} class="sm:w-3 sm:h-3" />
								<span><span class="hidden xs:inline">Translated</span> Output</span>
							</button>
						{/if}

						<!-- LAMA CLEANED (OPTIONAL) -->
						{#if page.cleanedPath}
							<button
								type="button"
								class={`inline-flex items-center gap-1 rounded-md px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
									inspectTab === 'cleaned'
										? 'bg-neutral-900 text-white shadow-2xs dark:bg-neutral-100 dark:text-neutral-900'
										: 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
								}`}
								on:click={() => (inspectTab = 'cleaned')}
							>
								<Layers size={11} class="sm:w-3 sm:h-3" />
								<span>Cleaned</span>
							</button>
						{/if}
					</div>

					<div class="flex items-center gap-1.5">
						<!-- SYNC / REFRESH DATA BUTTON -->
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer disabled:opacity-50"
							title="Fetch latest detected regions and translation data from database"
							disabled={loadingDetails}
							on:click={() => fetchFreshPageData(page.id, false)}
						>
							<RefreshCw size={11} class={loadingDetails ? 'animate-spin text-[#b23a2e] dark:text-[#e08a63]' : 'text-neutral-500'} />
							<span>{loadingDetails ? 'Syncing...' : 'Sync'}</span>
						</button>

						<!-- QUICK FLIP TOGGLE BUTTON (ORIGINAL <-> TRANSLATED) -->
						{#if page.outputPath}
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
								title="Flip view between Original and Translated Output"
								on:click={toggleOriginalOutput}
							>
								<ArrowLeftRight size={11} class="text-[#b23a2e] dark:text-[#e08a63]" />
								<span>{inspectTab === 'original' ? 'Output' : 'Original'}</span>
							</button>
						{/if}

						<!-- REGION MAP MASTER OVERLAY TOGGLE -->
						<button
							type="button"
							class={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
								showRegions
									? 'bg-neutral-900 text-white shadow-2xs dark:bg-neutral-100 dark:text-neutral-900'
									: 'border border-black/10 bg-white text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-white/5'
							}`}
							on:click={() => (showRegions = !showRegions)}
						>
							<Target size={11} class="shrink-0" />
							<span class="hidden sm:inline">Regions</span>
							<span
								class={`rounded px-1 py-0.2 text-[8.5px] sm:text-[9px] font-bold uppercase ${
									showRegions ? 'bg-black/25 dark:bg-black/15 text-white dark:text-black' : 'bg-black/10 dark:bg-white/10'
								}`}
							>
								{showRegions ? 'On' : 'Off'}
							</span>
						</button>
					</div>
				</div>

				<!-- SCROLLABLE IMAGE CONTAINER -->
				<div
					bind:this={imageScrollContainer}
					class="relative flex-1 min-h-0 overflow-y-auto rounded-xl border border-black/10 bg-neutral-950/[0.03] dark:border-white/10 dark:bg-neutral-950/40 overscroll-contain"
				>
					<div class="relative w-full">
						<img
							src={`/api/pages/${page.id}/file?kind=${inspectTab}&v=${reloadKey}`}
							alt={`Page ${page.seq + 1} ${inspectTab}`}
							class="block w-full h-auto select-none"
							loading="eager"
							decoding="async"
						/>
						{#if pw && ph}
							<svg
								class="pointer-events-none absolute inset-0 h-full w-full"
								viewBox="0 0 {pw} {ph}"
								preserveAspectRatio="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								{#each page.regions || [] as region (region.id)}
									{@const active = hoveredRegionId === region.id || editingRegion?.id === region.id}
									{#if showRegions || active}
										{@const b = getBox(region.box)}
										{@const poly = getPolygon(region.polygon)}
										{@const kind = getRegionKind(region)}
										{@const bx = b?.x ?? 0}
										{@const by = b?.y ?? 0}
										{@const bw = b?.w ?? 0}
										{@const bh = b?.h ?? 0}
										{@const angle = getRegionAngle(region)}
										{@const stroke = kind === 'sound_effect' ? '#f59e0b' : '#b23a2e'}

										<!-- 1. FULL TYPESET CANVAS BOX (RED / AMBER) -->
										{#if showTypeset && b}
											<rect
												x={bx}
												y={by}
												width={bw}
												height={bh}
												fill={active ? `${stroke}20` : 'none'}
												stroke={stroke}
												stroke-width={active ? 3 : 1.75}
												rx="3"
												opacity={active ? 1 : 0.65}
											/>
										{/if}

										<!-- 2. TIGHT INPAINT BOUNDARY REGION (BLUE) -->
										{#if showInpaint && poly}
											<polygon
												points={polygonToSvgPoints(poly)}
												fill={active ? '#2563eb35' : '#3b82f618'}
												stroke="#2563eb"
												stroke-width={active ? 3.5 : 2}
												stroke-linejoin="round"
												opacity={active ? 1 : 0.85}
											/>
										{/if}

										<text
											x={bx + 6}
											y={by + 18}
											font-size="16"
											font-weight="bold"
											fill={stroke}
											stroke="#000"
											stroke-width="3.5"
											paint-order="stroke"
										>#{region.seq + 1}</text>
										{#if angle !== null && Math.abs(angle) >= 0.5}
											<text
												x={bx + 6}
												y={by + 34}
												font-size="12"
												font-weight="bold"
												fill="#f59e0b"
												stroke="#000"
												stroke-width="3"
												paint-order="stroke"
											>∠{angle > 0 ? `+${angle}°` : `${angle}°`}</text>
										{/if}
									{/if}
								{/each}
							</svg>
						{:else if showRegions}
							<div class="absolute inset-x-0 bottom-3 flex justify-center">
								<span class="rounded-lg bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
									Run the pipeline first to see bounding boxes
								</span>
							</div>
						{/if}
					</div>
				</div>

				{#if pw && ph}
					<div class="flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10px] font-mono">
						<div class="flex flex-wrap items-center gap-2 sm:gap-3">
							<span class="opacity-60">{pw} × {ph} px · {page.regions?.length ?? 0} regions</span>

							<!-- INTERACTIVE LAYER TOGGLE CHIPS -->
							<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg">
								<!-- TYPESET BOX TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer ${
										showTypeset
											? 'bg-[#b23a2e]/15 border border-[#b23a2e]/30 text-[#b23a2e] dark:text-[#e08a63] font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Typeset Canvas Bounding Boxes (Red)"
									on:click={() => (showTypeset = !showTypeset)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-[#b23a2e] ${showTypeset ? 'bg-[#b23a2e]' : 'bg-transparent'}`}></span>
									<span>Typeset</span>
								</button>

								<!-- INPAINT REGION TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer ${
										showInpaint
											? 'bg-blue-600/15 border border-blue-600/30 text-blue-700 dark:text-blue-300 font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Inpaint Glyph Boundary Polygons (Blue)"
									on:click={() => (showInpaint = !showInpaint)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-blue-600 ${showInpaint ? 'bg-blue-500' : 'bg-transparent'}`}></span>
									<span>Inpaint</span>
								</button>
							</div>
						</div>
						<span class="capitalize opacity-60 text-[9.5px]">View: {inspectTab === 'output' ? 'Typeset Output' : inspectTab === 'original' ? 'Original RAW' : 'Cleaned Mask'}</span>
					</div>
				{/if}
			</div>

			<!-- 2. DETECTED REGIONS LIST COLUMN -->
			<div class={`flex flex-col gap-2.5 lg:col-span-5 h-full min-h-0 ${mobileSection === 'regions' ? 'flex' : 'hidden lg:flex'}`}>
				<div class="flex items-center justify-between gap-2 shrink-0">
					<h3 class="text-xs sm:text-sm font-bold flex items-center gap-1.5">
						<List size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
						<span>Detected Regions ({page.regions?.length ?? 0})</span>
					</h3>
					{#if loadingDetails}
						<span class="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#b23a2e] dark:text-[#e08a63]">
							<Loader2 size={11} class="animate-spin" />
							<span>Syncing...</span>
						</span>
					{/if}
				</div>

				{#if loadingDetails && (!page.regions || page.regions.length === 0)}
					<!-- SKELETON LOADING STATE -->
					<div class="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
						{#each [1, 2, 3] as _}
							<div class="h-24 animate-pulse rounded-xl bg-black/5 dark:bg-white/5"></div>
						{/each}
					</div>
				{:else if !page.regions || page.regions.length === 0}
					<div class="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-black/15 p-6 text-center text-xs opacity-60 dark:border-white/15">
						<List size={24} class="mb-2 opacity-40" />
						<p>No regions detected on this page yet.</p>
						<p class="mt-1 text-[11px] opacity-75">Process this page in the chapter pipeline to run text detection.</p>
					</div>
				{:else}
					<div class="flex-1 min-h-0 space-y-2.5 overflow-y-auto pr-1 overscroll-contain">
						{#each page.regions as region (region.id)}
							{@const b = getBox(region.box)}
							{@const angle = getRegionAngle(region)}
							{@const isVertical = isRegionVertical(region)}
							{@const isModified = region.originalTarget && region.textTarget && region.textTarget !== region.originalTarget}
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<div
								class={`rounded-xl border p-3 text-xs transition-all cursor-pointer ${
									hoveredRegionId === region.id || editingRegion?.id === region.id
										? 'border-[#b23a2e]/50 bg-[#b23a2e]/5 dark:border-[#e08a63]/40 dark:bg-[#e08a63]/5 shadow-sm'
										: 'border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] hover:border-black/20 dark:hover:border-white/20'
								}`}
								on:mouseenter={() => (hoveredRegionId = region.id)}
								on:mouseleave={() => (hoveredRegionId = null)}
								on:click={() => {
									if (hoveredRegionId === region.id) {
										hoveredRegionId = null;
									} else {
										hoveredRegionId = region.id;
										scrollToRegion(region);
									}
								}}
							>
								<!-- HEADER ROW: sequence badge + kind + confidence + rotation angle + box size -->
								<div class="flex flex-wrap items-center justify-between gap-1.5">
									<div class="flex items-center gap-1.5">
										<span class="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#b23a2e] bg-[#b23a2e]/10 dark:text-[#e08a63]">
											#{region.seq + 1}
										</span>
										{#if isModified}
											<span class="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
												Edited
											</span>
										{:else if !region.textTarget}
											<span class="rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:text-sky-300">
												Preserved Art / SFX
											</span>
										{/if}
										{#if region.conf !== null}
											<span class="text-[10px] font-mono opacity-50">
												{(region.conf * 100).toFixed(0)}% conf
											</span>
										{/if}
									</div>

									<div class="flex items-center gap-1.5 font-mono text-[10px]">
										<!-- ROTATION ANGLE BADGE -->
										{#if angle !== null && Math.abs(angle) >= 0.5}
											<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
												<Compass size={10} />
												<span>{angle > 0 ? `+${angle}°` : `${angle}°`}</span>
											</span>
										{:else if isVertical}
											<span class="inline-flex items-center rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
												Vertical
											</span>
										{:else}
											<span class="text-[9px] opacity-40">
												0° (Horizontal)
											</span>
										{/if}

										{#if b}
											<span class="opacity-50">{b.w}×{b.h}</span>
										{/if}
									</div>
								</div>

								{#if b}
									{@const poly = getPolygon(region.polygon)}
									<div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[9px]">
										<span class="text-[#b23a2e] dark:text-[#e08a63]">
											Typeset: ({b.x}, {b.y}) · {b.w}×{b.h}
										</span>
										{#if poly}
											{@const pxs = poly.map((pt) => pt[0])}
											{@const pys = poly.map((pt) => pt[1])}
											{@const minPx = Math.min(...pxs)}
											{@const maxPx = Math.max(...pxs)}
											{@const minPy = Math.min(...pys)}
											{@const maxPy = Math.max(...pys)}
											<span class="text-blue-600 dark:text-blue-400 font-medium">
												Inpaint: ({minPx}, {minPy}) · {maxPx - minPx}×{maxPy - minPy}
											</span>
										{/if}
									</div>
								{/if}

								<!-- SOURCE OCR -->
								<div class="mt-2">
									<div class="mb-0.5 text-[10px] opacity-50">Source OCR</div>
									<div class="flex items-start gap-1">
										<span class="flex-1 break-words font-mono leading-snug text-[11px]">
											{region.textSource || '—'}
										</span>
										{#if region.textSource}
											<button
												type="button"
												title="Copy source text"
												aria-label="Copy source text"
												class="mt-0.5 flex-shrink-0 rounded p-1 opacity-50 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10 active:scale-95"
												on:click|stopPropagation={() => {
													navigator.clipboard?.writeText(region.textSource);
													toast.success(`Copied OCR text for #${region.seq + 1}`);
												}}
											>
												<Copy size={12} />
											</button>
										{/if}
									</div>
								</div>

								<!-- TRANSLATION OUTPUT ROW WITH EDIT & RESET BUTTONS -->
								{#if region.textTarget}
									<div class="mt-2 border-t border-black/[0.05] pt-1.5 dark:border-white/[0.05]">
										<div class="flex items-center justify-between mb-0.5">
											<span class="text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63]">
												{isModified ? 'Manual Translation' : 'AI Translation'}
											</span>

											<div class="flex items-center gap-1">
												{#if isModified}
													<button
														type="button"
														title="Reset to default AI translation"
														aria-label="Reset to default AI translation"
														class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600 hover:text-neutral-900 bg-black/5 hover:bg-black/10 dark:text-neutral-400 dark:hover:text-neutral-100 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
														on:click|stopPropagation={() => handleQuickResetRegion(region)}
													>
														<RotateCcw size={10} />
														<span>Reset AI</span>
													</button>
												{/if}

												<button
													type="button"
													title="Edit translation & AI re-roll"
													aria-label="Edit translation & AI re-roll"
													class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold text-[#b23a2e] hover:bg-[#b23a2e]/10 dark:text-[#e08a63] dark:hover:bg-[#e08a63]/10 transition-colors"
													on:click|stopPropagation={() => openEdit(region)}
												>
													<Pencil size={10} />
													<span>Edit</span>
												</button>

												<button
													type="button"
													title="Copy translation"
													aria-label="Copy translation"
													class="rounded p-1 opacity-50 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10 active:scale-95"
													on:click|stopPropagation={() => {
														navigator.clipboard?.writeText(region.textTarget ?? '');
														toast.success(`Copied translation for #${region.seq + 1}`);
													}}
												>
													<Copy size={11} />
												</button>
											</div>
										</div>

										<div class="break-words leading-snug text-[11px]">
											{region.textTarget}
										</div>
									</div>
								{:else}
									<div class="mt-2.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 dark:border-sky-500/15 dark:bg-sky-500/5">
										<div class="flex items-center gap-1.5 min-w-0">
											<span class="rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:text-sky-300 shrink-0">
												Preserved Art / SFX
											</span>
											<span class="text-[10.5px] font-semibold text-sky-800 dark:text-sky-200 truncate">
												Protected Original Artwork
											</span>
										</div>
										<p class="mt-1 text-[10px] text-neutral-600 dark:text-neutral-300 leading-normal">
											Bypassed by inpainting and typesetting to preserve original artist lettering, graphics, and background.
										</p>
									</div>
								{/if}

								<!-- MOBILE FOCUS IN CANVAS ACTION -->
								<div class="mt-2 pt-1.5 flex lg:hidden items-center justify-end border-t border-black/[0.04] dark:border-white/[0.04]">
									<button
										type="button"
										class="inline-flex items-center gap-1 text-[10px] font-semibold text-[#b23a2e] dark:text-[#e08a63] hover:underline"
										on:click|stopPropagation={() => selectRegionOnMobile(region)}
									>
										<Target size={11} />
										<span>Locate on Page Canvas</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<div class="flex items-center justify-between w-full gap-2">
			{#if page}
				<div class="flex items-center gap-2">
					<Button variant="secondary" size="sm" on:click={copyInspectDebugInfo}>
						<Copy size={13} class="mr-1 sm:mr-1.5" />
						<span>Copy Debug Data</span>
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={retypesetting || !page.cleanedPath}
						title={page.cleanedPath ? 'Re-render page typesetting with current settings' : 'Cleaned mask not available'}
						on:click={handleRetypesetPage}
					>
						{#if retypesetting}
							<Loader2 size={13} class="mr-1 sm:mr-1.5 animate-spin text-[#b23a2e] dark:text-[#e08a63]" />
							<span>Typesetting...</span>
						{:else}
							<RotateCcw size={13} class="mr-1 sm:mr-1.5" />
							<span>Refresh Typesetting</span>
						{/if}
					</Button>
				</div>
			{:else}
				<div></div>
			{/if}
			<Button variant="primary" size="sm" on:click={() => dispatch('close')}>Close</Button>
		</div>
	</svelte:fragment>
</Modal>

<!-- DEDICATED EDIT REGION TRANSLATION & AI RE-ROLL MODAL -->
{#if page}
	<EditRegionTranslationModal
		bind:open={editModalOpen}
		pageId={page.id}
		region={editingRegion}
		on:saved={handleRegionSaved}
		on:close={() => {
			editModalOpen = false;
		}}
	/>
{/if}
