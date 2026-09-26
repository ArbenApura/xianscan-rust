// A READABLE MESSAGE FOR ANY THROWN VALUE. SVELTEKIT'S error() THROWS AN HttpError, WHICH IS NOT AN Error AND
// WHOSE toString() IS THE JSON BODY, SO `e instanceof Error ? e.message : String(e)` SHOWS {"message":"..."}.
// IMPORTED DEP-MODULES
import { isHttpError } from '@sveltejs/kit';

// -- FUNCTIONS -- //

export function errorMessage(e: unknown): string {
	if (isHttpError(e)) return e.body.message;
	if (e instanceof Error) return e.message;
	return String(e);
}
