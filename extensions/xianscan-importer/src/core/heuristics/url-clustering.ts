// -- URL CLUSTERING AND STRIP DIMENSION HEURISTICS -- //

// IMPORTED TYPES
import type { ScannedImage } from '../../types';

// -- FUNCTIONS & ALGORITHMS -- //

// NORMALIZE A WEB PAGE URL FOR REPRODUCIBLE STORAGE KEYING AND REFERER MATCHING
export function normalizePageUrl(rawUrl: string): string {
	try {
		const parsed = new URL(rawUrl);
		// STRIP TRACKING & EPHEMERAL QUERY PARAMETERS
		parsed.searchParams.delete('utm_source');
		parsed.searchParams.delete('utm_medium');
		parsed.searchParams.delete('utm_campaign');
		parsed.searchParams.delete('fbclid');
		parsed.searchParams.delete('gclid');
		// PRESERVE SPA HASH ROUTING PATHS (E.G. #/chapter/107 OR #/read/107) WHILE STRIPPING IN-PAGE ANCHORS
		if (!parsed.hash.startsWith('#/') && !parsed.hash.includes('/')) {
			parsed.hash = '';
		}
		return parsed.href.replace(/\/+$/, '');
	} catch {
		if (rawUrl.includes('#/') || rawUrl.includes('#!/')) {
			return rawUrl.replace(/\/+$/, '');
		}
		return rawUrl.split('#')[0].replace(/\/+$/, '');
	}
}

// RESOLVE AN ABSOLUTE CANONICAL URL (ORIGIN + PATHNAME ONLY)
export function getCanonicalUrl(url: string): string {
	try {
		const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url;
	}
}

// DERIVE THE URL BASE AN IMAGE IS HOSTED UNDER: ORIGIN + ITS PARENT DIRECTORY.
// REAL READER PANELS OF ONE CHAPTER SHARE A CDN ORIGIN AND A COMMON DIRECTORY
// (E.G. /manga/<slug>/chapters/<chapter-id>/), WHILE ADS LIVE ON UNRELATED HOSTS/PATHS.
export function urlBase(url: string): string {
	try {
		const u = new URL(url);
		const parts = u.pathname.split('/').filter(Boolean);
		parts.pop(); // DROP THE FILENAME
		return `${u.protocol}//${u.host}/${parts.join('/')}`;
	} catch {
		return url;
	}
}

// EXTRACT SCHEME AND HOST ORIGIN FROM URL
export function urlOrigin(url: string): string {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host}`;
	} catch {
		return url;
	}
}

// CHECK WHETHER A CANDIDATE URL IS A SEQUENTIAL OR INDEXED COMIC PANEL RATHER THAN A SINGLE AD.
// PANEL FILENAMES END IN AN INCREMENTING NUMBER (1.jpeg, 002.webp, page-3.png) OR A UUID.
export function looksLikeSequentialPanel(url: string): boolean {
	try {
		const name = new URL(url).pathname.split('/').pop() || '';
		if (/(?:^|[^0-9])[0-9]{1,4}(?=\.(?:jpe?g|png|webp|avif|gif)$)/i.test(name)) return true;
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(name)) return true;
		return false;
	} catch {
		return false;
	}
}

// FIND THE MOST FREQUENT URL BASE AMONG A SET OF SCANNED IMAGES.
export function getDominantUrlBase(images: ScannedImage[]): string {
	if (images.length < 1) return '';
	if (images.length === 1) return urlBase(images[0].url);
	const counts = new Map<string, number>();
	for (const img of images) {
		const base = urlBase(img.url);
		counts.set(base, (counts.get(base) || 0) + 1);
	}
	let dominant = '';
	let max = 0;
	for (const [base, count] of counts) {
		if (count > max) { dominant = base; max = count; }
	}
	// IF >= 1 SHARE EXACT DIRECTORY BASE, USE IT
	if (max >= 1) return dominant;

	// FALLBACK: CHECK BY CDN HOST ORIGIN
	const originCounts = new Map<string, number>();
	for (const img of images) {
		const o = urlOrigin(img.url);
		originCounts.set(o, (originCounts.get(o) || 0) + 1);
	}
	let dominantOrigin = '';
	let maxOrigin = 0;
	for (const [o, count] of originCounts) {
		if (count > maxOrigin) { dominantOrigin = o; maxOrigin = count; }
	}
	return maxOrigin >= 1 ? dominantOrigin : '';
}

// PARSE INLINE ASPECT RATIO OR HEIGHT TO RECOVER GENUINE TALL STRIP DIMENSIONS
export function extractPlaceholderDimensions(el?: Element | null): { width: number; height: number } {
	if (!el || !(el instanceof HTMLElement)) return { width: 800, height: 1200 };
	const style = el.getAttribute('style') || '';
	// MATCH aspect-ratio: 720 / 18484 OR aspect-ratio: 720/18484 OR aspect-ratio: auto 720 / 18484
	const ratioMatch = style.match(/aspect-ratio:\s*(?:auto\s+)?([0-9.]+)\s*(?:\/|\:)\s*([0-9.]+)/i);
	if (ratioMatch && ratioMatch[1] && ratioMatch[2]) {
		const w = parseFloat(ratioMatch[1]);
		const h = parseFloat(ratioMatch[2]);
		if (w > 0 && h > 0) {
			return { width: Math.round(w), height: Math.round(h) };
		}
	}
	const heightMatch = style.match(/(?:min-)?height:\s*([0-9.]+)px/i);
	const widthMatch = style.match(/(?:max-|min-)?width:\s*([0-9.]+)px/i);
	if (heightMatch && heightMatch[1]) {
		const h = parseFloat(heightMatch[1]);
		const w = widthMatch && widthMatch[1] ? parseFloat(widthMatch[1]) : 800;
		if (h >= 400) {
			return { width: Math.round(w), height: Math.round(h) };
		}
	}
	const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
	if (rect && rect.height >= 400) {
		return { width: Math.round(rect.width) || 800, height: Math.round(rect.height) };
	}
	return { width: 800, height: 1200 };
}
