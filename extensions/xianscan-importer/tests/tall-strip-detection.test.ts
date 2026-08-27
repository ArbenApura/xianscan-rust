// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';

let capture: typeof import('../src/content');
let sorter: typeof import('../src/utils/sorter');

const TALL_STRIP_HTML_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>Webcomic Strip Chapter 6</title></head>
<body>
	<main class="reader-container">
		<div class="page-wrapper" data-page="1" style="max-width: 720px;">
			<img class="reader-panel" src="https://cdn.example.org/comics/chapters/101/panel-1.png" width="720" height="19421">
		</div>
		<div class="page-wrapper" data-page="2" style="max-width: 720px;">
			<img class="reader-panel" src="https://cdn.example.org/comics/chapters/101/panel-2.png" width="720" height="19096">
		</div>
		<div class="page-wrapper" data-page="3" style="max-width: 720px;">
			<img class="reader-panel" src="https://cdn.example.org/comics/chapters/101/panel-3.png" width="720" height="17921">
		</div>
	</main>
</body>
</html>
`;

beforeAll(async () => {
	(window as any).__xianscan_content_injected = true;
	(globalThis as any).chrome = {
		runtime: {
			onMessage: { addListener: () => {} },
			sendMessage: () => {},
			connect: () => ({ onDisconnect: { addListener: () => {} }, onMessage: { addListener: () => {} }, postMessage: () => {} } )
		},
		storage: { local: { get: async () => ({}), set: async () => {} } },
		tabs: { query: async () => [], sendMessage: () => {} }
	};
	capture = await import('../src/content');
	sorter = await import('../src/utils/sorter');
});

afterAll(() => {
	vi.restoreAllMocks();
});

describe('tall strip image detection', () => {
	it('detects ultra-tall webtoon panel images from html fixture', () => {
		document.documentElement.innerHTML = TALL_STRIP_HTML_FIXTURE;
		(window as any).location.href = 'https://reader.example.com/comics/read/c6';

		const scanned = capture.scanPageForImages();
		expect(scanned.length).toBeGreaterThanOrEqual(1);

		const targetUrl = 'https://cdn.example.org/comics/chapters/101/panel-2.png';
		const targetFound = scanned.some(i => i.url === targetUrl);
		expect(targetFound).toBe(true);

		const sorted = sorter.sortImagesByCoordinates(scanned);
		const sortedTargetFound = sorted.some(i => i.url === targetUrl);
		expect(sortedTargetFound).toBe(true);
	});
});
