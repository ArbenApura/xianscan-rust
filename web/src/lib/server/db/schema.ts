// IMPORTED DEP-MODULES
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// -- CONSTANTS -- //

// MS-EPOCH TIMESTAMP COLUMN — integer(mode:'number') KEEPS Date.now() + ALL STAT MATH UNCHANGED (NOT
// timestamptz). HELPER SO EVERY created_at/updated_at/…At COLUMN STAYS A PLAIN JS number.
const epochMs = (name: string) => integer(name, { mode: 'number' });

// A MANHUA BOOK. SINGLE-USER APP - NO OWNERSHIP COLUMNS (xianslate'S userId IS DROPPED).
export const books = sqliteTable(
	'books',
	{
		id: text('id').primaryKey(),
		sourceType: text('source_type', { enum: ['upload', 'manual'] }).notNull().default('upload'),
		// THE BOOK'S OWN TRANSLATION DIRECTION - BCP-47-ISH CODES FROM $lib/languages.
		sourceLang: text('source_lang').notNull(),
		targetLang: text('target_lang').notNull(),
		// TITLE AS WRITTEN IN THE SOURCE LANGUAGE.
		title: text('title').notNull(),
		// TITLE RENDERED INTO THE TARGET LANGUAGE (LAZILY FILLED BY THE PIPELINE).
		titleTarget: text('title_target'),
		// LIBRARY ORGANIZATION: pinned FLOATS A BOOK TO THE TOP OF THE SHELF; archived HIDES IT FROM THE
		// DEFAULT VIEW (RECOVERABLE VIA A FILTER).
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		// EXTENDED BOOK METADATA - FED TO BOTH THE WEB UI AND THE MIHON/TACHIYOMI EXTENSION.
		description: text('description'),
		author: text('author'),
		artist: text('artist'),
		// GENRES/TAGS AS A JSON-ENCODED STRING ARRAY (SAME PRECEDENT AS glossary.aliases).
		tags: text('tags'),
		// MIHON-COMPATIBLE SERIALIZATION STATUS — VALUES MATCH SManga STATUS CONSTANTS.
		status: text('status', {
			enum: ['unknown', 'ongoing', 'completed', 'licensed', 'publishing_finished', 'cancelled', 'on_hiatus'],
		})
			.notNull()
			.default('unknown'),
		// DEDICATED COVER IMAGE — FILE PATH RELATIVE TO DATA_ROOT (NULL = FALL BACK TO PAGE PROXY).
		coverPath: text('cover_path'),
		// MONOTONIC COVER REVISION — BUMPED ON EVERY UPLOAD SO &rev=N URLS CACHE IMMUTABLY.
		coverRev: integer('cover_rev').notNull().default(0),
		// TRUE AFTER THE USER EXPLICITLY REMOVED THE DEDICATED COVER — DISTINGUISHES "DELIBERATELY
		// COVERLESS" (SHOW EMPTY, NO PAGE-PROXY FALLBACK) FROM "NEVER HAD A COVER" (FALL BACK TO PAGE).
		coverCleared: integer('cover_cleared', { mode: 'boolean' }).notNull().default(false),
		// CUSTOM LOCALIZATION DIRECTIVES INJECTED INTO TRANSLATION SYSTEM PROMPTS FOR THIS BOOK
		customPrompt: text('custom_prompt'),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: epochMs('updated_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({ booksArchivedIdx: index('books_archived_idx').on(t.archived) }),
);

// A CHAPTER = AN ORDERED SET OF PAGE IMAGES. STABLE PUBLIC id IS A RANDOM UUID (DECOUPLED FROM THE PK).
export const chapters = sqliteTable(
	'chapters',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		uuid: text('uuid')
			.notNull()
			.$defaultFn(() => crypto.randomUUID()),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		title: text('title').notNull().default(''),
		titleTarget: text('title_target'),
		// 'pending' | 'processing' | 'done' | 'error' — ROLLUP OF THE PAGES' STATES.
		status: text('status', { enum: ['pending', 'processing', 'done', 'error'] }).notNull().default('pending'),
		// WHEN THIS CHAPTER COMPLETED SMART RE-SLICING (NULL/FALSE = NOT RESLICED OR DIRTY)
		resliced: integer('resliced', { mode: 'boolean' }).notNull().default(false),
		reslicedAt: epochMs('resliced_at'),
		// WHEN THIS CHAPTER WAS LAST TRANSLATED (NULL = NEVER) — GATES RE-BILLING.
		translatedAt: epochMs('translated_at'),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		chaptersUuidUnq: uniqueIndex('chapters_uuid_unq').on(t.uuid),
		chaptersBookSeqUnq: uniqueIndex('chapters_book_seq_unq').on(t.bookId, t.seq),
		chaptersBookIdx: index('chapters_book_idx').on(t.bookId),
	}),
);

// ONE PAGE IMAGE OF A CHAPTER. filePath IS RELATIVE TO THE APP DATA ROOT (web/data/).
export const pages = sqliteTable(
	'pages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		chapterId: integer('chapter_id')
			.notNull()
			.references(() => chapters.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		filePath: text('file_path').notNull(),
		width: integer('width'),
		height: integer('height'),
		// 'pending' | 'processing' | 'done' | 'error' — PER-PAGE PIPELINE STATE.
		status: text('status', { enum: ['pending', 'processing', 'done', 'error'] }).notNull().default('pending'),
		// CLEANED (TEXT-ERASED) IMAGE PATH — SET AFTER THE INPAINT STAGE.
		cleanedPath: text('cleaned_path'),
		// FINAL TYPESET IMAGE PATH — THE PIPELINE OUTPUT.
		outputPath: text('output_path'),
		// MONOTONIC CONTENT REVISIONS — BUMPED IN THE SAME TRANSACTION AS ANY FILE WRITE.
		// THE CLIENT EMBEDS THEM IN IMAGE URLS (&rev=N) SO BROWSERS CAN CACHE IMMUTABLY
		// WHILE EDITS ALWAYS FETCH FRESH BYTES.
		cleanedRev: integer('cleaned_rev').notNull().default(0),
		outputRev: integer('output_rev').notNull().default(0),
		// ORIGINAL SOURCE REV — BUMPED WHENEVER filePath BYTES CHANGE IN PLACE
		// (E.G. PAGE STITCH), SO IMMUTABLE-CACHED kind=original URLS GET A FRESH
		// VALUE INSTEAD OF SERVING PRE-MERGE PIXELS.
		originalRev: integer('original_rev').notNull().default(0),
		// JSON-ENCODED DETECTED MANGA / COMIC PANEL FRAMES [{ id, seq, box, polygon }].
		panels: text('panels'),
		// JSON-ENCODED DETECTED ONOMATOPOEIA / SOUND EFFECT FRAMES [{ id, seq, box, score }].
		onomatopoeia: text('onomatopoeia'),
		// RAW LLM PROMPT AND RESPONSE STRINGS FOR DEBUGGING AND INSPECTION.
		llmPrompt: text('llm_prompt'),
		llmResponse: text('llm_response'),
		// RAW OCR PIPELINE DIAGNOSTICS AND TIMING STATS FOR TROUBLESHOOTING.
		ocrStats: text('ocr_stats'),
		error: text('error'),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		pagesChapterSeqUnq: uniqueIndex('pages_chapter_seq_unq').on(t.chapterId, t.seq),
		pagesChapterIdx: index('pages_chapter_idx').on(t.chapterId),
	}),
);

// ONE DETECTED TEXT REGION ON A PAGE (SPEECH BUBBLE / FLOATING TEXT / SFX). box IS A JSON OBJECT
// {x, y, w, h} IN IMAGE PIXELS.
export const regions = sqliteTable(
	'regions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		pageId: integer('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		// {x,y,w,h} JSON — THE DETECTOR'S AXIS-ALIGNED BOX.
		box: text('box').notNull(),
		// {x,y,w,h} JSON — TIER 2 INPAINT MASK BOUNDARY (+6% EXPANSION).
		inpaintBox: text('inpaint_box'),
		// {x,y,w,h} JSON — TIER 3 TYPESETTING LAYOUT BOX (+12% EXPANSION).
		typesetBox: text('typeset_box'),
		// [[x,y],...] JSON — THE DETECTOR'S POLYGON (MORE PRECISE THAN THE BOX FOR INPAINT MASKS).
		polygon: text('polygon'),
		// OCR TEXT IN THE SOURCE LANGUAGE AND THE LLM TRANSLATION INTO THE TARGET LANGUAGE.
		textSource: text('text_source').notNull().default(''),
		textTarget: text('text_target'),
		originalTarget: text('original_target'),
		// 'pending' | 'translated' | 'failed' — TRANSLATION STATE.
		status: text('status', { enum: ['pending', 'translated', 'failed'] }).notNull().default('pending'),
		// OCR CONFIDENCE (0..1) — NULL WHEN UNKNOWN.
		conf: real('conf'),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({ regionsPageIdx: index('regions_page_idx').on(t.pageId) }),
);

// scope='global' (bookId NULL) APPLIES TO EVERY BOOK *OF THE SAME LANGUAGE PAIR*; scope='book' IS PRIVATE
// TO ONE BOOK. EFFECTIVE GLOSSARY FOR A BOOK = global(matching the book's sourceLang+targetLang) UNION
// book, WITH book OVERRIDING global ON THE SAME source. (xianslate MODEL MINUS userId — SINGLE-USER APP.)
export const glossary = sqliteTable(
	'glossary',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		scope: text('scope', { enum: ['global', 'book'] }).notNull(),
		bookId: text('book_id').references(() => books.id, { onDelete: 'cascade' }),
		// THE PAIR THIS TERM BELONGS TO — FILTERS THE EFFECTIVE GLOSSARY TO THE BOOK'S DIRECTION.
		sourceLang: text('source_lang').notNull(),
		targetLang: text('target_lang').notNull(),
		// THE TERM IN THE SOURCE LANGUAGE AND THE TARGET-LANGUAGE RENDERING TO USE FOR IT.
		source: text('source').notNull(),
		target: text('target').notNull(),
		gender: text('gender', { enum: ['neuter', 'masculine', 'feminine'] }).notNull().default('neuter'),
		// SHORT TRANSLATOR-FACING NOTE (e.g. "the protagonist's senior brother"). FED TO THE TRANSLATION
		// PROMPT TO DISAMBIGUATE THE TERM AND SHOWN IN THE GLOSSARY EDITOR.
		context: text('context'),
		tags: text('tags'),
		// WHAT KIND OF ENTITY THIS NAMES — STRUCTURES THE EDITOR (GROUP / FILTER / COLOUR). NULL = UNCATEGORISED.
		category: text('category', {
			enum: [
				'character',
				'location',
				'organization',
				'technique',
				'item',
				'realm',
				'creature',
				'title',
				'concept',
				'other',
			],
		}),
		// HIGH-PRIORITY FLAG — PINNED TERMS LEAD THE TRANSLATION PROMPT, ARE EMPHASISED, AND ARE NEVER TRUNCATED.
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
		// 'ai' (AUTO-EXTRACTED, UNREVIEWED) vs 'user' (HUMAN-ADDED OR EDITED, AUTHORITATIVE).
		status: text('status', { enum: ['ai', 'user'] }).notNull().default('ai'),
		// ALTERNATE SOURCE FORMS OF THE SAME ENTITY (EPITHETS / SHORT FORMS), JSON-ENCODED ARRAY.
		aliases: text('aliases'),
		// THE CHAPTER WHERE THIS TERM WAS FIRST EXTRACTED. SET-NULL (NOT CASCADE) SO DELETING THAT CHAPTER
		// KEEPS THE TERM. IMMUTABLE ONCE SET (NEVER UPDATED ON CONFLICT).
		firstChapterId: integer('first_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: epochMs('updated_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		// PARTIAL UNIQUE INDEXES — ONE GLOBAL source PER (LANGUAGE PAIR), ONE source PER BOOK.
		glossaryGlobalUnq: uniqueIndex('glossary_global_unq')
			.on(t.sourceLang, t.targetLang, t.source)
			.where(sql`${t.scope} = 'global'`),
		glossaryBookUnq: uniqueIndex('glossary_book_unq').on(t.bookId, t.source).where(sql`${t.scope} = 'book'`),
		glossaryBookIdx: index('glossary_book_idx').on(t.bookId),
		// SCOPE INTEGRITY — A BOOK TERM MUST NAME A BOOK; A GLOBAL TERM MUST NOT.
		glossaryScopeCheck: check(
			'glossary_scope_check',
			sql`(${t.scope} = 'global' AND ${t.bookId} IS NULL) OR (${t.scope} = 'book' AND ${t.bookId} IS NOT NULL)`,
		),
	}),
);

// MEMOIZED TRANSLATIONS KEYED BY content+glossary+model+prompt FINGERPRINT. contentTarget IS THE JSON
// MAP OF regionSeq → translated text FOR THE PAGE.
export const translations = sqliteTable(
	'translations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		pageId: integer('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		cacheKey: text('cache_key').notNull(),
		contentTarget: text('content_target').notNull(),
		model: text('model').notNull(),
		promptTokens: integer('prompt_tokens'),
		cachedTokens: integer('cached_tokens'),
		completionTokens: integer('completion_tokens'),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		// PER-PAGE CACHE UNIQUENESS: THE KEY (content+glossary+model fingerprint) IS SHARED BY
		// IDENTICAL PAGES, SO THE UNIQUE CONSTRAINT MUST INCLUDE pageId — OTHERWISE A SECOND
		// IDENTICAL PAGE'S SAVE NO-OPS (onConflictDoNothing) AND IT NEVER GETS A CACHE ROW.
		translationsPageCacheKeyUnq: uniqueIndex('translations_page_cache_key_unq').on(t.pageId, t.cacheKey),
		translationsPageIdx: index('translations_page_idx').on(t.pageId),
	}),
);

// LEDGER OF AI TOKEN USAGE OUTSIDE THE translations CACHE — 'extract' | 'title' | 'term' | 'repair' PIPELINE
// CALLS. RECORDED AT THE CALL SITE EVEN IF THE OVERALL JOB LATER FAILS.
export const aiUsage = sqliteTable(
	'ai_usage',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		kind: text('kind').notNull(),
		// THE PAGE THIS SPEND BELONGS TO (NULL FOR NON-PAGE CALLS LIKE A BOOK-TITLE BACKFILL).
		pageId: integer('page_id').references(() => pages.id, { onDelete: 'cascade' }),
		model: text('model').notNull(),
		promptTokens: integer('prompt_tokens').notNull().default(0),
		cachedTokens: integer('cached_tokens').notNull().default(0),
		completionTokens: integer('completion_tokens').notNull().default(0),
		createdAt: epochMs('created_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		aiUsageCreatedIdx: index('ai_usage_created_idx').on(t.createdAt),
		aiUsagePageIdx: index('ai_usage_page_idx').on(t.pageId),
	}),
);

// AI TRANSLATION PROVIDERS (DEEPSEEK, GOOGLE AI STUDIO, ETC.) STORED DIRECTLY IN SQLITE.
export const aiProviders = sqliteTable('ai_providers', {
	id: text('id').primaryKey(), // 'deepseek' | 'google'
	name: text('name').notNull(), // 'DeepSeek' | 'Google AI Studio'
	apiKey: text('api_key').notNull().default(''),
	baseUrl: text('base_url').notNull(),
	activeModel: text('active_model').notNull(),
	availableModels: text('available_models').notNull().default('[]'),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	createdAt: epochMs('created_at')
		.notNull()
		.$defaultFn(() => Date.now()),
	updatedAt: epochMs('updated_at')
		.notNull()
		.$defaultFn(() => Date.now()),
});

// CANONICAL SERVER SETTINGS STORED AS KEY-VALUE PAIRS IN SQLITE
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: epochMs('updated_at')
		.notNull()
		.$defaultFn(() => Date.now()),
});

// CROSS-DEVICE READING PROGRESS HISTORY PER BOOK
export const readingHistory = sqliteTable(
	'reading_history',
	{
		bookId: text('book_id')
			.primaryKey()
			.references(() => books.id, { onDelete: 'cascade' }),
		chapterId: integer('chapter_id')
			.notNull()
			.references(() => chapters.id, { onDelete: 'cascade' }),
		chapterSeq: integer('chapter_seq').notNull().default(0),
		pageSeq: integer('page_seq').notNull().default(0),
		totalPages: integer('total_pages').notNull().default(0),
		completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
		updatedAt: epochMs('updated_at')
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		readingHistoryUpdatedIdx: index('reading_history_updated_idx').on(t.updatedAt),
		readingHistoryChapterIdx: index('reading_history_chapter_idx').on(t.chapterId),
	}),
);

// -- TYPES -- //

export type Book = typeof books.$inferSelect;

export type NewBook = typeof books.$inferInsert;

export type Chapter = typeof chapters.$inferSelect;

export type NewChapter = typeof chapters.$inferInsert;

export type Page = typeof pages.$inferSelect;

export type NewPage = typeof pages.$inferInsert;

export type Region = typeof regions.$inferSelect;

export type NewRegion = typeof regions.$inferInsert;

export type GlossaryEntry = typeof glossary.$inferSelect;

export type NewGlossaryEntry = typeof glossary.$inferInsert;

export type Translation = typeof translations.$inferSelect;

export type AiUsage = typeof aiUsage.$inferSelect;

export type AiProvider = typeof aiProviders.$inferSelect;

export type NewAiProvider = typeof aiProviders.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;

export type NewAppSetting = typeof appSettings.$inferInsert;

export type ReadingHistoryEntry = typeof readingHistory.$inferSelect;

export type NewReadingHistoryEntry = typeof readingHistory.$inferInsert;

