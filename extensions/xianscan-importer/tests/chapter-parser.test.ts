import { describe, it, expect } from 'vitest';
import { parseChapterMetadata, detectSourceLanguageFromPage } from '../src/utils/chapter-parser';

describe('parseChapterMetadata', () => {
	it('extracts English chapter numbers and subtitles', () => {
		const meta = parseChapterMetadata('Tales of Demons and Gods Chapter 42 - The Divine Spark', 'https://example.com/manga/todg/chapter-42');
		expect(meta.chapterNumber).toBe(42);
		expect(meta.chapterTitle).toBe('Chapter 42: The Divine Spark');
		expect(meta.bookTitle).toBe('Tales of Demons and Gods');
		expect(meta.seriesTitle).toBe('Tales of Demons and Gods');
	});

	it('extracts chapter number from URL query parameters (e.g. ?no=19)', () => {
		const meta = parseChapterMetadata('화산귀환 :: 네이버 웹툰', 'https://comic.naver.com/webtoon/detail?titleId=836052&no=19&week=thu');
		expect(meta.chapterNumber).toBe(19);
		expect(meta.chapterTitle).toBe('Chapter 19');
		expect(meta.bookTitle).toBe('화산귀환');
	});

	it('extracts Chinese chapter patterns', () => {
		const meta = parseChapterMetadata('妖神记 第150话 神秘古书', 'https://example.com/manhua/yaoshenji/150.html');
		expect(meta.chapterNumber).toBe(150);
		expect(meta.bookTitle).toBe('妖神记');
		expect(meta.seriesTitle).toBe('妖神记');
		expect(meta.sourceLang).toBe('zh-Hans');
	});

	it('extracts Korean episode patterns', () => {
		const meta = parseChapterMetadata('나 혼자만 레벨업 179화 [완결]', 'https://example.com/webtoon/sololeveling/ep-179');
		expect(meta.chapterNumber).toBe(179);
		expect(meta.bookTitle).toBe('나 혼자만 레벨업');
		expect(meta.seriesTitle).toBe('나 혼자만 레벨업');
		expect(meta.sourceLang).toBe('ko');
	});

	it('extracts Japanese chapter patterns', () => {
		const meta = parseChapterMetadata('呪術廻戦 第236話 南へ', 'https://example.com/manga/jjk/ch-236');
		expect(meta.chapterNumber).toBe(236);
		expect(meta.bookTitle).toBe('呪術廻戦');
		expect(meta.seriesTitle).toBe('呪術廻戦');
		expect(meta.sourceLang).toBe('ja');
	});

	it('handles decimal chapters (e.g. Chapter 42.5)', () => {
		const meta = parseChapterMetadata('One Piece Ch. 1044.5 Extra', 'https://example.com/op/1044.5');
		expect(meta.chapterNumber).toBe(1044.5);
	});

	it('prioritizes chapter over volume when both are present in title', () => {
		const meta = parseChapterMetadata('Solo Leveling Vol. 2 Chapter 15 - The Awakening', 'https://example.com/manga/solo-leveling-vol-2/chapter-15');
		expect(meta.chapterNumber).toBe(15);
		expect(meta.chapterTitle).toBe('Chapter 15: The Awakening');
	});
});

describe('detectSourceLanguageFromPage', () => {
	it('detects Korean from Hangul characters', () => {
		expect(detectSourceLanguageFromPage('나 혼자만 레벨업', 'ko')).toBe('ko');
	});

	it('detects Japanese from Hiragana/Katakana characters', () => {
		expect(detectSourceLanguageFromPage('鬼滅の刃 きめつのやいば', 'ja')).toBe('ja');
	});

	it('detects Simplified Chinese from Hanzi', () => {
		expect(detectSourceLanguageFromPage('斗破苍穹 绝世唐门', 'zh')).toBe('zh-Hans');
	});

	it('detects Traditional Chinese from Hanzi', () => {
		expect(detectSourceLanguageFromPage('鬥破蒼穹 絕世唐門', 'zh-hant')).toBe('zh-Hant');
	});

	it('detects Thai and Russian from text', () => {
		expect(detectSourceLanguageFromPage('มหาเวทย์ผนึกมาร', 'th')).toBe('th');
		expect(detectSourceLanguageFromPage('Магическая битва', 'ru')).toBe('ru');
	});
});
