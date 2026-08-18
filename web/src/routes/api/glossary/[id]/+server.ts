// IMPORTED DEP-TYPES
import type { RequestHandler } from './$types';
// IMPORTED DEP-MODULES
import { error, json } from '@sveltejs/kit';
import { updateGlossaryTermSchema } from '$lib/schemas';
// IMPORTED MODULES
import { deleteTerm, updateTerm } from '$lib/server/glossary';

// -- FUNCTIONS -- //

// STRICT POSITIVE-INTEGER PK PARSE — REJECTS "3.9", "0x10", " 3 ", "3abc" THAT Number() WOULD COERCE.
function parseId(s: string): number | null {
	if (!/^\d+$/.test(s)) return null;
	const n = Number(s);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = parseId(params.id);
	if (id === null) throw error(400, 'Invalid id.');
	const parsed = updateGlossaryTermSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid update.');
	// updateTerm RETURNS null FOR A MISSING id → 404.
	const row = await updateTerm(id, parsed.data);
	if (!row) throw error(404, 'Term not found.');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) throw error(400, 'Invalid id.');
	await deleteTerm(id);
	return json({ ok: true });
};
