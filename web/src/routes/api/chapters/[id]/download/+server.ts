// DOWNLOAD A CHAPTER'S TRANSLATED PAGES AS A ZIP (fflate).
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { zipSync } from 'fflate';
// IMPORTED MODULES
import { assertChapterExists } from '$lib/server/chapters';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/db/schema';
import { DATA_ROOT } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const chapterId = Number(params.id);
	if (!Number.isInteger(chapterId)) throw error(400, 'Invalid chapter id.');
	const chapter = await assertChapterExists(chapterId);

	const done = db.select().from(pages).where(eq(pages.chapterId, chapterId)).orderBy(pages.seq).all();

	const files: Record<string, Uint8Array> = {};
	let exported = 0;
	for (const p of done) {
		const outPath = p.outputPath ?? p.filePath; // FALL BACK TO THE ORIGINAL WHEN NOT TRANSLATED
		// ORIGINALS ARE ALWAYS WEBP (GLOBAL WEBP POLICY) WHILE TYPESET OUTPUT IS PNG — DERIVE
		// THE ENTRY EXTENSION FROM THE ACTUAL FILE INSTEAD OF HARDCODING ".png".
		const ext = extname(outPath).toLowerCase() || '.webp';
		const bytes = readFileSync(join(DATA_ROOT, outPath));
		files[`${String(p.seq).padStart(3, '0')}${ext}`] = new Uint8Array(bytes);
		exported++;
	}
	if (exported === 0) throw error(404, 'This chapter has no pages yet.');

	const zipped = zipSync(files, { level: 6 });
	const safeTitle = chapter.title.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || `chapter_${chapterId}`;
	return new Response(zipped, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${safeTitle}.zip"`,
		},
	});
};
