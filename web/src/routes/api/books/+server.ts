// BOOKS API — LIST + CREATE (SINGLE-USER APP, NO AUTH).
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
// IMPORTED MODULES
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG, detectSourceLanguage } from '$lib/languages';
import { getBooksWithTelemetry } from '$lib/server/books';
import { db } from '$lib/server/db';
import { books } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const PostBody = z.object({
	title: z.string().min(1).max(200),
	titleTarget: z.string().max(200).optional(),
	sourceLang: z.string().optional(),
	targetLang: z.string().optional(),
});

export const GET: RequestHandler = async () => {
	const allBooks = await getBooksWithTelemetry();
	return json({ books: allBooks });
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = PostBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid book details.');
	const rawSource = parsed.data.sourceLang || DEFAULT_SOURCE_LANG;
	const detectedSource = rawSource === 'auto' ? detectSourceLanguage(parsed.data.title) : rawSource;
	const targetLang = parsed.data.targetLang || DEFAULT_TARGET_LANG;

	// When rawSource was 'auto' and detected language equals targetLang (e.g. English title with English target),
	// fallback to default source language ('zh-Hans') instead of rejecting with 400.
	const sourceLang =
		rawSource === 'auto' && detectedSource === targetLang
			? (targetLang === 'zh-Hans' ? 'en' : 'zh-Hans')
			: detectedSource;

	if (sourceLang === targetLang) {
		throw error(400, 'Target translation language must be different from source language.');
	}

	const id = randomUUID();
	db.insert(books)
		.values({
			id,
			title: parsed.data.title.trim(),
			titleTarget: parsed.data.titleTarget ? parsed.data.titleTarget.trim() : null,
			sourceLang,
			targetLang,
		})
		.run();
	return json({ id }, { status: 201 });
};
