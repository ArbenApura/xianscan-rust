import type { ChapterMetadata } from '../types';

// -- REGEX PATTERNS FOR MULTI-LANGUAGE CHAPTER & EPISODE NUMBERS -- //
const CHAPTER_REGEXES = [
	// CHINESE: 第123话, 第123.5回, 第123章
	/第\s*(\d+(?:\.\d+)?)\s*[话話章节回卷]/i,
	// KOREAN: 123화, 제123화, 123.5화
	/(?:제\s*)?(\d+(?:\.\d+)?)\s*화/i,
	// JAPANESE: 第123話, 123話
	/(?:第\s*)?(\d+(?:\.\d+)?)\s*話/i,
	// ENGLISH / LATIN: Chapter 123, Ch. 123, Ep. 123, Episode 123.5, #123
	/(?:chapter|chap|ch|episode|ep|vol|volume|\b#)\s*[\.:#]?\s*(\d+(?:\.\d+)?)/i,
	// URL-STYLE: /chapter-123, /c123, /123.html
	/[\/-](?:chapter|chap|ch|ep)?-?(\d+(?:\.\d+)?)(?:\.html|\/|$)/i
];

const TRADITIONAL_HAN_PATTERN = /[們這為會經說國動時現實體學業發問門沒進聽階級歡迎龍鳳飛鳥馬魚車書長萬與變並單當點對讓頭儘幾後畫兒極總處愛鐵無樂義氣開專鬥蒼術靈斬寶閣莊記話職師歸來劍聖陣傳廣導應隊戰惡獸護衛歷險煉]/;
const CYRILLIC_PATTERN = /[\u0400-\u04ff\u0500-\u052f]/;
const THAI_PATTERN = /[\u0e00-\u0e7f]/;

export function detectSourceLanguageFromPage(text: string, htmlLang = ''): string {
	const lang = htmlLang.toLowerCase().trim();
	if (lang.startsWith('zh-hant') || lang.startsWith('zh-tw') || lang.startsWith('zh-hk')) return 'zh-Hant';
	if (lang.startsWith('zh')) return 'zh-Hans';
	if (lang.startsWith('ko')) return 'ko';
	if (lang.startsWith('ja')) return 'ja';
	if (lang.startsWith('th')) return 'th';
	if (lang.startsWith('ru') || lang.startsWith('uk')) return 'ru';
	if (lang.startsWith('fr')) return 'fr';
	if (lang.startsWith('es')) return 'es';
	if (lang.startsWith('id')) return 'id';
	if (lang.startsWith('en')) return 'en';

	// HANGUL RANGE
	if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) {
		return 'ko';
	}
	// JAPANESE HIRAGANA & KATAKANA RANGE
	if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
		return 'ja';
	}
	// THAI SCRIPT
	if (THAI_PATTERN.test(text)) {
		return 'th';
	}
	// CYRILLIC SCRIPT
	if (CYRILLIC_PATTERN.test(text)) {
		return 'ru';
	}
	// CJK UNIFIED IDEOGRAPHS (TRADITIONAL VS SIMPLIFIED)
	if (/[\u4e00-\u9fff]/.test(text)) {
		return TRADITIONAL_HAN_PATTERN.test(text) ? 'zh-Hant' : 'zh-Hans';
	}

	return 'auto';
}

export function parseChapterMetadata(title: string, url = '', htmlLang = ''): ChapterMetadata {
	let chapterNumber: number | undefined;

	// 1. TRY MATCHING CHAPTER NUMBER FROM TITLE
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

	// 2. IF NOT FOUND, TRY URL
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

	// 3. EXTRACT SERIES TITLE BY REMOVING CHAPTER AND TRAILING WEBSITE NOISE
	let seriesTitle = title;
	// REMOVE COMMON SITE SUFFIX: " - MangaDex", " | Read Manhwa Online", ETC.
	seriesTitle = seriesTitle.replace(/\s*[-|–]\s*[^–|-]+(?:manga|manhua|manhwa|scans|comics|online|read).*$/i, '');
	
	// REMOVE CHAPTER SEGMENTS
	const cleaned = seriesTitle
		.replace(/(?:第\s*)?\d+(?:\.\d+)?\s*[话話章节回卷화].*$/i, '')
		.replace(/(?:chapter|chap|ch|episode|ep|vol|volume|\b#)\s*[\.:#]?\s*\d+(?:\.\d+)?.*$/i, '')
		.replace(/\[(?:完结|완결|ongoing|raw|end)\].*$/i, '')
		.replace(/[-–]\s*$/, '')
		.trim();

	if (cleaned) {
		seriesTitle = cleaned;
	} else {
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
