// CLEAR ONE PAGE'S PROGRESS — REGIONS, CACHED TRANSLATIONS, AND OUTPUTS — SO A RE-RUN STARTS FRESH.
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages, chapters } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { resetPageProgress } from '$lib/server/chapters';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const pageId = Number(params.id);
	if (!Number.isInteger(pageId)) throw error(400, 'Invalid page id.');

	const page = db.select({ id: pages.id, chapterId: pages.chapterId }).from(pages).where(eq(pages.id, pageId)).get();
	if (!page) throw error(404, 'Page not found.');

	resetPageProgress(pageId);

	return json({ ok: true, chapterId: page.chapterId });
};
