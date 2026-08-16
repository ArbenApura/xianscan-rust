// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
// IMPORTED TYPES
import type { RequestHandler } from './$types';
// IMPORTED MODULES
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
import { assertBookExists } from '$lib/server/books';
import { parseGlossaryCsv } from '$lib/server/glossary-csv';
import { bookPair, mergeGlossary } from '$lib/server/glossary';
import { decodeTextBytes } from '$lib/server/charset';
import { assertMaxSize, MB, readUploadForm } from '$lib/server/uploads';

// -- FUNCTIONS -- //

export const POST: RequestHandler = async ({ request }) => {
	const form = await readUploadForm(request);
	const file = form.get('file');
	const scope = String(form.get('scope') ?? 'global');
	const bookId = form.get('bookId') ? String(form.get('bookId')) : null;
	if (!(file instanceof File)) throw error(400, 'Upload a .csv file in the "file" field.');
	assertMaxSize(file, 10 * MB);
	if (scope !== 'global' && scope !== 'book') throw error(400, 'scope must be "global" or "book".');
	if (scope === 'book' && !bookId) throw error(400, 'bookId is required for book scope.');
	// VALIDATE THE TARGET BOOK EXISTS — OTHERWISE BOOK-SCOPE ROWS ORPHAN.
	if (scope === 'book' && bookId) await assertBookExists(bookId);

	// THE PAIR THESE ROWS BELONG TO: BOOK SCOPE INHERITS THE BOOK'S; GLOBAL USES THE FORM PAIR (DEFAULT).
	const pair =
		scope === 'book'
			? await bookPair(bookId!)
			: {
					sourceLang: (form.get('sourceLang') as string | null) || DEFAULT_SOURCE_LANG,
					targetLang: (form.get('targetLang') as string | null) || DEFAULT_TARGET_LANG,
				};

	// PARSE (CLIENT ERROR → 400) IS SEPARATED FROM THE DB MERGE (SERVER ERROR → 500) SO A DB FAILURE ISN'T
	// MISREPORTED AS A BAD UPLOAD AND ITS INTERNAL MESSAGE ISN'T LEAKED TO THE CLIENT.
	let terms;
	try {
		const text = decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
		terms = parseGlossaryCsv(text);
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'Failed to parse glossary CSV.');
	}
	if (terms.length === 0) throw error(400, 'No valid rows found (need source,target columns).');

	const result = await mergeGlossary(scope, bookId, terms, pair);
	return json({ ...result, parsed: terms.length });
};
