// -- FUNCTIONS -- //

// DERIVE GLOSSARY LINK DESTINATION BASED ON CURRENT PATHNAME AND OPTIONAL BOOK ID
export function getGlossaryHref(pathname: string, bookId?: string | null): string {
	const activeBookId = pathname.startsWith('/app/books/') ? (bookId || null) : null;
	return activeBookId
		? `/app/glossary/?scope=book&bookId=${encodeURIComponent(activeBookId)}`
		: '/app/glossary';
}

// STRIP TRANSIENT TELEMETRY AND PAGE SCROLL QUERY PARAMETERS AND HASH
export function stripTargetUrlParams(urlInput: URL | string): { cleanUrl: string; changed: boolean } {
	const urlObj = typeof urlInput === 'string' ? new URL(urlInput, 'http://localhost') : new URL(urlInput.href);
	let changed = false;

	if (urlObj.searchParams.has('pageId')) {
		urlObj.searchParams.delete('pageId');
		changed = true;
	}
	if (urlObj.searchParams.has('seq')) {
		urlObj.searchParams.delete('seq');
		changed = true;
	}
	if (urlObj.hash && urlObj.hash.startsWith('#page-')) {
		urlObj.hash = '';
		changed = true;
	}

	const cleanUrl = urlObj.pathname + (urlObj.search ? urlObj.search : '') + (urlObj.hash ? urlObj.hash : '');
	return { cleanUrl, changed };
}