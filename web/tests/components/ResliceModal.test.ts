/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import ResliceModal from '$lib/components/ResliceModal.svelte';
import { resliceChapterSchema, stitchPagesSchema } from '$lib/schemas';
import { validateForm } from '$lib/utils/form';

describe('ResliceModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders reslice modal with steps and start button', async () => {
		render(ResliceModal, {
			props: {
				open: true,
				chapterId: 10,
				pageCount: 15,
			},
		});

		expect(screen.getByText('Smart Webtoon Re-slicing')).toBeTruthy();
		expect(screen.getByText('Start Re-slicing')).toBeTruthy();
	});

	it('validates reslice and stitch pipeline schemas', () => {
		const reslicePayload = {
			targetHeight: 1600,
			minHeight: 1200,
			maxHeight: 2000,
		};
		const resliceRes = validateForm(resliceChapterSchema, reslicePayload);
		expect(resliceRes.success).toBe(true);
		expect(resliceRes.data?.targetHeight).toBe(1600);
		expect(resliceRes.data?.maxHeight).toBe(2000);

		const stitchPayload = {
			targetPageId: 42,
		};
		const stitchRes = validateForm(stitchPagesSchema, stitchPayload);
		expect(stitchRes.success).toBe(true);
		expect(stitchRes.data?.targetPageId).toBe(42);
	});
});
