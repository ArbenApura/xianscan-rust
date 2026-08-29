import type { ChapterMetadata } from '../types';

// -- REGEX PATTERNS FOR MULTI-LANGUAGE CHAPTER & EPISODE NUMBERS -- //
const CHAPTER_REGEXES = [
	// CHINESE: 第123话, 第123.5回, 第123章
	/第\s*(\d+(?:\.\d+)?)\s*[话話章节回卷]/i,
	// KOREAN: 123화, 제123화, 123.5화
	/(?:제\s*)?(\d+(?:\.\d+)?)\s*화/i,
	// JAPANESE: 第123話, 123話
	/(?:第\s*)?(\d+(?:\.\d+)?)\s*話/i,
	// ENGLISH / LATIN: Chapter 123, Ch. 123, Ep. 123, Episode 123.5, #123 (PRIORITIZE CHAPTER OVER VOLUME)
	/(?:chapter|chap|ch|episode|ep|\b#)\s*[\.:#]?\s*(\d+(?:\.\d+)?)/i,
	// FALLBACK VOLUME-ONLY PATTERN
	/(?:vol|volume)\s*[\.:#]?\s*(\d+(?:\.\d+)?)/i,
	// URL-STYLE: /chapter-123, /c123, /123.html
	/[\/-](?:chapter|chap|ch|ep)-?(\d+(?:\.\d+)?)(?:\.html|\/|$)/i,
	/[\/-](\d+(?:\.\d+)?)(?:\.html|\/|$)/i
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
	let subtitle: string | undefined;

	// 1. TRY MATCHING CHAPTER NUMBER & SUBTITLE FROM TITLE
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

	// 2. CHECK URL QUERY PARAMS (e.g. ?no=19, ?episodeNo=19, ?chapter=19, ?ep=19)
	if (chapterNumber === undefined && url) {
		try {
			const parsedUrl = new URL(url, 'https://localhost');
			const queryKeys = ['no', 'episodeno', 'episode', 'ep', 'chapter', 'chap', 'ch', 'seq', 'chapterno'];
			for (const k of queryKeys) {
				const val = parsedUrl.searchParams.get(k);
				if (val) {
					const num = parseFloat(val);
					if (!isNaN(num) && num > 0) {
						chapterNumber = num;
						break;
					}
				}
			}
		} catch {
			// IGNORE URL PARSE ERRORS
		}
	}

	// 3. IF STILL NOT FOUND, TRY URL PATH PATTERNS
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

	// 4. EXTRACT SUBTITLE IF PRESENT (e.g. "19화 - 그날의 기억" or "Ch 42: The Divine Spark")
	const subtitleMatches = [
		/(?:第\s*\d+(?:\.\d+)?\s*[话話章节回卷화]|\b(?:chapter|chap|ch|episode|ep)\s*[\.:#]?\s*\d+(?:\.\d+)?)\s*[-:：–]\s*([^|–\-_\[\]\n\r]+)/i
	];
	for (const reg of subtitleMatches) {
		const m = title.match(reg);
		if (m && m[1]) {
			const cleanedSub = m[1].replace(/\s*[-|–::]\s*[^–|-]+(?:manga|manhua|manhwa|scans|comics|online|read|webtoon|naver|kakao).*$/i, '').trim();
			if (cleanedSub && cleanedSub.length > 0 && cleanedSub.length < 50) {
				subtitle = cleanedSub;
				break;
			}
		}
	}

	// 5. EXTRACT BOOK TITLE BY REMOVING CHAPTER AND TRAILING WEBSITE NOISE
	let bookTitle = title;
	// REMOVE COMMON SITE SUFFIX: " | Read Online", ETC.
	bookTitle = bookTitle.replace(/\s*(?:[-|–]|::|\|)\s*[^–|-|:]*(?:manga|manhua|manhwa|scans|comics|online|read|webtoon|naver|kakao|웹툰|네이버|카카오|만화|漫画|咚漫|快看).*$/i, '');
	
	// REMOVE CHAPTER SEGMENTS
	const cleaned = bookTitle
		.replace(/(?:第\s*)?\d+(?:\.\d+)?\s*[话話章节回卷화].*$/i, '')
		.replace(/(?:chapter|chap|ch|episode|ep|vol|volume|\b#)\s*[\.:#]?\s*\d+(?:\.\d+)?.*$/i, '')
		.replace(/\[(?:完结|완결|ongoing|raw|end)\].*$/i, '')
		.replace(/[-–:|]\s*$/, '')
		.trim();

	if (cleaned) {
		bookTitle = cleaned;
	} else {
		bookTitle = title.trim();
	}

	const sourceLang = detectSourceLanguageFromPage(`${title} ${url}`, htmlLang);
	const resolvedBookTitle = bookTitle || 'Untitled Book';

	let resolvedChapterTitle = chapterNumber !== undefined ? `Chapter ${chapterNumber}` : 'Chapter 1';
	if (subtitle) {
		resolvedChapterTitle = `${resolvedChapterTitle}: ${subtitle}`;
	}

	return {
		bookTitle: resolvedBookTitle,
		seriesTitle: resolvedBookTitle,
		chapterNumber: chapterNumber !== undefined ? chapterNumber : 1,
		chapterTitle: resolvedChapterTitle,
		hasExplicitChapter: chapterNumber !== undefined,
		sourceLang
	};
}
