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
