/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import GlossaryPanel from '$lib/components/GlossaryPanel.svelte';

describe('GlossaryPanel Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders glossary panel with search and table', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }),
		});
		global.fetch = fetchMock;

		render(GlossaryPanel, {
			props: {
				scope: 'global',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
			},
		});

		expect(screen.getByPlaceholderText('Search terms…')).toBeTruthy();
	});

	it('validates and submits new glossary term through createGlossaryTermSchema', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (init?.method === 'POST') {
				return {
					ok: true,
					json: async () => ({ id: 1, source: '飞剑', target: 'Flying Sword' }),
				};
			}
			return {
				ok: true,
				json: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }),
			};
		});
		global.fetch = fetchMock;

		render(GlossaryPanel, {
			props: {
				scope: 'global',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
			},
		});

		// 1. Open "Add term" modal
		const addBtns = screen.getAllByText('Add term');
		await fireEvent.click(addBtns[0]);
		await tick();

		// 2. Fill inputs
		const sourceInput = screen.getByPlaceholderText('source term');
		const targetInput = screen.getByPlaceholderText('target rendering');
		await fireEvent.input(sourceInput, { target: { value: '飞剑' } });
		await fireEvent.input(targetInput, { target: { value: 'Flying Sword' } });

		// 3. Submit form
		const submitBtns = screen.getAllByText('Add term');
		await fireEvent.click(submitBtns[submitBtns.length - 1]);
		await tick();

		// 4. Verify fetch called with valid schema body
		const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
		expect(postCall).toBeTruthy();
		const body = JSON.parse(postCall![1].body);
		expect(body.source).toBe('飞剑');
		expect(body.target).toBe('Flying Sword');
		expect(body.scope).toBe('global');
	});

	it('renders export link with download and external rel to prevent SPA router intercept', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }),
		});
		global.fetch = fetchMock;

		render(GlossaryPanel, {
			props: {
				scope: 'global',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
			},
		});

		const exportLink = screen.getByText('Export').closest('a');
		expect(exportLink).toBeTruthy();
		expect(exportLink?.getAttribute('href')).toBe('/api/glossary/export?scope=global&sourceLang=zh-Hans&targetLang=en');
		expect(exportLink?.hasAttribute('download')).toBe(true);
		expect(exportLink?.getAttribute('rel')).toBe('external');
		expect(exportLink?.hasAttribute('data-sveltekit-reload')).toBe(true);
	});

	it('triggers CSV import on file input change', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.includes('/api/glossary/import') && init?.method === 'POST') {
				return {
					ok: true,
					json: async () => ({ parsed: 2, added: 2, updated: 0 }),
				};
			}
			return {
				ok: true,
				json: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }),
			};
		});
		global.fetch = fetchMock;

		const { container } = render(GlossaryPanel, {
			props: {
				scope: 'global',
				sourceLang: 'zh-Hans',
				targetLang: 'en',
			},
		});

		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		expect(fileInput).toBeTruthy();

		const file = new File(['source,target\n丹药,Pill\n'], 'glossary.csv', { type: 'text/csv' });
		await fireEvent.change(fileInput, { target: { files: [file] } });
		await tick();

		const importCall = fetchMock.mock.calls.find((c) => c[0].includes('/api/glossary/import'));
		expect(importCall).toBeTruthy();
		expect(importCall![1]?.method).toBe('POST');
		expect(importCall![1]?.body instanceof FormData).toBe(true);
	});
});
