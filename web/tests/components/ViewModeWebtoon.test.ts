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

	it('renders inline error retry banner with Inspect and Retry on failed page', () => {
		const pages = [
			{ id: 2, seq: 1, status: 'error', error: 'LLM failed', width: 100, height: 200, outputPath: null },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.getByText('Retry')).toBeTruthy();
		expect(screen.getByText('Inspect')).toBeTruthy();
		expect(screen.getByText('LLM failed')).toBeTruthy();
		expect(screen.queryByText('Re-translate')).toBeNull();
	});

	it('renders retry banner even if status is stuck in processing when error is present', () => {
		const pages = [
			{ id: 3, seq: 2, status: 'processing', error: 'LLM quota exceeded', width: 100, height: 200, outputPath: null },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.getByText('LLM quota exceeded')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
		expect(screen.getByText('Inspect')).toBeTruthy();
	});

	it('renders processing pill with step label when actively processing without error', () => {
		const pages = [
			{ id: 4, seq: 0, status: 'processing', currentStep: 'translate', width: 100, height: 200, outputPath: null },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.getByText('p. 1')).toBeTruthy();
		expect(screen.getByText('Translating...')).toBeTruthy();
		expect(screen.queryByText('Retry')).toBeNull();
		expect(screen.queryByText('Inspect')).toBeNull();
	});

	it('renders retry banner when AI provider authentication fails', () => {
		const pages = [
			{ id: 5, seq: 0, status: 'error', error: 'Translation failed (Invalid API key)', width: 100, height: 200, outputPath: null },
		];
		render(ViewModeWebtoon, {
			props: { pages, webtoonKind: 'output', webtoonWidth: 'md' },
		});
		expect(screen.getByText('Translation failed (Invalid API key)')).toBeTruthy();
		expect(screen.getByText('Retry')).toBeTruthy();
		expect(screen.getByText('Inspect')).toBeTruthy();
	});
});
