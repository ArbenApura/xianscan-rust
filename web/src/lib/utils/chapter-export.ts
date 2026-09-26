// CHAPTER ZIP EXPORT FEEDBACK. THE DOWNLOAD ROUTE ADDS MISSING_PAGES.TXT AND AN x-missing-pages COUNT WHEN SOME
// PAGES HAD NO READABLE IMAGE; THE TOAST SAYS SO INSTEAD OF A PLAIN SUCCESS.

// -- TYPES -- //

export interface ZipExportToast {
	kind: 'success' | 'warning';
	message: string;
}

// -- FUNCTIONS -- //

export function zipExportToast(missingPagesHeader: string | null): ZipExportToast {
	const missing = Number(missingPagesHeader ?? 0);
	if (!Number.isFinite(missing) || missing <= 0) return { kind: 'success', message: 'ZIP exported.' };
	const pagesWord = missing === 1 ? 'page' : 'pages';
	return {
		kind: 'warning',
		message: `ZIP exported. ${missing} ${pagesWord} could not be included; see MISSING_PAGES.txt.`,
	};
}

// FILE-SAFE CHAPTER NAME FOR THE ZIP AND THE FOLDER INSIDE IT. KEEPS LETTERS, MARKS AND DIGITS OF EVERY SCRIPT, SO A
// CHINESE OR KOREAN TITLE STAYS READABLE, DROPS PUNCTUATION THAT FILESYSTEMS REJECT, AND JOINS WORDS WITH UNDERSCORES.
export function chapterArchiveName(title: string | null | undefined, fallback: string): string {
	const safe = (title ?? '')
		.replace(/[^\p{L}\p{M}\p{N}_\- ]+/gu, '')
		.trim()
		.replace(/\s+/g, '_');
	return safe || fallback;
}

// CONTENT-DISPOSITION FOR A ZIP WHOSE NAME MAY BE NON-ASCII: HEADERS ONLY CARRY LATIN-1, SO THE PLAIN filename GETS
// AN ASCII-ONLY COPY AND filename* (RFC 6266 / 5987) THE FULL UTF-8 NAME, WHICH EVERY CURRENT BROWSER PREFERS.
export function zipContentDisposition(name: string, asciiFallback: string): string {
	const ascii = name.replace(/[^ -~]+/g, '').replace(/["\\]/g, '') || asciiFallback;
	return `attachment; filename="${ascii}.zip"; filename*=UTF-8''${encodeURIComponent(`${name}.zip`)}`;
}
