/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AboutTab from '$lib/components/settings/AboutTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';

describe('AboutTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => cleanup());

	it('renders the version card with the hardware-reported core version', () => {
		render(AboutTab, { props: { hardwareInfo: { version: '9.8.7', web_build_hash: 'abc123' } as any } });
		expect(screen.getByRole('heading', { name: /About & System Diagnostics/i })).toBeTruthy();
		expect(screen.getByText('Check Updates')).toBeTruthy();
		expect(screen.getByText('v9.8.7')).toBeTruthy();
		expect(screen.getByText('abc123')).toBeTruthy();
	});

	it('dispatches openTour when Replay Tour is clicked', async () => {
		const { component } = render(AboutTab, { props: { hardwareInfo: null } });
		const onOpenTour = vi.fn();
		component.$on('openTour', onOpenTour);
		await fireEvent.click(screen.getByText('Replay Tour'));
		expect(onOpenTour).toHaveBeenCalledTimes(1);
	});

	it('rings the highlighted setting', () => {
		const { container } = render(AboutTab, { props: { hardwareInfo: null, highlightedSettingId: 'welcome-tour' } });
		expect(container.querySelector('#setting-welcome-tour')?.className).toContain('ring-2');
	});
});
