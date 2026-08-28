/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import SettingsModal from '$lib/components/SettingsModal.svelte';
import { updateProviderSchema, testProviderSchema, setHardwareDeviceSchema } from '$lib/schemas';
import { validateForm } from '$lib/utils/form';
import { settings, DEFAULTS } from '$lib/stores/settings';

describe('SettingsModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => {
		cleanup();
	});

	it('renders settings modal with provider list and tab navigation', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'deepseek',
								name: 'DeepSeek',
								baseUrl: 'https://api.deepseek.com',
								activeModel: 'deepseek-chat',
								availableModels: ['deepseek-chat', 'deepseek-reasoner'],
								hasKey: true,
								maskedKey: 'sk-...1234',
								enabled: true,
								isDefault: true,
							},
						],
					}),
				};
			}
			if (url.includes('/api/system/hardware')) {
				return {
					ok: true,
					json: async () => ({
						device_label: 'DirectML (DML:0)',
						active_provider: 'DmlExecutionProvider',
						providers: ['DmlExecutionProvider', 'CPUExecutionProvider'],
						available_providers: ['DmlExecutionProvider', 'CPUExecutionProvider'],
						has_cuda: false,
						has_directml: true,
						has_coreml: false,
					}),
				};
			}
			return { ok: true, json: async () => ({}) };
		});
		global.fetch = fetchMock;

		render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'ai',
			},
		});

		await tick();
		expect(screen.getByText('AI Translation Provider')).toBeTruthy();
	});

	it('validates provider schemas for updating and testing connection', () => {
		const updatePayload = {
			id: 'deepseek',
			apiKey: 'sk-test-key-12345',
			baseUrl: 'https://api.deepseek.com',
			activeModel: 'deepseek-chat',
			enabled: true,
		};
		const updateRes = validateForm(updateProviderSchema, updatePayload);
		expect(updateRes.success).toBe(true);
		expect(updateRes.data?.id).toBe('deepseek');

		const testPayload = {
			id: 'deepseek',
			apiKey: 'sk-test-key-12345',
			model: 'deepseek-chat',
		};
		const testRes = validateForm(testProviderSchema, testPayload);
		expect(testRes.success).toBe(true);
		expect(testRes.data?.model).toBe('deepseek-chat');

		const hwPayload = {
			device: 'directml',
		};
		const hwRes = validateForm(setHardwareDeviceSchema, hwPayload);
		expect(hwRes.success).toBe(true);
		expect(hwRes.data?.device).toBe('directml');

		const coremlPayload = {
			device: 'coreml',
		};
		const coremlRes = validateForm(setHardwareDeviceSchema, coremlPayload);
		expect(coremlRes.success).toBe(true);
		expect(coremlRes.data?.device).toBe('coreml');
	});

	it('shows a "Reloading models" indicator and disables cards while switching device', async () => {
		let reloadCalls = 0;
		const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.includes('/api/system/providers')) {
				return { ok: true, json: async () => ({ providers: [] }) };
			}
			if (url.includes('/api/system/hardware') && init?.method === 'POST') {
				return {
					ok: true,
					json: async () => ({
						device_label: 'CPU Multi-threaded',
						active_provider: 'CPUExecutionProvider',
						providers: ['CPUExecutionProvider'],
						available_providers: ['CPUExecutionProvider'],
						has_cuda: false,
						has_directml: false,
						has_coreml: false,
						reloading: true,
					}),
				};
			}
			if (url.includes('/api/system/hardware') && (!init || init.method === 'GET')) {
				reloadCalls += 1;
				// FIRST POLL STILL LOADING; SECOND REPORTS READY SO THE SPINNER CLEARS.
				const stillReloading = reloadCalls < 2;
				return {
					ok: true,
					json: async () => ({
						device_label: 'CPU Multi-threaded',
						active_provider: 'CPUExecutionProvider',
						providers: ['CPUExecutionProvider'],
						available_providers: ['CPUExecutionProvider'],
						has_cuda: false,
						has_directml: false,
						has_coreml: false,
						reloading: stillReloading,
					}),
				};
			}
			return { ok: true, json: async () => ({}) };
		});
		global.fetch = fetchMock;

		render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'compute',
			},
		});
		await tick();

		const cpuButtons = screen.getAllByText('CPU Multi-threaded');
		const cpuButton = cpuButtons[0].closest('button');
		await fireEvent.click(cpuButton!);
		await tick();

		// THE STATUS PILL SHOULD SHOW THE RELOADING INDICATOR RIGHT AFTER THE SWITCH.
		expect(screen.getByText('Reloading models…')).toBeTruthy();
		// OTHER DEVICE CARDS ARE DISABLED WHILE SWITCHING.
		const dmlCards = screen.getAllByText('DirectML (Dedicated GPU)');
		const dmlCard = dmlCards[0].closest('button');
		expect(dmlCard?.hasAttribute('disabled')).toBe(true);

		// ADVANCE TIMERS PAST THE 300MS POLL DELAY; SECOND POLL REPORTS READY.
		await new Promise((r) => setTimeout(r, 700));
		await tick();

		expect(screen.queryByText('Reloading models…')).toBeNull();
	});

	it('only enables Save Provider button when changes are made to provider', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'deepseek',
								name: 'DeepSeek',
								baseUrl: 'https://api.deepseek.com',
								activeModel: 'deepseek-chat',
								availableModels: ['deepseek-chat', 'deepseek-reasoner'],
								hasKey: true,
								maskedKey: 'sk-...1234',
								enabled: true,
								isDefault: true,
							},
						],
					}),
				};
			}
			return { ok: true, json: async () => ({}) };
		});
		global.fetch = fetchMock;

		render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'ai',
			},
		});
		await tick();

		// WAIT UNTIL PROVIDERS ARE LOADED FROM API
		await vi.waitFor(() => {
			expect(screen.getByText('Save Provider')).toBeTruthy();
		});

		// INITIAL STATE: NO CHANGES MADE YET -> SAVE PROVIDER BUTTON SHOULD BE DISABLED
		const saveButton = screen.getByText('Save Provider').closest('button');
		expect(saveButton?.hasAttribute('disabled')).toBe(true);

		// CHANGE BASE URL -> SAVE PROVIDER BUTTON BECOMES ENABLED
		const urlInput = screen.getByLabelText(/Endpoint Base URL/i) as HTMLInputElement;
		await fireEvent.input(urlInput, { target: { value: 'https://api.deepseek.com/v2' } });
		await tick();
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(false);

		// CLICK RESET DEFAULT BASE URL -> SAVE PROVIDER BUTTON BECOMES DISABLED AGAIN (MATCHES ORIGINAL)
		const resetBtn = screen.getByText('Reset Default').closest('button');
		if (resetBtn) {
			await fireEvent.click(resetBtn);
			await tick();
			expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(true);
		}

		// SELECT DIFFERENT MODEL -> SAVE PROVIDER BUTTON BECOMES ENABLED
		const reasonerModelTile = screen.getByText('deepseek-reasoner').closest('button');
		await fireEvent.click(reasonerModelTile!);
		await tick();
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(false);

		// REVERT MODEL BACK TO ORIGINAL -> SAVE PROVIDER BUTTON BECOMES DISABLED
		const chatModelTile = screen.getByText('deepseek-chat').closest('button');
		await fireEvent.click(chatModelTile!);
		await tick();
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(true);
	});

	it('conditionally displays and executes Reset Defaults in Appearance, Typesetting, and Inpainting tabs', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ({
			ok: true,
			json: async () => ({ providers: [] }),
		}));
		global.fetch = fetchMock;

		render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'appearance',
			},
		});
		await tick();

		// 1. GENERAL & APPEARANCE TAB
		expect(screen.getByRole('heading', { name: /General & Appearance/i })).toBeTruthy();
		// Initially at defaults, Reset Defaults button should not be rendered
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// Change theme to Dark
		const darkBtn = screen.getByText('Dark').closest('button');
		await fireEvent.click(darkBtn!);
		await tick();

		// Reset Defaults should appear
		const appearanceResetBtn = screen.getByText('Reset Defaults');
		expect(appearanceResetBtn).toBeTruthy();

		// Clicking Reset Defaults resets back and hides the button
		await fireEvent.click(appearanceResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// 2. TYPESETTING TAB
		const typesetTab = screen.getByRole('button', { name: /Typesetting/i });
		await fireEvent.click(typesetTab);
		await tick();

		expect(screen.getByRole('heading', { name: /Typesetting & Lettering Studio/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// 3. INPAINTING TAB
		const inpaintTab = screen.getByRole('button', { name: /Inpainting/i });
		await fireEvent.click(inpaintTab);
		await tick();

		expect(screen.getByRole('heading', { name: /Inpainting & Masking/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// Toggle Watermark
		const watermarkSwitch = screen.getByRole('switch', { name: /Chromatic Watermark Inpainting/i }) || screen.getAllByRole('switch')[0];
		await fireEvent.click(watermarkSwitch);
		await tick();

		// Reset Defaults appears
		const inpaintResetBtn = screen.getByText('Reset Defaults');
		expect(inpaintResetBtn).toBeTruthy();

		// Reset inpainting defaults
		await fireEvent.click(inpaintResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
	});
});
