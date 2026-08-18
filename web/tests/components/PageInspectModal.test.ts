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
});
