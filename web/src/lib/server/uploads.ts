// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';

// -- CONSTANTS -- //

export const MB = 1024 * 1024;

// -- FUNCTIONS -- //

// REJECT AN OVERSIZED UPLOAD (413) BEFORE IT IS READ FULLY INTO MEMORY.
export function assertMaxSize(file: File, maxBytes: number): void {
	if (file.size > maxBytes) {
		throw error(413, `File too large — the limit is ${Math.round(maxBytes / MB)} MB.`);
	}
}

// READ AN UPLOAD'S MULTIPART FORM WITHOUT MASKING THE REAL FAILURE. WHEN THE BODY EXCEEDS THE SERVER'S
// BODY_SIZE_LIMIT (adapter-node DEFAULT 512K — LOWER THAN EVERY FILE ENDPOINT'S LIMIT), THE BODY READ
// THROWS A 413 SvelteKitError ("Payload Too Large"); SWALLOWING IT AND REPORTING "FILE MISSING" TURNS AN
// OVERSIZED UPLOAD INTO A CONFUSING 400. ANY HTTP-SHAPED ERROR (HAS A NUMERIC status — COVERS BOTH THE
// 413 FROM THE BODY READ AND `error()`'s HttpError) IS RE-THROWN UNCHANGED; ANY OTHER READ FAILURE BECOMES
// A CLEAR 400.
export async function readUploadForm(request: Request): Promise<FormData> {
	try {
		return await request.formData();
	} catch (e) {
		if (e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number') throw e;
		throw error(
			400,
			e instanceof Error ? `Could not read upload body: ${e.message}` : 'Could not read upload body.'
		);
	}
}
