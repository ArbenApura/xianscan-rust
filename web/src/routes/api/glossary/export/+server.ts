// IMPORTED DEP-TYPES
import { error } from '@sveltejs/kit';
// IMPORTED TYPES
import type { TermDraft } from '$lib/types';
import type { RequestHandler } from './$types';
// IMPORTED MODULES
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
import { assertBookExists } from '$lib/server/books';
import { getEffectiveGlossary, getGlossary, rowToDraft } from '$lib/server/glossary';
import { toGlossaryCsv } from '$lib/server/glossary-csv';

// -- FUNCTIONS -- //

export const GET: RequestHandler = async ({ url }) => {
	const scope = url.searchParams.get('scope') ?? 'global';
	const bookId = url.searchParams.get('bookId');
	// GLOBAL EXPORT IS SCOPED TO A LANGUAGE PAIR (DEFAULT zh-Hans → en).
	const pair = {
		sourceLang: url.searchParams.get('sourceLang') || DEFAULT_SOURCE_LANG,
		targetLang: url.searchParams.get('targetLang') || DEFAULT_TARGET_LANG,
	};

	let terms: TermDraft[];
	let name: string;
	if (scope === 'effective') {
		if (!bookId) throw error(400, 'bookId is required for effective export.');
		await assertBookExists(bookId);
		terms = await getEffectiveGlossary(bookId);
		name = `glossary-effective-${bookId}.csv`;
	} else if (scope === 'book') {
		if (!bookId) throw error(400, 'bookId is required for book export.');
		await assertBookExists(bookId);
		const rows = await getGlossary('book', bookId);
		terms = rows.map(rowToDraft);
		name = `glossary-book-${bookId}.csv`;
	} else if (scope === 'global') {
		const rows = await getGlossary('global', null, pair);
		terms = rows.map(rowToDraft);
		name = 'glossary-global.csv';
	} else {
		throw error(400, 'scope must be global, book, or effective.');
	}

	// SANITIZE THE FILENAME: bookId IS USER-CONTROLLED, SO STRIP ANYTHING THAT COULD BREAK OUT OF THE
	// QUOTED filename OR INJECT A HEADER (QUOTES, BACKSLASHES, CONTROL CHARS INCLUDING CR/LF).
	const safeName = name.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'glossary.csv';
	const csv = toGlossaryCsv(terms);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${safeName}"`,
		},
	});
};
