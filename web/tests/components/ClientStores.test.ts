/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { settings, THEME_CLASS } from '$lib/stores/settings';
import { readingHistory, parseLastReadCookie, serializeLastReadCookie } from '$lib/stores/reading-history';
import { mlStatus } from '$lib/stores/ml-status';

describe('Client Svelte Stores', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('settings store initializes with default theme and handles switching', () => {
		settings.update((s) => ({ ...s, theme: 'dark' }));
		const current = get(settings);
		expect(current.theme).toBe('dark');
		expect(THEME_CLASS.dark).toBe('bg-[#13100c] text-[#d8cfc2]');
	});

	it('readingHistory store records and retrieves last opened chapter per book', () => {
		readingHistory.recordReading('book-abc', {
			id: 42,
			seq: 5,
			title: 'Chapter 6',
		});

		const record = readingHistory.getLastRead('book-abc');
		expect(record).toBeTruthy();
		expect(record?.chapterId).toBe(42);
		expect(record?.seq).toBe(5);

		readingHistory.clearBook('book-abc');
		expect(readingHistory.getLastRead('book-abc')).toBeNull();
	});

	it('serializes and parses reading history cookies safely', () => {
		const original = {
			'book-1': { chapterId: 10, seq: 1, updatedAt: 12345 },
		};
		const cookieStr = serializeLastReadCookie(original);
		const parsed = parseLastReadCookie(cookieStr);
		expect(parsed['book-1'].chapterId).toBe(10);
	});

	it('mlStatus store provides subscription and health check lifecycle', () => {
		const state = get(mlStatus);
		expect(state).toHaveProperty('online');
		expect(state).toHaveProperty('activeProvider');
		expect(typeof mlStatus.checkHealth).toBe('function');
	});
});
