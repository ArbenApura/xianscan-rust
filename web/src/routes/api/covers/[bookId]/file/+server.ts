// DEDICATED BOOK COVER SERVING — RESIZED JPEG THUMBS WITH A DISK CACHE (MIRRORS THE PAGE THUMB PIPELINE).
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// IMPORTED MODULES
import { resolveCoverTarget } from '$lib/server/covers';
import { DATA_ROOT } from '$lib/server/paths';
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
};

// -- HANDLES -- //

export const GET: RequestHandler = async ({ params, url, request }) => {
	const target = resolveCoverTarget(params.bookId);
	if (!target) throw error(404, 'No cover available for this book.');
	const sourcePath = join(DATA_ROOT, target.rel);
	if (!existsSync(sourcePath)) throw error(404, 'Cover file not found on disk.');

	const wRaw = parseInt(url.searchParams.get('w') || '', 10);
	const isFull = url.searchParams.get('kind') === 'full' || !Number.isInteger(wRaw) || wRaw <= 0;
	const sourceExt = extname(target.rel).toLowerCase() || '.jpg';

	if (isFull) {
		const bytes = await readFile(sourcePath);
		return new Response(bytes, {
			headers: {
				'content-type': MIME_BY_EXT[sourceExt] ?? 'image/jpeg',
				'content-length': String(bytes.byteLength),
				...NO_CACHE_HEADERS,
			},
		});
	}

	// RESIZED JPEG THUMB, MEMOIZED ON DISK — THE URL CARRIES THE CONTENT REVISION IN THE KEY.
	const targetWidth = Math.min(1600, Math.max(80, wRaw));
	const cacheKey = `${params.bookId}_${target.kind}_${target.rev}_${targetWidth}.jpg`;
	const cachePath = join(DATA_ROOT, 'cache', 'covers', cacheKey);

	if (existsSync(cachePath)) {
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
	}

	try {
		mkdirSync(join(DATA_ROOT, 'cache', 'covers'), { recursive: true });
		const img = await loadImage(sourcePath);
		const scale = targetWidth / img.width;
		const targetHeight = Math.round(img.height * scale);
		const canvas = createCanvas(targetWidth, targetHeight);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
		const jpeg = canvas.toBuffer('image/jpeg', 85);
		writeFileSync(cachePath, jpeg);
		return new Response(new Uint8Array(jpeg), {
			headers: {
				'content-type': 'image/jpeg',
				'content-length': String(jpeg.byteLength),
				...NO_CACHE_HEADERS,
			},
		});
	} catch {
		// FALLBACK TO THE FULL IMAGE IF THUMBNAILING FAILS
		const bytes = await readFile(sourcePath);
		return new Response(bytes, {
			headers: {
				'content-type': MIME_BY_EXT[sourceExt] ?? 'image/jpeg',
				'content-length': String(bytes.byteLength),
				...NO_CACHE_HEADERS,
			},
		});
	}
};
