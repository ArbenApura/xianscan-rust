<script lang="ts">
	// IMPORTED DEP-MODULES
	import { createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import { cn } from '$lib/utils/cn';

	// IMPORTED DEP-COMPONENTS
	import Copy from 'lucide-svelte/icons/copy';
	import Target from 'lucide-svelte/icons/target';
	import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
	import Compass from 'lucide-svelte/icons/compass';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import Layers from 'lucide-svelte/icons/layers';
	import List from 'lucide-svelte/icons/list';
	import ImageIcon from 'lucide-svelte/icons/image';
	import Pencil from 'lucide-svelte/icons/pencil';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Terminal from 'lucide-svelte/icons/terminal';
	import ZoomIn from 'lucide-svelte/icons/zoom-in';
	import ZoomOut from 'lucide-svelte/icons/zoom-out';
	import Maximize2 from 'lucide-svelte/icons/maximize-2';
	import Scan from 'lucide-svelte/icons/scan';

	// IMPORTED COMPONENTS
	import { Modal, Button } from '$lib/components/ui';
	import EditRegionTranslationModal from './EditRegionTranslationModal.svelte';
	import PageLlmPromptModal from './PageLlmPromptModal.svelte';
	import PageOcrStatsModal from './PageOcrStatsModal.svelte';

	// -- REQUIRED PROPS -- //

	// -- OPTIONAL PROPS -- //
	export let open = false;
	export let page: any | null = null;
	export let reloadKey = Date.now();
	export let initialTab: 'output' | 'cleaned' | 'original' | null = null;

	// -- CONSTANTS -- //
	const INSPECT_LAYERS_STORAGE_KEY = 'xianscan:inspect_layer_toggles';

	const dispatch = createEventDispatcher<{
		close: void;
		update: { page: any; region?: any; reloadKey: number };
	}>();

	// -- STATES -- //
	let inspectTab: 'output' | 'cleaned' | 'original' = 'output';
	let mobileSection: 'image' | 'regions' = 'image';
	let showRegions = true;
	let showBubbles = true;
	let showBubbleText = true;
	let showFreeText = true;
	let showOnomatopoeia = true;
	let showBaseTier = true;
	let showInpaintTier = true;
	let showTypesetTier = true;
	let hoveredRegionId: number | null = null;
	let hiddenRegionIds: Record<string, boolean> = {};
	// PAN-ZOOM VIEWPORT STATE
	let imageScrollContainer: HTMLDivElement | null = null;
	let zoom = 1;
	let panX = 0;
	let panY = 0;
	let isPanning = false;
	let isTransitioning = false;
	let startPointerX = 0;
	let startPointerY = 0;
	let startPanX = 0;
	let startPanY = 0;
	let activePointers: Map<number, { x: number; y: number }> = new Map();
	let initialPinchDistance = 0;
	let initialPinchZoom = 1;

	function loadPersistedToggles() {
		if (typeof window === 'undefined' || !window.localStorage) return;
		try {
			const raw = localStorage.getItem(INSPECT_LAYERS_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (typeof parsed.showRegions === 'boolean') showRegions = parsed.showRegions;
				if (typeof parsed.showBubbles === 'boolean') showBubbles = parsed.showBubbles;
				if (typeof parsed.showBubbleText === 'boolean') showBubbleText = parsed.showBubbleText;
				if (typeof parsed.showFreeText === 'boolean') showFreeText = parsed.showFreeText;
				if (typeof parsed.showOnomatopoeia === 'boolean') showOnomatopoeia = parsed.showOnomatopoeia;
				if (typeof parsed.showBaseTier === 'boolean') showBaseTier = parsed.showBaseTier;
				if (typeof parsed.showInpaintTier === 'boolean') showInpaintTier = parsed.showInpaintTier;
				if (typeof parsed.showTypesetTier === 'boolean') showTypesetTier = parsed.showTypesetTier;
			}
		} catch {}
	}

	function savePersistedToggles() {
		if (typeof window === 'undefined' || !window.localStorage) return;
		try {
			localStorage.setItem(
				INSPECT_LAYERS_STORAGE_KEY,
				JSON.stringify({
					showRegions,
					showBubbles,
					showBubbleText,
					showFreeText,
					showOnomatopoeia,
					showBaseTier,
					showInpaintTier,
					showTypesetTier,
				}),
			);
		} catch {}
	}

	// LOAD INITIAL PERSISTED TOGGLES AT MOUNT
	loadPersistedToggles();

	function toggleRegionAnnotation(regionId: string) {
		hiddenRegionIds[regionId] = !hiddenRegionIds[regionId];
		hiddenRegionIds = { ...hiddenRegionIds };
	}

	// REGION TRANSLATION EDITOR STATE
	let editingRegion: any | null = null;
	let editModalOpen = false;
	let llmPromptModalOpen = false;
	let ocrStatsModalOpen = false;
	let loadingDetails = false;
	let lastFetchedKey: string | null = null;
	let lastInspectedPageId: number | null = null;
	let lastOpenedState = false;

	// PERSIST LAYER TOGGLES ON USER INTERACTION
	$: if (typeof window !== 'undefined' && open) {
		const _ = [showRegions, showBubbles, showBubbleText, showFreeText, showOnomatopoeia, showBaseTier, showInpaintTier, showTypesetTier];
		savePersistedToggles();
	}

	// INITIALIZE TAB ONCE PER INSPECTED PAGE OPEN (RESPECTS EXPLICIT initialTab PROP)
	$: if (open && page?.id) {
		if (!lastOpenedState || lastInspectedPageId !== page.id) {
			if (!lastOpenedState) {
				loadPersistedToggles();
			}
			lastOpenedState = true;
			lastInspectedPageId = page.id;
			if (initialTab) {
				inspectTab = initialTab;
			} else if (page.outputPath) {
				inspectTab = 'output';
			} else if (page.cleanedPath) {
				inspectTab = 'cleaned';
			} else {
				inspectTab = 'original';
			}
		}
	} else if (!open) {
		lastOpenedState = false;
		lastInspectedPageId = null;
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

	function getSquirlyPolygonPath(poly: [number, number][]): string {
		if (!poly || poly.length < 3) return '';
		let path = `M ${poly[0][0]} ${poly[0][1]}`;
		const targetSegmentLen = 5.5; // ULTRA-TIGHT HIGH-FREQUENCY RIPPLE
		const waveAmp = 2.5; // COMPACT AMPLITUDE CLOSE TO STRAIGHT EDGE

		for (let i = 0; i < poly.length; i++) {
			const p0 = poly[i];
			const p1 = poly[(i + 1) % poly.length];
			const dx = p1[0] - p0[0];
			const dy = p1[1] - p0[1];
			const len = Math.hypot(dx, dy);
			if (len < 6) {
				path += ` L ${p1[0]} ${p1[1]}`;
				continue;
			}
			const nx = -dy / len;
			const ny = dx / len;
			const numWaves = Math.max(3, Math.round(len / targetSegmentLen));
			const stepX = dx / numWaves;
			const stepY = dy / numWaves;

			for (let j = 0; j < numWaves; j++) {
				const segStartX = p0[0] + j * stepX;
				const segStartY = p0[1] + j * stepY;
				const segEndX = p0[0] + (j + 1) * stepX;
				const segEndY = p0[1] + (j + 1) * stepY;
				const side = j % 2 === 0 ? 1 : -1;
				const midX = (segStartX + segEndX) / 2 + nx * waveAmp * side;
				const midY = (segStartY + segEndY) / 2 + ny * waveAmp * side;
				path += ` Q ${midX} ${midY}, ${segEndX} ${segEndY}`;
			}
		}
		return path + ' Z';
	}

	function getSquirlyBubblePath(bb: { x: number; y: number; w: number; h: number }): string {
		const { x, y, w, h } = bb;
		const r = Math.min(8, Math.min(w, h) * 0.1);
		const waveAmp = 2.8; // INTENSE MICRO-WAVE (ALMOST STRAIGHT WITH CONSTANT SINE WRIGGLE)
		const targetSegmentLen = 5.5; // DENSE PACKED WAVE REPETITIONS

		// GENERATE WAVY SINE-LIKE BUMP SEGMENTS ALONG A LINE
		function generateWavyEdge(
			x0: number,
			y0: number,
			x1: number,
			y1: number,
			nx: number,
			ny: number,
		): string {
			const dx = x1 - x0;
			const dy = y1 - y0;
			const len = Math.hypot(dx, dy);
			if (len < 6) return `L ${x1} ${y1}`;

			const numWaves = Math.max(3, Math.round(len / targetSegmentLen));
			const stepX = dx / numWaves;
			const stepY = dy / numWaves;
			let path = '';

			for (let i = 0; i < numWaves; i++) {
				const segStartX = x0 + i * stepX;
				const segStartY = y0 + i * stepY;
				const segEndX = x0 + (i + 1) * stepX;
				const segEndY = y0 + (i + 1) * stepY;

				// HIGH-DENSITY ALTERNATING SINE WRIGGLE
				const side = i % 2 === 0 ? 1 : -1;
				const midX = (segStartX + segEndX) / 2 + nx * waveAmp * side;
				const midY = (segStartY + segEndY) / 2 + ny * waveAmp * side;

				// QUADRATIC BÉZIER WAVE BUMP
				path += ` Q ${midX} ${midY}, ${segEndX} ${segEndY}`;
			}
			return path;
		}

		// ASSEMBLE 4 WAVY EDGES WITH SMOOTH CORNERS
		return [
			`M ${x + r} ${y}`,
			generateWavyEdge(x + r, y, x + w - r, y, 0, -1),
			`Q ${x + w} ${y}, ${x + w} ${y + r}`,
			generateWavyEdge(x + w, y + r, x + w, y + h - r, 1, 0),
			`Q ${x + w} ${y + h}, ${x + w - r} ${y + h}`,
			generateWavyEdge(x + w - r, y + h, x + r, y + h, 0, 1),
			`Q ${x} ${y + h}, ${x} ${y + h - r}`,
			generateWavyEdge(x, y + h - r, x, y + r, -1, 0),
			`Q ${x} ${y}, ${x + r} ${y}`,
			'Z',
		].join(' ');
	}

	function getPanels(p: any): any[] {
		if (!p) return [];
		if (Array.isArray(p.panels)) return p.panels;
		if (p.metadata) {
			try {
				const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
				if (Array.isArray(meta?.panels)) return meta.panels;
			} catch {}
		}
		return [];
	}

	function getOnomatopoeia(p: any): any[] {
		if (!p) return [];
		if (Array.isArray(p.onomatopoeia)) return p.onomatopoeia;
		if (p.metadata) {
			try {
				const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
				if (Array.isArray(meta?.onomatopoeia)) return meta.onomatopoeia;
			} catch {}
		}
		return [];
	}

	function getBubbleBox(region: any): { x: number; y: number; w: number; h: number } | null {
		if (!region) return null;
		if (region.bubble_box) return getBox(region.bubble_box);
		const b = getBox(region.box);
		if (b && (b as any).bubble_box) return getBox((b as any).bubble_box);
		return null;
	}

	function getInpaintBox(region: any): { x: number; y: number; w: number; h: number } | null {
		if (!region) return null;
		if (region.inpaintBox) return getBox(region.inpaintBox);
		if (region.inpaint_box) return getBox(region.inpaint_box);
		const b = getBox(region.box);
		if (b && (b as any).inpaint_box) return getBox((b as any).inpaint_box);
		return null;
	}

	function getTypesetBox(region: any): { x: number; y: number; w: number; h: number } | null {
		if (!region) return null;
		if (region.typesetBox) return getBox(region.typesetBox);
		if (region.typeset_box) return getBox(region.typeset_box);
		const b = getBox(region.box);
		if (b && (b as any).typeset_box) return getBox((b as any).typeset_box);
		return null;
	}

	function getBubblePolygon(region: any): [number, number][] | null {
		if (!region) return null;
		if (region.bubble_polygon) return getPolygon(region.bubble_polygon);
		const b = getBox(region.box);
		if (b && (b as any).bubble_polygon) return getPolygon((b as any).bubble_polygon);
		return null;
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

	function resetZoom(smooth = true) {
		if (smooth) {
			isTransitioning = true;
			setTimeout(() => {
				isTransitioning = false;
			}, 200);
		}
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	function fitToWidth(smooth = true) {
		const pw = page?.width;
		if (!imageScrollContainer || !pw) return;
		const containerW = imageScrollContainer.clientWidth;
		if (containerW <= 0) return;
		const targetZoom = Math.max(0.1, Math.min(5.0, containerW / pw));
		if (smooth) {
			isTransitioning = true;
			setTimeout(() => {
				isTransitioning = false;
			}, 200);
		}
		zoom = targetZoom;
		panX = (containerW - pw * targetZoom) / 2;
		panY = 0;
	}

	function fitToPage(smooth = true) {
		const pw = page?.width;
		const ph = page?.height;
		if (!imageScrollContainer || !pw || !ph) return;
		const containerW = imageScrollContainer.clientWidth;
		const containerH = imageScrollContainer.clientHeight;
		if (containerW <= 0 || containerH <= 0) return;
		const scaleW = containerW / pw;
		const scaleH = containerH / ph;
		const targetZoom = Math.max(0.1, Math.min(5.0, Math.min(scaleW, scaleH)));
		if (smooth) {
			isTransitioning = true;
			setTimeout(() => {
				isTransitioning = false;
			}, 200);
		}
		zoom = targetZoom;
		panX = (containerW - pw * targetZoom) / 2;
		panY = (containerH - ph * targetZoom) / 2;
	}

	function zoomIn() {
		applyZoomDelta(0.25);
	}

	function zoomOut() {
		applyZoomDelta(-0.25);
	}

	function applyZoomDelta(delta: number) {
		if (!imageScrollContainer) return;
		const rect = imageScrollContainer.getBoundingClientRect();
		zoomAt(rect.width / 2, rect.height / 2, zoom + delta, true);
	}

	function zoomAt(clientXRel: number, clientYRel: number, nextZoom: number, smooth = false) {
		const clampedZoom = Math.max(0.25, Math.min(5.0, nextZoom));
		if (Math.abs(clampedZoom - zoom) < 0.001) return;

		const imageX = (clientXRel - panX) / zoom;
		const imageY = (clientYRel - panY) / zoom;

		if (smooth) {
			isTransitioning = true;
			setTimeout(() => {
				isTransitioning = false;
			}, 200);
		}
		zoom = clampedZoom;
		panX = clientXRel - imageX * clampedZoom;
		panY = clientYRel - imageY * clampedZoom;
	}

	function focusRegion(region: any) {
		const b = getBox(region.box);
		if (!b || !imageScrollContainer) return;
		const containerW = imageScrollContainer.clientWidth;
		const containerH = imageScrollContainer.clientHeight;
		if (containerW <= 0 || containerH <= 0) return;

		const targetZoom = Math.max(zoom, 1.5);
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;

		isTransitioning = true;
		setTimeout(() => {
			isTransitioning = false;
		}, 250);

		zoom = targetZoom;
		panX = containerW / 2 - cx * targetZoom;
		panY = containerH / 2 - cy * targetZoom;
	}

	function scrollToRegion(region: any) {
		focusRegion(region);
	}

	function handleWheel(e: WheelEvent) {
		if (!imageScrollContainer) return;
		e.preventDefault();
		const rect = imageScrollContainer.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		if (e.ctrlKey || e.metaKey) {
			// TRACKPAD PINCH OR CTRL + WHEEL
			const factor = Math.exp(-e.deltaY * 0.01);
			zoomAt(mouseX, mouseY, zoom * factor);
		} else {
			// CONVENTIONAL MOUSE WHEEL ZOOM CENTERED AT POINTER
			const delta = -Math.sign(e.deltaY) * 0.15;
			zoomAt(mouseX, mouseY, zoom * (1 + delta));
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
		imageScrollContainer?.setPointerCapture(e.pointerId);
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (activePointers.size === 1) {
			isPanning = true;
			startPointerX = e.clientX;
			startPointerY = e.clientY;
			startPanX = panX;
			startPanY = panY;
		} else if (activePointers.size === 2) {
			isPanning = false;
			const pts = Array.from(activePointers.values());
			initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			initialPinchZoom = zoom;
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (activePointers.size === 1 && isPanning) {
			const dx = e.clientX - startPointerX;
			const dy = e.clientY - startPointerY;
			panX = startPanX + dx;
			panY = startPanY + dy;
		} else if (activePointers.size === 2 && imageScrollContainer) {
			const pts = Array.from(activePointers.values());
			const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			if (initialPinchDistance > 0) {
				const rect = imageScrollContainer.getBoundingClientRect();
				const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
				const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
				const scaleFactor = currentDist / initialPinchDistance;
				zoomAt(midX, midY, initialPinchZoom * scaleFactor);
			}
		}
	}

	function handlePointerUp(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		if (activePointers.size === 0) {
			isPanning = false;
		}
	}

	function handleDoubleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
		if (!imageScrollContainer) return;
		const rect = imageScrollContainer.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		if (Math.abs(zoom - 1) < 0.05) {
			zoomAt(mouseX, mouseY, 2.0, true);
		} else {
			fitToPage(true);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if ((e.target as HTMLElement).closest('input, textarea, select')) return;
		if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			zoomIn();
		} else if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			zoomOut();
		} else if (e.key === '0') {
			e.preventDefault();
			if (!imageScrollContainer) return;
			const rect = imageScrollContainer.getBoundingClientRect();
			zoomAt(rect.width / 2, rect.height / 2, 1.0, true);
		} else if (e.key.toLowerCase() === 'w') {
			e.preventDefault();
			fitToWidth(true);
		} else if (e.key.toLowerCase() === 'f') {
			e.preventDefault();
			fitToPage(true);
		} else if (e.key.toLowerCase() === 'r') {
			e.preventDefault();
			fitToPage(true);
		}
	}

	// AUTO-FIT PAGE INTO VIEWPORT ON INSPECTION
	$: if (open && page?.id && imageScrollContainer) {
		setTimeout(() => {
			fitToPage(false);
		}, 60);
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

	function handleRegionSaved(e: CustomEvent<{ region: any; outputPath?: string; outputRev?: number }>) {
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
		if (typeof e.detail.outputRev === 'number') {
			page.outputRev = e.detail.outputRev;
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
			if (typeof data.outputRev === 'number') {
				page.outputRev = data.outputRev;
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
			if (typeof data.outputRev === 'number') {
				page.outputRev = data.outputRev;
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
		const panels = getPanels(page);
		const onomatopoeia = getOnomatopoeia(page);
		const debug = {
			pageId: page.id,
			seq: page.seq,
			dimensions: { width: page.width, height: page.height },
			status: page.status,
			error: page.error,
			panelsCount: panels.length,
			panels,
			onomatopoeiaCount: onomatopoeia.length,
			onomatopoeia,
			regionsCount: page.regions?.length ?? 0,
			regions: (page.regions || []).map((r: any) => ({
				id: r.id,
				seq: r.seq,
				kind: getRegionKind(r),
				confidence: r.conf,
				angle: getRegionAngle(r),
				vertical: isRegionVertical(r),
				typesetBox: getBox(r.box),
				bubbleBox: getBubbleBox(r),
				bubblePolygon: getBubblePolygon(r),
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

<svelte:window on:keydown={handleKeydown} />

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

				<!-- INTERACTIVE PAN-ZOOM IMAGE VIEWPORT -->
				<div
					bind:this={imageScrollContainer}
					class="relative flex-1 min-h-[360px] sm:min-h-[440px] md:min-h-[480px] overflow-hidden rounded-xl border border-black/10 bg-neutral-950/[0.03] dark:border-white/10 dark:bg-neutral-950/40 select-none touch-none cursor-grab active:cursor-grabbing"
					on:wheel={handleWheel}
					on:pointerdown={handlePointerDown}
					on:pointermove={handlePointerMove}
					on:pointerup={handlePointerUp}
					on:pointercancel={handlePointerUp}
					on:dblclick={handleDoubleClick}
				>
					<div
						class="absolute top-0 left-0 origin-top-left will-change-transform {isTransitioning ? 'transition-transform duration-200 ease-out' : ''}"
						style="transform: translate3d({panX}px, {panY}px, 0) scale({zoom}); width: {pw}px; height: {ph}px;"
					>
						<img
							src={`/api/pages/${page.id}/file?kind=${inspectTab}&rev=${inspectTab === 'output' ? page.outputRev ?? 0 : inspectTab === 'cleaned' ? page.cleanedRev ?? 0 : page.originalRev ?? 0}&v=${reloadKey}`}
							alt={`Page ${page.seq + 1} ${inspectTab}`}
							class="block w-full h-full select-none pointer-events-none"
							draggable="false"
							loading="eager"
							decoding="async"
						/>
						{#if pw && ph && showRegions}
							<svg
								class="pointer-events-none absolute inset-0 h-full w-full"
								viewBox="0 0 {pw} {ph}"
								preserveAspectRatio="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<!-- 1. SPEECH & THOUGHT BUBBLE CONTAINERS (CYAN SQUIRLY CONTOUR) -->
								{#if showBubbles}
									{#each page.regions || [] as region (region.id)}
										{@const bb = getBubbleBox(region)}
										{@const bpoly = getBubblePolygon(region)}
										{#if bpoly}
											<path
												d={getSquirlyPolygonPath(bpoly)}
												fill="rgba(6, 182, 212, 0.08)"
												stroke="#06b6d4"
												stroke-width="2.2"
												stroke-linejoin="round"
												opacity="0.9"
											/>
										{:else if bb}
											<path
												d={getSquirlyBubblePath(bb)}
												fill="rgba(6, 182, 212, 0.08)"
												stroke="#06b6d4"
												stroke-width="2.2"
												stroke-linejoin="round"
												opacity="0.9"
											/>
										{/if}
									{/each}
								{/if}

								<!-- 2b. STRUCTURAL ONOMATOPOEIA / SFX DETECTIONS (AMBER) -->
								{#if showOnomatopoeia}
									{#each getOnomatopoeia(page) as sfx, idx (sfx.id || idx)}
										{@const sb = getBox(sfx.box || sfx)}
										{#if sb}
											<rect
												x={sb.x}
												y={sb.y}
												width={sb.w}
												height={sb.h}
												fill="rgba(245, 158, 11, 0.08)"
												stroke="#f59e0b"
												stroke-width="2.2"
												stroke-dasharray="4 3"
												rx="3"
											/>
											<text
												x={sb.x + 6}
												y={sb.y + 16}
												font-size="11"
												font-weight="bold"
												fill="#f59e0b"
												stroke="#000"
												stroke-width="2.5"
												paint-order="stroke"
											>SFX {sfx.seq !== undefined ? sfx.seq + 1 : idx + 1}</text>
										{/if}
									{/each}
								{/if}

								<!-- 3. DETECTED TEXT REGIONS OVERLAYS (THREE-TIER REGION GEOMETRY) -->
								{#each page.regions || [] as region (region.id)}
									{@const active = hoveredRegionId === region.id || editingRegion?.id === region.id}
									{@const isHidden = !!hiddenRegionIds[region.id]}
									{@const b = getBox(region.box)}
									{@const inpaintB = getInpaintBox(region)}
									{@const typesetB = getTypesetBox(region)}
									{@const kind = getRegionKind(region)}
									{@const isVisible =
										!isHidden &&
										(active ||
										(kind === 'dialogue_bubble' && showBubbleText) ||
										(kind === 'free_text' && showFreeText) ||
										(kind === 'sound_effect' && showOnomatopoeia))}
									{#if isVisible && b}
										{@const bx = b.x}
										{@const by = b.y}
										{@const bw = b.w}
										{@const bh = b.h}
										{@const angle = getRegionAngle(region)}
										<!-- COLOR PALETTE: BASE / INPAINT / TYPESET -->
										{@const stroke = kind === 'sound_effect' ? '#f59e0b' : kind === 'free_text' ? '#8b5cf6' : '#b23a2e'}
										{@const lightStroke = kind === 'sound_effect' ? '#fbbf24' : kind === 'free_text' ? '#c084fc' : '#f87171'}
										{@const darkStroke = kind === 'sound_effect' ? '#b45309' : kind === 'free_text' ? '#5b21b6' : '#7f1d1d'}
										{@const inpaintFill = kind === 'sound_effect' ? 'rgba(245, 158, 11, 0.10)' : kind === 'free_text' ? 'rgba(139, 92, 246, 0.10)' : 'rgba(178, 58, 46, 0.10)'}
										{@const typesetFill = kind === 'sound_effect' ? 'rgba(180, 83, 9, 0.22)' : kind === 'free_text' ? 'rgba(91, 33, 182, 0.22)' : 'rgba(127, 29, 29, 0.22)'}

										<!-- TIER 3: TYPESETTING LAYOUT BOX (SOLID BOLD OUTLINE + OPAQUE RICH FILL) -->
										{#if (showTypesetTier || active) && typesetB && (typesetB.w !== bw || typesetB.h !== bh)}
											<rect
												x={typesetB.x}
												y={typesetB.y}
												width={typesetB.w}
												height={typesetB.h}
												fill={active ? `${darkStroke}35` : typesetFill}
												stroke={darkStroke}
												stroke-width={active ? 2.8 : 2.0}
												rx="5"
												opacity={active ? 1 : 0.9}
											/>
										{:else if (showTypesetTier || active) && !showBaseTier}
											<!-- RETAIN TYPESET BOX WHEN BASE IS HIDDEN EVEN WITHOUT EXPANSION -->
											<rect
												x={bx}
												y={by}
												width={bw}
												height={bh}
												fill={active ? `${darkStroke}35` : typesetFill}
												stroke={darkStroke}
												stroke-width={active ? 2.8 : 2.0}
												rx="5"
												opacity={active ? 1 : 0.9}
											/>
										{/if}

										<!-- TIER 2: INPAINT MASK BOUNDARY (BLACK DASHED OUTLINE + LIGHT TINT) -->
										{#if (showInpaintTier || active) && inpaintB && (inpaintB.w !== bw || inpaintB.h !== bh)}
											<rect
												x={inpaintB.x}
												y={inpaintB.y}
												width={inpaintB.w}
												height={inpaintB.h}
												fill={active ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)'}
												stroke="#000000"
												stroke-width={active ? 2.4 : 1.6}
												stroke-dasharray="3.5 2"
												rx="4"
												opacity={active ? 1 : 0.85}
												filter="drop-shadow(0 0 1px rgba(255,255,255,0.8))"
											/>
										{/if}

										<!-- TIER 1: BASE TEXT ANCHOR (0% PADDING, WHITE DOTTED OUTLINE + TRANSPARENT FILL) -->
										{#if showBaseTier || active}
											<rect
												x={bx}
												y={by}
												width={bw}
												height={bh}
												fill="transparent"
												stroke="#ffffff"
												stroke-width={active ? 2.2 : 1.4}
												stroke-dasharray="2.5 2"
												rx="3"
												opacity={active ? 1 : 0.9}
												filter="drop-shadow(0 0 1px rgba(0,0,0,0.8))"
											/>
										{/if}
										<!-- REGION SEQUENCE BADGE -->
										<rect
											x={bx}
											y={by - 18 < 0 ? by : by - 18}
											width={28 + (region.seq >= 9 ? 8 : 0)}
											height="18"
											fill={stroke}
											rx="3"
											opacity="0.9"
										/>
										<text
											x={bx + 4}
											y={(by - 18 < 0 ? by : by - 18) + 13}
											font-size="12"
											font-weight="bold"
											fill="#ffffff"
											font-family="monospace"
										>#{region.seq + 1}</text>

										{#if angle !== null && Math.abs(angle) >= 0.5}
											<text
												x={bx + (28 + (region.seq >= 9 ? 8 : 0)) + 4}
												y={(by - 18 < 0 ? by : by - 18) + 13}
												font-size="11"
												font-weight="bold"
												fill="#f59e0b"
												stroke="#000"
												stroke-width="2.5"
												paint-order="stroke"
											>∠{angle > 0 ? `+${angle}°` : `${angle}°`}</text>
										{/if}
									{/if}
								{/each}
							</svg>
						{:else if showRegions}
							<div class="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
								<span class="rounded-lg bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
									Run the pipeline first to see bounding boxes
								</span>
							</div>
						{/if}
					</div>

					<!-- FLOATING HUD PAN-ZOOM CONTROLS -->
					<div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md p-1 shadow-lg text-neutral-700 dark:text-neutral-200">
						<!-- ZOOM OUT BUTTON -->
						<button
							type="button"
							class="inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 cursor-pointer"
							title="Zoom Out (-)"
							disabled={zoom <= 0.25}
							on:click={zoomOut}
							use:ripple
						>
							<ZoomOut size={13} />
						</button>

						<!-- ZOOM PERCENTAGE BADGE / 100% TOGGLE -->
						<button
							type="button"
							class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
							title="Reset to 100% (1:1)"
							on:click={() => {
								if (!imageScrollContainer) return;
								const rect = imageScrollContainer.getBoundingClientRect();
								zoomAt(rect.width / 2, rect.height / 2, 1.0, true);
							}}
							use:ripple
						>
							{Math.round(zoom * 100)}%
						</button>

						<!-- ZOOM IN BUTTON -->
						<button
							type="button"
							class="inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 cursor-pointer"
							title="Zoom In (+)"
							disabled={zoom >= 5.0}
							on:click={zoomIn}
							use:ripple
						>
							<ZoomIn size={13} />
						</button>

						<div class="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5"></div>

						<!-- FIT WIDTH BUTTON -->
						<button
							type="button"
							class="inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
							title="Fit to Width (W)"
							on:click={() => fitToWidth(true)}
							use:ripple
						>
							<Maximize2 size={13} />
						</button>

						<!-- FIT PAGE BUTTON -->
						<button
							type="button"
							class="inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
							title="Fit Page (F)"
							on:click={() => fitToPage(true)}
							use:ripple
						>
							<Scan size={13} />
						</button>

						<!-- RESET VIEW BUTTON -->
						<button
							type="button"
							class="inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
							title="Reset View (R)"
							on:click={() => fitToPage(true)}
							use:ripple
						>
							<RotateCcw size={13} />
						</button>
					</div>
				</div>

				{#if pw && ph}
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 text-[10px] font-mono">
						<!-- INTERACTIVE LAYER TOGGLE CHIPS -->
						<div class="flex items-center justify-start min-w-0">
							<div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg overflow-x-auto max-w-full scrollbar-none h-8 sm:h-[38px] w-full sm:w-auto">
								<!-- BUBBLE CONTAINER TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-2 h-full rounded text-[10.5px] sm:text-xs transition-all cursor-pointer shrink-0 ${
										showBubbles
											? 'bg-cyan-600/15 border border-cyan-600/30 text-cyan-700 dark:text-cyan-300 font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Speech/Thought Bubble Container Outlines (Cyan)"
									on:click={() => (showBubbles = !showBubbles)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-cyan-600 ${showBubbles ? 'bg-cyan-500' : 'bg-transparent'}`}></span>
									<span>Bubble</span>
								</button>

								<!-- BUBBLE TEXT TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-2 h-full rounded text-[10.5px] sm:text-xs transition-all cursor-pointer shrink-0 ${
										showBubbleText
											? 'bg-[#b23a2e]/15 border border-[#b23a2e]/30 text-[#b23a2e] dark:text-[#e08a63] font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Bubble Text Bounding Boxes (Red)"
									on:click={() => (showBubbleText = !showBubbleText)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-[#b23a2e] ${showBubbleText ? 'bg-[#b23a2e]' : 'bg-transparent'}`}></span>
									<span>Bubble Text</span>
								</button>

								<!-- FREE TEXT TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-2 h-full rounded text-[10.5px] sm:text-xs transition-all cursor-pointer shrink-0 ${
										showFreeText
											? 'bg-purple-600/15 border border-purple-600/30 text-purple-700 dark:text-purple-300 font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Free Text / Narration Bounding Boxes (Purple)"
									on:click={() => (showFreeText = !showFreeText)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-purple-600 ${showFreeText ? 'bg-purple-500' : 'bg-transparent'}`}></span>
									<span>Free Text</span>
								</button>

								<!-- SFX / ONOMATOPOEIA TOGGLE -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-2 h-full rounded text-[10.5px] sm:text-xs transition-all cursor-pointer shrink-0 ${
										showOnomatopoeia
											? 'bg-amber-600/15 border border-amber-600/30 text-amber-700 dark:text-amber-300 font-semibold'
											: 'opacity-40 hover:opacity-80 text-neutral-600 dark:text-neutral-400 border border-transparent'
									}`}
									title="Toggle Onomatopoeia / SFX Outlines (Amber)"
									on:click={() => (showOnomatopoeia = !showOnomatopoeia)}
								>
									<span class={`inline-block w-2 h-2 rounded-xs border border-amber-600 ${showOnomatopoeia ? 'bg-amber-500' : 'bg-transparent'}`}></span>
									<span>SFX</span>
								</button>
							</div>
						</div>

						<!-- RESOLUTION & THREE-TIER VISUAL GEOMETRY LEGEND WITH TOGGLES -->
						<div class="flex flex-wrap sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 sm:gap-1 shrink-0 px-0.5 sm:pl-1 sm:h-[38px]">
							<span class="opacity-60 text-[9.5px] leading-tight">{pw} × {ph} px · {page.regions?.length ?? 0} regions</span>
							<div class="flex items-center gap-1.5 sm:gap-2 text-[9px] leading-tight select-none">
								<!-- TOGGLE BASE TIER -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-1 py-0.5 rounded transition-all cursor-pointer ${
										showBaseTier
											? 'opacity-90 font-medium hover:opacity-100'
											: 'opacity-35 line-through hover:opacity-60'
									}`}
									title={showBaseTier ? 'Click to hide Base (0%) text anchor layer' : 'Click to show Base (0%) text anchor layer'}
									on:click={() => (showBaseTier = !showBaseTier)}
									use:ripple
								>
									<span class={`w-2.5 h-2 rounded-xs border border-dotted border-neutral-400 dark:border-white ${showBaseTier ? 'bg-transparent' : 'bg-transparent opacity-40'}`}></span>
									<span>Base (0%)</span>
								</button>

								<!-- TOGGLE INPAINT TIER -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-1 py-0.5 rounded transition-all cursor-pointer ${
										showInpaintTier
											? 'opacity-90 font-medium hover:opacity-100'
											: 'opacity-35 line-through hover:opacity-60'
									}`}
									title={showInpaintTier ? 'Click to hide Inpaint mask boundary layer' : 'Click to show Inpaint mask boundary layer'}
									on:click={() => (showInpaintTier = !showInpaintTier)}
									use:ripple
								>
									<span class={`w-2.5 h-2 rounded-xs border border-dashed border-neutral-800 dark:border-neutral-200 ${showInpaintTier ? 'bg-black/10 dark:bg-white/10' : 'opacity-40'}`}></span>
									<span>Inpaint</span>
								</button>

								<!-- TOGGLE TYPESET TIER -->
								<button
									type="button"
									class={`inline-flex items-center gap-1 px-1 py-0.5 rounded transition-all cursor-pointer ${
										showTypesetTier
											? 'opacity-90 font-bold text-[#7f1d1d] dark:text-red-300 hover:opacity-100'
											: 'opacity-35 line-through hover:opacity-60 text-neutral-600 dark:text-neutral-400'
									}`}
									title={showTypesetTier ? 'Click to hide Typeset layout boundary layer' : 'Click to show Typeset layout boundary layer'}
									on:click={() => (showTypesetTier = !showTypesetTier)}
									use:ripple
								>
									<span class={`w-2.5 h-2 rounded-xs border border-[#7f1d1d] dark:border-red-400 ${showTypesetTier ? 'bg-[#7f1d1d]/30 dark:bg-red-500/30' : 'opacity-40'}`}></span>
									<span>Typeset</span>
								</button>
							</div>
						</div>
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
							{@const kind = getRegionKind(region)}
							{@const bb = getBubbleBox(region)}
							{@const isHidden = !!hiddenRegionIds[region.id]}
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<div
								class={`rounded-xl border p-3 text-xs transition-all cursor-pointer ${
									isHidden ? 'opacity-60 bg-black/[0.01] dark:bg-white/[0.01]' : ''
								} ${
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
								<!-- HEADER ROW: sequence badge + kind tag + confidence + rotation angle + box size + annotation eye toggle -->
								<div class="flex flex-wrap items-center justify-between gap-1.5">
									<div class="flex items-center gap-1.5">
										<span class="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#b23a2e] bg-[#b23a2e]/10 dark:text-[#e08a63]">
											#{region.seq + 1}
										</span>
										<!-- REGION KIND TAG BADGE: BUBBLE TEXT / FREE TEXT / SFX -->
										{#if kind === 'sound_effect'}
											<span class="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
												SFX
											</span>
										{:else if kind === 'dialogue_bubble'}
											<span class="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 dark:text-cyan-300">
												Bubble Text
											</span>
										{:else}
											<span class="rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:text-purple-300">
												Free Text
											</span>
										{/if}

										{#if isModified}
											<span class="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
												Edited
											</span>
										{:else if !region.textTarget}
											<span class="rounded bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 dark:text-sky-300">
												Preserved Art
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

										<!-- INDIVIDUAL REGION ANNOTATION VISIBILITY TOGGLE -->
										<button
											type="button"
											title={isHidden ? 'Show canvas annotation for this region' : 'Hide canvas annotation for this region'}
											aria-label={isHidden ? 'Show canvas annotation for this region' : 'Hide canvas annotation for this region'}
											class={`inline-flex items-center justify-center rounded p-1 transition hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 cursor-pointer ${
												isHidden ? 'text-neutral-400 opacity-60' : 'text-neutral-700 dark:text-neutral-200'
											}`}
											on:click|stopPropagation={() => toggleRegionAnnotation(region.id)}
										>
											{#if isHidden}
												<EyeOff size={12} />
											{:else}
												<Eye size={12} />
											{/if}
										</button>
									</div>
								</div>

								{#if b}
									<div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[9px]">
										<span class="text-[#b23a2e] dark:text-[#e08a63] font-medium">
											Text: ({b.x}, {b.y}) · {b.w}×{b.h}
										</span>
										{#if bb}
											<span class="text-cyan-700 dark:text-cyan-400 opacity-80">
												Container: ({bb.x}, {bb.y}) · {bb.w}×{bb.h}
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
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-2.5">
			{#if page}
				<div class="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
					<Button variant="secondary" size="md" class="px-2.5 py-2 text-xs sm:px-3.5 sm:py-2 sm:text-sm" on:click={() => (ocrStatsModalOpen = true)}>
						<Scan size={14} class="mr-1 sm:mr-1.5 text-[#4f7a64] dark:text-[#83b39a] shrink-0" />
						<span class="truncate">OCR Pipeline</span>
					</Button>
					<Button variant="secondary" size="md" class="px-2.5 py-2 text-xs sm:px-3.5 sm:py-2 sm:text-sm" on:click={() => (llmPromptModalOpen = true)}>
						<Terminal size={14} class="mr-1 sm:mr-1.5 text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
						<span class="truncate">LLM Prompt</span>
					</Button>
					<Button variant="secondary" size="md" class="px-2.5 py-2 text-xs sm:px-3.5 sm:py-2 sm:text-sm" on:click={copyInspectDebugInfo}>
						<Copy size={14} class="mr-1 sm:mr-1.5 shrink-0" />
						<span class="truncate">Copy Debug</span>
					</Button>
					<Button
						variant="secondary"
						size="md"
						class="px-2.5 py-2 text-xs sm:px-3.5 sm:py-2 sm:text-sm"
						disabled={retypesetting || !page.cleanedPath}
						title={page.cleanedPath ? 'Re-render page typesetting with current settings' : 'Cleaned mask not available'}
						on:click={handleRetypesetPage}
					>
						{#if retypesetting}
							<Loader2 size={14} class="mr-1 sm:mr-1.5 animate-spin text-[#b23a2e] dark:text-[#e08a63] shrink-0" />
							<span class="truncate">Typesetting...</span>
						{:else}
							<RotateCcw size={14} class="mr-1 sm:mr-1.5 shrink-0" />
							<span class="truncate">Retypeset</span>
						{/if}
					</Button>
				</div>
			{:else}
				<div></div>
			{/if}
			<Button variant="primary" size="md" class="w-full sm:w-auto" on:click={() => dispatch('close')}>Close</Button>
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
	<PageLlmPromptModal
		bind:open={llmPromptModalOpen}
		{page}
		on:close={() => {
			llmPromptModalOpen = false;
		}}
	/>
	<PageOcrStatsModal
		bind:open={ocrStatsModalOpen}
		{page}
		on:close={() => {
			ocrStatsModalOpen = false;
		}}
	/>
{/if}
