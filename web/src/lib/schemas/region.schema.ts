import { z } from 'zod';

export const translateTextSchema = z.object({
	text: z.string().min(1, 'Source text is required').max(2000, 'Text exceeds maximum length'),
	kind: z.enum(['title', 'chapter', 'term', 'general']).optional().default('general'),
	bookId: z.union([z.number(), z.string()]).optional(),
	chapterId: z.union([z.number(), z.string()]).optional(),
	pageId: z.union([z.number(), z.string()]).optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	model: z.string().optional(),
	instruction: z.string().max(500, 'Instruction too long').optional(),
	fresh: z.boolean().optional(),
});

export const updateRegionSchema = z.object({
	textTarget: z.string().optional(),
	action: z.enum(['save', 'reset_ai']).optional().default('save'),
	typesetOptions: z.record(z.unknown()).optional(),
});

export type TranslateTextInput = z.infer<typeof translateTextSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;
