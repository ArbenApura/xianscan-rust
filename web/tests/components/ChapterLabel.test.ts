import { describe, it, expect } from 'vitest';
import { chapterLabel, stripChapterPrefix, stripLeadingTitle } from '$lib/chapter-label';

describe('Chapter Label Extraction & Formatting', () => {
	it('parses Chinese numerical chapter markers', () => {
		expect(chapterLabel('第一章 少年觉醒')).toEqual({ kind: 'chapter', number: 1 });
		expect(chapterLabel('第二十三章 突破神境')).toEqual({ kind: 'chapter', number: 23 });
		expect(chapterLabel('第555章 大战爆发')).toEqual({ kind: 'chapter', number: 555 });
	});

	it('parses Korean chapter markers', () => {
		expect(chapterLabel('제1장 각성')).toEqual({ kind: 'chapter', number: 1 });
		expect(chapterLabel('123화 새로운 시작')).toEqual({ kind: 'chapter', number: 123 });
	});

	it('parses English chapter markers', () => {
		expect(chapterLabel('Chapter 42: The Answer')).toEqual({ kind: 'chapter', number: 42 });
	});

	it('identifies special chapters (Prologues, Epilogues, Extras, Notes)', () => {
		expect(chapterLabel('楔子 混沌之初')).toEqual({ kind: 'special', tag: 'Prologue' });
		expect(chapterLabel('Prologue: The Fall')).toEqual({ kind: 'special', tag: 'Prologue' });
		expect(chapterLabel('番外篇 一段过往')).toEqual({ kind: 'special', tag: 'Extra' });
		expect(chapterLabel('作者感言')).toEqual({ kind: 'special', tag: 'Note' });
	});

	it('strips chapter prefix and leading redundant title lines', () => {
		expect(stripChapterPrefix('第一章 少年觉醒')).toBe('少年觉醒');
		expect(stripLeadingTitle('第一章 少年觉醒\n\n正文从这里开始...', '第一章 少年觉醒')).toBe('正文从这里开始...');
	});
});
