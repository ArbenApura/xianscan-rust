/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import PageInspectModal from '$lib/components/chapter/PageInspectModal.svelte';

describe('PageInspectModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders inspection modal with page details and detected regions', async () => {
		const mockPage = {
			id: 101,
			seq: 0,
			filePath: 'page_1.png',
			outputPath: 'output/page_1.png',
			width: 800,
			height: 1200,
			regions: [
				{
					id: 501,
					seq: 0,
					textSource: '你好世界',
					textTarget: 'Hello World',
					box: { x: 50, y: 100, w: 200, h: 80 },
				},
			],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		expect(screen.getByText('Inspect Page 1 (ID: 101)')).toBeTruthy();

		// Click the Regions section button on mobile view
		const regionsTab = screen.getByText('Regions (1)');
		await fireEvent.click(regionsTab);
		await tick();

		expect(screen.getByText('你好世界')).toBeTruthy();
		expect(screen.getByText('Hello World')).toBeTruthy();
	});

	it('renders LLM Prompt button and opens conversation history dialog with benchmarks', async () => {
		const mockPage = {
			id: 102,
			seq: 1,
			filePath: 'page_2.png',
			outputPath: 'output/page_2.png',
			width: 800,
			height: 1200,
			llmPrompt: JSON.stringify([
				{ role: 'system', content: 'System translation instructions' },
				{ role: 'user', content: 'Translate regions: [{"id":"r0","text":"你好"}]' },
			]),
			llmResponse: JSON.stringify({
				raw: '{"r0":"Hello"}',
				model: 'deepseek-v4-flash',
				durationMs: 1250,
				promptTokens: 450,
				cachedTokens: 300,
				completionTokens: 25,
				timestamp: Date.now(),
			}),
			regions: [],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		const promptBtn = screen.getByText('LLM Prompt');
		expect(promptBtn).toBeTruthy();

		await fireEvent.click(promptBtn);
		await tick();

		expect(screen.getByText(/LLM Translation Benchmark (and|&) History/)).toBeTruthy();
		expect(screen.getByText('1.25 s')).toBeTruthy();
		expect(screen.getByText('deepseek-v4-flash')).toBeTruthy();
		expect(screen.getByText(/System Instructions/)).toBeTruthy();
	});

	it('renders OCR Pipeline button and opens OCR & Layout Diagnostics dialog with latency and step logs', async () => {
		const mockPage = {
			id: 103,
			seq: 2,
			filePath: 'page_3.png',
			outputPath: 'output/page_3.png',
			width: 1080,
			height: 1920,
			ocrStats: JSON.stringify({
				total_time_ms: 245.8,
				wall_time_ms: 540.0,
				queue_wait_ms: 294.2,
				detector_time_ms: 120.5,
				ocr_fullpage_time_ms: 80.2,
				rescue_time_ms: 25.1,
				assembly_time_ms: 10.0,
				backend: 'Koharu RF-DETR Seg',
				device: 'DirectML (GPU)',
				image_width: 1080,
				image_height: 1920,
				raw_bubbles_count: 5,
				raw_text_bubbles_count: 5,
				raw_text_free_count: 2,
				raw_sfx_count: 3,
				raw_ocr_lines_count: 12,
				rescued_crops_count: 2,
				final_regions_count: 7,
				avg_confidence: 0.954,
				steps: [
					{
						step: 'Comic Layout Detection',
						duration_ms: 120.5,
						details: 'Identified 5 bubbles, 5 in-bubble texts, 2 free texts, 3 SFX',
					},
					{
						step: 'Full-Page Line Detection & OCR',
						duration_ms: 80.2,
						details: 'Extracted 12 raw text lines across 1080x1920 image canvas',
					},
				],
			}),
			regions: [],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		const ocrBtn = screen.getByText('OCR Pipeline');
		expect(ocrBtn).toBeTruthy();

		await fireEvent.click(ocrBtn);
		await tick();

		expect(screen.getByText(/OCR & Layout Diagnostics - Page 3/)).toBeTruthy();
		expect(screen.getByText('540 ms')).toBeTruthy();
		expect(screen.getByText('Compute: 246 ms')).toBeTruthy();
		expect(screen.getByText('Koharu RF-DETR Seg')).toBeTruthy();
		expect(screen.getByText('95.4%')).toBeTruthy();
		expect(screen.getByText('7 regions')).toBeTruthy();
		expect(screen.getByText('1080 × 1920')).toBeTruthy();
		expect(screen.getByText('Phase Latency Breakdown')).toBeTruthy();
		expect(screen.getByText('0. Concurrency Queue & Engine Lock Wait')).toBeTruthy();
	});

	it('triggers retypeset with user typeset preferences when Retypeset button is clicked', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				outputPath: 'output/1/2.webp',
				outputRev: 2,
			}),
		});
		global.fetch = fetchMock;

		const mockPage = {
			id: 106282,
			seq: 1,
			filePath: 'page_2.png',
			cleanedPath: 'cleaned/1/2.png',
			outputPath: 'output/page_2.png',
			width: 800,
			height: 1389,
			regions: [],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		const retypesetBtn = screen.getByText('Retypeset');
		expect(retypesetBtn).toBeTruthy();

		await fireEvent.click(retypesetBtn);
		await tick();

		const typesetCall = fetchMock.mock.calls.find((call) => call[0] === '/api/pages/106282/typeset');
		expect(typesetCall).toBeDefined();
		expect(typesetCall[1].method).toBe('POST');
		const body = JSON.parse(typesetCall[1].body);
		expect(body.typesetOptions).toBeDefined();
		expect(body.typesetOptions.fontCjk).toBe('WenQuanYi Micro Hei');
	});

	it('renders Re-translate Page button and dispatches retranslate event on click', async () => {
		const mockPage = {
			id: 104,
			seq: 3,
			filePath: 'page_4.png',
			outputPath: 'output/page_4.png',
			width: 800,
			height: 1200,
			regions: [],
		};

		const { component } = render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		const retranslateHandler = vi.fn();
		component.$on('retranslate', retranslateHandler);

		const retranslateBtn = screen.getByText('Re-translate Page');
		expect(retranslateBtn).toBeTruthy();

		await fireEvent.click(retranslateBtn);
		await tick();

		expect(retranslateHandler).toHaveBeenCalledTimes(1);
		expect(retranslateHandler.mock.calls[0][0].detail.page.id).toBe(104);
	});

	it('renders error alert banner with failure details and retry button when page has error', async () => {
		const mockPage = {
			id: 105,
			seq: 4,
			status: 'error',
			error: 'Translation failed (TOKEN_BUDGET_EXHAUSTED)',
			filePath: 'page_5.png',
			outputPath: null,
			width: 800,
			height: 1200,
			regions: [],
		};

		const { component } = render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		const retranslateHandler = vi.fn();
		component.$on('retranslate', retranslateHandler);

		expect(screen.getByText('Translation failed (TOKEN_BUDGET_EXHAUSTED)')).toBeTruthy();
		expect(screen.getByText('Translation or Pipeline Failure')).toBeTruthy();

		const retryBtn = screen.getByRole('button', { name: /Retry/i });
		expect(retryBtn).toBeTruthy();

		await fireEvent.click(retryBtn);
		await tick();

		expect(retranslateHandler).toHaveBeenCalledTimes(1);
		expect(retranslateHandler.mock.calls[0][0].detail.page.id).toBe(105);
	});

	it('selects and activates region on a single click without requiring double click', async () => {
		const mockPage = {
			id: 106,
			seq: 0,
			filePath: 'page_6.png',
			width: 800,
			height: 1200,
			regions: [
				{
					id: 601,
					seq: 0,
					textSource: '点击区域',
					textTarget: 'Click region',
					box: { x: 40, y: 80, w: 160, h: 60 },
				},
			],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		// OPEN REGIONS LIST ON MOBILE VIEW IF NEEDED
		const regionsTab = screen.getByText('Regions (1)');
		await fireEvent.click(regionsTab);
		await tick();

		const regionCard = document.getElementById('inspect-region-601');
		expect(regionCard).toBeTruthy();

		// SIMULATE MOUSE ENTER AND SINGLE CLICK
		await fireEvent.mouseEnter(regionCard!);
		await tick();
		await fireEvent.click(regionCard!);
		await tick();

		// VERIFY REGION HAS ACTIVE ACCENT BORDER AFTER SINGLE CLICK
		expect(regionCard?.className).toContain('border-[#b23a2e]/50');

		// SIMULATE MOUSE LEAVE - PERSISTENT SELECTION MUST REMAIN ACTIVE
		await fireEvent.mouseLeave(regionCard!);
		await tick();
		expect(regionCard?.className).toContain('border-[#b23a2e]/50');
	});

	it('shows only typeset as hard minimum when all tiers are disabled and region is hovered', async () => {
		const mockPage = {
			id: 107,
			seq: 0,
			filePath: 'page_7.png',
			width: 800,
			height: 1200,
			regions: [
				{
					id: 701,
					seq: 0,
					textSource: '全部禁用',
					textTarget: 'All disabled',
					box: { x: 50, y: 100, w: 200, h: 80 },
					inpaintBox: { x: 45, y: 95, w: 210, h: 90 },
					typesetBox: { x: 52, y: 102, w: 196, h: 76 },
				},
			],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		// DISABLE TYPESET TIER (BASE AND INPAINT ARE DISABLED BY DEFAULT)
		const typesetToggleBtn = screen.getByTitle('Click to hide Typeset layout boundary layer');
		await fireEvent.click(typesetToggleBtn);
		await tick();

		// HOVER OVER REGION
		const regionCard = document.getElementById('inspect-region-701');
		expect(regionCard).toBeTruthy();
		await fireEvent.mouseEnter(regionCard!);
		await tick();

		// SVG SHOULD RENDER TYPESET RECT AS HARD MINIMUM
		const typesetRect = document.querySelector('rect[width="196"][height="76"]');
		expect(typesetRect).toBeTruthy();

		// INPAINT RECT (WIDTH 210) AND BASE RECT (WIDTH 200) MUST NOT BE RENDERED
		const inpaintRect = document.querySelector('rect[width="210"][height="90"]');
		expect(inpaintRect).toBeNull();
		const baseRect = document.querySelector('rect[stroke="#ffffff"]');
		expect(baseRect).toBeNull();
	});

	it('toggles OCR tier layer and renders tight ocrBox when active', async () => {
		const mockPage = {
			id: 108,
			seq: 0,
			filePath: 'page_8.png',
			width: 800,
			height: 1200,
			regions: [
				{
					id: 801,
					seq: 0,
					textSource: '紧密边框',
					textTarget: 'Tight OCR Box',
					box: { x: 50, y: 100, w: 200, h: 80 },
					ocrBox: { x: 55, y: 105, w: 180, h: 70 },
					typesetBox: { x: 50, y: 100, w: 200, h: 80 },
				},
			],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		// INITIALLY OCR TIER IS DISABLED
		const ocrToggleBtn = screen.getByTitle('Click to show OCR tight text boundary layer');
		expect(ocrToggleBtn).toBeTruthy();
		expect(screen.getByText('OCR')).toBeTruthy();
		expect(document.querySelector('rect[width="180"][height="70"]')).toBeNull();

		// TOGGLE OCR TIER ON
		await fireEvent.click(ocrToggleBtn);
		await tick();

		// OCR RECT WITH EXACT TIGHT DIMS SHOULD NOW BE RENDERED WITH WHITE STROKE
		const ocrRect = document.querySelector('rect[width="180"][height="70"]');
		expect(ocrRect).toBeTruthy();
		expect(ocrRect?.getAttribute('stroke')).toBe('#ffffff');
	});

	it('toggles Inpaint tier layer and renders inpaintBox even when dimensions match base box', async () => {
		const mockPage = {
			id: 109,
			seq: 0,
			filePath: 'page_9.png',
			width: 800,
			height: 1200,
			regions: [
				{
					id: 901,
					seq: 0,
					textSource: '去除残墨',
					textTarget: 'Inpaint boundary',
					box: { x: 50, y: 100, w: 200, h: 80 },
					inpaintBox: { x: 50, y: 100, w: 200, h: 80 },
					typesetBox: { x: 50, y: 100, w: 200, h: 80 },
				},
			],
		};

		render(PageInspectModal, {
			props: {
				open: true,
				page: mockPage,
			},
		});

		// INITIALLY INPAINT TIER IS DISABLED
		const inpaintToggleBtn = screen.getByTitle('Click to show Inpaint mask boundary layer');
		expect(inpaintToggleBtn).toBeTruthy();
		expect(screen.getByText('Inpaint')).toBeTruthy();
		expect(document.querySelector('rect[stroke="#000000"]')).toBeNull();

		// TOGGLE INPAINT TIER ON
		await fireEvent.click(inpaintToggleBtn);
		await tick();

		// INPAINT RECT WITH EXACT DIMS MUST BE RENDERED WITH BLACK DASHED STROKE
		const inpaintRect = document.querySelector('rect[stroke="#000000"]');
		expect(inpaintRect).toBeTruthy();
		expect(inpaintRect?.getAttribute('width')).toBe('200');
		expect(inpaintRect?.getAttribute('height')).toBe('80');
		expect(inpaintRect?.getAttribute('stroke-dasharray')).toBe('3.5 2');
	});
});


