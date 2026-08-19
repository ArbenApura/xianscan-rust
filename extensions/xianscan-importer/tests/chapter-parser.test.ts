import { describe, it, expect } from 'vitest';
import { parseChapterMetadata, detectSourceLanguageFromPage } from '../src/utils/chapter-parser';

describe('parseChapterMetadata', () => {
	it('extracts English chapter numbers', () => {
		const meta = parseChapterMetadata('Tales of Demons and Gods Chapter 42 - The Divine Spark', 'https://example.com/manga/todg/chapter-42');
		expect(meta.chapterNumber).toBe(42);
		expect(meta.seriesTitle).toBe('Tales of Demons and Gods');
	});

	it('extracts Chinese chapter patterns', () => {
		const meta = parseChapterMetadata('妖神记 第150话 神秘古书', 'https://example.com/manhua/yaoshenji/150.html');
		expect(meta.chapterNumber).toBe(150);
		expect(meta.seriesTitle).toBe('妖神记');
		expect(meta.sourceLang).toBe('zh');
	});

	it('extracts Korean episode patterns', () => {
		const meta = parseChapterMetadata('나 혼자만 레벨업 179화 [완결]', 'https://example.com/webtoon/sololeveling/ep-179');
		expect(meta.chapterNumber).toBe(179);
		expect(meta.seriesTitle).toBe('나 혼자만 레벨업');
		expect(meta.sourceLang).toBe('ko');
	});

	it('extracts Japanese chapter patterns', () => {
		const meta = parseChapterMetadata('呪術廻戦 第236話 南へ', 'https://example.com/manga/jjk/ch-236');
		expect(meta.chapterNumber).toBe(236);
		expect(meta.seriesTitle).toBe('呪術廻戦');
		expect(meta.sourceLang).toBe('ja');
	});

	it('handles decimal chapters (e.g. Chapter 42.5)', () => {
		const meta = parseChapterMetadata('One Piece Ch. 1044.5 Extra', 'https://example.com/op/1044.5');
		expect(meta.chapterNumber).toBe(1044.5);
	});
});

describe('detectSourceLanguageFromPage', () => {
	it('detects Korean from Hangul characters', () => {
		expect(detectSourceLanguageFromPage('나 혼자만 레벨업', 'ko')).toBe('ko');
	});

	it('detects Japanese from Hiragana/Katakana characters', () => {
		expect(detectSourceLanguageFromPage('鬼滅の刃 きめつのやいば', 'ja')).toBe('ja');
	});

	it('detects Chinese from Hanzi when no Kana is present', () => {
		expect(detectSourceLanguageFromPage('斗破苍穹 绝世唐门', 'zh')).toBe('zh');
	});
});
