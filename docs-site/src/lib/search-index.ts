// -- IMPORTED MODULES -- //
import { DOC_NAVIGATION } from '$lib/docs-nav';
import { DOCS_CONTENT } from '$lib/docs-content';

// -- TYPES -- //

export interface SearchResultItem {
	id: string;
	title: string;
	sectionTitle?: string;
	href: string;
	snippet?: string;
	desc?: string;
	category: string;
	score?: number;
}

export interface SearchEntry {
	id: string;
	title: string;
	sectionTitle: string;
	href: string;
	category: string;
	content: string;
}

// -- INDEX GENERATION -- //

let cachedIndex: SearchEntry[] | null = null;

export function getSearchIndex(): SearchEntry[] {
	if (cachedIndex) return cachedIndex;

	const entries: SearchEntry[] = [];

	for (const section of DOC_NAVIGATION) {
		for (const item of section.items) {
			const slug = item.href.replace(/^\/docs\//, '').replace(/\/$/, '');
			const chapter = DOCS_CONTENT[slug];

			// ADD CHAPTER ROOT ENTRY
			entries.push({
				id: `${item.id}-root`,
				title: item.title,
				sectionTitle: item.title,
				href: item.href,
				category: section.title,
				content: chapter?.description ? `${item.title} ${chapter.description}` : item.title,
			});

			// ADD INDIVIDUAL SECTIONS IF AVAILABLE
			if (chapter?.sections) {
				for (const sec of chapter.sections) {
					entries.push({
						id: `${item.id}-${sec.id}`,
						title: sec.title,
						sectionTitle: item.title,
						href: `${item.href}#${sec.id}`,
						category: section.title,
						content: `${sec.title} ${sec.content.replace(/[`#*|_~[\]()]/g, ' ')}`,
					});
				}
			}
		}
	}

	cachedIndex = entries;
	return entries;
}

// -- SEARCH SCORER -- //

export function searchDocs(query: string, maxResults = 12): SearchResultItem[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return [];

	const tokens = trimmed.split(/\s+/).filter(Boolean);
	const index = getSearchIndex();
	const results: SearchResultItem[] = [];

	for (const entry of index) {
		const lowerTitle = entry.title.toLowerCase();
		const lowerSection = entry.sectionTitle.toLowerCase();
		const lowerContent = entry.content.toLowerCase();
		const lowerCat = entry.category.toLowerCase();

		let score = 0;
		let allTokensMatched = true;

		for (const token of tokens) {
			let tokenFound = false;

			if (lowerTitle === token) {
				score += 100;
				tokenFound = true;
			} else if (lowerTitle.startsWith(token)) {
				score += 60;
				tokenFound = true;
			} else if (lowerTitle.includes(token)) {
				score += 40;
				tokenFound = true;
			}

			if (lowerSection.includes(token)) {
				score += 25;
				tokenFound = true;
			}

			if (lowerCat.includes(token)) {
				score += 15;
				tokenFound = true;
			}

			if (lowerContent.includes(token)) {
				score += 10;
				tokenFound = true;
			}

			if (!tokenFound) {
				allTokensMatched = false;
				break;
			}
		}

		if (allTokensMatched && score > 0) {
			// EXTRACT RELEVANT SNIPPET
			let snippet: string | undefined;
			const firstToken = tokens[0];
			const matchPos = lowerContent.indexOf(firstToken);
			if (matchPos !== -1) {
				const start = Math.max(0, matchPos - 35);
				const end = Math.min(entry.content.length, matchPos + 85);
				const rawSnippet = entry.content.slice(start, end).replace(/\s+/g, ' ').trim();
				snippet = (start > 0 ? '...' : '') + rawSnippet + (end < entry.content.length ? '...' : '');
			}

			results.push({
				id: entry.id,
				title: entry.title,
				sectionTitle: entry.sectionTitle,
				href: entry.href,
				snippet,
				category: entry.category,
				score,
			});
		}
	}

	results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
	return results.slice(0, maxResults);
}
