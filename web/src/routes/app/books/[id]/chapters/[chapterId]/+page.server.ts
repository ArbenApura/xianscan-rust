import { error } from '@sveltejs/kit';
import { getChapterReaderData } from '$lib/server/chapters';
import { LAST_READ_COOKIE, parseLastReadCookie, serializeLastReadCookie } from '$lib/stores/reading-history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const chapterId = Number(params.chapterId);
	if (!Number.isInteger(chapterId)) {
		throw error(400, 'Invalid chapter id.');
	}

	const data = await getChapterReaderData(chapterId);
	if (data.chapter.bookId !== params.id) {
		throw error(404, 'Chapter does not belong to the specified book.');
	}

	// PERSIST LAST READ POINTER IN COOKIE FOR SSR CONTINUATION
	try {
		const existing = parseLastReadCookie(cookies.get(LAST_READ_COOKIE));
		existing[params.id] = {
			chapterId: data.chapter.id,
			seq: data.chapter.seq,
			title: data.chapter.title,
			titleTarget: data.chapter.titleTarget,
			updatedAt: Date.now(),
		};
		cookies.set(LAST_READ_COOKIE, serializeLastReadCookie(existing), {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false,
		});
	} catch {
		// Ignore cookie errors
	}

	return {
		chapter: data.chapter,
		prevChapter: data.prevChapter,
		nextChapter: data.nextChapter,
		allChapters: data.allChapters,
		pages: data.pages,
	};
};
