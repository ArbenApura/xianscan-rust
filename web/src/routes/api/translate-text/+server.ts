import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { books, chapters } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { translateSingleText } from '$lib/server/translate';
import type { LangPair } from '$lib/types';

const schema = z.object({
	text: z.string().min(1).max(2000),
	kind: z.enum(['title', 'chapter', 'term', 'general']).optional().default('general'),
	instruction: z.string().max(1000).optional(),
	bookId: z.union([z.number(), z.string()]).optional(),
	chapterId: z.union([z.number(), z.string()]).optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
	model: z.string().optional(),
	fresh: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: 'Invalid input: text is required' }, { status: 400 });
		}

		const { text, kind, instruction, bookId, chapterId, model } = parsed.data;
		let sourceLang = parsed.data.sourceLang;
		let targetLang = parsed.data.targetLang;

		// Resolve language pair from chapter or book if not directly provided
		if ((!sourceLang || !targetLang) && chapterId) {
			const chapIdNum = Number(chapterId);
			if (!Number.isNaN(chapIdNum)) {
				const [chap] = await db
					.select({ bookId: chapters.bookId })
					.from(chapters)
					.where(eq(chapters.id, chapIdNum))
					.limit(1);
				if (chap && chap.bookId) {
					const [book] = await db
						.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
						.from(books)
						.where(eq(books.id, chap.bookId))
						.limit(1);
					if (book) {
						sourceLang = sourceLang || book.sourceLang;
						targetLang = targetLang || book.targetLang;
					}
				}
			}
		}

		if ((!sourceLang || !targetLang) && bookId) {
			const bookIdStr = String(bookId);
			const [book] = await db
				.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
				.from(books)
				.where(eq(books.id, bookIdStr))
				.limit(1);
			if (book) {
				sourceLang = sourceLang || book.sourceLang;
				targetLang = targetLang || book.targetLang;
			}
		}

		const pair: LangPair = {
			sourceLang: sourceLang || 'zh',
			targetLang: targetLang || 'en',
		};

		const result = await translateSingleText(text, pair, {
			kind,
			instruction,
			model,
		});

		return json({
			text: result.text,
			usage: result.usage,
		});
	} catch (err: any) {
		return json(
			{ message: err?.message || 'Translation failed' },
			{ status: 500 }
		);
	}
};
