// SERVE A PAGE'S IMAGE (original | cleaned | output | thumb) AS BYTES.
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// IMPORTED MODULES
import { db } from '$lib/server/db';
import { chapters, pages } from '$lib/server/db/schema';
import { DATA_ROOT } from '$lib/server/paths';
import type { RequestHandler } from './$types';

const KINDS = new Set(['original', 'cleaned', 'output', 'thumb']);

// CONTENT TYPE BY EXTENSION — ORIGINALS CAN BE PNG/JPEG/WEBP/AVIF, NOT ALWAYS PNG.
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

export const GET: RequestHandler = async ({ params, url, request }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');
	const kind = url.searchParams.get('kind') ?? 'original';
	if (!KINDS.has(kind)) throw error(400, 'kind must be original | cleaned | output | thumb.');

	const page = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!page) throw error(404, 'Page not found.');

	// THUMBNAIL SERVING & MEMOIZED DISK CACHING
	if (kind === 'thumb') {
		const targetWidth = Math.min(800, Math.max(80, parseInt(url.searchParams.get('w') || '280', 10)));
		const target = url.searchParams.get('target') || (url.searchParams.get('output') === '0' ? 'original' : 'output');
		const rel = (target === 'output' && page.outputPath) ? page.outputPath : page.filePath;
		if (!rel) throw error(404, 'No image available for this page.');

		const sourcePath = join(DATA_ROOT, rel);
		if (!existsSync(sourcePath)) throw error(404, 'Source image file not found on disk.');

		const sourceStat = await stat(sourcePath);
		const isOutput = rel === page.outputPath;
		const thumbDir = join(DATA_ROOT, 'cache', 'thumbs');
		const cacheKey = `${page.id}_${isOutput ? 'out' : 'orig'}_${targetWidth}.jpg`;
		const cachePath = join(thumbDir, cacheKey);

		if (existsSync(cachePath)) {
			const fileStat = await stat(cachePath);
			// ONLY SERVE CACHED THUMBNAIL IF IT WAS GENERATED AFTER THE SOURCE IMAGE WAS MODIFIED
			if (fileStat.mtimeMs >= sourceStat.mtimeMs) {
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
				return new Response(cachedBytes, {
					headers: {
						'content-type': 'image/jpeg',
						etag,
						...NO_CACHE_HEADERS,
					},
				});
			}
		}

		try {
			mkdirSync(thumbDir, { recursive: true });
			const img = await loadImage(sourcePath);
			const scale = targetWidth / img.width;
			const targetHeight = Math.round(img.height * scale);

			const canvas = createCanvas(targetWidth, targetHeight);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
			const jpegBuffer = canvas.toBuffer('image/jpeg', 80);

			writeFileSync(cachePath, jpegBuffer);

			return new Response(new Uint8Array(jpegBuffer), {
				headers: {
					'content-type': 'image/jpeg',
					...NO_CACHE_HEADERS,
				},
			});
		} catch {
			// FALLBACK TO FULL IMAGE IF THUMBNAIL RESIZING ENCOUNTERS AN UNEXPECTED IO ISSUE
			const bytes = await readFile(sourcePath);
			return new Response(bytes, {
				headers: {
					'content-type': MIME_BY_EXT[extname(rel).toLowerCase()] ?? 'image/jpeg',
					...NO_CACHE_HEADERS,
				},
			});
		}
	}

	const rel =
		kind === 'cleaned'
			? page.cleanedPath
			: kind === 'output'
				? page.outputPath
				: page.filePath;
	if (!rel) throw error(404, `No ${kind} image for this page yet.`);

	const fullPath = join(DATA_ROOT, rel);
	if (!existsSync(fullPath)) {
		throw error(404, `Image file not found on disk.`);
	}

	const fileStat = await stat(fullPath);
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

	const bytes = await readFile(fullPath);
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
	const kindLabel = kind === 'output' ? 'translated' : kind === 'cleaned' ? 'cleaned' : 'source';
	const safeDownloadName = `Ch_${padChapter}_P${padPage}_${kindLabel}${ext}`;

	return new Response(bytes, {
		headers: {
			'content-type': mime,
			'content-disposition': `inline; filename="${safeDownloadName}"`,
			etag,
			...NO_CACHE_HEADERS,
		},
	});
};
