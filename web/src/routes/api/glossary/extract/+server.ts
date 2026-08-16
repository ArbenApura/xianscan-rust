// MANUAL AI TERM EXTRACTION ENDPOINT — EXTRACTS TERMS FROM CHAPTER TEXT AND SAVES TO BOOK GLOSSARY.
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { chapters, pages, regions } from '$lib/server/db/schema';
import { addNewTerms, bookPair, getEffectiveGlossary } from '$lib/server/glossary';
import { extractTerms } from '$lib/server/translate';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const { bookId, chapterId } = body;
	if (!bookId || typeof bookId !== 'string') throw error(400, 'Invalid bookId.');

	const pair = await bookPair(bookId);
	const effective = await getEffectiveGlossary(bookId);

	let pageRows;
	if (chapterId) {
		pageRows = db.select().from(pages).where(eq(pages.chapterId, Number(chapterId))).all();
	} else {
		pageRows = db
			.select({ id: pages.id, chapterId: pages.chapterId, filePath: pages.filePath })
			.from(pages)
			.innerJoin(chapters, eq(pages.chapterId, chapters.id))
			.where(eq(chapters.bookId, bookId))
			.all();
	}

	let totalAdded = 0;
	let totalSkipped = 0;

	// Group pages by chapter to properly associate firstChapterId
	const byChapter = new Map<number, string[]>();
	for (const p of pageRows) {
		const regionRows = db.select({ textSource: regions.textSource }).from(regions).where(eq(regions.pageId, p.id)).all();
		const pageText = regionRows.map((r) => r.textSource).filter((t) => t.trim()).join('\n');
		if (!pageText.trim()) continue;
		const arr = byChapter.get(p.chapterId) ?? [];
		arr.push(pageText);
		byChapter.set(p.chapterId, arr);
	}

	for (const [chId, textList] of byChapter.entries()) {
		const fullText = textList.join('\n');
		if (!fullText.trim()) continue;

		const { terms: extracted } = await extractTerms(fullText, pair, { knownTerms: effective });
		if (extracted.length > 0) {
			const { added, skipped } = await addNewTerms(bookId, extracted, chId);
			totalAdded += added;
			totalSkipped += skipped;
		}
	}

	return json({ added: totalAdded, skipped: totalSkipped });
};
