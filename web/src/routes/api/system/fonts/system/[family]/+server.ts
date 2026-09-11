// OS SYSTEM FONT BINARY STREAMING ENDPOINT
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { readFileSync, existsSync } from 'node:fs';
// IMPORTED MODULES
import { resolveSystemFontFilePath } from '$lib/server/typeset/fonts';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ params }) => {
	const family = decodeURIComponent(params.family || '');
	if (!family) {
		return new Response('FONT FAMILY REQUIRED', { status: 400 });
	}

	const filePath = resolveSystemFontFilePath(family);
	if (!filePath || !existsSync(filePath)) {
		return new Response('SYSTEM FONT FILE NOT FOUND', { status: 404 });
	}

	try {
		const buffer = readFileSync(filePath);
		const lower = filePath.toLowerCase();
		const mimeType = lower.endsWith('.otf')
			? 'font/otf'
			: lower.endsWith('.ttc')
				? 'font/collection'
				: 'font/ttf';

		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': buffer.length.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		});
	} catch (e: any) {
		return new Response(e?.message || 'FAILED TO READ FONT', { status: 500 });
	}
};
