import { getBooksWithTelemetry } from '$lib/server/books';
import { LAST_READ_COOKIE, parseLastReadCookie } from '$lib/stores/reading-history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const cookieVal = cookies.get(LAST_READ_COOKIE);
	const lastReadMap = parseLastReadCookie(cookieVal);
	const books = await getBooksWithTelemetry(lastReadMap);
	return {
		books,
		lastReadMap,
	};
};
