// GET /api/mihon/search — TITLE/AUTHOR/GENRE/STATUS SEARCH FOR THE MIHON EXTENSION.
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getSearchPage } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = ({ url }) => {
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const q = url.searchParams.get('q') || '';
	const genre = url.searchParams.get('genre') || undefined;
	const status = url.searchParams.get('status') || undefined;
	return json(getSearchPage(page, { q, genre, status }));
};
