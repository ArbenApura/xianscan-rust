import type { ChapterMetadata } from '../types';

// REGEX PATTERNS FOR MULTI-LANGUAGE CHAPTER & EPISODE NUMBERS
const CHAPTER_REGEXES = [
	// Chinese: 第123话, 第123.5回, 第123章
	/第\s*(\d+(?:\.\d+)?)\s*[话話章节回卷]/i,
	// Korean: 123화, 제123화, 123.5화
	/(?:제\s*)?(\d+(?:\.\d+)?)\s*화/i,
	// Japanese: 第123話, 123話
	/(?:第\s*)?(\d+(?:\.\d+)?)\s*話/i,
	// English / Latin: Chapter 123, Ch. 123, Ep. 123, Episode 123.5, #123
	/(?:chapter|chap|ch|episode|ep|vol|volume|\b#)\s*[\.:#]?\s*(\d+(?:\.\d+)?)/i,
	// URL-style: /chapter-123, /c123, /123.html
	/[\/-](?:chapter|chap|ch|ep)?-?(\d+(?:\.\d+)?)(?:\.html|\/|$)/i
];

export function detectSourceLanguageFromPage(text: string, htmlLang = ''): string {
	const lang = htmlLang.toLowerCase().trim();
	if (lang.startsWith('zh')) return 'zh';
	if (lang.startsWith('ko')) return 'ko';
	if (lang.startsWith('ja')) return 'ja';

	// Hangul range
	if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) {
		return 'ko';
	}
	// Japanese Hiragana & Katakana range
	if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
		return 'ja';
	}
	// CJK Unified Ideographs (Chinese)
	if (/[\u4e00-\u9fff]/.test(text)) {
		return 'zh';
	}

	return 'auto';
}

export function parseChapterMetadata(title: string, url = '', htmlLang = ''): ChapterMetadata {
	let chapterNumber: number | undefined;

	// 1. Try matching chapter number from title
	for (const reg of CHAPTER_REGEXES) {
		const match = title.match(reg);
		if (match && match[1]) {
			const num = parseFloat(match[1]);
			if (!isNaN(num)) {
				chapterNumber = num;
				break;
			}
		}
	}

	// 2. If not found, try URL
	if (chapterNumber === undefined && url) {
		for (const reg of CHAPTER_REGEXES) {
			const match = url.match(reg);
			if (match && match[1]) {
				const num = parseFloat(match[1]);
				if (!isNaN(num)) {
					chapterNumber = num;
					break;
				}
			}
		}
	}

	// 3. Extract series title by removing chapter and trailing website noise
	let seriesTitle = title;
	// Remove common site suffix: " - MangaDex", " | Read Manhwa Online", etc.
	seriesTitle = seriesTitle.replace(/\s*[-|–—]\s*[^—–|-]+(?:manga|manhua|manhwa|scans|comics|online|read).*$/i, '');
	
	// Remove chapter segment
	seriesTitle = seriesTitle
		.replace(/(?:第\s*)?\d+(?:\.\d+)?\s*[话話章节回卷화].*$/i, '')
		.replace(/(?:chapter|chap|ch|episode|ep|vol|volume|\b#)\s*[\.:#]?\s*\d+(?:\.\d+)?.*$/i, '')
		.replace(/\[(?:完结|완결|ongoing|raw|end)\].*$/i, '')
		.replace(/[-–—]\s*$/, '')
		.trim();

	if (!seriesTitle) {
		seriesTitle = title.trim();
	}

	const sourceLang = detectSourceLanguageFromPage(`${title} ${url}`, htmlLang);

	return {
		seriesTitle: seriesTitle || 'Untitled Series',
		chapterNumber: chapterNumber !== undefined ? chapterNumber : 1,
		chapterTitle: chapterNumber !== undefined ? `Chapter ${chapterNumber}` : 'Chapter 1',
		sourceLang
	};
}
