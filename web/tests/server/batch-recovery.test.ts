// IMPORTED DEP-MODULES
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
// IMPORTED MODULES
import { appSettings } from '$lib/server/db/schema';
import { getTestDb, resetDb, seedBook, seedChapter, seedPage, type TestDb } from '../helpers/db';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('Persistent batch queue crash recovery', () => {
	let db: TestDb;

	beforeEach(async () => {
		db = getTestDb();
		resetDb();
		const { batchService } = await import('$lib/server/batch-service');
		batchService.clearBatch();
	});

	it('persists active batch record to database when batch starts', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_recovery_1', title: 'Test Book' });
		seedChapter(db, { bookId: 'book_recovery_1', seq: 1, title: 'Chapter 1' });
		seedChapter(db, { bookId: 'book_recovery_1', seq: 2, title: 'Chapter 2' });

		await batchService.startBatch(
			'book_recovery_1',
			'Test Book',
			[1, 2],
			{ parallelWorkers: 2, pageConcurrency: 1 },
		);

		const record = batchService.getPersistedBatchRecord();
		expect(record).not.toBeNull();
		expect(record?.state?.active).toBe(true);
		expect(record?.state?.bookId).toBe('book_recovery_1');
		expect(record?.state?.queue).toHaveLength(2);
		expect(record?.options?.parallelWorkers).toBe(2);

		// VERIFY DIRECT SQLITE ROW IN APP_SETTINGS
		const row = db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, 'active_batch_job'))
			.get();
		expect(row).toBeDefined();
		const parsed = JSON.parse(row!.value);
		expect(parsed.state.bookId).toBe('book_recovery_1');

		batchService.clearBatch();
	});

	it('cleans up persisted batch record when batch is cleared or cancelled', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_clean_1', title: 'Test Book' });
		seedChapter(db, { bookId: 'book_clean_1', seq: 1, title: 'Chapter 1' });

		await batchService.startBatch(
			'book_clean_1',
			'Test Book',
			[1],
		);

		expect(batchService.getPersistedBatchRecord()).not.toBeNull();

		batchService.cancelBatch();
		expect(batchService.getPersistedBatchRecord()).toBeNull();

		const row = db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, 'active_batch_job'))
			.get();
		expect(row).toBeUndefined();
	});

	it('reconciles interrupted processing chapters back to queued with finished page counts', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_rec_2', title: 'Reconcile Book' });
		const ch1 = seedChapter(db, { bookId: 'book_rec_2', seq: 1, title: 'Chapter 1' });
		const ch2 = seedChapter(db, { bookId: 'book_rec_2', seq: 2, title: 'Chapter 2' });

		// CH1 HAS 3 PAGES, 2 ARE FINISHED (OUTPUT PATH SET)
		seedPage(db, { chapterId: ch1.id, seq: 0, outputPath: 'uploads/c1/p0_out.png' });
		seedPage(db, { chapterId: ch1.id, seq: 1, outputPath: 'uploads/c1/p1_out.png' });
		seedPage(db, { chapterId: ch1.id, seq: 2 }); // UNFINISHED PAGE

		// CH2 HAS 2 UNFINISHED PAGES
		seedPage(db, { chapterId: ch2.id, seq: 0 });
		seedPage(db, { chapterId: ch2.id, seq: 1 });

		// SIMULATE PERSISTED RECORD FROM AN UNEXPECTED PROCESS TERMINATION WHILE TRANSLATING CH1
		const mockInterruptedRecord = {
			state: {
				active: true,
				status: 'running',
				bookId: 'book_rec_2',
				bookTitle: 'Reconcile Book',
				queue: [
					{
						id: ch1.id,
						seq: 1,
						title: 'Chapter 1',
						status: 'processing',
						pageCount: 3,
						translatedPages: 1,
						totalPages: 3,
					},
					{
						id: ch2.id,
						seq: 2,
						title: 'Chapter 2',
						status: 'queued',
						pageCount: 2,
						translatedPages: 0,
						totalPages: 2,
					},
				],
				currentIndex: 0,
				startedAt: Date.now() - 60000,
				completedAt: null,
			},
			options: {
				parallelWorkers: 2,
			},
			updatedAt: Date.now() - 10000,
		};

		db.insert(appSettings)
			.values({
				key: 'active_batch_job',
				value: JSON.stringify(mockInterruptedRecord),
			})
			.run();

		// TRIGGER STARTUP RECONCILIATION
		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).not.toBeNull();
		expect(recovered?.active).toBe(true);
		expect(recovered?.status).toBe('running');
		expect(recovered?.queue).toHaveLength(2);

		// CH1 WAS PROCESSING, SO IT SHOULD BE RECONCILED TO QUEUED WITH TRANSLATEDPAGES = 2
		const recoveredCh1 = recovered!.queue.find((q) => q.id === ch1.id);
		expect(recoveredCh1?.status).toBe('queued');
		expect(recoveredCh1?.translatedPages).toBe(2);
		expect(recoveredCh1?.totalPages).toBe(3);

		// CH2 REMAINS QUEUED
		const recoveredCh2 = recovered!.queue.find((q) => q.id === ch2.id);
		expect(recoveredCh2?.status).toBe('queued');
		expect(recoveredCh2?.translatedPages).toBe(0);

		batchService.clearBatch();
	});

	it('marks completed chapters as done if all pages finished before termination', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_rec_3', title: 'Complete Book' });
		const ch1 = seedChapter(db, { bookId: 'book_rec_3', seq: 1, title: 'Chapter 1' });
		const ch2 = seedChapter(db, { bookId: 'book_rec_3', seq: 2, title: 'Chapter 2' });

		// CH1 ALL PAGES DONE
		seedPage(db, { chapterId: ch1.id, seq: 0, outputPath: 'uploads/c1/p0_out.png' });
		seedPage(db, { chapterId: ch1.id, seq: 1, outputPath: 'uploads/c1/p1_out.png' });

		// CH2 ZERO PAGES DONE
		seedPage(db, { chapterId: ch2.id, seq: 0 });

		const mockInterruptedRecord = {
			state: {
				active: true,
				status: 'running',
				bookId: 'book_rec_3',
				bookTitle: 'Complete Book',
				queue: [
					{
						id: ch1.id,
						seq: 1,
						title: 'Chapter 1',
						status: 'processing',
						pageCount: 2,
						translatedPages: 1,
						totalPages: 2,
					},
					{
						id: ch2.id,
						seq: 2,
						title: 'Chapter 2',
						status: 'queued',
						pageCount: 1,
						translatedPages: 0,
						totalPages: 1,
					},
				],
				currentIndex: 0,
				startedAt: Date.now() - 30000,
				completedAt: null,
			},
			updatedAt: Date.now() - 5000,
		};

		db.insert(appSettings)
			.values({
				key: 'active_batch_job',
				value: JSON.stringify(mockInterruptedRecord),
			})
			.run();

		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).not.toBeNull();

		const recoveredCh1 = recovered!.queue.find((q) => q.id === ch1.id);
		expect(recoveredCh1?.status).toBe('done');
		expect(recoveredCh1?.translatedPages).toBe(2);

		// CURRENTINDEX ADVANCES TO FIRST UNFINISHED CHAPTER
		expect(recovered?.currentIndex).toBe(1);

		batchService.clearBatch();
	});

	it('enforces crash loop defense after 3 repeated sudden terminations on the same chapter', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_crash_loop', title: 'Crash Book' });
		const ch1 = seedChapter(db, { bookId: 'book_crash_loop', seq: 1, title: 'Fragile Chapter' });
		const ch2 = seedChapter(db, { bookId: 'book_crash_loop', seq: 2, title: 'Stable Chapter' });

		seedPage(db, { chapterId: ch1.id, seq: 0 });
		seedPage(db, { chapterId: ch2.id, seq: 0 });

		// SIMULATE PREVIOUS 2 RECORDED TERMINATIONS ON CH1
		const mockInterruptedRecord = {
			state: {
				active: true,
				status: 'running',
				bookId: 'book_crash_loop',
				bookTitle: 'Crash Book',
				queue: [
					{
						id: ch1.id,
						seq: 1,
						title: 'Fragile Chapter',
						status: 'processing',
						pageCount: 1,
						translatedPages: 0,
						totalPages: 1,
					},
					{
						id: ch2.id,
						seq: 2,
						title: 'Stable Chapter',
						status: 'queued',
						pageCount: 1,
						translatedPages: 0,
						totalPages: 1,
					},
				],
				currentIndex: 0,
				startedAt: Date.now() - 50000,
				completedAt: null,
			},
			recoveryCount: {
				[ch1.id]: 2,
			},
			updatedAt: Date.now() - 2000,
		};

		db.insert(appSettings)
			.values({
				key: 'active_batch_job',
				value: JSON.stringify(mockInterruptedRecord),
			})
			.run();

		// THIRD RECOVERY SHOULD TRIGGER DEFENSE AND MARK CH1 AS ERROR
		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).not.toBeNull();

		const recoveredCh1 = recovered!.queue.find((q) => q.id === ch1.id);
		expect(recoveredCh1?.status).toBe('error');
		expect(recoveredCh1?.error).toContain('unexpected terminations');

		// CH2 SHOULD BE THE CURRENT INDEX READY TO RUN
		expect(recovered?.currentIndex).toBe(1);

		batchService.clearBatch();
	});

	it('preserves paused status across restarts if user paused before exit', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_paused', title: 'Paused Book' });
		const ch1 = seedChapter(db, { bookId: 'book_paused', seq: 1, title: 'Chapter 1' });
		seedPage(db, { chapterId: ch1.id, seq: 0 });

		const mockPausedRecord = {
			state: {
				active: true,
				status: 'paused',
				bookId: 'book_paused',
				bookTitle: 'Paused Book',
				queue: [
					{
						id: ch1.id,
						seq: 1,
						title: 'Chapter 1',
						status: 'paused',
						pageCount: 1,
						translatedPages: 0,
						totalPages: 1,
					},
				],
				currentIndex: 0,
				startedAt: Date.now() - 20000,
				completedAt: null,
			},
			updatedAt: Date.now() - 1000,
		};

		db.insert(appSettings)
			.values({
				key: 'active_batch_job',
				value: JSON.stringify(mockPausedRecord),
			})
			.run();

		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).not.toBeNull();
		expect(recovered?.status).toBe('paused');

		batchService.clearBatch();
	});

	it('cleans up corrupt JSON in app_settings and returns null gracefully', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		db.insert(appSettings)
			.values({
				key: 'active_batch_job',
				value: '{ broken_json: true, invalid... ',
			})
			.run();

		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).toBeNull();

		// ROW MUST BE CLEANED UP
		const row = db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, 'active_batch_job'))
			.get();
		expect(row).toBeUndefined();
	});

	it('persists processing status when chapter starts and resets force flag on recovery', async () => {
		const { batchService } = await import('$lib/server/batch-service');

		seedBook(db, { id: 'book_live_test', title: 'Live Test Book' });
		const ch1 = seedChapter(db, { bookId: 'book_live_test', seq: 1, title: 'Chapter 1' });
		seedPage(db, { chapterId: ch1.id, seq: 0 });

		await batchService.startBatch(
			'book_live_test',
			'Live Test Book',
			[ch1.id],
			{ force: true, parallelWorkers: 1 },
		);

		// VERIFY PERSISTED RECORD IS WRITTEN
		const record = batchService.getPersistedBatchRecord();
		expect(record).not.toBeNull();
		expect(record?.state?.active).toBe(true);

		// SIMULATE CRASH RECOVERY
		const recovered = batchService.reconcileAndRecoverOnStartup(true);
		expect(recovered).not.toBeNull();
		expect(recovered?.force).toBe(false);

		batchService.clearBatch();
	});
});
