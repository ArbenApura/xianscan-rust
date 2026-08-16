import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { books } from '$lib/server/db/schema';
import { getGlossaryPage } from '$lib/server/glossary';
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const allBooks = db
		.select({
			id: books.id,
			title: books.title,
			titleTarget: books.titleTarget,
			sourceLang: books.sourceLang,
			targetLang: books.targetLang,
		})
		.from(books)
		.orderBy(desc(books.pinned), desc(books.updatedAt))
		.all();

	const scopeParam = url.searchParams.get('scope');
	const bookIdParam = url.searchParams.get('bookId');
	const scope: 'global' | 'book' = scopeParam === 'book' || (bookIdParam && scopeParam !== 'global') ? 'book' : 'global';
	const selectedBookId = bookIdParam || (allBooks.length > 0 ? allBooks[0].id : null);
	const sourceLang = url.searchParams.get('src') || DEFAULT_SOURCE_LANG;
	const targetLang = url.searchParams.get('tgt') || DEFAULT_TARGET_LANG;
	const q = url.searchParams.get('q') || '';
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '10', 10)));

	const initialGlossary = await getGlossaryPage(scope, scope === 'book' ? selectedBookId : null, {
		q,
		limit: pageSize,
		offset: (page - 1) * pageSize,
		pair: { sourceLang, targetLang },
	});

	return {
		books: allBooks,
		initialGlossary,
		initialScope: scope,
		initialBookId: selectedBookId,
		initialSourceLang: sourceLang,
		initialTargetLang: targetLang,
		initialQuery: q,
		initialPage: page,
		initialPageSize: pageSize,
	};
};
