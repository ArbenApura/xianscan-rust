import { z } from 'zod';

export const createBookSchema = z.object({
	title: z.string().min(1, 'Book title is required').max(200, 'Title cannot exceed 200 characters'),
	titleTarget: z.string().max(200, 'Translated title cannot exceed 200 characters').optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
});

export const updateBookSchema = z.object({
	title: z.string().min(1, 'Book title is required').max(200, 'Title cannot exceed 200 characters').optional(),
	titleTarget: z.string().max(200, 'Translated title cannot exceed 200 characters').nullable().optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	pinned: z.boolean().optional(),
	archived: z.boolean().optional(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
