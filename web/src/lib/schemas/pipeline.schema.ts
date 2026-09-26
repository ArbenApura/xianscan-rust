import { z } from 'zod';
import { SCRIPT_FONT_SLOTS, type ScriptFontSlot } from '$lib/typeset-scripts';

export const translateChapterSchema = z.object({
	force: z.boolean().default(false),
	pageIds: z.array(z.number().int().positive()).optional(),
	inpaintMode: z.string().optional(),
	enableWhiteInpaint: z.boolean().optional(),
	inpaintExpansionPct: z.number().min(0).max(0.30).optional().default(0.03),
	enableTypesetCentering: z.boolean().optional().default(true),
	pageConcurrency: z.number().int().min(1).max(16).optional(),
	typesetOptions: z
		.object({
			fontDialogue: z.string().optional(),
			fontCjk: z.string().optional(),
			scriptFonts: z.record(z.enum(SCRIPT_FONT_SLOTS as unknown as [ScriptFontSlot, ...ScriptFontSlot[]]), z.string().max(128)).optional(),
			boxInset: z.number().optional(),
			outlineMode: z.enum(['none', 'thin', 'standard', 'heavy']).optional(),
			colorMode: z.enum(['auto', 'dark', 'light']).optional(),
			casing: z.enum(['uppercase', 'original', 'lowercase']).optional(),
			allCaps: z.boolean().optional(),
			enableRotation: z.boolean().optional(),
			fontWeight: z.union([z.enum(['normal', 'bold']), z.string(), z.number()]).optional(),
			fontStyle: z.enum(['normal', 'italic']).optional(),
			enableItalic: z.boolean().optional(),
		})
		.optional(),
});

export const resliceChapterSchema = z.object({
	targetHeight: z.number().int().positive().optional(),
	minHeight: z.number().int().positive().optional(),
	maxHeight: z.number().int().positive().optional(),
});

export const stitchPagesSchema = z.object({
	targetPageId: z.number().int().positive().optional(),
});

export type TranslateChapterInput = z.infer<typeof translateChapterSchema>;
export type ResliceChapterInput = z.infer<typeof resliceChapterSchema>;
export type StitchPagesInput = z.infer<typeof stitchPagesSchema>;
