import { getBookDetails } from '$lib/server/books';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const detail = await getBookDetails(params.id);
	return {
		book: detail.book,
		chapters: detail.chapters,
	};
};
