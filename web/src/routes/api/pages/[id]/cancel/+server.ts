// CANCEL AN IN-PROGRESS SINGLE PAGE TRANSLATION WITHOUT ABORTING THE ENTIRE CHAPTER JOB.
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/db/schema';
import { cancelChapterPage } from '$lib/server/translation-service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const page = db.select().from(pages).where(eq(pages.id, pageId)).get();
	if (!page) throw error(404, 'Page not found.');

	// Mark page as cancelled in the active chapter job so the pipeline stops further steps
	cancelChapterPage(page.chapterId, pageId);

	// Reset page status in DB back to pending
	db.update(pages)
		.set({ status: 'pending', error: null })
		.where(eq(pages.id, pageId))
		.run();

	return json({ ok: true });
};
