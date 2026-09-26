/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from 'svelte';
import NetworkAccessSection from '$lib/components/settings/NetworkAccessSection.svelte';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

function status(overrides: Record<string, unknown> = {}) {
	return {
		token: TOKEN,
		lanAccessEnabled: false,
		effectiveBind: 'local',
		bindSource: 'default',
		restartRequired: false,
		lanUrls: [],
		noticePending: false,
		...overrides,
	};
}

describe('NetworkAccessSection', () => {
	afterEach(() => cleanup());

	it('shows a skeleton of the three cards while the status is loading', () => {
		render(NetworkAccessSection, { props: { initialStatus: null } });
		const skeleton = screen.getByTestId('network-skeleton');
		expect(skeleton.getAttribute('aria-busy')).toBe('true');
		expect(screen.getByRole('status').textContent).toContain('Loading network and access settings');
		expect(skeleton.querySelectorAll(':scope > div[aria-hidden="true"]').length).toBe(3);
		expect(screen.queryByText('Loading...')).toBeNull();
		expect(screen.queryByTestId('access-token')).toBeNull();
	});

	it('replaces the skeleton with the cards once the status is known', () => {
		render(NetworkAccessSection, { props: { initialStatus: status() } });
		expect(screen.queryByTestId('network-skeleton')).toBeNull();
		expect(screen.getByTestId('access-token')).toBeTruthy();
	});

	it('renders the token masked and reveals it on Show', async () => {
		render(NetworkAccessSection, { props: { initialStatus: status() } });
		const code = screen.getByTestId('access-token');
		expect(code.textContent).not.toContain(TOKEN);

		await fireEvent.click(screen.getByRole('button', { name: 'Show token' }));
		await tick();
		expect(screen.getByTestId('access-token').textContent).toBe(TOKEN);
	});

	it('asks for confirmation before regenerating', async () => {
		render(NetworkAccessSection, { props: { initialStatus: status() } });
		expect(screen.queryByText('Every paired phone and extension will need the new token.')).toBeNull();
		await fireEvent.click(screen.getByText('Regenerate'));
		await tick();
		expect(screen.getByText('Every paired phone and extension will need the new token.')).toBeTruthy();
	});

	it('disables the LAN toggle when the bind is pinned by Docker', () => {
		render(NetworkAccessSection, { props: { initialStatus: status({ bindSource: 'docker' }) } });
		expect(screen.getByTestId('bind-pinned').textContent).toContain('Docker');
		const toggle = screen.getByRole('switch', { name: 'LAN access' }) as HTMLButtonElement;
		expect(toggle.disabled).toBe(true);
	});

	it('names both the --lan flag and XIANSCAN_BIND when the bind is pinned outside Docker', () => {
		render(NetworkAccessSection, { props: { initialStatus: status({ bindSource: 'env', effectiveBind: 'lan' }) } });
		expect(screen.getByTestId('bind-pinned').textContent).toContain(
			'Set by the --lan flag or the XIANSCAN_BIND environment variable, so it cannot be changed here.',
		);
	});

	it('tells a loopback install to turn on LAN access before pairing another device', () => {
		render(NetworkAccessSection, { props: { initialStatus: status() } });
		expect(screen.queryByText(/open one of the addresses above/)).toBeNull();
		expect(screen.getByText(/turn on LAN access, restart XianScan, then open one of the listed addresses/)).toBeTruthy();
		expect(screen.getByText(/turn on LAN access above and restart XianScan/)).toBeTruthy();
	});

	it('points at the listed addresses once LAN access is live', () => {
		render(NetworkAccessSection, {
			props: { initialStatus: status({ lanAccessEnabled: true, effectiveBind: 'lan', lanUrls: ['http://192.168.1.10:8124'] }) },
		});
		expect(screen.getByText(/open one of the addresses above and paste the token once/)).toBeTruthy();
	});

	it('shows the restart pill and LAN URLs when relevant', () => {
		render(NetworkAccessSection, {
			props: {
				initialStatus: status({
					restartRequired: true,
					effectiveBind: 'lan',
					lanUrls: ['http://192.168.1.10:8124'],
				}),
			},
		});
		expect(screen.getByTestId('restart-pill')).toBeTruthy();
		expect(screen.getByText('http://192.168.1.10:8124')).toBeTruthy();
	});

	it('rings the settings-search target like the other settings tabs', async () => {
		const { component } = render(NetworkAccessSection, {
			props: { initialStatus: status(), highlightedSettingId: 'access-token' },
		});
		expect(document.getElementById('setting-access-token')!.className).toContain('ring-2');
		expect(document.getElementById('setting-lan-access')!.className).not.toContain('ring-2');

		component.$set({ highlightedSettingId: 'lan-access' });
		await tick();
		expect(document.getElementById('setting-lan-access')!.className).toContain('ring-2');
		expect(document.getElementById('setting-access-token')!.className).not.toContain('ring-2');
	});
});
