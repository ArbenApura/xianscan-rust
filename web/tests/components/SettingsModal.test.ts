/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import SettingsModal from '$lib/components/SettingsModal.svelte';
import { updateProviderSchema, testProviderSchema, setHardwareDeviceSchema } from '$lib/schemas';
import { validateForm } from '$lib/utils/form';
import { settings, DEFAULTS } from '$lib/stores/settings';
import { toast } from 'svelte-sonner';
import { computeWork, computeToastIds, settingsHardwareInfo, providersSession, resetSettingsSession } from '$lib/stores/settings-ui';

describe('SettingsModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		settings.set({ ...DEFAULTS });
	});

	afterEach(() => {
		cleanup();
	});

	it('does not rewrite the stored casing or weight for a font that is not loaded yet (FEAT-009 Phase 4)', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		global.fetch = fetchMock;
		settings.set({ ...DEFAULTS, typesetFont: 'MyFont', typesetCasing: 'original', typesetFontWeight: '700' });

		render(SettingsModal, { props: { open: false } });
		await tick();
		await tick();

		expect(get(settings).typesetCasing).toBe('original');
		expect(get(settings).typesetFontWeight).toBe('700');
		const patches = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
		expect(patches).toHaveLength(0);
	});

	it('polls telemetry one request at a time, only on the compute tab (FEAT-009 Phase 5)', async () => {
		vi.useFakeTimers();
		try {
			let release: (() => void) | null = null;
			const telemetryCalls: number[] = [];
			const fetchMock = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).includes('/api/system/telemetry')) {
					telemetryCalls.push(Date.now());
					await new Promise<void>((r) => (release = r));
					return { ok: true, json: async () => ({ active_jobs: 0, queued_jobs: 0 }) };
				}
				return { ok: true, json: async () => ({}) };
			});
			global.fetch = fetchMock;

			render(SettingsModal, { props: { open: true, initialTab: 'compute' } });
			await tick();
			await vi.advanceTimersByTimeAsync(10_000);
			// THE FIRST REQUEST IS STILL OUTSTANDING: NO SECOND ONE WAS STARTED
			expect(telemetryCalls).toHaveLength(1);

			release!();
			await vi.advanceTimersByTimeAsync(2_100);
			expect(telemetryCalls).toHaveLength(2);

			// LEAVING THE COMPUTE TAB STOPS THE POLL
			await fireEvent.click(screen.getAllByText('General & Appearance')[0]);
			await tick();
			release!();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(telemetryCalls).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
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

		// OPEN MODEL SELECTION DIALOG
		const selectModelBtn = screen.getByTitle('Change active model');
		if (selectModelBtn) {
			await fireEvent.click(selectModelBtn);
			await tick();
		}

		// SELECT DIFFERENT MODEL -> SAVE PROVIDER BUTTON BECOMES ENABLED
		const reasonerModelTile = screen.getByText('deepseek-reasoner').closest('button');
		expect(reasonerModelTile?.className).toContain('w-full');
		expect(reasonerModelTile?.className).toContain('overflow-hidden');
		expect(reasonerModelTile?.className).toContain('rounded-lg');
		await fireEvent.click(reasonerModelTile!);
		await tick();
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(false);

		// REVERT MODEL BACK TO ORIGINAL -> SAVE PROVIDER BUTTON BECOMES DISABLED
		const chatModelTile = screen
			.getAllByText('deepseek-chat')
			.find((el) => el.closest('button'))
			?.closest('button');
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

		// Toggle Bubble Tilt Angle off (Live Pipeline Step Previews moved to General & Appearance, FEAT-010)
		expect(screen.queryByRole('switch', { name: /Live Pipeline Step Previews/i })).toBeNull();
		const tiltSwitch = screen.getByRole('switch', { name: /Bubble Tilt Angle/i });
		await fireEvent.click(tiltSwitch);
		await tick();

		// Reset Defaults should appear
		const typesetResetBtn = screen.getByText('Reset Defaults');
		expect(typesetResetBtn).toBeTruthy();

		// Reset typesetting defaults
		await fireEvent.click(typesetResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// Bubble Centering & Expansion switch is rendered and checked by default
		const centeringSwitch = screen.getByRole('switch', { name: /Bubble Centering & Expansion/i });
		expect(centeringSwitch).toBeTruthy();
		expect(centeringSwitch.getAttribute('aria-checked')).toBe('true');

		// Toggle Bubble Centering & Expansion off
		await fireEvent.click(centeringSwitch);
		await tick();
		expect(screen.getByText('Reset Defaults')).toBeTruthy();

		// Reset typesetting defaults restores centering switch
		await fireEvent.click(screen.getByText('Reset Defaults'));
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
		expect(centeringSwitch.getAttribute('aria-checked')).toBe('true');

		// 3. INPAINTING TAB
		const inpaintTab = screen.getByRole('button', { name: /Inpainting/i });
		await fireEvent.click(inpaintTab);
		await tick();

		expect(screen.getByRole('heading', { name: /Inpainting & Cleaning/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// WHITE BUBBLE SHRINKWRAP SWITCH IS RENDERED AND CHECKED BY DEFAULT
		const whiteInpaintSwitch = screen.getByRole('switch', { name: /White Bubble Shrinkwrap Cleaning/i });
		expect(whiteInpaintSwitch).toBeTruthy();
		expect(whiteInpaintSwitch.getAttribute('aria-checked')).toBe('true');

		// TOGGLE WHITE BUBBLE SHRINKWRAP OFF
		await fireEvent.click(whiteInpaintSwitch);
		await tick();
		expect(whiteInpaintSwitch.getAttribute('aria-checked')).toBe('false');

		// RESET DEFAULTS APPEARS
		let inpaintResetBtn = screen.getByText('Reset Defaults');
		expect(inpaintResetBtn).toBeTruthy();

		// RESET INPAINTING DEFAULTS
		await fireEvent.click(inpaintResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
		expect(whiteInpaintSwitch.getAttribute('aria-checked')).toBe('true');

		// CHANGE INPAINT MODE TO SCALED (512 PX TILES)
		const scaledBtn = screen.getByText('Balanced (512 px Tiles)').closest('button');
		await fireEvent.click(scaledBtn!);
		await tick();

		// RESET DEFAULTS APPEARS
		inpaintResetBtn = screen.getByText('Reset Defaults');
		expect(inpaintResetBtn).toBeTruthy();

		// RESET INPAINTING DEFAULTS
		await fireEvent.click(inpaintResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// INPAINT MASK MARGIN IS RENDERED WITH +3% DEFAULT
		expect(screen.getByText('Inpaint Mask Margin')).toBeTruthy();
		expect(screen.getAllByText('+3%').length).toBeGreaterThanOrEqual(1);

		// CLICK 6% PRESET
		const sixPctBtn = screen.getByText('6%').closest('button');
		expect(sixPctBtn).toBeTruthy();
		await fireEvent.click(sixPctBtn!);
		await tick();

		expect(get(settings).inpaintExpansionPct).toBe(0.06);
		expect(screen.getAllByText('+6%').length).toBeGreaterThanOrEqual(1);

		// RESET DEFAULTS APPEARS
		inpaintResetBtn = screen.getByText('Reset Defaults');
		expect(inpaintResetBtn).toBeTruthy();

		// RESET RESTORES TO +3% (0.03)
		await fireEvent.click(inpaintResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
		expect(get(settings).inpaintExpansionPct).toBe(0.03);
		expect(screen.getAllByText('+3%').length).toBeGreaterThanOrEqual(1);
	});

	it('renders Inference & Sampling card and changes parameters directly', async () => {
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
								availableModels: ['deepseek-chat'],
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

		// Check Inference & Sampling integrated card elements directly on page
		expect(screen.getByText('Inference & Sampling')).toBeTruthy();
		expect(screen.getByText('Max Output Tokens')).toBeTruthy();
		expect(screen.getByText('Reasoning Effort')).toBeTruthy();
		expect(screen.getByText('Sampling & Diversity')).toBeTruthy();
		expect(screen.getByText('Temperature')).toBeTruthy();
		expect(screen.getByText('Top-P')).toBeTruthy();
		expect(screen.queryByText('Optimal: 0.2')).toBeNull();

		// Initially at defaults, Customized badge should not be present
		expect(screen.queryByText('Customized')).toBeNull();

		// Click 8k token budget preset directly in card
		const eightKBtn = screen.getByText('8k').closest('button');
		expect(eightKBtn).toBeTruthy();
		await fireEvent.click(eightKBtn!);
		await tick();

		let currentSettings: any;
		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationMaxTokens).toBe(8192);

		// Click High reasoning effort pill directly in card
		const highReasoningBtn = screen.getByRole('button', { name: 'High' });
		expect(highReasoningBtn).toBeTruthy();
		await fireEvent.click(highReasoningBtn);
		await tick();

		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationReasoningEffort).toBe('high');

		// RESET TO DEFAULTS BUTTON SHOULD NOW APPEAR IN THE CARD
		const resetInferenceBtn = screen.getByText('Reset to Defaults').closest('button');
		expect(resetInferenceBtn).toBeTruthy();

		// CLICKING RESET TO DEFAULTS RESETS PARAMETERS BACK TO DEFAULTS
		await fireEvent.click(resetInferenceBtn!);
		await tick();

		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationMaxTokens).toBe(DEFAULTS.translationMaxTokens);
		expect(currentSettings.translationReasoningEffort).toBe(DEFAULTS.translationReasoningEffort);
		expect(currentSettings.translationTemperature).toBeNull();
		expect(currentSettings.translationTopP).toBeNull();
		expect(currentSettings.translationFrequencyPenalty).toBeNull();
		expect(currentSettings.translationPresencePenalty).toBeNull();
		expect(screen.queryByText('Reset to Defaults')).toBeNull();
	});

	it('configures custom reasoning effort and custom token budget via dedicated modals', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'deepseek',
								name: 'DeepSeek',
								isDefault: true,
								activeModel: 'deepseek-chat',
								availableModels: ['deepseek-chat', 'deepseek-reasoner'],
								baseUrl: 'https://api.deepseek.com',
								hasKey: true,
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

		await vi.waitFor(() => {
			expect(screen.getByText('Inference & Sampling')).toBeTruthy();
		});

		// OPEN CUSTOM REASONING MODAL VIA CUSTOM BUTTON (SECOND CUSTOM BUTTON)
		const customButtons = screen.getAllByRole('button', { name: /Custom/i });
		await fireEvent.click(customButtons[1]);
		await tick();

		expect(screen.getByText('Custom Reasoning Effort')).toBeTruthy();

		// TYPE IN CUSTOM REASONING INPUT (NO SUGGESTIONS IN MODAL AS PER REQUIREMENT)
		const reasoningInput = screen.getByLabelText('Reasoning Tier or Budget') as HTMLInputElement;
		await fireEvent.input(reasoningInput, { target: { value: 'budget:4096' } });
		await tick();

		// SUBMIT EFFORT
		const setEffortBtn = screen.getByRole('button', { name: 'Set Effort' });
		await fireEvent.click(setEffortBtn);
		await tick();

		let currentSettings: any;
		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationReasoningEffort).toBe('custom:budget:4096');

		// OPEN CUSTOM TOKENS MODAL VIA FIRST CUSTOM BUTTON (TOKENS ROW)
		const tokensCustomBtn = screen.getAllByRole('button', { name: /Custom/i })[0];
		await fireEvent.click(tokensCustomBtn);
		await tick();

		expect(screen.getByText('Custom Token Budget')).toBeTruthy();

		// CLICK QUICK BUDGET CHIP 12,288
		const budgetTokenChip = screen.getByRole('button', { name: '12,288' });
		await fireEvent.click(budgetTokenChip);
		await tick();

		// SUBMIT TOKENS
		const setTokensBtn = screen.getByRole('button', { name: 'Set Tokens' });
		await fireEvent.click(setTokensBtn);
		await tick();

		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationMaxTokens).toBe(12288);
	});

	it('treats custom endpoint models as regular without custom badges and allows model deletion', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'custom',
								name: 'Custom (OpenAI-Compatible)',
								isDefault: true,
								activeModel: 'deepseek-v4-pro',
								availableModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
								baseUrl: 'http://localhost:8000/v1',
								hasKey: false,
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

		await vi.waitFor(() => {
			expect(screen.getByTitle('Change active model')).toBeTruthy();
		});

		// OPEN SELECT MODEL MODAL
		const selectModelBtn = screen.getByTitle('Change active model');
		await fireEvent.click(selectModelBtn);
		await tick();

		// SHOULD DISPLAY BOTH MODELS
		expect(screen.getByText('deepseek-v4-flash')).toBeTruthy();
		expect(screen.getAllByText('deepseek-v4-pro').length).toBeGreaterThan(0);

		// SHOULD NOT HAVE "custom" BADGE ON EITHER MODEL IN CUSTOM ENDPOINT
		const customBadges = screen.queryAllByText('custom');
		expect(customBadges.length).toBe(0);

		// DELETION SHOULD BE AVAILABLE FOR DEEPSEEK-V4-FLASH AND V4-PRO
		const removeFlashBtn = screen.getByTitle('Remove model "deepseek-v4-flash"');
		expect(removeFlashBtn).toBeTruthy();

		const removeProBtn = screen.getByTitle('Remove model "deepseek-v4-pro"');
		expect(removeProBtn).toBeTruthy();

		// CLICK REMOVE ON FLASH
		await fireEvent.click(removeFlashBtn);
		await tick();

		// DEEPSEEK-V4-FLASH SHOULD BE REMOVED FROM LIST
		expect(screen.queryByTitle('Remove model "deepseek-v4-flash"')).toBeNull();
	});

	it('renders persistent AI guide note and records dismissal in localStorage', async () => {
		const localStorageMap = new Map<string, string>();
		const storageMock = {
			getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
			setItem: vi.fn((key: string, val: string) => {
				localStorageMap.set(key, val);
			}),
			removeItem: vi.fn((key: string) => {
				localStorageMap.delete(key);
			}),
			clear: vi.fn(() => {
				localStorageMap.clear();
			}),
		};
		vi.stubGlobal('localStorage', storageMock);

		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'deepseek',
								name: 'DeepSeek',
								isDefault: true,
								activeModel: 'deepseek-chat',
								availableModels: ['deepseek-chat'],
								baseUrl: 'https://api.deepseek.com',
								hasKey: true,
							},
						],
					}),
				};
			}
			return { ok: true, json: async () => ({}) };
		});
		global.fetch = fetchMock;

		// FIRST RENDER WITH NO STORED DISMISSAL
		const { unmount } = render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'ai',
			},
		});
		await tick();

		// EXPECT GETTING STARTED GUIDE NOTE TO BE PRESENT
		expect(screen.getByText('Getting Started')).toBeTruthy();
		const dismissBtn = screen.getByRole('button', { name: 'Dismiss guide' });
		expect(dismissBtn).toBeTruthy();

		// CLICK DISMISS
		await fireEvent.click(dismissBtn);
		await tick();

		// VERIFY NOTE DISAPPEARS AND DISMISSAL FLAG IS PERSISTED
		await vi.waitFor(() => {
			expect(screen.queryByText('Getting Started')).toBeNull();
		});
		expect(storageMock.setItem).toHaveBeenCalledWith('xianscan:dismissed_ai_guide_note', 'true');

		unmount();

		// RE-RENDER WITH DISMISSAL ALREADY PERSISTED IN STORAGE
		render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'ai',
			},
		});
		await tick();

		// SHOULD NOT RENDER GUIDE NOTE ON SUBSEQUENT MOUNT
		expect(screen.queryByText('Getting Started')).toBeNull();

		vi.unstubAllGlobals();
	});

	it('indexes and finds newly added inference and sampling parameters in global search', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'ollama',
								name: 'Ollama (Local)',
								isDefault: true,
								activeModel: 'qwen3.5:9b',
								availableModels: ['qwen3.5:9b'],
								baseUrl: 'http://localhost:11434/v1',
								hasKey: false,
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
				initialTab: 'appearance',
			},
		});
		await tick();

		// FIND GLOBAL SEARCH INPUT IN SETTINGS MODAL
		const searchInput = screen.getByPlaceholderText('Search settings...') as HTMLInputElement;
		expect(searchInput).toBeTruthy();

		// SEARCH FOR TEMPERATURE
		searchInput.value = 'temperature';
		await fireEvent.input(searchInput);
		await tick();

		// EXPECT INFERENCE AND SAMPLING SEARCH RESULTS TO APPEAR
		const resultItem = screen.getByRole('button', { name: /Sampling Diversity/i });
		expect(resultItem).toBeTruthy();

		// CLICK SEARCH RESULT ITEM
		await fireEvent.click(resultItem);
		await tick();

		// JUMP SHOULD SWITCH TO AI PROVIDERS CATEGORY
		expect(screen.getByText('Inference & Sampling')).toBeTruthy();
	});

	it('renders canonical 6 navigation tabs without prompt directives tab', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'deepseek',
								name: 'DeepSeek',
								isDefault: true,
								activeModel: 'deepseek-chat',
								availableModels: ['deepseek-chat'],
								baseUrl: 'https://api.deepseek.com',
								hasKey: true,
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
				initialTab: 'providers',
			},
		});
		await tick();

		// PROMPT DIRECTIVES TAB HAS BEEN DECENTRALIZED TO PER-BOOK MODAL
		expect(screen.queryByRole('button', { name: /Prompt Style & Directives/i })).toBeNull();

		// 6 CANONICAL CATEGORIES ARE PRESENT
		expect(screen.getByRole('button', { name: /General & Appearance/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Typesetting & Lettering/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Inpainting & Cleaning/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /AI Translation Providers/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Hardware & Compute/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /About & Diagnostics/i })).toBeTruthy();
	});

	it('preselects the active default provider on load instead of falling back to ollama', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							{
								id: 'ollama',
								name: 'Ollama Local',
								isDefault: false,
								activeModel: 'qwen2.5:7b',
								availableModels: ['qwen2.5:7b'],
								baseUrl: 'http://localhost:11434/v1',
								hasKey: false,
							},
							{
								id: 'gemini',
								name: 'Google Gemini',
								isDefault: true,
								activeModel: 'gemini-2.5-flash',
								availableModels: ['gemini-2.5-flash'],
								baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
								hasKey: true,
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
				initialTab: 'providers',
			},
		});
		await tick();

		await vi.waitFor(() => {
			const trigger = screen.getByRole('button', { name: /Google Gemini/i });
			expect(trigger).toBeTruthy();
			expect(trigger.textContent).toContain('gemini');
		});
	});

	it('shows Live Pipeline Step Previews under General & Appearance and resets it there (FEAT-010)', async () => {
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ providers: [] }) }));
		settings.set({ ...DEFAULTS });
		render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
		await tick();
		const live = screen.getByRole('switch', { name: /Live Pipeline Step Previews/i });
		await fireEvent.click(live);
		await tick();
		expect(get(settings).livePipelinePreview).toBe(false);
		await fireEvent.click(screen.getByText('Reset Defaults'));
		await tick();
		expect(get(settings).livePipelinePreview).toBe(true);
	});

	it('dispatches close event when clicking the modal close button or backdrop', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		global.fetch = fetchMock;

		const closeHandler = vi.fn();
		const { component } = render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'appearance',
			},
		});
		component.$on('close', closeHandler);
		await tick();

		// CLICK CLOSE BUTTON IN MODAL HEADER
		const closeButton = screen.getByRole('button', { name: 'Close' });
		await fireEvent.click(closeButton);
		await tick();

		expect(closeHandler).toHaveBeenCalledTimes(1);
	});

	it('dispatches close event when pressing Escape key', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		global.fetch = fetchMock;

		const closeHandler = vi.fn();
		const { component } = render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'appearance',
			},
		});
		component.$on('close', closeHandler);
		await tick();

		const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
		window.dispatchEvent(escEvent);
		await tick();

		expect(closeHandler).toHaveBeenCalledTimes(1);
	});

	it('dispatches both close and openTour events when starting tour from About tab', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		global.fetch = fetchMock;

		const closeHandler = vi.fn();
		const tourHandler = vi.fn();
		const { component } = render(SettingsModal, {
			props: {
				open: true,
				initialTab: 'about',
			},
		});
		component.$on('close', closeHandler);
		component.$on('openTour', tourHandler);
		await tick();

		const startTourButton = screen.getByRole('button', { name: /Replay Tour/i });
		await fireEvent.click(startTourButton);
		await tick();

		expect(closeHandler).toHaveBeenCalledTimes(1);
		expect(tourHandler).toHaveBeenCalledTimes(1);
	});
});

// -- TAB REMOUNT REGRESSIONS (SEARCH ESCAPE, JUMP RETRY, STATE THAT MUST SURVIVE A TAB SWITCH) -- //

const TWO_PROVIDERS = [
	{
		id: 'deepseek',
		name: 'DeepSeek',
		isDefault: true,
		activeModel: 'deepseek-chat',
		availableModels: ['deepseek-chat'],
		baseUrl: 'https://api.deepseek.com',
		hasKey: true,
	},
	{
		id: 'gemini',
		name: 'Google Gemini',
		isDefault: false,
		activeModel: 'gemini-2.5-flash',
		availableModels: ['gemini-2.5-flash'],
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
		hasKey: true,
	},
];

function cpuHardware(reloading: boolean) {
	return {
		device_label: 'CPU Multi-threaded',
		active_provider: 'CPUExecutionProvider',
		providers: ['CPUExecutionProvider'],
		available_providers: ['CPUExecutionProvider'],
		has_cuda: false,
		has_directml: false,
		has_coreml: false,
		reloading,
	};
}

// THE STATUS PILL ALSO SHOWS THE DEVICE LABEL ONCE HARDWARE HAS LOADED; PICK THE DEVICE CARD BUTTON
function cpuCard(): HTMLElement {
	return screen
		.getAllByText('CPU Multi-threaded')
		.map((el) => el.closest('button'))
		.find((b): b is HTMLButtonElement => !!b)!;
}

async function searchAndJump(query: string, label: RegExp) {
	const input = screen.getByPlaceholderText('Search settings...') as HTMLInputElement;
	input.value = query;
	await fireEvent.input(input);
	await tick();
	await fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('SettingsModal tab remount regressions', () => {
	const originalScrollIntoView = (HTMLElement.prototype as any).scrollIntoView;
	let scrolled: string[] = [];

	beforeEach(() => {
		vi.restoreAllMocks();
		settings.set({ ...DEFAULTS });
		resetSettingsSession();
		computeWork.set({ switchingDevice: null, settingVramLimit: false });
		computeToastIds.switching = null;
		computeToastIds.vram = null;
		settingsHardwareInfo.set(null);
		scrolled = [];
		(HTMLElement.prototype as any).scrollIntoView = function (this: HTMLElement) {
			scrolled.push(this.id);
		};
	});

	afterEach(() => {
		cleanup();
		(HTMLElement.prototype as any).scrollIntoView = originalScrollIntoView;
	});

	it('lets Escape in the search box close Settings unless the results popover is showing', async () => {
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		const closeHandler = vi.fn();
		const { component } = render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
		component.$on('close', closeHandler);
		await tick();

		const input = screen.getByPlaceholderText('Search settings...') as HTMLInputElement;
		input.value = 'theme';
		await fireEvent.input(input);
		await tick();
		expect(screen.getByRole('button', { name: 'Dismiss search results' })).toBeTruthy();

		// FIRST ESCAPE ONLY HIDES THE POPOVER (THE KEY IS CONSUMED, SO THE MODAL STACK IGNORES IT)
		const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		input.dispatchEvent(first);
		await tick();
		expect(first.defaultPrevented).toBe(true);
		expect(closeHandler).not.toHaveBeenCalled();

		// SECOND ESCAPE (POPOVER HIDDEN) REACHES THE MODAL STACK AND CLOSES SETTINGS
		await fireEvent.keyDown(input, { key: 'Escape' });
		await tick();
		expect(closeHandler).toHaveBeenCalledTimes(1);
	});

	it('closes Settings on Escape from an empty focused search box', async () => {
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		const closeHandler = vi.fn();
		const { component } = render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
		component.$on('close', closeHandler);
		await tick();

		const input = screen.getByPlaceholderText('Search settings...') as HTMLInputElement;
		await fireEvent.focus(input);
		await fireEvent.keyDown(input, { key: 'Escape' });
		await tick();
		expect(closeHandler).toHaveBeenCalledTimes(1);
	});

	it('scrolls to a provider target that renders only after the providers fetch', async () => {
		vi.useFakeTimers();
		try {
			let resolveProviders: (() => void) | null = null;
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).endsWith('/api/system/providers')) {
					await new Promise<void>((r) => (resolveProviders = r));
					return { ok: true, json: async () => ({ providers: TWO_PROVIDERS }) };
				}
				return { ok: true, json: async () => ({}) };
			});

			render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
			await tick();
			await searchAndJump('api key', /API Key Configuration/i);
			await vi.advanceTimersByTimeAsync(300);
			expect(document.getElementById('setting-api-key')).toBeNull();
			expect(scrolled).not.toContain('setting-api-key');

			resolveProviders!();
			await vi.advanceTimersByTimeAsync(100);
			expect(document.getElementById('setting-api-key')).toBeTruthy();
			expect(scrolled).toContain('setting-api-key');
		} finally {
			vi.useRealTimers();
		}
	});

	it('re-scrolls an inference target once the provider card above it has loaded', async () => {
		vi.useFakeTimers();
		try {
			let resolveProviders: (() => void) | null = null;
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).endsWith('/api/system/providers')) {
					await new Promise<void>((r) => (resolveProviders = r));
					return { ok: true, json: async () => ({ providers: TWO_PROVIDERS }) };
				}
				return { ok: true, json: async () => ({}) };
			});

			render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
			await tick();
			await searchAndJump('temperature', /Sampling Diversity/i);
			await vi.advanceTimersByTimeAsync(200);
			expect(scrolled.filter((id) => id === 'setting-sampling-diversity')).toHaveLength(1);

			resolveProviders!();
			await vi.advanceTimersByTimeAsync(100);
			expect(scrolled.filter((id) => id === 'setting-sampling-diversity')).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('gives up on a jump target that never renders without leaving a retry loop running', async () => {
		vi.useFakeTimers();
		try {
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).endsWith('/api/system/providers')) {
					await new Promise<void>(() => {});
				}
				return { ok: true, json: async () => ({}) };
			});

			render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
			await tick();
			await searchAndJump('api key', /API Key Configuration/i);
			await vi.advanceTimersByTimeAsync(2_000);
			expect(scrolled).toHaveLength(0);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps the selected provider and its Verified result across tab switches, and resets them on reopen', async () => {
		global.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (String(url).includes('/api/system/providers/test')) {
				return { ok: true, json: async () => ({ ok: true, message: 'Connection verified', latencyMs: 42 }) };
			}
			if (String(url).includes('/api/system/providers')) {
				return { ok: true, json: async () => ({ providers: TWO_PROVIDERS }) };
			}
			return { ok: true, json: async () => ({}) };
		});

		const { component } = render(SettingsModal, { props: { open: true, initialTab: 'providers' } });
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /DeepSeek/i })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /DeepSeek/i }));
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /Google Gemini/i }));
		await tick();
		await fireEvent.click(screen.getByText('Test Connection').closest('button')!);
		await vi.waitFor(() => expect(screen.getByText('Verified')).toBeTruthy());

		// LEAVE AND COME BACK: THE TAB REMOUNTS BUT KEEPS THE PICK AND THE RESULT
		await fireEvent.click(screen.getAllByText('General & Appearance')[0]);
		await tick();
		expect(screen.queryByText('Verified')).toBeNull();
		await fireEvent.click(screen.getAllByText('AI Translation Providers')[0]);
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /Google Gemini/i })).toBeTruthy());
		expect(screen.getByText('Verified')).toBeTruthy();

		// A FRESH OPEN STARTS FROM THE DEFAULT PROVIDER WITH NO STALE RESULT
		// (THE HARNESS NEVER FINISHES OUTROS, SO THE REOPEN REUSES THE MOUNTED TAB; ASSERT THE SESSION STATE IT DRIVES)
		component.$set({ open: false });
		await tick();
		component.$set({ open: true, initialTab: 'providers' });
		await vi.waitFor(() => expect(get(providersSession).selectedProviderId).toBe('deepseek'));
		expect(get(providersSession).testResult).toBeNull();
	});

	it('starts a freshly mounted Settings on the default provider with no stale test result', async () => {
		global.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (String(url).includes('/api/system/providers')) {
				return { ok: true, json: async () => ({ providers: TWO_PROVIDERS }) };
			}
			return { ok: true, json: async () => ({}) };
		});
		providersSession.set({ selectedProviderId: 'gemini', testResult: { ok: true, message: 'stale', latencyMs: 1 } });

		render(SettingsModal, { props: { open: true, initialTab: 'providers' } });
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /DeepSeek/i })).toBeTruthy());
		expect(screen.queryByText('Verified')).toBeNull();
	});

	it('keeps a device switch busy across a tab switch without dismissing its loading toast', async () => {
		let reloading = false;
		let posts = 0;
		global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (String(url).includes('/api/system/hardware') && init?.method === 'POST') {
				posts += 1;
				reloading = true;
				return { ok: true, json: async () => cpuHardware(true) };
			}
			if (String(url).includes('/api/system/hardware')) {
				return { ok: true, json: async () => cpuHardware(reloading) };
			}
			if (String(url).includes('/api/system/providers')) {
				return { ok: true, json: async () => ({ providers: [] }) };
			}
			return { ok: true, json: async () => ({}) };
		});
		const dismissSpy = vi.spyOn(toast, 'dismiss');

		render(SettingsModal, { props: { open: true, initialTab: 'compute' } });
		await vi.waitFor(() => expect(get(settingsHardwareInfo)).toBeTruthy());
		await tick();

		await fireEvent.click(cpuCard());
		await vi.waitFor(() => expect(screen.getByText('Reloading models…')).toBeTruthy());
		const loadingToast = computeToastIds.switching;
		expect(loadingToast).not.toBeNull();
		expect(get(computeWork).switchingDevice).toBe('cpu');

		// LEAVING THE TAB MUST NOT DISMISS THE TOAST OR FORGET THE SWITCH
		await fireEvent.click(screen.getAllByText('General & Appearance')[0]);
		await tick();
		expect(dismissSpy).not.toHaveBeenCalledWith(loadingToast);
		expect(get(computeWork).switchingDevice).toBe('cpu');

		// BACK ON THE TAB: STILL BUSY, SO A SECOND SWITCH CANNOT FIRE
		await fireEvent.click(screen.getAllByText('Hardware & Compute')[0]);
		await tick();
		expect(screen.getByText('Reloading models…')).toBeTruthy();
		await fireEvent.click(cpuCard());
		await tick();
		expect(posts).toBe(1);

		// THE RELOAD FINISHES WHILE THE TAB IS AWAY; THE SHELL STILL GETS THE FRESH (NOT RELOADING) STATUS
		await fireEvent.click(screen.getAllByText('General & Appearance')[0]);
		await tick();
		reloading = false;
		await vi.waitFor(() => expect(get(computeWork).switchingDevice).toBeNull(), { timeout: 2_000 });
		expect(dismissSpy).toHaveBeenCalledWith(loadingToast);
		expect(get(settingsHardwareInfo)?.reloading).toBe(false);
		await fireEvent.click(screen.getAllByText('Hardware & Compute')[0]);
		await tick();
		expect(screen.queryByText('Reloading models…')).toBeNull();
	});

	it('lands on the device section when the VRAM limit is not shown (CPU-only machine)', async () => {
		vi.useFakeTimers();
		try {
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).endsWith('/api/system/hardware')) return { ok: true, json: async () => cpuHardware(false) };
				return { ok: true, json: async () => ({}) };
			});

			render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
			await tick();
			await searchAndJump('vram', /GPU VRAM Allocation/i);
			await vi.advanceTimersByTimeAsync(1_700);
			expect(document.getElementById('setting-vram-limit')).toBeNull();
			expect(scrolled).toContain('setting-compute-device');
			expect(document.getElementById('setting-compute-device')!.className).toContain('ring-2');
		} finally {
			vi.useRealTimers();
		}
	});

	it('lands on the provider section when the API key field is hidden (local provider)', async () => {
		vi.useFakeTimers();
		try {
			const local = [{ id: 'ollama', name: 'Ollama', isDefault: true, activeModel: 'qwen3', availableModels: ['qwen3'], baseUrl: 'http://127.0.0.1:11434/v1', hasKey: false }];
			global.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (String(url).endsWith('/api/system/providers')) return { ok: true, json: async () => ({ providers: local }) };
				return { ok: true, json: async () => ({}) };
			});

			render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
			await tick();
			await searchAndJump('api key', /API Key Configuration/i);
			await vi.advanceTimersByTimeAsync(300);
			expect(document.getElementById('setting-api-key')).toBeNull();
			expect(scrolled).toContain('setting-providers-hub');
			expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('finds the script font, preview, network and inpaint settings by their new keywords', async () => {
		global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
		render(SettingsModal, { props: { open: true, initialTab: 'appearance' } });
		await tick();

		const input = screen.getByPlaceholderText('Search settings...') as HTMLInputElement;
		const cases: [string, RegExp][] = [
			['rtl', /Fonts \(dialogue and accent font per script\)/i],
			['technique', /Accent font/i],
			['exact', /Live Speech Bubble Preview/i],
			['restart', /LAN Access/i],
			['print-token', /Access Token & Device Pairing/i],
			['tiles', /Inpainting Strategy/i],
		];
		for (const [query, label] of cases) {
			input.value = query;
			await fireEvent.input(input);
			await tick();
			expect(screen.getByRole('button', { name: label })).toBeTruthy();
		}
	});
});
