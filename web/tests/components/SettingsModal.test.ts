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

		// 3. INPAINTING TAB
		const inpaintTab = screen.getByRole('button', { name: /Inpainting/i });
		await fireEvent.click(inpaintTab);
		await tick();

		expect(screen.getByRole('heading', { name: /Inpainting & Masking/i })).toBeTruthy();
		expect(screen.queryByText('Reset Defaults')).toBeNull();

		// Change inpaint mode to Scaled (512x512)
		const scaledBtn = screen.getByText('Balanced (512x512)').closest('button');
		await fireEvent.click(scaledBtn!);
		await tick();

		// Reset Defaults appears
		const inpaintResetBtn = screen.getByText('Reset Defaults');
		expect(inpaintResetBtn).toBeTruthy();

		// Reset inpainting defaults
		await fireEvent.click(inpaintResetBtn);
		await tick();
		expect(screen.queryByText('Reset Defaults')).toBeNull();
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

		// Customized badge and Reset to Defaults button should now appear in the card
		expect(screen.getByText('Customized')).toBeTruthy();
		const resetInferenceBtn = screen.getByText('Reset to Defaults').closest('button');
		expect(resetInferenceBtn).toBeTruthy();

		// Clicking Reset to Defaults resets parameters back to defaults
		await fireEvent.click(resetInferenceBtn!);
		await tick();

		settings.subscribe((s) => (currentSettings = s))();
		expect(currentSettings.translationMaxTokens).toBe(DEFAULTS.translationMaxTokens);
		expect(currentSettings.translationReasoningEffort).toBe(DEFAULTS.translationReasoningEffort);
		expect(screen.queryByText('Customized')).toBeNull();
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
		expect(screen.getByRole('button', { name: /Inpainting & Masking/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /AI Translation Providers/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Hardware & Compute/i })).toBeTruthy();
		expect(screen.getByRole('button', { name: /About & Diagnostics/i })).toBeTruthy();
	});
});


