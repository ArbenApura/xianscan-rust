// CHAPTER STITCHING AND RESLICING
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { pages, regions, translations } from '../db/schema';
import { DATA_ROOT } from '../paths';
import type { PipelineClient } from '../pipeline-client';
import { getImageDimensionsFromBuffer } from './dimensions';
import { reorderPages } from './mutations';

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
		})
		.where(eq(pages.id, topPage.id))
		.run();
	db.delete(regions).where(eq(regions.pageId, topPage.id)).run();

	db.delete(regions).where(eq(regions.pageId, botPage.id)).run();
	db.delete(pages).where(eq(pages.id, botPage.id)).run();
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
): Promise<{ originalCount: number; newCount: number }> {
	if (!pipeline.reslice) throw new Error('Sidecar reslice operation unavailable.');
	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(pages.seq)
		.all();

	if (pageRows.length === 0) throw error(400, 'Chapter has no pages to reslice.');

	onProgress?.('read', `Reading ${pageRows.length} chapter image slices...`, 15);
	const imageBuffers: Buffer[] = [];
	for (const p of pageRows) {
		signal?.throwIfAborted();
		const absPath = join(dataRoot, p.filePath);
		imageBuffers.push(readFileSync(absPath));
	}

	onProgress?.('reslice', 'Stitching continuous canvas & finding optimal non-text gutters...', 45);
	signal?.throwIfAborted();
	const slicedBuffers = await pipeline.reslice(imageBuffers, signal);
	if (slicedBuffers.length === 0) throw new Error('Reslice produced zero pages.');

	onProgress?.('save', `Writing ${slicedBuffers.length} clean pages and rebuilding database...`, 85);

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
	});

	for (const oldPath of oldFilePaths) {
		try {
			unlinkSync(oldPath);
		} catch {
			// ignore missing files
		}
	}

	return { originalCount: pageRows.length, newCount: slicedBuffers.length };
}
