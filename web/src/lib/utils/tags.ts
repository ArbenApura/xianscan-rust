// SHARED TAG (GENRE) HELPERS — TAGS ARE STORED IN THE DB AS A JSON-ENCODED STRING ARRAY.

// -- FUNCTIONS -- //

export function parseTags(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((t) => String(t).trim()).filter((t) => t.length > 0);
		}
	} catch {
		// IGNORE INVALID JSON
	}
	return [];
}

export function serializeTags(tags: string[]): string {
	const cleaned = (tags ?? [])
		.map((t) => String(t ?? '').trim())
		.filter((t) => t.length > 0)
		.filter((t, i, arr) => arr.indexOf(t) === i);
	return JSON.stringify(cleaned);
}
