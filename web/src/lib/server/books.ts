// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { desc, eq, inArray, sql } from 'drizzle-orm';
// IMPORTED MODULES
import { db } from './db';
import { books, chapters, pages } from './db/schema';

// -- TYPES -- //

export interface BookSummary {
	id: string;
	title: string;
	titleTarget?: string | null;
	sourceLang: string;
	targetLang: string;
	pinned?: boolean;
	archived?: boolean;
	createdAt?: number;
	updatedAt?: number;
	chapterCount: number;
	translatedChapterCount: number;
	pageCount: number;
	translatedPageCount: number;
	coverPageId: number | null;
	coverHasOutput: boolean;
	lastReadChapter?: {
		id: number;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		status: string;
	} | null;
	firstChapter?: {
		id: number;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		status: string;
	} | null;
	latestChapter?: {
		id: number;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		status: string;
	} | null;
}

export interface ChapterSummary {
	id: number;
	title: string;
	titleTarget?: string | null;
	seq: number;
	status: 'pending' | 'processing' | 'done' | 'error';
	translatedAt?: number | null;
	createdAt?: number;
	pageCount: number;
	translatedPageCount: number;
	coverPageId: number | null;
	coverHasOutput: boolean;
}

export interface BookDetailResult {
	book: {
		id: string;
		title: string;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
		pinned?: boolean;
		archived?: boolean;
		createdAt?: number;
		updatedAt?: number;
	};
	chapters: ChapterSummary[];
}

// -- FUNCTIONS -- //

// VALIDATE THE TARGET BOOK EXISTS — OTHERWISE BOOK-SCOPED ROWS ORPHAN. THROWS 404 WHEN IT IS GONE.
export async function assertBookExists(bookId: string): Promise<void> {
	const [b] = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId)).limit(1);
	if (!b) throw error(404, 'Book not found.');
}

// FETCH ALL BOOKS WITH RICH TELEMETRY & COVER ARTWORK (USED BY /app SSR & /api/books)
export async function getBooksWithTelemetry(
	lastReadMap?: Record<string, { chapterId: number; seq?: number }> | null,
): Promise<BookSummary[]> {
	const rows = db
		.select()
		.from(books)
		.orderBy(
			sql`CASE WHEN ${books.title} = 'Web Quick Imports' AND ${books.pinned} = 1 THEN 1 ELSE 0 END DESC`,
			desc(books.pinned),
			desc(books.updatedAt),
		)
		.all();

	const allChapters = db.select().from(chapters).orderBy(chapters.bookId, chapters.seq).all();
	const allPages = db
		.select({
			id: pages.id,
			chapterId: pages.chapterId,
			seq: pages.seq,
			status: pages.status,
			outputPath: pages.outputPath,
		})
		.from(pages)
		.orderBy(pages.chapterId, pages.seq)
		.all();

	const chaptersByBook = new Map<string, typeof allChapters>();
	for (const ch of allChapters) {
		const list = chaptersByBook.get(ch.bookId) ?? [];
		list.push(ch);
		chaptersByBook.set(ch.bookId, list);
	}

	const pagesByChapter = new Map<number, typeof allPages>();
	for (const pg of allPages) {
		const list = pagesByChapter.get(pg.chapterId) ?? [];
		list.push(pg);
		pagesByChapter.set(pg.chapterId, list);
	}

	return rows.map((b) => {
		const bookChapters = chaptersByBook.get(b.id) ?? [];
		const chapterCount = bookChapters.length;

		let pageCount = 0;
		let translatedPageCount = 0;
		let translatedChapterCount = 0;

		for (const c of bookChapters) {
			const chPages = pagesByChapter.get(c.id) ?? [];
			const chTotal = chPages.length;
			const chDone = chPages.filter((p) => p.status === 'done' || Boolean(p.outputPath)).length;

			pageCount += chTotal;
			translatedPageCount += chDone;

			const isChapterDone = chTotal > 0 && (c.status === 'done' || chDone === chTotal);
			if (isChapterDone) {
				translatedChapterCount++;
			}
		}

		// LAST READ CHAPTER (RESOLVED FROM COOKIE MAP IF PRESENT)
		const cookieTarget = lastReadMap ? lastReadMap[b.id] : null;
		const lastReadCh = cookieTarget?.chapterId
			? bookChapters.find((c) => c.id === cookieTarget.chapterId) ?? null
			: null;

		// COVER THUMBNAIL: PREFER LAST READ CHAPTER IF IT HAS PAGES, ELSE FIRST CHAPTER WITH PAGES
		let coverPage: (typeof allPages)[0] | null = null;
		if (lastReadCh) {
			const pgs = pagesByChapter.get(lastReadCh.id) ?? [];
			if (pgs.length > 0) {
				coverPage = pgs[0];
			}
		}

		if (!coverPage) {
			for (const c of bookChapters) {
				const pgs = pagesByChapter.get(c.id) ?? [];
				if (pgs.length > 0) {
					coverPage = pgs[0];
					break;
				}
			}
		}

		// FIRST CHAPTER (FOR BRAND NEW READERS)
		const firstChapter = bookChapters[0] ?? null;

		// LATEST CHAPTER
		const lastChapter = bookChapters[bookChapters.length - 1] ?? null;

		return {
			id: b.id,
			title: b.title,
			titleTarget: b.titleTarget,
			sourceLang: b.sourceLang,
			targetLang: b.targetLang,
			pinned: b.pinned,
			archived: b.archived,
			createdAt: b.createdAt,
			updatedAt: b.updatedAt,
			chapterCount,
			translatedChapterCount,
			pageCount,
			translatedPageCount,
			coverPageId: coverPage?.id ?? null,
			coverHasOutput: !!coverPage?.outputPath,
			lastReadChapter: lastReadCh
				? {
						id: lastReadCh.id,
						seq: lastReadCh.seq,
						title: lastReadCh.title,
						titleTarget: lastReadCh.titleTarget,
						status: lastReadCh.status,
					}
				: null,
			firstChapter: firstChapter
				? {
						id: firstChapter.id,
						seq: firstChapter.seq,
						title: firstChapter.title,
						titleTarget: firstChapter.titleTarget,
						status: firstChapter.status,
					}
				: null,
			latestChapter: lastChapter
				? {
						id: lastChapter.id,
						seq: lastChapter.seq,
						title: lastChapter.title,
						titleTarget: lastChapter.titleTarget,
						status: lastChapter.status,
					}
				: null,
		};
	});
}

// FETCH A SINGLE BOOK WITH ALL ITS CHAPTERS & CHAPTER PAGE TELEMETRY (USED BY /app/books/[id] SSR & API)
export async function getBookDetails(bookId: string): Promise<BookDetailResult> {
	await assertBookExists(bookId);
	const book = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!book) throw error(404, 'Book not found.');

	const list = db
		.select({
			id: chapters.id,
			title: chapters.title,
			titleTarget: chapters.titleTarget,
			seq: chapters.seq,
			status: chapters.status,
			translatedAt: chapters.translatedAt,
			createdAt: chapters.createdAt,
		})
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(chapters.seq)
		.all();

	const chapterIds = list.map((c) => c.id);
	const chapterPages =
		chapterIds.length > 0
			? db
					.select({
						id: pages.id,
						chapterId: pages.chapterId,
						seq: pages.seq,
						status: pages.status,
						outputPath: pages.outputPath,
					})
					.from(pages)
					.where(inArray(pages.chapterId, chapterIds))
					.orderBy(pages.chapterId, pages.seq)
					.all()
			: [];

	const pagesByChapter = new Map<number, typeof chapterPages>();
	for (const p of chapterPages) {
		const arr = pagesByChapter.get(p.chapterId) ?? [];
		arr.push(p);
		pagesByChapter.set(p.chapterId, arr);
	}

	return {
		book,
		chapters: list.map((c) => {
			const pgs = pagesByChapter.get(c.id) ?? [];
			const pageCount = pgs.length;
			const translatedPageCount = pgs.filter((p) => p.status === 'done' || Boolean(p.outputPath)).length;
			const firstPage = pgs[0] ?? null;
			const isDone = pageCount > 0 && (c.status === 'done' || translatedPageCount === pageCount);
			const effectiveStatus: 'pending' | 'processing' | 'done' | 'error' =
				pageCount === 0
					? 'pending'
					: isDone
						? 'done'
						: c.status === 'done'
							? 'pending'
							: (c.status as 'pending' | 'processing' | 'done' | 'error');
			return {
				...c,
				status: effectiveStatus,
				pageCount,
				translatedPageCount,
				coverPageId: firstPage?.id ?? null,
				coverHasOutput: !!firstPage?.outputPath,
			};
		}),
	};
}
