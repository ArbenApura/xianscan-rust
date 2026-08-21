// GET /api/mihon/manga/[bookId]/chapters — CHAPTER LIST FOR A BOOK.
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getChaptersDto } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = ({ params }) => json({ chapters: getChaptersDto(params.bookId) });
