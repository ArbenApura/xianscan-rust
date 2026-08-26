// UNIT TESTS FOR REAL-TIME SYNC BUS (web/tests/server/sync-bus.test.ts)
import { describe, expect, it } from 'vitest';
import { syncBus, type SyncEvent } from '$lib/server/sync-bus';

describe('syncBus', () => {
	it('broadcasts events to active subscribers', () => {
		const received: SyncEvent[] = [];
		const unsub = syncBus.subscribe((e) => received.push(e));

		syncBus.broadcast({ type: 'book-created', bookId: 'b-100' });
		syncBus.broadcast({ type: 'chapter-created', bookId: 'b-100', chapterId: 201 });
		syncBus.broadcast({ type: 'pages-updated', bookId: 'b-100', chapterId: 201, count: 5 });

		expect(received).toHaveLength(3);
		expect(received[0].type).toBe('book-created');
		expect(received[0].bookId).toBe('b-100');
		expect(typeof received[0].timestamp).toBe('number');

		expect(received[1].type).toBe('chapter-created');
		expect(received[1].chapterId).toBe(201);

		expect(received[2].type).toBe('pages-updated');
		expect(received[2].count).toBe(5);

		unsub();
	});

	it('unsubscribes cleanly without memory leaks', () => {
		const received: SyncEvent[] = [];
		const unsub = syncBus.subscribe((e) => received.push(e));

		syncBus.broadcast({ type: 'chapter-resliced', chapterId: 301 });
		expect(received).toHaveLength(1);

		unsub();

		syncBus.broadcast({ type: 'chapter-translated', chapterId: 301 });
		expect(received).toHaveLength(1); // NO NEW EVENTS DELIVERED AFTER UNSUBSCRIBE
	});

	it('safely handles errors inside subscriber callbacks', () => {
		const received: SyncEvent[] = [];
		const badUnsub = syncBus.subscribe(() => {
			throw new Error('Subscriber threw test error');
		});
		const goodUnsub = syncBus.subscribe((e) => received.push(e));

		expect(() => {
			syncBus.broadcast({ type: 'page-translated', chapterId: 401, pageId: 501, outputRev: 2 });
		}).not.toThrow();

		expect(received).toHaveLength(1);
		expect(received[0].outputRev).toBe(2);

		badUnsub();
		goodUnsub();
	});
});
