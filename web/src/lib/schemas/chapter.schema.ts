import { z } from 'zod';

export const createChapterSchema = z.object({
	title: z.string().max(200, 'Chapter title cannot exceed 200 characters').default(''),
});

export const updateChapterSchema = z.object({
	title: z.string().max(200, 'Chapter title cannot exceed 200 characters').optional(),
	titleTarget: z.string().max(200, 'Translated chapter title cannot exceed 200 characters').nullable().optional(),
	seq: z.number().int().min(0, 'Sequence number must be non-negative').optional(),
});

export const reorderPagesSchema = z.object({
	pageIds: z.array(z.number().int()).min(1, 'At least one page id is required'),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type ReorderPagesInput = z.infer<typeof reorderPagesSchema>;
