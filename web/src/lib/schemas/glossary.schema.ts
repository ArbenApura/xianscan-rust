import { z } from 'zod';

export const glossaryScopeSchema = z.enum(['global', 'book']);

export const glossaryCategorySchema = z.enum([
	'character',
	'location',
	'organization',
	'technique',
	'item',
	'realm',
	'creature',
	'title',
	'concept',
	'other',
]);

export const glossaryGenderSchema = z.enum(['neuter', 'masculine', 'feminine']);

export const createGlossaryTermSchema = z.object({
	scope: glossaryScopeSchema,
	bookId: z.string().nullable().optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	source: z.string().min(1, 'Source term is required').max(300, 'Source term too long'),
	target: z.string().min(1, 'Target translation is required').max(500, 'Target translation too long'),
	gender: glossaryGenderSchema.default('neuter'),
	context: z.string().nullable().optional(),
	tags: z.string().nullable().optional(),
	category: glossaryCategorySchema.nullable().optional(),
	pinned: z.boolean().optional(),
	aliases: z.array(z.string()).nullable().optional(),
});

export const updateGlossaryTermSchema = z.object({
	source: z.string().min(1, 'Source term is required').max(300).optional(),
	target: z.string().min(1, 'Target translation is required').max(500).optional(),
	gender: glossaryGenderSchema.optional(),
	context: z.string().nullable().optional(),
	tags: z.string().nullable().optional(),
	category: glossaryCategorySchema.nullable().optional(),
	pinned: z.boolean().optional(),
	aliases: z.array(z.string()).nullable().optional(),
});

export const batchUpdateGlossaryTermsSchema = z.object({
	ids: z.array(z.number().int()).min(1, 'At least one term id is required'),
	scope: glossaryScopeSchema.optional(),
	bookId: z.string().nullable().optional(),
	pinned: z.boolean().optional(),
	category: glossaryCategorySchema.nullable().optional(),
	gender: glossaryGenderSchema.optional(),
	status: z.enum(['ai', 'user']).optional(),
});

export const deleteGlossaryTermsSchema = z.object({
	ids: z.array(z.number().int()).optional(),
	clearScope: z.boolean().optional(),
	scope: glossaryScopeSchema.optional(),
	bookId: z.string().nullable().optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
});

export const glossaryExtractSchema = z.object({
	bookId: z.string().min(1, 'Book ID is required'),
	chapterId: z.union([z.number(), z.string()]).optional(),
});

export type CreateGlossaryTermInput = z.infer<typeof createGlossaryTermSchema>;
export type UpdateGlossaryTermInput = z.infer<typeof updateGlossaryTermSchema>;
export type BatchUpdateGlossaryTermsInput = z.infer<typeof batchUpdateGlossaryTermsSchema>;
export type DeleteGlossaryTermsInput = z.infer<typeof deleteGlossaryTermsSchema>;
export type GlossaryExtractInput = z.infer<typeof glossaryExtractSchema>;
