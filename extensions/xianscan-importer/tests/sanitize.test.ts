import { describe, it, expect } from 'vitest';
import { sanitizeFileName, sanitizeDirectoryName } from '../src/utils/sanitize';

describe('sanitizeFileName', () => {
	it('strips illegal Windows characters', () => {
		const raw = 'Tales of Demons: Chapter 42? *Special Edition* <RAW> | Vol 1/2';
		const clean = sanitizeFileName(raw);
		expect(clean).not.toMatch(/[\\/:*?"<>|]/);
		expect(clean).toBe('Tales of Demons Chapter 42 Special Edition RAW Vol 1 2');
	});

	it('collapses multiple spaces', () => {
		const raw = 'Title    with    multiple   spaces';
		expect(sanitizeFileName(raw)).toBe('Title with multiple spaces');
	});

	it('handles Windows reserved device names', () => {
		expect(sanitizeFileName('CON')).toBe('CON_file');
		expect(sanitizeFileName('prn')).toBe('prn_file');
		expect(sanitizeFileName('aux.txt')).toBe('aux_file.txt');
		expect(sanitizeFileName('nul')).toBe('nul_file');
		expect(sanitizeFileName('com1')).toBe('com1_file');
		expect(sanitizeFileName('lpt3')).toBe('lpt3_file');
		expect(sanitizeFileName('com1.page.png')).toBe('com1_file.page.png');
	});

	it('handles empty or blank strings with fallback', () => {
		expect(sanitizeFileName('')).toBe('untitled');
		expect(sanitizeFileName('   ')).toBe('untitled');
		expect(sanitizeFileName('???')).toBe('untitled');
		expect(sanitizeFileName('.png')).toBe('untitled.png');
	});

	it('limits excessively long filenames while preserving extension', () => {
		const long = 'a'.repeat(300) + '.jpg';
		const sanitized = sanitizeFileName(long, 100);
		expect(sanitized.length).toBeLessThanOrEqual(100);
		expect(sanitized.endsWith('.jpg')).toBe(true);
	});
});

describe('sanitizeDirectoryName', () => {
	it('sanitizes directory names correctly', () => {
		expect(sanitizeDirectoryName('Chapter: 42/50')).toBe('Chapter 42 50');
	});
});
