import { z } from 'zod';
import { SCRIPT_FONT_SLOTS, type ScriptFontSlot } from '$lib/typeset-scripts';

export const typesetOutlineSchema = z.enum(['none', 'subtle', 'medium', 'heavy']);
export const typesetContrastSchema = z.enum(['standard', 'enhanced', 'maximum']);
export const typesetCasingSchema = z.enum(['preserve', 'uppercase', 'lowercase', 'titlecase']);
export const typesetAlignSchema = z.enum(['center', 'left', 'right']);

export const typesetOptionsSchema = z.object({
	fontFamily: z.string().optional(),
	fontDialogue: z.string().optional(),
	fontCjk: z.string().optional(),
	scriptFonts: z.record(z.enum(SCRIPT_FONT_SLOTS as unknown as [ScriptFontSlot, ...ScriptFontSlot[]]), z.string().max(128)).optional(),
	// ACCENT FONT PER SCRIPT, 'latin' INCLUDED (FEAT-010)
	accentFonts: z.record(z.enum(['latin', ...SCRIPT_FONT_SLOTS] as unknown as [string, ...string[]]), z.string().max(128)).optional(),
	accentCasing: z.enum(['uppercase', 'original', 'lowercase']).optional(),
	accentFontWeight: z.union([z.enum(['normal', 'bold']), z.string(), z.number()]).optional(),
	accentInBubbles: z.boolean().optional(),
	fontSize: z.number().min(6).max(120).optional(),
	boxInset: z.number().min(0.01).max(0.20).optional(),
	lineHeight: z.number().min(0.5).max(3.0).optional(),
	letterSpacing: z.number().min(-5).max(20).optional(),
	outline: typesetOutlineSchema.optional(),
	outlineMode: z.enum(['none', 'thin', 'standard', 'heavy']).optional(),
	contrast: typesetContrastSchema.optional(),
	colorMode: z.enum(['auto', 'dark', 'light']).optional(),
	casing: z.union([typesetCasingSchema, z.enum(['uppercase', 'original', 'lowercase'])]).optional(),
	allCaps: z.boolean().optional(),
	enableRotation: z.boolean().optional(),
	align: typesetAlignSchema.optional(),
	direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
	autoFit: z.boolean().optional(),
	fontWeight: z.union([z.enum(['normal', 'bold']), z.string(), z.number()]).optional(),
	fontStyle: z.enum(['normal', 'italic']).optional(),
	enableItalic: z.boolean().optional(),
	textColor: z.string().optional(),
	strokeColor: z.string().optional(),
	strokeWidth: z.number().min(0).max(20).optional(),
});

export const retypesetPageSchema = z.object({
	typesetOptions: typesetOptionsSchema.optional(),
});

export type TypesetOptions = z.infer<typeof typesetOptionsSchema>;
export type RetypesetPageInput = z.infer<typeof retypesetPageSchema>;
