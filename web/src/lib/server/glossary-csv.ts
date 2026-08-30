// IMPORTED DEP-MODULES
import Papa from 'papaparse';
// IMPORTED TYPES
import type { Gender, TermCategory, TermDraft } from '$lib/types';
// IMPORTED MODULES
import { TERM_CATEGORIES } from '$lib/types';

// -- TYPES -- //

interface CsvRow {
	// NEW HEADERS (source/target) AND THE LEGACY ONES (raw/translation) ARE BOTH ACCEPTED ON IMPORT.
	source?: string;
	target?: string;
	raw?: string;
	translation?: string;
	context?: string;
	description?: string;
	category?: string;
	pinned?: string;
	// PIPE-SEPARATED ALTERNATE SOURCE FORMS (commas CAN APPEAR INSIDE A FORM, SO `|` IS THE SEPARATOR).
	aliases?: string;
}

// -- CONSTANTS -- //

// HARD CAP ON IMPORTED ROWS — A 10 MB CSV COULD OTHERWISE MATERIALISE 100k+ DRAFTS IN MEMORY.
const MAX_ROWS = 100_000;

// -- FUNCTIONS -- //

function genderFromTags(tags: string[]): Gender {
	if (tags.includes('#masculine') || tags.includes('#male')) return 'masculine';
	if (tags.includes('#feminine') || tags.includes('#female')) return 'feminine';
	return 'neuter';
}

// PARSE A `source,target,context,description` CSV (LEGACY `raw,translation` HEADERS ALSO ACCEPTED);
// DERIVE gender FROM #masculine/#feminine TAGS
export function parseGlossaryCsv(text: string): TermDraft[] {
	const parsed = Papa.parse<CsvRow>(text, {
		header: true,
		skipEmptyLines: true,
		transformHeader: (h) => h.trim().toLowerCase(),
	});
	// SURFACE A STRUCTURAL PARSE FAILURE (e.g. UNTERMINATED QUOTE) RATHER THAN SILENTLY KEEPING WHATEVER
	// ROWS HAPPENED TO PARSE. A MISSING source/target HEADER IS CAUGHT BY THE per-row CHECK BELOW.
	const fatal = parsed.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
	if (fatal) throw new Error(`Malformed CSV: ${fatal.message}`);
	const out: TermDraft[] = [];
	for (const row of parsed.data) {
		if (out.length >= MAX_ROWS) throw new Error(`Too many rows (limit ${MAX_ROWS}).`);
		const source = (row.source ?? row.raw)?.trim();
		const target = (row.target ?? row.translation)?.trim();
		if (!source || !target) continue;
		const tags = (row.description ?? '')
			.split(/\s+/)
			.map((t) => t.trim().toLowerCase())
			.filter((t) => t.startsWith('#'));
		const gender = genderFromTags(tags);
		// PRESERVE NON-GENDER TAGS FOR LOSSLESS ROUND-TRIP
		const extra = tags.filter((t) => !['#masculine', '#male', '#feminine', '#female', '#neuter'].includes(t));
		const context = row.context?.trim() || null;
		const cat = (row.category ?? '').trim().toLowerCase();
		const category = TERM_CATEGORIES.includes(cat as TermCategory) ? (cat as TermCategory) : null;
		const pinned = /^(true|1|yes|y|★)$/i.test((row.pinned ?? '').trim());
		const aliases = (row.aliases ?? '')
			.split('|')
			.map((a) => a.trim())
			.filter(Boolean);
		out.push({
			source,
			target,
			gender,
			context,
			tags: extra.length ? extra.join(' ') : null,
			category,
			pinned,
			aliases: aliases.length ? aliases : null,
			// A CSV IMPORT IS USER-CURATED → 'user' (AUTHORITATIVE, NEVER DOWNGRADED BY EXTRACTION).
			status: 'user',
		});
	}
	return out;
}

// NEUTRALISE CSV / SPREADSHEET FORMULA INJECTION: A FIELD STARTING WITH = + - @ (OR TAB / CR) IS EXECUTED AS
// A FORMULA WHEN THE EXPORT IS OPENED IN Excel / Sheets. TERMS CAN BE AUTO-EXTRACTED FROM SCRAPED CONTENT, SO
// THE VALUES AREN'T FULLY TRUSTED. PREFIX A TAB SO THE CELL IS TREATED AS TEXT — AND SINCE parseGlossaryCsv
// TRIMS source / target / context (AND SPLITS description ON WHITESPACE), THE TAB IS STRIPPED ON RE-IMPORT
// (LOSSLESS ROUND-TRIP).
function csvSafe(value: string): string {
	return /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;
}

function descriptionFor(t: TermDraft): string {
	const parts: string[] = [];
	if (t.gender === 'masculine') parts.push('#masculine');
	else if (t.gender === 'feminine') parts.push('#feminine');
	if (t.tags) parts.push(t.tags);
	return parts.join(' ');
}

// SERIALISE TERMS BACK TO A `source,target,context,category,pinned,aliases,description` CSV (ROUND-TRIPS WITH IMPORT)
export function toGlossaryCsv(terms: TermDraft[]): string {
	const columns = ['source', 'target', 'context', 'category', 'pinned', 'aliases', 'description'];
	if (terms.length === 0) {
		return columns.join(',') + '\r\n';
	}
	const rows = terms.map((t) => ({
		source: csvSafe(t.source),
		target: csvSafe(t.target),
		context: csvSafe(t.context ?? ''),
		category: t.category ?? '',
		pinned: t.pinned ? 'true' : '',
		aliases: csvSafe((t.aliases ?? []).join(' | ')),
		description: csvSafe(descriptionFor(t)),
	}));
	return Papa.unparse(rows, {
		columns,
	});
}
