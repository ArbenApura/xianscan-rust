// PORTED FROM xianslate (src/lib/server/glossary.ts) — SQLite DIALECT, SINGLE-USER (userId DROPPED).
// THE AI EXTRACTION BLOCK (extractTerms / prompts) LIVES HERE TOO BUT LANDS WITH deepseek.ts (PHASE 4).

// IMPORTED DEP-TYPES
import type { Column } from 'drizzle-orm';
// IMPORTED TYPES
import type { GlossaryRow, GlossaryScope, LangPair, TermDraft } from '$lib/types';
// IMPORTED DEP-MODULES
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
// IMPORTED MODULES
import { db } from './db';
import { books, chapters, glossary, type GlossaryEntry } from './db/schema';
import { invalidateAll, invalidateBook } from './glossary-match';

// -- CONSTANTS -- //

const EXTRACT_CHUNK_CHARS = 9000;

// -- FUNCTIONS -- //

// CASE-INSENSITIVE "CONTAINS" THAT TREATS THE USER'S % _ \ AS LITERALS (NOT LIKE WILDCARDS). SQLITE'S
// LIKE IS ASCII-CASE-INSENSITIVE — THE BEHAVIOUR xianslate'S EDITOR ORIGINALLY HAD ON SQLite.
function likeContains(col: Column, q: string) {
	const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
	return sql`${col} LIKE ${'%' + escaped + '%'} ESCAPE '\\'`;
}

function invalidate(scope: GlossaryScope, bookId: string | null): void {
	if (scope === 'global') invalidateAll();
	else if (bookId) invalidateBook(bookId);
}

// aliases IS STORED AS A JSON-ENCODED ARRAY IN A text COLUMN. PARSE IT BACK TO A CLEAN STRING ARRAY
// (null / MALFORMED / NON-ARRAY → []), AND SERIALISE THE OTHER WAY (EMPTY → null SO THE COLUMN STAYS CLEAN).
function parseAliases(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
	} catch {
		return [];
	}
}
function aliasesJson(aliases: string[] | null | undefined): string | null {
	const arr = [...new Set((aliases ?? []).map((a) => a.trim()).filter(Boolean))];
	return arr.length ? JSON.stringify(arr) : null;
}

// MAP A DB ROW TO THE TermDraft SHAPE matchTerms / TRANSLATION / EXPORT CONSUME (aliases PARSED TO AN ARRAY).
export function rowToDraft(g: GlossaryEntry): TermDraft {
	return {
		source: g.source,
		target: g.target,
		gender: g.gender,
		context: g.context,
		tags: g.tags,
		category: g.category,
		pinned: g.pinned,
		status: g.status,
		aliases: parseAliases(g.aliases),
		firstChapterId: g.firstChapterId,
		createdAt: g.createdAt,
	};
}

// READ A BOOK'S TRANSLATION DIRECTION — THE PAIR ITS GLOSSARY ROWS BELONG TO.
export async function bookPair(bookId: string): Promise<LangPair> {
	const [b] = await db
		.select({ sourceLang: books.sourceLang, targetLang: books.targetLang })
		.from(books)
		.where(eq(books.id, bookId))
		.limit(1);
	return { sourceLang: b?.sourceLang ?? 'zh-Hans', targetLang: b?.targetLang ?? 'en' };
}

// SPLIT CHAPTER / PASSAGE TEXT INTO LINE-ALIGNED CHUNKS SO EVERY PART IS SCANNED FOR TERMS.
// EXPORTED FOR UNIT TESTS — THE CHUNK SPLITTER BEHIND THE COST CAP.
export function chunkForExtraction(content: string, maxChunkChars = EXTRACT_CHUNK_CHARS): string[] {
	const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0) return content.trim() ? [content.trim()] : [];
	const chunks: string[] = [];
	let cur = '';
	for (const line of lines) {
		if (cur.length + line.length > maxChunkChars && cur.length > 0) {
			chunks.push(cur);
			cur = '';
		}
		cur = cur ? `${cur}\n${line}` : line;
	}
	if (cur) chunks.push(cur);
	return chunks;
}

// WHERE CLAUSE FOR ONE SCOPE. GLOBAL ROWS ARE FILTERED TO A LANGUAGE PAIR SO A CHINESE GLOSSARY NEVER
// SHOWS UP WHILE EDITING A JAPANESE ONE; BOOK ROWS ARE IMPLICITLY SINGLE-PAIR (TIED TO THE BOOK).
function scopeWhere(scope: GlossaryScope, bookId: string | null, pair?: LangPair) {
	if (scope === 'global') {
		const base = and(eq(glossary.scope, 'global'), isNull(glossary.bookId));
		if (!pair) return base;
		return and(base, eq(glossary.sourceLang, pair.sourceLang), eq(glossary.targetLang, pair.targetLang));
	}
	return and(eq(glossary.scope, 'book'), eq(glossary.bookId, bookId!));
}

// ROWS FOR A SINGLE SCOPE (EDITOR VIEW)
export async function getGlossary(scope: GlossaryScope, bookId: string | null, pair?: LangPair): Promise<GlossaryEntry[]> {
	return db
		.select()
		.from(glossary)
		.where(scopeWhere(scope, bookId, pair))
		.orderBy(glossary.source);
}

// EFFECTIVE GLOSSARY FOR A BOOK = global(SAME PAIR) ∪ book, WITH book OVERRIDING global ON THE SAME source.
export async function getEffectiveGlossary(bookId: string): Promise<TermDraft[]> {
	const pair = await bookPair(bookId);
	const globals = await db
		.select()
		.from(glossary)
		.where(
			and(
				eq(glossary.scope, 'global'),
				isNull(glossary.bookId),
				eq(glossary.sourceLang, pair.sourceLang),
				eq(glossary.targetLang, pair.targetLang),
			),
		);
	const bookRows = await db.select().from(glossary).where(and(eq(glossary.scope, 'book'), eq(glossary.bookId, bookId)));

	const map = new Map<string, TermDraft>();
	for (const g of globals) map.set(g.source, rowToDraft(g));
	for (const b of bookRows) map.set(b.source, rowToDraft(b)); // book OVERRIDES global ON THE SAME source
	return [...map.values()];
}

// PAGINATED + SEARCHABLE GLOSSARY ROWS FOR THE EDITOR
export async function getGlossaryPage(
	scope: GlossaryScope,
	bookId: string | null,
	opts: { q?: string; limit: number; offset: number; pair?: LangPair },
): Promise<{ rows: GlossaryRow[]; total: number }> {
	const base = scopeWhere(scope, bookId, opts.pair);
	const q = opts.q?.trim();
	const where = q ? and(base, or(likeContains(glossary.source, q), likeContains(glossary.target, q))) : base;

	// LEFT JOIN THE first-appearance CHAPTER FOR ITS seq (THE EDITOR SHOWS "Ch. N"); aliases IS PARSED BELOW.
	const raw = await db
		.select({
			id: glossary.id,
			source: glossary.source,
			target: glossary.target,
			gender: glossary.gender,
			context: glossary.context,
			tags: glossary.tags,
			category: glossary.category,
			pinned: glossary.pinned,
			status: glossary.status,
			aliases: glossary.aliases,
			firstChapterId: glossary.firstChapterId,
			firstSeq: chapters.seq,
			firstChapterTitle: chapters.title,
			firstChapterTitleTarget: chapters.titleTarget,
			createdAt: glossary.createdAt,
		})
		.from(glossary)
		.leftJoin(chapters, eq(glossary.firstChapterId, chapters.id))
		.where(where)
		.orderBy(glossary.source)
		.limit(opts.limit)
		.offset(opts.offset);
	const rows: GlossaryRow[] = raw.map((r) => ({ ...r, aliases: parseAliases(r.aliases) }));
	const [c] = await db.select({ n: sql<number>`count(*)` }).from(glossary).where(where);
	return { rows, total: Number(c?.n ?? 0) };
}

export async function addTerm(
	scope: GlossaryScope,
	bookId: string | null,
	draft: TermDraft,
	pair: LangPair,
): Promise<GlossaryEntry> {
	const [row] = await db
		.insert(glossary)
		.values({
			scope,
			bookId: scope === 'global' ? null : bookId,
			sourceLang: pair.sourceLang,
			targetLang: pair.targetLang,
			source: draft.source.trim(),
			target: draft.target.trim(),
			gender: draft.gender,
			context: draft.context?.trim() || null,
			tags: draft.tags ?? null,
			category: draft.category ?? null,
			pinned: draft.pinned ?? false,
			// A HAND-ADDED TERM IS AUTHORITATIVE — MARK IT 'user' SO EXTRACTION NEVER TREATS IT AS UNREVIEWED.
			status: 'user',
			aliases: aliasesJson(draft.aliases),
		})
		.returning();
	invalidate(scope, bookId);
	return row;
}

export async function updateTerm(id: number, patch: Partial<TermDraft>): Promise<GlossaryEntry | null> {
	const [existing] = await db.select().from(glossary).where(eq(glossary.id, id)).limit(1);
	if (!existing) return null;
	const [row] = await db
		.update(glossary)
		.set({
			source: patch.source?.trim() ?? existing.source,
			target: patch.target?.trim() ?? existing.target,
			gender: patch.gender ?? existing.gender,
			// UNDEFINED = LEAVE AS-IS; AN EMPTY STRING CLEARS THE NOTE (→ null)
			context: patch.context === undefined ? existing.context : patch.context?.trim() || null,
			tags: patch.tags === undefined ? existing.tags : patch.tags,
			// UNDEFINED = LEAVE AS-IS; null OR A VALUE REPLACES IT.
			category: patch.category === undefined ? existing.category : (patch.category ?? null),
			pinned: patch.pinned === undefined ? existing.pinned : !!patch.pinned,
			aliases: patch.aliases === undefined ? existing.aliases : aliasesJson(patch.aliases),
			// A HUMAN EDIT CONFIRMS THE TERM → 'user' (AUTHORITATIVE, NEVER DOWNGRADED BY EXTRACTION).
			status: 'user',
			updatedAt: Date.now(),
		})
		.where(eq(glossary.id, id))
		.returning();
	invalidate(existing.scope, existing.bookId);
	return row;
}

export async function deleteTerm(id: number): Promise<void> {
	const [existing] = await db.select().from(glossary).where(eq(glossary.id, id)).limit(1);
	if (!existing) return;
	await db.delete(glossary).where(eq(glossary.id, id));
	invalidate(existing.scope, existing.bookId);
}

// BATCH DELETE TERMS BY IDS; INVALIDATES CACHE FOR THE SCOPE/BOOK.
export async function deleteTerms(
	ids: number[],
	scope?: GlossaryScope,
	bookId?: string | null,
): Promise<number> {
	if (ids.length === 0) return 0;
	let effScope = scope;
	let effBookId = bookId;
	if (!effScope) {
		const [first] = await db
			.select({ scope: glossary.scope, bookId: glossary.bookId })
			.from(glossary)
			.where(inArray(glossary.id, ids))
			.limit(1);
		if (first) {
			effScope = first.scope;
			effBookId = first.bookId;
		}
	}
	const result = await db.delete(glossary).where(inArray(glossary.id, ids)).returning({ id: glossary.id });
	if (effScope) invalidate(effScope, effBookId ?? null);
	else invalidateAll();
	return result.length;
}

// PERMANENTLY CLEAR ALL TERMS IN A GIVEN SCOPE (BOOK OR GLOBAL LANGUAGE PAIR).
export async function clearGlossaryScope(
	scope: GlossaryScope,
	bookId: string | null,
	pair?: LangPair,
): Promise<number> {
	const where = scopeWhere(scope, bookId, pair);
	const result = await db.delete(glossary).where(where).returning({ id: glossary.id });
	invalidate(scope, bookId);
	return result.length;
}

// BATCH UPDATE SPECIFIC FIELDS (PIN, CATEGORY, GENDER) ACROSS MULTIPLE TERMS.
export async function batchUpdateTerms(
	ids: number[],
	patch: Partial<TermDraft>,
	scope?: GlossaryScope,
	bookId?: string | null,
): Promise<number> {
	if (ids.length === 0) return 0;
	const updateSet: Record<string, unknown> = { updatedAt: Date.now() };
	if (patch.pinned !== undefined) updateSet.pinned = !!patch.pinned;
	if (patch.category !== undefined) updateSet.category = patch.category ?? null;
	if (patch.gender !== undefined) updateSet.gender = patch.gender;
	if (patch.status !== undefined) updateSet.status = patch.status;

	const result = await db
		.update(glossary)
		.set(updateSet)
		.where(inArray(glossary.id, ids))
		.returning({ id: glossary.id });

	if (scope) invalidate(scope, bookId ?? null);
	else invalidateAll();
	return result.length;
}

// BULK UPSERT TERMS INTO ONE SCOPE; RETURNS {added, updated}. ATOMIC — ALL-OR-NOTHING.
export async function mergeGlossary(
	scope: GlossaryScope,
	bookId: string | null,
	terms: TermDraft[],
	pair: LangPair,
): Promise<{ added: number; updated: number }> {
	if (terms.length === 0) return { added: 0, updated: 0 };
	const effBookId = scope === 'global' ? null : bookId;

	// DE-DUPE BY source (LAST-WINS) BEFORE BATCHING: TWO ROWS WITH THE SAME source IN ONE INSERT THROW
	// "ON CONFLICT ... cannot affect row a second time" AND 400 THE WHOLE IMPORT.
	const now = Date.now();
	const bySource = new Map<string, typeof glossary.$inferInsert>();
	for (const t of terms) {
		const source = t.source.trim();
		const target = t.target.trim();
		if (!source || !target) continue;
		bySource.set(source, {
			scope,
			bookId: effBookId,
			sourceLang: pair.sourceLang,
			targetLang: pair.targetLang,
			source,
			target,
			gender: t.gender,
			context: t.context?.trim() || null,
			tags: t.tags ?? null,
			category: t.category ?? null,
			pinned: t.pinned ?? false,
			status: t.status ?? 'ai',
			aliases: aliasesJson(t.aliases),
			firstChapterId: t.firstChapterId ?? null,
			createdAt: now,
			updatedAt: now,
		});
	}
	const rows = [...bySource.values()];
	if (rows.length === 0) return { added: 0, updated: 0 };

	const set = {
		target: sql`excluded.target`,
		gender: sql`excluded.gender`,
		context: sql`excluded.context`,
		tags: sql`excluded.tags`,
		category: sql`excluded.category`,
		pinned: sql`excluded.pinned`,
		status: sql`excluded.status`,
		aliases: sql`excluded.aliases`,
		// first_chapter_id IS DELIBERATELY ABSENT — FIRST APPEARANCE IS IMMUTABLE ONCE RECORDED.
		updatedAt: sql`excluded.updated_at`,
	};

	// THE ENTIRE MERGE RUNS IN ONE TRANSACTION: A FAILURE ON ANY CHUNK ROLLS BACK EVERYTHING (NO PARTIAL
	// IMPORTS), AND THE before/after COUNTS ARE READ INSIDE THE SAME TX SO CONCURRENT WRITERS CAN'T CORRUPT
	// THE added/updated ACCOUNTING. better-sqlite3 IS SYNCHRONOUS — THE CALLBACK MUST NOT BE async (THE
	// pg-PROXY DRIVER IN xianslate ALLOWED await; THIS DRIVER THROWS "Transaction function cannot return a
	// promise"), SO EVERY QUERY HERE IS A SYNC .run()/.get() CALL.
	const CHUNK = 200;
	const counts = db.transaction((tx) => {
		const where = scopeWhere(scope, bookId, scope === 'global' ? pair : undefined);
		const before = Number(tx.select({ n: sql<number>`count(*)` }).from(glossary).where(where).get()?.n ?? 0);

		for (let i = 0; i < rows.length; i += CHUNK) {
			const slice = rows.slice(i, i + CHUNK);
			if (scope === 'global') {
				tx.insert(glossary)
					.values(slice)
					.onConflictDoUpdate({
						// MATCHES THE PARTIAL UNIQUE INDEX glossary_global_unq (sourceLang, targetLang, source).
						target: [glossary.sourceLang, glossary.targetLang, glossary.source],
						targetWhere: sql`${glossary.scope} = 'global'`,
						set,
					})
					.run();
			} else {
				tx.insert(glossary)
					.values(slice)
					.onConflictDoUpdate({
						target: [glossary.bookId, glossary.source],
						targetWhere: sql`${glossary.scope} = 'book'`,
						set,
					})
					.run();
			}
		}

		const after = Number(tx.select({ n: sql<number>`count(*)` }).from(glossary).where(where).get()?.n ?? 0);
		return { before, after };
	});

	const added = counts.after - counts.before;
	// DROP THE PER-BOOK MATCH AUTOMATON SO FRESHLY-MERGED TERMS ARE MATCHED *IMMEDIATELY* BY matchTerms.
	// THE EXTRACTION PIPELINE (addNewTerms) AND THE GLOSSARY IMPORT BOTH FLOW THROUGH HERE — WITHOUT THIS,
	// JUST-EXTRACTED TERMS STAY UNUSED (NOT INJECTED INTO TRANSLATION) UNTIL A PROCESS RESTART. MIRRORS THE
	// SINGLE-TERM CRUD.
	invalidate(scope, bookId);
	return { added, updated: rows.length - added };
}

// SAVE ONLY *NEW* TERMS INTO A BOOK'S GLOSSARY — TERMS WHOSE source ALREADY EXISTS IN THE EFFECTIVE
// GLOSSARY (BOOK ∪ GLOBAL OF THE SAME PAIR) ARE SKIPPED, NEVER OVERWRITTEN. KEEPS ESTABLISHED
// TRANSLATIONS STABLE SO EXTRACTION CAN'T "TAMPER" A TERM YOU ALREADY HAVE; IT ONLY ADDS WHAT'S MISSING.
export async function addNewTerms(
	bookId: string,
	terms: TermDraft[],
	// THE CHAPTER THESE TERMS WERE EXTRACTED FROM — STAMPED AS first_chapter_id (FIRST APPEARANCE) ON INSERT.
	chapterId?: number,
): Promise<{ added: number; skipped: number }> {
	if (terms.length === 0) return { added: 0, skipped: 0 };
	const pair = await bookPair(bookId);
	// LOOK UP ONLY THE sources WE'RE ABOUT TO ADD (THIS BOOK'S BOOK ∪ GLOBAL-OF-PAIR), NOT THE WHOLE GLOSSARY.
	const sourceList = [...new Set(terms.map((t) => t.source.trim()).filter(Boolean))];
	const existing = sourceList.length
		? await db
				.select({ source: glossary.source })
				.from(glossary)
				.where(
					and(
						inArray(glossary.source, sourceList),
						or(
							and(
								eq(glossary.scope, 'global'),
								isNull(glossary.bookId),
								eq(glossary.sourceLang, pair.sourceLang),
								eq(glossary.targetLang, pair.targetLang),
							),
							and(eq(glossary.scope, 'book'), eq(glossary.bookId, bookId)),
						),
					),
				)
		: [];
	const known = new Set(existing.map((e) => e.source));
	const freshTerms = terms.filter((t) => !known.has(t.source.trim()));
	const skipped = terms.length - freshTerms.length;
	// STAMP THE first-appearance CHAPTER AND MARK THESE auto-extracted BEFORE PERSISTING (mergeGlossary KEEPS
	// first_chapter_id OUT OF ITS CONFLICT set, SO THIS NEVER OVERWRITES AN EARLIER FIRST APPEARANCE).
	const fresh = freshTerms.map((t) => ({
		...t,
		status: 'ai' as const,
		firstChapterId: chapterId ?? t.firstChapterId ?? null,
	}));
	const { added } = await mergeGlossary('book', bookId, fresh, pair);
	return { added, skipped };
}
