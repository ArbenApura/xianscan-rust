// @vitest-environment jsdom
// INTENSIVE STRESS & RACE CONDITION TESTS FOR SETTINGS & READING HISTORY
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { settings, DEFAULTS, type AppSettings } from '../../src/lib/stores/settings';
import { readingHistory } from '../../src/lib/stores/reading-history';

describe('Settings & Reading History Sync Engine Stress Tests', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('Settings Store Loop Prevention & Debounced Sync', () => {
		it('prevents infinite network sync loops when hydrating from remote server state', () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = fetchSpy;

			// Trigger hydrateFromRemote with new server settings
			settings.hydrateFromRemote({
				inpaintMode: 'full',
				enableSfx: true,
				sfxMaxAreaPct: 0.40,
			});

			// Fast-forward timers
			vi.advanceTimersByTime(1000);

			// Because of isRemoteSyncing lock, NO network PATCH should have been dispatched!
			expect(fetchSpy).not.toHaveBeenCalled();

			const current = get(settings);
			expect(current.inpaintMode).toBe('full');
			expect(current.enableSfx).toBe(true);
			expect(current.sfxMaxAreaPct).toBe(0.40);
		});

		it('debounces rapid user setting mutations into a single consolidated PATCH', () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = fetchSpy;

			// User rapidly adjusts slider 5 times within 200ms
			settings.update((s) => ({ ...s, sfxMaxAreaPct: 0.15 }));
			settings.update((s) => ({ ...s, sfxMaxAreaPct: 0.20 }));
			settings.update((s) => ({ ...s, sfxMaxAreaPct: 0.25 }));
			settings.update((s) => ({ ...s, sfxMaxAreaPct: 0.30 }));
			settings.update((s) => ({ ...s, sfxMaxAreaPct: 0.35 }));

			// Advance only 200ms (debounce is 500ms)
			vi.advanceTimersByTime(200);
			expect(fetchSpy).not.toHaveBeenCalled();

			// Advance remaining 350ms to cross the debounce threshold
			vi.advanceTimersByTime(350);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
			expect(callBody.sfxMaxAreaPct).toBe(0.35);
		});
	});

	describe('Reading History Scroll Throttling & Beacon Flush', () => {
		it('throttles rapid scroll updates and only sends consolidated final reading progress', () => {
			const fetchSpy = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = fetchSpy;

			// User rapidly scrolls past 20 pages in 1 second
			for (let p = 1; p <= 20; p++) {
				readingHistory.recordReading(
					'book-test',
					{ id: 101, seq: 0, title: 'Ch 1' },
					p,
					50,
					false
				);
			}

			// Advance 1 second (throttle buffer is 2.5s)
			vi.advanceTimersByTime(1000);
			expect(fetchSpy).not.toHaveBeenCalled();

			// Advance remaining 1.6s to trigger flush
			vi.advanceTimersByTime(1600);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
			// Batched payload array
			expect(callBody[0].pageSeq).toBe(20);
			expect(callBody[0].bookId).toBe('book-test');
		});

		it('merges remote history without rolling back newer local reading timestamps', () => {
			const now = Date.now();

			// Local state recorded 10 seconds ago at Ch 3
			readingHistory.recordReading(
				'book-merge',
				{ id: 303, seq: 2, title: 'Ch 3' },
				10,
				30,
				false
			);

			// Stale remote history arrives from an older session (Ch 1, 1 hour ago)
			readingHistory.hydrateFromRemote({
				'book-merge': {
					chapterId: 101,
					seq: 0,
					pageSeq: 5,
					totalPages: 30,
					completed: false,
					updatedAt: now - 3600_000, // 1 hour ago
				},
			});

			const history = readingHistory.getLastRead('book-merge');
			// Local newer progress at Ch 3 must be preserved
			expect(history?.chapterId).toBe(303);
			expect(history?.seq).toBe(2);
		});
	});
});
