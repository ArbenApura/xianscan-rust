/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import ProvidersTab from '$lib/components/settings/ProvidersTab.svelte';
import { settings, DEFAULTS } from '$lib/stores/settings';
import { providersSession, resetSettingsSession } from '$lib/stores/settings-ui';

const PROVIDERS = [
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
];

describe('ProvidersTab', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		global.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (String(url).includes('/api/system/providers')) {
				return { ok: true, json: async () => ({ providers: PROVIDERS }) };
			}
			return { ok: true, json: async () => ({}) };
		});
		settings.set({ ...DEFAULTS });
		resetSettingsSession();
	});

	afterEach(() => cleanup());

	it('loads the providers on mount and renders the provider card and the inference card', async () => {
		render(ProvidersTab);
		expect(screen.getByRole('heading', { name: /AI Translation Provider/i })).toBeTruthy();
		await vi.waitFor(() => expect(screen.getByText('Save Provider')).toBeTruthy());
		expect(screen.getByText('Inference & Sampling')).toBeTruthy();
	});

	it('writes translationMaxTokens when a token budget preset is clicked', async () => {
		render(ProvidersTab);
		await fireEvent.click(screen.getByText('8k').closest('button')!);
		await tick();
		expect(get(settings).translationMaxTokens).toBe(8192);
	});

	it('opens the model dialog and selects a model into the draft', async () => {
		render(ProvidersTab);
		await vi.waitFor(() => expect(screen.getByTitle('Change active model')).toBeTruthy());
		await fireEvent.click(screen.getByTitle('Change active model'));
		await tick();
		expect(screen.getByText('Select Model')).toBeTruthy();
		await fireEvent.click(screen.getByText('deepseek-reasoner').closest('button')!);
		await tick();
		// A CHANGED MODEL DRAFT ENABLES SAVING
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(false);
	});

	it('keeps the picked provider and the test result across a remount but drops the unsaved drafts', async () => {
		global.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (String(url).includes('/api/system/providers/test')) {
				return { ok: true, json: async () => ({ ok: true, message: 'Connection verified', latencyMs: 12 }) };
			}
			if (String(url).includes('/api/system/providers')) {
				return {
					ok: true,
					json: async () => ({
						providers: [
							...PROVIDERS,
							{ ...PROVIDERS[0], id: 'groq', name: 'Groq Cloud', isDefault: false, activeModel: 'llama', availableModels: ['llama'] },
						],
					}),
				};
			}
			return { ok: true, json: async () => ({}) };
		});

		const first = render(ProvidersTab);
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /DeepSeek/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /DeepSeek/i }));
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /Groq Cloud/i }));
		await tick();
		await fireEvent.click(screen.getByText('Test Connection').closest('button')!);
		await vi.waitFor(() => expect(screen.getByText('Verified')).toBeTruthy());
		expect(get(providersSession).selectedProviderId).toBe('groq');

		first.unmount();
		render(ProvidersTab);
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /Groq Cloud/i })).toBeTruthy());
		expect(screen.getByText('Verified')).toBeTruthy();
		// NO DRAFT SURVIVED, SO THERE IS NOTHING TO SAVE
		expect(screen.getByText('Save Provider').closest('button')?.hasAttribute('disabled')).toBe(true);
	});
});
