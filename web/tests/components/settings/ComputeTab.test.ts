/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import ComputeTab from '$lib/components/settings/ComputeTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

const HARDWARE = {
	device_label: 'DirectML (DML:0)',
	active_provider: 'DmlExecutionProvider',
	providers: ['DmlExecutionProvider', 'CPUExecutionProvider'],
	available_providers: ['DmlExecutionProvider', 'CPUExecutionProvider'],
	has_cuda: false,
	has_directml: true,
	has_coreml: false,
};

describe('ComputeTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the accelerator cards and the telemetry card', () => {
		render(ComputeTab, { props: { hardwareInfo: HARDWARE } });
		expect(screen.getByRole('heading', { name: /Hardware & Compute Accelerator/i })).toBeTruthy();
		expect(screen.getByText('Live System Telemetry')).toBeTruthy();
		expect(screen.getByText('Parallel Page Workers')).toBeTruthy();
	});

	it('writes parallelProcesses when a worker count is clicked', async () => {
		render(ComputeTab, { props: { hardwareInfo: HARDWARE } });
		const workers = screen.getByText('Parallel Page Workers').parentElement!;
		const three = Array.from(workers.querySelectorAll('button')).find((b) => b.textContent?.trim() === '3')!;
		await fireEvent.click(three);
		await tick();
		expect(get(settings).parallelProcesses).toBe(3);
	});

	it('keeps one telemetry request in flight and stops polling when unmounted', async () => {
		vi.useFakeTimers();
		try {
			let release: (() => void) | null = null;
			let calls = 0;
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).includes('/api/system/telemetry')) {
					calls++;
					await new Promise<void>((r) => (release = r));
				}
				return { ok: true, json: async () => ({}) };
			});

			const { unmount } = render(ComputeTab, { props: { hardwareInfo: HARDWARE } });
			await tick();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(calls).toBe(1);

			release!();
			await vi.advanceTimersByTimeAsync(2_100);
			expect(calls).toBe(2);

			unmount();
			release!();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(calls).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
