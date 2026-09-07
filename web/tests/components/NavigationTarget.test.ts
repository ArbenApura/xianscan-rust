/**
 * @vitest-environment jsdom
 */
// IMPORTED DEP-MODULES
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// IMPORTED MODULES
import * as navigation from '$app/navigation';
import { getGlossaryHref, stripTargetUrlParams } from '$lib/utils/navigation';

describe('Navigation Target and URL Reference Cleanup', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	it('computes correct glossary link target based on route and active book ID', () => {
		// CHAPTER LIST ROUTE
		expect(getGlossaryHref('/app/books/book-123', 'book-123')).toBe(
			'/app/glossary/?scope=book&bookId=book-123',
		);

		// READER PAGE ROUTE
		expect(getGlossaryHref('/app/books/book-123/chapters/45', 'book-123')).toBe(
			'/app/glossary/?scope=book&bookId=book-123',
		);

		// ENCODED SPECIAL CHARACTERS IN BOOK ID
		expect(getGlossaryHref('/app/books/book%20special/chapters/1', 'book special')).toBe(
			'/app/glossary/?scope=book&bookId=book%20special',
		);

		// GLOBAL LIBRARY ROUTE
		expect(getGlossaryHref('/app', null)).toBe('/app/glossary');

		// ABOUT ROUTE
		expect(getGlossaryHref('/app/about', null)).toBe('/app/glossary');

		// GLOSSARY ROUTE ITSELF
		expect(getGlossaryHref('/app/glossary', null)).toBe('/app/glossary');
	});

	it('cleans up target pageId, seq, and page hash from URL without pushing history', () => {
		const gotoSpy = vi.spyOn(navigation, 'goto').mockResolvedValue(undefined as any);

		// SIMULATE BROWSER LOCATION CONTAINING REDIRECTED TELEMETRY TARGET
		const initialUrl = new URL(
			'http://localhost/app/books/book-1/chapters/2/?pageId=99&seq=4#page-99',
		);

		const { cleanUrl, changed } = stripTargetUrlParams(initialUrl);
		if (changed) {
			void navigation.goto(cleanUrl, { replaceState: true, noScroll: true, keepFocus: true });
		}

		expect(gotoSpy).toHaveBeenCalledTimes(1);
		expect(gotoSpy).toHaveBeenCalledWith('/app/books/book-1/chapters/2/', {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		});
	});

	it('preserves other query parameters while removing telemetry target pageId and seq', () => {
		const gotoSpy = vi.spyOn(navigation, 'goto').mockResolvedValue(undefined as any);

		const initialUrl = new URL(
			'http://localhost/app/books/book-1/chapters/2/?theme=dark&pageId=99&seq=4&debug=1#page-99',
		);

		const { cleanUrl, changed } = stripTargetUrlParams(initialUrl);
		if (changed) {
			void navigation.goto(cleanUrl, { replaceState: true, noScroll: true, keepFocus: true });
		}

		expect(gotoSpy).toHaveBeenCalledTimes(1);
		expect(gotoSpy).toHaveBeenCalledWith(
			'/app/books/book-1/chapters/2/?theme=dark&debug=1',
			{
				replaceState: true,
				noScroll: true,
				keepFocus: true,
			},
		);
	});
});
