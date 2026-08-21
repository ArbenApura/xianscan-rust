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
});
