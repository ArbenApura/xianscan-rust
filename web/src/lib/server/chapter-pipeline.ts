// CHAPTER PIPELINE RUNNER — ORCHESTRATES ONE CHAPTER'S PAGES THROUGH THE FULL PIPELINE:
//
//   analyze (sidecar detect+OCR) → persist regions → translate (DeepSeek + glossary + cache)
//   → clean (sidecar inpaint) → typeset (TS/Skia) → persist outputs
//
// STAGED PARALLEL EXECUTION (THE SIDECAR CPU WORK AND THE LLM ARE THE TWO LONG POLES):
//   - OCR is streamed: each page's analyze (detect+OCR, sidecar threadpool) runs CONCURRENTLY, and a page
//     proceeds to translate the MOMENT its analyze finishes — no waiting for later pages' OCR.
//   - The LLM translate step is SERIALIZED PER BOOK (a promise chain) so terms discovered on page N are
//     appended to a running, append-only glossary BEFORE page N+1 translates — deterministic terminology
//     with no cross-page races — while DIFFERENT books still translate in parallel.
//   - clean + typeset stay OFF the serial chain (they touch neither the glossary nor the LLM), so they
//     overlap with the next page's translate.
//   - The glossary is monotonic (append-only, never re-sorted) so Gemini/OpenAI prefix caching keeps the
//     system+glossary prefix cached across consecutive pages.
//   EVENTS — emitted in page order via a completion watermark (pages finish out of order).
//
// CONTRACT:
//   - PER-PAGE ERROR ISOLATION: ONE BAD PAGE MARKS ITSELF 'error' AND THE JOB CONTINUES.
//   - THE WORK FUNCTION FITS startChapterJob() (translation-service) — signal + emit.
//   - ALL FILE PATHS ARE RELATIVE TO dataRoot (web/data/); THE API LAYER PASSES IT.
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type OpenAI from 'openai';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
import PQueue from './queue';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
// IMPORTED TYPES
import type { TranslationUsage, PipelineStep, LangPair, TermDraft } from '$lib/types';
// IMPORTED MODULES
import { addNewTerms } from './glossary';
import { matchTerms } from './glossary-match';
import type { JobEvent } from './translation-service';
import type { AnalyzeResult, PipelineClient, PipelineRegion } from './pipeline-client';
import { db } from './db';
import { chapters, pages, regions, translations, books, type Page } from './db/schema';
import { translatePage, classifyRegionForTranslation } from './translate';
import { ChapterDialogueTracker, parseKindFromBox, type PageDialogueRecord } from './translate/dialogue-tracker';
import { typesetPage, type TypesetOptions } from './typeset';
import { detectSourceLanguage } from '$lib/languages';
import { detectImageFormat, isAnimatedWebP } from './chapters/dimensions';
import { prunePageThumbs } from './chapters/mutations';
import { syncBus } from './sync-bus';

// -- ACTIVE POOL REGISTRY FOR DYNAMIC CONCURRENCY HOT-RESIZING -- //
const activeChapterPools = new Map<number, PQueue>();

export function setChapterPageConcurrency(chapterId: number, concurrency: number): void {
	const pool = activeChapterPools.get(chapterId);
	if (pool) {
		pool.concurrency = Math.max(1, concurrency || 1);
	}
}

export function setAllActiveChapterPageConcurrencies(concurrency: number): void {
	const clamped = Math.max(1, concurrency || 1);
	for (const pool of activeChapterPools.values()) {
		pool.concurrency = clamped;
	}
}

// -- TYPES -- //

export interface ChapterPipelineDeps {
	pipeline: PipelineClient;
	/** INJECTABLE LLM — TESTS PASS A FAKE; PRODUCTION USES THE DEEPSEEK SINGLETON. */
	llm?: OpenAI;
	model?: string;
	inpaintMode?: string;
	inpaintExpansionPct?: number;
	typesetExpansionPct?: number;
	enableWatermarkInpaint?: boolean;
	typesetOptions?: TypesetOptions;
	/**
	 * OPACQUE PROVIDER DISCRIMINATOR FOR THE TRANSLATION CACHE — THE API LAYER SETS IT FROM
	 * DEEPSEEK_BASE_URL SO SWITCHING PROVIDERS (e.g. MOCK ↔ REAL) NEVER SERVES STALE CACHED TEXT.
	 */
	cacheSalt?: string;
	/** ABSOLUTE PATH TO THE APP DATA ROOT (web/data/) — ALL RELATIVE PATHS RESOLVE AGAINST IT. */
	dataRoot: string;
	onUsage?: (usage: TranslationUsage) => void;
	/** MAX CONCURRENT PAGES PER PHASE (TESTS PIN 1 FOR DETERMINISM). */
	pageConcurrency?: number;
	/** OPTIONAL CANCELLATION CHECK FOR INDIVIDUAL PAGES */
	isPageCancelled?: (pageId: number) => boolean;
	/** WHETHER TO FORCE RE-TRANSLATION OF ALL PAGES */
	force?: boolean;
}

export type PipelineEmit = (e: JobEvent) => void;

// -- CONSTANTS -- //

// HOW MANY PAGES THE CHAPTER PIPELINE PROCESSES CONCURRENTLY. THE SIDECAR SERVES EACH REQUEST ON A
// THREADPOOL THREAD (CPU-HEAVY DETECT+OCR), SO 3-4 OVERLAPPING PAGES SATURATE A TYPICAL QUAD-CORE
// WITHOUT THRASHING. TUNE VIA PIPELINE_PAGE_CONCURRENCY (e.g. 6 ON AN 8-CORE BOX).
const PAGE_CONCURRENCY = Math.max(1, Number(env.PIPELINE_PAGE_CONCURRENCY ?? '3') || 3);

const DIALOGUE_PUNCT_MAP: Record<string, string> = {
	'……': '...',
	'……！': '...!',
	'……!': '...!',
	'……？': '...?',
	'……?': '...?',
	'……！？': '...?!',
	'……!?': '...?!',
	'……？！': '...?!',
	'……?!': '...?!',
	'！': '!',
	'!': '!',
	'？': '?',
	'?': '?',
	'？！': '?!',
	'?!': '?!',
	'！？': '!?',
	'!?': '!?',
	'...': '...',
	'...!': '...!',
	'...?': '...?',
};

export function resolveDialoguePunctuation(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (DIALOGUE_PUNCT_MAP[trimmed]) return DIALOGUE_PUNCT_MAP[trimmed];
	if (/^[.．…]+[！!]$/.test(trimmed)) return '...!';
	if (/^[.．…]+[？?]$/.test(trimmed)) return '...?';
	if (/^[.．…]+$/.test(trimmed)) return '...';
	if (/^[！!]+$/.test(trimmed)) return '!'.repeat(Math.min(3, trimmed.length));
	if (/^[？?]+$/.test(trimmed)) return '?'.repeat(Math.min(3, trimmed.length));
	return null;
}

// -- INTERNALS -- //

function regionRow(region: PipelineRegion, seq: number) {
	const boxObj = {
		...region.box,
		inpaint_box: region.inpaint_box ?? null,
		typeset_box: region.typeset_box ?? null,
		bubble_box: region.bubble_box ?? null,
		bubble_polygon: region.bubble_polygon ?? null,
		centroid: region.centroid ?? null,
		kind: region.kind ?? 'dialogue_bubble',
		angle: region.angle,
		vertical: region.vertical,
	};
	return {
		seq,
		box: JSON.stringify(boxObj),
		inpaintBox: region.inpaint_box ? JSON.stringify(region.inpaint_box) : null,
		typesetBox: region.typeset_box ? JSON.stringify(region.typeset_box) : null,
		polygon: JSON.stringify(region.polygon),
		textSource: region.text,
		conf: region.confidence,
		status: 'pending' as const,
	};
}

function cleanDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

// PER-PAGE SLOT — CARRIES THE PAGE THROUGH THE STAGES; `outcome` DOUBLES AS THE ORDERED-EVENT
type PageSlot = {
	page: Page;
	analyzed?: AnalyzeResult;
	image?: Buffer;
	outcome?: 'analyzed' | 'done' | 'error' | 'skipped';
	failedStep?: PipelineStep;
	message?: string;
	totalDurationMs?: number;
	startedAt?: number;
};

// GLOBAL WEBP POLICY: THE SIDECAR MUST RECEIVE WEBP. ONLY A STATIC WEBP PASSES
// THROUGH UNCHANGED; ANY OTHER FORMAT (PNG, JPEG, AVIF, HEIC, GIF, ANIMATED
// WEBP...) IS CONVERTED TO WEBP HERE, NOT STORED/RELAYED RAW.
async function ensureWebPBuffer(rawBuf: Buffer): Promise<Buffer> {
	// ONLY A STATIC WEBP IS SAFE TO PASS THROUGH — PNG/JPEG AND EVERYTHING ELSE
	// MUST BE CONVERTED BELOW (ANIMATED WEBP SHARES THE WEBP MAGIC BUT IS NOT
	// DECODABLE BY THE SIDECAR, SO IT IS FLATTENED TOO).
	const fmt = detectImageFormat(rawBuf);
	if (fmt === 'webp' && !isAnimatedWebP(rawBuf)) return rawBuf;
	try {
		const { Transformer } = await import('@napi-rs/image');
		const webp = await new Transformer(rawBuf).webp(90);
		if (detectImageFormat(webp) === 'webp') return webp;
	} catch {
		// FALL THROUGH TO THE CANVAS CONVERTER BELOW
	}
	try {
		const { loadImage, createCanvas } = await import('@napi-rs/canvas');
		const img = await loadImage(rawBuf);
		const canvas = createCanvas(img.width, img.height);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		const webp = await canvas.encode('webp', 90);
		if (detectImageFormat(webp) === 'webp') return webp;
	} catch {
		// FALL THROUGH TO THE CLEAR ERROR BELOW
	}
	throw new Error('Image format not supported by the ML engine — re-upload this page as PNG, JPEG, or WebP.');
}

// -- THE WORK FUNCTION (FITS startChapterJob) -- //

export async function runChapterPipeline(
	chapterId: number,
	deps: ChapterPipelineDeps,
	signal: AbortSignal,
	emit: PipelineEmit,
	pageIds?: number[],
	registerAddPage?: (fn: (pageId: number) => void) => void,
): Promise<void> {
	const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
	if (!chapter) throw new Error(`chapter ${chapterId} not found`);

	// CRASH-RESUME: A BACKEND RESTART CAN LEAVE PAGES STUCK IN 'processing' — RESET THEM SO A RE-RUN
	// CAN PICK THEM UP (ONLY 'done' PAGES COUNT AS FINISHED).
	db.update(pages)
		.set({ status: 'pending', error: null })
		.where(and(eq(pages.chapterId, chapterId), eq(pages.status, 'processing')))
		.run();

	// UPDATE CHAPTER STATUS TO PROCESSING
	db.update(chapters).set({ status: 'processing' }).where(eq(chapters.id, chapterId)).run();

	const targetIdSet = pageIds && pageIds.length > 0 ? new Set(pageIds) : null;

	// IF SPECIFIC TARGET PAGES ARE GIVEN OR FORCE MODE IS ACTIVE,
	// CLEAN UP DISK ARTIFACTS AND DATABASE REGIONS / TRANSLATIONS BEFORE PROCESSING
	const initialPageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(asc(pages.seq))
		.all();

	for (const page of initialPageRows) {
		const isExplicitTarget = targetIdSet ? targetIdSet.has(page.id) : Boolean(deps.force);
		if (isExplicitTarget) {
			if (page.cleanedPath) {
				try {
					unlinkSync(join(deps.dataRoot, page.cleanedPath));
				} catch {
					// IGNORE IF FILE MISSING
				}
			}
			if (page.outputPath) {
				try {
					unlinkSync(join(deps.dataRoot, page.outputPath));
				} catch {
					// IGNORE IF FILE MISSING
				}
			}
			prunePageThumbs(page.id, deps.dataRoot);
			db.delete(translations).where(eq(translations.pageId, page.id)).run();
			db.delete(regions).where(eq(regions.pageId, page.id)).run();
			db.update(pages)
				.set({
					status: 'pending',
					cleanedPath: null,
					outputPath: null,
					error: null,
					onomatopoeia: null,
					ocrStats: null,
					llmPrompt: null,
					llmResponse: null,
				})
				.where(eq(pages.id, page.id))
				.run();
		}
	}

	const pageRows = db
		.select()
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.orderBy(asc(pages.seq))
		.all();

	if (pageRows.length === 0) {
		emit({ type: 'done', chapterId });
		return;
	}

	emit({
		type: 'start',
		chapterId,
		totalPages: pageIds && pageIds.length > 0 ? pageIds.length : pageRows.length,
		targetPageIds: pageIds && pageIds.length > 0 ? pageIds : undefined,
		pages: pageRows.map((p) => ({
			id: p.id,
			seq: p.seq,
			status: p.status,
			cleanedRev: p.cleanedRev,
			outputRev: p.outputRev,
		})),
	});

	const pool = new PQueue({ concurrency: deps.pageConcurrency ?? PAGE_CONCURRENCY });
	const book = db.select().from(books).where(eq(books.id, chapter.bookId)).get();
	const initialSource =
		book?.sourceLang === 'auto'
			? detectSourceLanguage(book?.title || '', 'zh-Hans')
			: book?.sourceLang || 'zh-Hans';
	const pair: LangPair = { sourceLang: initialSource, targetLang: book?.targetLang || 'en' };
	const model = deps.model;

	// DIALOGUE TRACKER: TRACKS OCR & TRANSLATED LINES ACROSS PAGES FOR SLIDING-WINDOW CONTEXT INJECTION
	const dialogueTracker = new ChapterDialogueTracker();
	const existingPageIds = pageRows.map((p) => p.id);
	if (existingPageIds.length > 0) {
		const existingRegions = db
			.select({
				pageId: regions.pageId,
				seq: regions.seq,
				box: regions.box,
				textSource: regions.textSource,
				textTarget: regions.textTarget,
			})
			.from(regions)
			.where(inArray(regions.pageId, existingPageIds))
			.orderBy(asc(regions.seq))
			.all();

		const regionsByPageId = new Map<number, typeof existingRegions>();
		for (const r of existingRegions) {
			const arr = regionsByPageId.get(r.pageId) ?? [];
			arr.push(r);
			regionsByPageId.set(r.pageId, arr);
		}

		const seedRecords: PageDialogueRecord[] = [];
		for (const p of pageRows) {
			const rList = regionsByPageId.get(p.id) ?? [];
			if (rList.length === 0) continue;
			const lines = rList
				.filter((r) => r.textSource && r.textSource.trim().length > 0)
				.map((r, idx) => ({
					id: `r${idx}`,
					sourceText: r.textSource.trim(),
					translatedText: r.textTarget ? r.textTarget.trim() : undefined,
					kind: parseKindFromBox(r.box),
				}));
			if (lines.length > 0) {
				seedRecords.push({
					pageSeq: p.seq,
					pageId: p.id,
					lines,
					isTranslated: lines.some((l) => Boolean(l.translatedText)),
				});
			}
		}
		dialogueTracker.seedFromDb(seedRecords);
	}

	// SEED TRAILING PAGES FROM PRECEDING CHAPTER (IF ONE EXISTS FOR THIS BOOK)
	const prevChap = db
		.select({ id: chapters.id, seq: chapters.seq, title: chapters.title })
		.from(chapters)
		.where(and(eq(chapters.bookId, chapter.bookId), lt(chapters.seq, chapter.seq)))
		.orderBy(desc(chapters.seq))
		.limit(1)
		.get();

	if (prevChap) {
		const prevPages = db
			.select({ id: pages.id, seq: pages.seq })
			.from(pages)
			.where(eq(pages.chapterId, prevChap.id))
			.orderBy(desc(pages.seq))
			.limit(8)
			.all();

		const prevPageIds = prevPages.map((p) => p.id);
		if (prevPageIds.length > 0) {
			const prevRegions = db
				.select({
					pageId: regions.pageId,
					seq: regions.seq,
					box: regions.box,
					textSource: regions.textSource,
					textTarget: regions.textTarget,
				})
				.from(regions)
				.where(inArray(regions.pageId, prevPageIds))
				.orderBy(asc(regions.seq))
				.all();

			const prevRegionsByPageId = new Map<number, typeof prevRegions>();
			for (const r of prevRegions) {
				const arr = prevRegionsByPageId.get(r.pageId) ?? [];
				arr.push(r);
				prevRegionsByPageId.set(r.pageId, arr);
			}

			const priorRecords: PageDialogueRecord[] = [];
			for (const p of prevPages.reverse()) {
				const rList = prevRegionsByPageId.get(p.id) ?? [];
				if (rList.length === 0) continue;
				const lines = rList
					.filter((r) => r.textSource && r.textSource.trim().length > 0)
					.map((r, idx) => ({
						id: `r${idx}`,
						sourceText: r.textSource.trim(),
						translatedText: r.textTarget ? r.textTarget.trim() : undefined,
						kind: parseKindFromBox(r.box),
					}));
				if (lines.length > 0) {
					priorRecords.push({
						pageSeq: p.seq,
						pageId: p.id,
						chapterTitle: prevChap.title,
						isPriorChapter: true,
						lines,
						isTranslated: lines.some((l) => Boolean(l.translatedText)),
					});
				}
			}
			dialogueTracker.seedPriorChapter(priorRecords);
		}
	}

	// PER-BOOK SERIAL QUEUE: ONE LLM TRANSLATE AT A TIME WITHIN THIS BOOK, SO A TERM DISCOVERED ON PAGE N
	// IS APPENDED TO `chapterTerms` BEFORE PAGE N+1 SNAPSHOTS IT. DIFFERENT BOOKS STILL OVERLAP (THIS IS A
	// PER-BOOK CHAIN, NOT A GLOBAL LOCK).
	let translateChain: Promise<void> = Promise.resolve();
	const chainTranslate = <T>(task: () => Promise<T>): Promise<T> => {
		const run = translateChain.then(task);
		translateChain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	// -- EMISSION WATERMARK STATE -- //
	const slots: PageSlot[] = pageRows.map((page) => {
		if (targetIdSet) {
			// TARGETED SUBSET OF PAGES: ONLY TARGETED PAGES GET PROCESSED
			return {
				page,
				outcome: targetIdSet.has(page.id)
					? undefined
					: page.status === 'done'
						? 'done'
						: 'skipped',
			};
		}

		// WHOLE CHAPTER: SKIP ALREADY DONE PAGES UNLESS FORCE IS EXPLICITLY SET
		return {
			page,
			outcome: !deps.force && page.status === 'done' ? 'done' : undefined,
		};
	});

	// EMIT UP FRONT FOR ALREADY-DONE (SKIPPED) PAGES ONLY IF TRANSLATING FULL CHAPTER
	if (!targetIdSet) {
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (slot.outcome === 'done') {
				emit({
					type: 'page-done',
					chapterId,
					page: i,
					pageId: slot.page.id,
					pageCount: slots.length,
					outputPath: slot.page.outputPath,
					cleanedRev: slot.page.cleanedRev,
					outputRev: slot.page.outputRev,
				});
			}
		}
	}

	// -- DYNAMIC PAGE INJECTION: ALLOW NEW PAGE IDS TO BE ADDED TO THE RUNNING POOL -- //
	// Called by job.addPageToPool() when a concurrent "Translate Page" POST arrives.
	if (registerAddPage) {
		registerAddPage((injectPageId: number) => {
			if (signal.aborted) return;
			const injectRow = db.select().from(pages).where(eq(pages.id, injectPageId)).get();
			if (!injectRow) return;

			// PRUNE DISK ARTIFACTS AND DB PROGRESS FOR INJECTED RE-TRANSLATION
			if (injectRow.cleanedPath) {
				try {
					unlinkSync(join(deps.dataRoot, injectRow.cleanedPath));
				} catch {
					// IGNORE IF FILE MISSING
				}
			}
			if (injectRow.outputPath) {
				try {
					unlinkSync(join(deps.dataRoot, injectRow.outputPath));
				} catch {
					// IGNORE IF FILE MISSING
				}
			}
			prunePageThumbs(injectRow.id, deps.dataRoot);
			db.delete(translations).where(eq(translations.pageId, injectRow.id)).run();
			db.delete(regions).where(eq(regions.pageId, injectRow.id)).run();
			db.update(pages)
				.set({
					status: 'pending',
					cleanedPath: null,
					outputPath: null,
					error: null,
					onomatopoeia: null,
					ocrStats: null,
					llmPrompt: null,
					llmResponse: null,
				})
				.where(eq(pages.id, injectRow.id))
				.run();
			injectRow.status = 'pending';
			injectRow.cleanedPath = null;
			injectRow.outputPath = null;
			injectRow.error = null;

			// CLEAR STALE DIALOGUE TRACKER RECORD FOR INJECTED RE-TRANSLATION
			dialogueTracker.clearPage(injectRow.seq);

			// If this page is already in the slots array (re-translate of a done/error page within the
			// same running job), reuse its slot index so events route to the right snapshot entry.
			// Otherwise push a new slot (genuinely new parallel injection).
			const existingSlotIdx = slots.findIndex((s) => s.page.id === injectRow.id);
			const injectIdx = existingSlotIdx >= 0 ? existingSlotIdx : slots.length;
			if (existingSlotIdx < 0) {
				slots.push({ page: injectRow });
			} else {
				// Reset the existing slot so it can be processed again
				slots[existingSlotIdx] = { page: injectRow };
			}
			// ANNOUNCE THE NEW PAGE TO BOTH SERVER AND CLIENT SNAPSHOTS BEFORE ANY STEP EVENTS
			emit({ type: 'page-added', chapterId, page: injectIdx, pageId: injectRow.id, seq: injectRow.seq });
			// THIS ADD IS FIRE-AND-FORGET (NO allSettled CONSUMER). WITHOUT A CATCH, THE ABORT
			// LISTENER'S pool.clear() REJECTS THIS UNOBSERVED PROMISE -> UNHANDLED AbortError.
			void pool
				.add(async () => {
					await analyzePageWithRetry(injectRow, injectIdx);
				})
				.catch((err: unknown) => {
					// AN ABORT REJECTION IS EXPECTED (pool.clear() ON JOB ABORT) — SWALLOW IT.
					// LOG GENUINE NON-ABORT FAILURES SO A DETACHED PAGE DOES NOT FAIL SILENTLY.
					if (!(err instanceof Error) || err.name !== 'AbortError') {
						console.warn(
							`[chapterPipeline] Injected page #${injectRow.id} failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
				});
		});
	}

	// -- PIPELINED EXECUTION: PROCESS PAGES CONCURRENTLY AS A STREAM -- //
	emit({ type: 'phase-change', chapterId, phase: 'phase1_analyze' });

	const analyzePage = async (page: Page, i: number): Promise<void> => {
		const slot = slots[i];
		if (slot.outcome !== undefined || deps.isPageCancelled?.(page.id)) return;
		let activeStep: PipelineStep = 'analyze';
		slot.startedAt = performance.now();

		try {
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			db.update(pages).set({ status: 'processing', error: null }).where(eq(pages.id, page.id)).run();

			// 1) ANALYZE — DETECT + OCR VIA THE SIDECAR
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'analyze' });
			const tAnalyze0 = performance.now();
			const rawImage = readFileSync(join(deps.dataRoot, page.filePath));
			const image = await ensureWebPBuffer(rawImage);
			const analyzed = await deps.pipeline.analyze(image, signal, {
				sourceLang: pair.sourceLang,
				targetLang: pair.targetLang,
				inpaintPaddingPct: deps.inpaintExpansionPct,
				typesetPaddingPct: deps.typesetExpansionPct,
				enableWatermarkInpaint: deps.enableWatermarkInpaint,
			});
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;
			const tAnalyze = performance.now() - tAnalyze0;

			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: 'analyze',
				stepStatus: 'completed',
				durationMs: tAnalyze,
				stepDetails: { regionsCount: analyzed.regions.length },
			});

			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			// 2) PERSIST REGIONS
			activeStep = 'persist_regions';
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'persist_regions' });
			const enrichedStats = analyzed.stats
				? {
						...analyzed.stats,
						wall_time_ms: Math.round(tAnalyze),
						queue_wait_ms:
							analyzed.stats.queue_wait_ms ??
							Math.max(0, Math.round(tAnalyze - (analyzed.stats.total_time_ms || 0))),
					}
				: null;
			db.transaction((tx) => {
				tx.update(pages)
					.set({
						onomatopoeia: null,
						ocrStats: enrichedStats ? JSON.stringify(enrichedStats) : null,
					})
					.where(eq(pages.id, page.id))
					.run();
				tx.delete(regions).where(eq(regions.pageId, page.id)).run();
				if (analyzed.regions.length > 0) {
					tx.insert(regions)
						.values(analyzed.regions.map((r, idx) => ({ ...regionRow(r, idx), pageId: page.id })))
						.run();
				}
			});
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: 'persist_regions',
				stepStatus: 'completed',
			});
			dialogueTracker.recordOcr(page.seq, page.id, analyzed.regions);

			slot.analyzed = analyzed;
			slot.image = image;
			slot.outcome = 'analyzed';

			// STREAM: PROCEED TO TRANSLATE THIS PAGE THE MOMENT ITS ANALYZE FINISHES (NO WAITING FOR OTHER
			// PAGES' OCR). THE LLM CALL ITSELF IS SERIALIZED PER BOOK INSIDE translatePagePipeline.
			await translatePagePipeline(page, i);
		} catch (e) {
			if (signal.aborted) {
				const abortErr = new Error('The operation was aborted');
				abortErr.name = 'AbortError';
				throw abortErr;
			}
			if (deps.isPageCancelled?.(page.id)) return;
			const message = e instanceof Error ? e.message : String(e);
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: activeStep,
				stepStatus: 'failed',
				stepDetails: { error: message },
			});
			db.update(pages).set({ status: 'error', error: message }).where(eq(pages.id, page.id)).run();
			slot.outcome = 'error';
			slot.failedStep = activeStep;
			slot.message = message;
			emit({
				type: 'error',
				chapterId,
				page: i,
				pageId: page.id,
				failedStep: activeStep,
				message,
			});
		}
	};

	const translatePagePipeline = async (page: Page, i: number): Promise<void> => {
		const slot = slots[i];
		const analyzed = slot.analyzed;
		if (!analyzed || slot.outcome !== 'analyzed' || deps.isPageCancelled?.(page.id)) return;
		const image = slot.image!;
		let activeStep: PipelineStep = 'match_glossary';
		const pageT0 = slot.startedAt ?? performance.now();

		try {
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			// 3) PARALLEL TRANSLATE & CLEAN: EXECUTE INPAINTING AND LLM TRANSLATION SIMULTANEOUSLY
			const pageAbortController = new AbortController();
			const onParentAbort = () => pageAbortController.abort();
			signal.addEventListener('abort', onParentAbort, { once: true });

			const isRegionInpaintable = (r: PipelineRegion) => {
				if (!r.text.trim()) return false;
				const classification = classifyRegionForTranslation(
					{ id: r.id, text: r.text, kind: r.kind },
					pair.sourceLang,
					pair.targetLang,
				);
				return classification.disposition !== 'skip_empty';
			};

			const cleanRegions = analyzed.regions
				.filter(isRegionInpaintable)
				.map((r) => ({ id: r.id, box: r.inpaint_box ?? r.box, polygon: r.polygon }));

			// TASK A: INPAINT (LOCAL ONNX COMPUTE)
			const inpaintTask = (async () => {
				emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'clean' });
				const tClean0 = performance.now();
				const cleaned =
					cleanRegions.length > 0
						? await deps.pipeline.clean(image, cleanRegions, deps.inpaintMode ?? 'patch', pageAbortController.signal)
						: image;
				pageAbortController.signal.throwIfAborted();
				if (deps.isPageCancelled?.(page.id)) return { cleaned: image, cleanPath: '' };
				const cleanPath = `clean/${chapterId}/${page.seq}.webp`;
				const cleanAbs = join(deps.dataRoot, cleanPath);
				cleanDir(join(deps.dataRoot, 'clean', String(chapterId)));
				writeFileSync(cleanAbs, cleaned);
				const tClean = performance.now() - tClean0;
				emit({
					type: 'page-step-end',
					chapterId,
					page: i,
					pageId: page.id,
					step: 'clean',
					stepStatus: 'completed',
					durationMs: tClean,
				});
				return { cleaned, cleanPath };
			})();

			// TASK B: TRANSLATE (GLOSSARY MATCH + LLM NETWORK I/O)
			const sources = analyzed.regions
				.filter((r) => r.text.trim().length > 0)
				.map((r) => ({ id: r.id, text: r.text, kind: r.kind, vertical: r.vertical }));

			const translateTask = (async () => {
				const byRegion = new Map<string, string>();

				if (sources.length > 0) {
					emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'match_glossary' });
					const pageSourceText = sources.map((s) => s.text).join('\n');
					const pageMatchedTerms = await matchTerms(chapter.bookId, pageSourceText);
					emit({
						type: 'page-step-end',
						chapterId,
						page: i,
						pageId: page.id,
						step: 'match_glossary',
						stepStatus: 'completed',
						stepDetails: { matchedCount: pageMatchedTerms.length },
					});

					pageAbortController.signal.throwIfAborted();
					if (deps.isPageCancelled?.(page.id)) return byRegion;

					emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'translate' });
					const tTrans0 = performance.now();

					const translated = await chainTranslate(async () => {
						const dialogueContext = dialogueTracker.getContextWindow(page.seq);
						const result = await translatePage(sources, pageMatchedTerms, pair, {
							client: deps.llm,
							model,
							signal: pageAbortController.signal,
							dialogueContext,
						});
						return result;
					});
					pageAbortController.signal.throwIfAborted();
					if (deps.isPageCancelled?.(page.id)) return byRegion;
					dialogueTracker.recordTranslation(page.seq, translated.byRegion);
					for (const [id, text] of translated.byRegion) byRegion.set(id, text);
					if (translated.newTerms && translated.newTerms.length > 0) {
						await addNewTerms(chapter.bookId, translated.newTerms, chapterId);
					}
					const tTrans = performance.now() - tTrans0;
					const llmResponseData = {
						raw: translated.rawResponse ?? '',
						model: translated.usage.model,
						durationMs: translated.durationMs ?? Math.round(tTrans),
						promptTokens: translated.usage.promptTokens ?? 0,
						cachedTokens: translated.usage.cachedTokens ?? 0,
						completionTokens: translated.usage.completionTokens ?? 0,
						timestamp: Date.now(),
					};
					db.update(pages)
						.set({
							llmPrompt: translated.rawPrompt ?? null,
							llmResponse: JSON.stringify(llmResponseData),
						})
						.where(eq(pages.id, page.id))
						.run();
					emit({
						type: 'page-step-end',
						chapterId,
						page: i,
						pageId: page.id,
						step: 'translate',
						stepStatus: 'completed',
						durationMs: tTrans,
						stepDetails: {
							cacheHit: false,
							model: translated.usage.model,
							tokens: (translated.usage.promptTokens ?? 0) + (translated.usage.completionTokens ?? 0),
						},
					});
					if (translated.usage && deps.onUsage) deps.onUsage(translated.usage);
				} else {
					emit({
						type: 'page-step-end',
						chapterId,
						page: i,
						pageId: page.id,
						step: 'translate',
						stepStatus: 'completed',
						durationMs: 0,
						stepDetails: { skipped: true, textCount: 0 },
					});
				}
				return byRegion;
			})();

			// ABORT SIBLING SUB-TASK IMMEDIATELY UPON FIRST FAILURE TO PREVENT GPU / WORKER CONCURRENCY LEAKS
			translateTask.catch(() => pageAbortController.abort());
			inpaintTask.catch(() => pageAbortController.abort());

			let inpaintResult: { cleaned: Buffer; cleanPath: string };
			let byRegion: Map<string, string>;

			try {
				const [inpaintRes, transRes] = await Promise.all([inpaintTask, translateTask]);
				inpaintResult = inpaintRes;
				byRegion = transRes;
			} catch (subErr) {
				pageAbortController.abort();
				// GUARANTEE INPAINTING HAS FULLY SETTLED BEFORE RETURNING AND RELEASING THE WORKER CONCURRENCY SLOT
				await Promise.allSettled([inpaintTask, translateTask]);
				throw subErr;
			} finally {
				signal.removeEventListener('abort', onParentAbort);
			}

			const { cleaned, cleanPath } = inpaintResult;

			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			// 4) WRITE TRANSLATIONS BACK TO REGION ROWS
			activeStep = 'persist_translations';
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'persist_translations' });
			const seqById = new Map(analyzed.regions.map((r, idx) => [r.id, idx]));
			db.transaction((tx) => {
				for (const region of analyzed.regions) {
					let target = byRegion.get(region.id)?.trim() ?? '';
					if (!target) {
						const punct = resolveDialoguePunctuation(region.text);
						if (punct) {
							target = punct;
							byRegion.set(region.id, target);
						}
					}
					const status = target ? 'translated' : 'failed';
					tx.update(regions)
						.set({
							textTarget: target || null,
							originalTarget: target || null,
							status,
						})
						.where(and(eq(regions.pageId, page.id), eq(regions.seq, seqById.get(region.id) ?? -1)))
						.run();
				}
			});
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: 'persist_translations',
				stepStatus: 'completed',
			});

			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			// 6) TYPESET — RENDER TRANSLATIONS ONTO CANVAS
			activeStep = 'typeset';
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'typeset' });
			const tType0 = performance.now();
			const typesetRegions = analyzed.regions
				.filter((r) => Boolean(byRegion.get(r.id)?.trim()))
				.map((r) => ({
					id: r.id,
					box: r.typeset_box ?? r.box,
					text: byRegion.get(r.id)!,
					vertical: r.vertical,
					angle: r.angle,
				}));
			const out = await typesetPage(cleaned, typesetRegions, deps.typesetOptions);
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;
			const outputPath = `output/${chapterId}/${page.seq}.webp`;
			cleanDir(join(deps.dataRoot, 'output', String(chapterId)));
			writeFileSync(join(deps.dataRoot, outputPath), out);
			const tType = performance.now() - tType0;
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: 'typeset',
				stepStatus: 'completed',
				durationMs: tType,
			});

			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			// 7) MARK DONE
			activeStep = 'save_output';
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'save_output' });
			db.update(pages)
				.set({
					status: 'done',
					cleanedPath: cleanPath,
					outputPath,
					cleanedRev: sql`${pages.cleanedRev} + 1`,
					outputRev: sql`${pages.outputRev} + 1`,
					width: analyzed.width,
					height: analyzed.height,
				})
				.where(eq(pages.id, page.id))
				.run();
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: 'save_output',
				stepStatus: 'completed',
			});

			// RE-READ THE STORED REVS AFTER THE ATOMIC sql +1 BUMP SO THE EMITTED
			// VALUES MATCH THE DATABASE EVEN IF A CONCURRENT JOB BUMPED THEM FIRST.
			const freshRow = db
				.select({ cleanedRev: pages.cleanedRev, outputRev: pages.outputRev })
				.from(pages)
				.where(eq(pages.id, page.id))
				.get();
			slot.page.outputPath = outputPath;
			slot.totalDurationMs = performance.now() - pageT0;
			slot.outcome = 'done';
			const finalCleanedRev = freshRow?.cleanedRev ?? page.cleanedRev + 1;
			const finalOutputRev = freshRow?.outputRev ?? page.outputRev + 1;
			emit({
				type: 'page-done',
				chapterId,
				page: i,
				pageId: page.id,
				pageCount: slots.length,
				outputPath,
				cleanedRev: finalCleanedRev,
				outputRev: finalOutputRev,
				durationMs: slot.totalDurationMs,
			});
			syncBus.broadcast({
				type: 'page-translated',
				chapterId,
				pageId: page.id,
				pageSeq: i,
				outputRev: finalOutputRev,
			});
		} catch (e) {
			if (signal.aborted) {
				const abortErr = new Error('The operation was aborted');
				abortErr.name = 'AbortError';
				throw abortErr;
			}
			if (deps.isPageCancelled?.(page.id)) return;
			const message = e instanceof Error ? e.message : String(e);
			emit({
				type: 'page-step-end',
				chapterId,
				page: i,
				pageId: page.id,
				step: activeStep,
				stepStatus: 'failed',
				stepDetails: { error: message },
			});
			db.update(pages).set({ status: 'error', error: message }).where(eq(pages.id, page.id)).run();
			slot.outcome = 'error';
			slot.failedStep = activeStep;
			slot.message = message;
			emit({
				type: 'error',
				chapterId,
				page: i,
				pageId: page.id,
				failedStep: activeStep,
				message,
			});
		}
	};

	const analyzePageWithRetry = async (page: Page, i: number, attempt = 0): Promise<void> => {
		try {
			await analyzePage(page, i);
		} catch (e: any) {
			if (signal.aborted || deps.isPageCancelled?.(page.id)) {
				if (signal.aborted) {
					const abortErr = new Error('The operation was aborted');
					abortErr.name = 'AbortError';
					throw abortErr;
				}
				return;
			}
			if (attempt < 3) {
				const nextAttempt = attempt + 1;
				const delay = Math.round(1000 * Math.pow(1.5, attempt));
				console.warn(
					`[chapterPipeline] Page #${page.id} (seq ${i}) failed on step ${slots[i]?.failedStep || 'pipeline'}: ${e?.message || e}. Scheduling retry ${nextAttempt}/3 in ${delay}ms...`,
				);
				await new Promise((r) => setTimeout(r, delay));
				if (signal.aborted || deps.isPageCancelled?.(page.id)) {
					if (signal.aborted) {
						const abortErr = new Error('The operation was aborted');
						abortErr.name = 'AbortError';
						throw abortErr;
					}
					return;
				}
				return analyzePageWithRetry(page, i, nextAttempt);
			}
		}
	};

	// ATTACH IMMEDIATE ABORT LISTENER TO FLUSH IN-FLIGHT POOL
	const onAbort = () => {
		pool.clear();
	};
	signal.addEventListener('abort', onAbort, { once: true });
	activeChapterPools.set(chapterId, pool);

	// -- STREAMING EXECUTION: ANALYZE EACH PAGE CONCURRENTLY; EACH PAGE TRANSLATES THE MOMENT ITS OWN --
	// -- OCR FINISHES. THE LLM STEP IS SERIALIZED PER BOOK (chainTranslate); CLEAN + TYPESET OVERLAP.  --
	try {
		await pool.addAll(pageRows.map((page, i) => () => analyzePageWithRetry(page, i)));
	} catch (err: any) {
		if (signal.aborted || err?.name === 'AbortError') {
			// ABORT CAUGHT CLEANLY
		} else {
			throw err;
		}
	} finally {
		await pool.onIdle();
		signal.removeEventListener('abort', onAbort);
		activeChapterPools.delete(chapterId);
	}

	if (signal.aborted) {
		const abortErr = new Error('The operation was aborted');
		abortErr.name = 'AbortError';
		throw abortErr;
	}

	// UPDATE CHAPTER FINAL STATUS & TRANSLATED TIMESTAMP
	const finalPages = db
		.select({ status: pages.status, outputPath: pages.outputPath })
		.from(pages)
		.where(eq(pages.chapterId, chapterId))
		.all();
	const allDone = finalPages.length > 0 && finalPages.every((p) => p.status === 'done' || Boolean(p.outputPath));
	const anyError = finalPages.some((p) => p.status === 'error');
	const finalStatus = allDone ? 'done' : anyError ? 'error' : 'pending';

	db.update(chapters)
		.set({
			status: finalStatus,
			translatedAt: allDone ? Date.now() : chapter.translatedAt,
		})
		.where(eq(chapters.id, chapterId))
		.run();

	syncBus.broadcast({
		type: 'chapter-translated',
		chapterId,
		bookId: chapter.bookId,
	});
}

// -- HELPERS FOR THE API LAYER -- //

/** BUILD THE WORK FUNCTION A JOB RUNS — BINDS THE RUNNER TO startChapterJob's SIGNATURE. */
export function chapterWork(
	chapterId: number,
	deps: ChapterPipelineDeps,
	pageIds?: number[],
	registerAddPage?: (fn: (pageId: number) => void) => void,
) {
	return (signal: AbortSignal, emit: PipelineEmit) =>
		runChapterPipeline(chapterId, deps, signal, emit, pageIds, registerAddPage);
}
