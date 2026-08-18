/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import SettingsModal from '$lib/components/SettingsModal.svelte';
import { updateProviderSchema, testProviderSchema, setHardwareDeviceSchema } from '$lib/schemas';
import { validateForm } from '$lib/utils/form';

describe('SettingsModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
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
	});
});
