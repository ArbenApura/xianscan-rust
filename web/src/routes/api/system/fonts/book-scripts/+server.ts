// SCRIPTS THE LIBRARY IS TYPESET IN (FEAT-010): THE FONTS TABLE SHOWS THESE ROWS FIRST AND HIDES THE REST
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { books } from '$lib/server/db/schema';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { typesetScriptForBook, type Script } from '$lib/languages';

// -- HANDLERS -- //

export const GET: RequestHandler = async () => {
	const scripts = new Set<Script>();
	for (const book of db.select({ sourceLang: books.sourceLang, targetLang: books.targetLang }).from(books).all()) {
		scripts.add(typesetScriptForBook(book.targetLang, book.sourceLang));
	}
	// THE DEFAULT TARGET LANGUAGE FOR NEW BOOKS COUNTS TOO, SO AN EMPTY LIBRARY STILL SHOWS ITS ROW
	const settings = getCanonicalSettings();
	scripts.add(typesetScriptForBook(settings.targetLang, settings.sourceLang));
	return json({ scripts: [...scripts] });
};
