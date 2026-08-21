// GET /api/mihon/genres — DISTINCT TAGS ACROSS THE LIBRARY (FOR THE EXTENSION'S FILTERS).
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getGenresDto } from '$lib/server/mihon';
import type { RequestHandler } from './$types';

// -- HANDLES -- //

export const GET: RequestHandler = () => json({ genres: getGenresDto() });
