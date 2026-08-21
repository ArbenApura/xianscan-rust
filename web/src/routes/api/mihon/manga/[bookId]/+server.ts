// GET /api/mihon/manga/[bookId] — SINGLE-BOOK DETAIL (FILLS SMANGA ON MIHON).
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getMangaDetail } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = ({ params }) => json(getMangaDetail(params.bookId));
