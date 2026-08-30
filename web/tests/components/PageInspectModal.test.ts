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

		expect(screen.getByText(/LLM Translation Benchmark & History/)).toBeTruthy();
		expect(screen.getByText('1.25 s')).toBeTruthy();
		expect(screen.getByText('deepseek-v4-flash')).toBeTruthy();
		expect(screen.getByText('System Instructions')).toBeTruthy();
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
});

