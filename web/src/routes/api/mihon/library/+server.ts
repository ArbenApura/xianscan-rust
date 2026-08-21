// GET /api/mihon/library — PAGINATED, RECENT-FIRST LIBRARY FOR THE MIHON EXTENSION.
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getLibraryPage } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const genre = url.searchParams.get('genre') || undefined;
	const status = url.searchParams.get('status') || undefined;
	return json(getLibraryPage(page, { genre, status }));
};
