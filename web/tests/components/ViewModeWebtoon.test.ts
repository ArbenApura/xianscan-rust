/**
 * @vitest-environment jsdom
 */
// IMPORTED DEP-MODULES
import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
// IMPORTED MODULES
import ViewModeWebtoon from '$lib/components/chapter/ViewModeWebtoon.svelte';

describe('ViewModeWebtoon rev URLs', () => {
	afterEach(() => {
		cleanup();
	});

	it('embeds the server revision in the image URL', () => {
		const pages = [
			{ id: 1, seq: 0, width: 100, height: 200, outputPath: 'output/1/0.png', outputRev: 4, cleanedRev: 2 },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		const img = screen.getByAltText('Page 1') as HTMLImageElement;
		expect(img.src).toContain('&rev=4');
	});

	it('falls back to rev=0 for pages without an output image', () => {
		const pages = [{ id: 2, seq: 0, width: 100, height: 200, outputPath: null, outputRev: 0, cleanedRev: 0 }];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		const img = screen.getByAltText('Page 1') as HTMLImageElement;
		expect(img.src).toContain('kind=original');
		expect(img.src).toContain('&rev=0');
	});

	it('does not render floating action pill on successfully translated pages', () => {
		const pages = [
			{ id: 1, seq: 1, status: 'done', width: 100, height: 200, outputPath: 'output/1/1.png' },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.queryByText('Re-translate')).toBeNull();
		expect(screen.queryByText('Inspect')).toBeNull();
		expect(screen.queryByText('Translated')).toBeNull();
	});

	it('renders floating action pill on failed pages', () => {
		const pages = [
			{ id: 2, seq: 1, status: 'error', error: 'LLM failed', width: 100, height: 200, outputPath: null },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.getByText('Re-translate')).toBeTruthy();
		expect(screen.getByText('Inspect')).toBeTruthy();
		expect(screen.getByText('p. 2')).toBeTruthy();
		expect(screen.getByText('LLM failed')).toBeTruthy();
	});
});
