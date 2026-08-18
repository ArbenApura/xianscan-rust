import { z } from 'zod';

export const translateChapterSchema = z.object({
	force: z.boolean().default(false),
	pageIds: z.array(z.number().int().positive()).optional(),
	inpaintMode: z.string().optional(),
	pageConcurrency: z.number().int().min(1).max(16).optional(),
	typesetOptions: z
		.object({
			fontDialogue: z.string().optional(),
			fontCjk: z.string().optional(),
			boxInset: z.number().optional(),
			fontScale: z.number().optional(),
			outlineMode: z.enum(['none', 'thin', 'standard', 'heavy']).optional(),
			colorMode: z.enum(['auto', 'dark', 'light']).optional(),
			casing: z.enum(['uppercase', 'original', 'lowercase']).optional(),
			allCaps: z.boolean().optional(),
			enableRotation: z.boolean().optional(),
		})
		.optional(),
});

export const resliceChapterSchema = z.object({
	minHeight: z.number().positive().optional(),
	maxHeight: z.number().positive().optional(),
	overlap: z.number().nonnegative().optional(),
});

export const stitchPagesSchema = z.object({
	targetPageId: z.number().int().positive().optional(),
});

export type TranslateChapterInput = z.infer<typeof translateChapterSchema>;
export type ResliceChapterInput = z.infer<typeof resliceChapterSchema>;
export type StitchPagesInput = z.infer<typeof stitchPagesSchema>;
