import { z } from 'zod';

export const updateProviderSchema = z.object({
	id: z.string().min(1, 'Provider ID is required'),
	apiKey: z.string().optional(),
	clearApiKey: z.boolean().optional(),
	baseUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
	activeModel: z.string().optional(),
	availableModels: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
	isDefault: z.boolean().optional(),
});

export const testProviderSchema = z.object({
	id: z.string().min(1, 'Provider ID is required'),
	apiKey: z.string().optional(),
	baseUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
	model: z.string().optional(),
	temperature: z.number().min(0).max(1).nullable().optional(),
	topP: z.number().min(0).max(1).nullable().optional(),
	reasoningEffort: z.string().optional(),
	frequencyPenalty: z.number().min(0).max(2).nullable().optional(),
	presencePenalty: z.number().min(0).max(2).nullable().optional(),
});

export const setHardwareDeviceSchema = z.object({
	device: z.enum(['auto', 'cpu', 'cuda', 'dml', 'directml', 'coreml']),
	vram_limit_mb: z.number().int().nonnegative().nullable().optional(),
});

export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type TestProviderInput = z.infer<typeof testProviderSchema>;
export type SetHardwareDeviceInput = z.infer<typeof setHardwareDeviceSchema>;
