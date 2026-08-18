// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
// IMPORTED MODULES
import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
import { assertBookExists } from '$lib/server/books';
import { addTerm, batchUpdateTerms, bookPair, clearGlossaryScope, deleteTerms, getGlossaryPage } from '$lib/server/glossary';
// IMPORTED TYPES
import type { LangPair } from '$lib/types';
import type { RequestHandler } from './$types';

// -- CONSTANTS -- //

import {
	createGlossaryTermSchema,
	batchUpdateGlossaryTermsSchema,
	deleteGlossaryTermsSchema,
	glossaryScopeSchema,
} from '$lib/schemas';

// -- FUNCTIONS -- //

// THE GLOBAL-SCOPE LANGUAGE PAIR FROM QUERY/BODY, FALLING BACK TO THE APP DEFAULT (zh-Hans → en).
function pairFrom(sourceLang: string | null | undefined, targetLang: string | null | undefined): LangPair {
	return {
		sourceLang: sourceLang || DEFAULT_SOURCE_LANG,
		targetLang: targetLang || DEFAULT_TARGET_LANG,
	};
}

export const GET: RequestHandler = async ({ url }) => {
	// safeParse → 400 (NOT AN UNHANDLED ZodError → 500) FOR A BAD ?scope= VALUE.
	const scopeResult = glossaryScopeSchema.safeParse(url.searchParams.get('scope') ?? 'global');
	if (!scopeResult.success) throw error(400, 'scope must be global or book.');
	const scope = scopeResult.data;
	const bookId = url.searchParams.get('bookId');
	if (scope === 'book' && !bookId) throw error(400, 'bookId is required for book scope.');
	// A book-SCOPE GLOSSARY REQUIRES THE BOOK TO EXIST.
	if (scope === 'book') await assertBookExists(bookId!);

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get('pageSize') ?? '50') || 50));
	const q = url.searchParams.get('q') ?? '';
	// GLOBAL ROWS ARE PARTITIONED BY LANGUAGE PAIR; BOOK ROWS ARE IMPLICITLY SINGLE-PAIR.
	const pair =
		scope === 'global'
			? pairFrom(url.searchParams.get('sourceLang'), url.searchParams.get('targetLang'))
			: undefined;

	const { rows, total } = await getGlossaryPage(scope, bookId, {
		q,
		limit: pageSize,
		offset: (page - 1) * pageSize,
		pair,
	});
	return json({ rows, total, page, pageSize });
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = createGlossaryTermSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid term.');
	const { scope, bookId, sourceLang, targetLang, source, target, gender, context, tags, category, pinned, aliases } =
		parsed.data;
	if (scope === 'book' && !bookId) throw error(400, 'bookId is required for book scope.');
	// ONLY ADD A book-SCOPE TERM WHEN THE BOOK EXISTS.
	if (scope === 'book') await assertBookExists(bookId!);
	// BOOK SCOPE INHERITS THE BOOK'S DIRECTION; GLOBAL SCOPE USES THE SUPPLIED (OR DEFAULT) PAIR.
	const pair = scope === 'book' ? await bookPair(bookId!) : pairFrom(sourceLang, targetLang);
	const row = await addTerm(scope, bookId ?? null, {
		source,
		target,
		gender,
		context: context ?? null,
		tags: tags ?? null,
		category: category ?? null,
		pinned: pinned ?? false,
		aliases: aliases ?? null,
	}, pair);
	return json(row, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const parsed = deleteGlossaryTermsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid delete request.');
	const { ids, clearScope, scope, bookId, sourceLang, targetLang } = parsed.data;

	if (clearScope) {
		if (!scope) throw error(400, 'scope is required to clear glossary.');
		if (scope === 'book') {
			if (!bookId) throw error(400, 'bookId is required to clear book glossary.');
			await assertBookExists(bookId);
			const count = await clearGlossaryScope('book', bookId);
			return json({ success: true, count });
		} else {
			const pair = pairFrom(sourceLang, targetLang);
			const count = await clearGlossaryScope('global', null, pair);
			return json({ success: true, count });
		}
	}

	if (ids && ids.length > 0) {
		const count = await deleteTerms(ids, scope, bookId ?? null);
		return json({ success: true, count });
	}

	throw error(400, 'No terms or scope specified for deletion.');
};

export const PATCH: RequestHandler = async ({ request }) => {
	const parsed = batchUpdateGlossaryTermsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid patch request.');
	const { ids, scope, bookId, ...patch } = parsed.data;
	const count = await batchUpdateTerms(ids, patch, scope, bookId ?? null);
	return json({ success: true, count });
};
