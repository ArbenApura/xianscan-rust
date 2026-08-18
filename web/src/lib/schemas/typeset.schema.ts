import { z } from 'zod';

export const typesetOutlineSchema = z.enum(['none', 'subtle', 'medium', 'heavy']);
export const typesetContrastSchema = z.enum(['standard', 'enhanced', 'maximum']);
export const typesetCasingSchema = z.enum(['preserve', 'uppercase', 'lowercase', 'titlecase']);
export const typesetAlignSchema = z.enum(['center', 'left', 'right']);

export const typesetOptionsSchema = z.object({
	fontFamily: z.string().optional(),
	fontSize: z.number().min(6).max(120).optional(),
	lineHeight: z.number().min(0.5).max(3.0).optional(),
	letterSpacing: z.number().min(-5).max(20).optional(),
	outline: typesetOutlineSchema.optional(),
	contrast: typesetContrastSchema.optional(),
	casing: typesetCasingSchema.optional(),
	align: typesetAlignSchema.optional(),
	autoFit: z.boolean().optional(),
	textColor: z.string().optional(),
	strokeColor: z.string().optional(),
	strokeWidth: z.number().min(0).max(20).optional(),
});

export const retypesetPageSchema = z.object({
	typesetOptions: typesetOptionsSchema.optional(),
});

export type TypesetOptions = z.infer<typeof typesetOptionsSchema>;
export type RetypesetPageInput = z.infer<typeof retypesetPageSchema>;
