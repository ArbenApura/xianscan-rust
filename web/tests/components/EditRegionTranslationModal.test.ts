/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import EditRegionTranslationModal from '$lib/components/chapter/EditRegionTranslationModal.svelte';

describe('EditRegionTranslationModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders region details and OCR source text', () => {
		render(EditRegionTranslationModal, {
			props: {
				open: true,
				pageId: 1,
				region: {
					id: 10,
					seq: 0,
					textSource: '你好世界',
					textTarget: 'Hello World',
					originalTarget: 'Hello World',
					box: { x: 10, y: 20, w: 100, h: 50 },
				},
			},
		});

		expect(screen.getByText('Edit Region #1 Translation')).toBeTruthy();
		expect(screen.getByText('你好世界')).toBeTruthy();
		const textarea = screen.getByPlaceholderText('Enter translated dialogue to typeset onto the page...') as HTMLTextAreaElement;
		expect(textarea.value).toBe('Hello World');
	});

	it('selects preset prompt pills and triggers AI re-roll with instruction', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ text: 'Dramatic: Hello World Climax!' }),
		});
		global.fetch = fetchMock;

		render(EditRegionTranslationModal, {
			props: {
				open: true,
				pageId: 1,
				region: {
					id: 10,
					seq: 0,
					textSource: '你好世界',
					textTarget: 'Hello World',
					originalTarget: 'Hello World',
				},
			},
		});

		// 1. Click preset pill "Dramatic"
		const dramaticBtn = screen.getByText('Dramatic');
		await fireEvent.click(dramaticBtn);

		// 2. Click "Re-roll with AI"
		const rerollBtn = screen.getByText('Re-roll with AI');
		await fireEvent.click(rerollBtn);

		// 3. Verify fetch called with correct payload conforming to translateTextSchema
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/api/translate-text');
		expect(fetchMock.mock.calls[0][1].method).toBe('POST');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			text: '你好世界',
			kind: 'general',
			instruction: 'Make it sound dramatic and impactful for a comic climax',
			pageId: 1,
		});

		// 4. Verify textarea updated with the re-rolled text
		await tick();
		const textarea = screen.getByPlaceholderText('Enter translated dialogue to typeset onto the page...') as HTMLTextAreaElement;
		expect(textarea.value).toBe('Dramatic: Hello World Climax!');
	});

	it('dispatches validated PATCH request when saving manual edit', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				region: { id: 10, textTarget: 'Custom Edited Text' },
				outputPath: 'output/1/0.png',
			}),
		});
		global.fetch = fetchMock;

		const { component } = render(EditRegionTranslationModal, {
			props: {
				open: true,
				pageId: 1,
				region: {
					id: 10,
					seq: 0,
					textSource: '你好世界',
					textTarget: 'Hello World',
					originalTarget: 'Hello World',
				},
			},
		});

		const savedHandler = vi.fn();
		component.$on('saved', savedHandler);

		// 1. Change textarea value
		const textarea = screen.getByPlaceholderText('Enter translated dialogue to typeset onto the page...') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'Custom Edited Text' } });

		// 2. Click Save
		const saveBtn = screen.getByText('Save');
		await fireEvent.click(saveBtn);

		// 3. Verify PATCH fetch called
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/api/pages/1/regions/10');
		expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			textTarget: 'Custom Edited Text',
			action: 'save',
		});

		expect(savedHandler).toHaveBeenCalled();
	});
});
