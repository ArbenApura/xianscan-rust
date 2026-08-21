// MIHON / TACHIYOMI EXTENSION API — JSON SHAPES MIRRORING SMANGA / SCHAPTER / PAGE.
// IMPORTED DEP-MODULES
import { desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
// IMPORTED MODULES
import { db } from './db';
import { books, chapters, pages, type Book } from './db/schema';
import { parseTags } from '$lib/utils/tags';

// -- CONSTANTS -- //

const PAGE_SIZE = 50;

// -- TYPES -- //

export interface MihonBookDto {
	id: string;
	url: string;
	title: string;
	author: string | null;
	artist: string | null;
	description: string | null;
	genre: string;
	status: string;
	thumbnailUrl: string;
	initialized: boolean;
	updatedAt: number;
}

export interface MihonChapterDto {
	url: string;
	name: string;
	dateUpload: number;
	chapterNumber: number;
}

export interface MihonPageDto {
	index: number;
	imageUrl: string;
}

export interface MihonListResult {
	books: MihonBookDto[];
	hasNextPage: boolean;
}

export interface MihonListQuery {
	q?: string;
	genre?: string;
	status?: string;
}

// -- FUNCTIONS -- //

function bookToDto(b: Book): MihonBookDto {
	const tags = parseTags(b.tags);
	return {
		id: b.id,
		url: `/api/mihon/manga/${b.id}`,
		title: b.titleTarget || b.title,
		author: b.author ?? null,
		artist: b.artist ?? null,
		description: b.description ?? null,
		genre: tags.join(', '),
		status: b.status,
		thumbnailUrl: `/api/covers/${b.id}/file?w=512`,
		initialized: true,
		updatedAt: b.updatedAt,
	};
}

function queryBooks(page: number, opts: MihonListQuery): MihonListResult {
	const safePage = Math.max(1, Math.floor(page) || 1);
	let rows = db
		.select()
		.from(books)
		.where(eq(books.archived, false))
		.orderBy(desc(books.updatedAt))
		.all();

	if (opts.q) {
		const q = opts.q.trim().toLowerCase();
		rows = rows.filter(
			(b) =>
				b.title.toLowerCase().includes(q) ||
				(b.titleTarget ?? '').toLowerCase().includes(q) ||
				(b.author ?? '').toLowerCase().includes(q) ||
				(b.artist ?? '').toLowerCase().includes(q),
		);
	}
	if (opts.status) {
		rows = rows.filter((b) => b.status === opts.status);
	}
	if (opts.genre) {
		const wanted = opts.genre.trim().toLowerCase();
		rows = rows.filter((b) => parseTags(b.tags).some((t) => t.toLowerCase() === wanted));
	}

	const start = (safePage - 1) * PAGE_SIZE;
	const slice = rows.slice(start, start + PAGE_SIZE);
	return {
		books: slice.map((b) => bookToDto(b)),
		hasNextPage: start + PAGE_SIZE < rows.length,
	};
}

export function getLibraryPage(page: number, opts: MihonListQuery): MihonListResult {
	return queryBooks(page, opts);
}

export function getSearchPage(page: number, opts: MihonListQuery): MihonListResult {
	return queryBooks(page, opts);
}

export function getMangaDetail(bookId: string): MihonBookDto {
	const row = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!row) throw error(404, 'Book not found.');
	return bookToDto(row);
}

export function getChaptersDto(bookId: string): MihonChapterDto[] {
	const book = db.select({ id: books.id }).from(books).where(eq(books.id, bookId)).get();
	if (!book) throw error(404, 'Book not found.');
	const list = db.select().from(chapters).where(eq(chapters.bookId, bookId)).orderBy(chapters.seq).all();
	return list.map((c) => ({
		url: `/api/mihon/chapters/${c.id}`,
		name: c.titleTarget || c.title || `Ch. ${c.seq + 1}`,
		dateUpload: c.translatedAt ?? c.createdAt,
		chapterNumber: c.seq + 1,
	}));
}

export function getPagesDto(chapterId: number): MihonPageDto[] {
	const chapter = db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!chapter) throw error(404, 'Chapter not found.');
	const list = db.select().from(pages).where(eq(pages.chapterId, chapterId)).orderBy(pages.seq).all();
	return list.map((p) => {
		const useOutput = Boolean(p.outputPath);
		const rev = useOutput ? p.outputRev : p.originalRev;
		return {
			index: p.seq,
			imageUrl: `/api/pages/${p.id}/file?kind=${useOutput ? 'output' : 'original'}&rev=${rev}`,
		};
	});
}

export function getGenresDto(): string[] {
	const all = db.select({ tags: books.tags }).from(books).where(eq(books.archived, false)).all();
	const set = new Set<string>();
	for (const b of all) {
		for (const t of parseTags(b.tags)) set.add(t);
	}
	return Array.from(set).sort();
}
