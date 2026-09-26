// DEDICATED BOOK COVER SERVING — RESIZED JPEG THUMBS WITH A DISK CACHE (MIRRORS THE PAGE THUMB PIPELINE).
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// IMPORTED MODULES
import { resolveCoverTarget } from '$lib/server/covers';
import { DATA_ROOT } from '$lib/server/paths';
import { MAX_THUMB_HEIGHT, readImageDims, withinImageLimits } from '$lib/server/image-limits';
import { intParam } from '$lib/server/params';
import { writeFileAtomic } from '$lib/server/fs-atomic';
import type { RequestHandler } from './$types';

// -- CONSTANTS -- //

const NO_CACHE_HEADERS = {
	'cache-control': 'no-cache, no-store, must-revalidate',
	pragma: 'no-cache',
	expires: '0',
};

const MIME_BY_EXT: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

// -- HANDLES -- //

export const GET: RequestHandler = async ({ params, url, request }) => {
	const target = resolveCoverTarget(params.bookId);
	if (!target) throw error(404, 'No cover available for this book.');
	const sourcePath = join(DATA_ROOT, target.rel);
	if (!existsSync(sourcePath)) throw error(404, 'Cover file not found on disk.');

	// NO (OR AN INVALID) WIDTH MEANS THE FULL IMAGE; OTHERWISE A THUMB 80..1600 PX WIDE
	const wRaw = intParam(url, 'w', 0, 0, 1600);
	const isFull = url.searchParams.get('kind') === 'full' || wRaw <= 0;
	const sourceExt = extname(target.rel).toLowerCase() || '.jpg';
	const sourceMime = MIME_BY_EXT[sourceExt] ?? 'application/octet-stream';

	if (isFull) {
		try {
			const bytes = await readFile(sourcePath);
			return new Response(new Uint8Array(bytes), {
				headers: {
					'content-type': sourceMime,
					'content-length': String(bytes.byteLength),
					...NO_CACHE_HEADERS,
				},
			});
		} catch {
			throw error(404, 'Cover file not found on disk.');
		}
	}

	// RESIZED JPEG THUMB, MEMOIZED ON DISK — THE URL CARRIES THE CONTENT REVISION IN THE KEY.
	const targetWidth = Math.max(80, wRaw);
	const cacheKey = `${params.bookId}_${target.kind}_${target.rev}_${targetWidth}.jpg`;
	const cachePath = join(DATA_ROOT, 'cache', 'covers', cacheKey);

	if (existsSync(cachePath)) {
		try {
			const fileStat = await stat(cachePath);
			const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
			if (request.headers.get('if-none-match') === etag) {
				return new Response(null, { status: 304, headers: { etag, ...NO_CACHE_HEADERS } });
			}
			const cached = await readFile(cachePath);
			return new Response(cached, {
				headers: {
					'content-type': 'image/jpeg',
					'content-length': String(cached.byteLength),
					etag,
					...NO_CACHE_HEADERS,
				},
			});
		} catch {
			// CACHE FILE CONCURRENTLY UNLINKED; PROCEED TO REGENERATE
		}
	}

	try {
		const raw = await readFile(sourcePath);
		// A PAGE-PROXY COVER CAN BE AN ARBITRARILY TALL STRIP: GATE THE DECODE ON ITS HEADER SIZE
		const dims = await readImageDims(raw);
		if (!dims || !withinImageLimits(dims)) throw new Error('cover source over the pixel cap');
		mkdirSync(join(DATA_ROOT, 'cache', 'covers'), { recursive: true });
		const img = await loadImage(raw);
		const fullHeight = Math.max(1, Math.round((img.height * targetWidth) / img.width));
		// CROP A VERY TALL SOURCE FROM THE TOP INSTEAD OF SQUASHING IT
		const targetHeight = Math.min(MAX_THUMB_HEIGHT, fullHeight);
		const sourceHeight = targetHeight < fullHeight ? Math.round((targetHeight * img.width) / targetWidth) : img.height;
		const canvas = createCanvas(targetWidth, targetHeight);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, img.width, sourceHeight, 0, 0, targetWidth, targetHeight);
		const jpeg = canvas.toBuffer('image/jpeg', 85);
		// ATOMIC: A CRASH MID-WRITE NEVER LEAVES A TRUNCATED CACHED THUMB
		writeFileAtomic(cachePath, jpeg);
		return new Response(new Uint8Array(jpeg), {
			headers: {
				'content-type': 'image/jpeg',
				'content-length': String(jpeg.byteLength),
				...NO_CACHE_HEADERS,
			},
		});
	} catch {
		// FALLBACK TO THE FULL IMAGE (WITH ITS REAL TYPE) IF THUMBNAILING IS REFUSED OR FAILS
		try {
			const bytes = await readFile(sourcePath);
			return new Response(new Uint8Array(bytes), {
				headers: {
					'content-type': sourceMime,
					'content-length': String(bytes.byteLength),
					...NO_CACHE_HEADERS,
				},
			});
		} catch {
			throw error(404, 'Cover file not found on disk.');
		}
	}
};
