import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { chapters, pages, regions, translations } from '../db/schema';
import { clearChapterJob } from '../translation-service';
import { DATA_ROOT } from '../paths';
import type { PipelineClient } from '../pipeline-client';
import { getImageDimensionsFromBuffer } from './dimensions';
import { prunePageThumbs, reorderPages } from './mutations';

// -- CONSTANTS -- //

// DEFAULT PAGE-HEIGHT PRESET FOR ~1500PX WIDE STRIPS. SHORTER PAGES GIVE THE OCR
// DETECTOR LARGER TEXT SCALE AND HIGHER QUALITY THAN THE OLD 1600/1000/2400 PROFILE.
export const DEFAULT_RESLICE_HEIGHTS = {
	targetHeight: 1150,
	minHeight: 850,
	maxHeight: 1400,
} as const;

// -- TYPES -- //

export interface ResliceHeightOptions {
	targetHeight: number;
	minHeight: number;
	maxHeight: number;
}

export async function stitchPageWithNext(
	pageId: number,
	pipeline: PipelineClient,
	dataRoot: string = DATA_ROOT,
): Promise<void> {
	if (!pipeline.stitch) throw new Error('Sidecar stitch operation unavailable.');
	const [topPage] = db.select().from(pages).where(eq(pages.id, pageId)).all();
	if (!topPage) throw new Error('Page not found.');

	const [botPage] = db
		.select()
		.from(pages)
		.where(and(eq(pages.chapterId, topPage.chapterId), eq(pages.seq, topPage.seq + 1)))
		.all();

	if (!botPage) throw new Error('No next page in sequence to stitch with.');

	const topAbs = join(dataRoot, topPage.filePath);
	const botAbs = join(dataRoot, botPage.filePath);

	const topBytes = readFileSync(topAbs);
	const botBytes = readFileSync(botAbs);

	const stitched = await pipeline.stitch(topBytes, botBytes);
	writeFileSync(topAbs, stitched);

	const dims = getImageDimensionsFromBuffer(stitched);
	let w: number | null = dims.width;
	let h: number | null = dims.height;
	if (!w || !h) {
		try {
			const { loadImage } = await import('@napi-rs/canvas');
			const img = await loadImage(stitched);
			w = img.width || null;
			h = img.height || null;
		} catch {
			// ignore
		}
	}

	db.update(pages)
		.set({
			status: 'pending',
			cleanedPath: null,
			outputPath: null,
			error: null,
			width: w,
			height: h,
			// THE ORIGINAL FILE BYTES WERE REWRITTEN IN PLACE — BUMP THE ORIGINAL
			// REV SO IMMUTABLE-CACHED kind=original URLS GET A FRESH VALUE INSTEAD
			// OF SERVING THE PRE-MERGE IMAGE.
			originalRev: sql`${pages.originalRev} + 1`,
		})
		.where(eq(pages.id, topPage.id))
		.run();
	db.delete(regions).where(eq(regions.pageId, topPage.id)).run();

	db.delete(regions).where(eq(regions.pageId, botPage.id)).run();
	db.delete(pages).where(eq(pages.id, botPage.id)).run();

	// STALE CACHED THUMBS FROM BEFORE THE MERGE WOULD SHOW THE OLD PAGE SPLITS —
	// PRUNE BOTH PAGES' THUMBS SO THE NEXT REQUEST REGENERATES THEM.
	prunePageThumbs(topPage.id, dataRoot);
	prunePageThumbs(botPage.id, dataRoot);
	try {
		unlinkSync(botAbs);
	} catch {
		// ignore if file missing
	}

	const remainingIds = db
		.select({ id: pages.id })
		.from(pages)
		.where(eq(pages.chapterId, topPage.chapterId))
		.orderBy(pages.seq)
		.all()
		.map((p) => p.id);

	reorderPages(topPage.chapterId, remainingIds);
}

export async function resliceChapterPages(
	chapterId: number,
	pipeline: PipelineClient,
	onProgress?: (step: string, message: string, pct: number) => void,
	signal?: AbortSignal,
	dataRoot: string = DATA_ROOT,
	heightOpts?: Partial<ResliceHeightOptions>,
): Promise<{ originalCount: number; newCount: number }> {
	if (!pipeline.reslice) throw new Error('Sidecar reslice operation unavailable.');

	// WHEN THE CLIENT DISCONNECTS, TELL THE SIDECAR TO STOP THE IN-FLIGHT RESLICE
	// AT ITS NEXT CHECKPOINT. WITHOUT THIS THE OLD JOB RUNS TO COMPLETION, KEEPS
	// HOLDING THE ENGINE LOCK, AND THE NEXT RESLICE BLOCKS BEHIND IT (UI STUCK AT 2%).
	let runId: number | undefined;
	const onAbort = () => {
		pipeline.cancelReslice?.(runId).catch(() => {
			// BEST-EFFORT — THE SIDECAR MAY ALREADY BE DOWN OR DONE.
		});
	};
	signal?.addEventListener('abort', onAbort, { once: true });

	try {
		return await runReslicePipeline(chapterId, pipeline, onProgress, signal, dataRoot, (id) => {
			runId = id;
		}, heightOpts);
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
}

async function runReslicePipeline(
	chapterId: number,
	pipeline: PipelineClient,
	onProgress: ((step: string, message: string, pct: number) => void) | undefined,
	signal: AbortSignal | undefined,
	dataRoot: string,
	setRunId: (id: number | undefined) => void,
	heightOpts?: Partial<ResliceHeightOptions>,
): Promise<{ originalCount: number; newCount: number }> {
	if (!pipeline.reslice) throw new Error('Sidecar reslice operation unavailable.');

	const heights = { ...DEFAULT_RESLICE_HEIGHTS, ...(heightOpts ?? {}) };

	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(pages.seq)
		.all();

	if (pageRows.length === 0) throw error(400, 'Chapter has no pages to reslice.');

	// STEP 1 "READ" IS NEAR-INSTANT (readFileSync) — GIVE IT ONLY 2% SO THE LONG
	// STEP 2 BELOW OWNS THE OVERWHELMING MAJORITY OF THE PROGRESS BAR.
	onProgress?.('read', `Reading ${pageRows.length} chapter image slices...`, 2);
	const imageBuffers: Buffer[] = [];
	for (const p of pageRows) {
		signal?.throwIfAborted();
		const absPath = join(dataRoot, p.filePath);
		imageBuffers.push(readFileSync(absPath));
	}

	// STEP 2 "RESLICE" IS THE DOMINANT COST (STITCH + ROW PROFILE + RT-DETR +
	// SLICING). START IT AT 2% AND LET IT SPAN 2..97% (95% OF THE BAR) SO THE UI
	// ANIMATES SMOOTHLY INSTEAD OF JUMPING THEN CRAWLING IN A TINY SLIVER.
	onProgress?.('reslice', 'Stitching continuous canvas & finding optimal non-text gutters...', 2);
	signal?.throwIfAborted();

	// CLEAR ANY STALE PROGRESS LEFT OVER FROM A PREVIOUS RUN *BEFORE* STARTING THE
	// POST + POLL LOOP. THE RESET ALSO MINTS A RUN ID: FRAMES TAGGED WITH ANY OTHER
	// RUN (E.G. A CANCELLED RUN STILL WINDING DOWN) ARE IGNORED BY THE POLLS BELOW,
	// SO A STALE `done=true` CAN NEVER FREEZE THIS RUN'S BAR.
	let runId: number | undefined;
	if (pipeline.resetResliceStatus) {
		try {
			const reset = await pipeline.resetResliceStatus(signal);
			runId = reset?.run;
			setRunId(runId);
		} catch {
			// BEST-EFFORT — THE RESLICE POST ALSO RESETS AT ITS START; PROCEED REGARDLESS.
		}
	}

	// POLL THE SIDECAR'S CURRENT RESLICE PROGRESS WHILE THE (BLOCKING) POST RUNS.
	// THE POST HOLDS THE ENGINE LOCK AND DOES THE HEAVY WORK ON A SEPARATE REQUEST;
	// THIS LIGHTWEIGHT GET RUNS CONCURRENTLY SO THE UI ANIMATES SMOOTHLY.
	const reslicePromise = pipeline.reslice(imageBuffers, signal, runId, heights);

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	if (pipeline.pollResliceStatus) {
		pollTimer = setInterval(async () => {
			try {
				const s = await pipeline.pollResliceStatus?.(signal);
				if (!s) return;
				// IGNORE FRAMES FROM OTHER RUNS — A CANCELLED RUN MAY STILL BE
				// WINDING DOWN AND ITS WRITES WOULD CORRUPT THIS RUN'S BAR.
				if (runId !== undefined && typeof s.run === 'number' && s.run !== runId) return;
				// MAP THE SIDECAR'S 0..=100 INTO OUR 2..=97 "STEP 2" BAND (95% SPAN).
				const mapped = Math.min(97, Math.round(2 + (s.pct / 100) * 95));
				onProgress?.('reslice', s.message || 'Slicing canvas & protecting dialogue...', mapped);
				if (s.done && pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
			} catch {
				// BEST-EFFORT — THE ZIP RESPONSE STILL DRIVES COMPLETION
			}
		}, 200);
	}

	let slicedBuffers: Buffer[];
	try {
		slicedBuffers = await reslicePromise;
	} finally {
		// ALWAYS CLEAR THE POLL INTERVAL — INCLUDING ON ABORT/ERROR — OTHERWISE IT LEAKS.
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}
	if (slicedBuffers.length === 0) throw new Error('Reslice produced zero pages.');

	// STEP 3 "SAVE" IS ALSO NEAR-INSTANT (writeFileSync + DB) — GIVE IT THE FINAL 3%.
	onProgress?.('save', `Writing ${slicedBuffers.length} clean pages and rebuilding database...`, 97);

	const uploadDir = join(dataRoot, 'uploads', String(chapterId));
	mkdirSync(uploadDir, { recursive: true });

	const oldFilePaths = pageRows.map((p) => join(dataRoot, p.filePath));

	const newPageRows: { chapterId: number; seq: number; filePath: string; width: number | null; height: number | null }[] = [];
	for (let seq = 0; seq < slicedBuffers.length; seq++) {
		signal?.throwIfAborted();
		const sliceBuf = slicedBuffers[seq];
		const isWebP = sliceBuf.length >= 12 && sliceBuf.toString('ascii', 0, 4) === 'RIFF' && sliceBuf.toString('ascii', 8, 12) === 'WEBP';
		const ext = isWebP ? 'webp' : 'png';
		const fileName = `${randomUUID()}.${ext}`;
		const absPath = join(uploadDir, fileName);
		writeFileSync(absPath, sliceBuf);
		const dims = getImageDimensionsFromBuffer(sliceBuf);
		let w: number | null = dims.width;
		let h: number | null = dims.height;
		if (!w || !h) {
			try {
				const { loadImage } = await import('@napi-rs/canvas');
				const img = await loadImage(sliceBuf);
				w = img.width || null;
				h = img.height || null;
			} catch {
				// ignore
			}
		}
		newPageRows.push({
			chapterId,
			seq,
			filePath: `uploads/${chapterId}/${fileName}`,
			width: w,
			height: h,
		});
	}

	db.transaction(() => {
		for (const p of pageRows) {
			db.delete(translations).where(eq(translations.pageId, p.id)).run();
			db.delete(regions).where(eq(regions.pageId, p.id)).run();
		}
		db.delete(pages).where(eq(pages.chapterId, chapterId)).run();
		for (const nr of newPageRows) {
			db.insert(pages).values(nr).run();
		}
		db.update(chapters)
			.set({
				status: 'pending',
				translatedAt: null,
				resliced: true,
				reslicedAt: Date.now(),
			})
			.where(eq(chapters.id, chapterId))
			.run();
	});

	for (const p of pageRows) {
		prunePageThumbs(p.id, dataRoot);
	}

	clearChapterJob(chapterId);

	for (const oldPath of oldFilePaths) {
		try {
			unlinkSync(oldPath);
		} catch {
			// ignore missing files
		}
	}

	for (const folder of ['clean', 'output']) {
		const dir = join(dataRoot, folder, String(chapterId));
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	return { originalCount: pageRows.length, newCount: slicedBuffers.length };
}
