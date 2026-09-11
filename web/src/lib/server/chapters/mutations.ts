// CHAPTER MUTATIONS: CREATION, UPLOADS, DELETIONS, REORDERING, AND PAGE SEQUENCING
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { error } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { books, chapters, pages, regions, translations } from '../db/schema';
import { clearChapterJob } from '../translation-service';
import { batchService } from '../batch-service';
import { DATA_ROOT } from '../paths';
import { deleteCover, pruneCoverThumbs } from '../covers';
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

export function markChapterResliceDirty(chapterId: number): void {
	db.update(chapters)
		.set({ resliced: false, reslicedAt: null })
		.where(eq(chapters.id, chapterId))
		.run();
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
	markChapterResliceDirty(chapterId);

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
		markChapterResliceDirty(chapterId);
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

	const pathsToUnlink = [p.filePath, p.cleanedPath, p.outputPath, p.annotatedPath].filter(Boolean) as string[];
	for (const rel of pathsToUnlink) {
		try {
			unlinkSync(join(dataRoot, rel));
		} catch {
			// ignore if missing
		}
	}

	db.delete(pages).where(eq(pages.id, pageId)).run();
	compactChapterPageSeqs(chapterId);
	markChapterResliceDirty(chapterId);

	const ch = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, chapterId)).get();
	if (ch) {
		pruneCoverThumbs(ch.bookId, dataRoot);
	}

	return { chapterId, seq: deletedSeq };
}

// BATCH PRUNE CACHED THUMBNAILS FOR MULTIPLE PAGES IN A SINGLE DIRECTORY SCAN
export function pruneMultiplePageThumbs(pageIds: number[], dataRoot: string = DATA_ROOT): void {
	if (pageIds.length === 0) return;
	const thumbDir = join(dataRoot, 'cache', 'thumbs');
	let entries: string[];
	try {
		entries = readdirSync(thumbDir);
	} catch {
		return;
	}
	const idSet = new Set(pageIds);
	for (const f of entries) {
		const underscoreIdx = f.indexOf('_');
		if (underscoreIdx > 0) {
			const id = Number(f.slice(0, underscoreIdx));
			if (idSet.has(id)) {
				try {
					unlinkSync(join(thumbDir, f));
				} catch {
					// IGNORE IF ALREADY GONE
				}
			}
		}
	}
}

// DELETE EVERY CACHED THUMBNAIL FOR A PAGE (THUMBS ARE KEYED BY PAGE ID + REV)
// SO A RESET, DELETE, OR STITCH CANNOT LEAVE STALE ORPHAN FILES BEHIND.
export function prunePageThumbs(pageId: number, dataRoot: string = DATA_ROOT): void {
	pruneMultiplePageThumbs([pageId], dataRoot);
}

export function resetPageProgress(pageId: number, dataRoot: string = DATA_ROOT): void {
	prunePageThumbs(pageId, dataRoot);
	const pageRow = db
		.select({
			chapterId: pages.chapterId,
			cleanedPath: pages.cleanedPath,
			outputPath: pages.outputPath,
			annotatedPath: pages.annotatedPath,
		})
		.from(pages)
		.where(eq(pages.id, pageId))
		.get();

	if (pageRow) {
		const filesToUnlink = [pageRow.cleanedPath, pageRow.outputPath, pageRow.annotatedPath].filter(Boolean) as string[];
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
			annotatedPath: null,
			error: null,
			width: null,
			height: null,
		})
		.where(eq(pages.id, pageId))
		.run();

	if (pageRow?.chapterId) {
		const remaining = db
			.select({ status: pages.status, outputPath: pages.outputPath })
			.from(pages)
			.where(eq(pages.chapterId, pageRow.chapterId))
			.all();
		const allDone = remaining.length > 0 && remaining.every((p) => p.status === 'done' || Boolean(p.outputPath));
		if (!allDone) {
			db.update(chapters)
				.set({
					status: 'pending',
					translatedAt: null,
				})
				.where(eq(chapters.id, pageRow.chapterId))
				.run();
		}

		const ch = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, pageRow.chapterId)).get();
		if (ch) {
			pruneCoverThumbs(ch.bookId, dataRoot);
		}
	}
}

export function resetChapterProgress(chapterId: number, dataRoot: string = DATA_ROOT): number {
	clearChapterJob(chapterId);
	batchService.resetChapter(chapterId);
	const rows = db.select({ id: pages.id }).from(pages).where(eq(pages.chapterId, chapterId)).all();
	for (const row of rows) resetPageProgress(row.id, dataRoot);

	for (const folder of ['clean', 'output', 'annotated']) {
		const dir = join(dataRoot, folder, String(chapterId));
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// IGNORE
		}
	}

	db.update(chapters)
		.set({
			status: 'pending',
			translatedAt: null,
			resliced: false,
			reslicedAt: null,
		})
		.where(eq(chapters.id, chapterId))
		.run();

	const ch = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, chapterId)).get();
	if (ch) {
		pruneCoverThumbs(ch.bookId, dataRoot);
	}

	return rows.length;
}

export function resetAllBookProgress(bookId: string, dataRoot: string = DATA_ROOT): { chaptersReset: number; pagesReset: number } {
	batchService.clearBook(bookId);
	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();

	let pagesReset = 0;
	for (const ch of chapterRows) {
		pagesReset += resetChapterProgress(ch.id, dataRoot);
	}

	pruneCoverThumbs(bookId, dataRoot);

	return { chaptersReset: chapterRows.length, pagesReset };
}

export async function deleteAllChapterPages(
	chapterId: number,
	dataRoot: string = DATA_ROOT,
): Promise<{ deletedCount: number }> {
	// HALT ANY RUNNING BACKGROUND IN-FLIGHT JOBS BEFORE MODIFYING DATABASE OR DISK
	clearChapterJob(chapterId);
	batchService.resetChapter(chapterId);

	const pageRows = db
		.select({ id: pages.id, filePath: pages.filePath })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.all();

	const pageIds = pageRows.map((p) => p.id);
	const oldFilePaths = pageRows.map((p) => join(dataRoot, p.filePath));

	db.transaction(() => {
		for (const p of pageRows) {
			db.delete(translations).where(eq(translations.pageId, p.id)).run();
			db.delete(regions).where(eq(regions.pageId, p.id)).run();
		}
		db.delete(pages).where(eq(pages.chapterId, chapterId)).run();
		db.update(chapters)
			.set({ status: 'pending', translatedAt: null, resliced: false, reslicedAt: null })
			.where(eq(chapters.id, chapterId))
			.run();
	});

	pruneMultiplePageThumbs(pageIds, dataRoot);

	for (const oldPath of oldFilePaths) {
		try {
			unlinkSync(oldPath);
		} catch {
			// IGNORE MISSING FILES
		}
	}
	for (const folder of ['uploads', 'clean', 'output', 'annotated']) {
		const dir = join(dataRoot, folder, String(chapterId));
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// IGNORE
		}
	}

	const ch = db.select({ bookId: chapters.bookId }).from(chapters).where(eq(chapters.id, chapterId)).get();
	if (ch) {
		pruneCoverThumbs(ch.bookId, dataRoot);
	}

	return { deletedCount: pageRows.length };
}

// COMPACT CHAPTER SEQUENCE NUMBERS FOR A BOOK TO BE 0-INDEXED AND CONTIGUOUS
export function compactBookChapterSeqs(bookId: string): void {
	const currentRows = db
		.select({ id: chapters.id, seq: chapters.seq })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(asc(chapters.seq), asc(chapters.id))
		.all();

	let needsReindex = false;
	for (let i = 0; i < currentRows.length; i++) {
		if (currentRows[i].seq !== i) {
			needsReindex = true;
			break;
		}
	}

	if (needsReindex) {
		const chapterIds = currentRows.map((r) => r.id);
		db.transaction(() => {
			for (let i = 0; i < chapterIds.length; i++) {
				db.update(chapters)
					.set({ seq: -(i + 1000) })
					.where(eq(chapters.id, chapterIds[i]))
					.run();
			}
			for (let i = 0; i < chapterIds.length; i++) {
				db.update(chapters)
					.set({ seq: i })
					.where(eq(chapters.id, chapterIds[i]))
					.run();
			}
		});
	}
}

// PERMANENTLY DELETE A CHAPTER AND ALL CONNECTED ARTIFACTS ON DISK
export async function deleteChapter(
	chapterId: number,
	dataRoot: string = DATA_ROOT,
): Promise<{ id: number; bookId: string; title: string }> {
	const chapter = await assertChapterExists(chapterId);

	// PURGE ALL PAGES, TRANSLATIONS, REGIONS, AND ASSETS ON DISK
	await deleteAllChapterPages(chapterId, dataRoot);

	db.delete(chapters).where(eq(chapters.id, chapterId)).run();
	compactBookChapterSeqs(chapter.bookId);

	// CLEAR STALE PAGE-PROXY COVER THUMBNAILS IN CASE THIS CHAPTER SUPPLIED THE COVER
	pruneCoverThumbs(chapter.bookId, dataRoot);

	// BUMP PARENT BOOK TIMESTAMP
	db.update(books).set({ updatedAt: Date.now() }).where(eq(books.id, chapter.bookId)).run();

	return chapter;
}

export async function deleteAllBookChapters(
	bookId: string,
	dataRoot: string = DATA_ROOT,
): Promise<{ deletedCount: number }> {
	batchService.clearBook(bookId);
	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();

	for (const ch of chapterRows) {
		await deleteAllChapterPages(ch.id, dataRoot);
		db.delete(chapters).where(eq(chapters.id, ch.id)).run();
	}

	return { deletedCount: chapterRows.length };
}

// PERMANENTLY DELETE A BOOK, ITS CHAPTERS, PAGES, COVERS, AND ALL DISK ARTIFACTS
export async function deleteBook(
	bookId: string,
	dataRoot: string = DATA_ROOT,
): Promise<{ id: string; chaptersDeleted: number }> {
	const book = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!book) throw error(404, 'Book not found.');

	// 1. HALT ANY RUNNING BATCH TRANSLATION ON THIS BOOK
	batchService.clearBook(bookId);

	// 2. QUERY ALL CHAPTERS BEFORE CASCADING DELETES
	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();

	// 3. PURGE ALL CHAPTERS AND THEIR PHYSICAL ASSETS
	for (const ch of chapterRows) {
		await deleteAllChapterPages(ch.id, dataRoot);
		db.delete(chapters).where(eq(chapters.id, ch.id)).run();
	}

	// 4. PURGE DEDICATED COVER AND CACHED COVER THUMBNAILS ON DISK
	if (book.coverPath) {
		const abs = join(dataRoot, book.coverPath);
		if (existsSync(abs)) {
			try {
				unlinkSync(abs);
			} catch {
				// IGNORE MISSING FILES
			}
		}
	}
	const defaultCover = join(dataRoot, 'covers', `${bookId}.jpg`);
	if (existsSync(defaultCover)) {
		try {
			unlinkSync(defaultCover);
		} catch {
			// IGNORE MISSING FILES
		}
	}
	pruneCoverThumbs(bookId, dataRoot);

	// 5. DELETE BOOK (SQLITE CASCADES ANY REMAINING RECORD ROWS)
	db.delete(books).where(eq(books.id, bookId)).run();

	return { id: bookId, chaptersDeleted: chapterRows.length };
}

export function updateChapterDetails(
	chapterId: number,
	data: { title?: string; titleTarget?: string | null; seq?: number }
): typeof chapters.$inferSelect {
	const current = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!current) throw error(404, 'Chapter not found.');

	const bookId = current.bookId;
	const oldSeq = current.seq;
	const newSeq = data.seq;

	db.transaction(() => {
		if (newSeq !== undefined && newSeq !== oldSeq) {
			const allChapters = db
				.select({ id: chapters.id, seq: chapters.seq })
				.from(chapters)
				.where(eq(chapters.bookId, bookId))
				.orderBy(asc(chapters.seq), asc(chapters.id))
				.all();

			// REMOVE CURRENT CHAPTER FROM LIST AND INSERT AT TARGET POSITION
			const otherChapters = allChapters.filter((c) => c.id !== chapterId);
			const targetIndex = Math.max(0, Math.min(otherChapters.length, newSeq));
			otherChapters.splice(targetIndex, 0, { id: chapterId, seq: newSeq });

			// STEP 1: SET ALL SEQS TO TEMPORARY NEGATIVE VALUES TO PREVENT UNIQUE CONSTRAINT VIOLATION
			for (let i = 0; i < otherChapters.length; i++) {
				db.update(chapters)
					.set({ seq: -(i + 1000) })
					.where(eq(chapters.id, otherChapters[i].id))
					.run();
			}

			// STEP 2: ASSIGN COMPACT 0-INDEXED SEQUENTIAL VALUES AND APPLY TITLE UPDATES
			for (let i = 0; i < otherChapters.length; i++) {
				const isTarget = otherChapters[i].id === chapterId;
				db.update(chapters)
					.set({
						seq: i,
						...(isTarget && data.title !== undefined ? { title: data.title } : {}),
						...(isTarget && data.titleTarget !== undefined ? { titleTarget: data.titleTarget } : {}),
					})
					.where(eq(chapters.id, otherChapters[i].id))
					.run();
			}
		} else {
			const updates: Record<string, unknown> = {};
			if (data.title !== undefined) updates.title = data.title;
			if (data.titleTarget !== undefined) updates.titleTarget = data.titleTarget;
			if (Object.keys(updates).length > 0) {
				db.update(chapters).set(updates).where(eq(chapters.id, chapterId)).run();
			}
		}
	});

	const updated = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!updated) throw error(404, 'Chapter not found after update.');
	return updated;
}

export function reorderChapters(bookId: string, chapterIds: number[]): void {
	const existing = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(asc(chapters.seq), asc(chapters.id))
		.all();

	const existingIdSet = new Set(existing.map((c) => c.id));
	const orderedIds: number[] = [];
	const seen = new Set<number>();

	for (const id of chapterIds) {
		if (existingIdSet.has(id) && !seen.has(id)) {
			orderedIds.push(id);
			seen.add(id);
		}
	}

	for (const c of existing) {
		if (!seen.has(c.id)) {
			orderedIds.push(c.id);
			seen.add(c.id);
		}
	}

	db.transaction(() => {
		for (let i = 0; i < orderedIds.length; i++) {
			db.update(chapters)
				.set({ seq: -(i + 1000) })
				.where(eq(chapters.id, orderedIds[i]))
				.run();
		}
		for (let i = 0; i < orderedIds.length; i++) {
			db.update(chapters)
				.set({ seq: i })
				.where(eq(chapters.id, orderedIds[i]))
				.run();
		}
	});
}

