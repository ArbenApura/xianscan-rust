// ONE PLACE THAT TURNS SETTINGS INTO TYPESET OPTIONS (FEAT-006 PHASE 7). PRECEDENCE FOR EVERY FIELD: THE REQUEST'S
// OWN OPTIONS, THEN THE SETTINGS COOKIE, THEN THE CANONICAL (SERVER) SETTINGS, THEN THE DEFAULT.
// IMPORTED DEP-TYPES
import type { Cookies } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { DEFAULTS, sanitizeAccentFonts, sanitizeScriptFonts, type AppSettings } from '$lib/stores/settings';
import { detectSourceLanguage, typesetScriptForBook, type Script } from '$lib/languages';
import type { ScriptFontSlot } from '$lib/typeset-scripts';
import { db } from '../db';
import { books, chapters, pages, regions } from '../db/schema';
import type { TypesetOptions } from '../typeset';

// -- TYPES -- //

type UserTypesetOptions = Partial<TypesetOptions> & {
	fontFamily?: string;
	outline?: TypesetOptions['outlineMode'];
	scriptFonts?: Partial<Record<ScriptFontSlot, string>>;
	[key: string]: unknown;
};

export interface BuildTypesetOptionsInput {
	canonical: AppSettings;
	cookies?: Pick<Cookies, 'get'>;
	userOpts?: UserTypesetOptions;
	targetScript?: Script;
}

// -- FUNCTIONS -- //

export function buildTypesetOptions({ canonical, cookies, userOpts, targetScript }: BuildTypesetOptionsInput): TypesetOptions {
	const cookie = (name: string) => cookies?.get(name) || undefined;
	const u = userOpts ?? {};
	const bool = (value: string | undefined) => (value === undefined ? undefined : value === 'true');

	const italicFromUser =
		u.fontStyle ?? (typeof u.enableItalic === 'boolean' ? (u.enableItalic ? 'italic' : 'normal') : undefined);
	const italicCookie = bool(cookie('mt_ts_italic'));
	// LEGACY CJK FONT: ONLY FROM AN OLD CLIENT THAT SENDS fontCjk AND NO scriptFonts. THE STORED typesetCjkFont IS
	// NEVER READ HERE: THE SETTINGS MIGRATION ALREADY MOVED IT INTO THE SLOTS, SO READING IT AGAIN WOULD REFILL A
	// SLOT THE USER SET BACK TO "AUTOMATIC".
	const legacyCjk =
		u.scriptFonts === undefined && typeof u.fontCjk === 'string' && u.fontCjk.trim() && u.fontCjk !== DEFAULTS.typesetCjkFont
			? u.fontCjk
			: undefined;

	return {
		fontDialogue: u.fontDialogue || u.fontFamily || cookie('mt_ts_font') || canonical.typesetFont || DEFAULTS.typesetFont,
		// ONLY AN EXPLICIT LEGACY REQUEST; typesetPage MAPS IT TO THE han / kana / hangul SLOTS THAT ARE UNSET
		fontCjk: legacyCjk,
		scriptFonts: sanitizeScriptFonts(u.scriptFonts ?? canonical.typesetScriptFonts),
		targetScript,
		boxInset:
			typeof u.boxInset === 'number'
				? u.boxInset
				: cookie('mt_ts_padding') !== undefined
					? Number(cookie('mt_ts_padding'))
					: (canonical.typesetPadding ?? DEFAULTS.typesetPadding),
		outlineMode: (u.outlineMode || u.outline || cookie('mt_ts_outline') || canonical.typesetOutline || DEFAULTS.typesetOutline) as TypesetOptions['outlineMode'],
		colorMode: (u.colorMode || cookie('mt_ts_contrast') || canonical.typesetContrast || DEFAULTS.typesetContrast) as TypesetOptions['colorMode'],
		casing: (u.casing || cookie('mt_ts_casing') || canonical.typesetCasing || DEFAULTS.typesetCasing) as TypesetOptions['casing'],
		enableRotation:
			typeof u.enableRotation === 'boolean'
				? u.enableRotation
				: (bool(cookie('mt_ts_rot')) ?? canonical.enableTextRotation ?? true),
		fontWeight: (u.fontWeight || cookie('mt_ts_font_weight') || canonical.typesetFontWeight || 'normal') as TypesetOptions['fontWeight'],
		fontStyle:
			italicFromUser ??
			(italicCookie !== undefined ? (italicCookie ? 'italic' : 'normal') : canonical.enableTypesetItalic ? 'italic' : 'normal'),
		...buildAccentOptions(canonical, u),
	};
}

/**
 * THE ACCENT FIELDS (FEAT-010): REQUEST, THEN CANONICAL SETTINGS, THEN DEFAULTS; NO COOKIES (ADR-010). A REQUEST MAP
 * IS SANITISED BECAUSE SOME CALLERS PASS UNVALIDATED BODIES (BATCH, REGION EDIT).
 */
export function buildAccentOptions(
	canonical: AppSettings,
	userOpts: UserTypesetOptions = {},
): Pick<TypesetOptions, 'accentFonts' | 'accentCasing' | 'accentFontWeight' | 'accentInBubbles'> {
	const casing = (value: unknown) => (value === 'uppercase' || value === 'original' || value === 'lowercase' ? value : undefined);
	return {
		accentFonts: sanitizeAccentFonts(userOpts.accentFonts ?? canonical.typesetAccentFonts),
		accentCasing: casing(userOpts.accentCasing) ?? casing(canonical.typesetAccentCasing) ?? DEFAULTS.typesetAccentCasing,
		accentFontWeight: (userOpts.accentFontWeight || canonical.typesetAccentFontWeight || DEFAULTS.typesetAccentFontWeight) as TypesetOptions['accentFontWeight'],
		accentInBubbles:
			typeof userOpts.accentInBubbles === 'boolean' ? userOpts.accentInBubbles : Boolean(canonical.typesetAccentInBubbles ?? DEFAULTS.typesetAccentInBubbles),
	};
}

/** THE SCRIPT A BOOK IS TYPESET IN; AN 'auto' SOURCE IS DETECTED FROM THE CHAPTER'S OCR TEXT. */
function scriptForBook(bookId: string, chapterId: number): Script {
	const book = db.select({ sourceLang: books.sourceLang, targetLang: books.targetLang }).from(books).where(eq(books.id, bookId)).get();
	if (!book) return 'latin';
	let sourceLang = book.sourceLang;
	if (sourceLang === 'auto') {
		const sample = db
			.select({ text: regions.textSource })
			.from(regions)
			.innerJoin(pages, eq(regions.pageId, pages.id))
			.where(eq(pages.chapterId, chapterId))
			.limit(50)
			.all()
			.map((r) => r.text ?? '')
			.join(' ');
		sourceLang = detectSourceLanguage(sample);
	}
	return typesetScriptForBook(book.targetLang, sourceLang);
}

export function targetScriptForChapter(chapterId: number): Script {
	const chapter = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, chapterId)).get();
	return chapter ? scriptForBook(chapter.bookId, chapterId) : 'latin';
}

export function targetScriptForPage(pageId: number): Script {
	const page = db.select({ chapterId: pages.chapterId }).from(pages).where(eq(pages.id, pageId)).get();
	return page ? targetScriptForChapter(page.chapterId) : 'latin';
}
