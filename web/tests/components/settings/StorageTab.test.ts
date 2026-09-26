/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import StorageTab from '$lib/components/settings/StorageTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

const CAT = { bytes: 1024, count: 1 };
const STATS = {
	dataRoot: '/data',
	totalBytes: 8192,
	bookCount: 1,
	chapterCount: 2,
	pageCount: 3,
	categories: { uploads: CAT, clean: CAT, output: CAT, annotated: CAT, covers: CAT, thumbs: CAT, database: CAT, caches: CAT },
};

describe('StorageTab', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.restoreAllMocks();
		fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => STATS }));
		global.fetch = fetchMock as any;
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the storage header and its actions', () => {
		render(StorageTab);
		expect(screen.getByRole('heading', { name: /Storage & Data/i })).toBeTruthy();
		expect(screen.getByText('Refresh')).toBeTruthy();
		expect(screen.getByText('Clear All Data')).toBeTruthy();
	});

	it('refresh requests the storage statistics endpoint', async () => {
		render(StorageTab);
		await fireEvent.click(screen.getByText('Refresh'));
		await tick();
		expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/system/storage')).toBe(true);
		await vi.waitFor(() => expect(screen.getByText('/data')).toBeTruthy());
	});
});
