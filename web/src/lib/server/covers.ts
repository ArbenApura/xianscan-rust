// DEDICATED BOOK COVER STORAGE + PAGE-PROXY FALLBACK RESOLUTION.
// IMPORTED DEP-MODULES
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Orientation, Transformer } from '@napi-rs/image';
import { eq, sql } from 'drizzle-orm';
// IMPORTED MODULES
import { db } from './db';
import { books, chapters, pages } from './db/schema';
import { DATA_ROOT } from './paths';

// -- CONSTANTS -- //

// COVERS ARE ONLY EVER SHOWN AS THUMBNAILS — CAP THE LONGEST EDGE TO KEEP MEMORY AND FILES SMALL.
const MAX_COVER_EDGE = 1600;

// -- TYPES -- //

export interface CoverTarget {
	rel: string;
	rev: number;
	kind: 'dedicated' | 'page';
}

// -- FUNCTIONS -- //

// RESOLVE THE IMAGE BEHIND A BOOK'S COVER: THE DEDICATED UPLOADED COVER IF PRESENT, OTHERWISE THE
// FIRST PAGE WITH AN IMAGE (OUTPUT BEFORE ORIGINAL) — THE SAME RULE THE OLD PAGE-PROXY COVER USED.
// A BOOK WHOSE DEDICATED COVER WAS EXPLICITLY REMOVED (coverCleared) RESOLVES TO NULL WITH NO
// PAGE-PROXY FALLBACK, SO THE UI AND MIHON/TACHIYOMI SHOW NOTHING.
export function resolveCoverTarget(bookId: string): CoverTarget | null {
	const b = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!b) return null;
	if (b.coverPath) return { rel: b.coverPath, rev: b.coverRev, kind: 'dedicated' };
	if (b.coverCleared) return null;

	const chapterList = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.orderBy(chapters.seq)
		.all();
	for (const ch of chapterList) {
		const firstPage = db.select().from(pages).where(eq(pages.chapterId, ch.id)).orderBy(pages.seq).limit(1).get();
		if (firstPage) {
			if (firstPage.outputPath) return { rel: firstPage.outputPath, rev: firstPage.outputRev, kind: 'page' };
			if (firstPage.filePath) return { rel: firstPage.filePath, rev: firstPage.originalRev, kind: 'page' };
		}
	}
	return null;
}

// RE-ENCODE THE UPLOAD TO A DOWNSCALED JPEG, STORE UNDER covers/<bookId>.jpg, AND BUMP coverRev.
export async function saveCover(
	bookId: string,
	bytes: Uint8Array | File,
	dataRoot: string = DATA_ROOT,
): Promise<{ coverPath: string; coverRev: number }> {
	const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
	const jpeg = await encodeCoverJpeg(raw);

	const coverDir = join(dataRoot, 'covers');
	mkdirSync(coverDir, { recursive: true });
	const coverPath = `covers/${bookId}.jpg`;
	writeFileSync(join(dataRoot, coverPath), jpeg);

	const updated = db
		.update(books)
		.set({ coverPath, coverRev: sql`${books.coverRev} + 1`, coverCleared: false, updatedAt: Date.now() })
		.where(eq(books.id, bookId))
		.returning()
		.get();
	return { coverPath, coverRev: updated.coverRev };
}

// DECODE ANY SUPPORTED IMAGE TO A DOWNSCALED JPEG. THE @napi-rs/canvas PATH COVERS JPEG/PNG/WEBP;
// THE @napi-rs/image PATH IS THE FALLBACK FOR EVERYTHING ELSE (AVIF, HEIC, TIFF, BMP, ICO, GIF, …).
async function encodeCoverJpeg(bytes: Uint8Array): Promise<Buffer> {
	try {
		return await encodeCoverJpegViaCanvas(bytes);
	} catch {
		// FALL THROUGH TO THE WIDE-FORMAT DECODER
	}
	try {
		return encodeCoverJpegViaImage(bytes);
	} catch {
		throw new Error('Unsupported or corrupt image. Use a common format (JPEG, PNG, WebP, AVIF, HEIC).');
	}
}

async function encodeCoverJpegViaCanvas(bytes: Uint8Array): Promise<Buffer> {
	const img = await loadImage(Buffer.from(bytes));
	const scale = Math.min(1, MAX_COVER_EDGE / Math.max(img.width, img.height));
	const width = Math.max(1, Math.round(img.width * scale));
	const height = Math.max(1, Math.round(img.height * scale));
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, width, height);
	return canvas.toBuffer('image/jpeg', 88);
}

function encodeCoverJpegViaImage(bytes: Uint8Array): Buffer {
	const t = new Transformer(bytes);
	const meta = t.metadataSync();
	if (!meta.width || !meta.height) {
		throw new Error('Could not read image dimensions.');
	}
	// EXIF ORIENTATION — PHONE PHOTOS ARE OFTEN STORED ROTATED IN THE FILE.
	if (meta.orientation && meta.orientation !== 1) {
		t.rotate(meta.orientation as Orientation);
	}
	const rotated = t.metadataSync();
	const scale = Math.min(1, MAX_COVER_EDGE / Math.max(rotated.width, rotated.height));
	if (scale < 1) {
		t.resize(Math.max(1, Math.round(rotated.width * scale)), Math.max(1, Math.round(rotated.height * scale)));
	}
	return t.jpegSync(88);
}

// REMOVE THE COVER. MARKS THE BOOK coverCleared SO RESOLUTION STOPS FALLING BACK TO A CHAPTER PAGE —
// THE USER EXPLICITLY WANTS NO COVER, AND MIHON/TACHIYOMI SHOW NOTHING. THE CLEARED FLAG IS SET EVEN
// WHEN THE BOOK ONLY HAD A PAGE-PROXY COVER (coverPath NULL), SO "REMOVE" SUPPRESSES THAT FALLBACK TOO.
export function deleteCover(bookId: string, dataRoot: string = DATA_ROOT): void {
	const b = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!b) return;
	if (b.coverPath) {
		const abs = join(dataRoot, b.coverPath);
		if (existsSync(abs)) {
			try {
				unlinkSync(abs);
			} catch {
				// IGNORE — BEST-EFFORT FILE CLEANUP
			}
		}
	}
	db.update(books).set({ coverPath: null, coverCleared: true, updatedAt: Date.now() }).where(eq(books.id, bookId)).run();
}
