// CHAPTER PIPELINE RUNNER — ORCHESTRATES ONE CHAPTER'S PAGES THROUGH THE FULL PIPELINE:
//
//   analyze (sidecar detect+OCR) → persist regions → translate (DeepSeek + glossary + cache)
//   → clean (sidecar inpaint) → typeset (TS/Skia) → persist outputs
//
// STAGED PARALLEL EXECUTION (THE SIDECAR CPU WORK AND THE LLM ARE THE TWO LONG POLES):
//   PHASE 1 — analyze ALL pages concurrently (sidecar threadpool) + persist regions.
//   PHASE 2 — ONE chapter-level LLM call extracts glossary terms (was one call PER PAGE).
//   PHASE 3 — translate + clean + typeset concurrently across pages (LLM calls share the global
//             PQueue; sidecar clean calls parallelize on its threadpool).
//   EVENTS — emitted in page order via a completion watermark (pages finish out of order).
//
// CONTRACT:
//   - PER-PAGE ERROR ISOLATION: ONE BAD PAGE MARKS ITSELF 'error' AND THE JOB CONTINUES.
//   - THE WORK FUNCTION FITS startChapterJob() (translation-service) — signal + emit.
//   - ALL FILE PATHS ARE RELATIVE TO dataRoot (web/data/); THE API LAYER PASSES IT.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type OpenAI from 'openai';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
// IMPORTED DEP-MODULES
import PQueue from 'p-queue';
import { and, asc, eq } from 'drizzle-orm';
// IMPORTED TYPES
import type { TranslationUsage, PipelineStep, PipelinePhase, LangPair } from '$lib/types';
// IMPORTED MODULES
import { addNewTerms, bookPair, getEffectiveGlossary } from './glossary';
import { matchTerms } from './glossary-match';
import type { JobEvent } from './translation-service';
import type { AnalyzeResult, PipelineClient, PipelineRegion } from './pipeline-client';
import { db } from './db';
import { chapters, pages, regions, books, type Page } from './db/schema';
import { extractTerms, translatePage } from './translate';
import { typesetPage, type TypesetOptions } from './typeset';
import { detectSourceLanguage } from '$lib/languages';

// -- TYPES -- //

export interface ChapterPipelineDeps {
	pipeline: PipelineClient;
	/** INJECTABLE LLM — TESTS PASS A FAKE; PRODUCTION USES THE DEEPSEEK SINGLETON. */
	llm?: OpenAI;
	model?: string;
	inpaintMode?: string;
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

// CHARACTER CAP FOR THE CHAPTER-LEVEL TERM-EXTRACTION PROMPT — EXTRACTION IS TOKEN-BOUND, SO A VERY
// LONG CHAPTER IS TRUNCATED (THE FIRST PAGES ARE REPRESENTATIVE).
const MAX_EXTRACT_CHARS = 20_000;

// -- INTERNALS -- //

function regionRow(region: PipelineRegion, seq: number) {
	const boxObj = {
		...region.box,
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
	outcome?: 'analyzed' | 'done' | 'error';
	failedStep?: PipelineStep;
	message?: string;
	totalDurationMs?: number;
};

async function ensureWebPBuffer(rawBuf: Buffer): Promise<Buffer> {
	if (rawBuf.length >= 12 && rawBuf.toString('ascii', 4, 8) === 'ftyp') {
		try {
			const { Transformer } = await import('@napi-rs/image');
			return await new Transformer(rawBuf).webp(90);
		} catch {
			return rawBuf;
		}
	}
	return rawBuf;
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
		totalPages: pageRows.length,
		pages: pageRows.map((p) => ({ id: p.id, seq: p.seq, status: p.status })),
	});

	const pool = new PQueue({ concurrency: deps.pageConcurrency ?? PAGE_CONCURRENCY });
	const book = db.select().from(books).where(eq(books.id, chapter.bookId)).get();
	const initialSource = book?.sourceLang === 'auto' ? detectSourceLanguage(book?.title || '', 'zh-Hans') : (book?.sourceLang || 'zh-Hans');
	const pair: LangPair = { sourceLang: initialSource, targetLang: book?.targetLang || 'en' };
	const model = deps.model;

	const targetIdSet = pageIds && pageIds.length > 0 ? new Set(pageIds) : null;

	// -- EMISSION WATERMARK STATE -- //
	const slots: PageSlot[] = pageRows.map((page) => {
		const isTarget = !targetIdSet || targetIdSet.has(page.id);
		return {
			page,
			outcome: !isTarget ? (page.status === 'done' ? 'done' : 'skipped' as any) : page.status === 'done' ? 'done' : undefined,
		};
	});

	// EMIT UP FRONT FOR ALREADY-DONE (SKIPPED) PAGES
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
			});
		}
	}

	// -- DYNAMIC PAGE INJECTION: ALLOW NEW PAGE IDS TO BE ADDED TO THE RUNNING POOL -- //
	// Called by job.addPageToPool() when a concurrent "Translate Page" POST arrives.
	if (registerAddPage) {
		registerAddPage((injectPageId: number) => {
			if (signal.aborted) return;
			const injectRow = db.select().from(pages).where(eq(pages.id, injectPageId)).get();
			if (!injectRow) return;
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
			void pool.add(async () => {
				if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
				try {
					db.update(pages).set({ status: 'processing', error: null }).where(eq(pages.id, injectRow.id)).run();
					// PHASE 1: ANALYZE
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'analyze' });
					const tA0 = performance.now();
					const rawImage = readFileSync(join(deps.dataRoot, injectRow.filePath));
					const image = await ensureWebPBuffer(rawImage);
					const analyzed = await deps.pipeline.analyze(image, signal, {
						sourceLang: pair.sourceLang,
						targetLang: pair.targetLang,
					});
					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'analyze', stepStatus: 'completed', durationMs: performance.now() - tA0, stepDetails: { regionsCount: analyzed.regions.length } });
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'persist_regions' });
					db.transaction((tx) => {
						tx.delete(regions).where(eq(regions.pageId, injectRow.id)).run();
						if (analyzed.regions.length > 0) {
							tx.insert(regions).values(analyzed.regions.map((r, idx) => ({ ...regionRow(r, idx), pageId: injectRow.id }))).run();
						}
					});
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'persist_regions', stepStatus: 'completed' });

					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;

					// PHASE 2: TRANSLATE
					const sources = analyzed.regions
						.filter((r) => r.text.trim().length > 0)
						.map((r) => ({ id: r.id, text: r.text, kind: r.kind, vertical: r.vertical }));
					const byRegion = new Map<string, string>();
					if (sources.length > 0) {
						emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'match_glossary' });
						const pageText = sources.map((s) => s.text).join('\n');
						const matched = await matchTerms(chapter.bookId, pageText);
						const matchedSources = new Set(matched.map((m) => m.source));
						const currentEffective = await getEffectiveGlossary(chapter.bookId);
						const pageTerms = currentEffective.filter((t) => t.pinned || matchedSources.has(t.source));
						emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'match_glossary', stepStatus: 'completed' });
						if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
						emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'translate' });
						const tT0 = performance.now();
						const translated = await translatePage(sources, pageTerms, pair, { client: deps.llm, model, signal });
						if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
						for (const [id, text] of translated.byRegion) byRegion.set(id, text);
						if (translated.newTerms && translated.newTerms.length > 0) {
							await addNewTerms(chapter.bookId, translated.newTerms, chapterId);
						}
						emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'translate', stepStatus: 'completed', durationMs: performance.now() - tT0, stepDetails: { cacheHit: false, model: translated.usage.model, tokens: (translated.usage.promptTokens ?? 0) + (translated.usage.completionTokens ?? 0), costUsd: translated.usage.costUsd } });
						if (translated.usage && deps.onUsage) deps.onUsage(translated.usage);
					}

					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;

					// PERSIST TRANSLATIONS
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'persist_translations' });
					const seqById = new Map(analyzed.regions.map((r, idx) => [r.id, idx]));
					db.transaction((tx) => {
						for (const region of analyzed.regions) {
							let target = byRegion.get(region.id)?.trim() ?? '';
							if (!target) { const punct = resolveDialoguePunctuation(region.text); if (punct) { target = punct; byRegion.set(region.id, target); } }
							tx.update(regions).set({ textTarget: target || null, originalTarget: target || null, status: target ? 'translated' : 'failed' }).where(and(eq(regions.pageId, injectRow.id), eq(regions.seq, seqById.get(region.id) ?? -1))).run();
						}
					});
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'persist_translations', stepStatus: 'completed' });

					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;

					// CLEAN
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'clean' });
					const tC0 = performance.now();
					const cleanRegions = analyzed.regions.filter((r) => Boolean(byRegion.get(r.id)?.trim())).map((r) => ({ id: r.id, box: r.box, polygon: r.polygon }));
					const cleaned = cleanRegions.length > 0 ? await deps.pipeline.clean(image, cleanRegions, deps.inpaintMode ?? 'patch', signal) : image;
					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
					const cleanPath = `clean/${chapterId}/${injectRow.seq}.png`;
					const cleanAbs = join(deps.dataRoot, cleanPath);
					cleanDir(join(deps.dataRoot, 'clean', String(chapterId)));
					writeFileSync(cleanAbs, cleaned);
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'clean', stepStatus: 'completed', durationMs: performance.now() - tC0 });

					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;

					// TYPESET
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'typeset' });
					const tTy0 = performance.now();
					const typesetRegions = analyzed.regions.filter((r) => Boolean(byRegion.get(r.id)?.trim())).map((r) => ({ id: r.id, box: r.box, text: byRegion.get(r.id)!, vertical: r.vertical, angle: r.angle }));
					const out = await typesetPage(cleaned, typesetRegions, deps.typesetOptions);
					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
					const outputPath = `output/${chapterId}/${injectRow.seq}.png`;
					cleanDir(join(deps.dataRoot, 'output', String(chapterId)));
					writeFileSync(join(deps.dataRoot, outputPath), out);
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'typeset', stepStatus: 'completed', durationMs: performance.now() - tTy0 });

					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;

					// SAVE OUTPUT
					emit({ type: 'page-step-start', chapterId, page: injectIdx, pageId: injectRow.id, step: 'save_output' });
					db.update(pages).set({ status: 'done', cleanedPath: cleanPath, outputPath, width: analyzed.width, height: analyzed.height }).where(eq(pages.id, injectRow.id)).run();
					emit({ type: 'page-step-end', chapterId, page: injectIdx, pageId: injectRow.id, step: 'save_output', stepStatus: 'completed' });
					emit({ type: 'page-done', chapterId, page: injectIdx, pageId: injectRow.id, pageCount: slots.length, outputPath, durationMs: performance.now() - tA0 });
					slots[injectIdx].outcome = 'done';
				} catch (e) {
					if (signal.aborted || deps.isPageCancelled?.(injectRow.id)) return;
					const message = e instanceof Error ? e.message : String(e);
					db.update(pages).set({ status: 'error', error: message }).where(eq(pages.id, injectRow.id)).run();
					slots[injectIdx].outcome = 'error';
					emit({ type: 'error', chapterId, page: injectIdx, pageId: injectRow.id, message });
				}
			});
		});
	}

	// -- PIPELINED EXECUTION: PROCESS PAGES CONCURRENTLY AS A STREAM -- //
	emit({ type: 'phase-change', chapterId, phase: 'phase1_analyze' });

	// Shared accumulator for background chapter term extraction
	const accumulatedTexts: string[] = [];
	let termExtractionTriggered = false;
	let activePhase: PipelinePhase = 'phase1_analyze';

	const maybeTriggerTermExtraction = async () => {
		if (termExtractionTriggered || signal.aborted) return;
		termExtractionTriggered = true;
		const chapterText = accumulatedTexts.join('\n');
		if (!chapterText.trim()) return;

		if (book?.sourceLang === 'auto') {
			const detected = detectSourceLanguage(chapterText, pair.sourceLang);
			if (detected !== pair.sourceLang) {
				pair.sourceLang = detected;
				db.update(books).set({ sourceLang: detected }).where(eq(books.id, chapter.bookId)).run();
			}
		}

		const tExtract0 = performance.now();
		emit({ type: 'term-extract-step', chapterId, stepStatus: 'running' });
		try {
			const currentEffective = await getEffectiveGlossary(chapter.bookId);
			const { terms: extracted, usage: extUsage } = await extractTerms(chapterText, pair, {
				client: deps.llm,
				model,
				signal,
				knownTerms: currentEffective,
			});
			if (extracted.length > 0) {
				await addNewTerms(chapter.bookId, extracted, chapterId);
			}
			const tExtract = performance.now() - tExtract0;
			emit({
				type: 'term-extract-step',
				chapterId,
				stepStatus: 'completed',
				durationMs: tExtract,
				stepDetails: { regionsCount: extracted.length },
			});
			if (extUsage && deps.onUsage) deps.onUsage(extUsage);
		} catch (err) {
			if (signal.aborted) return;
			const tExtract = performance.now() - tExtract0;
			emit({
				type: 'term-extract-step',
				chapterId,
				stepStatus: 'failed',
				durationMs: tExtract,
				stepDetails: { error: err instanceof Error ? err.message : String(err) },
			});
		}
	};

	const processPagePipeline = async (page: Page, i: number) => {
		const slot = slots[i];
		if (slot.outcome !== undefined || deps.isPageCancelled?.(page.id)) return;
		let activeStep: PipelineStep = 'analyze';
		const pageT0 = performance.now();

		try {
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			db.update(pages)
				.set({ status: 'processing', error: null })
				.where(eq(pages.id, page.id))
				.run();

			// 1) ANALYZE — DETECT + OCR VIA THE SIDECAR
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'analyze' });
			const tAnalyze0 = performance.now();
			const rawImage = readFileSync(join(deps.dataRoot, page.filePath));
			const image = await ensureWebPBuffer(rawImage);
			const analyzed = await deps.pipeline.analyze(image, signal, {
				sourceLang: pair.sourceLang,
				targetLang: pair.targetLang,
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
			db.transaction((tx) => {
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

			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;

			slot.analyzed = analyzed;
			slot.outcome = 'analyzed';

			// Accumulate text for background chapter term discovery
			const pageNonEmptyText = analyzed.regions
				.filter((r) => r.text.trim().length > 0)
				.map((r) => r.text)
				.join('\n');
			if (pageNonEmptyText) {
				accumulatedTexts.push(pageNonEmptyText);
			}

			// Update phase badge to translation when pages begin translating
			if (activePhase !== 'phase3_typeset') {
				activePhase = 'phase3_typeset';
				emit({ type: 'phase-change', chapterId, phase: 'phase3_typeset' });
			}

			// Trigger background term discovery if text is ready
			if (accumulatedTexts.length >= 1 && !termExtractionTriggered) {
				void maybeTriggerTermExtraction();
			}

			// 3) TRANSLATE — LLM SEMANTICALLY TRANSLATES VALID DIALOGUE
			const sources = analyzed.regions
				.filter((r) => r.text.trim().length > 0)
				.map((r) => ({ id: r.id, text: r.text, kind: r.kind, vertical: r.vertical }));
			const byRegion = new Map<string, string>();

			if (sources.length > 0) {
				activeStep = 'match_glossary';
				emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'match_glossary' });
				const pageText = sources.map((s) => s.text).join('\n');

				// AHO-CORASICK TERM MATCHING
				const matched = await matchTerms(chapter.bookId, pageText);
				const matchedSources = new Set(matched.map((m) => m.source));
				const currentEffective = await getEffectiveGlossary(chapter.bookId);
				const pageTerms = currentEffective.filter((t) => t.pinned || matchedSources.has(t.source));

				emit({
					type: 'page-step-end',
					chapterId,
					page: i,
					pageId: page.id,
					step: 'match_glossary',
					stepStatus: 'completed',
				});

				signal.throwIfAborted();
				if (deps.isPageCancelled?.(page.id)) return;

				activeStep = 'translate';
				emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'translate' });
				const tTrans0 = performance.now();

				const translated = await translatePage(sources, pageTerms, pair, {
					client: deps.llm,
					model,
					signal,
				});
				signal.throwIfAborted();
				if (deps.isPageCancelled?.(page.id)) return;
				for (const [id, text] of translated.byRegion) byRegion.set(id, text);
				if (translated.newTerms && translated.newTerms.length > 0) {
					await addNewTerms(chapter.bookId, translated.newTerms, chapterId);
				}
				const tTrans = performance.now() - tTrans0;
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
						costUsd: translated.usage.costUsd,
					},
				});
				if (translated.usage && deps.onUsage) deps.onUsage(translated.usage);
			}

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
					tx.update(regions)
						.set({ textTarget: target || null, originalTarget: target || null, status: target ? 'translated' : 'failed' })
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

			// 5) CLEAN — INPAINT REMOVED TEXT REGIONS
			activeStep = 'clean';
			emit({ type: 'page-step-start', chapterId, page: i, pageId: page.id, step: 'clean' });
			const tClean0 = performance.now();
			const cleanRegions = analyzed.regions
				.filter((r) => Boolean(byRegion.get(r.id)?.trim()))
				.map((r) => ({ id: r.id, box: r.box, polygon: r.polygon }));
			const cleaned =
				cleanRegions.length > 0 ? await deps.pipeline.clean(image, cleanRegions, deps.inpaintMode ?? 'patch', signal) : image;
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;
			const cleanPath = `clean/${chapterId}/${page.seq}.png`;
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
					box: r.box,
					text: byRegion.get(r.id)!,
					vertical: r.vertical,
					angle: r.angle,
				}));
			const out = await typesetPage(cleaned, typesetRegions, deps.typesetOptions);
			signal.throwIfAborted();
			if (deps.isPageCancelled?.(page.id)) return;
			const outputPath = `output/${chapterId}/${page.seq}.png`;
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

			slot.page.outputPath = outputPath;
			slot.totalDurationMs = performance.now() - pageT0;
			slot.outcome = 'done';
			emit({
				type: 'page-done',
				chapterId,
				page: i,
				pageId: page.id,
				pageCount: slots.length,
				outputPath,
				durationMs: slot.totalDurationMs,
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

	// Start all pages processing concurrently via PQueue
	await pool.addAll(pageRows.map((page, i) => () => processPagePipeline(page, i)));

	// If term extraction has not been triggered yet (e.g. all empty text), try once
	if (!termExtractionTriggered && accumulatedTexts.length > 0 && !signal.aborted) {
		await maybeTriggerTermExtraction();
	}

	// WAIT FOR ANY DYNAMICALLY INJECTED PAGES IN THE QUEUE TO ALSO COMPLETE
	await pool.onIdle();

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

