import { z } from 'zod';

// MIHON-COMPATIBLE SERIALIZATION STATUS — VALUES MATCH SManga STATUS CONSTANTS.
export const BOOK_STATUSES = [
	'unknown',
	'ongoing',
	'completed',
	'licensed',
	'publishing_finished',
	'cancelled',
	'on_hiatus',
] as const;

export const bookStatusSchema = z.enum(BOOK_STATUSES);

export const bookTagsSchema = z.array(z.string().trim().min(1).max(50)).max(30);

export const createBookSchema = z.object({
	title: z.string().min(1, 'Book title is required').max(200, 'Title cannot exceed 200 characters'),
	titleTarget: z.string().max(200, 'Translated title cannot exceed 200 characters').optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	description: z.string().max(20_000, 'Description cannot exceed 20,000 characters').optional(),
	author: z.string().max(200, 'Author cannot exceed 200 characters').optional(),
	artist: z.string().max(200, 'Artist cannot exceed 200 characters').optional(),
	tags: bookTagsSchema.optional(),
	status: bookStatusSchema.optional(),
});

export const updateBookSchema = z.object({
	title: z.string().min(1, 'Book title is required').max(200, 'Title cannot exceed 200 characters').optional(),
	titleTarget: z.string().max(200, 'Translated title cannot exceed 200 characters').nullable().optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	pinned: z.boolean().optional(),
	archived: z.boolean().optional(),
	description: z.string().max(20_000, 'Description cannot exceed 20,000 characters').nullable().optional(),
	author: z.string().max(200, 'Author cannot exceed 200 characters').nullable().optional(),
	artist: z.string().max(200, 'Artist cannot exceed 200 characters').nullable().optional(),
	tags: bookTagsSchema.optional(),
	status: bookStatusSchema.optional(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
