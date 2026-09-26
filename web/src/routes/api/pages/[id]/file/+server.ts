// SERVE A PAGE'S IMAGE (original | cleaned | output | thumb) AS BYTES.
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { chapters, pages } from '$lib/server/db/schema';
import { DATA_ROOT } from '$lib/server/paths';
import { MAX_THUMB_HEIGHT, readImageDims, withinImageLimits, type ImageDims } from '$lib/server/image-limits';
import { intParam } from '$lib/server/params';
import { writeFileAtomic } from '$lib/server/fs-atomic';
import type { RequestHandler } from './$types';

const KINDS = new Set(['original', 'cleaned', 'output', 'thumb', 'annotated']);

// CONTENT TYPE BY EXTENSION - ORIGINALS CAN BE PNG/JPEG/WEBP/AVIF, NOT ALWAYS PNG.
const MIME_BY_EXT: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

// NO-CACHE HEADERS FOR INTERACTIVE COMIC EDITOR / STUDIO
const NO_CACHE_HEADERS = {
	'cache-control': 'no-cache, no-store, must-revalidate',
	'pragma': 'no-cache',
	'expires': '0',
};

// IMMUTABLE CACHE - SAFE ONLY BECAUSE THE URL EMBEDS THE CONTENT REVISION: A NEW
// REV MEANS A NEW URL, SO THE OLD CACHED COPY IS NEVER RE-REQUESTED.
const IMMUTABLE_HEADERS = {
	'cache-control': 'public, max-age=31536000, immutable',
};

// IN-FLIGHT THUMBNAIL DEDUPLICATION MAP TO PREVENT THUNDERING HERD CPU STARVATION
const inFlightThumbs = new Map<string, Promise<{ bytes: Uint8Array; mime: string }>>();

/** THE SOURCE IS TOO LARGE (OR OF UNKNOWN SIZE) TO DECODE FOR A THUMBNAIL: SERVE IT AS IS. */
class NoThumbnail extends Error {}

export const GET: RequestHandler = async ({ params, url, request }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');
	const kind = url.searchParams.get('kind') ?? 'original';
	if (!KINDS.has(kind)) throw error(400, 'kind must be original | cleaned | output | thumb | annotated.');

	const page = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!page) throw error(404, 'Page not found.');

	// REV PARAM (WHEN PRESENT THE RESPONSE IS IMMUTABLE-CACHEABLE: THE REV IS THE
	// CONTENT VERSION, EMBEDDED IN THE URL BY THE CLIENT VIEW COMPONENTS).
	const revParam = url.searchParams.get('rev');
	const rev = revParam ? Number(revParam) : null;
	const isImmutable = rev !== null && Number.isInteger(rev);
	if (isImmutable) {
		const stored =
			kind === 'original'
				? page.originalRev
				: kind === 'cleaned'
					? page.cleanedRev
					: kind === 'output'
						? page.outputRev
						: kind === 'annotated'
							? page.annotatedRev
							: null;
		// ORIGINALS CHANGE ONLY VIA STITCH (originalRev BUMP): VALIDATE LIKE ANY OTHER KIND.
		if (stored !== null && rev! > stored) {
			throw error(404, 'Stale image revision.');
		}
	}

	// THUMBNAIL SERVING & MEMOIZED DISK CACHING WITH DEDUPLICATION
	if (kind === 'thumb') {
		const targetWidth = intParam(url, 'w', 280, 80, 800);
		const target = url.searchParams.get('target') || (url.searchParams.get('output') === '0' ? 'original' : 'output');

		let rel = page.filePath;
		let stage = 'orig';
		let stageRev = page.originalRev;

		if (target === 'output') {
			if (page.outputPath) {
				rel = page.outputPath;
				stage = 'out';
				stageRev = page.outputRev;
			} else if (page.cleanedPath) {
				rel = page.cleanedPath;
				stage = 'clean';
				stageRev = page.cleanedRev;
			} else if (page.annotatedPath) {
				rel = page.annotatedPath;
				stage = 'annot';
				stageRev = page.annotatedRev;
			}
		}

		if (!rel) throw error(404, 'No image available for this page.');

		const sourcePath = join(DATA_ROOT, rel);
		if (!existsSync(sourcePath)) throw error(404, 'Source image file not found on disk.');

		const thumbDir = join(DATA_ROOT, 'cache', 'thumbs');
		const cacheKey = `${page.id}_${stage}_${targetWidth}_${stageRev}.jpg`;
		const cachePath = join(thumbDir, cacheKey);

		if (existsSync(cachePath)) {
			try {
				const fileStat = await stat(cachePath);
				const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
				if (request.headers.get('if-none-match') === etag) {
					return new Response(null, {
						status: 304,
						headers: {
							etag,
							...NO_CACHE_HEADERS,
						},
					});
				}

				const cachedBytes = await readFile(cachePath);
				return new Response(new Uint8Array(cachedBytes), {
					headers: {
						'content-type': 'image/jpeg',
						'content-length': String(cachedBytes.byteLength),
						etag,
						...NO_CACHE_HEADERS,
					},
				});
			} catch {
				// CACHE HIT UNLINKED CONCURRENTLY; FALLTHROUGH TO REGENERATE
			}
		}

		// DEDUPLICATE CONCURRENT GENERATION REQUESTS FOR THE SAME CACHE KEY
		let thumbPromise = inFlightThumbs.get(cacheKey);
		if (!thumbPromise) {
			thumbPromise = (async (): Promise<{ bytes: Uint8Array; mime: string }> => {
				try {
					const raw = await readFile(sourcePath);
					// STORED DIMENSIONS DESCRIBE THE ORIGINAL; OTHER STAGES KEEP ITS SIZE BUT ARE READ WHEN UNKNOWN
					const stored: ImageDims | null =
						page.width && page.height ? { width: page.width, height: page.height } : null;
					const dims = stored ?? (await readImageDims(raw));
					if (!dims || !withinImageLimits(dims)) throw new NoThumbnail();

					mkdirSync(thumbDir, { recursive: true });
					const img = await loadImage(raw);
					const fullHeight = Math.max(1, Math.round((img.height * targetWidth) / img.width));
					// A VERY TALL STRIP IS CROPPED FROM THE TOP (NOT SQUASHED) SO THE THUMB STAYS BOUNDED
					const targetHeight = Math.min(MAX_THUMB_HEIGHT, fullHeight);
					const sourceHeight =
						targetHeight < fullHeight ? Math.round((targetHeight * img.width) / targetWidth) : img.height;

					const canvas = createCanvas(targetWidth, targetHeight);
					try {
						const ctx = canvas.getContext('2d');
						ctx.drawImage(img, 0, 0, img.width, sourceHeight, 0, 0, targetWidth, targetHeight);
						const jpegBuffer = canvas.toBuffer('image/jpeg', 80);

						// ATOMIC: A CRASH MID-WRITE NEVER LEAVES A TRUNCATED CACHED THUMB
						writeFileAtomic(cachePath, jpegBuffer);
						return { bytes: new Uint8Array(jpegBuffer), mime: 'image/jpeg' };
					} finally {
						canvas.width = 1;
						canvas.height = 1;
					}
				} catch {
					// FALLBACK TO THE FULL IMAGE (WITH ITS REAL TYPE) IF THUMBNAILING IS REFUSED OR FAILS
					try {
						const raw = await readFile(sourcePath);
						const mime = MIME_BY_EXT[extname(rel).toLowerCase()] ?? 'application/octet-stream';
						return { bytes: new Uint8Array(raw), mime };
					} catch {
						throw error(404, 'Source image file not found on disk.');
					}
				} finally {
					inFlightThumbs.delete(cacheKey);
				}
			})();
			inFlightThumbs.set(cacheKey, thumbPromise);
		}

		const thumb = await thumbPromise;
		return new Response(new Uint8Array(thumb.bytes), {
			headers: {
				'content-type': thumb.mime,
				'content-length': String(thumb.bytes.byteLength),
				...NO_CACHE_HEADERS,
			},
		});
	}

	const rel =
		kind === 'cleaned'
			? page.cleanedPath
			: kind === 'output'
				? page.outputPath
				: kind === 'annotated'
					? page.annotatedPath
					: page.filePath;
	if (!rel) throw error(404, `No ${kind} image for this page yet.`);

	const fullPath = join(DATA_ROOT, rel);
	if (!existsSync(fullPath)) {
		throw error(404, `Image file not found on disk.`);
	}

	let fileStat;
	try {
		fileStat = await stat(fullPath);
	} catch {
		throw error(404, `Image file not found on disk.`);
	}
	const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, {
			status: 304,
			headers: {
				etag,
				...(isImmutable ? IMMUTABLE_HEADERS : NO_CACHE_HEADERS),
			},
		});
	}

	let bytes: Buffer;
	try {
		bytes = await readFile(fullPath);
	} catch {
		throw error(404, `Image file not found on disk.`);
	}
	const ext = extname(rel).toLowerCase() || '.webp';
	const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';

	// QUERY CHAPTER RECORD TO GENERATE DESCRIPTIVE DOWNLOADING FILE NAME
	const chapter = db.select({ title: chapters.title, titleTarget: chapters.titleTarget, seq: chapters.seq })
		.from(chapters)
		.where(eq(chapters.id, page.chapterId))
		.get();

	const chNumber = (chapter?.seq ?? 0) + 1;
	const padChapter = String(chNumber).padStart(2, '0');
	const padPage = String(page.seq + 1).padStart(3, '0');
	const kindLabel = kind === 'output' ? 'translated' : kind === 'cleaned' ? 'cleaned' : kind === 'annotated' ? 'annotated' : 'source';
	const safeDownloadName = `Ch_${padChapter}_P${padPage}_${kindLabel}${ext}`;

	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': mime,
			'content-length': String(bytes.byteLength),
			'content-disposition': `inline; filename="${safeDownloadName}"`,
			etag,
			...(isImmutable ? IMMUTABLE_HEADERS : NO_CACHE_HEADERS),
		},
	});
};
