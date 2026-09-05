// IMPORTED TYPES
import type { PageServerLoad } from './$types';
// IMPORTED CONSTANTS
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
// IMPORTED DEP-MODULES
import { desc, eq } from 'drizzle-orm';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { appSettings, books } from '$lib/server/db/schema';
import { getGlossaryPage } from '$lib/server/glossary';
import { listAvailablePacks } from '$lib/server/glossary-packs';

// -- FUNCTIONS -- //

export const load: PageServerLoad = async ({ url }) => {
	// QUERY ACTIVE BOOKS FOR GLOSSARY MANAGEMENT (FILTER OUT ARCHIVED BOOKS)
	const activeBooks = db
		.select({
			id: books.id,
			title: books.title,
			titleTarget: books.titleTarget,
			sourceLang: books.sourceLang,
			targetLang: books.targetLang,
			archived: books.archived,
		})
		.from(books)
		.where(eq(books.archived, false))
		.orderBy(desc(books.pinned), desc(books.updatedAt))
		.all();

	const scopeParam = url.searchParams.get('scope');
	const bookIdParam = url.searchParams.get('bookId');
	const scope: 'global' | 'book' =
		scopeParam === 'book' || (bookIdParam && scopeParam !== 'global') ? 'book' : 'global';

	// IF A SPECIFIC BOOK ID WAS REQUESTED BUT IS ARCHIVED, FETCH IT AS A DIRECT FALLBACK
	let targetBook = activeBooks.find((b) => b.id === bookIdParam);
	let fallbackBook: (typeof activeBooks)[number] | null = null;
	if (bookIdParam && !targetBook) {
		const found = db
			.select({
				id: books.id,
				title: books.title,
				titleTarget: books.titleTarget,
				sourceLang: books.sourceLang,
				targetLang: books.targetLang,
				archived: books.archived,
			})
			.from(books)
			.where(eq(books.id, bookIdParam))
			.get();
		if (found) {
			fallbackBook = found;
			targetBook = found;
		}
	}

	const selectedBookId = targetBook?.id || (activeBooks.length > 0 ? activeBooks[0].id : null);
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

	const [settingRow] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, 'enabled_glossary_packs'))
		.limit(1);

	let enabledIds: string[] | null = null;
	if (settingRow?.value) {
		try {
			enabledIds = JSON.parse(settingRow.value);
		} catch {
			enabledIds = null;
		}
	}

	const packs = listAvailablePacks().map((p) => ({
		...p,
		enabled: enabledIds ? enabledIds.includes(p.id) : (p.enabledByDefault ?? true),
	}));

	return {
		books: fallbackBook ? [fallbackBook, ...activeBooks] : activeBooks,
		packs,
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
