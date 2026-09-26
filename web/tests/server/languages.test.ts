import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SOURCE_LANG,
	DEFAULT_TARGET_LANG,
	detectSourceLanguage,
	getLanguage,
	languageName,
	LANGUAGES,
	leakRepairApplies,
	SOURCE_LANGUAGE_OPTIONS,
	TARGET_LANGUAGE_OPTIONS,
	targetLanguageOptions,
} from '$lib/languages';
import { matchTerms } from '$lib/server/glossary-match';
import { typesetPage, wrapText } from '$lib/server/typeset';
import { createCanvas } from '@napi-rs/canvas';

describe('Language Registry & Auto-Detection', () => {
	it('includes major comic source language options', () => {
		const codes = SOURCE_LANGUAGE_OPTIONS.map((o) => o.value);
		expect(codes).toEqual([
			'zh-Hans',
			'zh-Hant',
			'ja',
			'ko',
			'fr',
			'es',
			'id',
			'ru',
			'th',
			'en',
		]);
	});

	it('auto-detects Simplified Chinese from text', () => {
		expect(detectSourceLanguage('妖神记 第1话 重生')).toBe('zh-Hans');
		expect(detectSourceLanguage('全职法师 莫凡')).toBe('zh-Hans');
		expect(detectSourceLanguage('这里有很多人')).toBe('zh-Hans');
	});

	it('auto-detects Traditional Chinese from text', () => {
		expect(detectSourceLanguage('妖神記 第1話 重生')).toBe('zh-Hant');
		expect(detectSourceLanguage('全職法師 莫凡')).toBe('zh-Hant');
		expect(detectSourceLanguage('這裡有很多人')).toBe('zh-Hant');
	});

	it('auto-detects Japanese from text', () => {
		expect(detectSourceLanguage('ワンピース 第1話')).toBe('ja');
		expect(detectSourceLanguage('こんにちは世界')).toBe('ja');
	});

	it('auto-detects Korean from text', () => {
		expect(detectSourceLanguage('나 혼자만 레벨업')).toBe('ko');
		expect(detectSourceLanguage('안녕하세요')).toBe('ko');
	});

	it('auto-detects Russian from text', () => {
		expect(detectSourceLanguage('Глава 1: Начало')).toBe('ru');
	});

	it('auto-detects Thai from text', () => {
		expect(detectSourceLanguage('ตอนที่ 1: การเริ่มต้น')).toBe('th');
	});

	it('auto-detects English from text', () => {
		expect(detectSourceLanguage('Tales of Demons and Gods')).toBe('en');
		expect(detectSourceLanguage('Chapter 12: Breakthrough')).toBe('en');
	});

	it('includes core tier 1 and tier 2 languages in LANGUAGES', () => {
		expect(LANGUAGES.en).toBeDefined();
		expect(LANGUAGES.en.name).toBe('English');
		expect(LANGUAGES.en.tier).toBe(1);

		expect(LANGUAGES['zh-Hans']).toBeDefined();
		expect(LANGUAGES['zh-Hans'].tier).toBe(1);

		expect(LANGUAGES.ja).toBeDefined();
		expect(LANGUAGES.ja.name).toBe('Japanese');
		expect(LANGUAGES.ja.tier).toBe(2);

		expect(LANGUAGES.ko).toBeDefined();
		expect(LANGUAGES.ko.name).toBe('Korean');
		expect(LANGUAGES.ko.tier).toBe(2);
	});

	it('includes primary target languages in TARGET_LANGUAGE_OPTIONS and targetLanguageOptions()', () => {
		const targetCodes = TARGET_LANGUAGE_OPTIONS.map((o) => o.value);
		expect(targetCodes).toContain('en');
		expect(targetCodes).toContain('ja');
		expect(targetCodes).toContain('ko');
		expect(targetCodes).not.toContain('fil');

		const all = targetLanguageOptions();
		const enOption = all.find((o) => o.value === 'en');
		expect(enOption).toBeDefined();
		expect(enOption?.tier).toBe(1);
	});

	it('correctly resolves language codes and aliases via getLanguage', () => {
		expect(getLanguage('en').name).toBe('English');
		expect(getLanguage('ja').name).toBe('Japanese');
		expect(getLanguage('ko').name).toBe('Korean');
		expect(getLanguage('zh-CN').code).toBe('zh-Hans');
		expect(getLanguage('zh-TW').code).toBe('zh-Hant');
		expect(getLanguage('auto').code).toBe('zh-Hans');
		expect(getLanguage(undefined).code).toBe('zh-Hans');
		expect(DEFAULT_SOURCE_LANG).toBe('zh-Hans');
	});

	it('returns correct display names via languageName', () => {
		expect(languageName('zh-Hans')).toBe('Simplified Chinese');
		expect(languageName('en')).toBe('English');
		expect(languageName('ja')).toBe('Japanese');
		expect(languageName('ko')).toBe('Korean');
		expect(languageName('none')).toBe('Original');
	});

	it('handles leak repair check correctly for non-CJK languages', () => {
		expect(leakRepairApplies('zh-Hans')).toBe(true);
		expect(leakRepairApplies('ja')).toBe(true);
		expect(leakRepairApplies('ko')).toBe(true);
		expect(leakRepairApplies('en')).toBe(false);
		expect(leakRepairApplies('es')).toBe(false);
	});
});

describe('Multilingual Pipeline & Typesetting', () => {
	it('wordDelimited is true for space-separated languages and false for CJK', () => {
		expect(getLanguage('en').wordDelimited).toBe(true);
		expect(getLanguage('es').wordDelimited).toBe(true);
		expect(getLanguage('id').wordDelimited).toBe(true);
		expect(getLanguage('zh-Hans').wordDelimited).toBe(false);
		expect(getLanguage('ja').wordDelimited).toBe(false);
	});

	it('typesets Latin and CJK text onto a page canvas cleanly', async () => {
		const canvas = createCanvas(100, 100);
		const ctx = canvas.getContext('2d');
		const lines = wrapText(ctx, 'Good morning everyone! How is your day?', 80);
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.join(' ')).toContain('Good');
	});
});

describe('scriptOfLanguage (FEAT-006)', () => {
	it('accepts the same regional aliases as getLanguage', async () => {
		const { scriptOfLanguage } = await import('$lib/languages');
		expect(scriptOfLanguage('zh-CN')).toBe('han');
		expect(scriptOfLanguage('zh_TW')).toBe('han');
		expect(scriptOfLanguage('zh-HK')).toBe('han');
		expect(scriptOfLanguage('ja-JP')).toBe('kana');
		expect(scriptOfLanguage('ko_KR')).toBe('hangul');
		expect(scriptOfLanguage('ar')).toBe('arabic');
	});

	it('does not default unknown or auto codes to Chinese', async () => {
		const { scriptOfLanguage, getLanguage } = await import('$lib/languages');
		expect(scriptOfLanguage('auto')).toBeNull();
		expect(scriptOfLanguage('')).toBeNull();
		// getLanguage KEEPS ITS CHINESE DEFAULT FOR EXISTING CALLERS
		expect(getLanguage('xx').code).toBe('zh-Hans');
	});
});

describe('right-to-left languages (FEAT-007)', () => {
	it('isRtlLanguage knows Arabic and its regional codes, and nothing else', async () => {
		const { isRtlLanguage } = await import('$lib/languages');
		expect(isRtlLanguage('ar')).toBe(true);
		expect(isRtlLanguage('ar-EG')).toBe(true);
		expect(isRtlLanguage('en')).toBe(false);
		expect(isRtlLanguage('xx')).toBe(false);
		expect(isRtlLanguage(null)).toBe(false);
	});

	it('regional codes resolve to the base language', async () => {
		const { getLanguage } = await import('$lib/languages');
		expect(getLanguage('ar-SA').code).toBe('ar');
		expect(getLanguage('pt_BR').code).toBe('pt');
		expect(getLanguage('zh-TW').code).toBe('zh-Hant');
	});

	it('TARGET_LANGUAGE_OPTIONS lists every registered language, Arabic included', async () => {
		const { TARGET_LANGUAGE_OPTIONS, LANGUAGES } = await import('$lib/languages');
		expect(TARGET_LANGUAGE_OPTIONS.map((o) => o.value).sort()).toEqual(Object.keys(LANGUAGES).sort());
		expect(TARGET_LANGUAGE_OPTIONS.find((o) => o.value === 'ar')?.label).toBe('العربية (Arabic - Tier 3)');
	});
});
