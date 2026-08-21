// CHAPTER MUTATIONS: CREATION, UPLOADS, DELETIONS, REORDERING, AND PAGE SEQUENCING
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, rmSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { error } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { books, chapters, pages, regions, translations } from '../db/schema';
import { clearChapterJob } from '../translation-service';
import { DATA_ROOT } from '../paths';
import { convertBufferToWebP } from './dimensions';

// GLOBAL WEBP POLICY: EVERY UPLOAD IS CONVERTED TO WEBP ON IMPORT (ONLY A STATIC
// WEBP IS KEPT AS-IS). THESE ARE THE ACCEPTED INPUT EXTENSIONS. HEIC DECODE IS
// OS-GATED (ImageIO / WIC) — ON UNSUPPORTED HOSTS THE CONVERSION FAILS CLEANLY
// WITH A 400 RATHER THAN STORING A RAW FILE.
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.heic', '.heif']);

export async function assertChapterExists(chapterId: number): Promise<{ id: number; bookId: string; title: string; seq: number }> {
	const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!chapter) throw error(404, 'Chapter not found.');
	return chapter;
}

export async function createChapter(bookId: string, title: string): Promise<{ id: number; seq: number }> {
	const max = db
		.select({ seq: chapters.seq })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(desc(chapters.seq))
		.limit(1)
		.get();
	const seq = (max?.seq ?? -1) + 1;
	const finalTitle = title && title.trim() ? title.trim() : `Chapter ${seq + 1}`;
	const row = db
		.insert(chapters)
		.values({ uuid: randomUUID(), bookId, seq, title: finalTitle })
		.returning()
		.get();

	const book = db.select({ id: books.id, title: books.title }).from(books).where(eq(books.id, bookId)).get();
	const isQuickImports = book?.title === 'Web Quick Imports';
	db.update(books)
		.set({
			updatedAt: Date.now(),
			...(isQuickImports ? { pinned: true } : {})
		})
		.where(eq(books.id, bookId))
		.run();

	return { id: row.id, seq: row.seq };
}

export function nextPageSeq(chapterId: number): number {
	const max = db
		.select({ seq: pages.seq })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(desc(pages.seq))
		.limit(1)
		.get();
	return (max?.seq ?? -1) + 1;
}

export function compactChapterPageSeqs(chapterId: number): void {
	const currentRows = db
		.select({ id: pages.id, seq: pages.seq })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(asc(pages.seq), asc(pages.id))
		.all();

	let needsReindex = false;
	for (let i = 0; i < currentRows.length; i++) {
		if (currentRows[i].seq !== i) {
			needsReindex = true;
			break;
		}
	}

	if (needsReindex) {
		const pageIds = currentRows.map((r) => r.id);
		db.transaction(() => {
			for (let i = 0; i < pageIds.length; i++) {
				db.update(pages)
					.set({ seq: -(i + 1000) })
					.where(eq(pages.id, pageIds[i]))
					.run();
			}
			for (let i = 0; i < pageIds.length; i++) {
				db.update(pages)
					.set({ seq: i })
					.where(eq(pages.id, pageIds[i]))
					.run();
			}
		});
	}
}

export async function uploadPages(chapterId: number, files: File[]): Promise<number> {
	let count = 0;
	let seq = nextPageSeq(chapterId);
	const uploadDir = join(DATA_ROOT, 'uploads', String(chapterId));
	mkdirSync(uploadDir, { recursive: true });
	for (const file of files) {
		const ext = extname(file.name).toLowerCase();
		if (!ALLOWED_EXT.has(ext)) throw error(400, `Unsupported image type "${ext}" — use PNG/JPEG/WebP/AVIF/HEIC.`);
		const rawBuf = Buffer.from(await file.arrayBuffer());
		let webpBuf: Buffer;
		let finalExt: string;
		let width: number | null = null;
		let height: number | null = null;
		try {
			const converted = await convertBufferToWebP(rawBuf, ext);
			webpBuf = converted.data;
			finalExt = converted.ext;
			width = converted.width;
			height = converted.height;
		} catch (e) {
			throw error(400, `"${file.name}" could not be converted to WebP (${(e as Error).message}). Re-export it as PNG, JPEG, or WebP.`);
		}
		const fileName = `${randomUUID()}${finalExt}`;
		writeFileSync(join(uploadDir, fileName), webpBuf);
		db.insert(pages)
			.values({
				chapterId,
				seq,
				filePath: `uploads/${chapterId}/${fileName}`,
				width: width ?? null,
				height: height ?? null,
			})
			.run();
		seq++;
		count++;
	}
	compactChapterPageSeqs(chapterId);

	const ch = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, chapterId)).get();
	if (ch) {
		const book = db.select({ id: books.id, title: books.title }).from(books).where(eq(books.id, ch.bookId)).get();
		const isQuickImports = book?.title === 'Web Quick Imports';
		db.update(books)
			.set({
				updatedAt: Date.now(),
				...(isQuickImports ? { pinned: true } : {})
			})
			.where(eq(books.id, ch.bookId))
			.run();
	}

	return count;
}

export function reorderPages(chapterId: number, pageIds: number[]): void {
	const existing = db
		.select({ id: pages.id })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(asc(pages.seq), asc(pages.id))
		.all();

	const existingIdSet = new Set(existing.map((p) => p.id));
	const orderedIds: number[] = [];
	const seen = new Set<number>();

	for (const id of pageIds) {
		if (existingIdSet.has(id) && !seen.has(id)) {
			orderedIds.push(id);
			seen.add(id);
		}
	}

	for (const p of existing) {
		if (!seen.has(p.id)) {
			orderedIds.push(p.id);
			seen.add(p.id);
		}
	}

	db.transaction(() => {
		for (let i = 0; i < orderedIds.length; i++) {
			db.update(pages)
				.set({ seq: -(i + 1000) })
				.where(eq(pages.id, orderedIds[i]))
				.run();
		}
		for (let i = 0; i < orderedIds.length; i++) {
			db.update(pages)
				.set({ seq: i })
				.where(eq(pages.id, orderedIds[i]))
				.run();
		}
	});
}

export function deletePage(pageId: number, dataRoot: string = DATA_ROOT): { chapterId: number; seq: number } {
	prunePageThumbs(pageId, dataRoot);
	const [p] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!p) throw error(404, 'Page not found.');

	const chapterId = p.chapterId;
	const deletedSeq = p.seq;

	db.delete(translations).where(eq(translations.pageId, pageId)).run();
	db.delete(regions).where(eq(regions.pageId, pageId)).run();

	const pathsToUnlink = [p.filePath, p.cleanedPath, p.outputPath].filter(Boolean) as string[];
	for (const rel of pathsToUnlink) {
		try {
			unlinkSync(join(dataRoot, rel));
		} catch {
			// ignore if missing
		}
	}

	db.delete(pages).where(eq(pages.id, pageId)).run();
	compactChapterPageSeqs(chapterId);

	return { chapterId, seq: deletedSeq };
}

// DELETE EVERY CACHED THUMBNAIL FOR A PAGE (THUMBS ARE KEYED BY PAGE ID + REV)
// SO A RESET, DELETE, OR STITCH CANNOT LEAVE STALE ORPHAN FILES BEHIND.
export function prunePageThumbs(pageId: number, dataRoot: string = DATA_ROOT): void {
	const thumbDir = join(dataRoot, 'cache', 'thumbs');
	let entries: string[];
	try {
		entries = readdirSync(thumbDir);
	} catch {
		return; // NO CACHE DIR — NOTHING TO PRUNE
	}
	const prefix = `${pageId}_`;
	for (const f of entries) {
		if (f.startsWith(prefix)) {
			try {
				unlinkSync(join(thumbDir, f));
			} catch {
				// IGNORE IF ALREADY GONE
			}
		}
	}
}

export function resetPageProgress(pageId: number, dataRoot: string = DATA_ROOT): void {
	prunePageThumbs(pageId, dataRoot);
	const pageRow = db
		.select({ cleanedPath: pages.cleanedPath, outputPath: pages.outputPath })
		.from(pages)
		.where(eq(pages.id, pageId))
		.get();

	if (pageRow) {
		const filesToUnlink = [pageRow.cleanedPath, pageRow.outputPath].filter(Boolean) as string[];
		for (const rel of filesToUnlink) {
			try {
				unlinkSync(join(dataRoot, rel));
			} catch {
				// ignore if file already missing
			}
		}
	}

	db.delete(translations).where(eq(translations.pageId, pageId)).run();
	db.delete(regions).where(eq(regions.pageId, pageId)).run();
	db.update(pages)
		.set({
			status: 'pending',
			cleanedPath: null,
			outputPath: null,
			error: null,
			width: null,
			height: null,
		})
		.where(eq(pages.id, pageId))
		.run();
}

export function resetChapterProgress(chapterId: number, dataRoot: string = DATA_ROOT): number {
	clearChapterJob(chapterId);
	const rows = db.select({ id: pages.id }).from(pages).where(eq(pages.chapterId, chapterId)).all();
	for (const row of rows) resetPageProgress(row.id, dataRoot);

	for (const folder of ['clean', 'output']) {
		const dir = join(dataRoot, folder, String(chapterId));
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	db.update(chapters)
		.set({
			status: 'pending',
			translatedAt: null,
		})
		.where(eq(chapters.id, chapterId))
		.run();
	return rows.length;
}

export function resetAllBookProgress(bookId: string, dataRoot: string = DATA_ROOT): { chaptersReset: number; pagesReset: number } {
	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();

	let pagesReset = 0;
	for (const ch of chapterRows) {
		pagesReset += resetChapterProgress(ch.id, dataRoot);
	}
	return { chaptersReset: chapterRows.length, pagesReset };
}

export async function deleteAllChapterPages(
	chapterId: number,
	dataRoot: string = DATA_ROOT,
): Promise<{ deletedCount: number }> {
	const pageRows = db
		.select({ id: pages.id, filePath: pages.filePath })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.all();

	const oldFilePaths = pageRows.map((p) => join(dataRoot, p.filePath));

	db.transaction(() => {
		for (const p of pageRows) {
			db.delete(translations).where(eq(translations.pageId, p.id)).run();
			db.delete(regions).where(eq(regions.pageId, p.id)).run();
		}
		db.delete(pages).where(eq(pages.chapterId, chapterId)).run();
		db.update(chapters)
			.set({ status: 'pending', translatedAt: null })
			.where(eq(chapters.id, chapterId))
			.run();
	});

	for (const p of pageRows) {
		prunePageThumbs(p.id, dataRoot);
	}

	clearChapterJob(chapterId);

	for (const oldPath of oldFilePaths) {
		try {
			unlinkSync(oldPath);
		} catch {
			// ignore missing files
		}
	}
	for (const folder of ['uploads', 'clean', 'output']) {
		const dir = join(dataRoot, folder, String(chapterId));
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	return { deletedCount: pageRows.length };
}

export async function deleteAllBookChapters(
	bookId: string,
	dataRoot: string = DATA_ROOT,
): Promise<{ deletedCount: number }> {
	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();

	for (const ch of chapterRows) {
		await deleteAllChapterPages(ch.id, dataRoot);
		clearChapterJob(ch.id);
		db.delete(chapters).where(eq(chapters.id, ch.id)).run();
	}

	return { deletedCount: chapterRows.length };
}
