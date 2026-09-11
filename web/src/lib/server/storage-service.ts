// STORAGE SERVICE
// PROVIDES GRANULAR DISK CONSUMPTION METRICS, ORPHANED FILE PURGING,
// CACHE CLEARING, AND SAFE SYSTEM RESET.

// IMPORTED DEP-MODULES
import { readdirSync, statSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';

// IMPORTED MODULES
import { db } from './db';
import { books, chapters, pages, translations, regions, aiUsage, readingHistory } from './db/schema';
import { DATA_ROOT } from './paths';
import { pruneCoverThumbs } from './covers';
import { clearChapterJob, clearAllChapterJobs } from './translation-service';
import { batchService } from './batch-service';

// -- TYPES & INTERFACES -- //

export interface CategoryStorageStats {
	bytes: number;
	count: number;
}

export interface BookStorageStats {
	bookId: string;
	title: string;
	chapterCount: number;
	pageCount: number;
	totalBytes: number;
	categories: {
		uploads: CategoryStorageStats;
		clean: CategoryStorageStats;
		output: CategoryStorageStats;
		annotated: CategoryStorageStats;
		covers: CategoryStorageStats;
		thumbs: CategoryStorageStats;
	};
}

export interface SystemStorageStats {
	dataRoot: string;
	totalBytes: number;
	bookCount: number;
	chapterCount: number;
	pageCount: number;
	categories: {
		uploads: CategoryStorageStats;
		clean: CategoryStorageStats;
		output: CategoryStorageStats;
		annotated: CategoryStorageStats;
		covers: CategoryStorageStats;
		thumbs: CategoryStorageStats;
		database: CategoryStorageStats;
		caches: CategoryStorageStats;
	};
}

export interface PurgeResult {
	purgedFiles: number;
	reclaimedBytes: number;
}

// -- INTERNAL HELPERS -- //

function safeStat(path: string): { bytes: number; count: number } {
	if (!existsSync(path)) return { bytes: 0, count: 0 };
	try {
		const s = statSync(path);
		if (s.isDirectory()) {
			let totalBytes = 0;
			let totalFiles = 0;
			const entries = readdirSync(path);
			for (const entry of entries) {
				const res = safeStat(join(path, entry));
				totalBytes += res.bytes;
				totalFiles += res.count;
			}
			return { bytes: totalBytes, count: totalFiles };
		}
		return { bytes: s.size, count: 1 };
	} catch {
		return { bytes: 0, count: 0 };
	}
}

// -- EXPORTED FUNCTIONS -- //

// COMPUTE GRANULAR DISK USAGE METRICS FOR A SPECIFIC BOOK
export function getBookStorageStats(bookId: string, dataRoot: string = DATA_ROOT): BookStorageStats | null {
	const book = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!book) return null;

	const chapterRows = db
		.select({ id: chapters.id })
		.from(chapters)
		.where(eq(chapters.bookId, bookId))
		.all();
	const chapterIds = chapterRows.map((c) => c.id);

	const pageRows = chapterIds.length > 0
		? db.select({ id: pages.id }).from(pages).where(inArray(pages.chapterId, chapterIds)).all()
		: [];
	const pageIds = new Set(pageRows.map((p) => p.id));

	const stats: BookStorageStats = {
		bookId,
		title: book.titleTarget || book.title,
		chapterCount: chapterRows.length,
		pageCount: pageRows.length,
		totalBytes: 0,
		categories: {
			uploads: { bytes: 0, count: 0 },
			clean: { bytes: 0, count: 0 },
			output: { bytes: 0, count: 0 },
			annotated: { bytes: 0, count: 0 },
			covers: { bytes: 0, count: 0 },
			thumbs: { bytes: 0, count: 0 },
		},
	};

	// 1. CHAPTER ASSETS
	for (const cid of chapterIds) {
		const cidStr = String(cid);
		for (const folder of ['uploads', 'clean', 'output', 'annotated'] as const) {
			const folderPath = join(dataRoot, folder, cidStr);
			const res = safeStat(folderPath);
			stats.categories[folder].bytes += res.bytes;
			stats.categories[folder].count += res.count;
		}
	}

	// 2. COVERS AND CACHED COVER THUMBNAILS
	const dedicatedCoverPath = join(dataRoot, 'covers', `${bookId}.jpg`);
	const dedicatedRes = safeStat(dedicatedCoverPath);
	stats.categories.covers.bytes += dedicatedRes.bytes;
	stats.categories.covers.count += dedicatedRes.count;

	if (book.coverPath && book.coverPath !== `covers/${bookId}.jpg`) {
		const customCoverRes = safeStat(join(dataRoot, book.coverPath));
		stats.categories.covers.bytes += customCoverRes.bytes;
		stats.categories.covers.count += customCoverRes.count;
	}

	const coverCacheDir = join(dataRoot, 'cache', 'covers');
	if (existsSync(coverCacheDir)) {
		try {
			const entries = readdirSync(coverCacheDir);
			for (const f of entries) {
				if (f.startsWith(`${bookId}_dedicated_`) || f.startsWith(`${bookId}_page_`)) {
					const res = safeStat(join(coverCacheDir, f));
					stats.categories.covers.bytes += res.bytes;
					stats.categories.covers.count += res.count;
				}
			}
		} catch {
			// IGNORE
		}
	}

	// 3. PAGE THUMBNAILS
	const pageThumbDir = join(dataRoot, 'cache', 'thumbs');
	if (existsSync(pageThumbDir) && pageIds.size > 0) {
		try {
			const entries = readdirSync(pageThumbDir);
			for (const f of entries) {
				const uIdx = f.indexOf('_');
				if (uIdx > 0) {
					const pid = Number(f.slice(0, uIdx));
					if (pageIds.has(pid)) {
						const res = safeStat(join(pageThumbDir, f));
						stats.categories.thumbs.bytes += res.bytes;
						stats.categories.thumbs.count += res.count;
					}
				}
			}
		} catch {
			// IGNORE
		}
	}

	// 4. TOTAL BYTES
	stats.totalBytes =
		stats.categories.uploads.bytes +
		stats.categories.clean.bytes +
		stats.categories.output.bytes +
		stats.categories.annotated.bytes +
		stats.categories.covers.bytes +
		stats.categories.thumbs.bytes;

	return stats;
}

// COMPUTE AGGREGATE SYSTEM-WIDE STORAGE USAGE ACROSS ALL DATA FOLDERS
export function getSystemStorageStats(dataRoot: string = DATA_ROOT): SystemStorageStats {
	const allBooks = db.select({ id: books.id }).from(books).all();
	const allChapters = db.select({ id: chapters.id }).from(chapters).all();
	const allPages = db.select({ id: pages.id }).from(pages).all();

	const stats: SystemStorageStats = {
		dataRoot,
		totalBytes: 0,
		bookCount: allBooks.length,
		chapterCount: allChapters.length,
		pageCount: allPages.length,
		categories: {
			uploads: safeStat(join(dataRoot, 'uploads')),
			clean: safeStat(join(dataRoot, 'clean')),
			output: safeStat(join(dataRoot, 'output')),
			annotated: safeStat(join(dataRoot, 'annotated')),
			covers: { bytes: 0, count: 0 },
			thumbs: safeStat(join(dataRoot, 'cache', 'thumbs')),
			database: { bytes: 0, count: 0 },
			caches: { bytes: 0, count: 0 },
		},
	};

	// COVERS - COMBINE covers/ DIRECTORY AND cache/covers/ DIRECTORY
	const dedicatedCovers = safeStat(join(dataRoot, 'covers'));
	const cachedCovers = safeStat(join(dataRoot, 'cache', 'covers'));
	stats.categories.covers.bytes = dedicatedCovers.bytes + cachedCovers.bytes;
	stats.categories.covers.count = dedicatedCovers.count + cachedCovers.count;

	// DATABASE FILES
	for (const dbName of ['xianscan.db', 'xianscan.db-wal', 'xianscan.db-shm']) {
		const dbRes = safeStat(join(dataRoot, dbName));
		stats.categories.database.bytes += dbRes.bytes;
		stats.categories.database.count += dbRes.count;
	}

	// OTHER CACHES (TRANSLATION, ETC.)
	const translateCache = safeStat(join(dataRoot, 'cache', 'translate'));
	stats.categories.caches.bytes += translateCache.bytes;
	stats.categories.caches.count += translateCache.count;

	stats.totalBytes =
		stats.categories.uploads.bytes +
		stats.categories.clean.bytes +
		stats.categories.output.bytes +
		stats.categories.annotated.bytes +
		stats.categories.covers.bytes +
		stats.categories.thumbs.bytes +
		stats.categories.database.bytes +
		stats.categories.caches.bytes;

	return stats;
}

// SCAN DISK TO PERMANENTLY PURGE ORPHANED CHAPTER FOLDERS, STALE COVERS, AND UNATTACHED THUMBNAILS
export function purgeOrphanedStorage(dataRoot: string = DATA_ROOT): PurgeResult {
	let purgedFiles = 0;
	let reclaimedBytes = 0;

	const allBooks = db.select({ id: books.id }).from(books).all();
	const allChapters = db.select({ id: chapters.id }).from(chapters).all();
	const allPages = db.select({ id: pages.id, chapterId: pages.chapterId, filePath: pages.filePath, cleanedPath: pages.cleanedPath, outputPath: pages.outputPath, annotatedPath: pages.annotatedPath, status: pages.status }).from(pages).all();

	const activeBookIds = new Set(allBooks.map((b) => b.id));
	const activeChapterIds = new Set(allChapters.map((c) => c.id));
	const activePageIds = new Set(allPages.map((p) => p.id));

	// RETROACTIVELY CLEAR ANNOTATED PATH IN DATABASE FOR NON-PROCESSING PAGES
	const deadAnnotatedPages = allPages.filter((p) => p.annotatedPath && (p.outputPath || p.status !== 'processing'));
	if (deadAnnotatedPages.length > 0) {
		const targetIds = deadAnnotatedPages.map((p) => p.id);
		db.update(pages)
			.set({ annotatedPath: null })
			.where(inArray(pages.id, targetIds))
			.run();
	}

	const activePaths = new Set<string>();
	for (const p of allPages) {
		if (p.filePath) activePaths.add(p.filePath.replace(/\\/g, '/'));
		if (p.cleanedPath) activePaths.add(p.cleanedPath.replace(/\\/g, '/'));
		if (p.outputPath) activePaths.add(p.outputPath.replace(/\\/g, '/'));
		// PRESERVE ANNOTATED ONLY IF THE PAGE IS ACTIVELY IN PROCESSING STATE WITHOUT FINAL OUTPUT
		if (p.annotatedPath && !p.outputPath && p.status === 'processing') {
			activePaths.add(p.annotatedPath.replace(/\\/g, '/'));
		}
	}

	// 1. CHAPTER FOLDERS & LOOSE FILES IN uploads, clean, output, annotated
	for (const folder of ['uploads', 'clean', 'output', 'annotated'] as const) {
		const folderPath = join(dataRoot, folder);
		if (!existsSync(folderPath)) continue;
		let entries: string[];
		try {
			entries = readdirSync(folderPath);
		} catch {
			continue;
		}

		for (const entry of entries) {
			const fullPath = join(folderPath, entry);
			const isDir = statSync(fullPath, { throwIfNoEntry: false })?.isDirectory() ?? false;

			if (isDir) {
				const chId = Number(entry);
				if (isNaN(chId) || !activeChapterIds.has(chId)) {
					// ENTIRE DIRECTORY IS ORPHANED (NON-NUMERIC FOLDER OR DELETED CHAPTER)
					const s = safeStat(fullPath);
					try {
						rmSync(fullPath, { recursive: true, force: true });
						purgedFiles += s.count;
						reclaimedBytes += s.bytes;
					} catch {
						// IGNORE
					}
				} else {
					// CHECK FOR UNREFERENCED INDIVIDUAL FILES INSIDE THE ACTIVE CHAPTER FOLDER
					try {
						const files = readdirSync(fullPath);
						for (const file of files) {
							const rel = `${folder}/${entry}/${file}`.replace(/\\/g, '/');
							if (!activePaths.has(rel)) {
								const fPath = join(fullPath, file);
								const fsRes = safeStat(fPath);
								try {
									unlinkSync(fPath);
									purgedFiles += 1;
									reclaimedBytes += fsRes.bytes;
								} catch {
									// IGNORE
								}
							}
						}
						// IF ANNOTATED CHAPTER DIRECTORY IS NOW EMPTY, REMOVE IT
						if (folder === 'annotated') {
							try {
								const remaining = readdirSync(fullPath);
								if (remaining.length === 0) {
									rmSync(fullPath, { recursive: true, force: true });
								}
							} catch {
								// IGNORE
							}
						}
					} catch {
						// IGNORE
					}
				}
			} else {
				// LOOSE FILE DIRECTLY UNDER FOLDER (E.G. UNATTACHED RAW SCAN)
				const rel = `${folder}/${entry}`.replace(/\\/g, '/');
				if (!activePaths.has(rel)) {
					const fsRes = safeStat(fullPath);
					try {
						unlinkSync(fullPath);
						purgedFiles += 1;
						reclaimedBytes += fsRes.bytes;
					} catch {
						// IGNORE
					}
				}
			}
		}
	}

	// 2. DEDICATED COVERS IN covers/
	const coversDir = join(dataRoot, 'covers');
	if (existsSync(coversDir)) {
		try {
			const files = readdirSync(coversDir);
			for (const file of files) {
				const dotIdx = file.lastIndexOf('.');
				const bid = dotIdx > 0 ? file.slice(0, dotIdx) : file;
				if (!activeBookIds.has(bid)) {
					const fPath = join(coversDir, file);
					const fsRes = safeStat(fPath);
					try {
						unlinkSync(fPath);
						purgedFiles += 1;
						reclaimedBytes += fsRes.bytes;
					} catch {
						// IGNORE
					}
				}
			}
		} catch {
			// IGNORE
		}
	}

	// 3. CACHED COVERS IN cache/covers/
	const cacheCoversDir = join(dataRoot, 'cache', 'covers');
	if (existsSync(cacheCoversDir)) {
		try {
			const files = readdirSync(cacheCoversDir);
			for (const file of files) {
				const match = file.match(/^(.*)_(?:dedicated|page)_\d+_\d+\.jpg$/);
				const coverBookId = match ? match[1] : null;
				let isOrphan = false;
				if (coverBookId) {
					isOrphan = !activeBookIds.has(coverBookId);
				} else {
					let matchesActive = false;
					for (const bid of activeBookIds) {
						if (file.startsWith(`${bid}_dedicated_`) || file.startsWith(`${bid}_page_`)) {
							matchesActive = true;
							break;
						}
					}
					isOrphan = !matchesActive;
				}

				if (isOrphan) {
					const fPath = join(cacheCoversDir, file);
					const fsRes = safeStat(fPath);
					try {
						unlinkSync(fPath);
						purgedFiles += 1;
						reclaimedBytes += fsRes.bytes;
					} catch {
						// IGNORE
					}
				}
			}
		} catch {
			// IGNORE
		}
	}

	// 4. CACHED PAGE THUMBNAILS IN cache/thumbs/
	const thumbsDir = join(dataRoot, 'cache', 'thumbs');
	if (existsSync(thumbsDir)) {
		try {
			const files = readdirSync(thumbsDir);
			for (const file of files) {
				const uIdx = file.indexOf('_');
				if (uIdx > 0) {
					const pid = Number(file.slice(0, uIdx));
					if (!activePageIds.has(pid)) {
						const fPath = join(thumbsDir, file);
						const fsRes = safeStat(fPath);
						try {
							unlinkSync(fPath);
							purgedFiles += 1;
							reclaimedBytes += fsRes.bytes;
						} catch {
							// IGNORE
						}
					}
				}
			}
		} catch {
			// IGNORE
		}
	}

	return { purgedFiles, reclaimedBytes };
}

// CLEAR ALL THUMBNAIL AND RUNTIME CACHES WITHOUT TOUCHING ORIGINAL FILES OR DATABASE RECORDS
export function clearSystemCaches(dataRoot: string = DATA_ROOT): PurgeResult {
	let purgedFiles = 0;
	let reclaimedBytes = 0;

	for (const cacheSub of ['cache/thumbs', 'cache/covers', 'cache/translate']) {
		const target = join(dataRoot, cacheSub);
		if (!existsSync(target)) continue;
		const s = safeStat(target);
		try {
			rmSync(target, { recursive: true, force: true });
			purgedFiles += s.count;
			reclaimedBytes += s.bytes;
		} catch {
			// IGNORE
		}
	}

	return { purgedFiles, reclaimedBytes };
}

// CLEAR ALL DATA - SAFELY DELETE ALL BOOKS, CHAPTERS, PAGES, PHYSICAL ASSETS, AND RESET DB
export async function clearAllSystemData(dataRoot: string = DATA_ROOT): Promise<{ ok: true; purgedFiles: number; reclaimedBytes: number }> {
	// 1. ABORT ALL RUNNING BATCH AND CHAPTER PIPELINE JOBS
	try {
		batchService.cancelBatch();
		batchService.clearBatch();
	} catch {
		// IGNORE IF NO BATCH RUNNING
	}

	clearAllChapterJobs();

	// 2. MEASURE TOTAL DATA SIZE BEFORE WIPING
	let reclaimedBytes = 0;
	let purgedFiles = 0;

	for (const folder of ['uploads', 'clean', 'output', 'annotated', 'covers', 'cache']) {
		const target = join(dataRoot, folder);
		if (existsSync(target)) {
			const s = safeStat(target);
			reclaimedBytes += s.bytes;
			purgedFiles += s.count;
			try {
				rmSync(target, { recursive: true, force: true });
			} catch {
				// IGNORE
			}
		}
	}

	// 3. RESET SQLITE DATABASE TABLES
	db.transaction(() => {
		db.delete(readingHistory).run();
		db.delete(translations).run();
		db.delete(regions).run();
		db.delete(pages).run();
		db.delete(chapters).run();
		db.delete(books).run();
		db.delete(aiUsage).run();
	});

	// 4. RUN VACUUM TO RECLAIM DB PAGES
	try {
		db.run(sql`VACUUM`);
	} catch {
		// IGNORE
	}

	return { ok: true, purgedFiles, reclaimedBytes };
}
