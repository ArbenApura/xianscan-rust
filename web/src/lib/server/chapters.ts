// CHAPTER / PAGE CREATION HELPERS — SHARED BY THE API ROUTES.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

// IMPORTED MODULES
import { db } from './db';
import { books, chapters, pages, regions, translations } from './db/schema';
import { clearChapterJob } from './translation-service';
import { DATA_ROOT } from './paths';
import type { PipelineClient } from './pipeline-client';

// -- CONSTANTS -- //

// ACCEPTED PAGE IMAGE FORMATS (MAGIC-BYTE CHECKED IN uploadImages)
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

// -- FUNCTIONS -- //

export async function assertChapterExists(chapterId: number): Promise<{ id: number; bookId: string; title: string; seq: number }> {
	const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!chapter) throw error(404, 'Chapter not found.');
	return chapter;
}

// CREATE AN EMPTY CHAPTER AT THE END OF THE BOOK.
export async function createChapter(bookId: string, title: string): Promise<{ id: number; seq: number }> {
	const max = db
		.select({ seq: chapters.seq })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(desc(chapters.seq))
		.limit(1)
		.get();
	const seq = (max?.seq ?? -1) + 1;
	const row = db
		.insert(chapters)
		.values({ uuid: randomUUID(), bookId, seq, title })
		.returning()
		.get();
	return { id: row.id, seq: row.seq };
}

// FAST ZERO-ALLOCATION INTRINSIC IMAGE DIMENSIONS PARSER (PNG / WebP / JPEG)
export function getImageDimensionsFromBuffer(buf: Buffer): { width: number | null; height: number | null } {
	if (!buf || buf.length < 24) return { width: null, height: null };

	// 1. PNG Header (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		const width = buf.readUInt32BE(16);
		const height = buf.readUInt32BE(20);
		if (width > 0 && height > 0) return { width, height };
	}

	// 2. WebP (RIFF....WEBP)
	if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
		const type = buf.toString('ascii', 12, 16);
		if (type === 'VP8X' && buf.length >= 30) {
			const width = 1 + buf.readUIntLE(24, 3);
			const height = 1 + buf.readUIntLE(27, 3);
			return { width, height };
		}
		if (type === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
			const b0 = buf[21];
			const b1 = buf[22];
			const b2 = buf[23];
			const b3 = buf[24];
			const width = 1 + (((b1 & 0x3f) << 8) | b0);
			const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
			return { width, height };
		}
		if (type === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
			const width = buf.readUInt16LE(26) & 0x3fff;
			const height = buf.readUInt16LE(28) & 0x3fff;
			return { width, height };
		}
	}

	// 3. JPEG (0xFF 0xD8)
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let offset = 2;
		while (offset < buf.length - 8) {
			if (buf[offset] !== 0xff) {
				offset++;
				continue;
			}
			const marker = buf[offset + 1];
			if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
				const height = buf.readUInt16BE(offset + 5);
				const width = buf.readUInt16BE(offset + 7);
				if (width > 0 && height > 0) return { width, height };
				break;
			}
			if (marker === 0xd9 || marker === 0xda) break;
			const len = buf.readUInt16BE(offset + 2);
			if (len < 2) break;
			offset += 2 + len;
		}
	}

	return { width: null, height: null };
}

// WRITE UPLOADED PAGE IMAGES TO DISK AND CREATE THEIR DB ROWS. RETURNS THE CREATED PAGE COUNT.
// SEQ CONTINUES AFTER THE CHAPTER'S EXISTING PAGES (A SECOND UPLOAD MUST NOT COLLIDE WITH THE
// (chapterId, seq) UNIQUE INDEX — THE ORIGINAL BUG 500'd EVERY NON-FIRST UPLOAD).
// FILE NAMES ARE UUIDs, NOT seq: seq IS RENUMBERED BY reorder/stitch/delete WHILE FILES KEEP THEIR
// OLD NAMES, SO A SEQ-BASED NAME CAN REUSE A FILE STILL REFERENCED BY ANOTHER PAGE — THE OLD SCHEME
// OVERWROTE THE LAST REMAINING PAGE'S IMAGE ON THE NEXT UPLOAD, MAKING THE LAST TWO PAGES SHOW THE
// SAME PICTURE (EVERY RE-UPLOAD RE-DUPLICATED IT).
// CONVERT ARBITRARY IMAGE BUFFER (PNG/JPEG/AVIF) TO OPTIMIZED WEBP & EXTRACT INTRINSIC DIMENSIONS.
export async function convertBufferToWebP(
	buffer: Buffer,
	originalExt: string,
): Promise<{ data: Buffer; ext: string; width: number | null; height: number | null }> {
	const fastDims = getImageDimensionsFromBuffer(buffer);
	if (originalExt === '.webp' && fastDims.width && fastDims.height) {
		return { data: buffer, ext: '.webp', width: fastDims.width, height: fastDims.height };
	}

	try {
		const { Transformer } = await import('@napi-rs/image');
		const transformer = new Transformer(buffer);
		const meta = await transformer.metadata();
		const webpBuf = await transformer.webp(90);
		return {
			data: webpBuf,
			ext: '.webp',
			width: meta.width || fastDims.width || null,
			height: meta.height || fastDims.height || null,
		};
	} catch {
		try {
			const { loadImage, createCanvas } = await import('@napi-rs/canvas');
			const img = await loadImage(buffer);
			const width = fastDims.width ?? (img.width || null);
			const height = fastDims.height ?? (img.height || null);
			if (originalExt === '.webp') return { data: buffer, ext: '.webp', width, height };
			const canvas = createCanvas(img.width, img.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			const webpBuf = await canvas.encode('webp', 85);
			return { data: webpBuf, ext: '.webp', width, height };
		} catch {
			// FALLBACK TO ORIGINAL BUFFER IF ENCODER FAILS
			return { data: buffer, ext: originalExt, width: fastDims.width, height: fastDims.height };
		}
	}
}

export async function uploadPages(chapterId: number, files: File[]): Promise<number> {
	let count = 0;
	let seq = nextPageSeq(chapterId);
	const uploadDir = join(DATA_ROOT, 'uploads', String(chapterId));
	mkdirSync(uploadDir, { recursive: true });
	for (const file of files) {
		const ext = extname(file.name).toLowerCase();
		if (!ALLOWED_EXT.has(ext)) throw error(400, `Unsupported image type "${ext}" — use PNG/JPEG/WebP/AVIF.`);
		const rawBuf = Buffer.from(await file.arrayBuffer());
		const { data: webpBuf, ext: finalExt, width, height } = await convertBufferToWebP(rawBuf, ext);
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
	return count;
}

// THE NEXT FREE SEQ FOR A CHAPTER (PURE DB QUERY — UNIT-TESTED).
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

// ENSURE CHAPTER PAGE SEQUENCES ARE STRICTLY CONTIGUOUS (0, 1, 2, ... N-1) WITH NO GAPS OR DUPLICATES.
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

// RE-ORDER A CHAPTER'S PAGES (PRESERVES (chapterId, seq) UNIQUE INDEX VIA TEMP SEQUENCES, HANDLES SUBSETS SAFELY).
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

	// APPEND ANY OMITTED EXISTING PAGES AT THE END IN ORIGINAL ORDER
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

// DELETE A SINGLE PAGE, ITS REGIONS, DISK ASSETS, AND RE-INDEX REMAINING PAGES TO PREVENT GAPS.
export function deletePage(pageId: number, dataRoot: string = DATA_ROOT): { chapterId: number; seq: number } {
	const [p] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!p) throw error(404, 'Page not found.');

	const chapterId = p.chapterId;
	const deletedSeq = p.seq;

	// 1. DELETE DEPENDENT DB RECORDS
	db.delete(translations).where(eq(translations.pageId, pageId)).run();
	db.delete(regions).where(eq(regions.pageId, pageId)).run();

	// 2. DELETE DISK FILES IF THEY EXIST
	const pathsToUnlink = [p.filePath, p.cleanedPath, p.outputPath].filter(Boolean) as string[];
	for (const rel of pathsToUnlink) {
		try {
			unlinkSync(join(dataRoot, rel));
		} catch {
			// ignore if missing
		}
	}

	// 3. DELETE PAGE ROW
	db.delete(pages).where(eq(pages.id, pageId)).run();

	// 4. ATOMICALLY RE-INDEX REMAINING PAGES IN THE CHAPTER
	compactChapterPageSeqs(chapterId);

	return { chapterId, seq: deletedSeq };
}

// MANUALLY STITCH A PAGE WITH THE NEXT PAGE IN THE CHAPTER SEQUENCE.
export async function stitchPageWithNext(
	pageId: number,
	pipeline: PipelineClient,
	dataRoot: string = DATA_ROOT,
): Promise<void> {
	if (!pipeline.stitch) throw new Error('Sidecar stitch operation unavailable.');
	const [topPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!topPage) throw new Error('Page not found.');

	const [botPage] = db
		.select()
		.from(pages)
		.where(and(eq(pages.chapterId, topPage.chapterId), eq(pages.seq, topPage.seq + 1)))
		.all();

	if (!botPage) throw new Error('No next page in sequence to stitch with.');

	const topAbs = join(dataRoot, topPage.filePath);
	const botAbs = join(dataRoot, botPage.filePath);

	const topBytes = readFileSync(topAbs);
	const botBytes = readFileSync(botAbs);

	const stitched = await pipeline.stitch(topBytes, botBytes);
	writeFileSync(topAbs, stitched);

	const dims = getImageDimensionsFromBuffer(stitched);
	let w: number | null = dims.width;
	let h: number | null = dims.height;
	if (!w || !h) {
		try {
			const { loadImage } = await import('@napi-rs/canvas');
			const img = await loadImage(stitched);
			w = img.width || null;
			h = img.height || null;
		} catch {
			// ignore
		}
	}

	// RESET TOP PAGE PIPELINE STATE & CLEAR OBSOLETE OUTPUTS
	db.update(pages)
		.set({
			status: 'pending',
			cleanedPath: null,
			outputPath: null,
			error: null,
			width: w,
			height: h,
		})
		.where(eq(pages.id, topPage.id))
		.run();
	db.delete(regions).where(eq(regions.pageId, topPage.id)).run();

	// DELETE BOTTOM PAGE FROM DB & DISK
	db.delete(regions).where(eq(regions.pageId, botPage.id)).run();
	db.delete(pages).where(eq(pages.id, botPage.id)).run();
	try {
		unlinkSync(botAbs);
	} catch {
		// ignore if file missing
	}

	const remainingIds = db
		.select({ id: pages.id })
		.from(pages)
		.where(eq(pages.chapterId, topPage.chapterId))
		.orderBy(pages.seq)
		.all()
		.map((p) => p.id);

	reorderPages(topPage.chapterId, remainingIds);
}

// CLEAR ONE PAGE'S PIPELINE PROGRESS — DETECTED REGIONS, MEMOIZED TRANSLATIONS, AND DISK OUTPUTS.
// ORIGINAL UPLOADED IMAGES (filePath) ARE PRESERVED; GENERATED clean/ AND output/ FILES ARE UNLINKED.
export function resetPageProgress(pageId: number, dataRoot: string = DATA_ROOT): void {
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

// CLEAR EVERY PAGE OF A CHAPTER. RETURNS HOW MANY PAGES WERE RESET.
export function resetChapterProgress(chapterId: number, dataRoot: string = DATA_ROOT): number {
	clearChapterJob(chapterId);
	const rows = db.select({ id: pages.id }).from(pages).where(eq(pages.chapterId, chapterId)).all();
	for (const row of rows) resetPageProgress(row.id, dataRoot);

	// Remove generated clean and output directories for this chapter to prevent disk bloat
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

// CLEAR TRANSLATION & OCR PROGRESS FOR ALL CHAPTERS OF A BOOK WHILE KEEPING PAGES INTACT.
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

// SMART RE-SLICE CHAPTER PAGES: COMBINE ALL SLICES, CUT AT NATURAL GUTTERS, AND ATOMICALLY SWAP
export async function resliceChapterPages(
	chapterId: number,
	pipeline: PipelineClient,
	onProgress?: (step: string, message: string, pct: number) => void,
	signal?: AbortSignal,
	dataRoot: string = DATA_ROOT,
): Promise<{ originalCount: number; newCount: number }> {
	if (!pipeline.reslice) throw new Error('Sidecar reslice operation unavailable.');
	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(pages.seq)
		.all();

	if (pageRows.length === 0) throw error(400, 'Chapter has no pages to reslice.');

	onProgress?.('read', `Reading ${pageRows.length} chapter image slices...`, 15);
	const imageBuffers: Buffer[] = [];
	for (const p of pageRows) {
		signal?.throwIfAborted();
		const absPath = join(dataRoot, p.filePath);
		imageBuffers.push(readFileSync(absPath));
	}

	onProgress?.('reslice', 'Stitching continuous canvas & finding optimal non-text gutters...', 45);
	signal?.throwIfAborted();
	const slicedBuffers = await pipeline.reslice(imageBuffers, signal);
	if (slicedBuffers.length === 0) throw new Error('Reslice produced zero pages.');

	onProgress?.('save', `Writing ${slicedBuffers.length} clean pages and rebuilding database...`, 85);

	const uploadDir = join(dataRoot, 'uploads', String(chapterId));
	mkdirSync(uploadDir, { recursive: true });

	// OLD FILES TO REMOVE AFTER SUCCESS
	const oldFilePaths = pageRows.map((p) => join(dataRoot, p.filePath));

	const newPageRows: { chapterId: number; seq: number; filePath: string; width: number | null; height: number | null }[] = [];
	for (let seq = 0; seq < slicedBuffers.length; seq++) {
		signal?.throwIfAborted();
		const sliceBuf = slicedBuffers[seq];
		const isWebP = sliceBuf.length >= 12 && sliceBuf.toString('ascii', 0, 4) === 'RIFF' && sliceBuf.toString('ascii', 8, 12) === 'WEBP';
		const ext = isWebP ? 'webp' : 'png';
		const fileName = `${randomUUID()}.${ext}`;
		const absPath = join(uploadDir, fileName);
		writeFileSync(absPath, sliceBuf);
		const dims = getImageDimensionsFromBuffer(sliceBuf);
		let w: number | null = dims.width;
		let h: number | null = dims.height;
		if (!w || !h) {
			try {
				const { loadImage } = await import('@napi-rs/canvas');
				const img = await loadImage(sliceBuf);
				w = img.width || null;
				h = img.height || null;
			} catch {
				// ignore
			}
		}
		newPageRows.push({
			chapterId,
			seq,
			filePath: `uploads/${chapterId}/${fileName}`,
			width: w,
			height: h,
		});
	}

	// ATOMIC SWAP IN DB
	db.transaction(() => {
		for (const p of pageRows) {
			db.delete(translations).where(eq(translations.pageId, p.id)).run();
			db.delete(regions).where(eq(regions.pageId, p.id)).run();
		}
		db.delete(pages).where(eq(pages.chapterId, chapterId)).run();
		for (const nr of newPageRows) {
			db.insert(pages).values(nr).run();
		}
	});

	// CLEAN UP OLD UPLOADED IMAGE FILES
	for (const oldPath of oldFilePaths) {
		try {
			unlinkSync(oldPath);
		} catch {
			// ignore missing files
		}
	}

	return { originalCount: pageRows.length, newCount: slicedBuffers.length };
}

// PERMANENTLY REMOVE ALL PAGES (IMAGES, REGIONS, TRANSLATIONS) FROM A CHAPTER.
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

	// CANCEL & CLEAR ANY ACTIVE JOBS
	clearChapterJob(chapterId);

	// CLEAN UP OLD UPLOADED IMAGE FILES & CHAPTER FOLDERS
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

// PERMANENTLY REMOVE ALL CHAPTERS (AND THEIR PAGES, REGIONS, TRANSLATIONS, FILES) FROM A BOOK.
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

// -- CHAPTER READER SSR & API DATA FETCHER -- //

export interface ChapterRegionData {
	id: number;
	seq: number;
	box: unknown;
	textSource: string;
	textTarget: string | null;
	conf: number | null;
}

export interface ChapterPageData {
	id: number;
	seq: number;
	filePath: string;
	cleanedPath: string | null;
	outputPath: string | null;
	status: 'pending' | 'processing' | 'done' | 'error';
	error: string | null;
	width?: number | null;
	height?: number | null;
	regions: ChapterRegionData[];
}

export interface ChapterNavSummary {
	id: number;
	seq: number;
	title: string | null;
	titleTarget?: string | null;
}

export interface ChapterReaderResult {
	chapter: {
		id: number;
		bookId: string;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
	};
	allChapters: ChapterNavSummary[];
	prevChapter: ChapterNavSummary | null;
	nextChapter: ChapterNavSummary | null;
	pages: ChapterPageData[];
}

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

// FETCH COMPLETE CHAPTER READER DATA (USED BY /app/books/[id]/chapters/[chapterId] SSR & API)
export async function getChapterReaderData(chapterId: number): Promise<ChapterReaderResult> {
	await assertChapterExists(chapterId);

	// AUTO-HEAL ANY GAPS OR INCONSISTENT SEQUENCES IN DB
	try {
		compactChapterPageSeqs(chapterId);
	} catch {
		// Non-blocking
	}

	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(pages.seq)
		.all();

	// SELF-HEALING: EXTRACT AND CACHE DIMENSIONS FOR ANY PAGES MISSING THEM SO SSR HAS EXACT RATIOS
	const missingDims: { id: number; width: number; height: number }[] = [];
	for (const p of pageRows) {
		if ((p.width === null || p.height === null) && p.filePath) {
			const absPath = join(DATA_ROOT, p.filePath);
			try {
				const buf = readFileSync(absPath);
				const dims = getImageDimensionsFromBuffer(buf);
				let w = dims.width;
				let h = dims.height;
				if (!w || !h) {
					const { loadImage } = await import('@napi-rs/canvas');
					const img = await loadImage(buf);
					w = img.width || null;
					h = img.height || null;
				}
				if (w && h) {
					p.width = w;
					p.height = h;
					missingDims.push({ id: p.id, width: w, height: h });
				}
			} catch {
				// ignore if file is missing or unreadable
			}
		}
	}

	if (missingDims.length > 0) {
		try {
			db.transaction((tx) => {
				for (const item of missingDims) {
					tx.update(pages)
						.set({ width: item.width, height: item.height })
						.where(eq(pages.id, item.id))
						.run();
				}
			});
		} catch {
			// Non-blocking: never fail SSR if background parallel translation is writing
		}
	}

	// ALL REGIONS FOR THESE PAGES IN ONE QUERY, GROUPED BY PAGE
	const pageIds = pageRows.map((p) => p.id);
	const regionRows =
		pageIds.length > 0
			? db
					.select()
					.from(regions)
					.where(inArray(regions.pageId, pageIds))
					.orderBy(regions.seq)
					.all()
			: [];
	const byPage = new Map<number, typeof regionRows>();
	for (const r of regionRows) {
		const arr = byPage.get(r.pageId) ?? [];
		arr.push(r);
		byPage.set(r.pageId, arr);
	}

	const chapterRow = db
		.select()
		.from(chapters)
		.where(eq(chapters.id, chapterId))
		.get();

	if (!chapterRow) throw error(404, 'Chapter not found.');

	const bookRow = db.select().from(books).where(eq(books.id, chapterRow.bookId)).get();

	const allChaptersInBook = db
		.select({
			id: chapters.id,
			seq: chapters.seq,
			title: chapters.title,
			titleTarget: chapters.titleTarget,
		})
		.from(chapters)
		.where(eq(chapters.bookId, chapterRow.bookId))
		.orderBy(chapters.seq)
		.all();

	const currentIndex = allChaptersInBook.findIndex((c) => c.id === chapterId);
	const prevChapter = currentIndex > 0 ? allChaptersInBook[currentIndex - 1] : null;
	const nextChapter =
		currentIndex >= 0 && currentIndex < allChaptersInBook.length - 1
			? allChaptersInBook[currentIndex + 1]
			: null;

	return {
		chapter: {
			id: chapterRow.id,
			bookId: chapterRow.bookId,
			seq: chapterRow.seq,
			title: chapterRow.title,
			titleTarget: chapterRow.titleTarget,
			sourceLang: bookRow?.sourceLang || 'zh-CN',
			targetLang: bookRow?.targetLang || 'en',
		},
		allChapters: allChaptersInBook,
		prevChapter,
		nextChapter,
		pages: pageRows.map((p) => ({
			id: p.id,
			seq: p.seq,
			filePath: p.filePath,
			cleanedPath: p.cleanedPath,
			outputPath: p.outputPath,
			status: p.status,
			error: p.error,
			width: p.width,
			height: p.height,
			regions: (byPage.get(p.id) ?? []).map((r) => ({
				id: r.id,
				seq: r.seq,
				box: safeJson(r.box),
				textSource: r.textSource,
				textTarget: r.textTarget,
				originalTarget: (r as any).originalTarget ?? r.textTarget,
				conf: r.conf,
			})),
		})),
	};
}

// UPDATE A REGION'S TRANSLATION MANUALLY AND RE-RENDER TYPESET PAGE OUTPUT
export async function updateRegionTranslation(
	pageId: number,
	regionId: number,
	textTarget: string,
	dataRoot: string = DATA_ROOT,
): Promise<{ textTarget: string; outputPath: string | null }> {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) throw error(404, 'Page not found.');

	const regionRow = db.select().from(regions).where(and(eq(regions.id, regionId), eq(regions.pageId, pageId))).get();
	if (!regionRow) throw error(404, 'Region not found.');

	// 1. Update region in database
	db.update(regions)
		.set({ textTarget: textTarget.trim() || null, status: textTarget.trim() ? 'translated' : 'failed' })
		.where(eq(regions.id, regionId))
		.run();

	// 2. If cleaned page exists, re-typeset the page
	if (pageRow.cleanedPath) {
		const cleanAbs = join(dataRoot, pageRow.cleanedPath);
		try {
			const cleanedBuf = readFileSync(cleanAbs);
			const allRegions = db
				.select()
				.from(regions)
				.where(eq(regions.pageId, pageId))
				.orderBy(asc(regions.seq))
				.all();

			const typesetRegions = allRegions
				.filter((r) => Boolean(r.textTarget?.trim()))
				.map((r) => ({
					id: String(r.id),
					box: safeJson(r.box) as any,
					text: r.textTarget!,
					vertical: (r as any).vertical,
					angle: (r as any).angle,
				}));

			const { typesetPage } = await import('./typeset');
			const out = await typesetPage(cleanedBuf, typesetRegions);
			const outputPath = `output/${pageRow.chapterId}/${pageRow.seq}.png`;
			mkdirSync(join(dataRoot, 'output', String(pageRow.chapterId)), { recursive: true });
			writeFileSync(join(dataRoot, outputPath), out);

			db.update(pages).set({ outputPath }).where(eq(pages.id, pageId)).run();
			return { textTarget: textTarget.trim(), outputPath };
		} catch (err) {
			console.error('Failed to re-typeset page on manual translation update:', err);
		}
	}

	return { textTarget: textTarget.trim(), outputPath: pageRow.outputPath };
}

// RETYPESET AN ENTIRE PAGE CANVAS USING ITS CURRENT DATABASE REGIONS
export async function retypesetPage(
	pageId: number,
	_opts?: any,
	dataRoot: string = DATA_ROOT,
): Promise<{ outputPath: string | null }> {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) throw error(404, 'Page not found.');
	if (!pageRow.cleanedPath) return { outputPath: pageRow.outputPath };

	const cleanAbs = join(dataRoot, pageRow.cleanedPath);
	try {
		const cleanedBuf = readFileSync(cleanAbs);
		const allRegions = db
			.select()
			.from(regions)
			.where(eq(regions.pageId, pageId))
			.orderBy(asc(regions.seq))
			.all();

		const typesetRegions = allRegions
			.filter((r) => Boolean(r.textTarget?.trim()))
			.map((r) => ({
				id: String(r.id),
				box: safeJson(r.box) as any,
				text: r.textTarget!,
				vertical: (r as any).vertical,
				angle: (r as any).angle,
			}));

		const { typesetPage } = await import('./typeset');
		const out = await typesetPage(cleanedBuf, typesetRegions);
		const outputPath = `output/${pageRow.chapterId}/${pageRow.seq}.png`;
		mkdirSync(join(dataRoot, 'output', String(pageRow.chapterId)), { recursive: true });
		writeFileSync(join(dataRoot, outputPath), out);

		db.update(pages).set({ outputPath }).where(eq(pages.id, pageId)).run();
		return { outputPath };
	} catch (err) {
		console.error('Failed to retypeset page:', err);
		return { outputPath: pageRow.outputPath };
	}
}

// GET SINGLE PAGE WITH ALL ITS REGIONS
export function getPageWithRegions(pageId: number) {
	const pageRow = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!pageRow) return null;

	const allRegions = db
		.select()
		.from(regions)
		.where(eq(regions.pageId, pageId))
		.orderBy(asc(regions.seq))
		.all();

	return {
		id: pageRow.id,
		chapterId: pageRow.chapterId,
		seq: pageRow.seq,
		filePath: pageRow.filePath,
		cleanedPath: pageRow.cleanedPath,
		outputPath: pageRow.outputPath,
		status: pageRow.status,
		error: pageRow.error,
		width: pageRow.width,
		height: pageRow.height,
		regions: allRegions.map((r) => ({
			id: r.id,
			seq: r.seq,
			box: safeJson(r.box),
			textSource: r.textSource,
			textTarget: r.textTarget,
			originalTarget: (r as any).originalTarget ?? r.textTarget,
			conf: r.conf,
		})),
	};
}



