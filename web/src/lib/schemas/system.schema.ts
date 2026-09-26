import { z } from 'zod';

// PROVIDER BASE URLS: HTTP(S) ONLY, NO EMBEDDED CREDENTIALS, NO FRAGMENT
export const providerBaseUrlSchema = z
	.string()
	.trim()
	.url('Must be a valid URL')
	.refine((raw) => {
		try {
			const u = new URL(raw);
			return (
				(u.protocol === 'http:' || u.protocol === 'https:') &&
				u.username === '' &&
				u.password === '' &&
				u.hash === '' &&
				!raw.includes('#')
			);
		} catch {
			return false;
		}
	}, 'Base URL must be http(s) without credentials or a fragment');

export const updateProviderSchema = z.object({
	id: z.string().min(1, 'Provider ID is required'),
	apiKey: z.string().optional(),
	clearApiKey: z.boolean().optional(),
	baseUrl: providerBaseUrlSchema.or(z.literal('')).optional(),
	activeModel: z.string().optional(),
	availableModels: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
	isDefault: z.boolean().optional(),
});

export const testProviderSchema = z.object({
	id: z.string().min(1, 'Provider ID is required'),
	apiKey: z.string().optional(),
	baseUrl: providerBaseUrlSchema.or(z.literal('')).optional(),
	model: z.string().optional(),
	temperature: z.number().min(0).max(1).nullable().optional(),
	topP: z.number().min(0).max(1).nullable().optional(),
	reasoningEffort: z.string().optional(),
	frequencyPenalty: z.number().min(0).max(2).nullable().optional(),
	presencePenalty: z.number().min(0).max(2).nullable().optional(),
});

export const fetchModelsSchema = z.object({
	id: z.string().min(1, 'Provider ID is required'),
	apiKey: z.string().optional(),
	baseUrl: providerBaseUrlSchema.or(z.literal('')).optional(),
});

export const setHardwareDeviceSchema = z.object({
	device: z.enum(['auto', 'cpu', 'cuda', 'dml', 'directml', 'coreml']),
	vram_limit_mb: z.number().int().nonnegative().nullable().optional(),
});

export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type TestProviderInput = z.infer<typeof testProviderSchema>;
export type FetchModelsInput = z.infer<typeof fetchModelsSchema>;
export type SetHardwareDeviceInput = z.infer<typeof setHardwareDeviceSchema>;
