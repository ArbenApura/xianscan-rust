// ELASTIC BACKWARD-ONLY DIALOGUE CONTEXT TRACKER FOR COMIC TRANSLATION
// TRACKS TRANSLATED DIALOGUE ACROSS PREVIOUS PAGES (AND PRIOR CHAPTER TRAILING PAGES)
// WITH DYNAMIC DENSITY BALANCING (2 TO 5 PAGES)

// IMPORTED DEP-MODULES
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
// IMPORTED MODULES
import { db } from '../db';
import { chapters, pages, regions } from '../db/schema';

// -- TYPES -- //

export type RegionKindLabel = 'Bubble' | 'Thought' | 'Free Text' | 'SFX' | 'Caption/UI';

export interface DialogueLine {
	id: string; // e.g. "r0", "r1"
	sourceText: string; // RAW OCR TEXT
	translatedText?: string; // LOCALIZED TEXT ONCE AVAILABLE
	kind?: string; // "dialogue_bubble" | "thought" | "free_text" | "sfx" | "other"
}

export interface PageDialogueRecord {
	pageSeq: number; // 0-INDEXED SEQUENCE IN CHAPTER
	pageId?: number; // DATABASE PAGE ID
	chapterTitle?: string; // CHAPTER TITLE (FOR PRIOR CHAPTER REFERENCES)
	isPriorChapter?: boolean; // TRUE IF RECORD IS FROM THE PRECEDING CHAPTER
	lines: DialogueLine[]; // DIALOGUE BUBBLES IN VISUAL READING ORDER
	isTranslated: boolean; // TRUE ONCE TRANSLATION HAS COMPLETED
}

export interface DialogueContextWindow {
	previousPages: PageDialogueRecord[]; // CHRONOLOGICALLY ORDERED [OLDEST ... NEWEST]
}

// -- FUNCTIONS -- //

// MAP REGION KIND TO A CONCISE HUMAN-READABLE LABEL FOR THE LLM PROMPT
export function getRegionKindLabel(kind?: string): RegionKindLabel {
	switch (kind) {
		case 'thought':
		case 'mono':
			return 'Thought';
		case 'free_text':
			return 'Free Text';
		case 'sfx':
		case 'sound_effect':
			return 'SFX';
		case 'other':
			return 'Caption/UI';
		case 'dialogue_bubble':
		default:
			return 'Bubble';
	}
}

// PARSE KIND FROM REGION BOX JSON IF AVAILABLE
export function parseKindFromBox(boxJson: string | null): string | undefined {
	if (!boxJson) return undefined;
	try {
		const parsed = JSON.parse(boxJson);
		return parsed.kind;
	} catch {
		return undefined;
	}
}

// FORMAT READ-ONLY DIALOGUE CONTEXT BLOCK FOR PROMPT INJECTION
export function formatDialogueContextBlock(
	context?: DialogueContextWindow | null,
	maxLinesPerPage = 8,
): string {
	if (!context || !context.previousPages || context.previousPages.length === 0) {
		return '';
	}

	const sections: string[] = [];
	sections.push('=== DIALOGUE CONTEXT (Previous Pages) ===');
	sections.push(
		'Note: This is read-only background context to maintain consistent topic, speaker, and pronoun flow. Do NOT translate or output entries for these context pages.\n',
	);

	for (const page of context.previousPages) {
		if (page.lines.length === 0) continue;
		// TAKE THE LAST N LINES OF PREVIOUS PAGES (IMMEDIATE PRIOR CONTEXT)
		const displayedLines = page.lines.slice(-maxLinesPerPage);
		const linesFormatted = displayedLines.map((l) => {
			const label = getRegionKindLabel(l.kind);
			if (l.translatedText) {
				return `  - [${label}] "${l.sourceText}" → "${l.translatedText}"`;
			}
			return `  - [${label}] "${l.sourceText}"`;
		});

		const pageLabel = page.isPriorChapter
			? `[Prev Chapter - Page ${page.pageSeq + 1} (Previous Context)]:`
			: `[Page ${page.pageSeq + 1} (Previous Context)]:`;

		sections.push(`${pageLabel}\n${linesFormatted.join('\n')}`);
	}

	return sections.join('\n\n');
}

// -- CHAPTER DIALOGUE TRACKER CLASS -- //

export class ChapterDialogueTracker {
	private pages = new Map<number, PageDialogueRecord>(); // KEYED BY pageSeq (CURRENT CHAPTER)
	private priorChapterPages: PageDialogueRecord[] = []; // TRAILING PAGES FROM PRECEDING CHAPTER

	// SEED CURRENT CHAPTER KNOWN PAGES FROM DB (FOR RESUME / RE-RUNS)
	public seedFromDb(records: PageDialogueRecord[]): void {
		for (const r of records) {
			this.pages.set(r.pageSeq, r);
		}
	}

	// SEED TRAILING PAGES FROM THE PRECEDING CHAPTER (ORDERED OLDEST TO NEWEST)
	public seedPriorChapter(records: PageDialogueRecord[]): void {
		this.priorChapterPages = records.map((r) => ({ ...r, isPriorChapter: true }));
	}

	// CALLED WHEN A PAGE FINISHES OCR (persist_regions)
	public recordOcr(
		pageSeq: number,
		pageId: number,
		regionsData: { id: string; text: string; kind?: string }[],
	): void {
		const lines: DialogueLine[] = regionsData
			.filter((r) => r.text && r.text.trim().length > 0)
			.map((r) => ({
				id: r.id,
				sourceText: r.text.trim(),
				kind: r.kind,
			}));

		const existing = this.pages.get(pageSeq);
		this.pages.set(pageSeq, {
			pageSeq,
			pageId,
			lines,
			isTranslated: existing?.isTranslated ?? false,
		});
	}

	// CALLED WHEN A PAGE FINISHES LLM TRANSLATION
	public recordTranslation(pageSeq: number, byRegion: Map<string, string>): void {
		const existing = this.pages.get(pageSeq);
		if (!existing) return;

		for (const line of existing.lines) {
			const trans = byRegion.get(line.id);
			if (trans) {
				line.translatedText = trans.trim();
			}
		}
		existing.isTranslated = true;
	}

	// RETRIEVES AN ELASTIC BACKWARD CONTEXT WINDOW (2 TO 5 PAGES DEPENDING ON DENSITY)
	public getContextWindow(targetSeq: number): DialogueContextWindow {
		const collectedRev: PageDialogueRecord[] = [];
		let accumulatedLines = 0;

		// 1. WALK BACKWARDS THROUGH THE CURRENT CHAPTER (targetSeq - 1 down to 0)
		for (let s = targetSeq - 1; s >= 0; s--) {
			const p = this.pages.get(s);
			if (!p || p.lines.length === 0) continue; // SKIP EMPTY / SILENT PAGES

			collectedRev.push(p);
			accumulatedLines += p.lines.length;

			// DENSE DIALOGUE STOP: IF FIRST PAGE >= 8 LINES OR FIRST 2 PAGES >= 12 LINES -> STOP AT 2
			if (collectedRev.length === 1 && p.lines.length >= 8) {
				// Single very dense previous page is enough
			} else if (collectedRev.length === 2 && accumulatedLines >= 12) {
				break;
			} else if (collectedRev.length >= 3 && accumulatedLines >= 6) {
				// STANDARD TARGET: 3 PAGES REACHED WITH SUFFICIENT DIALOGUE
				break;
			} else if (collectedRev.length >= 5) {
				// MAX HARD CEILING: 5 PAGES
				break;
			}
		}

		// 2. IF WE HAVE FEW PAGES AND HAVE PRIOR CHAPTER CONTEXT, STEP BACK INTO PRIOR CHAPTER
		if (
			collectedRev.length < 3 ||
			(collectedRev.length < 5 && accumulatedLines < 6)
		) {
			// WALK BACKWARDS THROUGH PRIOR CHAPTER TRAILING PAGES (NEWEST TO OLDEST)
			for (let i = this.priorChapterPages.length - 1; i >= 0; i--) {
				const p = this.priorChapterPages[i];
				if (!p || p.lines.length === 0) continue;

				collectedRev.push(p);
				accumulatedLines += p.lines.length;

				if (collectedRev.length >= 3 && accumulatedLines >= 6) {
					break;
				}
				if (collectedRev.length >= 5) {
					break;
				}
			}
		}

		// REVERSE TO RESTORE CHRONOLOGICAL ORDER: [OLDEST ... NEWEST]
		const previousPages = collectedRev.reverse();
		return { previousPages };
	}
}

// -- STANDALONE DATABASE FALLBACK -- //

// FOR STANDALONE READER UI ACTIONS OR SINGLE-PAGE ENDPOINT
export function getDbDialogueContext(
	chapterId: number,
	targetSeq: number,
): DialogueContextWindow {
	const currentChap = db
		.select({ id: chapters.id, bookId: chapters.bookId, seq: chapters.seq })
		.from(chapters)
		.where(eq(chapters.id, chapterId))
		.get();

	if (!currentChap) return { previousPages: [] };

	// 1. QUERY PREVIOUS PAGES WITHIN CURRENT CHAPTER
	const currentPages = db
		.select({ id: pages.id, seq: pages.seq, status: pages.status })
		.from(pages)
		.where(and(eq(pages.chapterId, chapterId), lt(pages.seq, targetSeq)))
		.orderBy(desc(pages.seq))
		.limit(10)
		.all();

	const pageIds = currentPages.map((p) => p.id);
	const regionsList = pageIds.length > 0
		? db
				.select({
					id: regions.id,
					pageId: regions.pageId,
					seq: regions.seq,
					box: regions.box,
					textSource: regions.textSource,
					textTarget: regions.textTarget,
				})
				.from(regions)
				.where(inArray(regions.pageId, pageIds))
				.orderBy(asc(regions.seq))
				.all()
		: [];

	const regionsByPageId = new Map<number, typeof regionsList>();
	for (const r of regionsList) {
		const arr = regionsByPageId.get(r.pageId) ?? [];
		arr.push(r);
		regionsByPageId.set(r.pageId, arr);
	}

	const collectedRev: PageDialogueRecord[] = [];
	let accumulatedLines = 0;

	for (const p of currentPages) {
		const rList = regionsByPageId.get(p.id) ?? [];
		const lines: DialogueLine[] = rList
			.filter((r) => r.textSource && r.textSource.trim().length > 0)
			.map((r, idx) => ({
				id: `r${idx}`,
				sourceText: r.textSource.trim(),
				translatedText: r.textTarget ? r.textTarget.trim() : undefined,
				kind: parseKindFromBox(r.box),
			}));

		if (lines.length === 0) continue; // SKIP SILENT / EMPTY PAGES

		collectedRev.push({
			pageSeq: p.seq,
			pageId: p.id,
			lines,
			isTranslated: lines.some((l) => Boolean(l.translatedText)),
		});
		accumulatedLines += lines.length;

		if (collectedRev.length === 2 && accumulatedLines >= 12) break;
		if (collectedRev.length >= 3 && accumulatedLines >= 6) break;
		if (collectedRev.length >= 5) break;
	}

	// 2. CHECK PREVIOUS CHAPTER IF CONTEXT IS STILL SPARSE OR AT CHAPTER START
	if (
		collectedRev.length < 3 ||
		(collectedRev.length < 5 && accumulatedLines < 6)
	) {
		const prevChap = db
			.select({ id: chapters.id, seq: chapters.seq, title: chapters.title })
			.from(chapters)
			.where(and(eq(chapters.bookId, currentChap.bookId), lt(chapters.seq, currentChap.seq)))
			.orderBy(desc(chapters.seq))
			.limit(1)
			.get();

		if (prevChap) {
			const prevPages = db
				.select({ id: pages.id, seq: pages.seq })
				.from(pages)
				.where(eq(pages.chapterId, prevChap.id))
				.orderBy(desc(pages.seq))
				.limit(10)
				.all();

			const prevPageIds = prevPages.map((p) => p.id);
			const prevRegions = prevPageIds.length > 0
				? db
						.select({
							id: regions.id,
							pageId: regions.pageId,
							seq: regions.seq,
							box: regions.box,
							textSource: regions.textSource,
							textTarget: regions.textTarget,
						})
						.from(regions)
						.where(inArray(regions.pageId, prevPageIds))
						.orderBy(asc(regions.seq))
						.all()
				: [];

			const prevRegionsByPageId = new Map<number, typeof prevRegions>();
			for (const r of prevRegions) {
				const arr = prevRegionsByPageId.get(r.pageId) ?? [];
				arr.push(r);
				prevRegionsByPageId.set(r.pageId, arr);
			}

			for (const p of prevPages) {
				const rList = prevRegionsByPageId.get(p.id) ?? [];
				const lines: DialogueLine[] = rList
					.filter((r) => r.textSource && r.textSource.trim().length > 0)
					.map((r, idx) => ({
						id: `r${idx}`,
						sourceText: r.textSource.trim(),
						translatedText: r.textTarget ? r.textTarget.trim() : undefined,
						kind: parseKindFromBox(r.box),
					}));

				if (lines.length === 0) continue;

				collectedRev.push({
					pageSeq: p.seq,
					pageId: p.id,
					chapterTitle: prevChap.title,
					isPriorChapter: true,
					lines,
					isTranslated: lines.some((l) => Boolean(l.translatedText)),
				});
				accumulatedLines += lines.length;

				if (collectedRev.length >= 3 && accumulatedLines >= 6) break;
				if (collectedRev.length >= 5) break;
			}
		}
	}

	const previousPages = collectedRev.reverse();
	return { previousPages };
}
